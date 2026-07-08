import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  assertInsideWorkspace,
  fileExists,
  hashFile,
  readJsonIfExists,
  resolveEpisodeContainedFilePath,
  resolveEpisodeImageBatchErrorPath,
  resolveEpisodeImageBatchManifestFilePath,
  resolveEpisodeImageBatchReportPath,
  resolveEpisodeImageBatchResultPath,
  resolveEpisodeCharacterRegistryPath,
  resolveEpisodeImageManifestPath,
  resolveEpisodeShortsImageManifestPath,
  toEpisodeRelativeDisplayPath,
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
  openAiImageBatchResponseBodySchema,
  openAiImageBatchOutputLineSchema,
} from "./image-batch.schemas.js";
import {
  prepareFullSceneImageBatches,
  prepareShortSceneImageBatches,
} from "./image-batch-planner.js";
import type {
  ImageBatchManifest,
  ImageBatchItemStatus,
  ImageBatchStatus,
} from "./image-batch.types.js";
import {
  loadEpisodeCharacterRegistry,
  sceneGenerationManifestSchema,
  upsertCharacterRegistry,
  type CharacterDefinition,
  type SceneGenerationManifest,
} from "./episode-image-pipeline.js";
import {
  shortsSceneManifestEntrySchema,
  type ShortsSceneManifestEntry,
} from "./shorts-image-strategy.js";
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
  readonly retryableItemCount: number;
  readonly unknownResultCount: number;
  readonly duplicateResultCount: number;
  readonly providerStatus: ImageBatchStatus;
  readonly status: "imported" | "imported_with_failures" | "non_terminal";
}

export interface ImageBatchRetryResult {
  readonly localBatchId: string;
  readonly manifestPath: string;
  readonly inputFilePath: string;
  readonly itemCount: number;
  readonly skippedCachedItemCount: number;
}

export interface ResolvedImageBatchManifest {
  readonly localBatchId: string;
  readonly manifestPath: string;
  readonly manifest: ImageBatchManifest;
  readonly matchedBy: "localBatchId" | "openAIBatchId";
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
    episodeNumbers: [
      ...new Set(manifest.items.map((item) => item.identity.episodeId)),
    ],
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
    operations: [
      ...new Set(
        args.manifest.items.map((item) =>
          item.identity.operation === "edit" ? "image-edit" : "image-generation"
        )
      ),
    ],
    episodeNumbers: imageDetails.episodeNumbers,
    languages: [
      ...new Set(args.manifest.items.map((item) => item.identity.language)),
    ],
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
    sourceHashPrefixes: [
      ...new Set(
        args.manifest.items.map((item) => item.identity.promptHash.slice(0, 8))
      ),
    ],
    imported:
      args.manifest.status === "imported" ||
      args.manifest.status === "imported_with_failures",
    requiresImport:
      args.manifest.status === "completed" ||
      args.manifest.status === "imported_with_failures",
    hasRetryableFailures:
      args.manifest.items.some((item) => itemRetryable(item)),
    imageDetails,
  };
  return entry as unknown as BatchIndexEntry;
}

function importedItemCount(manifest: ImageBatchManifest): number {
  return manifest.items.filter((item) => item.status === "persisted").length;
}

function failedItemCount(manifest: ImageBatchManifest): number {
  return manifest.items.filter(
    (item) => item.status !== "persisted" && item.status !== "skipped-cached"
  ).length;
}

function retryableItemCount(manifest: ImageBatchManifest): number {
  return manifest.items.filter((item) => itemRetryable(item)).length;
}

async function resolveCanonicalOutputPathForItem(args: {
  readonly episodeDir: string;
  readonly item: ImageBatchManifest["items"][number];
}): Promise<string> {
  const resolvedFromIdentity = await resolveEpisodeContainedFilePath({
    episodeDir: args.episodeDir,
    relativePath: args.item.identity.destination.relativePath,
  });
  const resolvedExpected = assertInsideWorkspace(
    args.episodeDir,
    args.item.expectedOutputPath
  );
  if (path.resolve(resolvedFromIdentity) !== path.resolve(resolvedExpected)) {
    throw new ImageBatchImportError({
      message:
        `Manifest/filesystem disagreement for ${args.item.customId}: expected ${toEpisodeRelativeDisplayPath(
          args.episodeDir,
          resolvedExpected
        )}, identity resolves to ${args.item.identity.destination.relativePath}.`,
      status: "validation-failed",
      category: "destination-conflict",
      code: "destination-conflict",
    });
  }
  return resolvedFromIdentity;
}

