import path from "node:path";
import { ensureDir, fileExists, readJsonIfExists, writeJsonAtomic } from "@mediaforge/shared";
import { batchIndexEntrySchema, batchIndexFileSchema } from "./story-localization.schemas.js";
import {
  type BatchIndexEntry,
  type BatchIndexFile,
  type BatchIndexFilter,
  type BatchIndexRepairReport,
  type BatchIndexVerificationReport,
} from "./story-localization.types.js";
import {
  ensureBatchStorageLayout,
  listManifestPaths,
  manifestPathFor,
  readLocalBatchManifestByPath,
  resolveBatchStorageLayout,
  withFileLock,
} from "./story-localization-batch-storage.js";

const INDEX_SCHEMA_VERSION = "story-localization-batch-index-v2";

function sortUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function matchesFilter(entry: BatchIndexEntry, filter: BatchIndexFilter | undefined): boolean {
  if (!filter) {
    return true;
  }
  if (filter.category && filter.category !== entry.category) {
    return false;
  }
  if (filter.statuses && !filter.statuses.includes(entry.status)) {
    return false;
  }
  if (filter.episodeNumbers && !filter.episodeNumbers.some((value) => entry.episodeNumbers.includes(value))) {
    return false;
  }
  if (filter.languages && !filter.languages.every((value) => entry.languages.includes(value))) {
    return false;
  }
  if (filter.operations && !filter.operations.every((value) => entry.operations.includes(value))) {
    return false;
  }
  if (filter.model && filter.model !== entry.model) {
    return false;
  }
  if (filter.imported !== undefined && filter.imported !== entry.imported) {
    return false;
  }
  if (filter.requiresImport !== undefined && filter.requiresImport !== entry.requiresImport) {
    return false;
  }
  if (
    filter.hasRetryableFailures !== undefined &&
    filter.hasRetryableFailures !== entry.hasRetryableFailures
  ) {
    return false;
  }
  if (filter.createdAfter && entry.createdAt < filter.createdAfter) {
    return false;
  }
  if (filter.createdBefore && entry.createdAt > filter.createdBefore) {
    return false;
  }
  return true;
}

function entryFromManifest(manifestPath: string, manifest: Awaited<ReturnType<typeof readLocalBatchManifestByPath>> extends infer T ? T : never): BatchIndexEntry {
  if (!manifest) {
    throw new Error(`Missing manifest: ${manifestPath}`);
  }
  const category = manifest.category ?? "text-localization";
  const operations = sortUnique(manifest.items.map((item) => item.operation));
  const episodeNumbers = sortUnique(manifest.items.map((item) => item.episodeNumber));
  const languages = sortUnique(
    manifest.items
      .map((item) => item.language)
      .filter((value): value is NonNullable<typeof value> => value !== undefined)
  ) as BatchIndexEntry["languages"];
  const completedItemCount = manifest.items.filter((item) => item.status === "persisted").length;
  const failedItemCount = manifest.items.filter((item) =>
    ["api-failed", "expired", "schema-invalid", "content-invalid", "repair-required"].includes(item.status)
  ).length;
  const persistedItemCount = manifest.items.filter((item) => item.status === "persisted").length;
  const hasRetryableFailures = manifest.items.some((item) =>
    ["api-failed", "expired", "schema-invalid", "content-invalid", "repair-required"].includes(item.status)
  );
  const sourceHashPrefixes = sortUnique(
    manifest.items.map((item) => item.sourceHash.slice(0, 8))
  );
  const status =
    manifest.status === "imported" || manifest.status === "imported_with_failures"
      ? manifest.status
      : failedItemCount > 0 && completedItemCount > 0
        ? "partially_completed"
        : manifest.status;
  return batchIndexEntrySchema.parse({
    localBatchId: manifest.localBatchId,
    category,
    ...(manifest.openAIBatchId ? { openAIBatchId: manifest.openAIBatchId } : {}),
    rootLocalBatchId: manifest.rootLocalBatchId,
    ...(manifest.parentLocalBatchId ? { parentLocalBatchId: manifest.parentLocalBatchId } : {}),
    retryNumber: manifest.retryNumber,
    status,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
    ...(manifest.submittedAt ? { submittedAt: manifest.submittedAt } : {}),
    ...(manifest.completedAt ? { completedAt: manifest.completedAt } : {}),
    ...(manifest.importedAt ? { importedAt: manifest.importedAt } : {}),
    model: manifest.model,
    endpoint: manifest.endpoint,
    completionWindow: manifest.completionWindow,
    operations,
    episodeNumbers,
    languages,
    itemCount: manifest.items.length,
    completedItemCount,
    failedItemCount,
    persistedItemCount,
    inputFilePath: manifest.inputFilePath,
    manifestPath,
    ...(manifest.resultFilePath ? { resultFilePath: manifest.resultFilePath } : {}),
    ...(manifest.errorFilePath ? { errorFilePath: manifest.errorFilePath } : {}),
    ...(manifest.reportFilePath ? { reportFilePath: manifest.reportFilePath } : {}),
    ...(manifest.openAIInputFileId ? { openAIInputFileId: manifest.openAIInputFileId } : {}),
    ...(manifest.outputFileId ? { outputFileId: manifest.outputFileId } : {}),
    ...(manifest.errorFileId ? { errorFileId: manifest.errorFileId } : {}),
    sourceHashPrefixes,
    imported: manifest.status === "imported" || manifest.status === "imported_with_failures",
    requiresImport:
      (manifest.status === "completed" || status === "partially_completed") &&
      !["imported", "imported_with_failures"].includes(manifest.status),
    hasRetryableFailures,
  }) as BatchIndexEntry;
}

