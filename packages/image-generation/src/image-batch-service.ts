import fs from "node:fs";
import path from "node:path";
import {
  fileExists,
  hashFile,
  readJsonIfExists,
  resolveEpisodeImageManifestPathFromSceneOutputPath,
  writeBinaryAtomic,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import {
  StoryBatchIndexService,
  parseBatchOutputJsonl,
  normalizeBatchStatus,
  requireBatchCapabilities,
  type BatchIndexEntry,
  type BatchIndexStatus,
  readRemoteFileText,
  type OpenAiBatchOutputLine,
  type OpenAiStoryClient,
} from "@mediaforge/story-localization";
import {
  ensureImageBatchStorageLayout,
  readImageBatchManifest,
  writeImageBatchManifest,
  type ImageBatchStorageLayout,
} from "./image-batch-storage.js";
import {
  imageBatchManifestItemSchema,
  imageBatchManifestSchema,
} from "./image-batch.schemas.js";
import { prepareImageBatchForEpisode } from "./image-batch-planner.js";
import type {
  ImageBatchManifest,
  ImageBatchItemStatus,
  ImageBatchStatus,
} from "./image-batch.types.js";
import type { SceneGenerationManifest } from "./episode-image-pipeline.js";
import sharp from "sharp";

export interface ImageBatchSubmissionResult {
  readonly localBatchId: string;
  readonly openAIBatchId: string;
  readonly openAIInputFileId: string;
  readonly status: BatchIndexStatus;
}

export interface ImageBatchImportResult {
  readonly localBatchId: string;
  readonly importedItemCount: number;
  readonly failedItemCount: number;
  readonly persistedFiles: readonly string[];
  readonly status: "imported" | "imported_with_failures";
}

export interface ImageBatchRetryResult {
  readonly localBatchId: string;
  readonly manifestPath: string;
  readonly inputFilePath: string;
  readonly itemCount: number;
  readonly skippedCachedItemCount: number;
}

export interface ImageBatchReadinessReport {
  readonly totalBatches: number;
  readonly pendingBatches: number;
  readonly requiresImportBatches: number;
  readonly importedBatches: number;
  readonly failedBatches: number;
  readonly mergedWithPreviousScenes: number;
  readonly mergedWithNextScenes: number;
  readonly reusedScenes: number;
  readonly readyForRender: boolean;
  readonly episodeNumbers: readonly string[];
  readonly sceneCount: number;
}

function batchIndexStatusFromImageStatus(
  status: ImageBatchStatus
): BatchIndexStatus {
  switch (status) {
    case "prepared":
      return "prepared";
    case "uploading":
      return "prepared";
    case "submitted":
      return "submitted";
    case "validating":
      return "validating";
    case "in_progress":
      return "in_progress";
    case "finalizing":
      return "finalizing";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "expired":
      return "expired";
    case "cancelling":
      return "cancelling";
    case "cancelled":
      return "cancelled";
    case "imported":
      return "imported";
    case "imported_with_failures":
      return "imported_with_failures";
    default: {
      const exhaustiveCheck: never = status;
      return exhaustiveCheck;
    }
  }
}

function computeImageDetails(manifest: ImageBatchManifest) {
  const generatedImageCount = manifest.items.filter(
    (item) => item.status === "persisted"
  ).length;
  const invalidImageCount = manifest.items.filter((item) =>
    ["decode-failed", "validation-failed"].includes(item.status)
  ).length;
  const failedImageCount = manifest.items.filter((item) =>
    ["api-failed", "policy-rejected", "expired", "retry-required"].includes(
      item.status
    )
  ).length;
  const missingImageCount = manifest.items.filter(
    (item) => item.status === "planned" || item.status === "submitted"
  ).length;
  return {
    category: "image-generation" as const,
    episodeNumbers: [...new Set(manifest.items.map((item) => item.episodeNumber))],
    sceneCount: manifest.items.length,
    mergedWithPreviousScenes: manifest.items.filter(
      (item) => item.renderability === "mergeWithPrevious"
    ).length,
    mergedWithNextScenes: manifest.items.filter(
      (item) => item.renderability === "mergeWithNext"
    ).length,
    reusedScenes: manifest.items.filter(
      (item) => item.reusedFromSceneId !== undefined
    ).length,
    imageModel: manifest.model,
    ...(manifest.items.find((item) => item.quality)
      ? { imageQuality: manifest.items.find((item) => item.quality)?.quality }
      : {}),
    outputFormat: manifest.items[0]?.outputFormat ?? "png",
    generatedImageCount,
    invalidImageCount,
    failedImageCount,
    missingImageCount,
    requiresImport:
      manifest.status === "completed" || manifest.status === "imported_with_failures"
        ? generatedImageCount > 0 || failedImageCount > 0 || invalidImageCount > 0
        : false,
  };
}

function toIndexEntry(args: {
  readonly layout: ImageBatchStorageLayout;
  readonly manifest: ImageBatchManifest;
}): BatchIndexEntry {
  const completedItemCount = args.manifest.items.filter(
    (item) => item.status === "persisted"
  ).length;
  const failedItemCount = args.manifest.items.filter((item) =>
    ["api-failed", "expired", "policy-rejected", "decode-failed", "validation-failed", "retry-required"].includes(item.status)
  ).length;
  const persistedItemCount = completedItemCount;
  const imageDetails = computeImageDetails(args.manifest);
  const entry = {
    localBatchId: args.manifest.localBatchId,
    ...(args.manifest.openAIBatchId
      ? { openAIBatchId: args.manifest.openAIBatchId }
      : {}),
    category: "image-generation",
    rootLocalBatchId: args.manifest.rootLocalBatchId,
    ...(args.manifest.parentLocalBatchId
      ? { parentLocalBatchId: args.manifest.parentLocalBatchId }
      : {}),
    retryNumber: args.manifest.retryNumber,
    status: batchIndexStatusFromImageStatus(args.manifest.status),
    createdAt: args.manifest.createdAt,
    updatedAt: args.manifest.updatedAt,
    ...(args.manifest.submittedAt ? { submittedAt: args.manifest.submittedAt } : {}),
    ...(args.manifest.completedAt ? { completedAt: args.manifest.completedAt } : {}),
    ...(args.manifest.importedAt ? { importedAt: args.manifest.importedAt } : {}),
    model: args.manifest.model,
    endpoint: args.manifest.endpoint,
    completionWindow: args.manifest.completionWindow,
    operations: ["image-generation"],
    episodeNumbers: imageDetails.episodeNumbers,
    languages: ["en"],
    itemCount: args.manifest.items.length,
    completedItemCount,
    failedItemCount,
    persistedItemCount,
    inputFilePath: args.manifest.inputFilePath,
    manifestPath: path.join(
      args.layout.manifestsDir,
      `batch-${args.manifest.localBatchId}.manifest.json`
    ),
    ...(args.manifest.resultFilePath
      ? { resultFilePath: args.manifest.resultFilePath }
      : {}),
    ...(args.manifest.errorFilePath
      ? { errorFilePath: args.manifest.errorFilePath }
      : {}),
    ...(args.manifest.reportFilePath
      ? { reportFilePath: args.manifest.reportFilePath }
      : {}),
    ...(args.manifest.openAIInputFileId
      ? { openAIInputFileId: args.manifest.openAIInputFileId }
      : {}),
    ...(args.manifest.outputFileId
      ? { outputFileId: args.manifest.outputFileId }
      : {}),
    ...(args.manifest.errorFileId
      ? { errorFileId: args.manifest.errorFileId }
      : {}),
    sourceHashPrefixes: [...new Set(args.manifest.items.map((item) => item.promptHash.slice(0, 8)))],
    imported:
      args.manifest.status === "imported" ||
      args.manifest.status === "imported_with_failures",
    requiresImport:
      args.manifest.status === "completed" ||
      args.manifest.status === "imported_with_failures",
    hasRetryableFailures:
      failedItemCount > 0 ||
      args.manifest.items.some((item) => item.status === "retry-required"),
    imageDetails,
  };
  return entry as unknown as BatchIndexEntry;
}

function imageManifestPath(layout: ImageBatchStorageLayout, localBatchId: string): string {
  return path.join(layout.manifestsDir, `batch-${localBatchId}.manifest.json`);
}

function sceneManifestPathForOutput(outputPath: string, sceneId: string): string {
  return resolveEpisodeImageManifestPathFromSceneOutputPath({
    outputPath,
    sceneId,
  });
}

function decodeBase64Image(value: string): Buffer {
  const compact = value.replace(/\s+/gu, "");
  if (!/^[A-Za-z0-9+/=]+$/u.test(compact)) {
    throw new Error("Invalid base64 image payload.");
  }
  const decoded = Buffer.from(compact, "base64");
  if (decoded.byteLength === 0) {
    throw new Error("Empty image payload.");
  }
  const normalized = decoded.toString("base64").replace(/=+$/gu, "");
  const inputNormalized = compact.replace(/=+$/gu, "");
  if (normalized !== inputNormalized) {
    throw new Error("Invalid base64 image payload.");
  }
  return decoded;
}

function extractBase64ImageFromBatchLine(
  line: OpenAiBatchOutputLine
): string | undefined {
  const body = line.response?.body as {
    readonly data?:
      | ReadonlyArray<{
          readonly b64_json?: string;
          readonly image_base64?: string;
          readonly base64?: string;
        }>
      | undefined;
    readonly b64_json?: string;
    readonly image_base64?: string;
    readonly base64?: string;
  };
  return (
    body?.data?.[0]?.b64_json ??
    body?.data?.[0]?.image_base64 ??
    body?.data?.[0]?.base64 ??
    body?.b64_json ??
    body?.image_base64 ??
    body?.base64
  );
}

async function persistImportedImage(args: {
  readonly outputPath: string;
  readonly sceneId: string;
  readonly imageBuffer: Buffer;
  readonly expectedFormat: "png" | "jpeg" | "webp";
  readonly requestedSize: string;
}): Promise<{
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  readonly mimeType: string;
  readonly byteSize: number;
}> {
  const metadata = await sharp(args.imageBuffer).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Decoded image is missing dimensions.");
  }
  const actualFormat = metadata.format ?? "";
  const expectedMimeType =
    args.expectedFormat === "png"
      ? "image/png"
      : args.expectedFormat === "jpeg"
        ? "image/jpeg"
        : "image/webp";
  const actualMimeType =
    actualFormat === "png"
      ? "image/png"
      : actualFormat === "jpeg"
        ? "image/jpeg"
        : actualFormat === "webp"
          ? "image/webp"
          : "";
  if (actualMimeType !== expectedMimeType) {
    throw new Error(
      `Unexpected image format for ${args.sceneId}: expected ${expectedMimeType}, received ${actualMimeType || "unknown"}.`
    );
  }
  const [requestedWidth, requestedHeight] = args.requestedSize.split("x").map((value) => Number.parseInt(value, 10));
  if (
    Number.isFinite(requestedWidth) &&
    Number.isFinite(requestedHeight) &&
    (requestedWidth !== metadata.width || requestedHeight !== metadata.height)
  ) {
    throw new Error(
      `Unexpected image dimensions for ${args.sceneId}: expected ${requestedWidth}x${requestedHeight}, received ${metadata.width}x${metadata.height}.`
    );
  }
  await writeBinaryAtomic(args.outputPath, args.imageBuffer);
  return {
    sha256: await hashFile(args.outputPath),
    width: metadata.width,
    height: metadata.height,
    mimeType: actualMimeType,
    byteSize: args.imageBuffer.byteLength,
  };
}

