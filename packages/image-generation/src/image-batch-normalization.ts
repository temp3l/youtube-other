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
  legacyImageBatchAssetIdentityV1Schema,
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
type LegacyImageBatchAssetIdentityV1 = ReturnType<
  typeof legacyImageBatchAssetIdentityV1Schema.parse
>;

function normalizeBatchOperation(
  endpoint: "/v1/images/generations" | "/v1/images/edits"
): Extract<ImageBatchOperation, "generation" | "edit"> {
  return endpoint === "/v1/images/edits" ? "edit" : "generation";
}

function normalizeV2Identity(
  identity: Extract<
    ParsedImageBatchManifestV2["items"][number]["identity"],
    { schemaVersion: "image-asset-identity-v2" }
  >
): ImageBatchAssetIdentity {
  return createImageBatchAssetIdentity({
    episodeId: identity.episodeId,
    language: identity.language,
    variant: identity.variant,
    aspectRatio: identity.aspectRatio,
    assetRole: identity.assetRole,
    assetPurpose: identity.assetPurpose,
    operation: identity.operation,
    subject: identity.subject,
    storyBeatId: identity.storyBeatId,
    ...(identity.shotId ? { shotId: identity.shotId } : {}),
    visualIntentHash: identity.visualIntentHash,
    promptHash: identity.promptHash,
    dependencySourceHash: identity.dependencySourceHash,
    sourceLanguage: identity.sourceLanguage,
    targetLanguage: identity.targetLanguage,
    configurationHash: identity.configurationHash,
    model: identity.model,
    size: identity.size,
    quality: identity.quality,
    dependencyHashes: identity.dependencyHashes,
    destination: identity.destination,
  });
}

function normalizeLegacyAssetIdentityV1(
  identity: LegacyImageBatchAssetIdentityV1
): ImageBatchAssetIdentity {
  return createImageBatchAssetIdentity({
    episodeId: identity.episodeId,
    language: identity.language,
    variant: identity.variant,
    assetRole: identity.assetRole,
    assetPurpose: identity.assetRole,
    operation: identity.operation,
    subject: identity.subject,
    storyBeatId: identity.subject.id,
    visualIntentHash: identity.promptHash,
    promptHash: identity.promptHash,
    dependencyHashes: identity.dependencyHashes,
    sourceLanguage: "en",
    targetLanguage: identity.language,
    model: identity.model,
    size: identity.size,
    quality: identity.quality,
    destination: identity.destination,
  });
}

function normalizeCompatibleIdentity(
  identity: ParsedImageBatchManifestV2["items"][number]["identity"]
): ImageBatchAssetIdentity {
  if (identity.schemaVersion === "image-asset-identity-v1") {
    return normalizeLegacyAssetIdentityV1(identity);
  }
  return normalizeV2Identity(identity);
}