export class StoryBatchIndexService {
  public constructor(private readonly outputDirectory: string) {}

  public async initialize(): Promise<void> {
    const layout = await ensureBatchStorageLayout(this.outputDirectory);
    if (!(await fileExists(layout.indexPath))) {
      await writeJsonAtomic(layout.indexPath, {
        schemaVersion: INDEX_SCHEMA_VERSION,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        entries: [],
      } satisfies BatchIndexFile);
    }
  }

  public async list(filter?: BatchIndexFilter): Promise<readonly BatchIndexEntry[]> {
    const index = await this.readIndex();
    return index.entries.filter((entry) => matchesFilter(entry, filter));
  }

  public async getByLocalBatchId(localBatchId: string): Promise<BatchIndexEntry | undefined> {
    const index = await this.readIndex();
    return index.entries.find((entry) => entry.localBatchId === localBatchId);
  }

  public async getByOpenAIBatchId(openAIBatchId: string): Promise<BatchIndexEntry | undefined> {
    const index = await this.readIndex();
    return index.entries.find((entry) => entry.openAIBatchId === openAIBatchId);
  }

  public async getLatest(filter?: BatchIndexFilter): Promise<BatchIndexEntry | undefined> {
    const entries = await this.list(filter);
    return [...entries].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  }

  public async findByEpisode(episodeNumberOrSlug: string): Promise<readonly BatchIndexEntry[]> {
    const index = await this.readIndex();
    return index.entries.filter((entry) => entry.episodeNumbers.includes(episodeNumberOrSlug));
  }

  public async upsert(entry: BatchIndexEntry): Promise<void> {
    await this.mutateIndex((index) => {
      const nextEntries = index.entries.filter((candidate) => candidate.localBatchId !== entry.localBatchId);
      return {
        ...index,
        updatedAt: new Date().toISOString(),
        entries: [...nextEntries, batchIndexEntrySchema.parse(entry) as BatchIndexEntry].sort((left, right) =>
          left.createdAt.localeCompare(right.createdAt)
        ),
      } as BatchIndexFile;
    });
  }

  public async update(localBatchId: string, patch: Partial<BatchIndexEntry>): Promise<BatchIndexEntry> {
    let updated: BatchIndexEntry | undefined;
    await this.mutateIndex((index) => {
      const entries = index.entries.map((entry) => {
        if (entry.localBatchId !== localBatchId) {
          return entry;
        }
        updated = batchIndexEntrySchema.parse({
          ...entry,
          ...patch,
          localBatchId: entry.localBatchId,
          updatedAt: new Date().toISOString(),
        }) as BatchIndexEntry;
        return updated;
      }).filter((entry): entry is BatchIndexEntry => entry !== undefined);
      return {
        ...index,
        updatedAt: new Date().toISOString(),
        entries,
      } as BatchIndexFile;
    });
    if (!updated) {
      throw new Error(`Unknown batch: ${localBatchId}`);
    }
    return updated;
  }

  public async remove(localBatchId: string): Promise<void> {
    await this.mutateIndex((index) => ({
      ...index,
      updatedAt: new Date().toISOString(),
      entries: index.entries.filter((entry) => entry.localBatchId !== localBatchId),
    } as BatchIndexFile));
  }