async function readSceneManifest(
  outputPath: string,
  sceneId: string
): Promise<SceneGenerationManifest | undefined> {
  const manifestPath = sceneManifestPathForOutput(outputPath, sceneId);
  return (
    (await readJsonIfExists(
      manifestPath,
      (value) => value as SceneGenerationManifest
    )) ?? undefined
  );
}

async function writeSceneManifest(
  outputPath: string,
  sceneId: string,
  manifest: SceneGenerationManifest
): Promise<string> {
  const manifestPath = sceneManifestPathForOutput(outputPath, sceneId);
  await writeJsonAtomic(manifestPath, manifest);
  return manifestPath;
}

function classifyBatchFailure(
  line: OpenAiBatchOutputLine
): ImageBatchItemStatus {
  const code = line.error?.code?.toLowerCase() ?? "";
  if (code.includes("policy") || code.includes("moderation")) {
    return "policy-rejected";
  }
  if (code.includes("expire")) {
    return "expired";
  }
  return "api-failed";
}

function resolveEpisodeDir(outputDirectory: string): string {
  const basename = path.basename(outputDirectory);
  if (basename === "generated-assets") {
    return path.dirname(outputDirectory);
  }
  if (basename === "image-generation") {
    return path.dirname(path.dirname(outputDirectory));
  }
  return outputDirectory;
}