function fullSceneManifestPath(
  episodeDir: string,
  sceneId: string
): string {
  return resolveEpisodeImageManifestPath(episodeDir, sceneId);
}

function shortsManifestPath(episodeDir: string): string {
  return resolveEpisodeShortsImageManifestPath(episodeDir);
}

class ImageBatchImportError extends Error {
  readonly status: ImageBatchItemStatus;
  readonly category: string;
  readonly code?: string;

  constructor(args: {
    readonly message: string;
    readonly status: ImageBatchItemStatus;
    readonly category: string;
    readonly code?: string;
  }) {
    super(args.message);
    this.name = "ImageBatchImportError";
    this.status = args.status;
    this.category = args.category;
    if (args.code !== undefined) {
      this.code = args.code;
    }
  }
}

function asImportError(
  error: unknown,
  fallback: {
    readonly status: ImageBatchItemStatus;
    readonly category: string;
    readonly code?: string;
  }
): ImageBatchImportError {
  if (error instanceof ImageBatchImportError) {
    return error;
  }
  return new ImageBatchImportError({
    message: error instanceof Error ? error.message : String(error),
    status: fallback.status,
    category: fallback.category,
    ...(fallback.code ? { code: fallback.code } : {}),
  });
}

function decodeBase64Image(value: string): Buffer {
  const compact = value.replace(/\s+/gu, "");
  if (!/^[A-Za-z0-9+/=]+$/u.test(compact)) {
    throw new ImageBatchImportError({
      message: "Invalid base64 image payload.",
      status: "decode-failed",
      category: "invalid-base64",
      code: "invalid-base64",
    });
  }
  const decoded = Buffer.from(compact, "base64");
  if (decoded.byteLength === 0) {
    throw new ImageBatchImportError({
      message: "Empty image payload.",
      status: "decode-failed",
      category: "invalid-base64",
      code: "empty-payload",
    });
  }
  const normalized = decoded.toString("base64").replace(/=+$/gu, "");
  const inputNormalized = compact.replace(/=+$/gu, "");
  if (normalized !== inputNormalized) {
    throw new ImageBatchImportError({
      message: "Invalid base64 image payload.",
      status: "decode-failed",
      category: "invalid-base64",
      code: "invalid-base64",
    });
  }
  return decoded;
}

function extractBase64ImageFromBatchBody(
  body: z.infer<typeof openAiImageBatchResponseBodySchema>
): string | undefined {
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
  readonly episodeDir: string;
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
  const resolvedOutputPath = await resolveEpisodeContainedFilePath({
    episodeDir: args.episodeDir,
    relativePath: toEpisodeRelativeDisplayPath(args.episodeDir, args.outputPath),
  });
  const metadata = await sharp(args.imageBuffer).metadata().catch((error) => {
    throw new ImageBatchImportError({
      message:
        error instanceof Error
          ? error.message
          : "Decoded image could not be parsed.",
      status: "validation-failed",
      category: "corrupt-file",
      code: "corrupt-file",
    });
  });
  if (!metadata.width || !metadata.height) {
    throw new ImageBatchImportError({
      message: "Decoded image is missing dimensions.",
      status: "validation-failed",
      category: "invalid-dimensions",
      code: "missing-dimensions",
    });
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
    throw new ImageBatchImportError({
      message: `Unexpected image format for ${args.sceneId}: expected ${expectedMimeType}, received ${actualMimeType || "unknown"}.`,
      status: "validation-failed",
      category: "invalid-mime-type",
      code: "invalid-mime-type",
    });
  }
  const [requestedWidth, requestedHeight] = args.requestedSize.split("x").map((value) => Number.parseInt(value, 10));
  if (
    Number.isFinite(requestedWidth) &&
    Number.isFinite(requestedHeight) &&
    (requestedWidth !== metadata.width || requestedHeight !== metadata.height)
  ) {
    throw new ImageBatchImportError({
      message: `Unexpected image dimensions for ${args.sceneId}: expected ${requestedWidth}x${requestedHeight}, received ${metadata.width}x${metadata.height}.`,
      status: "validation-failed",
      category: "invalid-dimensions",
      code: "invalid-dimensions",
    });
  }
  if (await fileExists(resolvedOutputPath)) {
    const existingHash = await hashFile(resolvedOutputPath);
    const existingBytes = await fsp.stat(resolvedOutputPath);
    return {
      sha256: existingHash,
      width: metadata.width,
      height: metadata.height,
      mimeType: actualMimeType,
      byteSize: existingBytes.size,
    };
  }
  await writeBinaryAtomic(resolvedOutputPath, args.imageBuffer);
  return {
    sha256: await hashFile(resolvedOutputPath),
    width: metadata.width,
    height: metadata.height,
    mimeType: actualMimeType,
    byteSize: args.imageBuffer.byteLength,
  };
}

