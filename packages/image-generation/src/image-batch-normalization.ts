import {
  assertOperationMatchesEndpoint,
  buildImageBatchCustomId,
  createImageBatchAssetIdentity,
  deriveImageBatchDestinationIdentity,
  endpointForImageBatchOperation,
  normalizeImageBatchDestinationPath,
  rebuildImageBatchAssetIdentity,
} from "./image-batch-identity.js";
import {
  imageBatchManifestSchema,
  legacyImageBatchManifestV1Schema,
} from "./image-batch.schemas.js";
import type {
  ImageBatchAssetIdentity,
  ImageBatchManifest,
  ImageBatchManifestItem,
  ImageBatchOperation,
} from "./image-batch.types.js";

type LegacyImageBatchManifestV1 = ReturnType<
  typeof legacyImageBatchManifestV1Schema.parse
>;
type ParsedImageBatchManifestV2 = ReturnType<typeof imageBatchManifestSchema.parse>;

function normalizeBatchOperation(
  endpoint: "/v1/images/generations" | "/v1/images/edits"
): Extract<ImageBatchOperation, "generation" | "edit"> {
  return endpoint === "/v1/images/edits" ? "edit" : "generation";
}

function normalizeV2Identity(
  identity: ParsedImageBatchManifestV2["items"][number]["identity"]
): ImageBatchAssetIdentity {
  const {
    identityHash: _identityHash,
    ...rest
  } = identity;
  return rebuildImageBatchAssetIdentity(rest);
}

function normalizeV2Item(
  item: ParsedImageBatchManifestV2["items"][number]
): ImageBatchManifest["items"][number] {
  const identity = normalizeV2Identity(item.identity);
  return {
    customId: buildImageBatchCustomId(identity),
    identity,
    ...(item.sceneId ? { sceneId: item.sceneId } : {}),
    ...(item.sceneIndex !== undefined ? { sceneIndex: item.sceneIndex } : {}),
    ...(item.renderability ? { renderability: item.renderability } : {}),
    ...(item.reusedFromSceneId
      ? { reusedFromSceneId: item.reusedFromSceneId }
      : {}),
    providerRequestHash: item.providerRequestHash,
    generationConfigurationHash: item.generationConfigurationHash,
    expectedOutputPath: item.expectedOutputPath,
    characterIds: item.characterIds,
    requestedSize: identity.size,
    quality: identity.quality,
    outputFormat: item.outputFormat,
    status: item.status,
    ...(item.imageHash ? { imageHash: item.imageHash } : {}),
    ...(item.actualWidth !== undefined ? { actualWidth: item.actualWidth } : {}),
    ...(item.actualHeight !== undefined ? { actualHeight: item.actualHeight } : {}),
    ...(item.actualMimeType ? { actualMimeType: item.actualMimeType } : {}),
    ...(item.actualByteSize !== undefined
      ? { actualByteSize: item.actualByteSize }
      : {}),
    ...(item.usage
      ? {
          usage: {
            inputTokens: item.usage.inputTokens,
            outputTokens: item.usage.outputTokens,
            ...(item.usage.cachedInputTokens !== undefined
              ? { cachedInputTokens: item.usage.cachedInputTokens }
              : {}),
          },
        }
      : {}),
    ...(item.estimatedCostUsd !== undefined
      ? { estimatedCostUsd: item.estimatedCostUsd }
      : {}),
    ...(item.error
      ? {
          error: {
            category: item.error.category,
            message: item.error.message,
            ...(item.error.code ? { code: item.error.code } : {}),
          },
        }
      : {}),
  };
}

