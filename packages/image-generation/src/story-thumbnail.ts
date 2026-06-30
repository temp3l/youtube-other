import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import sharp from "sharp";
import { z } from "zod";
import {
  currentExecutionTelemetry,
  estimateImageGenerationCost,
} from "@mediaforge/observability";
import {
  createEpisodePathResolver,
  ensureWorkspacePath,
  fileExists,
  hashFile,
  hashText,
  normalizeWhitespace,
  readJsonIfExists,
  writeBinaryAtomic,
  writeJsonAtomic,
} from "@mediaforge/shared";
import {
  STABLE_JSON_SERIALIZER_VERSION,
  stableSerialize,
} from "@mediaforge/story-localization";

export const THUMBNAIL_PROMPT_VERSION = "horror-thumbnail-v1";
export const THUMBNAIL_MANIFEST_VERSION = 1;

export const THUMBNAIL_DIMENSIONS = {
  full: { width: 1536, height: 864, aspectRatio: "16:9" },
  short: { width: 864, height: 1536, aspectRatio: "9:16" },
} as const;

export type ThumbnailFormat = keyof typeof THUMBNAIL_DIMENSIONS;
export type ThumbnailTextStrategy = "model-rendered" | "post-rendered";
export type ThumbnailQuality = "low" | "medium" | "high" | "auto";

const THUMBNAIL_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "at",
  "das",
  "dem",
  "den",
  "der",
  "des",
  "die",
  "ein",
  "eine",
  "einem",
  "einen",
  "einer",
  "eines",
  "er",
  "es",
  "for",
  "her",
  "his",
  "ihr",
  "ihre",
  "ihren",
  "im",
  "in",
  "into",
  "is",
  "mein",
  "mit",
  "name",
  "names",
  "namen",
  "of",
  "on",
  "or",
  "she",
  "sie",
  "the",
  "their",
  "to",
  "und",
  "was",
]);

const localeSchema = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/iu, "Invalid locale code.");

const thumbnailFormatSchema = z.enum(["full", "short"]);
const thumbnailTextStrategySchema = z.enum([
  "model-rendered",
  "post-rendered",
]);
const thumbnailQualitySchema = z.enum(["low", "medium", "high", "auto"]);

const thumbnailStoryFileSchema = z
  .object({
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    protagonistDescription: z.string().trim().min(1).optional(),
    protagonist: z.string().trim().min(1).optional(),
    threatDescription: z.string().trim().min(1).optional(),
    threat: z.string().trim().min(1).optional(),
    settingDescription: z.string().trim().min(1).optional(),
    setting: z.string().trim().min(1).optional(),
    emphasisWord: z.string().trim().min(1).optional(),
    referenceImagePath: z.string().trim().min(1).optional(),
  })
  .transform((value) => ({
    title: value.title,
    summary: value.summary,
    protagonistDescription:
      value.protagonistDescription ?? value.protagonist ?? "",
    threatDescription: value.threatDescription ?? value.threat ?? "",
    settingDescription: value.settingDescription ?? value.setting ?? "",
    ...(value.emphasisWord ? { emphasisWord: value.emphasisWord } : {}),
    ...(value.referenceImagePath
      ? { referenceImagePath: value.referenceImagePath }
      : {}),
  }))
  .superRefine((value, context) => {
    if (value.protagonistDescription.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["protagonistDescription"],
        message: "protagonistDescription is required.",
      });
    }
    if (value.threatDescription.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["threatDescription"],
        message: "threatDescription is required.",
      });
    }
    if (value.settingDescription.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["settingDescription"],
        message: "settingDescription is required.",
      });
    }
  });

const storyThumbnailInputSchema = z
  .object({
    workspaceRoot: z.string().min(1),
    episodeSlug: z.string().trim().min(1),
    locale: localeSchema,
    format: thumbnailFormatSchema,
    hookText: z.string().trim().min(1).max(60),
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    protagonistDescription: z.string().trim().min(1).optional(),
    threatDescription: z.string().trim().min(1).optional(),
    settingDescription: z.string().trim().min(1).optional(),
    emphasisWord: z.string().trim().min(1).optional(),
    referenceImagePath: z.string().trim().min(1).optional(),
    model: z.string().trim().min(1).optional(),
    quality: thumbnailQualitySchema.optional(),
    textStrategy: thumbnailTextStrategySchema.optional(),
    dryRun: z.boolean().optional(),
    force: z.boolean().optional(),
    verbose: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (value.referenceImagePath) {
      try {
        ensureWorkspacePath(value.workspaceRoot, value.referenceImagePath);
      } catch {
        context.addIssue({
          code: "custom",
          path: ["referenceImagePath"],
          message: "Reference image path must stay inside the workspace.",
        });
      }
    }
  });

