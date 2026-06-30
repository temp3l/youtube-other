import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  ensureDir,
  fileExists,
  hashText,
  formatTimestampLabel,
  normalizeWhitespace,
  safeBasename,
  writeJsonAtomic,
  writeTextAtomic
} from "@mediaforge/shared";
import { runCurl } from "@mediaforge/process-runner";
import { scenePlanSchema, type ScenePlan } from "@mediaforge/domain";
import {
  currentExecutionTelemetry,
  estimateTextGenerationCost
} from "@mediaforge/observability";

export const YOUTUBE_METADATA_PROMPT_VERSION = "youtube-metadata-v1";
export const YOUTUBE_METADATA_SCHEMA_VERSION = "1.0" as const;
export const YOUTUBE_METADATA_OWNER = "metadata" as const;
export const YOUTUBE_METADATA_OWNER_VERSION = "youtube-metadata-owner-v1";

const chapterTimestampPattern = /^(?:\d{2}:)?\d{2}:\d{2}$/u;
const metadataArtifactStatusSchema = z.enum(["completed", "failed"]);
const narrationDependencySchema = z
  .object({
    episodeNumber: z.string().min(1),
    episodeSlug: z.string().min(1),
    language: z.string().min(1),
    locale: z.string().min(1),
    variant: z.enum(["full", "short"]),
    narrationText: z.string().min(1),
    narrationFingerprint: z.string().regex(/^[a-f0-9]{64}$/iu),
  })
  .strict();
const generationInfoSchema = z.object({
  generatedAt: z.string().min(1),
  sourceFile: z.string().min(1),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/iu),
  promptVersion: z.string().min(1),
  model: z.string().min(1),
  openaiResponseId: z.string().min(1).optional(),
  attemptCount: z.number().int().positive(),
  chapterCharacterCount: z.number().int().nonnegative(),
  tagCharacterCount: z.number().int().nonnegative(),
  cacheKey: z.string().min(1),
  language: z.string().min(1),
  locale: z.string().min(1),
  variant: z.enum(["full", "short"]),
  owner: z.literal(YOUTUBE_METADATA_OWNER),
  ownerVersion: z.literal(YOUTUBE_METADATA_OWNER_VERSION),
  status: metadataArtifactStatusSchema,
  parentNarrationFingerprint: z.string().regex(/^[a-f0-9]{64}$/iu),
  modelConfigFingerprint: z.string().regex(/^[a-f0-9]{64}$/iu),
  promptSchemaFingerprint: z.string().regex(/^[a-f0-9]{64}$/iu),
  narration: narrationDependencySchema.omit({ narrationText: true }),
  failureCode: z.string().min(1).optional(),
  failureMessage: z.string().min(1).optional()
});

