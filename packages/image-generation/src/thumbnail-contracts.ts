import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { normalizeWhitespace } from "@mediaforge/shared";
import {
  STABLE_JSON_SERIALIZER_VERSION,
  stableSerialize,
} from "@mediaforge/story-localization";

export const THUMBNAIL_PROMPT_VERSION = "cinematic-horror-reference-v2";
export const THUMBNAIL_MANIFEST_VERSION = 2;
export const THUMBNAIL_TEXT_LAYOUT_VERSION = "cinematic-horror-type-v1";
export const THUMBNAIL_DEFAULT_MAX_REFERENCE_BYTES = 20 * 1024 * 1024;
export const THUMBNAIL_DEFAULT_MAX_GENERATED_BYTES = 20 * 1024 * 1024;
export const THUMBNAIL_DEFAULT_TIMEOUT_MS = 180_000;
export const THUMBNAIL_DEFAULT_MAX_RETRIES = 2;
export const THUMBNAIL_DEFAULT_STYLE = "cinematic-horror" as const;

export const THUMBNAIL_OUTPUTS = {
  full: {
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
    referencePath: "reference-thumbnails/thumbnail-full.png",
    generationSize: "1536x1024",
  },
  short: {
    width: 1080,
    height: 1920,
    aspectRatio: "9:16",
    referencePath: "reference-thumbnails/thumbnail-short.png",
    generationSize: "1024x1536",
  },
} as const;

export type ThumbnailFormat = keyof typeof THUMBNAIL_OUTPUTS;
export type ThumbnailStyle = "cinematic-horror" | "editorial-card";
export type ThumbnailQuality = "low" | "medium" | "high" | "auto";

export const thumbnailFormatSchema = z.enum(["full", "short"]);
export const thumbnailStyleSchema = z.enum([
  "cinematic-horror",
  "editorial-card",
]);
export const thumbnailQualitySchema = z.enum(["low", "medium", "high", "auto"]);

export const localeSchema = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/iu, "Invalid locale code.");

export const generateThumbnailInputSchema = z.object({
  workspaceRoot: z.string().min(1),
  episodeSlug: z.string().trim().min(1),
  episodeNumber: z.number().int().positive().optional(),
  locale: localeSchema,
  format: thumbnailFormatSchema,
  style: thumbnailStyleSchema.optional(),
  storyTitle: z.string().trim().min(1),
  storySummary: z.string().trim().min(1),
  hookText: z.string().trim().min(1).max(120),
  protagonistDescription: z.string().trim().min(1),
  threatDescription: z.string().trim().min(1),
  settingDescription: z.string().trim().min(1),
  moodDescription: z.string().trim().min(1).optional(),
  keyVisualMoment: z.string().trim().min(1).optional(),
  emphasisWord: z.string().trim().min(1).optional(),
  referenceImagePath: z.string().trim().min(1).optional(),
  quality: thumbnailQualitySchema.optional(),
  force: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  verbose: z.boolean().optional(),
});

export type GenerateThumbnailInput = z.infer<typeof generateThumbnailInputSchema>;

export const thumbnailStoryFileSchema = z
  .object({
    episodeNumber: z.number().int().positive().optional(),
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    protagonistDescription: z.string().trim().min(1).optional(),
    protagonist: z.string().trim().min(1).optional(),
    threatDescription: z.string().trim().min(1).optional(),
    threat: z.string().trim().min(1).optional(),
    settingDescription: z.string().trim().min(1).optional(),
    setting: z.string().trim().min(1).optional(),
    moodDescription: z.string().trim().min(1).optional(),
    mood: z.string().trim().min(1).optional(),
    keyVisualMoment: z.string().trim().min(1).optional(),
    thumbnailConcept: z.string().trim().min(1).optional(),
    emphasisWord: z.string().trim().min(1).optional(),
    referenceImagePath: z.string().trim().min(1).optional(),
  })
  .transform((value) => ({
    ...(value.episodeNumber !== undefined
      ? { episodeNumber: value.episodeNumber }
      : {}),
    storyTitle: value.title,
    storySummary: value.summary,
    protagonistDescription:
      value.protagonistDescription ?? value.protagonist ?? "",
    threatDescription: value.threatDescription ?? value.threat ?? "",
    settingDescription: value.settingDescription ?? value.setting ?? "",
    ...(value.moodDescription ?? value.mood
      ? { moodDescription: value.moodDescription ?? value.mood ?? "" }
      : {}),
    ...(value.keyVisualMoment ?? value.thumbnailConcept
      ? {
          keyVisualMoment:
            value.keyVisualMoment ?? value.thumbnailConcept ?? "",
        }
      : {}),
    ...(value.emphasisWord ? { emphasisWord: value.emphasisWord } : {}),
    ...(value.referenceImagePath
      ? { referenceImagePath: value.referenceImagePath }
      : {}),
  }))
  .superRefine((value, context) => {
    for (const field of [
      "protagonistDescription",
      "threatDescription",
      "settingDescription",
    ] as const) {
      if (value[field].length === 0) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: `${field} is required.`,
        });
      }
    }
  });

