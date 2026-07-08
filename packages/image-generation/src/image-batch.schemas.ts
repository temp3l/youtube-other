import { z } from "zod";
import { contentVariants, localeCodes } from "@mediaforge/shared";

const imageBatchQualitySchema = z.enum(["low", "medium", "high", "auto"]);

const imageBatchAssetRoleSchema = z.enum([
  "full-scene",
  "short-scene",
  "character-reference",
  "location-reference",
  "object-reference",
  "continuity-asset",
  "thumbnail",
]);

const imageBatchOperationSchema = z.enum([
  "generation",
  "edit",
  "deterministic-transform",
]);

const imageBatchDependencyRoleSchema = z.enum([
  "character-reference",
  "location-reference",
  "object-reference",
  "continuity-asset",
]);

const imageBatchDependencyApprovalStatusSchema = z.enum([
  "missing",
  "generated",
  "approved",
]);

const imageBatchDestinationRootSchema = z.enum([
  "shared-images-generated",
  "shared-short-images-generated",
  "shared-character-references",
  "shared-location-references",
  "shared-object-references",
  "shared-continuity-assets",
  "locale-thumbnails",
]);

const imageBatchSubjectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("scene"), id: z.string().min(1) }),
  z.object({ kind: z.literal("shot"), id: z.string().min(1) }),
  z.object({ kind: z.literal("character"), id: z.string().min(1) }),
  z.object({ kind: z.literal("location"), id: z.string().min(1) }),
  z.object({ kind: z.literal("object"), id: z.string().min(1) }),
  z.object({ kind: z.literal("continuity"), id: z.string().min(1) }),
  z.object({ kind: z.literal("thumbnail"), id: z.string().min(1) }),
]);

export const imageBatchDestinationIdentitySchema = z.object({
  root: imageBatchDestinationRootSchema,
  relativePath: z.string().min(1),
});

export const imageBatchAssetIdentitySchema = z.object({
  schemaVersion: z.literal("image-asset-identity-v1"),
  episodeId: z.string().min(1),
  language: z.enum(localeCodes),
  variant: z.enum(contentVariants),
  assetRole: imageBatchAssetRoleSchema,
  operation: imageBatchOperationSchema,
  subject: imageBatchSubjectSchema,
  promptHash: z.string().min(1),
  model: z.string().min(1),
  size: z.string().min(1),
  quality: imageBatchQualitySchema,
  dependencyHashes: z.array(z.string().min(1)),
  destination: imageBatchDestinationIdentitySchema,
  identityHash: z.string().min(1),
});

export const imageBatchDependencySchema = z.object({
  role: imageBatchDependencyRoleSchema,
  approvalStatus: imageBatchDependencyApprovalStatusSchema,
  sourcePath: z.string().min(1),
  openAIFileId: z.string().min(1).optional(),
  sha256: z.string().min(1),
  assetIdentity: imageBatchAssetIdentitySchema,
});

export const imageBatchManifestItemSchema = z.object({
  customId: z.string().min(1),
  identity: imageBatchAssetIdentitySchema,
  sceneId: z.string().min(1).optional(),
  sceneIndex: z.number().int().nonnegative().optional(),
  renderability: z
    .enum([
      "direct",
      "requiresInference",
      "mergeWithPrevious",
      "mergeWithNext",
      "skip",
    ])
    .optional(),
  reusedFromSceneId: z.string().min(1).optional(),
  providerRequestHash: z.string().min(1),
  generationConfigurationHash: z.string().min(1),
  expectedOutputPath: z.string().min(1),
  characterIds: z.array(z.string().min(1)),
  dependencies: z.array(imageBatchDependencySchema).default([]),
  sharedOutputKey: z.string().min(1).optional(),
  ownsSharedOutput: z.boolean().optional(),
  aliasedToCustomId: z.string().min(1).optional(),
  requestedSize: z.string().min(1),
  quality: imageBatchQualitySchema.optional(),
  outputFormat: z.enum(["png", "jpeg", "webp"]),
  status: z.enum([
    "planned",
    "submitted",
    "api-succeeded",
    "api-failed",
    "expired",
    "policy-rejected",
    "decode-failed",
    "validation-failed",
    "persisted",
    "skipped-cached",
    "retry-required",
  ]),
  retryCount: z.number().int().nonnegative().default(0),
  imageHash: z.string().min(1).optional(),
  actualWidth: z.number().int().positive().optional(),
  actualHeight: z.number().int().positive().optional(),
  actualMimeType: z.string().min(1).optional(),
  actualByteSize: z.number().int().nonnegative().optional(),
  outputFileId: z.string().min(1).optional(),
  importedAt: z.string().min(1).optional(),
  usage: z
    .object({
      inputTokens: z.number().int().nonnegative(),
      cachedInputTokens: z.number().int().nonnegative().optional(),
      outputTokens: z.number().int().nonnegative(),
    })
    .optional(),
  estimatedCostUsd: z.number().nonnegative().optional(),
  error: z
    .object({
      category: z.string().min(1),
      code: z.string().min(1).optional(),
      message: z.string().min(1),
    })
    .optional(),
});