export const youtubeMetadataSchema = z.object({
  schemaVersion: z.literal("1.0"),
  source: z.object({
    sourceId: z.string().nullable(),
    sceneCount: z.number().int().positive(),
    durationSeconds: z.number().positive(),
    language: z.string().min(2)
  }),
  seo: z.object({
    primaryKeyword: z.string().min(1),
    secondaryKeywords: z.array(z.string().min(1)),
    viewerSearchIntent: z.string().min(1)
  }),
  title: z.object({
    recommended: z.string().min(1).max(100),
    alternatives: z.array(z.string().min(1).max(100)).length(5)
  }),
  description: z.string().min(1).max(5000),
  chapters: z.object({
    text: z.string().min(1).max(800),
    characterCount: z.number().int().min(1).max(800),
    items: z.array(
      z.object({
        timestamp: z.string().regex(chapterTimestampPattern),
        startSeconds: z.number().nonnegative(),
        title: z.string().min(1)
      })
    ).min(3)
  }),
  tags: z.object({
    text: z.string().min(1).max(500),
    characterCount: z.number().int().min(1).max(500),
    items: z.array(z.string().min(1))
  }),
  hashtags: z.array(z.string().regex(/^#[A-Za-z0-9_]+$/u)).max(3),
  thumbnail: z.object({
    recommendedText: z.string().min(1),
    alternativeTexts: z.array(z.string().min(1)).length(4),
    imagePrompt: z.string().min(1)
  }),
  uploadSettings: z.object({
    filename: z.string().min(1),
    category: z.string().min(1),
    videoLanguage: z.string().min(1),
    captionLanguage: z.string().min(1),
    madeForKids: z.boolean(),
    licence: z.string().min(1),
    playlists: z.array(z.string().min(1)),
    comments: z.string().min(1),
    automaticChapters: z.boolean()
  }),
  pinnedComment: z.string().min(1),
  socialTeaser: z.string().min(1),
  contentSummary: z.string().min(1),
  corrections: z.array(
    z.object({
      original: z.string().min(1),
      replacement: z.string().min(1),
      reason: z.string().min(1),
      confidence: z.enum(["high", "medium", "low"]),
      sceneIds: z.array(z.string().min(1))
    })
  ),
  verificationWarnings: z.array(
    z.object({
      claim: z.string().min(1),
      reason: z.string().min(1),
      sceneIds: z.array(z.string().min(1))
    })
  )
});
export type YoutubeMetadata = z.infer<typeof youtubeMetadataSchema>;

export interface YoutubeMetadataGenerationInfo {
  readonly generatedAt: string;
  readonly sourceFile: string;
  readonly sourceSha256: string;
  readonly promptVersion: string;
  readonly model: string;
  readonly openaiResponseId?: string | undefined;
  readonly attemptCount: number;
  readonly chapterCharacterCount: number;
  readonly tagCharacterCount: number;
  readonly cacheKey: string;
  readonly language: string;
  readonly locale: string;
  readonly variant: "full" | "short";
  readonly owner: typeof YOUTUBE_METADATA_OWNER;
  readonly ownerVersion: typeof YOUTUBE_METADATA_OWNER_VERSION;
  readonly status: "completed" | "failed";
  readonly parentNarrationFingerprint: string;
  readonly modelConfigFingerprint: string;
  readonly promptSchemaFingerprint: string;
  readonly narration: Omit<YoutubeMetadataNarrationDependency, "narrationText">;
  readonly failureCode?: string | undefined;
  readonly failureMessage?: string | undefined;
}

export interface YoutubeMetadataOutputs {
  readonly outputDir: string;
  readonly jsonPath: string;
  readonly markdownPath: string;
  readonly descriptionPath: string;
  readonly chaptersPath: string;
  readonly tagsPath: string;
  readonly pinnedCommentPath: string;
  readonly generationPath: string;
}

export interface YoutubeMetadataTarget {
  readonly sourceFilePath: string;
  readonly episodeDir: string;
  readonly outputDir: string;
  readonly episodeSlug: string;
  readonly sourceId: string | null;
  readonly language: string;
  readonly locale: string;
  readonly variant: "full" | "short";
  readonly scenePlan: ScenePlan;
  readonly sourceSha256: string;
  readonly durationSeconds: number;
  readonly narration: YoutubeMetadataNarrationDependency;
}

export interface YoutubeMetadataNarrationDependency {
  readonly episodeNumber: string;
  readonly episodeSlug: string;
  readonly language: string;
  readonly locale: string;
  readonly variant: "full" | "short";
  readonly narrationText: string;
  readonly narrationFingerprint: string;
}

export interface YoutubeMetadataGenerationOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | undefined;
  readonly maxOutputTokens: number | undefined;
  readonly repairModel: string | undefined;
  readonly repairReasoningEffort: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | undefined;
  readonly repairMaxOutputTokens: number | undefined;
  readonly fallbackModels?: ReadonlyArray<string>;
  readonly language: string;
  readonly promptText: string;
  readonly promptVersion?: string;
  readonly baseUrl?: string;
  readonly maxRetries: number;
  readonly timeoutMs: number;
  readonly keepFile: boolean;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly client?: OpenAiMetadataClient;
  readonly logger?: MetadataLogger;
}

export interface OpenAiMetadataClient {
  readonly files: {
    create(request: { readonly filePath: string; readonly purpose: "user_data" }, options?: { readonly signal?: AbortSignal }): Promise<{ readonly id: string }>;
    delete(fileId: string, options?: { readonly signal?: AbortSignal }): Promise<unknown>;
  };
    readonly responses: {
      create(request: {
        readonly model: string;
        readonly instructions?: string;
        readonly reasoning?: {
          readonly effort: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
        };
        readonly input: ReadonlyArray<{
          readonly role: "user";
          readonly content: ReadonlyArray<
            | { readonly type: "input_file"; readonly file_id: string }
            | { readonly type: "input_text"; readonly text: string }
        >;
      }>;
      readonly text?: {
        readonly format: unknown;
      };
      readonly max_output_tokens?: number;
    }, options?: { readonly signal?: AbortSignal }): Promise<{
      readonly id: string;
      readonly output_text?: string | undefined;
      readonly output?: ReadonlyArray<{
        readonly type: string;
        readonly content?: ReadonlyArray<{
          readonly type: string;
          readonly text?: string;
        }>;
      }>;
    }>;
  };
}

function createOpenAiMetadataClient(apiKey: string, baseUrl?: string): OpenAiMetadataClient {
  const resolvedBaseUrl = new URL(baseUrl ?? "https://api.openai.com");
  return {
    files: {
      create: async (request, options) => {
        const result = await runCurl(
          [
            "--fail-with-body",
            "--silent",
            "--show-error",
            "--request",
            "POST",
            "--header",
            `Authorization: Bearer ${apiKey}`,
            "--form",
            `purpose=${request.purpose}`,
            "--form",
            `file=@${request.filePath}`,
            new URL("/v1/files", resolvedBaseUrl).toString()
        ],
          options?.signal ? { signal: options.signal } : {}
        );
        if (result.exitCode !== 0) {
          throw new OpenAIUploadError(result.stdout.trim() || result.stderr.trim() || "OpenAI file upload failed.", true, result.stderr || result.stdout);
        }
        return z.object({ id: z.string().min(1) }).parse(JSON.parse(result.stdout) as unknown);
      },
      delete: async (fileId, options) => {
        const result = await runCurl(
          [
            "--fail-with-body",
            "--silent",
            "--show-error",
            "--request",
            "DELETE",
            "--header",
            `Authorization: Bearer ${apiKey}`,
            new URL(`/v1/files/${encodeURIComponent(fileId)}`, resolvedBaseUrl).toString()
          ],
          options?.signal ? { signal: options.signal } : {}
        );
        if (result.exitCode !== 0) {
          throw new OpenAIResponseError(result.stdout.trim() || result.stderr.trim() || "OpenAI file delete failed.", true, result.stderr || result.stdout);
        }
        return result.stdout.length > 0 ? JSON.parse(result.stdout) as unknown : {};
      }
    },
    responses: {
      create: async (request, options) => {
        const body: Record<string, unknown> = {
          model: request.model,
          input: request.input
        };
        if (request.instructions !== undefined) {
          body["instructions"] = request.instructions;
        }
        if (request.max_output_tokens !== undefined) {
          body["max_output_tokens"] = request.max_output_tokens;
        }
        if (request.reasoning !== undefined && request.reasoning.effort !== "none") {
          body["reasoning"] = request.reasoning;
        }
        if (request.text !== undefined) {
          body["text"] = request.text;
        }
        const result = await runCurl(
          [
            "--fail-with-body",
            "--silent",
            "--show-error",
            "--request",
            "POST",
            "--header",
            `Authorization: Bearer ${apiKey}`,
            "--header",
            "Content-Type: application/json",
            "--data-binary",
            JSON.stringify(body),
            new URL("/v1/responses", resolvedBaseUrl).toString()
          ],
          options?.signal ? { signal: options.signal } : {}
        );
        if (result.exitCode !== 0) {
          throw new OpenAIResponseError(result.stdout.trim() || result.stderr.trim() || "OpenAI responses request failed.", true, result.stderr || result.stdout);
        }
        const parsed = z
          .object({
            id: z.string().min(1),
            output_text: z.string().optional(),
            output: z.array(
              z.object({
                type: z.string(),
                content: z
                  .array(
                    z.object({
                      type: z.string(),
                      text: z.string().optional()
                    })
                  )
                  .optional()
              })
            ).optional()
          })
          .parse(JSON.parse(result.stdout) as unknown);
        const output = (parsed.output ?? []).map((item) => ({
          type: item.type,
          ...(item.content !== undefined
            ? {
                content: item.content.map((content) => ({
                  type: content.type,
                  ...(content.text !== undefined ? { text: content.text } : {})
                }))
              }
            : {})
        }));
        return {
          id: parsed.id,
          ...(parsed.output_text !== undefined ? { output_text: parsed.output_text } : {}),
          output
        };
      }
    }
  };
}

export interface MetadataLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
  debug(obj: Record<string, unknown>, msg?: string): void;
}

export class ConfigurationError extends Error {
  public readonly code = "configuration_error";
  public readonly retryable = false;

  public constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "ConfigurationError";
  }
}

export class SourceFileError extends Error {
  public readonly code = "source_file_error";
  public readonly retryable = false;

  public constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "SourceFileError";
  }
}

export class SourceValidationError extends Error {
  public readonly code = "source_validation_error";
  public readonly retryable = false;

  public constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "SourceValidationError";
  }
}

