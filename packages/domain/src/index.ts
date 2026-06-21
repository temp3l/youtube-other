import { z } from "zod";

const episodeIdPattern = /^[a-z0-9][a-z0-9-]*$/;
const sceneIdPattern = /^scene-[0-9]{3}$/;
const artifactIdPattern = /^artifact-[a-z0-9][a-z0-9-]*$/;
const pipelineRunIdPattern = /^run-[a-z0-9][a-z0-9-]*$/;

export const episodeIdSchema = z
  .string()
  .min(3)
  .max(128)
  .regex(episodeIdPattern)
  .brand<"EpisodeId">();
export type EpisodeId = z.infer<typeof episodeIdSchema>;

export const sceneIdSchema = z.string().regex(sceneIdPattern).brand<"SceneId">();
export type SceneId = z.infer<typeof sceneIdSchema>;

export const artifactIdSchema = z
  .string()
  .regex(artifactIdPattern)
  .brand<"ArtifactId">();
export type ArtifactId = z.infer<typeof artifactIdSchema>;

export const pipelineRunIdSchema = z
  .string()
  .regex(pipelineRunIdPattern)
  .brand<"PipelineRunId">();
export type PipelineRunId = z.infer<typeof pipelineRunIdSchema>;

export const sourcePlatformSchema = z.enum(["youtube", "tiktok", "local-file"]);
export type SourcePlatform = z.infer<typeof sourcePlatformSchema>;

export const sourceUrlSchema = z.string().url().brand<"SourceUrl">();
export type SourceUrl = z.infer<typeof sourceUrlSchema>;

export const acquisitionStrategySchema = z.enum([
  "manual-subtitle",
  "creator-subtitle",
  "platform-subtitle",
  "authorized-transcription",
  "sidecar-subtitle",
  "mock"
]);
export type AcquisitionStrategy = z.infer<typeof acquisitionStrategySchema>;

export const sourceMetadataSchema = z.object({
  platform: sourcePlatformSchema,
  sourceUrl: z.string().url().optional(),
  title: z.string(),
  author: z.string().optional(),
  durationSeconds: z.number().nonnegative(),
  acquisitionStrategy: acquisitionStrategySchema,
  localPath: z.string().optional(),
  subtitleLanguage: z.string().optional(),
  transcriptUrl: z.string().optional(),
  notes: z.string().optional()
});
export type SourceMetadata = z.infer<typeof sourceMetadataSchema>;

export const sourceMediaSchema = z.object({
  path: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  checksumSha256: z.string().optional()
});
export type SourceMedia = z.infer<typeof sourceMediaSchema>;

export const rawTimedWordSchema = z.object({
  text: z.string(),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative(),
  probability: z.number().min(0).max(1).optional()
});
export type RawTimedWord = z.infer<typeof rawTimedWordSchema>;

export const timestampedWordSchema = z.object({
  text: z.string(),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative(),
  probability: z.number().min(0).max(1).optional()
});
export type TimestampedWord = z.infer<typeof timestampedWordSchema>;

export const transcriptWordSchema = z.object({
  index: z.number().int().nonnegative().optional(),
  text: z.string(),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative(),
  confidence: z.number().min(0).max(1).optional()
});
export type TranscriptWord = z.infer<typeof transcriptWordSchema>;

export const segmentBoundaryReasonSchema = z.enum(["sentence", "silence", "max-duration", "end-of-transcript"]);
export type SegmentBoundaryReason = z.infer<typeof segmentBoundaryReasonSchema>;

const transcriptSegmentIdSchema = z
  .string()
  .regex(/^(?:scene|segment)-[0-9]{3}$/u)
  .brand<"TranscriptSegmentId">();
export { transcriptSegmentIdSchema };
export type TranscriptSegmentId = z.infer<typeof transcriptSegmentIdSchema>;

export const sentenceSegmentationOptionsSchema = z.object({
  minDurationSeconds: z.number().positive(),
  maxDurationSeconds: z.number().positive(),
  maxSilenceSeconds: z.number().nonnegative(),
  timestampPrecision: z.number().int().min(0).max(6),
  maxSingleWordDurationSeconds: z.number().positive(),
  boundaryLookbackWords: z.number().int().nonnegative()
});
export type SentenceSegmentationOptions = z.infer<typeof sentenceSegmentationOptionsSchema>;

