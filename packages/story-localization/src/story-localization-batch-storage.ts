import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ensureDir,
  fileExists,
  readJsonIfExists,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import { localBatchManifestSchema } from "./story-localization.schemas.js";
import {
  type BatchCategory,
  type BatchEndpoint,
  type BatchOperation,
  type LocalBatchManifest,
  type OpenAIBatchRequestLine,
  type StoryBatchItem,
} from "./story-localization.types.js";
import {
  getRepoRoot,
  sha256Text,
  toPosixRelative,
} from "./story-localization.utils.js";

const BATCH_SCHEMA_VERSION = "story-localization-batch-v1";

export interface BatchStorageLayout {
  readonly root: string;
  readonly indexPath: string;
  readonly pendingDir: string;
  readonly submittedDir: string;
  readonly completedDir: string;
  readonly failedDir: string;
  readonly expiredDir: string;
  readonly cancelledDir: string;
  readonly inputsDir: string;
  readonly resultsDir: string;
  readonly errorsDir: string;
  readonly manifestsDir: string;
  readonly locksDir: string;
  readonly reportsDir: string;
  readonly quarantineDir: string;
}

export function resolveBatchStorageRoot(outputDirectory: string): string {
  return path.join(outputDirectory, ".batch");
}

export function resolveBatchStorageLayout(
  outputDirectory: string
): BatchStorageLayout {
  const root = resolveBatchStorageRoot(outputDirectory);
  return {
    root,
    indexPath: path.join(root, "batch-index.json"),
    pendingDir: path.join(root, "pending"),
    submittedDir: path.join(root, "submitted"),
    completedDir: path.join(root, "completed"),
    failedDir: path.join(root, "failed"),
    expiredDir: path.join(root, "expired"),
    cancelledDir: path.join(root, "cancelled"),
    inputsDir: path.join(root, "inputs"),
    resultsDir: path.join(root, "results"),
    errorsDir: path.join(root, "errors"),
    manifestsDir: path.join(root, "manifests"),
    locksDir: path.join(root, "locks"),
    reportsDir: path.join(root, "reports"),
    quarantineDir: path.join(root, "quarantine"),
  };
}

export async function ensureBatchStorageLayout(
  outputDirectory: string
): Promise<BatchStorageLayout> {
  const layout = resolveBatchStorageLayout(outputDirectory);
  await Promise.all(
    Object.values(layout)
      .filter((value) => value !== layout.indexPath)
      .map((dir) => ensureDir(dir))
  );
  return layout;
}

export function toRepositoryRelativePath(filePath: string): string {
  return toPosixRelative(getRepoRoot(), filePath);
}

export function fromRepositoryRelativePath(relativePath: string): string {
  return path.resolve(getRepoRoot(), relativePath);
}

export function buildDeterministicCustomId(args: {
  readonly episodeNumber: string;
  readonly operation: BatchOperation;
  readonly language?: string;
  readonly sourceHash: string;
  readonly configurationHash: string;
  readonly retryNumber?: number;
}): string {
  const base = [
    "dte",
    args.episodeNumber,
    args.operation,
    args.language ?? "none",
    args.sourceHash.slice(0, 8),
    args.configurationHash.slice(0, 8),
  ].join(":");
  return args.retryNumber !== undefined && args.retryNumber > 0
    ? `${base}:r${args.retryNumber + 1}`
    : base;
}

export async function createLocalBatchId(
  layout: BatchStorageLayout
): Promise<string> {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/gu, "");
  let suffix = 1;
  while (true) {
    const candidate = `slb-${stamp}-${String(suffix).padStart(3, "0")}`;
    const manifestPath = path.join(
      layout.manifestsDir,
      `batch-${candidate}.manifest.json`
    );
    if (!(await fileExists(manifestPath))) {
      return candidate;
    }
    suffix += 1;
  }
}

export function manifestPathFor(
  layout: BatchStorageLayout,
  localBatchId: string
): string {
  return path.join(layout.manifestsDir, `batch-${localBatchId}.manifest.json`);
}

export function inputPathFor(
  layout: BatchStorageLayout,
  localBatchId: string
): string {
  return path.join(layout.inputsDir, `batch-${localBatchId}.jsonl`);
}

export function resultPathFor(
  layout: BatchStorageLayout,
  localBatchId: string
): string {
  return path.join(layout.resultsDir, `batch-${localBatchId}.output.jsonl`);
}

export function errorPathFor(
  layout: BatchStorageLayout,
  localBatchId: string
): string {
  return path.join(layout.errorsDir, `batch-${localBatchId}.errors.jsonl`);
}

export function reportPathFor(
  layout: BatchStorageLayout,
  localBatchId: string
): string {
  return path.join(layout.reportsDir, `batch-${localBatchId}.summary.json`);
}

