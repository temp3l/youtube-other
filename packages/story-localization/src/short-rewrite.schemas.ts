import { z } from "zod";
import {
  SHORT_REWRITE_HARD_WORD_RANGE,
  SHORT_REWRITE_THUMBNAIL_WORD_LIMIT,
} from "./short-rewrite.constants.js";

const finitePositiveNumber = z.number().finite().nonnegative();
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/iu);

const shortRewriteParentIdentitySchema = z
  .object({
    episodeId: z.string().min(1),
    episodeSlug: z.string().min(1),
    language: z.enum(["en", "de", "es", "fr", "pt"]),
    locale: z.string().min(1),
    variant: z.literal("full"),
    parentFullHash: hashSchema,
    sourceSha256: hashSchema,
  })
  .strict();

const shortRewriteBeatSchema = z
  .object({
    id: z.string().min(1),
    paragraphIndex: z.number().int().nonnegative(),
    sentenceIndex: z.number().int().nonnegative(),
    text: z.string().min(1),
    references: z.array(z.string().min(1)),
    retained: z.boolean(),
  })
  .strict();

const shortRewriteOrphanedReferenceSchema = z
  .object({
    reference: z.string().min(1),
    introducedByBeatId: z.string().min(1),
    firstRetainedBeatId: z.string().min(1),
  })
  .strict();

export const shortRewriteSourceExtractionSchema = z
  .object({
    version: z.string().min(1),
    parentFullHash: hashSchema,
    storyIrHash: hashSchema,
    locale: z.string().min(1),
    targetVariant: z.literal("short"),
    maximumBeats: z.number().int().positive(),
    selectedBeatIds: z.array(z.string().min(1)),
    removedBeatIds: z.array(z.string().min(1)),
    beats: z.array(shortRewriteBeatSchema),
    orphanedReferences: z.array(shortRewriteOrphanedReferenceSchema),
    extractionHash: hashSchema,
  })
  .strict();

export const shortRewriteAdaptationContractSchema = z
  .object({
    schemaVersion: z.string().min(1),
    contractVersion: z.string().min(1),
    identity: z
      .object({
        episodeId: z.string().min(1),
        episodeSlug: z.string().min(1),
        language: z.enum(["en", "de", "es", "fr", "pt"]),
        locale: z.string().min(1),
        variant: z.literal("short"),
      })
      .strict(),
    parent: shortRewriteParentIdentitySchema,
    storyIrHash: hashSchema,
    immutableFacts: z.array(
      z
        .object({
          id: z.string().min(1),
          statement: z.string().min(1),
        })
        .strict()
    ),
    centralThreat: z.string().min(1),
    centralRuleOrMechanism: z.string().min(1),
    criticalObject: z.string().min(1),
    climaxOrIrreversibleTurn: z.string().min(1),
    finalConsequenceOrSting: z.string().min(1),
    exactWrittenMessages: z.array(z.string().min(1)),
    allowedCompression: z.array(z.string().min(1)),
    forbiddenOmissions: z.array(z.string().min(1)),
    retentionBoundaries: z
      .object({
        factsMustRemain: z.array(z.string().min(1)),
        detailsMayCompress: z.array(z.string().min(1)),
        detailsMayRemove: z.array(z.string().min(1)),
        dialogueMayShorten: z.array(z.string().min(1)),
      })
      .strict(),
    inventionBoundaries: z.array(z.string().min(1)),
    constraints: z
      .object({
        targetDurationSeconds: z
          .object({
            min: z.number().int().positive(),
            max: z.number().int().positive(),
          })
          .strict(),
        targetNarrationWpm: z.number().int().positive(),
        targetWordRange: z
          .object({
            min: z.number().int().positive(),
            max: z.number().int().positive(),
          })
          .strict(),
        hookDeadlineSeconds: z.number().int().positive(),
        maximumBeats: z.number().int().positive(),
      })
      .strict(),
    sourceExtraction: z
      .object({
        extractionHash: hashSchema,
        selectedBeatIds: z.array(z.string().min(1)),
        orphanedReferences: z.array(shortRewriteOrphanedReferenceSchema),
      })
      .strict(),
    contractHash: hashSchema,
  })
  .strict();

const shortRewritePromptLineageSchema = z
  .object({
    compilerVersion: z.string().min(1).optional(),
    promptFingerprint: z.string().min(1).optional(),
    responseSchemaName: z.string().min(1).optional(),
    responseSchemaVersion: z.string().min(1).optional(),
    responseSchemaFingerprint: z.string().min(1).optional(),
  })
  .strict();

export const shortRewriteResultSchema = z
  .object({
    title: z.string().min(1),
    hook: z.string().min(1),
    narration: z.string().min(1),
    wordCount: z.number().int().nonnegative(),
    estimatedDurationSecondsAt175Wpm: finitePositiveNumber,
    estimatedDurationSecondsAt180Wpm: finitePositiveNumber,
    thumbnailText: z.string().min(1),
    fullVideoBridge: z.string().min(1),
  })
  .strict();