async function readSceneManifest(
  episodeDir: string,
  sceneId: string
): Promise<SceneGenerationManifest | undefined> {
  const manifestPath = fullSceneManifestPath(episodeDir, sceneId);
  return (
    (await readJsonIfExists(
      manifestPath,
      (value) =>
        sceneGenerationManifestSchema.parse(value) as SceneGenerationManifest
    )) ?? undefined
  );
}

async function writeSceneManifest(
  episodeDir: string,
  sceneId: string,
  manifest: SceneGenerationManifest
): Promise<string> {
  const manifestPath = fullSceneManifestPath(episodeDir, sceneId);
  await writeJsonAtomic(manifestPath, manifest);
  return manifestPath;
}

async function readShortsManifest(
  episodeDir: string
): Promise<ShortsSceneManifestEntry[]> {
  return (
    (await readJsonIfExists(
      shortsManifestPath(episodeDir),
      (value) =>
        z.array(shortsSceneManifestEntrySchema).parse(
          value
        ) as ShortsSceneManifestEntry[]
    )) ?? []
  );
}

async function writeShortsManifest(
  episodeDir: string,
  entries: readonly ShortsSceneManifestEntry[]
): Promise<string> {
  const manifestPath = shortsManifestPath(episodeDir);
  await writeJsonAtomic(
    manifestPath,
    [...entries].sort(
      (left, right) => left.sequenceNumber - right.sequenceNumber || left.sceneId.localeCompare(right.sceneId)
    )
  );
  return manifestPath;
}

async function upsertShortsManifestEntry(args: {
  readonly episodeDir: string;
  readonly item: ImageBatchManifest["items"][number];
  readonly outputPath: string;
  readonly outputSha256: string;
}): Promise<string> {
  const entries = await readShortsManifest(args.episodeDir);
  const nextEntry: ShortsSceneManifestEntry = {
    sceneId: args.item.sceneId ?? args.item.identity.subject.id,
    sequenceNumber: args.item.sceneIndex ?? 0,
    aspectRatio: "9:16",
    strategy: "regenerate",
    outputImagePath: args.outputPath,
    reusedExistingImage: false,
    regenerated: true,
    attemptCount: 1,
    status: "success",
    error: null,
    outputImageSha256: args.outputSha256,
    promptHash: args.item.identity.promptHash,
    generatedAt: new Date().toISOString(),
  };
  const retained = entries.filter((entry) => entry.sceneId !== nextEntry.sceneId);
  return writeShortsManifest(args.episodeDir, [...retained, nextEntry]);
}

async function updateCharacterReferenceRegistry(args: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly characterId: string;
  readonly outputPath: string;
}): Promise<string | undefined> {
  const registry = await loadEpisodeCharacterRegistry(args.episodeDir, args.episodeId);
  const characters: CharacterDefinition[] = registry.characters.map((character) =>
    character.id !== args.characterId
      ? character
      : {
          ...character,
          referenceImagePath: args.outputPath,
          referenceStatus:
            character.referenceStatus === "approved" ? "approved" : "generated",
        }
  );
  if (!characters.some((character) => character.id === args.characterId)) {
    return undefined;
  }
  await upsertCharacterRegistry(args.episodeDir, args.episodeId, characters);
  return resolveEpisodeCharacterRegistryPath(args.episodeDir);
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
  return ["api-failed", "expired", "decode-failed", "validation-failed", "retry-required"].includes(status);
}

function itemRetryable(item: ImageBatchManifest["items"][number]): boolean {
  if (!retryableImageItemStatus(item.status)) {
    return false;
  }
  const category = item.error?.category ?? "";
  return category !== "policy" && category !== "policy-rejection" && category !== "destination-conflict";
}

function itemOwnsProviderRequest(
  item: ImageBatchManifest["items"][number]
): boolean {
  return item.aliasedToCustomId === undefined;
}