function normalizeImageBatchQuality(
  quality: string | undefined
): "low" | "medium" | "high" | "auto" {
  return quality === "low" ||
    quality === "medium" ||
    quality === "high" ||
    quality === "auto"
    ? quality
    : "medium";
}

function retryableImageItemStatus(status: ImageBatchItemStatus): boolean {
  return [
    "api-failed",
    "expired",
    "policy-rejected",
    "decode-failed",
    "validation-failed",
    "retry-required",
  ].includes(status);
}

async function persistImportedSceneResult(args: {
  readonly item: ImageBatchManifest["items"][number];
  readonly line: OpenAiBatchOutputLine;
}): Promise<{
  readonly manifestItem: ImageBatchManifest["items"][number];
  readonly imageFilePath: string;
  readonly sceneManifestPath: string;
}> {
  if (args.line.error) {
    throw new Error(args.line.error.message || `Batch item failed: ${args.item.customId}`);
  }
  const response = args.line.response;
  if (!response || response.status_code !== 200) {
    throw new Error(`Batch item did not return a successful response: ${args.item.customId}`);
  }
  const payload = extractBase64ImageFromBatchLine(args.line);
  if (!payload) {
    throw new Error(`Batch item missing image payload: ${args.item.customId}`);
  }
  const imageBuffer = decodeBase64Image(payload);
  const persisted = await persistImportedImage({
    outputPath: args.item.expectedOutputPath,
    sceneId: args.item.sceneId,
    imageBuffer,
    expectedFormat: args.item.outputFormat,
    requestedSize: args.item.requestedSize,
  });
  const sceneManifest = await readSceneManifest(
    args.item.expectedOutputPath,
    args.item.sceneId
  );
  if (!sceneManifest) {
    throw new Error(`Missing scene manifest for ${args.item.sceneId}.`);
  }
  const nextSceneManifest: SceneGenerationManifest = {
    ...sceneManifest,
    status: "generated",
    outputSha256: persisted.sha256,
    generatedAt: new Date().toISOString(),
    attempts: Math.max(sceneManifest.attempts, 1),
  };
  const manifestPath = await writeSceneManifest(
    args.item.expectedOutputPath,
    args.item.sceneId,
    nextSceneManifest
  );
  const nextItem = imageBatchManifestItemSchema.parse({
    ...args.item,
    status: "persisted",
    imageHash: persisted.sha256,
    actualWidth: persisted.width,
    actualHeight: persisted.height,
    actualMimeType: persisted.mimeType,
    actualByteSize: persisted.byteSize,
    ...(response.body.usage
      ? {
          usage: {
            inputTokens: response.body.usage.input_tokens ?? 0,
            ...(response.body.usage.input_tokens_details?.cached_tokens !== undefined
              ? {
                  cachedInputTokens:
                    response.body.usage.input_tokens_details.cached_tokens,
                }
              : {}),
            outputTokens: response.body.usage.output_tokens ?? 0,
          },
        }
      : {}),
  }) as ImageBatchManifest["items"][number];
  return {
    manifestItem: nextItem,
    imageFilePath: args.item.expectedOutputPath,
    sceneManifestPath: manifestPath,
  };
}