export function serializeBatchRequestLines(
  items: readonly StoryBatchItem[]
): string {
  return `${items
    .map((item) =>
      JSON.stringify({
        custom_id: item.customId,
        method: item.method,
        url: item.url,
        body: item.body,
      } satisfies OpenAIBatchRequestLine)
    )
    .join("\n")}\n`;
}

export async function writeBatchInputFile(
  layout: BatchStorageLayout,
  localBatchId: string,
  items: readonly StoryBatchItem[]
): Promise<{ readonly inputFilePath: string; readonly inputFileHash: string }> {
  const inputFilePath = inputPathFor(layout, localBatchId);
  const serialized = serializeBatchRequestLines(items);
  await writeTextAtomic(inputFilePath, serialized);
  return {
    inputFilePath,
    inputFileHash: sha256Text(serialized),
  };
}

export async function writeLocalBatchManifest(
  manifest: LocalBatchManifest
): Promise<void> {
  await writeJsonAtomic(
    fromRepositoryRelativePath(manifest.inputFilePath).replace(
      /\/inputs\/.+$/u,
      `/manifests/batch-${manifest.localBatchId}.manifest.json`
    ),
    manifest
  );
}

export async function saveLocalBatchManifest(
  layout: BatchStorageLayout,
  manifest: LocalBatchManifest
): Promise<void> {
  await writeJsonAtomic(
    manifestPathFor(layout, manifest.localBatchId),
    manifest
  );
}

export async function readLocalBatchManifest(
  layout: BatchStorageLayout,
  localBatchId: string
): Promise<LocalBatchManifest | undefined> {
  return ((await readJsonIfExists(
    manifestPathFor(layout, localBatchId),
    (value) => localBatchManifestSchema.parse(value) as LocalBatchManifest
  )) ?? undefined) as LocalBatchManifest | undefined;
}

export async function readLocalBatchManifestByPath(
  manifestPath: string
): Promise<LocalBatchManifest | undefined> {
  return ((await readJsonIfExists(
    manifestPath,
    (value) => localBatchManifestSchema.parse(value) as LocalBatchManifest
  )) ?? undefined) as LocalBatchManifest | undefined;
}

export async function listManifestPaths(
  layout: BatchStorageLayout
): Promise<readonly string[]> {
  const entries = await fs.readdir(layout.manifestsDir, {
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".manifest.json"))
    .map((entry) => path.join(layout.manifestsDir, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

export function createBaseManifest(args: {
  readonly localBatchId: string;
  readonly category?: BatchCategory;
  readonly rootLocalBatchId?: string;
  readonly parentLocalBatchId?: string;
  readonly retryNumber?: number;
  readonly model: string;
  readonly endpoint?: BatchEndpoint;
  readonly inputFilePath: string;
  readonly inputFileHash: string;
  readonly items: LocalBatchManifest["items"];
}): LocalBatchManifest {
  const now = new Date().toISOString();
  return {
    schemaVersion: BATCH_SCHEMA_VERSION,
    category: args.category ?? "text-localization",
    localBatchId: args.localBatchId,
    rootLocalBatchId: args.rootLocalBatchId ?? args.localBatchId,
    ...(args.parentLocalBatchId
      ? { parentLocalBatchId: args.parentLocalBatchId }
      : {}),
    retryNumber: args.retryNumber ?? 0,
    createdAt: now,
    updatedAt: now,
    mode: "batch",
    endpoint: args.endpoint ?? "/v1/responses",
    model: args.model,
    completionWindow: "24h",
    inputFilePath: toRepositoryRelativePath(args.inputFilePath),
    inputFileHash: args.inputFileHash,
    status: "prepared",
    items: args.items,
  };
}

export interface LockMetadata {
  readonly pid: number;
  readonly hostname: string;
  readonly createdAt: string;
  readonly ownerId: string;
}

export async function withFileLock<T>(
  lockPath: string,
  run: () => Promise<T>,
  staleAfterMs = 5 * 60_000
): Promise<T> {
  await ensureDir(path.dirname(lockPath));
  const owner: LockMetadata = {
    pid: process.pid,
    hostname: os.hostname(),
    createdAt: new Date().toISOString(),
    ownerId: `${os.hostname()}:${process.pid}:${Date.now()}`,
  };
  const acquire = async (): Promise<void> => {
    try {
      const handle = await fs.open(lockPath, "wx");
      await handle.writeFile(`${JSON.stringify(owner, null, 2)}\n`);
      await handle.close();
      return;
    } catch (error) {
      const raw = await fs.readFile(lockPath, "utf8").catch(() => null);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as LockMetadata;
          if (Date.now() - Date.parse(parsed.createdAt) > staleAfterMs) {
            await fs.unlink(lockPath).catch(() => void 0);
            return acquire();
          }
        } catch {
          await fs.unlink(lockPath).catch(() => void 0);
          return acquire();
        }
      }
      throw error;
    }
  };
  await acquire();
  try {
    return await run();
  } finally {
    await fs.unlink(lockPath).catch(() => void 0);
  }
}