async function resolveBatchManifestMatches(
  outputDirectory: string,
  batchRef: string
): Promise<readonly ResolvedImageBatchManifest[]> {
  const layout = await ensureImageBatchStorageLayout(outputDirectory);
  const files = await fsp.readdir(layout.manifestsDir).catch(() => []);
  const matches: ResolvedImageBatchManifest[] = [];
  for (const fileName of files.sort((left, right) => left.localeCompare(right))) {
    if (!fileName.startsWith("batch-") || !fileName.endsWith(".manifest.json")) {
      continue;
    }
    const manifestPath = path.join(layout.manifestsDir, fileName);
    const manifest = await readImageBatchManifest(manifestPath);
    if (!manifest) {
      continue;
    }
    if (manifest.localBatchId === batchRef) {
      matches.push({
        localBatchId: manifest.localBatchId,
        manifestPath,
        manifest,
        matchedBy: "localBatchId",
      });
    }
    if (manifest.openAIBatchId === batchRef) {
      matches.push({
        localBatchId: manifest.localBatchId,
        manifestPath,
        manifest,
        matchedBy: "openAIBatchId",
      });
    }
  }
  return matches;
}

export async function resolveImageBatchManifest(
  outputDirectory: string,
  batchRef: string
): Promise<ResolvedImageBatchManifest> {
  const matches = await resolveBatchManifestMatches(outputDirectory, batchRef);
  const uniqueMatches = [
    ...new Map(matches.map((match) => [match.localBatchId, match] as const)).values(),
  ];
  if (uniqueMatches.length === 0) {
    throw new Error(`Unknown image batch ${batchRef}.`);
  }
  if (uniqueMatches.length > 1) {
    throw new Error(
      `Ambiguous image batch reference ${batchRef}; matches ${uniqueMatches
        .map((match) => match.localBatchId)
        .sort((left, right) => left.localeCompare(right))
        .join(", ")}.`
    );
  }
  return uniqueMatches[0]!;
}