function normalizeV2Item(
  item: ParsedImageBatchManifestV2["items"][number]
): ImageBatchManifest["items"][number] {
  const identity = normalizeCompatibleIdentity(item.identity);
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
    dependencies: item.dependencies.map((dependency) => ({
      role: dependency.role,
      approvalStatus: dependency.approvalStatus,
      sourcePath: dependency.sourcePath,
      ...(dependency.openAIFileId
        ? { openAIFileId: dependency.openAIFileId }
        : {}),
      sha256: dependency.sha256,
      assetIdentity: normalizeCompatibleIdentity(dependency.assetIdentity),
    })),
    ...(item.sharedOutputKey
      ? { sharedOutputKey: item.sharedOutputKey }
      : {}),
    ...(item.ownsSharedOutput !== undefined
      ? { ownsSharedOutput: item.ownsSharedOutput }
      : {}),
    ...(item.aliasedToCustomId
      ? { aliasedToCustomId: item.aliasedToCustomId }
      : {}),
    requestedSize: identity.size,
    quality: identity.quality,
    outputFormat: item.outputFormat,
    status: item.status,
    retryCount: item.retryCount,
    ...(item.imageHash ? { imageHash: item.imageHash } : {}),
    ...(item.actualWidth !== undefined ? { actualWidth: item.actualWidth } : {}),
    ...(item.actualHeight !== undefined ? { actualHeight: item.actualHeight } : {}),
    ...(item.actualMimeType ? { actualMimeType: item.actualMimeType } : {}),
    ...(item.actualByteSize !== undefined
      ? { actualByteSize: item.actualByteSize }
      : {}),
    ...(item.outputFileId ? { outputFileId: item.outputFileId } : {}),
    ...(item.importedAt ? { importedAt: item.importedAt } : {}),
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
    dependencies: [],
    requestedSize: identity.size,
    quality: identity.quality,
    outputFormat: args.item.outputFormat,
    status: args.item.status,
    retryCount: args.item.retryCount ?? 0,
    ...(args.item.imageHash ? { imageHash: args.item.imageHash } : {}),
    ...(args.item.actualWidth ? { actualWidth: args.item.actualWidth } : {}),
    ...(args.item.actualHeight ? { actualHeight: args.item.actualHeight } : {}),
    ...(args.item.actualMimeType
      ? { actualMimeType: args.item.actualMimeType }
      : {}),
    ...(args.item.actualByteSize
      ? { actualByteSize: args.item.actualByteSize }
      : {}),
    ...(args.item.outputFileId ? { outputFileId: args.item.outputFileId } : {}),
    ...(args.item.importedAt ? { importedAt: args.item.importedAt } : {}),
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
  const destinationPaths = new Map<
    string,
    Array<ImageBatchManifest["items"][number]>
  >();
  const sharedOutputGroups = new Map<
    string,
    Array<ImageBatchManifest["items"][number]>
  >();
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
    const hasExistingDestinationPath =
      destinationPaths.has(normalizedDestinationPath);
    const existingAtDestination =
      destinationPaths.get(normalizedDestinationPath) ?? [];
    if (
      hasExistingDestinationPath &&
      !(
        item.sharedOutputKey &&
        existingAtDestination.every(
          (existing) => existing.sharedOutputKey === item.sharedOutputKey
        )
      )
    ) {
      throw new Error(
        `Duplicate image batch destination path detected: ${item.expectedOutputPath}.`
      );
    }
    existingAtDestination.push(item);
    destinationPaths.set(normalizedDestinationPath, existingAtDestination);
    if (item.sharedOutputKey) {
      const existingSharedOutputItems =
        sharedOutputGroups.get(item.sharedOutputKey) ?? [];
      existingSharedOutputItems.push(item);
      sharedOutputGroups.set(item.sharedOutputKey, existingSharedOutputItems);
    }
  }
  for (const [sharedOutputKey, items] of sharedOutputGroups) {
    const owners = items.filter((item) => item.ownsSharedOutput === true);
    if (owners.length !== 1) {
      throw new Error(
        `Shared output group ${sharedOutputKey} must contain exactly one owner item.`
      );
    }
    const owner = owners[0]!;
    const destinationPath = normalizeImageBatchDestinationPath(
      owner.expectedOutputPath
    );
    for (const item of items) {
      if (
        normalizeImageBatchDestinationPath(item.expectedOutputPath) !==
        destinationPath
      ) {
        throw new Error(
          `Shared output group ${sharedOutputKey} contains inconsistent destination paths.`
        );
      }
      if (item.customId === owner.customId) {
        if (item.aliasedToCustomId !== undefined) {
          throw new Error(
            `Shared output owner ${owner.customId} must not alias another item.`
          );
        }
        continue;
      }
      if (item.ownsSharedOutput !== false) {
        throw new Error(
          `Shared output follower ${item.customId} must set ownsSharedOutput=false.`
        );
      }
      if (item.aliasedToCustomId !== owner.customId) {
        throw new Error(
          `Shared output follower ${item.customId} must alias ${owner.customId}.`
        );
      }
    }
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