export const transcriptSegmentSchema = z.object({
  id: transcriptSegmentIdSchema,
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative(),
  text: z.string(),
  words: z.array(timestampedWordSchema).default([]),
  boundaryReason: segmentBoundaryReasonSchema.optional()
});
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

export const subtitleSegmentSchema = transcriptSegmentSchema;
export type SubtitleSegment = z.infer<typeof subtitleSegmentSchema>;

export const transcriptSchema = z.object({
  sourceId: episodeIdSchema,
  language: z.string().min(1),
  text: z.string(),
  segments: z.array(transcriptSegmentSchema),
  words: z.array(timestampedWordSchema).default([])
});
export type Transcript = z.infer<typeof transcriptSchema>;

export const normalizedTranscriptSchema = z.object({
  schemaVersion: z.literal(1),
  sourceId: episodeIdSchema,
  language: z.string().min(1),
  text: z.string(),
  segments: z.array(transcriptSegmentSchema),
  words: z.array(timestampedWordSchema),
  generation: z.object({
    provider: z.string(),
    model: z.string(),
    generatedAt: z.string(),
    wordTimestamps: z.literal(true)
  })
});
export type NormalizedTranscript = z.infer<typeof normalizedTranscriptSchema>;

export const transcriptCorrectionSchema = z.object({
  originalText: z.string(),
  correctedText: z.string(),
  confidence: z.number().min(0).max(1),
  category: z.enum(["spelling", "punctuation", "grammar", "repetition", "filler-word", "other"]),
  reason: z.string(),
  humanReviewRecommended: z.boolean()
});
export type TranscriptCorrection = z.infer<typeof transcriptCorrectionSchema>;

export const uncertainTermSchema = z.object({
  originalText: z.string(),
  suggestedText: z.string().optional(),
  reason: z.string()
});
export type UncertainTerm = z.infer<typeof uncertainTermSchema>;

export const cleanedTranscriptSchema = z.object({
  sourceId: episodeIdSchema,
  language: z.string().min(1),
  originalText: z.string(),
  cleanedText: z.string(),
  segments: z.array(transcriptSegmentSchema),
  corrections: z.array(transcriptCorrectionSchema),
  uncertainTerms: z.array(uncertainTermSchema)
});
export type CleanedTranscript = z.infer<typeof cleanedTranscriptSchema>;

export const rewrittenScriptSectionSchema = z.object({
  sectionId: z.string(),
  transcriptSegmentIds: z.array(transcriptSegmentIdSchema),
  text: z.string(),
  claims: z.array(z.string()).default([])
});
export type RewrittenScriptSection = z.infer<typeof rewrittenScriptSectionSchema>;

export const rewrittenScriptSchema = z.object({
  sourceId: episodeIdSchema,
  audience: z.string().min(1),
  text: z.string(),
  sections: z.array(rewrittenScriptSectionSchema),
  claims: z.array(
    z.object({
      text: z.string(),
      reviewRequired: z.boolean(),
      reason: z.string().optional()
    })
  )
});
export type RewrittenScript = z.infer<typeof rewrittenScriptSchema>;

export const claimSchema = z.object({
  text: z.string(),
  sourceSegmentIds: z.array(transcriptSegmentIdSchema),
  reviewRequired: z.boolean(),
  reason: z.string().optional()
});
export type Claim = z.infer<typeof claimSchema>;

export const sceneTimingSchema = z.object({
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative()
});
export type SceneTiming = z.infer<typeof sceneTimingSchema>;

export const imagePromptSchema = z.object({
  sceneId: sceneIdSchema,
  sequenceNumber: z.number().int().positive(),
  aspectRatio: z.enum(["16:9", "9:16"]),
  timestampStart: z.number().nonnegative(),
  timestampEnd: z.number().nonnegative(),
  visualPurpose: z.string(),
  prompt: z.string(),
  negativePrompt: z.string(),
  continuity: z.string().default(""),
  expectedFilename: z.string()
});
export type ImagePrompt = z.infer<typeof imagePromptSchema>;