export class OpenAIUploadError extends Error {
  public readonly code = "openai_upload_error";
  public readonly retryable: boolean;

  public constructor(message: string, retryable = true, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "OpenAIUploadError";
    this.retryable = retryable;
  }
}

export class OpenAIResponseError extends Error {
  public readonly code = "openai_response_error";
  public readonly retryable: boolean;

  public constructor(message: string, retryable = false, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "OpenAIResponseError";
    this.retryable = retryable;
  }
}

export class MetadataValidationError extends Error {
  public readonly code = "metadata_validation_error";
  public readonly retryable = false;

  public constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "MetadataValidationError";
  }
}

export class OutputWriteError extends Error {
  public readonly code = "output_write_error";
  public readonly retryable = false;

  public constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "OutputWriteError";
  }
}

function resolveEpisodeDirFromScenesFile(sourceFilePath: string): string {
  const resolved = path.resolve(sourceFilePath);
  const parent = path.basename(path.dirname(resolved));
  if (parent === "canonical") {
    return path.dirname(path.dirname(resolved));
  }
  if (parent === "output") {
    return path.dirname(path.dirname(resolved));
  }
  return path.dirname(resolved);
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function splitChapterLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseTagsText(tagsText: string): string[] {
  return tagsText
    .split(",")
    .map((tag) => normalizeWhitespace(tag))
    .filter((tag) => tag.length > 0);
}

function computeRetryDelayMs(attempt: number, retryAfterHeaderMs: number | null): number {
  const baseDelay = Math.min(1000 * 2 ** Math.max(0, attempt - 1), 8000);
  const jitter = Math.floor(baseDelay * 0.2 * Math.random());
  if (retryAfterHeaderMs !== null) {
    return Math.max(retryAfterHeaderMs, baseDelay + jitter);
  }
  return baseDelay + jitter;
}

function isRetryableOpenAiError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return true;
  }
  const value = error as {
    readonly status?: unknown;
    readonly code?: unknown;
    readonly error?: { readonly code?: unknown };
  };
  const code = typeof value.code === "string" ? value.code : typeof value.error?.code === "string" ? value.error.code : undefined;
  if (code === "insufficient_quota" || code === "billing_hard_limit_reached" || code === "invalid_api_key" || code === "model_not_found") {
    return false;
  }
  if (typeof value.status === "number") {
    return value.status === 408 || value.status === 409 || value.status === 429 || value.status >= 500;
  }
  return true;
}

function uniqueModels(models: ReadonlyArray<string>): string[] {
  return [...new Set(models.map((model) => model.trim()).filter((model) => model.length > 0))];
}

function resolveMetadataFallbackModels(model: string, fallbackModels?: ReadonlyArray<string>): string[] {
  const configuredFallbacks = uniqueModels(fallbackModels ?? []);
  if (configuredFallbacks.length > 0) {
    return configuredFallbacks.filter((fallbackModel) => fallbackModel !== model);
  }
  if (model.startsWith("gpt-4.1-")) {
    return ["gpt-4o-mini"];
  }
  if (model.startsWith("gpt-4o-")) {
    return ["gpt-4.1-mini"];
  }
  return [];
}