export type ThumbnailStoryFile = z.infer<typeof thumbnailStoryFileSchema>;

export interface ThumbnailGenerationConfig {
  readonly model: string;
  readonly quality: ThumbnailQuality;
  readonly defaultStyle: ThumbnailStyle;
  readonly fullReferencePath: string;
  readonly shortReferencePath: string;
  readonly maxReferenceBytes: number;
  readonly maxGeneratedBytes: number;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly baseUrl?: string | undefined;
  readonly organization?: string | undefined;
  readonly project?: string | undefined;
  readonly apiKey: string;
}

export interface ResolvedThumbnailReference {
  readonly format: ThumbnailFormat;
  readonly path: string;
  readonly repoRelativePath: string;
  readonly sha256: string;
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
  readonly mimeType: string;
}

export interface CompiledThumbnailPrompt {
  readonly prompt: string;
  readonly version: string;
  readonly fingerprint: string;
  readonly sourceFingerprint: string;
  readonly format: ThumbnailFormat;
  readonly style: ThumbnailStyle;
  readonly referencePath: string;
  readonly referenceSha256: string;
}

export interface BackgroundArtifactManifest {
  readonly manifestVersion: number;
  readonly episodeSlug: string;
  readonly locale: string;
  readonly format: ThumbnailFormat;
  readonly style: ThumbnailStyle;
  readonly model: string;
  readonly quality: ThumbnailQuality;
  readonly generationDimensions: {
    readonly width: number;
    readonly height: number;
  };
  readonly finalDimensions: {
    readonly width: number;
    readonly height: number;
    readonly aspectRatio: string;
  };
  readonly promptVersion: string;
  readonly promptFingerprint: string;
  readonly sourceFingerprint: string;
  readonly backgroundFingerprint: string;
  readonly referencePath: string;
  readonly referenceSha256: string;
  readonly requestId?: string | undefined;
  readonly retryCount: number;
  readonly pricingVersion: string;
  readonly estimatedCostMicros: number | null;
  readonly generatedAt: string;
  readonly outputPath: string;
  readonly outputSha256: string;
  readonly outputBytes: number;
}

export interface FinalThumbnailManifest {
  readonly manifestVersion: number;
  readonly episodeSlug: string;
  readonly episodeNumber?: number | undefined;
  readonly locale: string;
  readonly format: ThumbnailFormat;
  readonly style: ThumbnailStyle;
  readonly dimensions: {
    readonly width: number;
    readonly height: number;
    readonly aspectRatio: string;
  };
  readonly backgroundSha256: string;
  readonly backgroundFingerprint: string;
  readonly hookText: string;
  readonly emphasisWord: string;
  readonly fontFamily: string;
  readonly textLayoutVersion: string;
  readonly compositionFingerprint: string;
  readonly generatedAt: string;
  readonly outputPath: string;
  readonly outputSha256: string;
  readonly outputBytes: number;
}

export const backgroundManifestSchema = z
  .object({
    manifestVersion: z.number().int().positive(),
    episodeSlug: z.string().min(1),
    locale: z.string().min(1),
    format: thumbnailFormatSchema,
    style: thumbnailStyleSchema,
    model: z.string().min(1),
    quality: thumbnailQualitySchema,
    generationDimensions: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
    finalDimensions: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      aspectRatio: z.string().min(1),
    }),
    promptVersion: z.string().min(1),
    promptFingerprint: z.string().min(1),
    sourceFingerprint: z.string().min(1),
    backgroundFingerprint: z.string().min(1),
    referencePath: z.string().min(1),
    referenceSha256: z.string().length(64),
    requestId: z.string().min(1).optional(),
    retryCount: z.number().int().nonnegative(),
    pricingVersion: z.string().min(1),
    estimatedCostMicros: z.number().int().nullable(),
    generatedAt: z.string().min(1),
    outputPath: z.string().min(1),
    outputSha256: z.string().length(64),
    outputBytes: z.number().int().nonnegative(),
  })
  .strict();

export const finalManifestSchema = z
  .object({
    manifestVersion: z.number().int().positive(),
    episodeSlug: z.string().min(1),
    episodeNumber: z.number().int().positive().optional(),
    locale: z.string().min(1),
    format: thumbnailFormatSchema,
    style: thumbnailStyleSchema,
    dimensions: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      aspectRatio: z.string().min(1),
    }),
    backgroundSha256: z.string().length(64),
    backgroundFingerprint: z.string().min(1),
    hookText: z.string().min(1),
    emphasisWord: z.string().min(1),
    fontFamily: z.string().min(1),
    textLayoutVersion: z.string().min(1),
    compositionFingerprint: z.string().min(1),
    generatedAt: z.string().min(1),
    outputPath: z.string().min(1),
    outputSha256: z.string().length(64),
    outputBytes: z.number().int().nonnegative(),
  })
  .strict();