export async function submitImageBatch(
  outputDirectory: string,
  localBatchId: string,
  client: OpenAiStoryClient
): Promise<ImageBatchSubmissionResult> {
  requireBatchCapabilities(client);
  const layout = await ensureImageBatchStorageLayout(outputDirectory);
  const manifestPath = path.join(
    layout.manifestsDir,
    `batch-${localBatchId}.manifest.json`
  );
  const manifest = await readImageBatchManifest(manifestPath);
  if (!manifest) {
    throw new Error(`Unknown image batch ${localBatchId}.`);
  }
  if (manifest.status !== "prepared") {
    throw new Error(`Image batch ${localBatchId} is not in prepared state.`);
  }
  const absoluteInputPath = manifest.inputFilePath;
  if (!(await fileExists(absoluteInputPath))) {
    throw new Error(`Missing input file for ${localBatchId}.`);
  }
  const currentHash = await hashFile(absoluteInputPath);
  if (currentHash !== manifest.inputFileHash) {
    throw new Error(`Image batch input hash mismatch for ${localBatchId}.`);
  }
  const uploaded = await client.files.create({
    file: fs.createReadStream(absoluteInputPath),
    purpose: "batch",
  });
  const created = await client.batches.create({
    input_file_id: uploaded.id,
    endpoint: manifest.endpoint,
    completion_window: "24h",
    metadata: {
      local_batch_id: localBatchId,
      category: "image-generation",
    },
  } as never);
  const nextManifest = imageBatchManifestSchema.parse({
    ...manifest,
    openAIInputFileId: uploaded.id,
    openAIBatchId: created.id,
    status: "submitted",
    submittedAt: new Date().toISOString(),
    items: manifest.items.map((item) => ({ ...item, status: "submitted" })),
    updatedAt: new Date().toISOString(),
  }) as ImageBatchManifest;
  await writeImageBatchManifest(
    {
      outputDirectory,
      layout,
      localBatchId,
      inputFilePath: manifest.inputFilePath,
      manifestPath,
      resultFilePath: path.join(layout.resultsDir, `batch-${localBatchId}.output.jsonl`),
      errorFilePath: path.join(layout.errorsDir, `batch-${localBatchId}.errors.jsonl`),
      reportFilePath: path.join(layout.reportsDir, `batch-${localBatchId}.summary.json`),
    },
    nextManifest
  );
  const index = new StoryBatchIndexService(outputDirectory);
  await index.initialize();
  await index.upsert(toIndexEntry({ layout, manifest: nextManifest }));
  return {
    localBatchId,
    openAIBatchId: created.id,
    openAIInputFileId: uploaded.id,
    status: "submitted",
  };
}

