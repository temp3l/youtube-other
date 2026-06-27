import { z } from "zod";
import { SHORT_REWRITE_HARD_WORD_RANGE, SHORT_REWRITE_THUMBNAIL_WORD_LIMIT } from "./short-rewrite.constants.js";

const finitePositiveNumber = z
  .number()
  .finite()
  .nonnegative();

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
    schemaVersion: z.literal(1),
    episodeId: z.string().min(1),
    episodeSlug: z.string().min(1),
    sourceLanguage: z.literal("en"),
    targetLanguage: z.enum(["en", "de", "es", "fr", "pt"]),
    promptVersion: z.string().min(1),
    model: z.string().min(1),
    sourcePath: z.string().min(1),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/iu),
    generatedAt: z.string().min(1),
    generation: shortRewriteResultSchema,
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative().optional(),
        cachedInputTokens: z.number().int().nonnegative().optional(),
        reasoningTokens: z.number().int().nonnegative().optional(),
        outputTokens: z.number().int().nonnegative().optional(),
        totalTokens: z.number().int().nonnegative().optional(),
        estimatedCostUsd: z.number().finite().nonnegative().nullable().optional(),
      })
      .strict(),
    validation: z
      .object({
        preferredWordRangeSatisfied: z.boolean(),
        hardWordRangeSatisfied: z.boolean(),
        hookMatchesNarration: z.boolean(),
        thumbnailWordCount: z.number().int().min(0).max(SHORT_REWRITE_THUMBNAIL_WORD_LIMIT),
        warnings: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

export const shortRewriteArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    promptVersion: z.string().min(1),
    status: z.enum(["completed", "failed", "skipped"]),
    episodeId: z.string().min(1),
    episodeSlug: z.string().min(1),
    sourceLanguage: z.literal("en"),
    targetLanguage: z.enum(["en", "de", "es", "fr", "pt"]),
    sourcePath: z.string().min(1),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/iu),
    markdownOutputPath: z.string().min(1),
    jsonOutputPath: z.string().min(1),
    generatedAt: z.string().min(1),
    model: z.string().min(1),
    requestId: z.string().min(1).optional(),
    generationDurationMs: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative().optional(),
    cachedInputTokens: z.number().int().nonnegative().optional(),
    reasoningTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative().optional(),
    estimatedCostUsd: z.number().finite().nonnegative().nullable().optional(),
    validation: z
      .object({
        preferredWordRangeSatisfied: z.boolean(),
        hardWordRangeSatisfied: z.boolean(),
        hookMatchesNarration: z.boolean(),
        thumbnailWordCount: z.number().int().min(0).max(SHORT_REWRITE_THUMBNAIL_WORD_LIMIT),
        warnings: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

export const shortRewriteManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    promptVersion: z.string().min(1),
    episodeId: z.string().min(1),
    episodeSlug: z.string().min(1),
    sourceLanguage: z.literal("en"),
    sourcePath: z.string().min(1),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/iu),
    model: z.string().min(1),
    generatedAt: z.string().min(1),
    updatedAt: z.string().min(1),
    artifacts: z.array(shortRewriteArtifactSchema),
  })
  .strict();