export const sceneSchema = z.object({
  id: sceneIdSchema,
  sequenceNumber: z.number().int().positive(),
  canonicalNarration: z.string(),
  sourceSegmentIds: z.array(transcriptSegmentIdSchema),
  estimatedDurationSeconds: z.number().nonnegative(),
  actualAudioDurationSeconds: z.number().nonnegative().optional(),
  timing: sceneTimingSchema,
  visualPurpose: z.string(),
  subject: z.string(),
  action: z.string(),
  setting: z.string(),
  composition: z.string(),
  cameraFraming: z.string(),
  mood: z.string(),
  continuityReferences: z.array(z.string()).default([]),
  onScreenText: z.string().default(""),
  negativeConstraints: z.array(z.string()).default([]),
  aspectRatios: z.array(z.enum(["16:9", "9:16"])),
  imagePrompt: z.string(),
  expectedImageFilenames: z.array(z.string()),
  qualityStatus: z.enum(["draft", "approved", "rejected"])
});
export type Scene = z.infer<typeof sceneSchema>;

export const scenePlanSchema = z.object({
  sourceId: episodeIdSchema,
  scenes: z.array(sceneSchema)
});
export type ScenePlan = z.infer<typeof scenePlanSchema>;

export const visualSceneSchema = z.object({
  id: sceneIdSchema,
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative(),
  narration: z.string(),
  sourceSegmentIds: z.array(transcriptSegmentIdSchema)
});
export type VisualScene = z.infer<typeof visualSceneSchema>;

export const voiceProfileSchema = z.object({
  id: z.string(),
  label: z.string(),
  gender: z.enum(["male", "female", "neutral"]),
  style: z.string(),
  paceWpm: z.number().positive(),
  providerVoiceId: z.string().optional()
});
export type VoiceProfile = z.infer<typeof voiceProfileSchema>;

export const audioSegmentSchema = z.object({
  sceneId: sceneIdSchema,
  filePath: z.string(),
  durationSeconds: z.number().nonnegative()
});
export type AudioSegment = z.infer<typeof audioSegmentSchema>;

export const wordTimingSchema = z.object({
  word: z.string(),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative(),
  confidence: z.number().min(0).max(1).optional()
});
export type WordTiming = z.infer<typeof wordTimingSchema>;

export const alignmentResultSchema = z.object({
  sceneId: sceneIdSchema,
  words: z.array(wordTimingSchema),
  lowConfidenceRanges: z.array(
    z.object({
      startSeconds: z.number().nonnegative(),
      endSeconds: z.number().nonnegative(),
      reason: z.string()
    })
  )
});
export type AlignmentResult = z.infer<typeof alignmentResultSchema>;

export const captionSegmentSchema = z.object({
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative(),
  text: z.string()
});
export type CaptionSegment = z.infer<typeof captionSegmentSchema>;

export const imageAssetSchema = z.object({
  sceneId: sceneIdSchema,
  sourcePath: z.string(),
  renderedPath: z.string().optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mimeType: z.string(),
  checksumSha256: z.string(),
  duplicateOf: z.string().optional(),
  validated: z.boolean(),
  originalImagePrompt: z.string().optional(),
  optimizedImagePrompt: z.string().optional(),
  optimizedImagePromptPath: z.string().optional(),
  optimizedImagePromptHash: z.string().optional(),
  generationStatus: z
    .enum(["pending", "prompt-optimized", "generating", "generated", "validated", "failed", "skipped-cache-hit"])
    .optional(),
  provenance: z
    .object({
      schemaVersion: z.literal(1),
      episodeSlug: z.string(),
      sceneId: sceneIdSchema,
      sequence: z.number().int().positive(),
      sourceSceneHash: z.string(),
      originalPromptHash: z.string(),
      optimizedPromptHash: z.string(),
      optimizerVersion: z.string(),
      optimizerModel: z.string().optional(),
      optimizedAt: z.string(),
      metrics: z.object({
        originalCharacters: z.number().int().nonnegative(),
        optimizedCharacters: z.number().int().nonnegative(),
        reductionCharacters: z.number().int().nonnegative(),
        reductionPercent: z.number().nonnegative(),
        originalEstimatedTokens: z.number().int().nonnegative(),
        optimizedEstimatedTokens: z.number().int().nonnegative()
      }),
      preservedRequirements: z.array(z.string()),
      omittedNonVisualContent: z.array(z.string()),
      warnings: z.array(z.string()),
      model: z.string().optional(),
      referenceMode: z.enum(["none", "canonical", "previous"]).optional(),
      referenceImagePath: z.string().optional(),
      referenceImageHash: z.string().optional(),
      referenceImageSource: z.enum(["canonical", "previous", "none", "fallback"]).optional(),
      size: z.string(),
      quality: z.string(),
      outputFormat: z.enum(["png", "webp", "jpeg"]),
      candidateCount: z.number().int().positive(),
      cacheKey: z.string(),
      requestId: z.string().optional(),
      generatedAt: z.string().optional(),
      validatedAt: z.string().optional(),
      validation: z
        .object({
          valid: z.boolean(),
          width: z.number().int().positive().optional(),
          height: z.number().int().positive().optional(),
          checksumSha256: z.string().optional(),
          warnings: z.array(z.string()).default([])
        })
        .optional(),
      failure: z
        .object({
          failedStage: z.enum(["load", "optimize", "prompt-validation", "generate", "image-validation", "write"]),
          retryable: z.boolean(),
          errorCode: z.string(),
          errorMessage: z.string()
        })
        .optional()
    })
    .optional()
});
export type ImageAsset = z.infer<typeof imageAssetSchema>;

