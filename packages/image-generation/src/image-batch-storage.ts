import fs from "node:fs/promises";
import {
  fileExists,
  hashText,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import {
  ensureBatchStorageLayout,
  createLocalBatchId,
  inputPathFor,
  manifestPathFor,
  reportPathFor,
  resultPathFor,
  errorPathFor,
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

export async function ensureImageBatchStorageLayout(
  outputDirectory: string
): Promise<ImageBatchStorageLayout> {
  return ensureBatchStorageLayout(outputDirectory);
}

export async function createImageBatchStoragePlan(
  outputDirectory: string
): Promise<ImageBatchStoragePlan> {
  const layout = await ensureImageBatchStorageLayout(outputDirectory);
  const localBatchId = await createLocalBatchId(layout);
  return {
    outputDirectory,
    layout,
    localBatchId,
    inputFilePath: inputPathFor(layout, localBatchId),
    manifestPath: manifestPathFor(layout, localBatchId),
    resultFilePath: resultPathFor(layout, localBatchId),
    errorFilePath: errorPathFor(layout, localBatchId),
    reportFilePath: reportPathFor(layout, localBatchId),
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
  return normalizeImageBatchManifest(JSON.parse(raw)) as ImageBatchManifest;
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