function normalizeLegacyItem(args: {
  readonly endpoint: "/v1/images/generations" | "/v1/images/edits";
  readonly model: string;
  readonly item: LegacyImageBatchManifestV1["items"][number];
}): ImageBatchManifestItem {
  const operation = normalizeBatchOperation(args.endpoint);
  const identity = createImageBatchAssetIdentity({
    episodeId: args.item.episodeSlug,
    language: args.item.language,
    variant: args.item.format,
    assetRole: "full-scene",
    operation,
    subject: { kind: "scene", id: args.item.sceneId },
    promptHash: args.item.promptHash,
    model: args.model,
    size: args.item.requestedSize,
    quality:
      args.item.quality === "low" ||
      args.item.quality === "medium" ||
      args.item.quality === "high" ||
      args.item.quality === "auto"
        ? args.item.quality
        : "medium",
    dependencyHashes: args.item.characterReferenceHashes,
    destination: deriveImageBatchDestinationIdentity({
      assetRole: "full-scene",
      outputPath: args.item.expectedOutputPath,
    }),
  });
  return {
    customId: buildImageBatchCustomId(identity),
    identity,
    sceneId: args.item.sceneId,
    sceneIndex: args.item.sceneIndex,
    ...(args.item.renderability ? { renderability: args.item.renderability } : {}),
    ...(args.item.reusedFromSceneId
      ? { reusedFromSceneId: args.item.reusedFromSceneId }
      : {}),
    providerRequestHash: args.item.providerRequestHash,
    generationConfigurationHash: args.item.generationConfigurationHash,
    expectedOutputPath: args.item.expectedOutputPath,
    characterIds: args.item.characterIds,
    requestedSize: identity.size,
    quality: identity.quality,
    outputFormat: args.item.outputFormat,
    status: args.item.status,
    ...(args.item.imageHash ? { imageHash: args.item.imageHash } : {}),
    ...(args.item.actualWidth ? { actualWidth: args.item.actualWidth } : {}),
    ...(args.item.actualHeight ? { actualHeight: args.item.actualHeight } : {}),
    ...(args.item.actualMimeType
      ? { actualMimeType: args.item.actualMimeType }
      : {}),
    ...(args.item.actualByteSize
      ? { actualByteSize: args.item.actualByteSize }
      : {}),
    ...(args.item.usage
      ? {
          usage: {
            inputTokens: args.item.usage.inputTokens,
            outputTokens: args.item.usage.outputTokens,
            ...(args.item.usage.cachedInputTokens !== undefined
              ? { cachedInputTokens: args.item.usage.cachedInputTokens }
              : {}),
          },
        }
      : {}),
    ...(args.item.estimatedCostUsd !== undefined
      ? { estimatedCostUsd: args.item.estimatedCostUsd }
      : {}),
    ...(args.item.error
      ? {
          error: {
            category: args.item.error.category,
            message: args.item.error.message,
            ...(args.item.error.code ? { code: args.item.error.code } : {}),
          },
        }
      : {}),
  };
}

function validateNormalizedManifest(manifest: ImageBatchManifest): ImageBatchManifest {
  const identityHashes = new Set<string>();
  const customIds = new Set<string>();
  const destinationPaths = new Set<string>();
  for (const item of manifest.items) {
    assertOperationMatchesEndpoint({
      operation: item.identity.operation,
      endpoint: manifest.endpoint,
    });
    if (endpointForImageBatchOperation(item.identity.operation) === null) {
      throw new Error(
        `Image batch item ${item.customId} uses unsupported deterministic transform operation.`
      );
    }
    if (identityHashes.has(item.identity.identityHash)) {
      throw new Error(
        `Duplicate image batch identity detected for ${item.identity.subject.kind}:${item.identity.subject.id}.`
      );
    }
    identityHashes.add(item.identity.identityHash);
    if (customIds.has(item.customId)) {
      throw new Error(`Duplicate image batch custom_id detected: ${item.customId}.`);
    }
    customIds.add(item.customId);
    const normalizedDestinationPath = normalizeImageBatchDestinationPath(
      item.expectedOutputPath
    );
    if (destinationPaths.has(normalizedDestinationPath)) {
      throw new Error(
        `Duplicate image batch destination path detected: ${item.expectedOutputPath}.`
      );
    }
    destinationPaths.add(normalizedDestinationPath);
  }
  return manifest;
}

