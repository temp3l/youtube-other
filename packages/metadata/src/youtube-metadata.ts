import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from "openai";
import type { ResponseCreateParamsNonStreaming, ResponseInput, ResponseOutputItem, ResponseTextConfig } from "openai/resources/responses/responses";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  ensureDir,
  fileExists,
  hashText,
  normalizeWhitespace,
  safeBasename,
  writeJsonAtomic,
  writeTextAtomic
} from "@mediaforge/shared";
import { scenePlanSchema, type ScenePlan } from "@mediaforge/domain";

export const YOUTUBE_METADATA_PROMPT_VERSION = "youtube-metadata-v1";
export const YOUTUBE_METADATA_SCHEMA_VERSION = "1.0" as const;

const chapterTimestampPattern = /^(?:\d{2}:)?\d{2}:\d{2}$/u;
const generationInfoSchema = z.object({
  generatedAt: z.string().min(1),
  sourceFile: z.string().min(1),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/iu),
  promptVersion: z.string().min(1),
  model: z.string().min(1),
  openaiResponseId: z.string().min(1),
  attemptCount: z.number().int().positive(),
  chapterCharacterCount: z.number().int().nonnegative(),
  tagCharacterCount: z.number().int().nonnegative(),
  cacheKey: z.string().min(1),
  language: z.string().min(1)
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
  readonly openaiResponseId: string;
  readonly attemptCount: number;
  readonly chapterCharacterCount: number;
  readonly tagCharacterCount: number;
  readonly cacheKey: string;
  readonly language: string;
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
  readonly scenePlan: ScenePlan;
  readonly sourceSha256: string;
  readonly durationSeconds: number;
}

