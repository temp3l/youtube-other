import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  createLogger,
} from "@mediaforge/observability";
import { estimateTokenCostMicros } from "@mediaforge/observability";
import {
  countSpokenWords,
  ensureDir,
  fileExists,
  normalizeWhitespace,
} from "@mediaforge/shared";
import {
  createOpenAiStoryClientWithOptions,
  type OpenAiStoryClient,
} from "./story-localization-openai-batch.js";
import {
  SHORT_REWRITE_DEFAULT_CONCURRENCY,
  SHORT_REWRITE_DEFAULT_MODEL,
  SHORT_REWRITE_DEFAULT_OUTPUT_ROOT,
  SHORT_REWRITE_DEFAULT_MAX_RETRIES,
  SHORT_REWRITE_DEFAULT_MAX_SOURCE_BYTES,
  SHORT_REWRITE_DEFAULT_TEMPERATURE,
  SHORT_REWRITE_DEFAULT_TIMEOUT_MS,
  SHORT_REWRITE_PROMPT_VERSION,
  SHORT_REWRITE_SUPPORTED_LANGUAGES,
  type ShortRewriteLanguage,
} from "./short-rewrite.constants.js";
import { shortRewriteArtifactSchema, shortRewriteGenerationSchema, shortRewriteManifestSchema, shortRewriteResultSchema } from "./short-rewrite.schemas.js";
import { buildShortRewriteMarkdown } from "./short-rewrite.renderer.js";
import { buildShortRewritePrompt, buildShortRewriteRepairPrompt } from "./short-rewrite.prompt.js";
import {
  AmbiguousStoryInputError,
  ExistingArtifactError,
  ManifestUpdateError,
  OpenAIShortRewriteError,
  ShortRewriteValidationError,
  StoryInputNotFoundError,
  UnsupportedStoryLanguageError,
} from "./short-rewrite.errors.js";
import {
  buildShortRewriteBaseName,
  buildValidationSummary,
  buildCanonicalSourceFileName,
  countThumbnailWords,
  detectEditorialCommentary,
  estimateDurationSeconds,
  firstSentence,
  isPreferredNarrationLength,
  isSupportedStoryLanguage,
  matchesFirstSentence,
  normalizeSentenceMatch,
  normalizeSourceMarkdown,
  parseStoryLanguageList,
  readJsonIfExists,
  resolveShortRewriteOutputPaths,
  roundDuration,
  sha256NormalizedSource,
} from "./short-rewrite.utils.js";
import { materializeCanonicalSourceStory } from "./short-rewrite.bootstrap.js";
import {
  type ResolvedShortRewriteSource,
  type ShortRewriteApiResult,
  type ShortRewriteArtifact,
  type ShortRewriteGeneration,
  type ShortRewriteGenerationResult,
  type ShortRewriteJsonSidecar,
  type ShortRewriteManifest,
  type ShortRewriteResolvedInput,
  type ShortRewriteRunOptions,
  type ShortRewriteRunSummary,
  type ShortRewriteServices,
  type StoryLanguage,
} from "./short-rewrite.types.js";
import { resolveShortRewriteInput } from "./short-rewrite.resolution.js";
import { updateShortRewriteManifestAtomically, writeShortRewriteArtifactFiles } from "./short-rewrite.persistence.js";
import { withFileLock } from "./story-localization-batch-storage.js";
import { getRepoRoot } from "./story-localization.utils.js";

type ResponseCreateRequest = Parameters<OpenAiStoryClient["responses"]["create"]>[0];
type Logger = ReturnType<typeof createLogger>;

interface GenerateLanguageRequest {
  readonly source: ResolvedShortRewriteSource;
  readonly outputRoot: string;
  readonly language: StoryLanguage;
  readonly model: string;
  readonly temperature: number;
  readonly reasoningEffort: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | undefined;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly overwrite: boolean;
  readonly resume: boolean;
  readonly dryRun: boolean;
  readonly signal: AbortSignal | undefined;
  readonly client: Pick<OpenAiStoryClient, "responses"> | undefined;
  readonly logger: Logger;
  readonly modelPricing?: ShortRewriteServices["modelPricing"];
}

interface GeneratedPayload {
  readonly generation: ShortRewriteGeneration;
  readonly artifact: ShortRewriteArtifact;
  readonly jsonSidecar: ShortRewriteJsonSidecar;
  readonly markdown: string;
  readonly markdownPath: string;
  readonly jsonPath: string;
}

function isTransientOpenAiError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as { readonly code?: unknown; readonly status?: unknown; readonly message?: unknown };
  if (typeof record.status === "number" && [408, 409, 425, 429, 500, 502, 503, 504].includes(record.status)) {
    return true;
  }
  if (typeof record.code === "string" && ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "ECONNREFUSED", "EPIPE"].includes(record.code)) {
    return true;
  }
  const text = `${typeof record.code === "string" ? record.code : ""} ${typeof record.message === "string" ? record.message : ""}`;
  return /connection|connect|timeout|timed out|dns|fetch failed|network error|socket hang up/iu.test(text);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function createAbortError(message: string): Error {
  return new Error(message);
}