export const renderProfileSchema = z.object({
  id: z.string(),
  label: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
  aspectRatio: z.enum(["16:9", "9:16"]),
  burnCaptions: z.boolean()
});
export type RenderProfile = z.infer<typeof renderProfileSchema>;

export const publishingMetadataSchema = z.object({
  sourceId: episodeIdSchema,
  platform: z.enum(["youtube", "tiktok"]),
  language: z.string().min(1).optional(),
  titleCandidates: z.array(z.string()),
  recommendedTitle: z.string(),
  description: z.string(),
  caption: z.string().optional(),
  tags: z.array(z.string()),
  hashtags: z.array(z.string()),
  chapters: z.array(
    z.object({
      timestampSeconds: z.number().nonnegative(),
      title: z.string()
    })
  ),
  thumbnailTextCandidates: z.array(z.string()),
  coverTextCandidates: z.array(z.string()),
  pinnedComment: z.string().optional(),
  summary: z.string(),
  primaryKeyword: z.string(),
  secondaryKeywords: z.array(z.string()),
  warnings: z.array(z.string())
});
export type PublishingMetadata = z.infer<typeof publishingMetadataSchema>;

export const artifactReferenceSchema = z.object({
  id: artifactIdSchema,
  kind: z.string(),
  path: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  checksumSha256: z.string(),
  createdAt: z.string()
});
export type ArtifactReference = z.infer<typeof artifactReferenceSchema>;

export const providerUsageSchema = z.object({
  provider: z.string(),
  model: z.string().optional(),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  creditsUsed: z.number().nonnegative().default(0)
});
export type ProviderUsage = z.infer<typeof providerUsageSchema>;

export const pipelineErrorSchema = z.object({
  name: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  step: z.string().optional(),
  episodeId: episodeIdSchema.optional(),
  sceneId: sceneIdSchema.optional(),
  remediation: z.string().optional()
});
export type PipelineError = z.infer<typeof pipelineErrorSchema>;