export interface YoutubeMetadataGenerationOptions {
  readonly apiKey: string;
  readonly model: string;
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
    create(request: { readonly file: ReturnType<typeof createReadStream>; readonly purpose: "user_data" }, options?: { readonly signal?: AbortSignal }): Promise<{ readonly id: string }>;
    delete(fileId: string, options?: { readonly signal?: AbortSignal }): Promise<unknown>;
  };
  readonly responses: {
    create(request: {
      readonly model: string;
      readonly instructions?: string;
      readonly input: ReadonlyArray<{
        readonly role: "user";
        readonly content: ReadonlyArray<
          | { readonly type: "input_file"; readonly file_id: string; readonly filename: string }
          | { readonly type: "input_text"; readonly text: string }
        >;
      }>;
      readonly text?: unknown;
      readonly max_output_tokens?: number;
    }, options?: { readonly signal?: AbortSignal }): Promise<{
      readonly id: string;
      readonly output_text?: string;
      readonly output: ReadonlyArray<{
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
  const realClient = baseUrl ? new OpenAI({ apiKey, baseURL: baseUrl }) : new OpenAI({ apiKey });
  return {
    files: {
      create: (request, options) => realClient.files.create({ file: request.file, purpose: request.purpose }, options),
      delete: (fileId, options) => realClient.files.delete(fileId, options)
    },
    responses: {
      create: async (request, options) => {
        const input: ResponseInput = request.input.map((item) => ({
          role: item.role,
          content: item.content.map((content) => ({ ...content }))
        }));
        const body: ResponseCreateParamsNonStreaming = {
          model: request.model,
          input
        };
        if (request.instructions !== undefined) {
          body.instructions = request.instructions;
        }
        if (request.max_output_tokens !== undefined) {
          body.max_output_tokens = request.max_output_tokens;
        }
        if (request.text !== undefined) {
          body.text = request.text as ResponseTextConfig;
        }
        const response = await realClient.responses.create(body, options);
        return {
          id: response.id,
          output_text: response.output_text,
          output: response.output.map((item: ResponseOutputItem) => {
            if (!("content" in item) || !Array.isArray(item.content)) {
              return { type: item.type };
            }
            return {
              type: item.type,
              content: item.content.map((content) => ({
                type: content.type,
                ...("text" in content && typeof content.text === "string" ? { text: content.text } : {})
              }))
            };
          })
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

function retryAfterMs(headers: Headers | undefined): number | null {
  if (!headers) {
    return null;
  }
  const raw = headers.get("retry-after");
  if (!raw) {
    return null;
  }
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const retryDate = Date.parse(raw);
  if (Number.isFinite(retryDate)) {
    const delta = retryDate - Date.now();
    return delta > 0 ? delta : 0;
  }
  return null;
}

function computeRetryDelayMs(attempt: number, retryAfterHeaderMs: number | null): number {
  const baseDelay = Math.min(1000 * 2 ** Math.max(0, attempt - 1), 8000);
  const jitter = Math.floor(baseDelay * 0.2 * Math.random());
  if (retryAfterHeaderMs !== null) {
    return Math.max(retryAfterHeaderMs, baseDelay + jitter);
  }
  return baseDelay + jitter;
}

function isRetryableOpenAiError(error: unknown): error is APIError | APIConnectionError | APIConnectionTimeoutError {
  if (error instanceof APIConnectionError || error instanceof APIConnectionTimeoutError) {
    return true;
  }
  if (!(error instanceof APIError)) {
    return false;
  }
  if (error.status === 408 || error.status === 409 || error.status === 429) {
    return true;
  }
  return typeof error.status === "number" && error.status >= 500;
}

function describeOpenAiError(error: unknown): string {
  if (error instanceof APIError) {
    const apiError = error.error as { message?: unknown; code?: unknown } | undefined;
    const message = typeof apiError?.message === "string" ? apiError.message : error.message;
    if (apiError?.code === "insufficient_quota") {
      return "OpenAI API returned insufficient_quota. Retries will not solve this; check API project billing, project selection, and API-key scope.";
    }
    return message;
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
      const delay = computeRetryDelayMs(attempt, error instanceof APIError ? retryAfterMs(error.headers) : null);
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
  if (chapterCharacterCount !== metadata.chapters.characterCount) {
    throw new MetadataValidationError("chapterCharacterCount does not match the actual chapter text length.");
  }
  if (tagCharacterCount !== metadata.tags.characterCount) {
    throw new MetadataValidationError("tagCharacterCount does not match the actual tags text length.");
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

function buildResponseSchema(promptText: string) {
  return zodResponseFormat(youtubeMetadataSchema, "youtube_metadata", {
    description: promptText
  });
}

function buildRequestInput(fileId: string, sourceFilePath: string): Array<{ readonly role: "user"; readonly content: ReadonlyArray<{ readonly type: "input_file"; readonly file_id: string; readonly filename: string } | { readonly type: "input_text"; readonly text: string }> }> {
  return [
    {
      role: "user",
      content: [
        {
          type: "input_file",
          file_id: fileId,
          filename: path.basename(sourceFilePath)
        },
        {
          type: "input_text",
          text: "Generate the JSON metadata described in the instructions."
        }
      ]
    }
  ];
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
    scenePlan,
    sourceSha256: hashText(rawJson),
    durationSeconds
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
    language
  };
}

export async function findEpisodeScenesFile(workspaceDir: string, episodeSlug: string): Promise<string> {
  const episodeDir = path.join(workspaceDir, episodeSlug);
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
  readonly promptText: string;
  readonly promptVersion: string;
  readonly model: string;
  readonly schemaVersion: string;
  readonly language: string;
}): string {
  return hashText([
    input.sourceSha256,
    hashText(input.promptText),
    input.promptVersion,
    input.model,
    input.schemaVersion,
    input.language
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
  const cacheKey = computeYoutubeMetadataCacheKey({
    sourceSha256: target.sourceSha256,
    promptText: options.promptText,
    promptVersion,
    model: options.model,
    schemaVersion: YOUTUBE_METADATA_SCHEMA_VERSION,
    language: options.language
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

  if (!options.apiKey) {
    throw new ConfigurationError("OPENAI_API_KEY is required.");
  }
  const client = options.client ?? createOpenAiMetadataClient(options.apiKey, options.baseUrl);

  const promptText = options.promptText;
  const schema = buildResponseSchema(promptText);
  const upload = await withRetry(
    async () =>
      client.files.create(
        {
          file: createReadStream(target.sourceFilePath),
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
  try {
    const executeRequest = async (additionalInstruction?: string): Promise<string> => {
      attemptCount += 1;
      const response = await withRetry(
        async () =>
          client.responses.create(
            {
              model: options.model,
              instructions: additionalInstruction ? `${promptText}\n\n${additionalInstruction}` : promptText,
              input: buildRequestInput(upload.id, target.sourceFilePath),
              text: { format: schema },
              max_output_tokens: 4000
            },
            { signal: AbortSignal.timeout(options.timeoutMs) }
          ),
        { maxRetries: options.maxRetries, label: "generate-metadata", logger: options.logger }
      ).catch((error: unknown) => {
        throw new OpenAIResponseError(describeOpenAiError(error), isRetryableOpenAiError(error), error);
      });
      openAiResponseId = response.id;
      return extractResponseText(response);
    };

    responseText = await executeRequest();
    let parsed = youtubeMetadataSchema.safeParse(extractResponseJson(responseText));
    if (!parsed.success) {
      const repairInstruction = [
        "The previous response was invalid.",
        "Fix only the invalid fields.",
        `Validation errors:\n${JSON.stringify(parsed.error.flatten(), null, 2)}`,
        `Previous JSON:\n${responseText}`
      ].join("\n\n");
      responseText = await executeRequest(repairInstruction);
      parsed = youtubeMetadataSchema.safeParse(extractResponseJson(responseText));
      if (!parsed.success) {
        throw new MetadataValidationError(`OpenAI response could not be validated: ${parsed.error.message}`);
      }
    }
    const normalizedMetadata: YoutubeMetadata = {
      ...parsed.data,
      source: {
        sourceId: target.sourceId,
        sceneCount: target.scenePlan.scenes.length,
        durationSeconds: target.durationSeconds,
        language: options.language
      }
    };
    const finalMetadata = validateFinalMetadata(normalizedMetadata, {
      sceneCount: target.scenePlan.scenes.length,
      durationSeconds: target.durationSeconds,
      language: options.language
    });
    const generation: YoutubeMetadataGenerationInfo = {
      generatedAt: new Date().toISOString(),
      sourceFile: path.relative(process.cwd(), target.sourceFilePath),
      sourceSha256: target.sourceSha256,
      promptVersion,
      model: options.model,
      openaiResponseId: openAiResponseId,
      attemptCount,
      chapterCharacterCount: [...finalMetadata.chapters.text].length,
      tagCharacterCount: [...finalMetadata.tags.text].length,
      cacheKey,
      language: options.language
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

export function extractResponseText(response: { readonly output_text?: string; readonly output: ReadonlyArray<{ readonly type: string; readonly content?: ReadonlyArray<{ readonly type: string; readonly text?: string }> }> }): string {
  if (typeof response.output_text === "string" && response.output_text.trim().length > 0) {
    return response.output_text;
  }
  const texts: string[] = [];
  for (const item of response.output) {
    if (item.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }
    for (const content of item.content) {
      if (content.type === "output_text" && typeof content.text === "string") {
        texts.push(content.text);
      }
    }
  }
  if (texts.length === 0) {
    throw new OpenAIResponseError("OpenAI response did not contain any text output.");
  }
  return texts.join("");
}