export const imageBatchManifestSchema = z.object({
  schemaVersion: z.literal("image-batch-v2"),
  category: z.literal("image-generation"),
  localBatchId: z.string().min(1),
  rootLocalBatchId: z.string().min(1),
  parentLocalBatchId: z.string().min(1).optional(),
  retryNumber: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  endpoint: z.enum(["/v1/images/generations", "/v1/images/edits"]),
  model: z.string().min(1),
  completionWindow: z.literal("24h"),
  inputFilePath: z.string().min(1),
  inputFileHash: z.string().min(1),
  openAIInputFileId: z.string().min(1).optional(),
  openAIBatchId: z.string().min(1).optional(),
  outputFileId: z.string().min(1).optional(),
  errorFileId: z.string().min(1).optional(),
  status: z.enum([
    "prepared",
    "uploading",
    "submitted",
    "validating",
    "in_progress",
    "finalizing",
    "completed",
    "failed",
    "expired",
    "cancelling",
    "cancelled",
    "imported",
    "imported_with_failures",
  ]),
  items: z.array(imageBatchManifestItemSchema),
  resultFilePath: z.string().min(1).optional(),
  errorFilePath: z.string().min(1).optional(),
  reportFilePath: z.string().min(1).optional(),
  submittedAt: z.string().min(1).optional(),
  completedAt: z.string().min(1).optional(),
  importedAt: z.string().min(1).optional(),
});

export const sceneImageJobSchema = z.object({
  identity: imageBatchAssetIdentitySchema,
  sceneId: z.string().min(1).optional(),
  sceneIndex: z.number().int().nonnegative().optional(),
  renderability: z
    .enum([
      "direct",
      "requiresInference",
      "mergeWithPrevious",
      "mergeWithNext",
      "skip",
    ])
    .optional(),
  reusedFromSceneId: z.string().min(1).optional(),
  startTimeSeconds: z.number().nonnegative().optional(),
  endTimeSeconds: z.number().nonnegative().optional(),
  promptPath: z.string().min(1).optional(),
  positivePrompt: z.string().min(1),
  negativePrompt: z.string().min(1).optional(),
  characterIds: z.array(z.string().min(1)),
  characterReferencePaths: z.array(z.string().min(1)),
  dependencies: z.array(imageBatchDependencySchema).default([]),
  outputFormat: z.enum(["png", "jpeg", "webp"]),
  expectedOutputPath: z.string().min(1),
  providerRequestHash: z.string().min(1),
  generationConfigurationHash: z.string().min(1),
});

const openAiImagePayloadSchema = z
  .object({
    b64_json: z.string().min(1).optional(),
    image_base64: z.string().min(1).optional(),
    base64: z.string().min(1).optional(),
  })
  .passthrough();

export const openAiImageBatchResponseBodySchema = z
  .object({
    id: z.string().min(1).optional(),
    status: z.string().min(1).optional(),
    incomplete_details: z
      .object({
        reason: z.string().min(1).optional(),
      })
      .nullable()
      .optional(),
    output_text: z.string().optional(),
    usage: z
      .object({
        input_tokens: z.number().int().nonnegative().optional(),
        output_tokens: z.number().int().nonnegative().optional(),
        input_tokens_details: z
          .object({
            cached_tokens: z.number().int().nonnegative().optional(),
          })
          .optional(),
      })
      .optional(),
    data: z.array(openAiImagePayloadSchema).optional(),
    b64_json: z.string().min(1).optional(),
    image_base64: z.string().min(1).optional(),
    base64: z.string().min(1).optional(),
  })
  .passthrough();

