import fs from "node:fs/promises";
import path from "node:path";
import {
  ensureDir,
  fileExists,
  hashText,
  resolveEpisodeImageBatchErrorPath,
  resolveEpisodeImageBatchErrorsDir,
  resolveEpisodeImageBatchInputPath,
  resolveEpisodeImageBatchInputsDir,
  resolveEpisodeImageBatchManifestFilePath,
  resolveEpisodeImageBatchManifestsDir,
  resolveEpisodeImageBatchReportPath,
  resolveEpisodeImageBatchReportsDir,
  resolveEpisodeImageBatchResultPath,
  resolveEpisodeImageBatchResultsDir,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import {
  createLocalBatchId,
  type BatchStorageLayout,
} from "@mediaforge/story-localization";
import type {
  ImageBatchManifest as ImageBatchManifestType,
  ImageBatchManifestItem as ImageBatchManifestItemType,
  ImageBatchJob as ImageBatchJobType,
} from "./image-batch.types.js";
import { normalizeImageBatchManifest } from "./image-batch-normalization.js";
import {
  imageBatchManifestSchema,
} from "./image-batch.schemas.js";

export interface ImageBatchStorageLayout extends BatchStorageLayout {}

export interface ImageBatchStoragePlan {
  readonly outputDirectory: string;
  readonly layout: ImageBatchStorageLayout;
  readonly localBatchId: string;
  readonly inputFilePath: string;
  readonly manifestPath: string;
  readonly resultFilePath: string;
  readonly errorFilePath: string;
  readonly reportFilePath: string;
}

type ImageBatchManifest = ImageBatchManifestType;
type ImageBatchManifestItem = ImageBatchManifestItemType;
type ImageBatchJob = ImageBatchJobType;

function resolveEpisodeDirFromImageStateDir(outputDirectory: string): string {
  const resolved = outputDirectory.replace(/[\\/]+$/u, "");
  if (
    path.basename(resolved) !== "image-generation" ||
    path.basename(path.dirname(resolved)) !== "state"
  ) {
    throw new Error(
      `Image batch storage requires a canonical image state directory, received ${outputDirectory}.`
    );
  }
  return path.dirname(path.dirname(resolved));
}

export async function ensureImageBatchStorageLayout(
  outputDirectory: string
): Promise<ImageBatchStorageLayout> {
  const episodeDir = resolveEpisodeDirFromImageStateDir(outputDirectory);
  const layout = {
    root: path.join(outputDirectory, ".batch"),
    indexPath: path.join(outputDirectory, ".batch", "batch-index.json"),
    pendingDir: path.join(outputDirectory, ".batch", "pending"),
    submittedDir: path.join(outputDirectory, ".batch", "submitted"),
    completedDir: path.join(outputDirectory, ".batch", "completed"),
    failedDir: path.join(outputDirectory, ".batch", "failed"),
    expiredDir: path.join(outputDirectory, ".batch", "expired"),
    cancelledDir: path.join(outputDirectory, ".batch", "cancelled"),
    inputsDir: resolveEpisodeImageBatchInputsDir(episodeDir),
    resultsDir: resolveEpisodeImageBatchResultsDir(episodeDir),
    errorsDir: resolveEpisodeImageBatchErrorsDir(episodeDir),
    manifestsDir: resolveEpisodeImageBatchManifestsDir(episodeDir),
    locksDir: path.join(outputDirectory, ".batch", "locks"),
    reportsDir: resolveEpisodeImageBatchReportsDir(episodeDir),
    quarantineDir: path.join(outputDirectory, ".batch", "quarantine"),
  } satisfies ImageBatchStorageLayout;
  await Promise.all(
    Object.values(layout)
      .filter((value) => value !== layout.indexPath)
      .map((dir) => ensureDir(dir))
  );
  return layout;
}

export async function createImageBatchStoragePlan(
  outputDirectory: string,
  localBatchId?: string
): Promise<ImageBatchStoragePlan> {
  const layout = await ensureImageBatchStorageLayout(outputDirectory);
  const episodeDir = resolveEpisodeDirFromImageStateDir(outputDirectory);
  const resolvedLocalBatchId = localBatchId ?? (await createLocalBatchId(layout));
  return {
    outputDirectory,
    layout,
    localBatchId: resolvedLocalBatchId,
    inputFilePath: resolveEpisodeImageBatchInputPath(episodeDir, resolvedLocalBatchId),
    manifestPath: resolveEpisodeImageBatchManifestFilePath(episodeDir, resolvedLocalBatchId),
    resultFilePath: resolveEpisodeImageBatchResultPath(episodeDir, resolvedLocalBatchId),
    errorFilePath: resolveEpisodeImageBatchErrorPath(episodeDir, resolvedLocalBatchId),
    reportFilePath: resolveEpisodeImageBatchReportPath(episodeDir, resolvedLocalBatchId),
  };
}

export async function writeImageBatchInputFile(
  plan: ImageBatchStoragePlan,
  lines: readonly string[]
): Promise<{ readonly inputFilePath: string; readonly inputFileHash: string }> {
  const content = `${lines.join("\n")}\n`;
  await writeTextAtomic(plan.inputFilePath, content);
  return {
    inputFilePath: plan.inputFilePath,
    inputFileHash: hashText(content),
  };
}

export async function writeImageBatchManifest(
  plan: ImageBatchStoragePlan,
  manifest: ImageBatchManifest
): Promise<void> {
  await writeJsonAtomic(
    plan.manifestPath,
    imageBatchManifestSchema.parse(normalizeImageBatchManifest(manifest))
  );
}

export async function readImageBatchManifest(
  manifestPath: string
): Promise<ImageBatchManifest | undefined> {
  if (!(await fileExists(manifestPath))) {
    return undefined;
  }
  const raw = await fs.readFile(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return imageBatchManifestSchema.parse(
    normalizeImageBatchManifest(parsed)
  ) as ImageBatchManifest;
}

export function createImageBatchManifestItem(args: {
  readonly job: ImageBatchJob;
  readonly customId: string;
  readonly status?: ImageBatchManifestItem["status"];
}): ImageBatchManifestItem {
  return {
    customId: args.customId,
    identity: args.job.identity,
    ...(args.job.sceneId ? { sceneId: args.job.sceneId } : {}),
    ...(args.job.sceneIndex !== undefined
      ? { sceneIndex: args.job.sceneIndex }
      : {}),
    ...(args.job.renderability ? { renderability: args.job.renderability } : {}),
    ...(args.job.reusedFromSceneId
      ? { reusedFromSceneId: args.job.reusedFromSceneId }
      : {}),
    providerRequestHash: args.job.providerRequestHash,
    generationConfigurationHash: args.job.generationConfigurationHash,
    expectedOutputPath: args.job.expectedOutputPath,
    characterIds: args.job.characterIds,
    dependencies: args.job.dependencies,
    requestedSize: args.job.identity.size,
    quality: args.job.identity.quality,
    outputFormat: args.job.outputFormat,
    status: args.status ?? "planned",
    retryCount: 0,
  };
}

export function serializeImageBatchRequestLines(
  items: ReadonlyArray<{
    readonly custom_id: string;
    readonly method: "POST";
    readonly url: "/v1/images/generations" | "/v1/images/edits";
    readonly body: Record<string, unknown>;
  }>
): string {
  return `${items.map((item) => JSON.stringify(item)).join("\n")}\n`;
}
