import { z } from "zod";
import { languageCodes } from "./story-localization.types.js";

const batchOperationSchema = z.enum([
  "canonical-facts",
  "english-short",
  "localization",
  "character-analysis",
  "visual-analysis",
  "repair",
  "image-generation",
  "image-edit",
]);

const batchCategorySchema = z.enum([
  "text-localization",
  "image-generation",
  "image-edit",
  "video-generation",
]);

const batchEndpointSchema = z.enum([
  "/v1/responses",
  "/v1/images/generations",
  "/v1/images/edits",
]);

const batchIndexStatusSchema = z.enum([
  "prepared",
  "submitted",
  "validating",
  "in_progress",
  "finalizing",
  "completed",
  "partially_completed",
  "failed",
  "expired",
  "cancelling",
  "cancelled",
  "imported",
  "imported_with_failures",
]);

const localBatchManifestStatusSchema = z.enum([
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
]);

const localBatchManifestItemStatusSchema = z.enum([
  "planned",
  "submitted",
  "api-succeeded",
  "api-failed",
  "expired",
  "schema-invalid",
  "content-invalid",
  "repair-required",
  "persisted",
  "skipped-cached",
]);

const imageBatchStatusSchema = localBatchManifestStatusSchema;
const imageBatchItemStatusSchema = z.enum([
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
]);

export const sourceMetadataBlockSchema = z.object({
  episodeNumber: z.string().min(1),
  primaryTitle: z.string().min(1),
  sourceTitle: z.string().min(1).optional(),
  audioInstructions: z.array(z.string().min(1)).default([]),
  soundMotif: z.string().min(1).optional(),
  thumbnailText: z.string().min(1).optional(),
  seoDescription: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).default([]),
  hashtags: z.array(z.string().min(1)).default([]),
  narrationWpm: z.number().int().positive().optional(),
  contentDisclosure: z.string().min(1).optional(),
  visualDirection: z.string().min(1).optional(),
});

export const sourceStoryFileSchema = z.object({
  language: z.literal("en"),
  title: z.string().min(1),
  episodeNumber: z.string().min(3),
  slug: z.string().min(1),
  narrationParagraphs: z.array(z.string().min(1)).min(1),
  metadata: sourceMetadataBlockSchema,
});

export const compactCanonicalStoryFactsSchema = z.object({
  characters: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      role: z.string().min(1),
      relationship: z.string().min(1).optional(),
    })
  ),
  setting: z.string().min(1).optional(),
  criticalObjects: z.array(z.string().min(1)),
  criticalEvents: z.array(z.string().min(1)),
  writtenMessages: z.array(z.string().min(1)),
  centralThreat: z.string().min(1),
  primaryReveal: z.string().min(1),
  finalConsequence: z.string().min(1),
});

export const compactStorySourceSchema = z.object({
  episodeNumber: z.string().min(1),
  primaryTitle: z.string().min(1),
  sourceTitle: z.string().min(1).optional(),
  narration: z.string().min(1),
  thumbnailHook: z.string().min(1).optional(),
  contentDisclosure: z.string().min(1).optional(),
  soundMotif: z.string().min(1).optional(),
  canonicalFacts: compactCanonicalStoryFactsSchema,
});

export const sceneImageJobSchema = z.object({
  episodeNumber: z.string().min(1),
  episodeSlug: z.string().min(1),
  language: z.literal("en"),
  format: z.literal("full"),
  sceneId: z.string().min(1),
  sceneIndex: z.number().int().nonnegative(),
  startTimeSeconds: z.number().nonnegative().optional(),
  endTimeSeconds: z.number().nonnegative().optional(),
  promptPath: z.string().min(1).optional(),
  positivePrompt: z.string().min(1),
  negativePrompt: z.string().min(1).optional(),
  characterIds: z.array(z.string().min(1)),
  characterReferencePaths: z.array(z.string().min(1)),
  model: z.string().min(1),
  quality: z.string().min(1),
  requestedSize: z.string().min(1),
  outputFormat: z.enum(["png", "jpeg", "webp"]),
  expectedOutputPath: z.string().min(1),
  promptHash: z.string().min(1),
  generationConfigurationHash: z.string().min(1),
});

export const preservationChecklistSchema = z.object({
  charactersPreserved: z.boolean(),
  relationshipsPreserved: z.boolean(),
  chronologyPreserved: z.boolean(),
  criticalObjectsPreserved: z.boolean(),
  cluesPreserved: z.boolean(),
  writtenMessagesPreserved: z.boolean(),
  primaryRevealPreserved: z.boolean(),
  endingPreserved: z.boolean(),
  noNewPlotElementsAdded: z.boolean(),
});