export const pipelineStepRunSchema = z.object({
  name: z.string(),
  version: z.string(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  cacheKey: z.string(),
  cacheHit: z.boolean(),
  status: z.enum(["running", "succeeded", "failed", "skipped"]),
  outputArtifactIds: z.array(artifactIdSchema).default([]),
  providerUsage: providerUsageSchema.optional(),
  error: pipelineErrorSchema.optional()
});
export type PipelineStepRun = z.infer<typeof pipelineStepRunSchema>;

export const pipelineRunSchema = z.object({
  id: pipelineRunIdSchema,
  episodeId: episodeIdSchema,
  startedAt: z.string(),
  completedAt: z.string().optional(),
  status: z.enum(["running", "succeeded", "failed", "cancelled"]),
  steps: z.array(pipelineStepRunSchema).default([])
});
export type PipelineRun = z.infer<typeof pipelineRunSchema>;

export const episodeManifestSchema = z.object({
  episodeId: episodeIdSchema,
  slug: z.string(),
  source: z.object({
    platform: sourcePlatformSchema,
    url: z.string().optional(),
    filePath: z.string().optional(),
    transcriptPath: z.string().optional(),
    mediaPath: z.string().optional()
  }),
  sourceMetadata: z.any().optional(),
  sourceMedia: z.any().optional(),
  transcript: transcriptSchema.optional(),
  cleanedTranscript: cleanedTranscriptSchema.optional(),
  rewrittenScript: rewrittenScriptSchema.optional(),
  scenePlan: scenePlanSchema.optional(),
  alignment: alignmentResultSchema.optional(),
  captions: z.object({
    srtPath: z.string().optional(),
    vttPath: z.string().optional(),
    assPath: z.string().optional()
  }).optional(),
  images: z.array(imageAssetSchema).default([]),
  publishingMetadata: publishingMetadataSchema.optional(),
  artifacts: z.array(artifactReferenceSchema).default([]),
  pipelineRuns: z.array(pipelineRunSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type EpisodeManifest = z.infer<typeof episodeManifestSchema>;

export interface PipelineContext {
  readonly episodeId: EpisodeId;
  readonly episodeSlug: string;
  readonly workspaceDir: string;
  readonly episodeDir: string;
  readonly manifestPath: string;
  readonly logger?: {
    info: (obj: Record<string, unknown>, msg?: string) => void;
    warn: (obj: Record<string, unknown>, msg?: string) => void;
    error: (obj: Record<string, unknown>, msg?: string) => void;
    debug: (obj: Record<string, unknown>, msg?: string) => void;
  };
}

export interface PipelineStep<TInput, TOutput> {
  readonly name: string;
  readonly version: string;

  execute(
    context: PipelineContext,
    input: TInput,
    signal: AbortSignal
  ): Promise<TOutput>;

  calculateCacheKey(input: TInput): Promise<string>;
}

export class ValidationError extends Error {
  public readonly retryable = false;

  public constructor(
    message: string,
    public readonly remediation = "Fix the invalid input and retry.",
    public readonly step?: string,
    public readonly episodeId?: EpisodeId,
    public readonly sceneId?: SceneId,
    public readonly internalCause?: unknown
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export class ConfigurationError extends Error {
  public readonly retryable = false;

  public constructor(message: string, public readonly remediation = "Review configuration and environment variables.") {
    super(message);
    this.name = "ConfigurationError";
  }
}

export class UnsupportedSourceError extends Error {
  public readonly retryable = false;

  public constructor(message: string, public readonly remediation = "Use a supported local file or authorized source.") {
    super(message);
    this.name = "UnsupportedSourceError";
  }
}

export class SourceAcquisitionError extends Error {
  public readonly retryable = false;

  public constructor(message: string, public readonly remediation = "Verify the source file or transcript and try again.") {
    super(message);
    this.name = "SourceAcquisitionError";
  }
}

export class ProviderAuthenticationError extends Error {
  public readonly retryable = false;
  public constructor(message: string, public readonly remediation = "Add the required provider credentials.") {
    super(message);
    this.name = "ProviderAuthenticationError";
  }
}

export class ProviderRateLimitError extends Error {
  public readonly retryable = true;
  public constructor(message: string, public readonly remediation = "Retry later or reduce request volume.") {
    super(message);
    this.name = "ProviderRateLimitError";
  }
}

export class ProviderResponseError extends Error {
  public readonly retryable = false;
  public constructor(message: string, public readonly remediation = "Inspect the provider response and adjust the request.") {
    super(message);
    this.name = "ProviderResponseError";
  }
}

export class ProcessExecutionError extends Error {
  public readonly retryable = true;
  public constructor(message: string, public readonly remediation = "Inspect the command output and rerun if the failure was transient.") {
    super(message);
    this.name = "ProcessExecutionError";
  }
}

export class MediaValidationError extends Error {
  public readonly retryable = false;
  public constructor(message: string, public readonly remediation = "Replace or repair the media artifact.") {
    super(message);
    this.name = "MediaValidationError";
  }
}

export class ArtifactNotFoundError extends Error {
  public readonly retryable = false;
  public constructor(message: string, public readonly remediation = "Regenerate the missing artifact or re-import it.") {
    super(message);
    this.name = "ArtifactNotFoundError";
  }
}

export class PipelineInvariantError extends Error {
  public readonly retryable = false;
  public constructor(message: string, public readonly remediation = "Review the manifest and pipeline step sequencing.") {
    super(message);
    this.name = "PipelineInvariantError";
  }
}

export class HumanActionRequiredError extends Error {
  public readonly retryable = false;
  public constructor(message: string, public readonly remediation = "Complete the required human action and rerun the command.") {
    super(message);
    this.name = "HumanActionRequiredError";
  }
}