export const shortRewriteGenerationSchema = z
  .object({
    schemaVersion: z.literal(2),
    episodeId: z.string().min(1),
    episodeSlug: z.string().min(1),
    sourceLanguage: z.literal("en"),
    targetLanguage: z.enum(["en", "de", "es", "fr", "pt"]),
    locale: z.string().min(1),
    variant: z.literal("short"),
    promptVersion: z.string().min(1),
    promptFingerprint: z.string().min(1).optional(),
    model: z.string().min(1),
    reasoningEffort: z.string().min(1).optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    sourcePath: z.string().min(1),
    sourceSha256: hashSchema,
    parent: shortRewriteParentIdentitySchema,
    storyIrHash: hashSchema,
    shortSourceExtraction: shortRewriteSourceExtractionSchema,
    shortAdaptationContract: shortRewriteAdaptationContractSchema,
    promptLineage: shortRewritePromptLineageSchema.optional(),
    canonical: z.boolean(),
    generatedAt: z.string().min(1),
    generation: shortRewriteResultSchema,
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative().optional(),
        cachedInputTokens: z.number().int().nonnegative().optional(),
        reasoningTokens: z.number().int().nonnegative().optional(),
        outputTokens: z.number().int().nonnegative().optional(),
        totalTokens: z.number().int().nonnegative().optional(),
        estimatedCostUsd: z
          .number()
          .finite()
          .nonnegative()
          .nullable()
          .optional(),
      })
      .strict(),
    repairHistory: z
      .array(
        z
          .object({
            stage: z.enum(["repair", "regenerate"]),
            issues: z.array(z.string().min(1)),
          })
          .strict()
      )
      .optional(),
    validation: z
      .object({
        preferredWordRangeSatisfied: z.boolean(),
        hardWordRangeSatisfied: z.boolean(),
        hookMatchesNarration: z.boolean(),
        thumbnailWordCount: z
          .number()
          .int()
          .min(0)
          .max(SHORT_REWRITE_THUMBNAIL_WORD_LIMIT),
        warnings: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

export const shortRewriteArtifactSchema = z
  .object({
    schemaVersion: z.literal(2),
    promptVersion: z.string().min(1),
    promptFingerprint: z.string().min(1).optional(),
    status: z.enum(["completed", "failed", "skipped"]),
    episodeId: z.string().min(1),
    episodeSlug: z.string().min(1),
    sourceLanguage: z.literal("en"),
    targetLanguage: z.enum(["en", "de", "es", "fr", "pt"]),
    locale: z.string().min(1),
    variant: z.literal("short"),
    sourcePath: z.string().min(1),
    sourceSha256: hashSchema,
    parent: shortRewriteParentIdentitySchema,
    storyIrHash: hashSchema,
    shortContractHash: hashSchema,
    shortContractVersion: z.string().min(1),
    shortContractSchemaVersion: z.string().min(1),
    shortSourceExtractionHash: hashSchema,
    shortSourceExtractionVersion: z.string().min(1),
    canonical: z.boolean(),
    markdownOutputPath: z.string().min(1),
    jsonOutputPath: z.string().min(1),
    generatedAt: z.string().min(1),
    model: z.string().min(1),
    reasoningEffort: z.string().min(1).optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    requestId: z.string().min(1).optional(),
    generationDurationMs: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative().optional(),
    cachedInputTokens: z.number().int().nonnegative().optional(),
    reasoningTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative().optional(),
    estimatedCostUsd: z.number().finite().nonnegative().nullable().optional(),
    failedRequest: z
      .object({
        model: z.string().min(1),
        reasoningEffort: z.string().min(1).optional(),
        outputCap: z.number().int().positive(),
        attemptNumber: z.number().int().positive(),
        requestFingerprint: z.string().min(1).optional(),
        incompleteReason: z.string().min(1).optional(),
        usage: z
          .object({
            inputTokens: z.number().int().nonnegative().optional(),
            cachedInputTokens: z.number().int().nonnegative().optional(),
            reasoningTokens: z.number().int().nonnegative().optional(),
            outputTokens: z.number().int().nonnegative().optional(),
            totalTokens: z.number().int().nonnegative().optional(),
            estimatedCostUsd: z
              .number()
              .finite()
              .nonnegative()
              .nullable()
              .optional(),
          })
          .strict()
          .optional(),
        estimatedCostUsd: z.number().finite().nonnegative().nullable().optional(),
      })
      .strict()
      .optional(),
    repairHistory: z
      .array(
        z
          .object({
            stage: z.enum(["repair", "regenerate"]),
            issues: z.array(z.string().min(1)),
          })
          .strict()
      )
      .optional(),
    promptLineage: shortRewritePromptLineageSchema.optional(),
    validation: z
      .object({
        preferredWordRangeSatisfied: z.boolean(),
        hardWordRangeSatisfied: z.boolean(),
        hookMatchesNarration: z.boolean(),
        thumbnailWordCount: z
          .number()
          .int()
          .min(0)
          .max(SHORT_REWRITE_THUMBNAIL_WORD_LIMIT),
        warnings: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

export const shortRewriteManifestSchema = z
  .object({
    schemaVersion: z.literal(2),
    promptVersion: z.string().min(1),
    promptFingerprint: z.string().min(1).optional(),
    episodeId: z.string().min(1),
    episodeSlug: z.string().min(1),
    sourceLanguage: z.literal("en"),
    sourcePath: z.string().min(1),
    sourceSha256: hashSchema,
    canonical: z.boolean(),
    model: z.string().min(1),
    generatedAt: z.string().min(1),
    updatedAt: z.string().min(1),
    artifacts: z.array(shortRewriteArtifactSchema),
  })
  .strict();