export const diagnosticsSchema = z.object({
  fullWordCount: z.number().int().nonnegative(),
  shortWordCount: z.number().int().nonnegative(),
  shortEstimatedDurationSeconds: z.number().nonnegative(),
  removedGenericFiller: z.array(z.string()),
  adaptationNotes: z.array(z.string()),
});

export const generatedStoryPackageSchema = z.object({
  language: z.enum(languageCodes),
  full: z
    .object({
      title: z.string().min(1),
      audioInstructions: z.array(z.string().min(1)).min(1),
      narrationParagraphs: z.array(z.string().min(1)).min(3),
      thumbnailText: z.string().min(1).max(50),
      contentDisclosure: z.string().min(1),
      seoDescription: z.string().min(1),
      tags: z.array(z.string().min(1)).min(3).max(20),
      hashtags: z.array(z.string().regex(/^#/u)).min(1).max(8),
      targetNarrationWpm: z.number().int().min(120).max(220),
      visualDirection: z.string().min(1),
    })
    .optional(),
  short: z.object({
    title: z.string().min(1),
    narrationInstructions: z.array(z.string().min(1)).min(1),
    narrationParagraphs: z.array(z.string().min(1)).min(1),
    thumbnailText: z.string().min(1).max(50),
    description: z.string().min(1),
    hashtags: z.array(z.string().regex(/^#/u)).min(1).max(8),
    targetNarrationWpm: z.number().int().min(120).max(220),
    recommendedDurationSeconds: z.object({
      min: z.number().int().min(30).max(90),
      max: z.number().int().min(30).max(90),
    }),
    visualGuidance: z.string().min(1),
  }),
  preservationChecklist: preservationChecklistSchema,
  diagnostics: diagnosticsSchema,
});

export const imageBatchManifestItemSchema = z.object({
  customId: z.string().min(1),
  episodeNumber: z.string().min(1),
  episodeSlug: z.string().min(1),
  language: z.literal("en"),
  format: z.literal("full"),
  sceneId: z.string().min(1),
  sceneIndex: z.number().int().nonnegative(),
  promptHash: z.string().min(1),
  generationConfigurationHash: z.string().min(1),
  expectedOutputPath: z.string().min(1),
  characterIds: z.array(z.string().min(1)),
  characterReferenceHashes: z.array(z.string().min(1)),
  requestedSize: z.string().min(1),
  quality: z.string().min(1).optional(),
  outputFormat: z.enum(["png", "jpeg", "webp"]),
  status: imageBatchItemStatusSchema,
  imageHash: z.string().min(1).optional(),
  actualWidth: z.number().int().positive().optional(),
  actualHeight: z.number().int().positive().optional(),
  actualMimeType: z.string().min(1).optional(),
  actualByteSize: z.number().int().nonnegative().optional(),
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
  schemaVersion: z.string().min(1),
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
  status: imageBatchStatusSchema,
  items: z.array(imageBatchManifestItemSchema),
  resultFilePath: z.string().min(1).optional(),
  errorFilePath: z.string().min(1).optional(),
  reportFilePath: z.string().min(1).optional(),
  submittedAt: z.string().min(1).optional(),
  completedAt: z.string().min(1).optional(),
  importedAt: z.string().min(1).optional(),
});

export type GeneratedStoryPackageShape = z.infer<typeof generatedStoryPackageSchema>;

export const EnglishGeneratedStoryPackageSchema = z.object({
  short: generatedStoryPackageSchema.shape.short,
  preservationChecklist: preservationChecklistSchema,
  diagnostics: diagnosticsSchema,
});

export type EnglishGeneratedStoryPackageShape = z.infer<typeof EnglishGeneratedStoryPackageSchema>;

export const openAIBatchRequestLineSchema = z.object({
  custom_id: z.string().min(1),
  method: z.literal("POST"),
  url: batchEndpointSchema,
  body: z.record(z.string(), z.unknown()),
});

export const localBatchManifestItemSchema = z.object({
  customId: z.string().min(1),
  episodeNumber: z.string().min(1),
  language: z.enum(languageCodes).optional(),
  operation: batchOperationSchema,
  sourcePath: z.string().min(1),
  sourceHash: z.string().min(8),
  promptVersion: z.string().min(1),
  configurationHash: z.string().min(8),
  plannedOutputPaths: z.array(z.string().min(1)),
  estimatedInputTokens: z.number().int().nonnegative(),
  estimatedOutputTokens: z.number().int().nonnegative().optional(),
  status: localBatchManifestItemStatusSchema,
  resultImportedAt: z.string().min(1).optional(),
  usage: z
    .object({
      inputTokens: z.number().int().nonnegative(),
      cachedInputTokens: z.number().int().nonnegative().optional(),
      outputTokens: z.number().int().nonnegative(),
    })
    .optional(),
  error: z
    .object({
      code: z.string().min(1).optional(),
      message: z.string().min(1),
    })
    .optional(),
});

export const localBatchManifestSchema = z.object({
  schemaVersion: z.string().min(1),
  category: batchCategorySchema.default("text-localization"),
  localBatchId: z.string().min(1),
  rootLocalBatchId: z.string().min(1),
  parentLocalBatchId: z.string().min(1).optional(),
  retryNumber: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  mode: z.literal("batch"),
  endpoint: batchEndpointSchema,
  model: z.string().min(1),
  completionWindow: z.literal("24h"),
  inputFilePath: z.string().min(1),
  inputFileHash: z.string().min(8),
  openAIInputFileId: z.string().min(1).optional(),
  openAIBatchId: z.string().min(1).optional(),
  status: localBatchManifestStatusSchema,
  items: z.array(localBatchManifestItemSchema),
  outputFileId: z.string().min(1).optional(),
  errorFileId: z.string().min(1).optional(),
  resultFilePath: z.string().min(1).optional(),
  errorFilePath: z.string().min(1).optional(),
  reportFilePath: z.string().min(1).optional(),
  submittedAt: z.string().min(1).optional(),
  completedAt: z.string().min(1).optional(),
  importedAt: z.string().min(1).optional(),
  requestCounts: z
    .object({
      total: z.number().int().nonnegative(),
      completed: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
    })
    .optional(),
});

export const batchIndexEntrySchema = z.object({
  localBatchId: z.string().min(1),
  openAIBatchId: z.string().min(1).optional(),
  category: batchCategorySchema.default("text-localization"),
  rootLocalBatchId: z.string().min(1),
  parentLocalBatchId: z.string().min(1).optional(),
  retryNumber: z.number().int().nonnegative(),
  status: batchIndexStatusSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  submittedAt: z.string().min(1).optional(),
  completedAt: z.string().min(1).optional(),
  importedAt: z.string().min(1).optional(),
  model: z.string().min(1),
  endpoint: batchEndpointSchema,
  completionWindow: z.literal("24h"),
  operations: z.array(batchOperationSchema),
  episodeNumbers: z.array(z.string().min(1)),
  languages: z.array(z.enum(languageCodes)),
  itemCount: z.number().int().nonnegative(),
  completedItemCount: z.number().int().nonnegative(),
  failedItemCount: z.number().int().nonnegative(),
  persistedItemCount: z.number().int().nonnegative(),
  inputFilePath: z.string().min(1),
  manifestPath: z.string().min(1),
  resultFilePath: z.string().min(1).optional(),
  errorFilePath: z.string().min(1).optional(),
  reportFilePath: z.string().min(1).optional(),
  openAIInputFileId: z.string().min(1).optional(),
  outputFileId: z.string().min(1).optional(),
  errorFileId: z.string().min(1).optional(),
  sourceHashPrefixes: z.array(z.string().min(1)),
  imported: z.boolean(),
  requiresImport: z.boolean(),
  hasRetryableFailures: z.boolean(),
  estimatedInputTokens: z.number().nonnegative().optional(),
  actualInputTokens: z.number().nonnegative().optional(),
  actualOutputTokens: z.number().nonnegative().optional(),
  estimatedCostUsd: z.number().nonnegative().optional(),
  lastError: z
    .object({
      code: z.string().min(1).optional(),
      message: z.string().min(1),
      occurredAt: z.string().min(1),
    })
    .optional(),
  imageDetails: z
    .object({
      category: z.literal("image-generation"),
      episodeNumbers: z.array(z.string().min(1)),
      sceneCount: z.number().int().nonnegative(),
      imageModel: z.string().min(1),
      imageQuality: z.string().min(1).optional(),
      outputFormat: z.string().min(1),
      generatedImageCount: z.number().int().nonnegative(),
      invalidImageCount: z.number().int().nonnegative(),
      failedImageCount: z.number().int().nonnegative(),
      missingImageCount: z.number().int().nonnegative(),
      requiresImport: z.boolean(),
    })
    .optional(),
});

export const batchIndexFileSchema = z.object({
  schemaVersion: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  entries: z.array(batchIndexEntrySchema),
});