export async function refreshImageBatch(
  outputDirectory: string,
  batchRef: string,
  client: OpenAiStoryClient
): Promise<ImageBatchManifest> {
  requireBatchCapabilities(client);
  const layout = await ensureImageBatchStorageLayout(outputDirectory);
  const index = new StoryBatchIndexService(outputDirectory);
  const entry =
    (await index.getByLocalBatchId(batchRef)) ??
    (await index.getByOpenAIBatchId(batchRef));
  if (!entry?.openAIBatchId) {
    throw new Error(`Unable to resolve submitted image batch ${batchRef}.`);
  }
  const manifestPath = path.join(
    layout.manifestsDir,
    `batch-${entry.localBatchId}.manifest.json`
  );
  const manifest = await readImageBatchManifest(manifestPath);
  if (!manifest) {
    throw new Error(`Missing image batch manifest for ${entry.localBatchId}.`);
  }
  const remote = await client.batches.retrieve(entry.openAIBatchId);
  const nextManifest = imageBatchManifestSchema.parse({
    ...manifest,
    status: normalizeBatchStatus(remote.status) as ImageBatchStatus,
    ...(remote.output_file_id ? { outputFileId: remote.output_file_id } : {}),
    ...(remote.error_file_id ? { errorFileId: remote.error_file_id } : {}),
    ...(remote.completed_at
      ? { completedAt: new Date(remote.completed_at * 1000).toISOString() }
      : {}),
    updatedAt: new Date().toISOString(),
    items: manifest.items,
  }) as ImageBatchManifest;
  await writeImageBatchManifest(
    {
      outputDirectory,
      layout,
      localBatchId: entry.localBatchId,
      inputFilePath: manifest.inputFilePath,
      manifestPath,
      resultFilePath: path.join(layout.resultsDir, `batch-${entry.localBatchId}.output.jsonl`),
      errorFilePath: path.join(layout.errorsDir, `batch-${entry.localBatchId}.errors.jsonl`),
      reportFilePath: path.join(layout.reportsDir, `batch-${entry.localBatchId}.summary.json`),
    },
    nextManifest
  );
  await index.upsert(toIndexEntry({ layout, manifest: nextManifest }));
  return nextManifest;
}