export function normalizeImageBatchManifest(raw: unknown): ImageBatchManifest {
  const parsedV2 = imageBatchManifestSchema.safeParse(raw);
  if (parsedV2.success) {
    const manifest = parsedV2.data;
    return validateNormalizedManifest({
      schemaVersion: "image-batch-v2",
      category: manifest.category,
      localBatchId: manifest.localBatchId,
      rootLocalBatchId: manifest.rootLocalBatchId,
      ...(manifest.parentLocalBatchId
        ? { parentLocalBatchId: manifest.parentLocalBatchId }
        : {}),
      retryNumber: manifest.retryNumber,
      createdAt: manifest.createdAt,
      updatedAt: manifest.updatedAt,
      endpoint: manifest.endpoint,
      model: manifest.model,
      completionWindow: manifest.completionWindow,
      inputFilePath: manifest.inputFilePath,
      inputFileHash: manifest.inputFileHash,
      ...(manifest.openAIInputFileId
        ? { openAIInputFileId: manifest.openAIInputFileId }
        : {}),
      ...(manifest.openAIBatchId ? { openAIBatchId: manifest.openAIBatchId } : {}),
      ...(manifest.outputFileId ? { outputFileId: manifest.outputFileId } : {}),
      ...(manifest.errorFileId ? { errorFileId: manifest.errorFileId } : {}),
      status: manifest.status,
      items: manifest.items.map((item) => normalizeV2Item(item)),
      ...(manifest.resultFilePath ? { resultFilePath: manifest.resultFilePath } : {}),
      ...(manifest.errorFilePath ? { errorFilePath: manifest.errorFilePath } : {}),
      ...(manifest.reportFilePath ? { reportFilePath: manifest.reportFilePath } : {}),
      ...(manifest.submittedAt ? { submittedAt: manifest.submittedAt } : {}),
      ...(manifest.completedAt ? { completedAt: manifest.completedAt } : {}),
      ...(manifest.importedAt ? { importedAt: manifest.importedAt } : {}),
    });
  }
  const legacy = legacyImageBatchManifestV1Schema.parse(raw);
  return validateNormalizedManifest({
    schemaVersion: "image-batch-v2",
    category: legacy.category,
    localBatchId: legacy.localBatchId,
    rootLocalBatchId: legacy.rootLocalBatchId,
    ...(legacy.parentLocalBatchId
      ? { parentLocalBatchId: legacy.parentLocalBatchId }
      : {}),
    retryNumber: legacy.retryNumber,
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt,
    endpoint: legacy.endpoint,
    model: legacy.model,
    completionWindow: legacy.completionWindow,
    inputFilePath: legacy.inputFilePath,
    inputFileHash: legacy.inputFileHash,
    ...(legacy.openAIInputFileId
      ? { openAIInputFileId: legacy.openAIInputFileId }
      : {}),
    ...(legacy.openAIBatchId ? { openAIBatchId: legacy.openAIBatchId } : {}),
    ...(legacy.outputFileId ? { outputFileId: legacy.outputFileId } : {}),
    ...(legacy.errorFileId ? { errorFileId: legacy.errorFileId } : {}),
    status: legacy.status,
    items: legacy.items.map((item) =>
      normalizeLegacyItem({
        endpoint: legacy.endpoint,
        model: legacy.model,
        item,
      })
    ),
    ...(legacy.resultFilePath ? { resultFilePath: legacy.resultFilePath } : {}),
    ...(legacy.errorFilePath ? { errorFilePath: legacy.errorFilePath } : {}),
    ...(legacy.reportFilePath ? { reportFilePath: legacy.reportFilePath } : {}),
    ...(legacy.submittedAt ? { submittedAt: legacy.submittedAt } : {}),
    ...(legacy.completedAt ? { completedAt: legacy.completedAt } : {}),
    ...(legacy.importedAt ? { importedAt: legacy.importedAt } : {}),
  });
}