function normalizeValidationErrors(errors: string[]): string[] {
  return [...new Set(errors.map((entry) => normalizeWhitespace(entry)).filter(Boolean))];
}

interface ShortRewriteUsagePayload {
  inputTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number | null;
}

interface ShortRewriteArtifactPayload {
  schemaVersion: 1;
  promptVersion: string;
  status: "completed" | "failed" | "skipped";
  episodeId: string;
  episodeSlug: string;
  sourceLanguage: "en";
  targetLanguage: ShortRewriteLanguage;
  sourcePath: string;
  sourceSha256: string;
  markdownOutputPath: string;
  jsonOutputPath: string;
  generatedAt: string;
  model: string;
  requestId?: string;
  generationDurationMs: number;
  inputTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number | null;
  validation: ShortRewriteArtifact["validation"];
}

function buildUsagePayload(args: {
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly reasoningTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly estimatedCostUsd?: number | null;
}): ShortRewriteUsagePayload {
  const usage: ShortRewriteUsagePayload = {};
  if (args.inputTokens !== undefined) {
    usage.inputTokens = args.inputTokens;
  }
  if (args.cachedInputTokens !== undefined) {
    usage.cachedInputTokens = args.cachedInputTokens;
  }
  if (args.reasoningTokens !== undefined) {
    usage.reasoningTokens = args.reasoningTokens;
  }
  if (args.outputTokens !== undefined) {
    usage.outputTokens = args.outputTokens;
  }
  if (args.totalTokens !== undefined) {
    usage.totalTokens = args.totalTokens;
  }
  if (args.estimatedCostUsd !== undefined) {
    usage.estimatedCostUsd = args.estimatedCostUsd;
  }
  return usage;
}

function buildArtifactPayload(args: {
  readonly schemaVersion: 1;
  readonly promptVersion: string;
  readonly status: "completed" | "failed" | "skipped";
  readonly episodeId: string;
  readonly episodeSlug: string;
  readonly sourceLanguage: "en";
  readonly targetLanguage: ShortRewriteLanguage;
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly markdownOutputPath: string;
  readonly jsonOutputPath: string;
  readonly generatedAt: string;
  readonly model: string;
  readonly requestId?: string;
  readonly generationDurationMs: number;
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly reasoningTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly estimatedCostUsd?: number | null;
  readonly validation: ShortRewriteArtifact["validation"];
}): unknown {
  const artifact: ShortRewriteArtifactPayload = {
    schemaVersion: args.schemaVersion,
    promptVersion: args.promptVersion,
    status: args.status,
    episodeId: args.episodeId,
    episodeSlug: args.episodeSlug,
    sourceLanguage: args.sourceLanguage,
    targetLanguage: args.targetLanguage,
    sourcePath: args.sourcePath,
    sourceSha256: args.sourceSha256,
    markdownOutputPath: args.markdownOutputPath,
    jsonOutputPath: args.jsonOutputPath,
    generatedAt: args.generatedAt,
    model: args.model,
    generationDurationMs: args.generationDurationMs,
    validation: args.validation,
  };
  if (args.requestId !== undefined) {
    artifact.requestId = args.requestId;
  }
  if (args.inputTokens !== undefined) {
    artifact.inputTokens = args.inputTokens;
  }
  if (args.cachedInputTokens !== undefined) {
    artifact.cachedInputTokens = args.cachedInputTokens;
  }
  if (args.reasoningTokens !== undefined) {
    artifact.reasoningTokens = args.reasoningTokens;
  }
  if (args.outputTokens !== undefined) {
    artifact.outputTokens = args.outputTokens;
  }
  if (args.totalTokens !== undefined) {
    artifact.totalTokens = args.totalTokens;
  }
  if (args.estimatedCostUsd !== undefined) {
    artifact.estimatedCostUsd = args.estimatedCostUsd;
  }
  return artifact as unknown;
}

function cloneArtifactPayload(artifact: ShortRewriteArtifact): ShortRewriteArtifactPayload {
  const payload: ShortRewriteArtifactPayload = {
    schemaVersion: artifact.schemaVersion,
    promptVersion: artifact.promptVersion,
    status: artifact.status,
    episodeId: artifact.episodeId,
    episodeSlug: artifact.episodeSlug,
    sourceLanguage: artifact.sourceLanguage,
    targetLanguage: artifact.targetLanguage,
    sourcePath: artifact.sourcePath,
    sourceSha256: artifact.sourceSha256,
    markdownOutputPath: artifact.markdownOutputPath,
    jsonOutputPath: artifact.jsonOutputPath,
    generatedAt: artifact.generatedAt,
    model: artifact.model,
    generationDurationMs: artifact.generationDurationMs,
    validation: artifact.validation,
  };
  if (artifact.requestId !== undefined) {
    payload.requestId = artifact.requestId;
  }
  if (artifact.inputTokens !== undefined) {
    payload.inputTokens = artifact.inputTokens;
  }
  if (artifact.cachedInputTokens !== undefined) {
    payload.cachedInputTokens = artifact.cachedInputTokens;
  }
  if (artifact.reasoningTokens !== undefined) {
    payload.reasoningTokens = artifact.reasoningTokens;
  }
  if (artifact.outputTokens !== undefined) {
    payload.outputTokens = artifact.outputTokens;
  }
  if (artifact.totalTokens !== undefined) {
    payload.totalTokens = artifact.totalTokens;
  }
  if (artifact.estimatedCostUsd !== undefined) {
    payload.estimatedCostUsd = artifact.estimatedCostUsd;
  }
  return payload;
}