export interface GeneratedThumbnailResult {
  readonly episodeSlug: string;
  readonly locale: string;
  readonly format: ThumbnailFormat;
  readonly style: ThumbnailStyle;
  readonly outputPath: string;
  readonly manifestPath: string;
  readonly backgroundPath: string;
  readonly backgroundManifestPath: string;
  readonly model: string;
  readonly quality: ThumbnailQuality;
  readonly width: number;
  readonly height: number;
  readonly generationSize: string;
  readonly promptVersion: string;
  readonly promptFingerprint: string;
  readonly sourceFingerprint: string;
  readonly backgroundFingerprint: string;
  readonly compositionFingerprint: string;
  readonly hookText: string;
  readonly emphasisWord: string;
  readonly referencePath: string;
  readonly referenceSha256: string;
  readonly dryRun: boolean;
  readonly reused: boolean;
  readonly backgroundReused: boolean;
  readonly compositionReused: boolean;
  readonly generated: boolean;
  readonly requestId?: string | undefined;
  readonly imageSha256?: string | undefined;
  readonly byteSize?: number | undefined;
  readonly pricingVersion?: string | undefined;
  readonly estimatedCostMicros?: number | null | undefined;
  readonly promptText?: string | undefined;
}

export class StoryThumbnailError extends Error {
  public readonly retryable: boolean;
  public readonly code: string;

  public constructor(
    name: string,
    code: string,
    message: string,
    retryable: boolean,
    cause?: unknown
  ) {
    super(message, cause ? { cause } : undefined);
    this.name = name;
    this.code = code;
    this.retryable = retryable;
  }
}

export class ThumbnailInputError extends StoryThumbnailError {
  public constructor(message: string, cause?: unknown) {
    super("ThumbnailInputError", "thumbnail_input_error", message, false, cause);
  }
}

export class ThumbnailReferenceNotFoundError extends StoryThumbnailError {
  public constructor(message: string, cause?: unknown) {
    super(
      "ThumbnailReferenceNotFoundError",
      "thumbnail_reference_not_found_error",
      message,
      false,
      cause
    );
  }
}

export class ThumbnailReferenceValidationError extends StoryThumbnailError {
  public constructor(message: string, cause?: unknown) {
    super(
      "ThumbnailReferenceValidationError",
      "thumbnail_reference_validation_error",
      message,
      false,
      cause
    );
  }
}

export class ThumbnailPromptCompilationError extends StoryThumbnailError {
  public constructor(message: string, cause?: unknown) {
    super(
      "ThumbnailPromptCompilationError",
      "thumbnail_prompt_compilation_error",
      message,
      false,
      cause
    );
  }
}

export class ThumbnailGenerationError extends StoryThumbnailError {
  public constructor(message: string, retryable: boolean, cause?: unknown) {
    super(
      "ThumbnailGenerationError",
      "thumbnail_generation_error",
      message,
      retryable,
      cause
    );
  }
}

export class ThumbnailPolicyError extends StoryThumbnailError {
  public constructor(message: string, cause?: unknown) {
    super("ThumbnailPolicyError", "thumbnail_policy_error", message, false, cause);
  }
}

export class ThumbnailRateLimitError extends StoryThumbnailError {
  public constructor(message: string, cause?: unknown) {
    super("ThumbnailRateLimitError", "thumbnail_rate_limit_error", message, true, cause);
  }
}

export class ThumbnailAuthenticationError extends StoryThumbnailError {
  public constructor(message: string, cause?: unknown) {
    super(
      "ThumbnailAuthenticationError",
      "thumbnail_authentication_error",
      message,
      false,
      cause
    );
  }
}

export class ThumbnailResponseError extends StoryThumbnailError {
  public constructor(message: string, retryable: boolean, cause?: unknown) {
    super(
      "ThumbnailResponseError",
      "thumbnail_response_error",
      message,
      retryable,
      cause
    );
  }
}

export class ThumbnailImageValidationError extends StoryThumbnailError {
  public constructor(message: string, cause?: unknown) {
    super(
      "ThumbnailImageValidationError",
      "thumbnail_image_validation_error",
      message,
      false,
      cause
    );
  }
}

export class ThumbnailCompositionError extends StoryThumbnailError {
  public constructor(message: string, cause?: unknown) {
    super(
      "ThumbnailCompositionError",
      "thumbnail_composition_error",
      message,
      false,
      cause
    );
  }
}

export class ThumbnailArtifactConflictError extends StoryThumbnailError {
  public constructor(message: string, cause?: unknown) {
    super(
      "ThumbnailArtifactConflictError",
      "thumbnail_artifact_conflict_error",
      message,
      false,
      cause
    );
  }
}

export class ThumbnailPersistenceError extends StoryThumbnailError {
  public constructor(message: string, cause?: unknown) {
    super(
      "ThumbnailPersistenceError",
      "thumbnail_persistence_error",
      message,
      false,
      cause
    );
  }
}

export function normalizeLocale(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeHookText(value: string, locale: string): string {
  return normalizeWhitespace(value).toLocaleUpperCase(locale);
}

export function serializeFingerprint(value: unknown): string {
  return stableSerialize({
    serializerVersion: STABLE_JSON_SERIALIZER_VERSION,
    payload: value,
  });
}

export function resolveRepoRoot(): string {
  return path.resolve(import.meta.dirname, "../../..");
}

export async function readJsonFile(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
}