export async function importImageBatch(
  outputDirectory: string,
  batchRef: string,
  client: OpenAiStoryClient
): Promise<ImageBatchImportResult> {
  requireBatchCapabilities(client);
  const layout = await ensureImageBatchStorageLayout(outputDirectory);
  const index = new StoryBatchIndexService(outputDirectory);
  const entry =
    (await index.getByLocalBatchId(batchRef)) ??
    (await index.getByOpenAIBatchId(batchRef));
  if (!entry?.openAIBatchId) {
    throw new Error(`Unable to resolve submitted image batch ${batchRef}.`);
  }
  const refreshed = await refreshImageBatch(outputDirectory, batchRef, client);
  if (!refreshed.openAIBatchId) {
    throw new Error(`Image batch ${batchRef} has not been submitted.`);
  }
  const outputText = refreshed.outputFileId
    ? await readRemoteFileText(client, refreshed.outputFileId)
    : "";
  const errorText = refreshed.errorFileId
    ? await readRemoteFileText(client, refreshed.errorFileId)
    : "";
  const resultFilePath = path.join(
    layout.resultsDir,
    `batch-${refreshed.localBatchId}.output.jsonl`
  );
  const errorFilePath = path.join(
    layout.errorsDir,
    `batch-${refreshed.localBatchId}.errors.jsonl`
  );
  const reportFilePath = path.join(
    layout.reportsDir,
    `batch-${refreshed.localBatchId}.summary.json`
  );
  if (outputText) {
    await writeTextAtomic(resultFilePath, outputText);
  }
  if (errorText) {
    await writeTextAtomic(errorFilePath, errorText);
  }
  const successLines = new Map(
    parseBatchOutputJsonl(outputText).map((line) => [line.custom_id, line])
  );
  const errorLines = new Map(
    parseBatchOutputJsonl(errorText).map((line) => [line.custom_id, line])
  );
  const nextItems: Array<ImageBatchManifest["items"][number]> = [];
  const persistedFiles: string[] = [];
  let failedItemCount = 0;
  for (const item of refreshed.items) {
    const line = successLines.get(item.customId) ?? errorLines.get(item.customId);
    if (!line) {
      failedItemCount += 1;
      nextItems.push({
        ...item,
        status: "retry-required",
        error: {
          category: "missing-result",
          message: `Missing image batch output for ${item.customId}.`,
        },
      });
      continue;
    }
    try {
      if (line.error) {
        throw new Error(line.error.message || `Batch item failed: ${item.customId}`);
      }
      const persisted = await persistImportedSceneResult({ item, line });
      persistedFiles.push(persisted.imageFilePath, persisted.sceneManifestPath);
      nextItems.push(persisted.manifestItem);
    } catch (error) {
      failedItemCount += 1;
      const status = line.error ? classifyBatchFailure(line) : "validation-failed";
      nextItems.push({
        ...item,
        status,
        error: {
          category:
            status === "policy-rejected"
              ? "policy"
              : status === "expired"
                ? "expired"
                : status === "validation-failed"
                  ? "validation"
                  : "api",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
  const importedStatus =
    failedItemCount > 0 ? "imported_with_failures" : "imported";
  const nextManifest = imageBatchManifestSchema.parse({
    ...refreshed,
    status: importedStatus,
    importedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: nextItems,
    resultFilePath,
    ...(errorText ? { errorFilePath } : {}),
    reportFilePath,
  }) as ImageBatchManifest;
  await writeImageBatchManifest(
    {
      outputDirectory,
      layout,
      localBatchId: refreshed.localBatchId,
      inputFilePath: refreshed.inputFilePath,
      manifestPath: imageManifestPath(layout, refreshed.localBatchId),
      resultFilePath,
      errorFilePath,
      reportFilePath,
    },
    nextManifest
  );
  await writeJsonAtomic(reportFilePath, {
    localBatchId: refreshed.localBatchId,
    importedAt: new Date().toISOString(),
    totalItems: refreshed.items.length,
    failedItemCount,
    persistedFiles,
    status: importedStatus,
  });
  await index.upsert(toIndexEntry({ layout, manifest: nextManifest }));
  return {
    localBatchId: refreshed.localBatchId,
    importedItemCount: refreshed.items.length - failedItemCount,
    failedItemCount,
    persistedFiles,
    status: importedStatus,
  };
}

export async function retryFailedImageBatch(
  outputDirectory: string,
  batchRef: string
): Promise<ImageBatchRetryResult> {
  const layout = await ensureImageBatchStorageLayout(outputDirectory);
  const index = new StoryBatchIndexService(outputDirectory);
  await index.initialize();
  const entry =
    (await index.getByLocalBatchId(batchRef)) ??
    (await index.getByOpenAIBatchId(batchRef));
  const resolvedLocalBatchId = entry?.localBatchId ?? batchRef;
  const manifestPath = path.join(
    layout.manifestsDir,
    `batch-${resolvedLocalBatchId}.manifest.json`
  );
  const manifest = await readImageBatchManifest(manifestPath);
  if (!manifest) {
    throw new Error(`Missing image batch manifest for ${resolvedLocalBatchId}.`);
  }
  const retryableItems = manifest.items.filter((item) =>
    retryableImageItemStatus(item.status)
  );
  if (retryableItems.length === 0) {
    throw new Error(`Image batch ${resolvedLocalBatchId} has no retryable items.`);
  }
  const retryableSceneIds = [...new Set(retryableItems.map((item) => item.sceneId))];
  const retryableSceneIndex = new Map(
    retryableItems.map((item) => [item.sceneId, item.sceneIndex])
  );
  const episodeSlug = retryableItems[0]?.episodeSlug ?? manifest.items[0]?.episodeSlug;
  if (!episodeSlug) {
    throw new Error(`Unable to resolve episode slug for ${resolvedLocalBatchId}.`);
  }
  const referenceItem = retryableItems[0] ?? manifest.items[0];
  if (!referenceItem) {
    throw new Error(`Unable to resolve retry settings for ${resolvedLocalBatchId}.`);
  }
  const requestedSize = referenceItem.requestedSize;
  const quality = normalizeImageBatchQuality(referenceItem.quality);
  const outputFormat = referenceItem.outputFormat;
  const episodeDir = resolveEpisodeDir(outputDirectory);
  const prepared = await prepareImageBatchForEpisode({
    episodeDir,
    episodeId: episodeSlug,
    scenePlan: {
      scenes: retryableSceneIds.map((sceneId) => ({
        id: sceneId,
        sequenceNumber: retryableSceneIndex.get(sceneId) ?? 0,
      })),
    },
    settings: {
      model: manifest.model,
      requestedSize,
      quality,
      outputFormat,
    },
    options: {
      sceneIds: retryableSceneIds,
    },
  });
  const group = prepared.groups[0];
  if (!group) {
    throw new Error(`Failed to prepare retry batch for ${resolvedLocalBatchId}.`);
  }
  const preparedManifest = await readImageBatchManifest(
    group.storagePlan.manifestPath
  );
  if (!preparedManifest) {
    throw new Error(`Missing prepared retry manifest for ${resolvedLocalBatchId}.`);
  }
  const nextManifest = imageBatchManifestSchema.parse({
    ...preparedManifest,
    rootLocalBatchId: manifest.rootLocalBatchId,
    parentLocalBatchId: manifest.localBatchId,
    retryNumber: manifest.retryNumber + 1,
    updatedAt: new Date().toISOString(),
  }) as ImageBatchManifest;
  await writeImageBatchManifest(group.storagePlan, nextManifest);
  await index.upsert(toIndexEntry({ layout, manifest: nextManifest }));
  return {
    localBatchId: nextManifest.localBatchId,
    manifestPath: group.storagePlan.manifestPath,
    inputFilePath: group.storagePlan.inputFilePath,
    itemCount: nextManifest.items.length,
    skippedCachedItemCount: 0,
  };
}

export async function summarizeImageBatchState(
  outputDirectory: string
): Promise<ImageBatchReadinessReport> {
  const index = new StoryBatchIndexService(outputDirectory);
  await index.initialize();
  const entries = await index.list({ category: "image-generation" });
  const pendingStatuses = new Set([
    "prepared",
    "submitted",
    "validating",
    "in_progress",
    "finalizing",
  ]);
  const failedStatuses = new Set([
    "failed",
    "expired",
    "partially_completed",
    "imported_with_failures",
  ]);
  const totalBatches = entries.length;
  const pendingBatches = entries.filter((entry) => pendingStatuses.has(entry.status)).length;
  const requiresImportBatches = entries.filter((entry) => entry.requiresImport).length;
  const importedBatches = entries.filter((entry) => entry.imported).length;
  const failedBatches = entries.filter((entry) => failedStatuses.has(entry.status)).length;
  const readyForRender =
    pendingBatches === 0 && requiresImportBatches === 0 && failedBatches === 0;
  const episodeNumbers = [...new Set(entries.flatMap((entry) => entry.episodeNumbers))].sort(
    (left, right) => left.localeCompare(right)
  );
  const sceneCount = entries.reduce((sum, entry) => sum + entry.itemCount, 0);
  const manifests = await Promise.all(
    entries.map(async (entry) => {
      const manifest = await readImageBatchManifest(entry.manifestPath);
      return manifest?.items ?? [];
    })
  );
  const mergedWithPreviousScenes = manifests.reduce(
    (sum, items) =>
      sum + items.filter((item) => item.renderability === "mergeWithPrevious").length,
    0
  );
  const mergedWithNextScenes = manifests.reduce(
    (sum, items) =>
      sum + items.filter((item) => item.renderability === "mergeWithNext").length,
    0
  );
  const reusedScenes = manifests.reduce(
    (sum, items) =>
      sum + items.filter((item) => item.reusedFromSceneId !== undefined).length,
    0
  );
  return {
    totalBatches,
    pendingBatches,
    requiresImportBatches,
    importedBatches,
    failedBatches,
    mergedWithPreviousScenes,
    mergedWithNextScenes,
    reusedScenes,
    readyForRender,
    episodeNumbers,
    sceneCount,
  };
}