function analyzeGeneratedPayload(args: {
  readonly parsed: z.infer<typeof shortRewriteResultSchema>;
  readonly language: StoryLanguage;
  readonly source: ResolvedShortRewriteSource;
}): {
  readonly generation: ShortRewriteGeneration;
  readonly validation: ReturnType<typeof buildValidationSummary>;
  readonly warnings: string[];
  readonly issues: string[];
} {
  const wordCount = countSpokenWords(args.parsed.narration);
  const duration175 = estimateDurationSeconds(wordCount, 175);
  const duration180 = estimateDurationSeconds(wordCount, 180);
  const hookMatchesNarration = matchesFirstSentence(
    args.parsed.hook,
    args.parsed.narration
  );
  const validation = buildValidationSummary({
    wordCount,
    hookMatchesNarration,
    thumbnailText: args.parsed.thumbnailText,
    narration: args.parsed.narration,
  });
  const warnings = [...validation.warnings];
  if (wordCount >= 145 && wordCount < 150) {
    warnings.push("Narration is below the preferred range but above the hard minimum.");
  }
  const issues: string[] = [];
  if (!hookMatchesNarration) {
    issues.push("Hook does not exactly match the first sentence of the narration.");
  }
  if (wordCount < 145) {
    issues.push(`Narration word count ${wordCount} is below the hard minimum of 145.`);
  }
  if (wordCount > 170) {
    issues.push(`Narration word count ${wordCount} exceeds the hard maximum of 170.`);
  }
  if (countThumbnailWords(args.parsed.thumbnailText) > 4) {
    issues.push("Thumbnail text exceeds the four-word limit.");
  }
  if (/\b(audio generation instructions|narration script|sound effect|scene change|\[pause\]|\[whisper\]|\[sound effect\]|\[music\])\b/iu.test(args.parsed.narration)) {
    issues.push("Narration contains production labels.");
  }
  if (detectEditorialCommentary(args.parsed.narration).length > 0) {
    issues.push("Narration contains editorial commentary.");
  }
  const generation: ShortRewriteGeneration = {
    title: normalizeWhitespace(args.parsed.title),
    hook: normalizeWhitespace(args.parsed.hook),
    narration: normalizeWhitespace(args.parsed.narration),
    wordCount,
    estimatedDurationSecondsAt175Wpm: duration175,
    estimatedDurationSecondsAt180Wpm: duration180,
    thumbnailText: normalizeWhitespace(args.parsed.thumbnailText),
    fullVideoBridge: normalizeWhitespace(args.parsed.fullVideoBridge),
  };
  return { generation, validation, warnings, issues };
}

function buildRequestSchema(): unknown {
  return {
    type: "json_schema",
    name: "short_rewrite_result",
    schema: z.toJSONSchema(shortRewriteResultSchema),
    strict: true,
  } as const;
}