async function persistImportedSceneResult(args: {
  readonly episodeDir: string;
  readonly item: ImageBatchManifest["items"][number];
  readonly line: OpenAiBatchOutputLine;
}): Promise<{
  readonly manifestItem: ImageBatchManifest["items"][number];
  readonly imageFilePath: string;
  readonly auxiliaryManifestPath?: string;
}> {
  if (args.line.error) {
    throw new Error(args.line.error.message || `Batch item failed: ${args.item.customId}`);
  }
  const response = args.line.response;
  if (!response || response.status_code !== 200) {
    throw new Error(`Batch item did not return a successful response: ${args.item.customId}`);
  }
  const responseBody = openAiImageBatchResponseBodySchema.parse(response.body);
  const payload = extractBase64ImageFromBatchBody(responseBody);
  if (!payload) {
    throw new Error(`Batch item missing image payload: ${args.item.customId}`);
  }
  for (const dependency of args.item.dependencies) {
    if (!(await fileExists(dependency.sourcePath))) {
      throw new ImageBatchImportError({
        message: `Missing dependency source for ${args.item.customId}: ${dependency.sourcePath}.`,
        status: "validation-failed",
        category: "stale-dependency",
        code: "missing-dependency",
      });
    }
    const currentHash = await hashFile(dependency.sourcePath);
    if (currentHash !== dependency.sha256) {
      throw new ImageBatchImportError({
        message: `Stale dependency hash for ${args.item.customId}: ${dependency.sourcePath}.`,
        status: "validation-failed",
        category: "stale-dependency",
        code: "stale-dependency",
      });
    }
  }
  const imageBuffer = decodeBase64Image(payload);
  const canonicalOutputPath = await resolveCanonicalOutputPathForItem({
    episodeDir: args.episodeDir,
    item: args.item,
  });
  const persisted = await persistImportedImage({
    episodeDir: args.episodeDir,
    outputPath: canonicalOutputPath,
    sceneId: args.item.sceneId ?? args.item.identity.subject.id,
    imageBuffer,
    expectedFormat: args.item.outputFormat,
    requestedSize: args.item.requestedSize,
  });
  let auxiliaryManifestPath: string | undefined;
  if (args.item.identity.assetRole === "full-scene") {
    const sceneId = args.item.sceneId ?? args.item.identity.subject.id;
    const sceneManifest = await readSceneManifest(args.episodeDir, sceneId);
    if (!sceneManifest) {
      throw new Error(`Missing scene manifest for ${sceneId}.`);
    }
    const nextSceneManifest: SceneGenerationManifest = {
      ...sceneManifest,
      outputPath: canonicalOutputPath,
      status: "generated",
      outputSha256: persisted.sha256,
      generatedAt: new Date().toISOString(),
      attempts: Math.max(sceneManifest.attempts, 1),
    };
    auxiliaryManifestPath = await writeSceneManifest(
      args.episodeDir,
      sceneId,
      nextSceneManifest
    );
  } else if (args.item.identity.assetRole === "short-scene") {
    auxiliaryManifestPath = await upsertShortsManifestEntry({
      episodeDir: args.episodeDir,
      item: args.item,
      outputPath: canonicalOutputPath,
      outputSha256: persisted.sha256,
    });
  } else if (args.item.identity.assetRole === "character-reference") {
    auxiliaryManifestPath = await updateCharacterReferenceRegistry({
      episodeDir: args.episodeDir,
      episodeId: args.item.identity.episodeId,
      characterId: args.item.identity.subject.id,
      outputPath: canonicalOutputPath,
    });
  }
  const nextItem = imageBatchManifestItemSchema.parse({
    ...args.item,
    expectedOutputPath: canonicalOutputPath,
    status: "persisted",
    retryCount: args.item.retryCount,
    imageHash: persisted.sha256,
    actualWidth: persisted.width,
    actualHeight: persisted.height,
    actualMimeType: persisted.mimeType,
    actualByteSize: persisted.byteSize,
    ...(responseBody.id ? { outputFileId: responseBody.id } : {}),
    importedAt: new Date().toISOString(),
    ...(responseBody.usage
      ? {
          usage: {
            inputTokens: responseBody.usage.input_tokens ?? 0,
            ...(responseBody.usage.input_tokens_details?.cached_tokens !== undefined
              ? {
                  cachedInputTokens:
                    responseBody.usage.input_tokens_details.cached_tokens,
                }
              : {}),
            outputTokens: responseBody.usage.output_tokens ?? 0,
          },
        }
      : {}),
  }) as ImageBatchManifest["items"][number];
  return {
    manifestItem: nextItem,
    imageFilePath: canonicalOutputPath,
    ...(auxiliaryManifestPath ? { auxiliaryManifestPath } : {}),
  };
}