function describeOpenAiError(error: unknown): string {
  if (error && typeof error === "object") {
    const value = error as {
      readonly message?: unknown;
      readonly status?: unknown;
      readonly code?: unknown;
      readonly error?: { readonly message?: unknown; readonly code?: unknown };
      readonly stdout?: unknown;
      readonly stderr?: unknown;
    };
    const code = typeof value.code === "string" ? value.code : typeof value.error?.code === "string" ? value.error.code : undefined;
    if (code === "insufficient_quota") {
      return "OpenAI API returned insufficient_quota. Retries will not solve this; check API project billing, project selection, and API-key scope.";
    }
    const message = typeof value.error?.message === "string" ? value.error.message : typeof value.message === "string" ? value.message : "OpenAI request failed.";
    return `${message}${typeof value.status === "number" ? ` (status ${value.status})` : ""}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function withRetry<T>(
  operation: () => Promise<T>,
  options: { readonly maxRetries: number; readonly label: string; readonly logger?: MetadataLogger | undefined }
): Promise<T> {
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      return await operation();
    } catch (error: unknown) {
      const canRetry = isRetryableOpenAiError(error) && attempt <= options.maxRetries;
      if (!canRetry) {
        throw error;
      }
      const delay = computeRetryDelayMs(attempt, null);
      options.logger?.warn({ label: options.label, attempt, delayMs: delay, error: describeOpenAiError(error) }, "Retrying OpenAI request");
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function validateScenes(scenePlan: ScenePlan): { readonly durationSeconds: number } {
  if (!Array.isArray(scenePlan.scenes) || scenePlan.scenes.length === 0) {
    throw new SourceValidationError("scenes.json must contain a non-empty scenes array.");
  }
  let previousEnd = -Infinity;
  let durationSeconds = 0;
  for (const scene of scenePlan.scenes) {
    if (!scene || typeof scene !== "object") {
      throw new SourceValidationError("Each scene must be an object.");
    }
    if (!Number.isInteger(scene.sequenceNumber) || scene.sequenceNumber <= 0) {
      throw new SourceValidationError(`Invalid sequence number for scene ${scene.id}.`);
    }
    if (normalizeWhitespace(scene.canonicalNarration).length === 0) {
      throw new SourceValidationError(`Scene ${scene.id} is missing narration.`);
    }
    if (!isFiniteNumber(scene.timing.startSeconds) || !isFiniteNumber(scene.timing.endSeconds)) {
      throw new SourceValidationError(`Scene ${scene.id} has non-finite timing.`);
    }
    if (scene.timing.endSeconds <= scene.timing.startSeconds) {
      throw new SourceValidationError(`Scene ${scene.id} must end after it starts.`);
    }
    if (scene.timing.startSeconds < previousEnd - 0.001) {
      throw new SourceValidationError(`Scene ${scene.id} overlaps the previous scene.`);
    }
    previousEnd = scene.timing.endSeconds;
    durationSeconds = Math.max(durationSeconds, scene.timing.endSeconds);
  }
  return { durationSeconds };
}

function buildChapterBlock(metadata: YoutubeMetadata): string {
  return metadata.chapters.items
    .map((chapter) => `${chapter.timestamp} ${normalizeWhitespace(chapter.title)}`)
    .join("\n");
}

function normalizeChapterMetadata(metadata: YoutubeMetadata, scenePlan: ScenePlan, durationSeconds: number): YoutubeMetadata {
  const originalTitles = metadata.chapters.items
    .map((chapter) => normalizeWhitespace(chapter.title))
    .filter((title) => title.length > 0);
  const fallbackTitles = scenePlan.scenes
    .slice(0, 3)
    .map((scene) => normalizeWhitespace(scene.canonicalNarration).slice(0, 72))
    .filter((title) => title.length > 0);
  const titles = (originalTitles.length > 0 ? originalTitles : fallbackTitles).slice(0, Math.max(3, Math.min(scenePlan.scenes.length, originalTitles.length > 0 ? originalTitles.length : fallbackTitles.length || 3)));
  while (titles.length < 3) {
    const scene = scenePlan.scenes[titles.length];
    const fallbackTitle = scene ? normalizeWhitespace(scene.canonicalNarration).slice(0, 72) : `Chapter ${titles.length + 1}`;
    titles.push(fallbackTitle.length > 0 ? fallbackTitle : `Chapter ${titles.length + 1}`);
  }
  const sceneCount = scenePlan.scenes.length;
  const normalizedItems = titles.map((title, index) => {
    const sceneIndex = titles.length === 1 ? 0 : Math.round((index * (sceneCount - 1)) / Math.max(1, titles.length - 1));
    const scene = scenePlan.scenes[sceneIndex] ?? scenePlan.scenes[sceneCount - 1];
    const startSeconds = index === 0 ? 0 : Math.min(durationSeconds, scene?.timing.startSeconds ?? durationSeconds);
    return {
      timestamp: formatTimestampLabel(startSeconds),
      startSeconds,
      title: normalizeWhitespace(title).slice(0, 72)
    };
  });
  const normalizedChapterBlock = normalizedItems
    .map((chapter) => `${chapter.timestamp} ${normalizeWhitespace(chapter.title)}`)
    .join("\n");
  const originalChapterBlock = buildChapterBlock(metadata);
  const description = metadata.description.includes(originalChapterBlock)
    ? metadata.description.replace(originalChapterBlock, normalizedChapterBlock)
    : `${normalizeWhitespace(metadata.description)}\n\n${normalizedChapterBlock}`;
  return {
    ...metadata,
    description,
    chapters: {
      ...metadata.chapters,
      text: normalizedChapterBlock,
      characterCount: [...normalizedChapterBlock].length,
      items: normalizedItems
    }
  };
}

function sanitizeFilename(fileName: string): string {
  const basename = safeBasename(fileName);
  if (basename !== fileName || !/^[A-Za-z0-9._-]+$/u.test(basename)) {
    throw new MetadataValidationError(`Unsafe filename generated: ${fileName}`);
  }
  return basename;
}

function validateFinalMetadata(metadata: YoutubeMetadata, expected: { readonly sceneCount: number; readonly durationSeconds: number; readonly language: string }): YoutubeMetadata {
  const chapterBlock = buildChapterBlock(metadata);
  const chapters = splitChapterLines(metadata.chapters.text);
  const tags = parseTagsText(metadata.tags.text);
  const chapterCharacterCount = [...metadata.chapters.text].length;
  const tagCharacterCount = [...metadata.tags.text].length;

  if (!metadata.description.includes(chapterBlock)) {
    throw new MetadataValidationError("Description must include the exact chapter block.");
  }
  if (!metadata.chapters.text.startsWith("00:00 ")) {
    throw new MetadataValidationError("Chapter text must start with 00:00.");
  }
  if (metadata.title.recommended.length > 100 || metadata.title.alternatives.some((title) => title.length > 100)) {
    throw new MetadataValidationError("Titles must be 100 characters or fewer.");
  }
  if (chapterCharacterCount > 800) {
    throw new MetadataValidationError("Chapter block exceeds 800 characters.");
  }
  if (tagCharacterCount > 500) {
    throw new MetadataValidationError("Tag string exceeds 500 characters.");
  }
  if (metadata.chapters.items.length < 3) {
    throw new MetadataValidationError("At least three chapters are required.");
  }
  if (metadata.source.sceneCount !== expected.sceneCount) {
    throw new MetadataValidationError("Scene count does not match the source scenes.json.");
  }
  if (Math.abs(metadata.source.durationSeconds - expected.durationSeconds) > 0.05) {
    throw new MetadataValidationError("Duration does not match the final scene end time.");
  }
  if (metadata.source.language !== expected.language) {
    throw new MetadataValidationError("Language does not match the configured output language.");
  }
  if (new Set(metadata.title.alternatives.concat(metadata.title.recommended)).size !== 6) {
    throw new MetadataValidationError("Titles must be unique.");
  }
  if (new Set(metadata.hashtags.map((tag) => tag.toLowerCase())).size !== metadata.hashtags.length) {
    throw new MetadataValidationError("Hashtags must be unique.");
  }
  if (new Set(tags.map((tag) => tag.toLowerCase())).size !== tags.length) {
    throw new MetadataValidationError("Tags must be unique.");
  }
  if (metadata.chapters.items.length !== chapters.length) {
    throw new MetadataValidationError("Chapter items must match the chapter text line count.");
  }
  let lastStart = -1;
  for (let index = 0; index < metadata.chapters.items.length; index += 1) {
    const item = metadata.chapters.items[index];
    const line = chapters[index];
    if (!line) {
      throw new MetadataValidationError("Chapter lines are missing.");
    }
    if (!item) {
      throw new MetadataValidationError("Chapter items are missing.");
    }
    const [timestamp, ...titleParts] = line.split(" ");
    const title = titleParts.join(" ").trim();
    if (item.timestamp !== timestamp || normalizeWhitespace(item.title) !== normalizeWhitespace(title)) {
      throw new MetadataValidationError("Chapter items must match the chapter text exactly.");
    }
    if (!chapterTimestampPattern.test(item.timestamp)) {
      throw new MetadataValidationError(`Invalid chapter timestamp: ${item.timestamp}`);
    }
    if (item.startSeconds < 0 || item.startSeconds > metadata.source.durationSeconds + 0.05) {
      throw new MetadataValidationError(`Chapter timestamp out of range: ${item.timestamp}`);
    }
    if (item.startSeconds <= lastStart) {
      throw new MetadataValidationError("Chapter timestamps must increase strictly.");
    }
    lastStart = item.startSeconds;
  }
  if (!metadata.hashtags.every((tag) => !tag.includes(" "))) {
    throw new MetadataValidationError("Hashtags must not contain spaces.");
  }
  if (!tags.every((tag) => !tag.includes("#"))) {
    throw new MetadataValidationError("Tags must not include # characters.");
  }
  sanitizeFilename(metadata.uploadSettings.filename);
  if (metadata.description.length > 5000) {
    throw new MetadataValidationError("Description exceeds 5000 characters.");
  }
  return {
    ...metadata,
    source: {
      sourceId: metadata.source.sourceId,
      sceneCount: expected.sceneCount,
      durationSeconds: expected.durationSeconds,
      language: expected.language
    },
    chapters: {
      ...metadata.chapters,
      characterCount: chapterCharacterCount
    },
    tags: {
      ...metadata.tags,
      items: tags,
      characterCount: tagCharacterCount
    }
  };
}

function buildMetadataMarkdown(metadata: YoutubeMetadata): string {
  const corrections = metadata.corrections.length > 0 ? metadata.corrections.map((item) => `- ${item.original} -> ${item.replacement} (${item.confidence})`).join("\n") : "None";
  const warnings = metadata.verificationWarnings.length > 0 ? metadata.verificationWarnings.map((item) => `- ${item.claim}: ${item.reason}`).join("\n") : "None";
  const chapters = buildChapterBlock(metadata);
  return [
    "# YouTube Metadata",
    "",
    "## Recommended title",
    "",
    metadata.title.recommended,
    "",
    "## Alternative titles",
    "",
    ...metadata.title.alternatives.map((title) => `- ${title}`),
    "",
    "## Description",
    "",
    metadata.description,
    "",
    "## Chapters",
    "",
    chapters,
    "",
    "## Tags",
    "",
    metadata.tags.text,
    "",
    "## Hashtags",
    "",
    metadata.hashtags.join(" "),
    "",
    "## Thumbnail",
    "",
    "### Recommended text",
    "",
    metadata.thumbnail.recommendedText,
    "",
    "### Alternatives",
    "",
    ...metadata.thumbnail.alternativeTexts.map((text) => `- ${text}`),
    "",
    "### Image-generation prompt",
    "",
    metadata.thumbnail.imagePrompt,
    "",
    "## Upload settings",
    "",
    `- Filename: ${metadata.uploadSettings.filename}`,
    `- Category: ${metadata.uploadSettings.category}`,
    `- Video language: ${metadata.uploadSettings.videoLanguage}`,
    `- Caption language: ${metadata.uploadSettings.captionLanguage}`,
    `- Made for kids: ${String(metadata.uploadSettings.madeForKids)}`,
    `- Licence: ${metadata.uploadSettings.licence}`,
    `- Playlists: ${metadata.uploadSettings.playlists.join(", ")}`,
    `- Comments: ${metadata.uploadSettings.comments}`,
    `- Automatic chapters: ${String(metadata.uploadSettings.automaticChapters)}`,
    "",
    "## Pinned comment",
    "",
    metadata.pinnedComment,
    "",
    "## Corrections",
    "",
    corrections,
    "",
    "## Verification warnings",
    "",
    warnings
  ].join("\n");
}

function buildResponseSchema(_promptText: string) {
  const schema = youtubeMetadataSchema.toJSONSchema() as Record<string, unknown>;
  delete schema["$schema"];
  return {
    type: "json_schema",
    name: "youtube_metadata",
    strict: true,
    schema,
    description: "YouTube upload metadata JSON."
  } as const;
}

function describeLanguage(language: string): string {
  const normalized = language.toLowerCase();
  if (normalized === "de") {
    return "German";
  }
  if (normalized === "en") {
    return "English";
  }
  if (normalized === "es") {
    return "Spanish";
  }
  if (normalized === "fr") {
    return "French";
  }
  return language;
}

function buildRequestInput(fileId: string, narration: YoutubeMetadataNarrationDependency): Array<{ readonly role: "user"; readonly content: ReadonlyArray<{ readonly type: "input_file"; readonly file_id: string } | { readonly type: "input_text"; readonly text: string }> }> {
  return [
    {
      role: "user",
      content: [
        {
          type: "input_file",
          file_id: fileId
        },
        {
          type: "input_text",
          text: "Generate the JSON metadata described in the instructions."
        },
        {
          type: "input_text",
          text: buildNarrationInputText(narration)
        }
      ]
    }
  ];
}

function buildNarrationInputText(
  narration: YoutubeMetadataNarrationDependency
): string {
  return [
    "Use this validated narration as the primary source of titles, summaries, tags, hashtags, thumbnail copy, pinned comment, and descriptive language.",
    "Do not overwrite or reinterpret the narration facts.",
    `<VALIDATED_NARRATION language="${narration.language}" locale="${narration.locale}" variant="${narration.variant}" fingerprint="${narration.narrationFingerprint}">`,
    narration.narrationText,
    "</VALIDATED_NARRATION>",
  ].join("\n");
}

export function computeYoutubeMetadataModelConfigFingerprint(input: {
  readonly model: string;
  readonly reasoningEffort?: string | undefined;
  readonly maxOutputTokens?: number | undefined;
  readonly repairModel?: string | undefined;
  readonly repairReasoningEffort?: string | undefined;
  readonly repairMaxOutputTokens?: number | undefined;
}): string {
  return hashText(
    JSON.stringify({
      model: input.model,
      reasoningEffort: input.reasoningEffort ?? null,
      maxOutputTokens: input.maxOutputTokens ?? null,
      repairModel: input.repairModel ?? null,
      repairReasoningEffort: input.repairReasoningEffort ?? null,
      repairMaxOutputTokens: input.repairMaxOutputTokens ?? null,
    })
  );
}

export function computeYoutubeMetadataPromptSchemaFingerprint(input: {
  readonly promptText: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;
}): string {
  return hashText(
    JSON.stringify({
      promptText: input.promptText,
      promptVersion: input.promptVersion,
      schemaVersion: input.schemaVersion,
    })
  );
}

function extractResponseJson(responseText: string): unknown {
  return JSON.parse(responseText) as unknown;
}

export function parseScenesFile(rawJson: string, sourceFilePath: string): YoutubeMetadataTarget {
  const parsedUnknown = JSON.parse(rawJson) as unknown;
  const scenePlan = scenePlanSchema.parse(parsedUnknown);
  const { durationSeconds } = validateScenes(scenePlan);
  const episodeDir = resolveEpisodeDirFromScenesFile(sourceFilePath);
  const sourceId = typeof scenePlan.sourceId === "string" ? scenePlan.sourceId : null;
  const episodeSlug = safeBasename(path.basename(episodeDir));
  return {
    sourceFilePath: path.resolve(sourceFilePath),
    episodeDir,
    outputDir: path.join(episodeDir, "output"),
    episodeSlug,
    sourceId,
    language: "en",
    locale: "en-US",
    variant: "full",
    scenePlan,
    sourceSha256: hashText(rawJson),
    durationSeconds,
    narration: {
      episodeNumber: episodeSlug.split("-")[0] ?? episodeSlug,
      episodeSlug,
      language: "en",
      locale: "en-US",
      variant: "full",
      narrationText: scenePlan.scenes
        .map((scene) => normalizeWhitespace(scene.canonicalNarration))
        .join("\n\n"),
      narrationFingerprint: hashText(
        scenePlan.scenes
          .map((scene) => normalizeWhitespace(scene.canonicalNarration))
          .join("\n\n")
      ),
    },
  };
}

export async function readAndValidateScenesFile(sourceFilePath: string, language: string): Promise<YoutubeMetadataTarget> {
  const resolved = path.resolve(sourceFilePath);
  const raw = await fs.readFile(resolved, "utf8").catch((error: unknown) => {
    throw new SourceFileError(`Unable to read scenes file: ${resolved}`, error);
  });
  const target = parseScenesFile(raw, resolved);
  return {
    ...target,
    language,
    locale: language === "en" ? "en-US" : language,
    outputDir: path.join(
      target.episodeDir,
      "locales",
      safeBasename(language),
      "full",
      "metadata"
    )
  };
}

export async function findEpisodeScenesFile(workspaceDir: string, episodeSlug: string): Promise<string> {
  const episodeDir = path.join(workspaceDir, episodeSlug);
  const canonicalScenes = path.join(episodeDir, "canonical", "scenes.json");
  if (await fileExists(canonicalScenes)) {
    return canonicalScenes;
  }
  const rootScenes = path.join(episodeDir, "scenes.json");
  if (await fileExists(rootScenes)) {
    return rootScenes;
  }
  const outputScenes = path.join(episodeDir, "output", "scenes.json");
  if (await fileExists(outputScenes)) {
    return outputScenes;
  }
  throw new SourceFileError(`No scenes.json found for episode ${episodeSlug}.`);
}

export async function listEpisodeSceneFiles(workspaceDir: string): Promise<Array<{ readonly episodeSlug: string; readonly sourceFilePath: string }>> {
  const entries = await fs.readdir(workspaceDir, { withFileTypes: true }).catch(() => []);
  const results: Array<{ readonly episodeSlug: string; readonly sourceFilePath: string }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const episodeSlug = entry.name;
    const canonicalScenes = path.join(workspaceDir, episodeSlug, "canonical", "scenes.json");
    if (await fileExists(canonicalScenes)) {
      results.push({ episodeSlug, sourceFilePath: canonicalScenes });
      continue;
    }
    const rootScenes = path.join(workspaceDir, episodeSlug, "scenes.json");
    if (await fileExists(rootScenes)) {
      results.push({ episodeSlug, sourceFilePath: rootScenes });
      continue;
    }
    const outputScenes = path.join(workspaceDir, episodeSlug, "output", "scenes.json");
    if (await fileExists(outputScenes)) {
      results.push({ episodeSlug, sourceFilePath: outputScenes });
    }
  }
  return results.sort((left, right) => left.episodeSlug.localeCompare(right.episodeSlug));
}

export function computeYoutubeMetadataCacheKey(input: {
  readonly sourceSha256: string;
  readonly parentNarrationFingerprint: string;
  readonly promptText: string;
  readonly promptVersion: string;
  readonly model: string;
  readonly schemaVersion: string;
  readonly language: string;
  readonly modelConfigFingerprint: string;
  readonly promptSchemaFingerprint: string;
}): string {
  return hashText([
    input.sourceSha256,
    input.parentNarrationFingerprint,
    hashText(input.promptText),
    input.promptVersion,
    input.model,
    input.schemaVersion,
    input.language,
    input.modelConfigFingerprint,
    input.promptSchemaFingerprint,
  ].join("\u0000"));
}

async function loadCachedGeneration(generationPath: string): Promise<YoutubeMetadataGenerationInfo | null> {
  if (!(await fileExists(generationPath))) {
    return null;
  }
  try {
    const raw = await fs.readFile(generationPath, "utf8");
    return generationInfoSchema.parse(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export async function generateYoutubeMetadataForTarget(
  target: YoutubeMetadataTarget,
  options: YoutubeMetadataGenerationOptions
): Promise<{ readonly metadata: YoutubeMetadata; readonly generation: YoutubeMetadataGenerationInfo; readonly outputs: YoutubeMetadataOutputs; readonly cacheHit: boolean }> {
  const outputDir = target.outputDir;
  const outputs: YoutubeMetadataOutputs = {
    outputDir,
    jsonPath: path.join(outputDir, "youtube-metadata.json"),
    markdownPath: path.join(outputDir, "youtube-metadata.md"),
    descriptionPath: path.join(outputDir, "youtube-description.txt"),
    chaptersPath: path.join(outputDir, "youtube-chapters.txt"),
    tagsPath: path.join(outputDir, "youtube-tags.txt"),
    pinnedCommentPath: path.join(outputDir, "youtube-pinned-comment.txt"),
    generationPath: path.join(outputDir, "youtube-metadata-generation.json")
  };
  const promptVersion = options.promptVersion ?? YOUTUBE_METADATA_PROMPT_VERSION;
  const modelConfigFingerprint = computeYoutubeMetadataModelConfigFingerprint({
    model: options.model,
    reasoningEffort: options.reasoningEffort,
    maxOutputTokens: options.maxOutputTokens,
    repairModel: options.repairModel,
    repairReasoningEffort: options.repairReasoningEffort,
    repairMaxOutputTokens: options.repairMaxOutputTokens,
  });
  const promptSchemaFingerprint = computeYoutubeMetadataPromptSchemaFingerprint({
    promptText: options.promptText,
    promptVersion,
    schemaVersion: YOUTUBE_METADATA_SCHEMA_VERSION,
  });
  const cacheKey = computeYoutubeMetadataCacheKey({
    sourceSha256: target.sourceSha256,
    parentNarrationFingerprint: target.narration.narrationFingerprint,
    promptText: options.promptText,
    promptVersion,
    model: options.model,
    schemaVersion: YOUTUBE_METADATA_SCHEMA_VERSION,
    language: options.language,
    modelConfigFingerprint,
    promptSchemaFingerprint,
  });
  const cachedGeneration = await loadCachedGeneration(outputs.generationPath);
  const cacheHit = Boolean(!options.force && cachedGeneration?.cacheKey === cacheKey && (await fileExists(outputs.jsonPath)));
  if (cacheHit) {
    const cachedMetadata = youtubeMetadataSchema.parse(JSON.parse(await fs.readFile(outputs.jsonPath, "utf8")) as unknown);
    return {
      metadata: cachedMetadata,
      generation: cachedGeneration as YoutubeMetadataGenerationInfo,
      outputs,
      cacheHit: true
    };
  }
  if (options.dryRun) {
    throw new OutputWriteError("Dry run does not generate outputs.");
  }
  await ensureDir(outputDir);
  narrationDependencySchema.parse(target.narration);

  if (!options.apiKey) {
    throw new ConfigurationError("OPENAI_API_KEY is required.");
  }
  const client = options.client ?? createOpenAiMetadataClient(options.apiKey, options.baseUrl);
  const models = uniqueModels([options.model, ...resolveMetadataFallbackModels(options.model, options.fallbackModels)]);
  const repairModel = options.repairModel ?? options.model;
  const repairReasoningEffort =
    options.repairReasoningEffort ??
    options.reasoningEffort ??
    (repairModel.startsWith("gpt-5") ? "low" : undefined);
  const repairMaxOutputTokens =
    options.repairMaxOutputTokens ??
    options.maxOutputTokens ??
    (repairModel.startsWith("gpt-5") ? 12000 : 4000);

  const promptText = options.promptText;
  const languageInstruction = [
    `Target language: ${describeLanguage(options.language)} (${options.language}).`,
    "Write every user-facing field in that language, including the title, description, chapters, tags, hashtags, thumbnail text, pinned comment, social teaser, content summary, corrections, and verification warnings.",
    "Do not mix in English unless it is a proper noun, product name, or unavoidable technical term.",
  ].join(" ");
  const promptInstructions = `${promptText}\n\n${languageInstruction}`;
  const schema = buildResponseSchema(promptText);
  const upload = await withRetry(
    async () =>
      client.files.create(
        {
          filePath: target.sourceFilePath,
          purpose: "user_data"
        },
        {
          signal: AbortSignal.timeout(options.timeoutMs)
        }
      ),
    { maxRetries: options.maxRetries, label: "upload-scenes", logger: options.logger }
  ).catch((error: unknown) => {
    throw new OpenAIUploadError(`Failed to upload ${target.sourceFilePath} to OpenAI.`, isRetryableOpenAiError(error), error);
  });

  let openAiResponseId = "";
  let responseText = "";
  let attemptCount = 0;
  let resolvedModel = options.model;
  const telemetry = currentExecutionTelemetry();
  try {
    const executeRequest = async (model: string, additionalInstruction?: string): Promise<string> => {
      attemptCount += 1;
      const response = await withRetry(
        async () =>
          client.responses.create(
            {
              model,
              instructions: additionalInstruction ? `${promptInstructions}\n\n${additionalInstruction}` : promptInstructions,
              ...(() => {
                const reasoningEffort =
              model === repairModel
                    ? repairReasoningEffort
                    : options.reasoningEffort ?? (model.startsWith("gpt-5") ? "low" : undefined);
                return reasoningEffort && reasoningEffort !== "none"
                  ? {
                      reasoning: {
                        effort: reasoningEffort,
                      },
                  }
                : {};
              })(),
              input: buildRequestInput(upload.id, target.narration),
              text: { format: schema },
              max_output_tokens:
                model === repairModel
                  ? repairMaxOutputTokens
                  : options.maxOutputTokens ?? (model.startsWith("gpt-5") ? 12000 : 4000)
            },
            { signal: AbortSignal.timeout(options.timeoutMs) }
          ),
        { maxRetries: options.maxRetries, label: "generate-metadata", logger: options.logger }
      ).catch((error: unknown) => {
        throw new OpenAIResponseError(describeOpenAiError(error), isRetryableOpenAiError(error), error);
      });
      openAiResponseId = response.id;
      resolvedModel = model;
      const usage = (response as {
        readonly usage?: {
          readonly input_tokens?: number;
          readonly output_tokens?: number;
          readonly input_tokens_details?: { readonly cached_tokens?: number };
        };
      }).usage;
      const cost = telemetry
        ? estimateTextGenerationCost(telemetry.catalog, {
            provider: "openai",
            model,
            ...(usage?.input_tokens !== undefined
              ? { inputTokens: usage.input_tokens }
              : {}),
            ...(usage?.input_tokens_details?.cached_tokens !== undefined
              ? {
                  cachedInputTokens:
                    usage.input_tokens_details.cached_tokens,
                }
              : {}),
            ...(usage?.output_tokens !== undefined
              ? { outputTokens: usage.output_tokens }
              : {}),
          })
        : { pricingVersion: "unconfigured", costMicros: null, warning: undefined };
      telemetry?.recordApiCall({
        provider: "openai",
        model,
        operation: "metadata-generation",
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: 0,
        attempt: attemptCount,
        success: true,
        requestId: response.id,
        ...(usage?.input_tokens !== undefined ||
        usage?.input_tokens_details?.cached_tokens !== undefined ||
        usage?.output_tokens !== undefined
          ? {
              usage: {
                ...(usage?.input_tokens !== undefined
                  ? { inputTokens: usage.input_tokens }
                  : {}),
                ...(usage?.input_tokens_details?.cached_tokens !== undefined
                  ? {
                      cachedInputTokens:
                        usage.input_tokens_details.cached_tokens,
                    }
                  : {}),
                ...(usage?.output_tokens !== undefined
                  ? { outputTokens: usage.output_tokens }
                  : {}),
              },
            }
          : {}),
      });
      telemetry?.recordCost({
        provider: "openai",
        model,
        operation: "metadata-generation",
        costMicros: cost.costMicros,
        warning: cost.warning
      });
      return extractResponseText(response);
    };

    let lastRetryableError: unknown = null;
    for (const model of models) {
      try {
        responseText = await executeRequest(model);
        break;
      } catch (error: unknown) {
        lastRetryableError = error;
        const retryable = error instanceof OpenAIResponseError ? error.retryable : isRetryableOpenAiError(error);
        if (!retryable) {
          throw error;
        }
        const nextModel = models[models.indexOf(model) + 1];
        if (nextModel) {
          options.logger?.warn(
            {
              primaryModel: options.model,
              fallbackModel: nextModel,
              failedModel: model,
              error: describeOpenAiError(error),
            },
            "OpenAI metadata model at capacity, retrying with fallback model"
          );
          continue;
        }
      }
    }
    if (!responseText) {
      throw new OpenAIResponseError(
        describeOpenAiError(lastRetryableError),
        isRetryableOpenAiError(lastRetryableError),
        lastRetryableError
      );
    }
    let parsed = youtubeMetadataSchema.safeParse(extractResponseJson(responseText));
    let repaired = false;
    if (!parsed.success) {
      const repairInstruction = [
        "The previous response was invalid.",
        "Fix only the invalid fields.",
        `Validation errors:\n${JSON.stringify(parsed.error.flatten(), null, 2)}`,
        `Previous JSON:\n${responseText}`
      ].join("\n\n");
      responseText = await executeRequest(repairModel, repairInstruction);
      parsed = youtubeMetadataSchema.safeParse(extractResponseJson(responseText));
      repaired = true;
      if (!parsed.success) {
        throw new MetadataValidationError(`OpenAI response could not be validated: ${parsed.error.message}`);
      }
    }
    const normalizeMetadata = (data: YoutubeMetadata): YoutubeMetadata => normalizeChapterMetadata(
      {
        ...data,
        source: {
          sourceId: target.sourceId,
          sceneCount: target.scenePlan.scenes.length,
          durationSeconds: target.durationSeconds,
          language: options.language
        }
      },
      target.scenePlan,
      target.durationSeconds
    );
    let finalMetadata: YoutubeMetadata;
    try {
      finalMetadata = validateFinalMetadata(normalizeMetadata(parsed.data), {
        sceneCount: target.scenePlan.scenes.length,
        durationSeconds: target.durationSeconds,
        language: options.language
      });
    } catch (error: unknown) {
      if (repaired || !(error instanceof MetadataValidationError)) {
        throw error;
      }
      const repairInstruction = [
        "The previous response passed schema validation but failed local validation.",
        `Validation errors:\n${error.message}`,
        `Previous JSON:\n${responseText}`,
        "Fix only the invalid fields."
      ].join("\n\n");
      responseText = await executeRequest(repairModel, repairInstruction);
      parsed = youtubeMetadataSchema.safeParse(extractResponseJson(responseText));
      repaired = true;
      if (!parsed.success) {
        throw new MetadataValidationError(`OpenAI response could not be validated: ${parsed.error.message}`);
      }
      finalMetadata = validateFinalMetadata(normalizeMetadata(parsed.data), {
        sceneCount: target.scenePlan.scenes.length,
        durationSeconds: target.durationSeconds,
        language: options.language
      });
    }
    const generation: YoutubeMetadataGenerationInfo = {
      generatedAt: new Date().toISOString(),
      sourceFile: path.relative(process.cwd(), target.sourceFilePath),
      sourceSha256: target.sourceSha256,
      promptVersion,
      model: resolvedModel,
      openaiResponseId: openAiResponseId,
      attemptCount,
      chapterCharacterCount: [...finalMetadata.chapters.text].length,
      tagCharacterCount: [...finalMetadata.tags.text].length,
      cacheKey,
      language: options.language,
      locale: target.locale,
      variant: target.variant,
      owner: YOUTUBE_METADATA_OWNER,
      ownerVersion: YOUTUBE_METADATA_OWNER_VERSION,
      status: "completed",
      parentNarrationFingerprint: target.narration.narrationFingerprint,
      modelConfigFingerprint,
      promptSchemaFingerprint,
      narration: {
        episodeNumber: target.narration.episodeNumber,
        episodeSlug: target.narration.episodeSlug,
        language: target.narration.language,
        locale: target.narration.locale,
        variant: target.narration.variant,
        narrationFingerprint: target.narration.narrationFingerprint,
      },
    };

    await writeJsonAtomic(outputs.jsonPath, finalMetadata);
    await writeTextAtomic(outputs.markdownPath, buildMetadataMarkdown(finalMetadata));
    await writeTextAtomic(outputs.descriptionPath, finalMetadata.description);
    await writeTextAtomic(outputs.chaptersPath, finalMetadata.chapters.text);
    await writeTextAtomic(outputs.tagsPath, finalMetadata.tags.text);
    await writeTextAtomic(outputs.pinnedCommentPath, finalMetadata.pinnedComment);
    await writeJsonAtomic(outputs.generationPath, generation);

    return {
      metadata: finalMetadata,
      generation,
      outputs,
      cacheHit: false
    };
  } catch (error: unknown) {
    const failedGeneration: YoutubeMetadataGenerationInfo = {
      generatedAt: new Date().toISOString(),
      sourceFile: path.relative(process.cwd(), target.sourceFilePath),
      sourceSha256: target.sourceSha256,
      promptVersion,
      model: options.model,
      openaiResponseId: openAiResponseId,
      attemptCount: Math.max(1, attemptCount),
      chapterCharacterCount: 0,
      tagCharacterCount: 0,
      cacheKey,
      language: options.language,
      locale: target.locale,
      variant: target.variant,
      owner: YOUTUBE_METADATA_OWNER,
      ownerVersion: YOUTUBE_METADATA_OWNER_VERSION,
      status: "failed",
      parentNarrationFingerprint: target.narration.narrationFingerprint,
      modelConfigFingerprint,
      promptSchemaFingerprint,
      narration: {
        episodeNumber: target.narration.episodeNumber,
        episodeSlug: target.narration.episodeSlug,
        language: target.narration.language,
        locale: target.narration.locale,
        variant: target.narration.variant,
        narrationFingerprint: target.narration.narrationFingerprint,
      },
      failureCode:
        error instanceof Error && "code" in error && typeof error.code === "string"
          ? error.code
          : "metadata_generation_failed",
      failureMessage: error instanceof Error ? error.message : String(error),
    };
    await writeJsonAtomic(outputs.generationPath, failedGeneration).catch(() => {
      return undefined;
    });
    throw error;
  } finally {
    if (!options.keepFile) {
      await client.files.delete(upload.id).catch((error: unknown) => {
        options.logger?.warn({ fileId: upload.id, error: describeOpenAiError(error) }, "Failed to delete temporary OpenAI file");
      });
    }
  }
}

export async function generateYoutubeMetadataFromScenesFile(
  sourceFilePath: string,
  options: YoutubeMetadataGenerationOptions
): Promise<{ readonly metadata: YoutubeMetadata; readonly generation: YoutubeMetadataGenerationInfo; readonly outputs: YoutubeMetadataOutputs; readonly cacheHit: boolean }> {
  const target = await readAndValidateScenesFile(sourceFilePath, options.language);
  return generateYoutubeMetadataForTarget(target, options);
}

export function formatYoutubeMetadataMarkdown(metadata: YoutubeMetadata): string {
  return buildMetadataMarkdown(metadata);
}

export function extractResponseText(response: { readonly output_text?: string | undefined; readonly output?: ReadonlyArray<{ readonly type: string; readonly content?: ReadonlyArray<{ readonly type: string; readonly text?: string }> }> }): string {
  if (typeof response.output_text === "string" && response.output_text.trim().length > 0) {
    return response.output_text;
  }
  const texts: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type === "message" || item.type === "output_text") {
      const itemWithText = item as { readonly text?: string };
      if (typeof itemWithText.text === "string" && itemWithText.text.trim().length > 0) {
        texts.push(itemWithText.text);
      }
    }
    if (!Array.isArray(item.content)) {
      continue;
    }
    for (const content of item.content) {
      if (typeof content.text === "string" && content.text.trim().length > 0) {
        texts.push(content.text);
      }
    }
  }
  if (texts.length === 0) {
    throw new OpenAIResponseError("OpenAI response did not contain any text output.");
  }
  return texts.join("");
}