async function requestStructuredShortRewrite(args: {
  readonly client: Pick<OpenAiStoryClient, "responses">;
  readonly model: string;
  readonly prompt: { readonly system: string; readonly user: string };
  readonly temperature: number;
  readonly reasoningEffort: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | undefined;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly signal: AbortSignal | undefined;
}): Promise<ShortRewriteApiResult> {
  if (!args.client) {
    throw new OpenAIShortRewriteError("Missing OpenAI client for short rewrite.");
  }
  const start = Date.now();
  let lastError: unknown;
  for (let attempt = 0; attempt <= args.maxRetries; attempt += 1) {
    if (args.signal?.aborted) {
      throw createAbortError("Short rewrite was aborted.");
    }
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(createAbortError("Short rewrite request timed out.")),
      args.timeoutMs
    );
    const abortListener = () => controller.abort(args.signal?.reason ?? createAbortError("Short rewrite was aborted."));
    args.signal?.addEventListener("abort", abortListener, { once: true });
    try {
      const request: ResponseCreateRequest = {
        model: args.model,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: args.prompt.system }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: args.prompt.user }],
          },
        ],
        text: { format: buildRequestSchema() },
        temperature: args.temperature,
        max_output_tokens: 1800,
        ...(args.reasoningEffort
          ? { reasoning: { effort: args.reasoningEffort } }
          : {}),
      };
      const response = await args.client.responses.create(request, {
        signal: controller.signal,
      });
      const outputText = response.output_text ?? "";
      if (normalizeWhitespace(outputText).length === 0) {
        throw new OpenAIShortRewriteError("OpenAI returned an empty structured response.");
      }
      const apiResult: ShortRewriteApiResult = {
        id: response.id,
        outputText,
        ...(response.usage?.input_tokens !== undefined
          ? { inputTokens: response.usage.input_tokens }
          : {}),
        ...(response.usage?.input_tokens_details?.cached_tokens !== undefined
          ? { cachedInputTokens: response.usage.input_tokens_details.cached_tokens }
          : {}),
        ...(response.usage?.output_tokens_details?.reasoning_tokens !== undefined
          ? { reasoningTokens: response.usage.output_tokens_details.reasoning_tokens }
          : {}),
        ...(response.usage?.output_tokens !== undefined
          ? { outputTokens: response.usage.output_tokens }
          : {}),
        ...(response.usage?.total_tokens !== undefined
          ? { totalTokens: response.usage.total_tokens }
          : {}),
      };
      return apiResult;
    } catch (error) {
      lastError = error;
      if (attempt < args.maxRetries && isTransientOpenAiError(error)) {
        const jitter = 0.75 + Math.random() * 0.5;
        const backoff = Math.min(8_000, Math.round(500 * 2 ** attempt * jitter));
        await sleep(backoff);
        continue;
      }
      throw new OpenAIShortRewriteError(
        `OpenAI short rewrite request failed via model ${args.model}: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    } finally {
      clearTimeout(timeout);
      args.signal?.removeEventListener("abort", abortListener);
    }
  }
  throw new OpenAIShortRewriteError(
    `OpenAI short rewrite request failed via model ${args.model}: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

function parseStructuredResult(outputText: string): z.infer<typeof shortRewriteResultSchema> {
  const parsedJson = JSON.parse(outputText) as unknown;
  return shortRewriteResultSchema.parse(parsedJson);
}

async function generateLanguagePayload(args: GenerateLanguageRequest): Promise<GeneratedPayload> {
  const paths = resolveShortRewriteOutputPaths({
    outputRoot: args.outputRoot,
    episodeSlug: args.source.episodeSlug,
    episodeNumber: args.source.episodeNumber,
    language: args.language,
  });
  const languageDefinition = SHORT_REWRITE_SUPPORTED_LANGUAGES[args.language];
  const promptContext = {
    episodeNumber: args.source.episodeNumber,
    episodeSlug: args.source.episodeSlug,
    targetLanguage: args.language,
    targetLanguageName: languageDefinition.name,
    targetLocale: languageDefinition.locale,
    sourceStory: args.source.sourceContent,
    narration: args.source.narration,
    title: args.source.title,
  };
  if (args.dryRun) {
    const generation: ShortRewriteGeneration = {
      title: `${args.source.title} (${languageDefinition.name})`,
      hook: firstSentence(args.source.narration),
      narration: args.source.narration,
      wordCount: countSpokenWords(args.source.narration),
      estimatedDurationSecondsAt175Wpm: estimateDurationSeconds(countSpokenWords(args.source.narration), 175),
      estimatedDurationSecondsAt180Wpm: estimateDurationSeconds(countSpokenWords(args.source.narration), 180),
      thumbnailText: args.source.title.split(" ").slice(0, 4).join(" "),
      fullVideoBridge: "Read the full episode for the complete story.",
    };
    const validation = buildValidationSummary({
      wordCount: generation.wordCount,
      hookMatchesNarration: true,
      thumbnailText: generation.thumbnailText,
      narration: generation.narration,
    });
    const generatedAt = new Date().toISOString();
    const artifact = shortRewriteArtifactSchema.parse(
      buildArtifactPayload({
        schemaVersion: 1,
        promptVersion: SHORT_REWRITE_PROMPT_VERSION,
        status: "skipped",
        episodeId: args.source.episodeId,
        episodeSlug: args.source.episodeSlug,
        sourceLanguage: "en",
        targetLanguage: args.language,
        sourcePath: path.relative(path.join(args.outputRoot, args.source.episodeSlug), args.source.sourcePath),
        sourceSha256: args.source.sourceSha256,
        markdownOutputPath: path.relative(path.join(args.outputRoot, args.source.episodeSlug), paths.markdownPath),
        jsonOutputPath: path.relative(path.join(args.outputRoot, args.source.episodeSlug), paths.jsonPath),
        generatedAt,
        model: args.model,
        generationDurationMs: 0,
        validation,
      })
    );
    const jsonSidecar: ShortRewriteJsonSidecar = {
      schemaVersion: 1,
      episodeId: args.source.episodeId,
      episodeSlug: args.source.episodeSlug,
      sourceLanguage: "en",
      targetLanguage: args.language,
      promptVersion: SHORT_REWRITE_PROMPT_VERSION,
      model: args.model,
      sourcePath: path.relative(path.join(args.outputRoot, args.source.episodeSlug), args.source.sourcePath),
      sourceSha256: args.source.sourceSha256,
      generatedAt,
      generation,
      usage: buildUsagePayload({}),
      validation,
    };
    const markdown = buildShortRewriteMarkdown({
      episodeNumber: args.source.episodeNumber,
      generation,
      language: args.language,
    });
    return {
      generation,
      artifact,
      jsonSidecar,
      markdown,
      markdownPath: paths.markdownPath,
      jsonPath: paths.jsonPath,
    };
  }
  const initialPrompt = buildShortRewritePrompt(promptContext);
  const client = args.client;
  if (!client) {
    throw new OpenAIShortRewriteError("Missing OpenAI client for short rewrite.");
  }
  const initialResponse = await requestStructuredShortRewrite({
    client,
    model: args.model,
    prompt: initialPrompt,
    temperature: args.temperature,
    reasoningEffort: args.reasoningEffort,
    timeoutMs: args.timeoutMs,
    maxRetries: args.maxRetries,
    signal: args.signal,
  });
  const initialParsed = parseStructuredResult(initialResponse.outputText);
  const initialAnalysis = analyzeGeneratedPayload({
    parsed: initialParsed,
    language: args.language,
    source: args.source,
  });
  let requestId = initialResponse.id;
  let usage = buildUsagePayload({
    ...(initialResponse.inputTokens !== undefined ? { inputTokens: initialResponse.inputTokens } : {}),
    ...(initialResponse.cachedInputTokens !== undefined
      ? { cachedInputTokens: initialResponse.cachedInputTokens }
      : {}),
    ...(initialResponse.reasoningTokens !== undefined
      ? { reasoningTokens: initialResponse.reasoningTokens }
      : {}),
    ...(initialResponse.outputTokens !== undefined
      ? { outputTokens: initialResponse.outputTokens }
      : {}),
    ...(initialResponse.totalTokens !== undefined ? { totalTokens: initialResponse.totalTokens } : {}),
  });
  let generation = initialAnalysis.generation;
  let validation = initialAnalysis.validation;
  let responsePayload = initialParsed;
  let issues = initialAnalysis.issues;
  let warnings = [...initialAnalysis.warnings];
  if (issues.length > 0) {
    const repairPrompt = buildShortRewriteRepairPrompt({
      context: promptContext,
      invalidResult: responsePayload,
      validationErrors: normalizeValidationErrors(issues),
    });
    const repairResponse = await requestStructuredShortRewrite({
      client,
      model: args.model,
      prompt: repairPrompt,
      temperature: args.temperature,
      reasoningEffort: args.reasoningEffort,
      timeoutMs: args.timeoutMs,
      maxRetries: args.maxRetries,
      signal: args.signal,
    });
    requestId = repairResponse.id;
    usage = buildUsagePayload({
      inputTokens: (usage.inputTokens ?? 0) + (repairResponse.inputTokens ?? 0),
      cachedInputTokens: (usage.cachedInputTokens ?? 0) + (repairResponse.cachedInputTokens ?? 0),
      reasoningTokens: (usage.reasoningTokens ?? 0) + (repairResponse.reasoningTokens ?? 0),
      outputTokens: (usage.outputTokens ?? 0) + (repairResponse.outputTokens ?? 0),
      totalTokens: (usage.totalTokens ?? 0) + (repairResponse.totalTokens ?? 0),
    });
    responsePayload = parseStructuredResult(repairResponse.outputText);
    const repairedAnalysis = analyzeGeneratedPayload({
      parsed: responsePayload,
      language: args.language,
      source: args.source,
    });
    generation = repairedAnalysis.generation;
    validation = repairedAnalysis.validation;
    warnings = [...repairedAnalysis.warnings];
    issues = repairedAnalysis.issues;
    if (issues.length > 0) {
      throw new ShortRewriteValidationError(issues.join("; "));
    }
  }
  if (!isPreferredNarrationLength(generation.wordCount)) {
    warnings.push("Narration is outside the preferred range.");
  }
  const modelPricing = args.modelPricing?.[args.model];
  const cost = estimateTokenCostMicros(modelPricing?.token, {
    ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
    ...(usage.cachedInputTokens !== undefined ? { cachedInputTokens: usage.cachedInputTokens } : {}),
    ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
    audioInputTokens: 0,
    audioOutputTokens: 0,
  });
  const estimatedCostUsd = cost.costMicros === null ? null : cost.costMicros / 1_000_000;
  const generatedAt = new Date().toISOString();
  const jsonSidecar: ShortRewriteJsonSidecar = {
    schemaVersion: 1,
    episodeId: args.source.episodeId,
    episodeSlug: args.source.episodeSlug,
    sourceLanguage: "en",
    targetLanguage: args.language,
    promptVersion: SHORT_REWRITE_PROMPT_VERSION,
    model: args.model,
    sourcePath: path.relative(path.join(args.outputRoot, args.source.episodeSlug), args.source.sourcePath),
    sourceSha256: args.source.sourceSha256,
    generatedAt,
    generation,
    usage: buildUsagePayload({
      ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
      ...(usage.cachedInputTokens !== undefined ? { cachedInputTokens: usage.cachedInputTokens } : {}),
      ...(usage.reasoningTokens !== undefined ? { reasoningTokens: usage.reasoningTokens } : {}),
      ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
      ...(usage.totalTokens !== undefined ? { totalTokens: usage.totalTokens } : {}),
      estimatedCostUsd,
    }),
    validation: {
      ...validation,
      warnings,
    },
  };
  const artifact = shortRewriteArtifactSchema.parse(
    buildArtifactPayload({
      schemaVersion: 1,
      promptVersion: SHORT_REWRITE_PROMPT_VERSION,
      status: "completed",
      episodeId: args.source.episodeId,
      episodeSlug: args.source.episodeSlug,
      sourceLanguage: "en",
      targetLanguage: args.language,
      sourcePath: path.relative(path.join(args.outputRoot, args.source.episodeSlug), args.source.sourcePath),
      sourceSha256: args.source.sourceSha256,
      markdownOutputPath: path.relative(path.join(args.outputRoot, args.source.episodeSlug), paths.markdownPath),
      jsonOutputPath: path.relative(path.join(args.outputRoot, args.source.episodeSlug), paths.jsonPath),
      generatedAt,
      model: args.model,
      requestId,
      generationDurationMs: 0,
      ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
      ...(usage.cachedInputTokens !== undefined ? { cachedInputTokens: usage.cachedInputTokens } : {}),
      ...(usage.reasoningTokens !== undefined ? { reasoningTokens: usage.reasoningTokens } : {}),
      ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
      ...(usage.totalTokens !== undefined ? { totalTokens: usage.totalTokens } : {}),
      estimatedCostUsd,
      validation,
    })
  );
  const markdown = buildShortRewriteMarkdown({
    episodeNumber: args.source.episodeNumber,
    generation,
    language: args.language,
  });
  return {
    generation,
    artifact,
    jsonSidecar,
    markdown,
    markdownPath: paths.markdownPath,
    jsonPath: paths.jsonPath,
  };
}

async function isResumeEligible(args: {
  readonly source: ResolvedShortRewriteSource;
  readonly language: StoryLanguage;
  readonly outputRoot: string;
  readonly model: string;
}): Promise<{ readonly eligible: boolean; readonly artifact?: ShortRewriteArtifact }> {
  const paths = resolveShortRewriteOutputPaths({
    outputRoot: args.outputRoot,
    episodeSlug: args.source.episodeSlug,
    episodeNumber: args.source.episodeNumber,
    language: args.language,
  });
  if (!(await fileExists(paths.jsonPath)) || !(await fileExists(paths.markdownPath))) {
    return { eligible: false };
  }
  const parsed = await readJsonIfExists(paths.jsonPath, (value) =>
    shortRewriteGenerationSchema.parse(value)
  );
  if (!parsed) {
    return { eligible: false };
  }
  if (
    parsed.sourceSha256 !== args.source.sourceSha256 ||
    parsed.promptVersion !== SHORT_REWRITE_PROMPT_VERSION ||
    parsed.model !== args.model ||
    parsed.targetLanguage !== args.language ||
    parsed.episodeSlug !== args.source.episodeSlug ||
    parsed.episodeId !== args.source.episodeId
  ) {
    return { eligible: false };
  }
  if (!parsed.validation.hardWordRangeSatisfied || !parsed.validation.hookMatchesNarration) {
    return { eligible: false };
  }
  const artifact = shortRewriteArtifactSchema.parse(
    buildArtifactPayload({
      schemaVersion: 1,
      promptVersion: SHORT_REWRITE_PROMPT_VERSION,
      status: "completed",
      episodeId: args.source.episodeId,
      episodeSlug: args.source.episodeSlug,
      sourceLanguage: "en",
      targetLanguage: args.language,
      sourcePath: path.relative(path.join(args.outputRoot, args.source.episodeSlug), args.source.sourcePath),
      sourceSha256: args.source.sourceSha256,
      markdownOutputPath: path.relative(path.join(args.outputRoot, args.source.episodeSlug), paths.markdownPath),
      jsonOutputPath: path.relative(path.join(args.outputRoot, args.source.episodeSlug), paths.jsonPath),
      generatedAt: parsed.generatedAt,
      model: args.model,
      generationDurationMs: 0,
      validation: parsed.validation,
      ...(parsed.usage.inputTokens !== undefined ? { inputTokens: parsed.usage.inputTokens } : {}),
      ...(parsed.usage.cachedInputTokens !== undefined ? { cachedInputTokens: parsed.usage.cachedInputTokens } : {}),
      ...(parsed.usage.reasoningTokens !== undefined ? { reasoningTokens: parsed.usage.reasoningTokens } : {}),
      ...(parsed.usage.outputTokens !== undefined ? { outputTokens: parsed.usage.outputTokens } : {}),
      ...(parsed.usage.totalTokens !== undefined ? { totalTokens: parsed.usage.totalTokens } : {}),
      ...(parsed.usage.estimatedCostUsd !== undefined ? { estimatedCostUsd: parsed.usage.estimatedCostUsd } : {}),
    })
  );
  return { eligible: true, artifact };
}

async function mergeManifest(args: {
  readonly manifestPath: string;
  readonly outputRoot: string;
  readonly source: ResolvedShortRewriteSource;
  readonly model: string;
  readonly artifact: ShortRewriteArtifact;
}): Promise<void> {
  await updateShortRewriteManifestAtomically(args.manifestPath, (current) => {
    const nextArtifacts = current?.artifacts.filter(
      (artifact) => artifact.targetLanguage !== args.artifact.targetLanguage
    ) ?? [];
    nextArtifacts.push(args.artifact);
    return shortRewriteManifestSchema.parse({
      schemaVersion: 1,
      promptVersion: SHORT_REWRITE_PROMPT_VERSION,
      episodeId: args.source.episodeId,
      episodeSlug: args.source.episodeSlug,
      sourceLanguage: "en",
      sourcePath: path.relative(path.join(args.outputRoot, args.source.episodeSlug), args.source.sourcePath),
      sourceSha256: args.source.sourceSha256,
      model: args.model,
      generatedAt: current?.generatedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      artifacts: nextArtifacts,
    });
  });
}

export async function rewriteShortStories(
  options: ShortRewriteRunOptions,
  services: Partial<ShortRewriteServices & { readonly signal?: AbortSignal; readonly logger?: Logger }> = {}
): Promise<ShortRewriteRunSummary> {
  const runId = randomUUID();
  const logger = services.logger ?? createLogger(options.verbose ? "debug" : "info");
  const outputRoot = path.resolve(options.outputRoot ?? SHORT_REWRITE_DEFAULT_OUTPUT_ROOT);
  const resolvedSource = await resolveShortRewriteInput({
    inputPath: options.inputPath,
    episode: options.episode,
    episodeSlug: options.episodeSlug,
    outputRoot,
  });
  const canonicalSourcePath = path.join(
    outputRoot,
    resolvedSource.episodeSlug,
    "source",
    buildCanonicalSourceFileName({
      episodeNumber: resolvedSource.episodeNumber,
      episodeSlug: resolvedSource.episodeSlug,
    })
  );
  const source = {
    ...resolvedSource,
    sourcePath: canonicalSourcePath,
  };
  if (!options.dryRun) {
    await materializeCanonicalSourceStory({
      sourcePath: resolvedSource.sourcePath,
      targetPath: canonicalSourcePath,
      sourceSha256: resolvedSource.sourceSha256,
      overwrite: options.overwrite ?? options.force ?? false,
    });
  }
  const client =
    services.client ??
    (options.dryRun
      ? undefined
      : createOpenAiStoryClientWithOptions({
          timeoutMs: options.timeoutMs ?? SHORT_REWRITE_DEFAULT_TIMEOUT_MS,
          maxRetries: options.maxRetries ?? SHORT_REWRITE_DEFAULT_MAX_RETRIES,
        }));
  const selectedLanguages = options.languages;
  const startedAt = Date.now();
  const artifacts: ShortRewriteArtifact[] = [];
  const failures: Array<{ readonly language: StoryLanguage; readonly message: string }> = [];
  let completed = 0;
  let skipped = 0;
  let failed = 0;
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let reasoningTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let estimatedCostUsd: number | null = 0;
  const languageTasks = selectedLanguages.map(async (language) => {
    const paths = resolveShortRewriteOutputPaths({
      outputRoot,
      episodeSlug: source.episodeSlug,
      episodeNumber: source.episodeNumber,
      language,
    });
    const episodeRelativeRoot = path.join(outputRoot, source.episodeSlug);
    const buildFailedArtifact = (message: string, generatedAt: string, durationMs: number): ShortRewriteArtifact =>
      shortRewriteArtifactSchema.parse(
        buildArtifactPayload({
          schemaVersion: 1,
          promptVersion: SHORT_REWRITE_PROMPT_VERSION,
          status: "failed",
          episodeId: source.episodeId,
          episodeSlug: source.episodeSlug,
          sourceLanguage: "en",
          targetLanguage: language,
          sourcePath: path.relative(episodeRelativeRoot, source.sourcePath),
          sourceSha256: source.sourceSha256,
          markdownOutputPath: path.relative(episodeRelativeRoot, paths.markdownPath),
          jsonOutputPath: path.relative(episodeRelativeRoot, paths.jsonPath),
          generatedAt,
          model: options.model,
          generationDurationMs: durationMs,
          validation: {
            preferredWordRangeSatisfied: false,
            hardWordRangeSatisfied: false,
            hookMatchesNarration: false,
            thumbnailWordCount: 0,
            warnings: [message],
          },
        })
      );

    const start = Date.now();
    try {
      if (options.dryRun) {
        const payload = await generateLanguagePayload({
          source,
          outputRoot,
          language,
          model: options.model,
          temperature: options.temperature ?? SHORT_REWRITE_DEFAULT_TEMPERATURE,
          reasoningEffort: options.reasoningEffort,
          timeoutMs: options.timeoutMs ?? SHORT_REWRITE_DEFAULT_TIMEOUT_MS,
          maxRetries: options.maxRetries ?? SHORT_REWRITE_DEFAULT_MAX_RETRIES,
          overwrite: options.overwrite ?? false,
          resume: options.resume ?? false,
          dryRun: true,
          client,
          logger,
          signal: services.signal,
          modelPricing: services.modelPricing,
        });
        return { language, artifact: payload.artifact, skipped: true as const };
      }

      const existing = await isResumeEligible({
        source,
        language,
        outputRoot,
        model: options.model,
      });
      if (existing.eligible && existing.artifact && options.resume) {
        const skippedPayload = cloneArtifactPayload(existing.artifact);
        skippedPayload.status = "skipped";
        skippedPayload.generationDurationMs = 0;
        const skippedArtifact = shortRewriteArtifactSchema.parse(skippedPayload);
        await mergeManifest({
          manifestPath: paths.manifestPath,
          outputRoot,
          source,
          model: options.model,
          artifact: skippedArtifact,
        });
        return {
          language,
          artifact: skippedArtifact,
          skipped: true as const,
        };
      }
      if (existing.eligible && !options.overwrite && !options.resume) {
        return {
          language,
          artifact: buildFailedArtifact(
            `${SHORT_REWRITE_SUPPORTED_LANGUAGES[language].name} output already exists and is valid. Use --resume to skip it or --overwrite to replace it.`,
            new Date().toISOString(),
            Date.now() - start
          ),
          skipped: false as const,
          error:
            `${SHORT_REWRITE_SUPPORTED_LANGUAGES[language].name} output already exists and is valid. Use --resume to skip it or --overwrite to replace it.`,
        };
      }

      await ensureDir(path.dirname(paths.markdownPath));
      const payload = await generateLanguagePayload({
        source,
        outputRoot,
        language,
        model: options.model,
        temperature: options.temperature ?? SHORT_REWRITE_DEFAULT_TEMPERATURE,
        reasoningEffort: options.reasoningEffort,
        timeoutMs: options.timeoutMs ?? SHORT_REWRITE_DEFAULT_TIMEOUT_MS,
        maxRetries: options.maxRetries ?? SHORT_REWRITE_DEFAULT_MAX_RETRIES,
        overwrite: options.overwrite ?? false,
        resume: options.resume ?? false,
        dryRun: false,
        client,
        logger,
        signal: services.signal,
        modelPricing: services.modelPricing,
      });
      const artifactPayload = cloneArtifactPayload(payload.artifact);
      artifactPayload.generationDurationMs = Date.now() - start;
      const artifact = shortRewriteArtifactSchema.parse(artifactPayload);
      const jsonSidecar = {
        ...payload.jsonSidecar,
        generatedAt: artifact.generatedAt,
      } satisfies ShortRewriteJsonSidecar;
      await writeShortRewriteArtifactFiles({
        markdownPath: payload.markdownPath,
        jsonPath: payload.jsonPath,
        compatibilityMarkdownPath: paths.compatibilityMarkdownPath,
        compatibilityJsonPath: paths.compatibilityJsonPath,
        markdown: payload.markdown,
        jsonSidecar,
      });
      await mergeManifest({
        manifestPath: paths.manifestPath,
        outputRoot,
        source,
        model: options.model,
        artifact,
      });
      return { language, artifact, skipped: false as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedArtifact = buildFailedArtifact(message, new Date().toISOString(), Date.now() - start);
      try {
        await mergeManifest({
          manifestPath: paths.manifestPath,
          outputRoot,
          source,
          model: options.model,
          artifact: failedArtifact,
        });
      } catch {
        // The task already failed; keep the original error path intact.
      }
      return {
        language,
        artifact: failedArtifact,
        skipped: false as const,
        error: message,
      };
    }
  });
  const concurrency = Math.max(1, options.maxConcurrency ?? SHORT_REWRITE_DEFAULT_CONCURRENCY);
  const results: Array<{
    readonly language: StoryLanguage;
    readonly artifact: ShortRewriteArtifact;
    readonly skipped: boolean;
    readonly error?: string;
  }> = [];
  const queue = [...languageTasks];
  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) {
        return;
      }
      const result = await next;
      results.push(result);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length || 1) }, () => worker())
  );
  for (const result of results) {
    artifacts.push(result.artifact);
    if (result.skipped) {
      skipped += 1;
    } else {
      if (result.error) {
        failed += 1;
        failures.push({ language: result.language, message: result.error });
      } else {
        completed += 1;
      }
      inputTokens += result.artifact.inputTokens ?? 0;
      cachedInputTokens += result.artifact.cachedInputTokens ?? 0;
      reasoningTokens += result.artifact.reasoningTokens ?? 0;
      outputTokens += result.artifact.outputTokens ?? 0;
      totalTokens += result.artifact.totalTokens ?? 0;
      estimatedCostUsd =
        result.artifact.estimatedCostUsd === null || result.artifact.estimatedCostUsd === undefined
          ? estimatedCostUsd
          : (estimatedCostUsd ?? 0) + result.artifact.estimatedCostUsd;
    }
  }
  if (options.dryRun) {
    skipped = selectedLanguages.length;
    completed = 0;
    failed = 0;
  }
  return {
    command: "stories rewrite-short",
    runId,
    episodeId: source.episodeId,
    episodeSlug: source.episodeSlug,
    sourcePath: source.sourcePath,
    sourceSha256: source.sourceSha256,
    promptVersion: SHORT_REWRITE_PROMPT_VERSION,
    model: options.model,
    languagesRequested: selectedLanguages,
    completed,
    skipped,
    failed,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    reasoningTokens,
    totalTokens,
    estimatedCostUsd,
    generationDurationMs: Date.now() - startedAt,
    artifacts,
    failures,
    dryRun: options.dryRun ?? false,
  };
}