const thumbnailManifestSchema = z.object({
  manifestVersion: z.number().int().positive(),
  episodeSlug: z.string().min(1),
  locale: z.string().min(1),
  format: thumbnailFormatSchema,
  dimensions: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    aspectRatio: z.string().min(1),
  }),
  model: z.string().min(1),
  quality: thumbnailQualitySchema,
  outputFormat: z.literal("png"),
  textStrategy: thumbnailTextStrategySchema,
  promptVersion: z.string().min(1),
  promptFingerprint: z.string().min(1),
  sourceFingerprint: z.string().min(1),
  hookText: z.string().min(1),
  emphasisWord: z.string().min(1),
  imageSha256: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  generatedAt: z.string().min(1),
  requestId: z.string().min(1).optional(),
  pricingVersion: z.string().min(1),
  estimatedCostMicros: z.number().int().nullable(),
});

export type ThumbnailStoryFile = z.infer<typeof thumbnailStoryFileSchema>;
export type GenerateStoryThumbnailInput = z.infer<
  typeof storyThumbnailInputSchema
>;
export type StoryThumbnailManifest = z.infer<typeof thumbnailManifestSchema>;

export interface OpenAiThumbnailGenerationSettings {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly organization?: string;
  readonly project?: string;
  readonly model: string;
  readonly quality: ThumbnailQuality;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly maxPayloadBytes: number;
  readonly textStrategy: ThumbnailTextStrategy;
}

export interface CompiledStoryThumbnailPrompt {
  readonly promptText: string;
  readonly promptFingerprint: string;
  readonly sourceFingerprint: string;
  readonly promptVersion: string;
  readonly normalizedHookText: string;
  readonly emphasisWord: string;
}

export interface GeneratedStoryThumbnail {
  readonly episodeSlug: string;
  readonly locale: string;
  readonly format: ThumbnailFormat;
  readonly outputPath: string;
  readonly manifestPath: string;
  readonly model: string;
  readonly quality: ThumbnailQuality;
  readonly textStrategy: ThumbnailTextStrategy;
  readonly width: number;
  readonly height: number;
  readonly promptVersion: string;
  readonly promptFingerprint: string;
  readonly sourceFingerprint: string;
  readonly hookText: string;
  readonly emphasisWord: string;
  readonly requestId?: string;
  readonly imageSha256?: string;
  readonly byteSize?: number;
  readonly dryRun: boolean;
  readonly reused: boolean;
  readonly generated: boolean;
  readonly pricingVersion?: string;
  readonly estimatedCostMicros?: number | null;
  readonly promptText?: string;
}

type ThumbnailApiSuccessPayload = {
  readonly data: ReadonlyArray<{
    readonly b64_json?: string;
    readonly url?: string;
  }>;
  readonly request_id?: string;
};

export interface ThumbnailOpenAiClientLike {
  readonly images: {
    generate(
      body: Record<string, unknown>,
      options?: { readonly signal?: AbortSignal }
    ):
      | Promise<ThumbnailApiSuccessPayload>
      | {
          readonly withResponse: () => Promise<ThumbnailApiSuccessPayload>;
        };
  };
}