export async function submitImageBatch(
  outputDirectory: string,
  localBatchId: string,
  client: OpenAiStoryClient
): Promise<ImageBatchSubmissionResult> {
  requireBatchCapabilities(client);
  const layout = await ensureImageBatchStorageLayout(outputDirectory);
  const episodeDir = resolveEpisodeDir(outputDirectory);
  const resolved = await resolveImageBatchManifest(outputDirectory, localBatchId);
  const manifestPath = resolved.manifestPath;
  const manifest = resolved.manifest;
  if (manifest.status !== "prepared") {
    throw new Error(`Image batch ${localBatchId} is not in prepared state.`);
  }
  if (manifest.openAIBatchId || manifest.openAIInputFileId) {
    throw new Error(`Image batch ${localBatchId} was already submitted.`);
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
      resultFilePath: resolveEpisodeImageBatchResultPath(episodeDir, localBatchId),
      errorFilePath: resolveEpisodeImageBatchErrorPath(episodeDir, localBatchId),
      reportFilePath: resolveEpisodeImageBatchReportPath(episodeDir, localBatchId),
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
  const episodeDir = resolveEpisodeDir(outputDirectory);
  const index = new StoryBatchIndexService(outputDirectory);
  const resolved = await resolveImageBatchManifest(outputDirectory, batchRef);
  if (!resolved.manifest.openAIBatchId) {
    throw new Error(`Unable to resolve submitted image batch ${batchRef}.`);
  }
  const manifestPath = resolved.manifestPath;
  const manifest = resolved.manifest;
  const remote = await client.batches.retrieve(resolved.manifest.openAIBatchId);
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
      localBatchId: resolved.localBatchId,
      inputFilePath: manifest.inputFilePath,
      manifestPath,
      resultFilePath: resolveEpisodeImageBatchResultPath(episodeDir, resolved.localBatchId),
      errorFilePath: resolveEpisodeImageBatchErrorPath(episodeDir, resolved.localBatchId),
      reportFilePath: resolveEpisodeImageBatchReportPath(episodeDir, resolved.localBatchId),
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
  const episodeDir = resolveEpisodeDir(outputDirectory);
  const index = new StoryBatchIndexService(outputDirectory);
  const refreshed = await refreshImageBatch(outputDirectory, batchRef, client);
  if (!refreshed.openAIBatchId) {
    throw new Error(`Image batch ${batchRef} has not been submitted.`);
  }
  if (
    !["completed", "failed", "expired", "cancelled", "imported", "imported_with_failures"].includes(
      refreshed.status
    )
  ) {
    return {
      localBatchId: refreshed.localBatchId,
      importedItemCount: importedItemCount(refreshed),
      failedItemCount: failedItemCount(refreshed),
      persistedFiles: [],
      retryableItemCount: retryableItemCount(refreshed),
      unknownResultCount: 0,
      duplicateResultCount: 0,
      providerStatus: refreshed.status,
      status: "non_terminal",
    };
  }
  const outputText = refreshed.outputFileId
    ? await readRemoteFileText(client, refreshed.outputFileId)
    : "";
  const errorText = refreshed.errorFileId
    ? await readRemoteFileText(client, refreshed.errorFileId)
    : "";
  const resultFilePath = resolveEpisodeImageBatchResultPath(
    episodeDir,
    refreshed.localBatchId
  );
  const errorFilePath = resolveEpisodeImageBatchErrorPath(
    episodeDir,
    refreshed.localBatchId
  );
  const reportFilePath = resolveEpisodeImageBatchReportPath(
    episodeDir,
    refreshed.localBatchId
  );
  if (outputText) {
    await writeTextAtomic(resultFilePath, outputText);
  }
  if (errorText) {
    await writeTextAtomic(errorFilePath, errorText);
  }
  const linesByCustomId = new Map<string, OpenAiBatchOutputLine[]>();
  const providerOwnedItems = refreshed.items.filter((item) =>
    itemOwnsProviderRequest(item)
  );
  const knownIds = new Set(providerOwnedItems.map((item) => item.customId));
  const unknownCustomIds = new Set<string>();
  const duplicateCustomIds = new Set<string>();
  for (const line of [
    ...parseBatchOutputJsonl(outputText),
    ...parseBatchOutputJsonl(errorText),
  ]) {
    const parsedLine = openAiImageBatchOutputLineSchema.parse(
      line
    ) as OpenAiBatchOutputLine;
    if (!knownIds.has(parsedLine.custom_id)) {
      unknownCustomIds.add(parsedLine.custom_id);
      continue;
    }
    const existing = linesByCustomId.get(parsedLine.custom_id) ?? [];
    existing.push(parsedLine);
    linesByCustomId.set(parsedLine.custom_id, existing);
    if (existing.length > 1) {
      duplicateCustomIds.add(line.custom_id);
    }
  }
  const nextItemsByCustomId = new Map<
    string,
    ImageBatchManifest["items"][number]
  >();
  const persistedFiles: string[] = [];
  for (const item of providerOwnedItems) {
    const itemLines = linesByCustomId.get(item.customId) ?? [];
    if (itemLines.length === 0) {
      if (item.status === "persisted" && (await fileExists(item.expectedOutputPath))) {
        nextItemsByCustomId.set(item.customId, item);
        continue;
      }
      const missingCategory =
        refreshed.status === "expired"
          ? "expired-batch"
          : refreshed.status === "cancelled"
            ? "cancelled-batch"
            : "missing-result";
      nextItemsByCustomId.set(item.customId, {
        ...item,
        status: "retry-required",
        retryCount: item.retryCount,
        error: {
          category: missingCategory,
          message: `Missing image batch output for ${item.customId}.`,
        },
      });
      continue;
    }
    if (itemLines.length > 1) {
      nextItemsByCustomId.set(item.customId, {
        ...item,
        status: "validation-failed",
        retryCount: item.retryCount,
        error: {
          category: "duplicate-id",
          message: `Duplicate image batch result lines were returned for ${item.customId}.`,
          code: "duplicate-id",
        },
      });
      continue;
    }
    const line = itemLines[0]!;
    try {
      if (item.status === "persisted" && (await fileExists(item.expectedOutputPath))) {
        nextItemsByCustomId.set(item.customId, item);
        continue;
      }
      const canonicalOutputPath = await resolveCanonicalOutputPathForItem({
        episodeDir,
        item,
      });
      if ((await fileExists(canonicalOutputPath)) && item.status !== "persisted") {
        throw new ImageBatchImportError({
          message: `Destination conflict for ${item.customId}: ${toEpisodeRelativeDisplayPath(
            episodeDir,
            canonicalOutputPath
          )} already exists.`,
          status: "validation-failed",
          category: "destination-conflict",
          code: "destination-conflict",
        });
      }
      const persisted = await persistImportedSceneResult({
        episodeDir,
        item,
        line,
      });
      persistedFiles.push(
        persisted.imageFilePath,
        ...(persisted.auxiliaryManifestPath ? [persisted.auxiliaryManifestPath] : [])
      );
      nextItemsByCustomId.set(item.customId, persisted.manifestItem);
    } catch (error) {
      const lineFailureStatus = line.error ? classifyBatchFailure(line) : "validation-failed";
      const importError = asImportError(error, {
        status: lineFailureStatus,
        category:
          lineFailureStatus === "policy-rejected"
            ? "policy"
            : lineFailureStatus === "expired"
              ? "expired-batch"
              : line.error
                ? "api-failure"
                : "validation",
      });
      nextItemsByCustomId.set(item.customId, {
        ...item,
        status: importError.status,
        retryCount: item.retryCount,
        error: {
          category: importError.category,
          ...(importError.code ? { code: importError.code } : {}),
          message: importError.message,
        },
      });
    }
  }
  for (const item of refreshed.items.filter((candidate) => !itemOwnsProviderRequest(candidate))) {
    const owner = item.aliasedToCustomId
      ? nextItemsByCustomId.get(item.aliasedToCustomId)
      : undefined;
    if (!owner) {
      nextItemsByCustomId.set(item.customId, {
        ...item,
        status: "validation-failed",
        error: {
          category: "shared-output-alias",
          code: "missing-shared-output-owner",
          message: `Shared output owner ${item.aliasedToCustomId ?? "unknown"} was not found for ${item.customId}.`,
        },
      });
      continue;
    }
    nextItemsByCustomId.set(item.customId, imageBatchManifestItemSchema.parse({
      ...item,
      status: owner.status,
      retryCount: item.retryCount,
      imageHash: owner.imageHash,
      actualWidth: owner.actualWidth,
      actualHeight: owner.actualHeight,
      actualMimeType: owner.actualMimeType,
      actualByteSize: owner.actualByteSize,
      outputFileId: owner.outputFileId,
      importedAt: owner.importedAt,
      usage: owner.usage,
      estimatedCostUsd: owner.estimatedCostUsd,
      error: owner.error,
    }) as ImageBatchManifest["items"][number]);
  }
  const nextItems = refreshed.items.map((item) => {
    const nextItem = nextItemsByCustomId.get(item.customId);
    if (!nextItem) {
      throw new Error(`Missing next image batch state for ${item.customId}.`);
    }
    return nextItem;
  });
  const importedStatus =
    nextItems.some((item) => item.status !== "persisted" && item.status !== "skipped-cached") ||
    unknownCustomIds.size > 0 ||
    duplicateCustomIds.size > 0
      ? "imported_with_failures"
      : "imported";
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
  const nextFailedItemCount = failedItemCount(nextManifest);
  const nextRetryableItemCount = retryableItemCount(nextManifest);
  await writeImageBatchManifest(
    {
      outputDirectory,
      layout,
      localBatchId: refreshed.localBatchId,
      inputFilePath: refreshed.inputFilePath,
      manifestPath: resolveEpisodeImageBatchManifestFilePath(
        episodeDir,
        refreshed.localBatchId
      ),
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
    failedItemCount: nextFailedItemCount,
    retryableItemCount: nextRetryableItemCount,
    unknownResultCount: unknownCustomIds.size,
    duplicateResultCount: duplicateCustomIds.size,
    persistedFiles,
    unknownCustomIds: [...unknownCustomIds].sort((left, right) => left.localeCompare(right)),
    duplicateCustomIds: [...duplicateCustomIds].sort((left, right) => left.localeCompare(right)),
    status: importedStatus,
  });
  await index.upsert(toIndexEntry({ layout, manifest: nextManifest }));
  return {
    localBatchId: refreshed.localBatchId,
    importedItemCount: importedItemCount(nextManifest),
    failedItemCount: nextFailedItemCount,
    persistedFiles,
    retryableItemCount: nextRetryableItemCount,
    unknownResultCount: unknownCustomIds.size,
    duplicateResultCount: duplicateCustomIds.size,
    providerStatus: refreshed.status,
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
  const resolved = await resolveImageBatchManifest(outputDirectory, batchRef);
  const manifest = resolved.manifest;
  const lineageManifests = (
    await Promise.all(
      (await fsp.readdir(layout.manifestsDir).catch(() => []))
        .filter((fileName) => fileName.startsWith("batch-") && fileName.endsWith(".manifest.json"))
        .map(async (fileName) =>
          readImageBatchManifest(path.join(layout.manifestsDir, fileName))
        )
    )
  ).filter(
    (candidate): candidate is ImageBatchManifest =>
      candidate !== undefined && candidate.rootLocalBatchId === manifest.rootLocalBatchId
  );
  const latestItemState = new Map<string, ImageBatchManifest["items"][number]>();
  for (const lineageManifest of lineageManifests.sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
  )) {
    for (const item of lineageManifest.items) {
      latestItemState.set(item.customId, item);
    }
  }
  const retryableItems = manifest.items.filter((item) => {
    const latest = latestItemState.get(item.customId) ?? item;
    if (latest.status === "persisted" || latest.status === "skipped-cached") {
      return false;
    }
    if (!itemOwnsProviderRequest(latest)) {
      return false;
    }
    return itemRetryable(latest);
  });
  if (retryableItems.length === 0) {
    throw new Error(`Image batch ${resolved.localBatchId} has no retryable items.`);
  }
  const retryableSceneIds = [
    ...new Set(
      retryableItems
        .map((item) => item.sceneId)
        .filter((item): item is string => item !== undefined)
    ),
  ];
  const retryableSceneIndex = new Map(
    retryableItems
      .filter(
        (
          item
        ): item is (typeof retryableItems)[number] & { readonly sceneId: string } =>
          item.sceneId !== undefined
      )
      .map((item) => [item.sceneId, item.sceneIndex ?? 0])
  );
  const episodeSlug =
    retryableItems[0]?.identity.episodeId ?? manifest.items[0]?.identity.episodeId;
  if (!episodeSlug) {
    throw new Error(`Unable to resolve episode slug for ${resolved.localBatchId}.`);
  }
  const referenceItem = retryableItems[0] ?? manifest.items[0];
  if (!referenceItem) {
    throw new Error(`Unable to resolve retry settings for ${resolved.localBatchId}.`);
  }
  const requestedSize = referenceItem.requestedSize;
  const quality = normalizeImageBatchQuality(referenceItem.quality);
  const outputFormat = referenceItem.outputFormat;
  const episodeDir = resolveEpisodeDir(outputDirectory);
  const languages = [
    ...new Set(manifest.items.map((item) => item.identity.language)),
  ].sort((left, right) => left.localeCompare(right));
  const prepared =
    referenceItem.identity.variant === "short"
      ? await prepareShortSceneImageBatches({
          episodeDir,
          episodeId: episodeSlug,
          languages,
          variant: "short",
          settings: {
            model: manifest.model,
            requestedSize,
            quality,
            outputFormat,
          },
          sceneIds: retryableSceneIds,
        })
      : await prepareFullSceneImageBatches({
          episodeDir,
          episodeId: episodeSlug,
          languages,
          variant: "full",
          settings: {
            model: manifest.model,
            requestedSize,
            quality,
            outputFormat,
          },
          sceneIds: retryableSceneIds,
          includeReferenceGroups: false,
        });
  const group = prepared.groups[0];
  if (!group) {
    throw new Error(`Failed to prepare retry batch for ${resolved.localBatchId}.`);
  }
  const preparedManifest = await readImageBatchManifest(
    group.storagePlan.manifestPath
  );
  if (!preparedManifest) {
    throw new Error(`Missing prepared retry manifest for ${resolved.localBatchId}.`);
  }
  const nextManifest = imageBatchManifestSchema.parse({
    ...preparedManifest,
    rootLocalBatchId: manifest.rootLocalBatchId,
    parentLocalBatchId: manifest.localBatchId,
    retryNumber: manifest.retryNumber + 1,
    updatedAt: new Date().toISOString(),
    items: preparedManifest.items.map((item) => ({
      ...item,
      retryCount: (latestItemState.get(item.customId)?.retryCount ?? 0) + 1,
    })),
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