  public async rebuild(): Promise<BatchIndexRepairReport> {
    const startedAt = new Date().toISOString();
    const layout = resolveBatchStorageLayout(this.outputDirectory);
    const manifestPaths = await listManifestPaths(layout);
    const malformedManifests: string[] = [];
    const duplicateLocalBatchIds: string[] = [];
    const duplicateOpenAIBatchIds: string[] = [];
    const missingReferencedFiles: string[] = [];
    const orphanedResultFiles: string[] = [];
    const orphanedErrorFiles: string[] = [];
    const entries: BatchIndexEntry[] = [];
    const localIds = new Set<string>();
    const openAiIds = new Set<string>();
    for (const manifestPath of manifestPaths) {
      const manifest = await readLocalBatchManifestByPath(manifestPath);
      if (!manifest) {
        malformedManifests.push(manifestPath);
        continue;
      }
      if (localIds.has(manifest.localBatchId)) {
        duplicateLocalBatchIds.push(manifest.localBatchId);
        continue;
      }
      localIds.add(manifest.localBatchId);
      if (manifest.openAIBatchId && openAiIds.has(manifest.openAIBatchId)) {
        duplicateOpenAIBatchIds.push(manifest.openAIBatchId);
        continue;
      }
      if (manifest.openAIBatchId) {
        openAiIds.add(manifest.openAIBatchId);
      }
      const inputPath = path.resolve(this.outputDirectory, manifest.inputFilePath.replace(/^\.batch\//u, ".batch/"));
      if (!(await fileExists(inputPath))) {
        missingReferencedFiles.push(inputPath);
      }
      entries.push(entryFromManifest(manifestPath, manifest));
    }
    const previous = await this.readIndex().catch(() => undefined);
    await this.writeIndex({
      schemaVersion: INDEX_SCHEMA_VERSION,
      createdAt: previous?.createdAt ?? startedAt,
      updatedAt: new Date().toISOString(),
      entries,
    } as BatchIndexFile);
    return {
      startedAt,
      completedAt: new Date().toISOString(),
      manifestsScanned: manifestPaths.length,
      entriesRebuilt: entries.length,
      entriesUpdated: 0,
      entriesUnchanged: 0,
      malformedManifests,
      duplicateLocalBatchIds,
      duplicateOpenAIBatchIds,
      missingReferencedFiles,
      orphanedResultFiles,
      orphanedErrorFiles,
    };
  }

  public async verify(): Promise<BatchIndexVerificationReport> {
    const issues: string[] = [];
    const index = await this.readIndex();
    const localIds = new Set<string>();
    const openAiIds = new Set<string>();
    for (const entry of index.entries) {
      if (localIds.has(entry.localBatchId)) {
        issues.push(`Duplicate localBatchId: ${entry.localBatchId}`);
      }
      localIds.add(entry.localBatchId);
      if (entry.openAIBatchId) {
        if (openAiIds.has(entry.openAIBatchId)) {
          issues.push(`Duplicate openAIBatchId: ${entry.openAIBatchId}`);
        }
        openAiIds.add(entry.openAIBatchId);
      }
      if (!(await fileExists(entry.manifestPath))) {
        issues.push(`Missing manifest: ${entry.manifestPath}`);
      }
      if (entry.status === "submitted" && !entry.openAIBatchId) {
        issues.push(`Submitted entry missing OpenAI batch ID: ${entry.localBatchId}`);
      }
      if (entry.imported && entry.requiresImport) {
        issues.push(`Imported entry still marked requiresImport: ${entry.localBatchId}`);
      }
      if ((entry.status === "completed" || entry.status === "partially_completed") && !entry.imported && !entry.requiresImport) {
        issues.push(`Completed entry missing requiresImport: ${entry.localBatchId}`);
      }
      if (entry.parentLocalBatchId && !index.entries.some((candidate) => candidate.localBatchId === entry.parentLocalBatchId)) {
        issues.push(`Missing parent batch for ${entry.localBatchId}`);
      }
    }
    return {
      checkedAt: new Date().toISOString(),
      ok: issues.length === 0,
      issues,
    };
  }

  private async readIndex(): Promise<BatchIndexFile> {
    await this.initialize();
    const layout = resolveBatchStorageLayout(this.outputDirectory);
    const index = await readJsonIfExists(layout.indexPath, (value) => batchIndexFileSchema.parse(value) as BatchIndexFile);
    if (!index) {
      throw new Error(`Missing batch index: ${layout.indexPath}`);
    }
    if (index.schemaVersion !== INDEX_SCHEMA_VERSION) {
      const migrated: BatchIndexFile = {
        schemaVersion: INDEX_SCHEMA_VERSION,
        createdAt: index.createdAt,
        updatedAt: new Date().toISOString(),
        entries: index.entries.map((entry) =>
          batchIndexEntrySchema.parse({
            ...entry,
            category: entry.category ?? "text-localization",
          }) as BatchIndexEntry
        ),
      };
      await this.writeIndex(migrated);
      return migrated;
    }
    return index;
  }

  private async writeIndex(index: BatchIndexFile): Promise<void> {
    const layout = resolveBatchStorageLayout(this.outputDirectory);
    await ensureDir(path.dirname(layout.indexPath));
    await writeJsonAtomic(layout.indexPath, index);
  }

  private async mutateIndex(
    mutate: (index: BatchIndexFile) => BatchIndexFile
  ): Promise<void> {
    const layout = resolveBatchStorageLayout(this.outputDirectory);
    await withFileLock(path.join(layout.locksDir, "batch-index.lock"), async () => {
      const current = await this.readIndex();
      const next = batchIndexFileSchema.parse(mutate(current)) as BatchIndexFile;
      await this.writeIndex(next);
    });
  }
}

export function entryFromLocalBatchManifest(
  outputDirectory: string,
  manifest: NonNullable<Awaited<ReturnType<typeof readLocalBatchManifestByPath>>>
): BatchIndexEntry {
  return entryFromManifest(manifestPathFor(resolveBatchStorageLayout(outputDirectory), manifest.localBatchId), manifest);
}