export const openAiImageBatchOutputLineSchema = z
  .object({
    custom_id: z.string().min(1),
    response: z
      .object({
        status_code: z.number().int(),
        body: z.unknown(),
      })
      .optional(),
    error: z
      .object({
        code: z.string().min(1).optional(),
        message: z.string().min(1).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const legacyImageBatchManifestItemV1Schema = z.object({
  customId: z.string().min(1),
  episodeNumber: z.string().min(1),
  episodeSlug: z.string().min(1),
  language: z.literal("en"),
  format: z.literal("full"),
  sceneId: z.string().min(1),
  sceneIndex: z.number().int().nonnegative(),
  renderability: z
    .enum([
      "direct",
      "requiresInference",
      "mergeWithPrevious",
      "mergeWithNext",
      "skip",
    ])
    .optional(),
  reusedFromSceneId: z.string().min(1).optional(),
  promptHash: z.string().min(1),
  providerRequestHash: z.string().min(1),
  generationConfigurationHash: z.string().min(1),
  expectedOutputPath: z.string().min(1),
  characterIds: z.array(z.string().min(1)),
  characterReferenceHashes: z.array(z.string().min(1)),
  requestedSize: z.string().min(1),
  quality: z.string().min(1).optional(),
  outputFormat: z.enum(["png", "jpeg", "webp"]),
  status: z.enum([
    "planned",
    "submitted",
    "api-succeeded",
    "api-failed",
    "expired",
    "policy-rejected",
    "decode-failed",
    "validation-failed",
    "persisted",
    "skipped-cached",
    "retry-required",
  ]),
  retryCount: z.number().int().nonnegative().optional(),
  imageHash: z.string().min(1).optional(),
  actualWidth: z.number().int().positive().optional(),
  actualHeight: z.number().int().positive().optional(),
  actualMimeType: z.string().min(1).optional(),
  actualByteSize: z.number().int().nonnegative().optional(),
  outputFileId: z.string().min(1).optional(),
  importedAt: z.string().min(1).optional(),
  usage: z
    .object({
      inputTokens: z.number().int().nonnegative(),
      cachedInputTokens: z.number().int().nonnegative().optional(),
      outputTokens: z.number().int().nonnegative(),
    })
    .optional(),
  estimatedCostUsd: z.number().nonnegative().optional(),
  error: z
    .object({
      category: z.string().min(1),
      code: z.string().min(1).optional(),
      message: z.string().min(1),
    })
    .optional(),
});

export const legacyImageBatchManifestV1Schema = z.object({
  schemaVersion: z.literal("image-batch-v1"),
  category: z.literal("image-generation"),
  localBatchId: z.string().min(1),
  rootLocalBatchId: z.string().min(1),
  parentLocalBatchId: z.string().min(1).optional(),
  retryNumber: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  endpoint: z.enum(["/v1/images/generations", "/v1/images/edits"]),
  model: z.string().min(1),
  completionWindow: z.literal("24h"),
  inputFilePath: z.string().min(1),
  inputFileHash: z.string().min(1),
  openAIInputFileId: z.string().min(1).optional(),
  openAIBatchId: z.string().min(1).optional(),
  outputFileId: z.string().min(1).optional(),
  errorFileId: z.string().min(1).optional(),
  status: z.enum([
    "prepared",
    "uploading",
    "submitted",
    "validating",
    "in_progress",
    "finalizing",
    "completed",
    "failed",
    "expired",
    "cancelling",
    "cancelled",
    "imported",
    "imported_with_failures",
  ]),
  items: z.array(legacyImageBatchManifestItemV1Schema),
  resultFilePath: z.string().min(1).optional(),
  errorFilePath: z.string().min(1).optional(),
  reportFilePath: z.string().min(1).optional(),
  submittedAt: z.string().min(1).optional(),
  completedAt: z.string().min(1).optional(),
  importedAt: z.string().min(1).optional(),
});