class StoryThumbnailError extends Error {
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

export class ThumbnailDimensionMismatchError extends StoryThumbnailError {
  public constructor(message: string, cause?: unknown) {
    super(
      "ThumbnailDimensionMismatchError",
      "thumbnail_dimension_mismatch_error",
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

function parseEnvInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadOpenAiThumbnailGenerationSettings(
  env: Readonly<Record<string, string | undefined>> = process.env
): OpenAiThumbnailGenerationSettings {
  const apiKey = env["OPENAI_API_KEY"];
  if (!apiKey) {
    throw new ThumbnailAuthenticationError(
      "OPENAI_API_KEY is required for thumbnail generation."
    );
  }
  const quality = thumbnailQualitySchema.parse(
    env["OPENAI_THUMBNAIL_QUALITY"] ?? "high"
  );
  const textStrategy = thumbnailTextStrategySchema.parse(
    env["OPENAI_THUMBNAIL_TEXT_STRATEGY"] ?? "post-rendered"
  );
  const organization = env["OPENAI_ORGANIZATION"] ?? env["OPENAI_ORG_ID"];
  return {
    apiKey,
    model: env["OPENAI_THUMBNAIL_MODEL"] ?? "gpt-image-2",
    quality,
    timeoutMs: parseEnvInt(env["OPENAI_THUMBNAIL_TIMEOUT_MS"], 180_000),
    maxRetries: parseEnvInt(env["OPENAI_THUMBNAIL_MAX_RETRIES"], 2),
    maxPayloadBytes: parseEnvInt(
      env["OPENAI_THUMBNAIL_MAX_PAYLOAD_BYTES"],
      20 * 1024 * 1024
    ),
    textStrategy,
    ...(env["OPENAI_BASE_URL"] ? { baseUrl: env["OPENAI_BASE_URL"] } : {}),
    ...(organization ? { organization } : {}),
    ...(env["OPENAI_PROJECT"] ? { project: env["OPENAI_PROJECT"] } : {}),
  };
}

export function selectThumbnailEmphasisWord(
  hookText: string,
  locale = "en"
): string {
  const upperHook = normalizeWhitespace(hookText).toLocaleUpperCase(locale);
  const tokens = upperHook
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  const emphasis =
    tokens.find((token) => token.length > 2 && !THUMBNAIL_STOPWORDS.has(token.toLowerCase())) ??
    tokens[0];
  if (!emphasis) {
    throw new ThumbnailPromptCompilationError(
      "Hook text must contain at least one word after normalization."
    );
  }
  return emphasis;
}

function buildTextInstructions(
  strategy: ThumbnailTextStrategy,
  hookText: string,
  format: ThumbnailFormat
): string {
  if (strategy === "model-rendered") {
    return [
      `Include the exact localized uppercase hook text "${hookText}" in the ${format} thumbnail.`,
      "Keep the text bold, simple, large, and readable from a small mobile preview.",
      "Do not invent alternate wording, subtitles, or extra labels.",
    ].join(" ");
  }
  return [
    "Do not render any text, letters, captions, signs, logos, subtitles, or watermarks in the image.",
    "Leave clean negative space in the text-safe area for exact post-rendered typography.",
  ].join(" ");
}

function formatComposition(format: ThumbnailFormat): string {
  if (format === "full") {
    return "Landscape composition with a left text-safe area, the protagonist center-right, and the threat in the upper-right or deep background.";
  }
  return "Vertical composition with a left or upper-left stacked text-safe area, the protagonist lower-middle or lower-right, and the threat upper-middle or upper-right.";
}

export function buildOpenAiThumbnailRequestBody(args: {
  readonly input: GenerateStoryThumbnailInput;
  readonly settings: OpenAiThumbnailGenerationSettings;
  readonly promptText: string;
}): Record<string, unknown> {
  const dimensions = THUMBNAIL_DIMENSIONS[args.input.format];
  return {
    model: args.input.model ?? args.settings.model,
    prompt: args.promptText,
    size: `${dimensions.width}x${dimensions.height}`,
    quality: args.input.quality ?? args.settings.quality,
    output_format: "png",
    background: "opaque",
    n: 1,
  };
}

export function computeThumbnailSourceFingerprint(
  input: GenerateStoryThumbnailInput,
  settings: Pick<OpenAiThumbnailGenerationSettings, "model" | "quality">
): string {
  const referenceImageFingerprint = input.referenceImagePath
    ? hashText(path.resolve(input.referenceImagePath))
    : null;
  return hashText(
    stableSerialize({
      serializerVersion: STABLE_JSON_SERIALIZER_VERSION,
      episodeSlug: normalizeWhitespace(input.episodeSlug),
      locale: input.locale.toLowerCase(),
      format: input.format,
      dimensions: THUMBNAIL_DIMENSIONS[input.format],
      title: normalizeWhitespace(input.title),
      summary: normalizeWhitespace(input.summary),
      protagonistDescription: normalizeWhitespace(
        input.protagonistDescription ?? ""
      ),
      threatDescription: normalizeWhitespace(input.threatDescription ?? ""),
      settingDescription: normalizeWhitespace(input.settingDescription ?? ""),
      hookText: normalizeWhitespace(input.hookText),
      emphasisWord: normalizeWhitespace(input.emphasisWord ?? ""),
      model: input.model ?? settings.model,
      quality: input.quality ?? settings.quality,
      textStrategy: input.textStrategy ?? "post-rendered",
      referenceImageFingerprint,
    })
  );
}

export function compileStoryThumbnailPrompt(
  rawInput: GenerateStoryThumbnailInput,
  settings: Pick<OpenAiThumbnailGenerationSettings, "model" | "quality" | "textStrategy">
): CompiledStoryThumbnailPrompt {
  const input = storyThumbnailInputSchema.parse({
    ...rawInput,
    textStrategy: rawInput.textStrategy ?? settings.textStrategy,
    quality: rawInput.quality ?? settings.quality,
  });
  const textStrategy = input.textStrategy ?? settings.textStrategy;
  const normalizedHookText = normalizeWhitespace(input.hookText).toLocaleUpperCase(
    input.locale
  );
  const emphasisWord = normalizeWhitespace(
    input.emphasisWord ?? selectThumbnailEmphasisWord(normalizedHookText, input.locale)
  ).toLocaleUpperCase(input.locale);
  const sourceFingerprint = computeThumbnailSourceFingerprint(input, settings);
  const dimensions = THUMBNAIL_DIMENSIONS[input.format];
  const promptText = [
    `PROMPT VERSION: ${THUMBNAIL_PROMPT_VERSION}`,
    "",
    "OUTPUT FORMAT AND DIMENSIONS",
    `- Create one exact ${dimensions.width}x${dimensions.height} PNG image.`,
    `- Compose for ${dimensions.aspectRatio}.`,
    "",
    "VISUAL STYLE",
    "- Photorealistic cinematic horror.",
    "- Dark blue-black lighting.",
    "- High contrast with clean readable shapes.",
    "- Serious, grounded, supernatural dread.",
    "",
    "FOREGROUND SUBJECT",
    `- One clear adult foreground subject: ${normalizeWhitespace(input.protagonistDescription ?? "adult protagonist")}.`,
    "",
    "DOMINANT THREAT",
    `- One dominant supernatural threat: ${normalizeWhitespace(input.threatDescription ?? "supernatural threat")}.`,
    "",
    "SETTING",
    `- Setting: ${normalizeWhitespace(input.settingDescription ?? input.title)}.`,
    "",
    "COMPOSITION",
    `- ${formatComposition(input.format)}`,
    "",
    "LOCALIZED TEXT",
    `- ${buildTextInstructions(textStrategy, normalizedHookText, input.format)}`,
    "",
    "TYPOGRAPHY",
    `- Planned hook text: ${normalizedHookText}.`,
    `- Planned emphasis word: ${emphasisWord}.`,
    "",
    "STORY CONTEXT",
    `- Title: ${normalizeWhitespace(input.title)}.`,
    `- Summary: ${normalizeWhitespace(input.summary)}.`,
    "",
    "EXCLUSIONS",
    "- No collage.",
    "- No contact sheet.",
    "- No watermark.",
    "- No extra characters.",
    "- No gore.",
    "- No sexualized content.",
    "",
    "SAFETY CONSTRAINTS",
    "- Keep the image readable and uncluttered.",
    "- Keep the threat supernatural, not graphic.",
    "- Keep the composition simple enough for a thumbnail preview.",
  ].join("\n");
  const promptFingerprint = hashText(
    stableSerialize({
      promptVersion: THUMBNAIL_PROMPT_VERSION,
      promptText,
      sourceFingerprint,
      size: `${dimensions.width}x${dimensions.height}`,
      quality: input.quality ?? settings.quality,
      model: input.model ?? settings.model,
      textStrategy,
    })
  );
  return {
    promptText,
    promptFingerprint,
    sourceFingerprint,
    promptVersion: THUMBNAIL_PROMPT_VERSION,
    normalizedHookText,
    emphasisWord,
  };
}

type WrappedTypographyLayout = {
  readonly lines: readonly string[];
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly availableWidth: number;
  readonly textBoxHeight: number;
};

function estimateLineWidth(line: string, fontSize: number): number {
  return (
    [...line].reduce((total, character) => {
      if (character === " ") {
        return total + fontSize * 0.35;
      }
      if (/^[MW]$/u.test(character)) {
        return total + fontSize * 0.9;
      }
      return total + fontSize * 0.62;
    }, 0) + fontSize * 0.2
  );
}

function wrapTypography(args: {
  readonly hookText: string;
  readonly format: ThumbnailFormat;
}): WrappedTypographyLayout {
  const dimensions = THUMBNAIL_DIMENSIONS[args.format];
  const marginX = Math.round(dimensions.width * 0.06);
  const marginY = Math.round(dimensions.height * 0.08);
  const availableWidth =
    args.format === "full"
      ? Math.round(dimensions.width * 0.42)
      : Math.round(dimensions.width * 0.68);
  const availableHeight =
    args.format === "full"
      ? Math.round(dimensions.height * 0.72)
      : Math.round(dimensions.height * 0.44);
  const words = normalizeWhitespace(args.hookText)
    .split(" ")
    .filter((word) => word.length > 0);
  for (let fontSize = args.format === "full" ? 110 : 100; fontSize >= 44; fontSize -= 4) {
    const lines: string[] = [];
    for (const word of words) {
      const candidate = lines.length === 0 ? word : `${lines[lines.length - 1]} ${word}`;
      if (
        lines.length > 0 &&
        estimateLineWidth(candidate, fontSize) <= availableWidth
      ) {
        lines[lines.length - 1] = candidate;
      } else if (estimateLineWidth(word, fontSize) <= availableWidth) {
        lines.push(word);
      } else {
        lines.length = 0;
        break;
      }
    }
    if (lines.length === 0) {
      continue;
    }
    const lineHeight = Math.round(fontSize * 1.02);
    const textBoxHeight = lines.length * lineHeight;
    if (textBoxHeight <= availableHeight) {
      return {
        lines,
        fontSize,
        lineHeight,
        anchorX: marginX,
        anchorY: marginY + fontSize,
        availableWidth,
        textBoxHeight,
      };
    }
  }
  throw new ThumbnailPromptCompilationError(
    `Hook text cannot fit inside the ${args.format} thumbnail safe area.`
  );
}

function buildTypographySvg(args: {
  readonly format: ThumbnailFormat;
  readonly width: number;
  readonly height: number;
  readonly hookText: string;
  readonly emphasisWord: string;
  readonly locale: string;
}): Buffer {
  const layout = wrapTypography({
    hookText: args.hookText.toLocaleUpperCase(args.locale),
    format: args.format,
  });
  const normalizedEmphasis = args.emphasisWord.toLocaleUpperCase(args.locale);
  const linesSvg = layout.lines
    .map((line, index) => {
      const y = layout.anchorY + index * layout.lineHeight;
      const pieces = line.split(" ").map((word) => {
        const color = word === normalizedEmphasis ? "#ff3b30" : "#ffffff";
        return `<tspan fill="${color}">${escapeXml(word)}</tspan>`;
      });
      return `<text x="${layout.anchorX}" y="${y}" font-size="${layout.fontSize}" font-family="Arial, Helvetica, sans-serif" font-weight="800" letter-spacing="0" paint-order="stroke" stroke="#000000" stroke-width="12" stroke-linejoin="round" fill="#ffffff">${pieces.join('<tspan fill="#ffffff"> </tspan>')}</text>`;
    })
    .join("");
  const svg = [
    `<svg width="${args.width}" height="${args.height}" viewBox="0 0 ${args.width} ${args.height}" xmlns="http://www.w3.org/2000/svg">`,
    `<defs><filter id="shadow"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.65"/></filter></defs>`,
    `<g filter="url(#shadow)">${linesSvg}</g>`,
    "</svg>",
  ].join("");
  return Buffer.from(svg, "utf8");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

export async function compositeStoryThumbnailText(args: {
  readonly input: Pick<
    GenerateStoryThumbnailInput,
    "format" | "locale" | "hookText" | "emphasisWord"
  >;
  readonly imageBuffer: Buffer;
}): Promise<Buffer> {
  const dimensions = THUMBNAIL_DIMENSIONS[args.input.format];
  const emphasisWord = args.input.emphasisWord
    ? normalizeWhitespace(args.input.emphasisWord).toLocaleUpperCase(args.input.locale)
    : selectThumbnailEmphasisWord(args.input.hookText, args.input.locale);
  const overlay = buildTypographySvg({
    format: args.input.format,
    width: dimensions.width,
    height: dimensions.height,
    hookText: normalizeWhitespace(args.input.hookText),
    emphasisWord,
    locale: args.input.locale,
  });
  return sharp(args.imageBuffer)
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

function formatErrorContext(args: {
  readonly input: Pick<
    GenerateStoryThumbnailInput,
    "episodeSlug" | "locale" | "format"
  >;
  readonly model: string;
  readonly promptFingerprint?: string;
  readonly guidance: string;
}): string {
  return [
    `episode=${args.input.episodeSlug}`,
    `locale=${args.input.locale}`,
    `format=${args.input.format}`,
    `model=${args.model}`,
    ...(args.promptFingerprint
      ? [`promptFingerprint=${args.promptFingerprint}`]
      : []),
    args.guidance,
  ].join(" | ");
}

function getOpenAiErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const apiError = error as {
    readonly code?: unknown;
    readonly error?: { readonly code?: unknown };
  };
  if (typeof apiError.code === "string") {
    return apiError.code;
  }
  if (typeof apiError.error?.code === "string") {
    return apiError.error.code;
  }
  return undefined;
}

function isRetryableOpenAiError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return true;
  }
  const code = getOpenAiErrorCode(error);
  if (
    code === "billing_hard_limit_reached" ||
    code === "insufficient_quota" ||
    code === "invalid_api_key" ||
    code === "model_not_found"
  ) {
    return false;
  }
  const status = (error as { readonly status?: unknown }).status;
  return typeof status === "number"
    ? status === 408 || status === 409 || status === 429 || status >= 500
    : true;
}

function classifyGenerationError(args: {
  readonly input: Pick<
    GenerateStoryThumbnailInput,
    "episodeSlug" | "locale" | "format"
  >;
  readonly model: string;
  readonly promptFingerprint: string;
  readonly error: unknown;
}): StoryThumbnailError {
  const errorObject = args.error as {
    readonly status?: number;
    readonly message?: string;
  };
  const message =
    typeof errorObject?.message === "string"
      ? errorObject.message
      : args.error instanceof Error
        ? args.error.message
        : String(args.error);
  const contextual = formatErrorContext({
    input: args.input,
    model: args.model,
    promptFingerprint: args.promptFingerprint,
    guidance: "Check API credentials, retryability, and input policy compliance.",
  });
  if (
    getOpenAiErrorCode(args.error) === "invalid_api_key" ||
    errorObject?.status === 401
  ) {
    return new ThumbnailAuthenticationError(`${message} | ${contextual}`, args.error);
  }
  if (errorObject?.status === 429) {
    return new ThumbnailRateLimitError(`${message} | ${contextual}`, args.error);
  }
  if (errorObject?.status === 400 || errorObject?.status === 403) {
    return new ThumbnailPolicyError(`${message} | ${contextual}`, args.error);
  }
  return new ThumbnailGenerationError(
    `${message} | ${contextual}`,
    isRetryableOpenAiError(args.error),
    args.error
  );
}

async function decodeGeneratedImage(args: {
  readonly payload: { readonly b64_json?: string; readonly url?: string };
  readonly maxPayloadBytes: number;
  readonly fetchImpl?: typeof fetch;
}): Promise<Buffer> {
  if (args.payload.b64_json) {
    let buffer: Buffer;
    try {
      buffer = Buffer.from(args.payload.b64_json, "base64");
    } catch (error) {
      throw new ThumbnailResponseError("Invalid base64 image payload.", false, error);
    }
    if (buffer.length === 0) {
      throw new ThumbnailResponseError("Empty base64 image payload.", false);
    }
    if (buffer.length > args.maxPayloadBytes) {
      throw new ThumbnailResponseError("Thumbnail payload exceeds the configured byte limit.", false);
    }
    return buffer;
  }
  if (args.payload.url) {
    const fetchImpl = args.fetchImpl ?? fetch;
    const response = await fetchImpl(args.payload.url);
    if (!response.ok) {
      throw new ThumbnailResponseError(
        `OpenAI returned an image URL that could not be downloaded: ${response.status}.`,
        isRetryableOpenAiError({ status: response.status })
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > args.maxPayloadBytes) {
      throw new ThumbnailResponseError("Thumbnail payload exceeds the configured byte limit.", false);
    }
    return buffer;
  }
  throw new ThumbnailResponseError(
    "OpenAI image response did not include base64 data or a URL.",
    false
  );
}

async function validateExactDimensions(
  imageBuffer: Buffer,
  format: ThumbnailFormat
): Promise<void> {
  const dimensions = THUMBNAIL_DIMENSIONS[format];
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(imageBuffer).metadata();
  } catch (error) {
    throw new ThumbnailResponseError(
      "Generated image payload could not be decoded.",
      false,
      error
    );
  }
  if (
    metadata.width !== dimensions.width ||
    metadata.height !== dimensions.height
  ) {
    throw new ThumbnailDimensionMismatchError(
      `Generated thumbnail dimensions ${metadata.width ?? "unknown"}x${metadata.height ?? "unknown"} do not match required ${dimensions.width}x${dimensions.height}.`
    );
  }
  if (!metadata.format) {
    throw new ThumbnailResponseError("Generated image could not be decoded.", false);
  }
}

async function readThumbnailManifest(
  manifestPath: string
): Promise<StoryThumbnailManifest | null> {
  return readJsonIfExists(manifestPath, (value) => thumbnailManifestSchema.parse(value));
}

function diffManifestFields(
  existing: StoryThumbnailManifest | null,
  expected: Omit<StoryThumbnailManifest, "generatedAt" | "imageSha256" | "byteSize">
): string[] {
  if (!existing) {
    return ["manifest"];
  }
  const changed: string[] = [];
  if (existing.model !== expected.model) {
    changed.push("model");
  }
  if (existing.quality !== expected.quality) {
    changed.push("quality");
  }
  if (existing.textStrategy !== expected.textStrategy) {
    changed.push("textStrategy");
  }
  if (existing.promptFingerprint !== expected.promptFingerprint) {
    changed.push("promptFingerprint");
  }
  if (existing.sourceFingerprint !== expected.sourceFingerprint) {
    changed.push("sourceFingerprint");
  }
  if (existing.hookText !== expected.hookText) {
    changed.push("hookText");
  }
  if (existing.emphasisWord !== expected.emphasisWord) {
    changed.push("emphasisWord");
  }
  if (
    existing.dimensions.width !== expected.dimensions.width ||
    existing.dimensions.height !== expected.dimensions.height
  ) {
    changed.push("dimensions");
  }
  return changed;
}

async function maybeReuseExistingThumbnail(args: {
  readonly outputPath: string;
  readonly manifestPath: string;
  readonly expectedManifest: Omit<
    StoryThumbnailManifest,
    "generatedAt" | "imageSha256" | "byteSize"
  >;
  readonly force: boolean;
}): Promise<
  | {
      readonly reused: true;
      readonly imageSha256: string;
      readonly byteSize: number;
    }
  | { readonly reused: false }
> {
  const existingManifest = await readThumbnailManifest(args.manifestPath);
  const outputExists = await fileExists(args.outputPath);
  const changedFields = diffManifestFields(existingManifest, args.expectedManifest);
  if (
    existingManifest &&
    outputExists &&
    changedFields.length === 0 &&
    (await hashFile(args.outputPath)) === existingManifest.imageSha256
  ) {
    const stat = await fs.stat(args.outputPath);
    return {
      reused: true,
      imageSha256: existingManifest.imageSha256,
      byteSize: stat.size,
    };
  }
  if ((existingManifest || outputExists) && !args.force) {
    throw new ThumbnailArtifactConflictError(
      `Thumbnail artifact conflict for ${args.outputPath}. Changed fields: ${changedFields.join(", ") || "output"}. Rerun with --force to replace the targeted thumbnail.`
    );
  }
  return { reused: false };
}

async function requestGeneratedThumbnail(args: {
  readonly client: ThumbnailOpenAiClientLike;
  readonly input: GenerateStoryThumbnailInput;
  readonly settings: OpenAiThumbnailGenerationSettings;
  readonly compiled: CompiledStoryThumbnailPrompt;
  readonly fetchImpl?: typeof fetch;
}): Promise<{
  readonly imageBuffer: Buffer;
  readonly requestId?: string;
  readonly estimatedCostMicros: number | null;
  readonly pricingVersion: string;
  readonly attemptCount: number;
}> {
  const body = buildOpenAiThumbnailRequestBody({
    input: args.input,
    settings: args.settings,
    promptText: args.compiled.promptText,
  });
  const telemetry = currentExecutionTelemetry();
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= args.settings.maxRetries; attempt += 1) {
    try {
      const startedAt = new Date().toISOString();
      const responseCandidate = args.client.images.generate(body, {
        signal: AbortSignal.timeout(args.settings.timeoutMs),
      });
      const response =
        "withResponse" in responseCandidate
          ? await responseCandidate.withResponse()
          : await responseCandidate;
      const imageBuffer = await decodeGeneratedImage({
        payload: response.data[0] ?? {},
        maxPayloadBytes: args.settings.maxPayloadBytes,
        ...(args.fetchImpl ? { fetchImpl: args.fetchImpl } : {}),
      });
      await validateExactDimensions(imageBuffer, args.input.format);
      const cost = telemetry
        ? estimateImageGenerationCost(telemetry.catalog, {
            provider: "openai",
            model: args.input.model ?? args.settings.model,
            operation: "generate",
            size: body["size"] as string,
            quality: (body["quality"] as string) ?? args.settings.quality,
          })
        : { costMicros: null, pricingVersion: "unconfigured", warning: undefined };
      telemetry?.recordApiCall({
        provider: "openai",
        model: args.input.model ?? args.settings.model,
        operation: "image-generation",
        startedAt,
        endedAt: new Date().toISOString(),
        durationMs: 0,
        attempt: attempt + 1,
        success: true,
        usage: { imageCount: 1 },
        details: { size: body["size"], quality: body["quality"] },
        ...(response.request_id ? { requestId: response.request_id } : {}),
      });
      telemetry?.recordCost({
        provider: "openai",
        model: args.input.model ?? args.settings.model,
        operation: "image-generation",
        costMicros: cost.costMicros,
        warning: cost.warning,
      });
      return {
        imageBuffer,
        estimatedCostMicros: cost.costMicros,
        pricingVersion: cost.pricingVersion,
        attemptCount: attempt + 1,
        ...(response.request_id ? { requestId: response.request_id } : {}),
      };
    } catch (error) {
      lastError = error;
      if (error instanceof StoryThumbnailError && !error.retryable) {
        throw error;
      }
      telemetry?.recordApiCall({
        provider: "openai",
        model: args.input.model ?? args.settings.model,
        operation: "image-generation",
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: 0,
        attempt: attempt + 1,
        success: false,
        retryable: isRetryableOpenAiError(error),
        details: { size: body["size"], quality: body["quality"] },
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      if (!isRetryableOpenAiError(error) || attempt >= args.settings.maxRetries) {
        throw classifyGenerationError({
          input: args.input,
          model: args.input.model ?? args.settings.model,
          promptFingerprint: args.compiled.promptFingerprint,
          error,
        });
      }
      const delayMs = Math.min(
        4000,
        400 * 2 ** attempt + Math.floor(Math.random() * 150)
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new ThumbnailGenerationError(
    `Thumbnail generation failed after retries. ${String(lastError)}`,
    true,
    lastError
  );
}

export async function readThumbnailStoryFile(args: {
  readonly workspaceRoot: string;
  readonly storyFilePath: string;
}): Promise<ThumbnailStoryFile> {
  const resolvedPath = ensureWorkspacePath(args.workspaceRoot, args.storyFilePath);
  let rawText: string;
  try {
    rawText = await fs.readFile(resolvedPath, "utf8");
  } catch (error) {
    throw new ThumbnailInputError(`Unable to read story file: ${resolvedPath}`, error);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch (error) {
    throw new ThumbnailInputError(`Story file must be valid JSON: ${resolvedPath}`, error);
  }
  return thumbnailStoryFileSchema.parse(parsed);
}

export async function generateStoryThumbnail(
  rawInput: GenerateStoryThumbnailInput,
  options?: {
    readonly settings?: OpenAiThumbnailGenerationSettings;
    readonly client?: ThumbnailOpenAiClientLike;
    readonly fetchImpl?: typeof fetch;
  }
): Promise<GeneratedStoryThumbnail> {
  const settings = options?.settings ?? loadOpenAiThumbnailGenerationSettings();
  const input = storyThumbnailInputSchema.parse({
    ...rawInput,
    textStrategy: rawInput.textStrategy ?? settings.textStrategy,
    quality: rawInput.quality ?? settings.quality,
  });
  const compiled = compileStoryThumbnailPrompt(input, settings);
  const resolver = createEpisodePathResolver(input.workspaceRoot);
  const outputPath = resolver.thumbnailFile({
    episodeId: input.episodeSlug as never,
    locale: input.locale as never,
    variant: input.format,
  });
  const manifestPath = path.join(path.dirname(outputPath), "thumbnail.manifest.json");
  const dimensions = THUMBNAIL_DIMENSIONS[input.format];
  const model = input.model ?? settings.model;
  const quality = input.quality ?? settings.quality;
  const textStrategy = input.textStrategy ?? settings.textStrategy;
  const expectedManifestBase = {
    manifestVersion: THUMBNAIL_MANIFEST_VERSION,
    episodeSlug: input.episodeSlug,
    locale: input.locale,
    format: input.format,
    dimensions,
    model,
    quality,
    outputFormat: "png" as const,
    textStrategy,
    promptVersion: compiled.promptVersion,
    promptFingerprint: compiled.promptFingerprint,
    sourceFingerprint: compiled.sourceFingerprint,
    hookText: compiled.normalizedHookText,
    emphasisWord: compiled.emphasisWord,
    pricingVersion: "unconfigured",
    estimatedCostMicros: null,
  };
  const reused = await maybeReuseExistingThumbnail({
    outputPath,
    manifestPath,
    expectedManifest: expectedManifestBase,
    force: input.force ?? false,
  });
  if (reused.reused) {
    currentExecutionTelemetry()?.recordImage({
      outputPath,
      model,
      generationMode: "thumbnail-reused",
      promptHash: compiled.promptFingerprint,
      outputSha256: reused.imageSha256,
    });
    return {
      episodeSlug: input.episodeSlug,
      locale: input.locale,
      format: input.format,
      outputPath,
      manifestPath,
      model,
      quality,
      textStrategy,
      width: dimensions.width,
      height: dimensions.height,
      promptVersion: compiled.promptVersion,
      promptFingerprint: compiled.promptFingerprint,
      sourceFingerprint: compiled.sourceFingerprint,
      hookText: compiled.normalizedHookText,
      emphasisWord: compiled.emphasisWord,
      imageSha256: reused.imageSha256,
      byteSize: reused.byteSize,
      dryRun: false,
      reused: true,
      generated: false,
    };
  }
  if (input.dryRun) {
    return {
      episodeSlug: input.episodeSlug,
      locale: input.locale,
      format: input.format,
      outputPath,
      manifestPath,
      model,
      quality,
      textStrategy,
      width: dimensions.width,
      height: dimensions.height,
      promptVersion: compiled.promptVersion,
      promptFingerprint: compiled.promptFingerprint,
      sourceFingerprint: compiled.sourceFingerprint,
      hookText: compiled.normalizedHookText,
      emphasisWord: compiled.emphasisWord,
      dryRun: true,
      reused: false,
      generated: false,
      ...(input.verbose ? { promptText: compiled.promptText } : {}),
    };
  }
  const client =
    options?.client ??
    (new OpenAI({
      apiKey: settings.apiKey,
      baseURL: settings.baseUrl,
      organization: settings.organization,
      project: settings.project,
    }) as unknown as ThumbnailOpenAiClientLike);
  const generated = await requestGeneratedThumbnail({
    client,
    input,
    settings,
    compiled,
    ...(options?.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });
  const imageBuffer =
    textStrategy === "post-rendered"
      ? await compositeStoryThumbnailText({
          input: {
            format: input.format,
            locale: input.locale,
            hookText: compiled.normalizedHookText,
            emphasisWord: compiled.emphasisWord,
          },
          imageBuffer: generated.imageBuffer,
        })
      : generated.imageBuffer;
  await validateExactDimensions(imageBuffer, input.format);
  try {
    await writeBinaryAtomic(outputPath, imageBuffer);
  } catch (error) {
    throw new ThumbnailPersistenceError(`Unable to write thumbnail image: ${outputPath}`, error);
  }
  const imageSha256 = await hashFile(outputPath);
  const stat = await fs.stat(outputPath);
  const manifest = thumbnailManifestSchema.parse({
    ...expectedManifestBase,
    generatedAt: new Date().toISOString(),
    requestId: generated.requestId,
    imageSha256,
    byteSize: stat.size,
    pricingVersion: generated.pricingVersion,
    estimatedCostMicros: generated.estimatedCostMicros,
  });
  try {
    await writeJsonAtomic(manifestPath, manifest);
  } catch (error) {
    throw new ThumbnailPersistenceError(`Unable to write thumbnail manifest: ${manifestPath}`, error);
  }
  currentExecutionTelemetry()?.recordImage({
    outputPath,
    model,
    generationMode: "thumbnail-generate",
    attempts: generated.attemptCount,
    promptHash: compiled.promptFingerprint,
    outputSha256: imageSha256,
    costMicros: generated.estimatedCostMicros,
    ...(generated.requestId ? { requestId: generated.requestId } : {}),
  });
  return {
    episodeSlug: input.episodeSlug,
    locale: input.locale,
    format: input.format,
    outputPath,
    manifestPath,
    model,
    quality,
    textStrategy,
    width: dimensions.width,
    height: dimensions.height,
    promptVersion: compiled.promptVersion,
    promptFingerprint: compiled.promptFingerprint,
    sourceFingerprint: compiled.sourceFingerprint,
    hookText: compiled.normalizedHookText,
    emphasisWord: compiled.emphasisWord,
    imageSha256,
    byteSize: stat.size,
    dryRun: false,
    reused: false,
    generated: true,
    pricingVersion: generated.pricingVersion,
    estimatedCostMicros: generated.estimatedCostMicros,
    ...(generated.requestId ? { requestId: generated.requestId } : {}),
    ...(input.verbose ? { promptText: compiled.promptText } : {}),
  };
}
