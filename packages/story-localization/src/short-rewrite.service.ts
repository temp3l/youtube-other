import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod.js";
import { createLogger } from "@mediaforge/observability";
import { estimateTokenCostMicros } from "@mediaforge/observability";
import {
  countSpokenWords,
  ensureDir,
  fileExists,
  hashText,
  normalizeWhitespace,
} from "@mediaforge/shared";
import {
  createOpenAiStoryClientWithOptions,
  type OpenAiStoryClient,
} from "./story-localization-openai-batch.js";
import {
  DEFAULT_SHORT_REWRITE_MAX_OUTPUT_TOKENS,
  DEFAULT_SHORT_REWRITE_RETRY_MAX_OUTPUT_TOKENS,
  SHORT_REWRITE_DEFAULT_CONCURRENCY,
  SHORT_REWRITE_DEFAULT_MODEL,
  SHORT_REWRITE_DEFAULT_OUTPUT_ROOT,
  SHORT_REWRITE_DEFAULT_MAX_RETRIES,
  SHORT_REWRITE_DEFAULT_MAX_SOURCE_BYTES,
  SHORT_REWRITE_DEFAULT_TEMPERATURE,
  SHORT_REWRITE_DEFAULT_TIMEOUT_MS,
  SHORT_REWRITE_HARD_WORD_RANGE,
  SHORT_REWRITE_PROMPT_VERSION,
  SHORT_REWRITE_SUPPORTED_LANGUAGES,
  type ShortRewriteLanguage,
} from "./short-rewrite.constants.js";
import {
  shortRewriteArtifactSchema,
  shortRewriteGenerationSchema,
  shortRewriteManifestSchema,
} from "./short-rewrite.schemas.js";
import { buildShortRewriteMarkdown } from "./short-rewrite.renderer.js";
import {
  buildShortRewritePrompt,
  buildShortRewriteRegenerationPrompt,
  buildShortRewriteRepairPrompt,
} from "./short-rewrite.prompt.js";
import { compileShortStoryPrompt } from "./story-prompt-compiler.js";
import { extractCanonicalStoryFacts } from "./canonical-facts.service.js";
import { adaptCanonicalStoryFactsToStoryIR } from "./story-artifact-model.js";
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
import { shouldIncludeTemperatureForModel } from "./story-localization.utils.js";
import { resolveEpisodeCacheDirectory } from "./story-localization-cache.js";
import {
  writeJsonAtomicIfChanged,
  writeTextAtomicIfChanged,
} from "./story-localization.utils.js";
import {
  assertStoryPreflightAllowed,
  estimateStoryComponent,
  estimateStoryTokens,
  estimateStructuredRequestWrapperTokens,
  resolveStoryPreflightDirectory,
  runAndPersistStoryPreflight,
  type StoryPreflightRequest,
} from "./story-generation-preflight.js";
import {
  buildPersistedFailedRequestMetadata,
  decideRetryRoute,
  normalizeIncompleteResponse,
  StoryRetryableRequestError,
  type PersistedFailedRequestMetadata,
} from "./story-retry-routing.js";
import {
  type StoryRequestFingerprintInput,
} from "./story-request-telemetry.js";
import {
  shortNarrationResponseSchema,
  shortNarrationResponseSchemaDescriptor,
  type ShortNarrationResponse,
} from "./story-prompt-response-schemas.js";
import { materializeCanonicalSourceStory } from "./short-rewrite.bootstrap.js";
import {
  type ResolvedShortRewriteSource,
  type ShortRewriteAdaptationContract,
  type ShortRewriteApiResult,
  type ShortRewriteArtifact,
  type ShortRewriteGeneration,
  type ShortRewriteGenerationResult,
  type ShortRewriteJsonSidecar,
  type ShortRewriteManifest,
  type ShortRewriteResolvedParent,
  type ShortRewriteResolvedInput,
  type ShortRewriteRunOptions,
  type ShortRewriteRunSummary,
  type ShortRewriteServices,
  type ShortRewriteSourceExtraction,
  type StoryLanguage,
} from "./short-rewrite.types.js";
import { resolveShortRewriteInput } from "./short-rewrite.resolution.js";
import { parseCanonicalSourceStory } from "./source-story-parser.js";
import {
  updateShortRewriteManifestAtomically,
  writeShortRewriteArtifactFiles,
} from "./short-rewrite.persistence.js";
import { withFileLock } from "./story-localization-batch-storage.js";
import { getRepoRoot } from "./story-localization.utils.js";
import { stableSerialize } from "./stable-json.js";
import {
  buildShortAdaptationContract,
  buildShortSourceExtraction,
  SHORT_ADAPTATION_CONTRACT_SCHEMA_VERSION,
  SHORT_ADAPTATION_CONTRACT_VERSION,
  SHORT_SOURCE_EXTRACTION_VERSION,
} from "./short-adaptation-contract.js";
import { getLanguageProfile } from "./language-profiles.js";
import {
  canonicalEnglishFullArtifactSchema,
  resolveCanonicalEnglishFullPaths,
} from "./canonical-full-story.persistence.js";
import {
  adaptNarrationOnlyFullToLegacyRendererPackage,
  narrationOnlyFullRewriteResponseSchema,
} from "./story-prompt-response-schemas.js";
import { renderLocalizedFullStory } from "./story-markdown-renderer.js";
import { resolveEpisodeStoryProductionDirectory } from "./story-production.js";
import {
  type GeneratedStoryValidationIssueCode,
  validateShortNarrationArtifact,
} from "./generated-story-validator.js";

type ResponseCreateRequest = Parameters<
  OpenAiStoryClient["responses"]["create"]
>[0];
type Logger = ReturnType<typeof createLogger>;
type StructuredResponsesClient = {
  readonly parse?: (
    request: ResponseCreateRequest,
    options?: { readonly signal?: AbortSignal }
  ) => Promise<{
    readonly id: string;
    readonly output_parsed?: unknown | null;
    readonly output_text?: string;
    readonly output?: readonly unknown[];
    readonly usage?: {
      readonly input_tokens?: number;
      readonly output_tokens?: number;
      readonly input_tokens_details?: { readonly cached_tokens?: number };
      readonly output_tokens_details?: { readonly reasoning_tokens?: number };
      readonly total_tokens?: number;
    };
  }>;
  readonly create: OpenAiStoryClient["responses"]["create"];
};

interface GenerateLanguageRequest {
  readonly source: ResolvedShortRewriteSource;
  readonly parent: ShortRewriteResolvedParent;
  readonly sourceExtraction: ShortRewriteSourceExtraction;
  readonly adaptationContract: ShortRewriteAdaptationContract;
  readonly outputRoot: string;
  readonly language: StoryLanguage;
  readonly model: string;
  readonly repairModel: string | undefined;
  readonly temperature: number;
  readonly reasoningEffort:
    | "none"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | undefined;
  readonly maxOutputTokens: number;
  readonly retryMaxOutputTokens: number;
  readonly repairReasoningEffort:
    | "none"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | undefined;
  readonly repairMaxOutputTokens: number | undefined;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly overwrite: boolean;
  readonly resume: boolean;
  readonly dryRun: boolean;
  readonly signal: AbortSignal | undefined;
  readonly client: Pick<OpenAiStoryClient, "responses"> | undefined;
  readonly logger: Logger;
  readonly modelPricing?: ShortRewriteServices["modelPricing"];
  readonly debugDirectory?: string;
  readonly debugFileBaseName?: string;
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
  const record = error as {
    readonly code?: unknown;
    readonly status?: unknown;
    readonly message?: unknown;
  };
  if (
    typeof record.status === "number" &&
    [408, 409, 425, 429, 500, 502, 503, 504].includes(record.status)
  ) {
    return true;
  }
  if (
    typeof record.code === "string" &&
    [
      "ECONNRESET",
      "ETIMEDOUT",
      "EAI_AGAIN",
      "ENOTFOUND",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_SOCKET",
      "ECONNREFUSED",
      "EPIPE",
    ].includes(record.code)
  ) {
    return true;
  }
  const text = `${typeof record.code === "string" ? record.code : ""} ${typeof record.message === "string" ? record.message : ""}`;
  return /connection|connect|timeout|timed out|dns|fetch failed|network error|socket hang up/iu.test(
    text
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function createAbortError(message: string): Error {
  return new Error(message);
}

function normalizeValidationErrors(errors: string[]): string[] {
  return [
    ...new Set(
      errors.map((entry) => normalizeWhitespace(entry)).filter(Boolean)
    ),
  ];
}

function buildFailedRequestMetadata(args: {
  readonly model: string;
  readonly reasoningEffort?:
    | "none"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh";
  readonly maxOutputTokens: number;
  readonly attemptNumber: number;
  readonly requestFingerprint?: string;
  readonly incompleteReason?: string;
  readonly usage?: ShortRewriteUsagePayload;
  readonly estimatedCostUsd?: number | null;
}): PersistedFailedRequestMetadata {
  return buildPersistedFailedRequestMetadata({
    model: args.model,
    ...(args.reasoningEffort !== undefined
      ? { reasoningEffort: args.reasoningEffort }
      : {}),
    outputCap: args.maxOutputTokens,
    attemptNumber: args.attemptNumber,
    ...(args.requestFingerprint !== undefined
      ? { requestFingerprint: args.requestFingerprint }
      : {}),
    ...(args.incompleteReason !== undefined
      ? { incompleteReason: args.incompleteReason }
      : {}),
    ...(args.usage !== undefined ? { usage: buildUsagePayload(args.usage) } : {}),
    ...(args.estimatedCostUsd !== undefined
      ? { estimatedCostUsd: args.estimatedCostUsd }
      : {}),
  });
}

function shouldUseTargetedShortRepair(errors: readonly string[]): boolean {
  return errors.every((entry) =>
    /hook|word count|production labels|editorial commentary|thumbnail/iu.test(
      entry
    )
  );
}

async function persistShortRewriteDebugArtifacts(args: {
  readonly debugDirectory: string;
  readonly fileBaseName: string;
  readonly requestLabel: string;
  readonly prompt: { readonly system: string; readonly user: string };
  readonly request: Record<string, unknown>;
  readonly response?: {
    readonly requestId?: string;
    readonly status: "completed" | "failed";
    readonly responseId?: string;
    readonly outputText?: string;
    readonly responseJson?: unknown;
    readonly startedAt: number;
    readonly finishedAt: number;
    readonly durationMs: number;
    readonly usage?: {
      readonly inputTokens?: number;
      readonly cachedInputTokens?: number;
      readonly reasoningTokens?: number;
      readonly outputTokens?: number;
      readonly totalTokens?: number;
    };
  };
  readonly error?: unknown;
}): Promise<void> {
  await ensureDir(args.debugDirectory);
  const basePath = path.join(args.debugDirectory, args.fileBaseName);
  await Promise.all([
    writeTextAtomicIfChanged(
      `${basePath}.prompt.md`,
      `SYSTEM:\n${args.prompt.system}\n\nUSER:\n${args.prompt.user}\n`,
      true
    ),
    writeJsonAtomicIfChanged(`${basePath}.request.json`, args.request, true),
    writeJsonAtomicIfChanged(
      `${basePath}.response.json`,
      args.response
        ? {
            requestId: args.response.requestId,
            status: args.response.status,
            responseId: args.response.responseId,
            outputText: args.response.outputText,
            responseJson: args.response.responseJson,
            startedAt: args.response.startedAt,
            finishedAt: args.response.finishedAt,
            durationMs: args.response.durationMs,
            usage: args.response.usage,
          }
        : {
            status: "failed",
            error:
              args.error instanceof Error
                ? {
                    name: args.error.name,
                    message: args.error.message,
                    stack: args.error.stack,
                  }
                : { message: String(args.error ?? "Unknown error") },
          },
      true
    ),
    writeJsonAtomicIfChanged(
      `${basePath}.response-text.json`,
      args.response?.responseJson ??
        (args.error ? { error: String(args.error) } : null),
      true
    ),
    ...(args.error
      ? [
          writeJsonAtomicIfChanged(
            `${basePath}.error.json`,
            {
              requestLabel: args.requestLabel,
              failedAt: new Date().toISOString(),
              error:
                args.error instanceof Error
                  ? {
                      name: args.error.name,
                      message: args.error.message,
                      stack: args.error.stack,
                    }
                  : { message: String(args.error) },
            },
            true
          ),
        ]
      : []),
  ]);
}

interface ShortRewriteUsagePayload {
  inputTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number | null;
  pricingVersion?: string;
}

interface ShortRewriteArtifactPayload {
  schemaVersion: 2;
  promptVersion: string;
  promptFingerprint?: string;
  status: "completed" | "failed" | "skipped";
  episodeId: string;
  episodeSlug: string;
  sourceLanguage: "en";
  targetLanguage: ShortRewriteLanguage;
  sourcePath: string;
  sourceSha256: string;
  locale: string;
  variant: "short";
  parent: ShortRewriteArtifact["parent"];
  storyIrHash: string;
  shortContractHash: string;
  shortContractVersion: string;
  shortContractSchemaVersion: string;
  shortSourceExtractionHash: string;
  shortSourceExtractionVersion: string;
  canonical: boolean;
  markdownOutputPath: string;
  jsonOutputPath: string;
  generatedAt: string;
  model: string;
  reasoningEffort?: string;
  maxOutputTokens?: number;
  requestId?: string;
  generationDurationMs: number;
  inputTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number | null;
  failedRequest?: PersistedFailedRequestMetadata;
  repairHistory?: ShortRewriteArtifact["repairHistory"];
  promptLineage?: ShortRewriteArtifact["promptLineage"];
  validation: ShortRewriteArtifact["validation"];
}

function buildUsagePayload(args: {
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly reasoningTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly estimatedCostUsd?: number | null;
  readonly pricingVersion?: string;
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
  if (args.pricingVersion !== undefined) {
    usage.pricingVersion = args.pricingVersion;
  }
  return usage;
}

function buildArtifactPayload(args: {
  readonly schemaVersion: 2;
  readonly promptVersion: string;
  readonly promptFingerprint?: string;
  readonly status: "completed" | "failed" | "skipped";
  readonly episodeId: string;
  readonly episodeSlug: string;
  readonly sourceLanguage: "en";
  readonly targetLanguage: ShortRewriteLanguage;
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly locale: string;
  readonly variant: "short";
  readonly parent: ShortRewriteArtifact["parent"];
  readonly storyIrHash: string;
  readonly shortContractHash: string;
  readonly shortContractVersion: string;
  readonly shortContractSchemaVersion: string;
  readonly shortSourceExtractionHash: string;
  readonly shortSourceExtractionVersion: string;
  readonly canonical: boolean;
  readonly markdownOutputPath: string;
  readonly jsonOutputPath: string;
  readonly generatedAt: string;
  readonly model: string;
  readonly reasoningEffort?: string | undefined;
  readonly maxOutputTokens?: number | undefined;
  readonly requestId?: string | undefined;
  readonly generationDurationMs: number;
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly reasoningTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly estimatedCostUsd?: number | null;
  readonly failedRequest?: PersistedFailedRequestMetadata | undefined;
  readonly repairHistory?: ShortRewriteArtifact["repairHistory"] | undefined;
  readonly promptLineage?: ShortRewriteArtifact["promptLineage"] | undefined;
  readonly validation: ShortRewriteArtifact["validation"];
}): unknown {
  const artifact: ShortRewriteArtifactPayload = {
    schemaVersion: args.schemaVersion,
    promptVersion: args.promptVersion,
    ...(args.promptFingerprint
      ? { promptFingerprint: args.promptFingerprint }
      : {}),
    status: args.status,
    episodeId: args.episodeId,
    episodeSlug: args.episodeSlug,
    sourceLanguage: args.sourceLanguage,
    targetLanguage: args.targetLanguage,
    sourcePath: args.sourcePath,
    sourceSha256: args.sourceSha256,
    locale: args.locale,
    variant: args.variant,
    parent: args.parent,
    storyIrHash: args.storyIrHash,
    shortContractHash: args.shortContractHash,
    shortContractVersion: args.shortContractVersion,
    shortContractSchemaVersion: args.shortContractSchemaVersion,
    shortSourceExtractionHash: args.shortSourceExtractionHash,
    shortSourceExtractionVersion: args.shortSourceExtractionVersion,
    canonical: args.canonical,
    markdownOutputPath: args.markdownOutputPath,
    jsonOutputPath: args.jsonOutputPath,
    generatedAt: args.generatedAt,
    model: args.model,
    generationDurationMs: args.generationDurationMs,
    validation: args.validation,
  };
  if (args.reasoningEffort !== undefined) {
    artifact.reasoningEffort = args.reasoningEffort;
  }
  if (args.maxOutputTokens !== undefined) {
    artifact.maxOutputTokens = args.maxOutputTokens;
  }
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
  if (args.failedRequest !== undefined) {
    artifact.failedRequest = args.failedRequest;
  }
  if (args.repairHistory !== undefined) {
    artifact.repairHistory = args.repairHistory;
  }
  if (args.promptLineage !== undefined) {
    artifact.promptLineage = args.promptLineage;
  }
  return artifact as unknown;
}

function cloneArtifactPayload(
  artifact: ShortRewriteArtifact
): ShortRewriteArtifactPayload {
  const payload: ShortRewriteArtifactPayload = {
    schemaVersion: artifact.schemaVersion,
    promptVersion: artifact.promptVersion,
    ...(artifact.promptFingerprint
      ? { promptFingerprint: artifact.promptFingerprint }
      : {}),
    status: artifact.status,
    episodeId: artifact.episodeId,
    episodeSlug: artifact.episodeSlug,
    sourceLanguage: artifact.sourceLanguage,
    targetLanguage: artifact.targetLanguage,
    sourcePath: artifact.sourcePath,
    sourceSha256: artifact.sourceSha256,
    locale: artifact.locale,
    variant: artifact.variant,
    parent: artifact.parent,
    storyIrHash: artifact.storyIrHash,
    shortContractHash: artifact.shortContractHash,
    shortContractVersion: artifact.shortContractVersion,
    shortContractSchemaVersion: artifact.shortContractSchemaVersion,
    shortSourceExtractionHash: artifact.shortSourceExtractionHash,
    shortSourceExtractionVersion: artifact.shortSourceExtractionVersion,
    canonical: artifact.canonical,
    markdownOutputPath: artifact.markdownOutputPath,
    jsonOutputPath: artifact.jsonOutputPath,
    generatedAt: artifact.generatedAt,
    model: artifact.model,
    generationDurationMs: artifact.generationDurationMs,
    validation: artifact.validation,
  };
  if (artifact.reasoningEffort !== undefined) {
    payload.reasoningEffort = artifact.reasoningEffort;
  }
  if (artifact.maxOutputTokens !== undefined) {
    payload.maxOutputTokens = artifact.maxOutputTokens;
  }
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
  if (artifact.failedRequest !== undefined) {
    payload.failedRequest = buildPersistedFailedRequestMetadata({
      model: artifact.failedRequest.model,
      ...(artifact.failedRequest.reasoningEffort !== undefined
        ? { reasoningEffort: artifact.failedRequest.reasoningEffort }
        : {}),
      outputCap: artifact.failedRequest.outputCap,
      attemptNumber: artifact.failedRequest.attemptNumber,
      ...(artifact.failedRequest.requestFingerprint !== undefined
        ? { requestFingerprint: artifact.failedRequest.requestFingerprint }
        : {}),
      ...(artifact.failedRequest.incompleteReason !== undefined
        ? { incompleteReason: artifact.failedRequest.incompleteReason }
        : {}),
      ...(artifact.failedRequest.usage !== undefined
        ? {
            usage: buildUsagePayload({
              ...(artifact.failedRequest.usage.inputTokens !== undefined
                ? { inputTokens: artifact.failedRequest.usage.inputTokens }
                : {}),
              ...(artifact.failedRequest.usage.cachedInputTokens !== undefined
                ? {
                    cachedInputTokens:
                      artifact.failedRequest.usage.cachedInputTokens,
                  }
                : {}),
              ...(artifact.failedRequest.usage.reasoningTokens !== undefined
                ? {
                    reasoningTokens:
                      artifact.failedRequest.usage.reasoningTokens,
                  }
                : {}),
              ...(artifact.failedRequest.usage.outputTokens !== undefined
                ? { outputTokens: artifact.failedRequest.usage.outputTokens }
                : {}),
              ...(artifact.failedRequest.usage.totalTokens !== undefined
                ? { totalTokens: artifact.failedRequest.usage.totalTokens }
                : {}),
              ...(artifact.failedRequest.usage.estimatedCostUsd !== undefined
                ? {
                    estimatedCostUsd:
                      artifact.failedRequest.usage.estimatedCostUsd,
                  }
                : {}),
            }),
          }
        : {}),
      ...(artifact.failedRequest.estimatedCostUsd !== undefined
        ? { estimatedCostUsd: artifact.failedRequest.estimatedCostUsd }
        : {}),
    });
  }
  if (artifact.repairHistory !== undefined) {
    payload.repairHistory = artifact.repairHistory;
  }
  if (artifact.promptLineage !== undefined) {
    payload.promptLineage = artifact.promptLineage;
  }
  return payload;
}

function hashNarrationParagraphs(paragraphs: readonly string[]): string {
  return sha256NormalizedSource(paragraphs.map((entry) => normalizeWhitespace(entry)).join("\n\n"));
}

function buildShortRequestFingerprint(args: {
  readonly compiledPromptFingerprint: string;
  readonly compilerVersion: string;
  readonly responseSchemaName: string;
  readonly responseSchemaVersion: string;
  readonly responseSchemaFingerprint: string;
  readonly model: string;
  readonly reasoningEffort?: string | undefined;
  readonly maxOutputTokens: number;
  readonly language: StoryLanguage;
  readonly locale: string;
  readonly parentFullHash: string;
  readonly storyIrHash: string;
  readonly shortContractHash: string;
}): string {
  return hashText(
    stableSerialize({
      variant: args.language === "en" ? "canonical-english-short" : "localized-short",
      locale: args.locale,
      compilerVersion: args.compilerVersion,
      compiledPromptFingerprint: args.compiledPromptFingerprint,
      responseSchema: {
        name: args.responseSchemaName,
        version: args.responseSchemaVersion,
        fingerprint: args.responseSchemaFingerprint,
      },
      model: args.model,
      reasoningEffort: args.reasoningEffort ?? "default",
      maxOutputTokens: args.maxOutputTokens,
      parentFullHash: args.parentFullHash,
      storyIrHash: args.storyIrHash,
      shortContractHash: args.shortContractHash,
    })
  );
}

async function resolveCanonicalEnglishParent(args: {
  readonly outputRoot: string;
  readonly source: ResolvedShortRewriteSource;
}): Promise<ShortRewriteResolvedParent> {
  const canonicalPaths = resolveCanonicalEnglishFullPaths(
    args.outputRoot,
    args.source.episodeSlug
  );
  const artifact = await readJsonIfExists(canonicalPaths.canonicalArtifactPath, (value) =>
    canonicalEnglishFullArtifactSchema.parse(value)
  );
  if (!artifact || artifact.status !== "completed" || artifact.validation.status !== "passed") {
    throw new ShortRewriteValidationError(
      "English short requires a validated canonical English full parent artifact."
    );
  }
  const narrationParagraphs = artifact.response.full.narrationParagraphs.map((entry) =>
    normalizeWhitespace(entry)
  );
  return {
    identity: {
      episodeId: args.source.episodeId,
      episodeSlug: args.source.episodeSlug,
      language: "en",
      locale: artifact.locale,
      variant: "full",
    },
    title: args.source.title,
    sourcePath: canonicalPaths.canonicalMarkdownPath,
    sourceSha256: args.source.sourceSha256,
    parentFullHash: hashNarrationParagraphs(narrationParagraphs),
    storyIrHash: artifact.lineage.storyIrHash,
    contractHash: artifact.lineage.contractHash,
    contractBuildFingerprint: artifact.lineage.contractBuildFingerprint,
    narrationParagraphs,
    canonical: true,
    provenance: "canonical-full-artifact",
  };
}

async function resolveLocalizedFullParent(args: {
  readonly outputRoot: string;
  readonly source: ResolvedShortRewriteSource;
  readonly language: StoryLanguage;
}): Promise<ShortRewriteResolvedParent> {
  const languageProfile = SHORT_REWRITE_SUPPORTED_LANGUAGES[args.language];
  const cacheDirectory = resolveEpisodeCacheDirectory(
    args.outputRoot,
    args.source.episodeSlug
  );
  const productionDirectory = resolveEpisodeStoryProductionDirectory(cacheDirectory, {
    episodeNumber: args.source.episodeNumber,
    slug: args.source.episodeSlug,
  });
  const artifactPath = path.join(
    productionDirectory,
    `${args.language}-full-narration-result.json`
  );
  const localizedArtifact = await readJsonIfExists(artifactPath, (value) =>
    z
      .object({
        schemaVersion: z.string().min(1),
        promptFingerprint: z.string().min(1).optional(),
        responseSchemaName: z.string().min(1).optional(),
        responseSchemaVersion: z.string().min(1).optional(),
        responseSchemaFingerprint: z.string().min(1).optional(),
        lineage: z
          .object({
            kind: z.literal("canonical-english-full"),
            fingerprint: z.string().min(1),
            sourceHash: z.string().min(1),
            language: z.literal("en").optional(),
            locale: z.literal("en-US").optional(),
            variant: z.literal("full").optional(),
            storyIrHash: z.string().min(1).optional(),
            contractHash: z.string().min(1).optional(),
            contractBuildFingerprint: z.string().min(1).optional(),
          })
          .strict(),
        validationIssues: z.array(z.string().min(1)),
        result: narrationOnlyFullRewriteResponseSchema,
      })
      .strict()
      .parse(value)
  );
  if (!localizedArtifact || localizedArtifact.validationIssues.length > 0) {
    throw new ShortRewriteValidationError(
      `${languageProfile.name} short requires a validated matching-locale full parent artifact.`
    );
  }
  if (localizedArtifact.result.language !== args.language) {
    throw new ShortRewriteValidationError(
      `${languageProfile.name} short cannot derive from ${localizedArtifact.result.language} full narration.`
    );
  }
  const compatibilityFull = adaptNarrationOnlyFullToLegacyRendererPackage({
    sourceStory: await parseCanonicalSourceStory(
      path.join(
        args.outputRoot,
        args.source.episodeSlug,
        "source",
        buildCanonicalSourceFileName({
          episodeNumber: args.source.episodeNumber,
          episodeSlug: args.source.episodeSlug,
        })
      )
    ),
    response: localizedArtifact.result,
  });
  const localizedMarkdown = renderLocalizedFullStory(
    args.source.episodeNumber,
    compatibilityFull,
    args.language,
    args.source.sourceSha256
  );
  const narrationParagraphs = localizedArtifact.result.full.narrationParagraphs.map((entry) =>
    normalizeWhitespace(entry)
  );
  return {
    identity: {
      episodeId: args.source.episodeId,
      episodeSlug: args.source.episodeSlug,
      language: args.language,
      locale: languageProfile.locale,
      variant: "full",
    },
    title: compatibilityFull.title,
    sourcePath: path.join(args.outputRoot, args.source.episodeSlug, args.language, "full", "script.md"),
    sourceSha256: sha256NormalizedSource(localizedMarkdown),
    parentFullHash: hashNarrationParagraphs(narrationParagraphs),
    storyIrHash: localizedArtifact.lineage.storyIrHash ?? "0".repeat(64),
    contractHash: localizedArtifact.lineage.contractHash ?? "0".repeat(64),
    contractBuildFingerprint: localizedArtifact.lineage.contractBuildFingerprint,
    narrationParagraphs,
    canonical: true,
    provenance: "localized-full-artifact",
  };
}

function buildCompatibilityParent(args: {
  readonly source: ResolvedShortRewriteSource;
  readonly language: StoryLanguage;
}): ShortRewriteResolvedParent {
  const languageProfile = SHORT_REWRITE_SUPPORTED_LANGUAGES[args.language];
  const narrationParagraphs = args.source.narration
    .split(/\n{2,}/u)
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean);
  const hash = hashNarrationParagraphs(narrationParagraphs);
  return {
    identity: {
      episodeId: args.source.episodeId,
      episodeSlug: args.source.episodeSlug,
      language: "en",
      locale: "en-US",
      variant: "full",
    },
    title: args.source.title,
    sourcePath: args.source.sourcePath,
    sourceSha256: args.source.sourceSha256,
    parentFullHash: hash,
    storyIrHash: hash,
    contractHash: hash,
    narrationParagraphs,
    canonical: false,
    provenance: "compatibility-source",
  };
}

async function resolveShortRewriteParent(args: {
  readonly outputRoot: string;
  readonly source: ResolvedShortRewriteSource;
  readonly language: StoryLanguage;
  readonly allowSourceInput: boolean;
}): Promise<ShortRewriteResolvedParent> {
  if (args.language === "en") {
    if (!args.allowSourceInput) {
      return resolveCanonicalEnglishParent(args);
    }
    return buildCompatibilityParent(args);
  }
  if (args.allowSourceInput) {
    return buildCompatibilityParent(args);
  }
  return resolveLocalizedFullParent(args);
}

function analyzeGeneratedPayload(args: {
  readonly parsed: ShortNarrationResponse;
  readonly language: StoryLanguage;
  readonly source: ResolvedShortRewriteSource;
  readonly parentTitle: string;
  readonly parent: ShortRewriteResolvedParent;
  readonly adaptationContract: ShortRewriteAdaptationContract;
}): {
  readonly generation: ShortRewriteGeneration;
  readonly validation: ReturnType<typeof buildValidationSummary>;
  readonly warnings: string[];
  readonly issues: string[];
  readonly issueCodes: readonly GeneratedStoryValidationIssueCode[];
} {
  const narration = normalizeWhitespace(args.parsed.narration);
  const wordCount = countSpokenWords(narration);
  const duration175 = estimateDurationSeconds(wordCount, 175);
  const duration180 = estimateDurationSeconds(wordCount, 180);
  const hookMatchesNarration = matchesFirstSentence(
    firstSentence(narration),
    narration
  );
  const validation = buildValidationSummary({
    wordCount,
    hookMatchesNarration,
    thumbnailText: args.parentTitle.split(" ").slice(0, 4).join(" "),
    narration,
  });
  const warnings = [...validation.warnings];
  if (wordCount >= 145 && wordCount < 150) {
    warnings.push(
      "Narration is below the preferred range but above the hard minimum."
    );
  }
  const validationResult = validateShortNarrationArtifact({
    language: args.language,
    profile: getLanguageProfile(args.language),
    narration,
    parent: {
      ...args.parent,
      validated: true,
    },
    adaptationContract: args.adaptationContract,
    outputConstraints: {
      variant: "short",
      targetWordRange: args.adaptationContract.constraints.targetWordRange,
      targetNarrationWpm: args.adaptationContract.constraints.targetNarrationWpm,
      targetDuration: {
        minSeconds: args.adaptationContract.constraints.targetDurationSeconds.min,
        maxSeconds: args.adaptationContract.constraints.targetDurationSeconds.max,
      },
      hookDeadlineSeconds: args.adaptationContract.constraints.hookDeadlineSeconds,
      fullVideoBridgeRequired: true,
    },
  });
  const issues = [...validationResult.messages];
  const issueCodes = validationResult.issues.map((issue) => issue.code);
  const generation: ShortRewriteGeneration = {
    title: normalizeWhitespace(args.parentTitle),
    hook: firstSentence(narration),
    narration,
    wordCount,
    estimatedDurationSecondsAt175Wpm: duration175,
    estimatedDurationSecondsAt180Wpm: duration180,
    thumbnailText: args.parentTitle.split(" ").slice(0, 4).join(" "),
    fullVideoBridge: "Watch the full episode for the complete story.",
  };
  return { generation, validation, warnings, issues, issueCodes };
}

function buildRequestSchema(): z.ZodTypeAny {
  return shortNarrationResponseSchema;
}

async function requestStructuredShortRewrite(args: {
  readonly client: Pick<OpenAiStoryClient, "responses">;
  readonly model: string;
  readonly repairModel: string | undefined;
  readonly requestLabel: string;
  readonly prompt: { readonly system: string; readonly user: string };
  readonly temperature: number;
  readonly reasoningEffort:
    | "none"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | undefined;
  readonly maxOutputTokens: number;
  readonly repairReasoningEffort:
    | "none"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | undefined;
  readonly repairMaxOutputTokens: number | undefined;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly signal: AbortSignal | undefined;
  readonly debugDirectory: string;
  readonly debugFileBaseName: string;
  readonly preflight?: (args: {
    readonly system: string;
    readonly user: string;
    readonly model: string;
    readonly maxOutputTokens: number;
    readonly reasoningEffort:
      | "none"
      | "minimal"
      | "low"
      | "medium"
      | "high"
      | "xhigh"
      | undefined;
    readonly requestLabel: string;
  }) => Promise<void>;
}): Promise<ShortRewriteApiResult> {
  if (!args.client) {
    throw new OpenAIShortRewriteError(
      "Missing OpenAI client for short rewrite."
    );
  }
  const start = Date.now();
  let lastError: unknown;
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
    text: {
      format: zodTextFormat(buildRequestSchema(), "short_rewrite_result"),
    },
    ...(shouldIncludeTemperatureForModel(args.model)
      ? { temperature: args.temperature }
      : {}),
    max_output_tokens: args.maxOutputTokens,
    ...(args.reasoningEffort
      ? { reasoning: { effort: args.reasoningEffort } }
      : {}),
  };
  await (args.preflight?.({
    system: args.prompt.system,
    user: args.prompt.user,
    model: args.model,
    maxOutputTokens: args.maxOutputTokens,
    reasoningEffort: args.reasoningEffort,
    requestLabel: args.requestLabel,
  }) ?? Promise.resolve());
  for (let attempt = 0; attempt <= args.maxRetries; attempt += 1) {
    if (args.signal?.aborted) {
      throw createAbortError("Short rewrite was aborted.");
    }
    const controller = new AbortController();
    const timeout = setTimeout(
      () =>
        controller.abort(createAbortError("Short rewrite request timed out.")),
      args.timeoutMs
    );
    const abortListener = () =>
      controller.abort(
        args.signal?.reason ?? createAbortError("Short rewrite was aborted.")
      );
    args.signal?.addEventListener("abort", abortListener, { once: true });
    try {
      await persistShortRewriteDebugArtifacts({
        debugDirectory: args.debugDirectory,
        fileBaseName: args.debugFileBaseName,
        requestLabel: args.requestLabel,
        prompt: args.prompt,
        request,
      });
      const structuredResponses = args.client
        .responses as StructuredResponsesClient;
      const response = structuredResponses.parse
        ? await structuredResponses.parse(request, {
            signal: controller.signal,
          })
        : await structuredResponses.create(request, {
            signal: controller.signal,
          });
      const responseRecord = response as unknown as {
        readonly id: string;
        readonly output_parsed?: unknown | null;
        readonly output_text?: string;
        readonly output?: readonly unknown[];
        readonly status?: string;
        readonly incomplete_details?: { readonly reason?: string } | null;
        readonly usage?: {
          readonly input_tokens?: number;
          readonly output_tokens?: number;
          readonly input_tokens_details?: { readonly cached_tokens?: number };
          readonly output_tokens_details?: {
            readonly reasoning_tokens?: number;
          };
          readonly total_tokens?: number;
        };
      };
      if (
        responseRecord.output_parsed === null ||
        responseRecord.output_parsed === undefined
      ) {
        const responseUsage = {
          ...(responseRecord.usage?.input_tokens !== undefined
            ? { inputTokens: responseRecord.usage.input_tokens }
            : {}),
          ...(responseRecord.usage?.input_tokens_details?.cached_tokens !==
          undefined
            ? {
                cachedInputTokens:
                  responseRecord.usage.input_tokens_details.cached_tokens,
              }
            : {}),
          ...(responseRecord.usage?.output_tokens_details?.reasoning_tokens !==
          undefined
            ? {
                reasoningTokens:
                  responseRecord.usage.output_tokens_details.reasoning_tokens,
              }
            : {}),
          ...(responseRecord.usage?.output_tokens !== undefined
            ? { outputTokens: responseRecord.usage.output_tokens }
            : {}),
          ...(responseRecord.usage?.total_tokens !== undefined
            ? { totalTokens: responseRecord.usage.total_tokens }
            : {}),
        };
        const extractedText =
          responseRecord.output_text ??
          extractStructuredResponseText(responseRecord.output);
        const normalizedIncomplete = normalizeIncompleteResponse(responseRecord);
        const incompleteReason = normalizedIncomplete?.reason ?? null;
        if (!extractedText) {
          const responseFinishedAt = Date.now();
          await persistShortRewriteDebugArtifacts({
            debugDirectory: args.debugDirectory,
            fileBaseName: args.debugFileBaseName,
            requestLabel: args.requestLabel,
            prompt: args.prompt,
            request,
            response: {
              requestId: responseRecord.id,
              status: "failed",
              responseId: responseRecord.id,
              ...(responseRecord.output_text !== undefined
                ? { outputText: responseRecord.output_text }
                : {}),
              responseJson: null,
              startedAt: start,
              finishedAt: responseFinishedAt,
              durationMs: responseFinishedAt - start,
              ...(Object.keys(responseUsage).length > 0
                ? { usage: responseUsage }
                : {}),
            },
            error: new OpenAIShortRewriteError(
              incompleteReason === "max_output_tokens"
                ? "OpenAI short rewrite was incomplete because max_output_tokens was exhausted."
                : "OpenAI returned an empty structured response."
            ),
          });
          throw new StoryRetryableRequestError(
            incompleteReason === "max_output_tokens"
              ? "OpenAI short rewrite was incomplete because max_output_tokens was exhausted."
              : "OpenAI returned an empty structured response.",
            buildFailedRequestMetadata({
              model: args.model,
              ...(args.reasoningEffort !== undefined
                ? { reasoningEffort: args.reasoningEffort }
                : {}),
              maxOutputTokens: args.maxOutputTokens,
              attemptNumber: attempt + 1,
              ...(incompleteReason !== null
                ? { incompleteReason }
                : {}),
              usage: normalizedIncomplete?.usage ?? responseUsage,
            })
          );
        }
        try {
          const parsed = JSON.parse(extractedText) as unknown;
          const responseFinishedAt = Date.now();
          const responseUsage = {
            ...(responseRecord.usage?.input_tokens !== undefined
              ? { inputTokens: responseRecord.usage.input_tokens }
              : {}),
            ...(responseRecord.usage?.input_tokens_details?.cached_tokens !==
            undefined
              ? {
                  cachedInputTokens:
                    responseRecord.usage.input_tokens_details.cached_tokens,
                }
              : {}),
            ...(responseRecord.usage?.output_tokens_details
              ?.reasoning_tokens !== undefined
              ? {
                  reasoningTokens:
                    responseRecord.usage.output_tokens_details.reasoning_tokens,
                }
              : {}),
            ...(responseRecord.usage?.output_tokens !== undefined
              ? { outputTokens: responseRecord.usage.output_tokens }
              : {}),
            ...(responseRecord.usage?.total_tokens !== undefined
              ? { totalTokens: responseRecord.usage.total_tokens }
              : {}),
          };
          await persistShortRewriteDebugArtifacts({
            debugDirectory: args.debugDirectory,
            fileBaseName: args.debugFileBaseName,
            requestLabel: args.requestLabel,
            prompt: args.prompt,
            request,
            response: {
              requestId: responseRecord.id,
              status: "completed",
              responseId: responseRecord.id,
              outputText: JSON.stringify(parsed),
              responseJson: parsed,
              startedAt: start,
              finishedAt: responseFinishedAt,
              durationMs: responseFinishedAt - start,
              ...(responseUsage.inputTokens !== undefined
                ? { usage: responseUsage }
                : {}),
            },
          });
          return {
            id: responseRecord.id,
            outputText: JSON.stringify(parsed),
            ...responseUsage,
          };
        } catch {
          await persistShortRewriteDebugArtifacts({
            debugDirectory: args.debugDirectory,
            fileBaseName: args.debugFileBaseName,
            requestLabel: args.requestLabel,
            prompt: args.prompt,
            request,
            error: new OpenAIShortRewriteError(
              "OpenAI returned a non-JSON structured response."
            ),
          });
          throw new OpenAIShortRewriteError(
            "OpenAI returned a non-JSON structured response."
          );
        }
      }
      const outputText =
        responseRecord.output_text ??
        JSON.stringify(responseRecord.output_parsed);
      const responseFinishedAt = Date.now();
      const responseUsage = {
        ...(responseRecord.usage?.input_tokens !== undefined
          ? { inputTokens: responseRecord.usage.input_tokens }
          : {}),
        ...(responseRecord.usage?.input_tokens_details?.cached_tokens !==
        undefined
          ? {
              cachedInputTokens:
                responseRecord.usage.input_tokens_details.cached_tokens,
            }
          : {}),
        ...(responseRecord.usage?.output_tokens_details?.reasoning_tokens !==
        undefined
          ? {
              reasoningTokens:
                responseRecord.usage.output_tokens_details.reasoning_tokens,
            }
          : {}),
        ...(responseRecord.usage?.output_tokens !== undefined
          ? { outputTokens: responseRecord.usage.output_tokens }
          : {}),
        ...(responseRecord.usage?.total_tokens !== undefined
          ? { totalTokens: responseRecord.usage.total_tokens }
          : {}),
      };
      await persistShortRewriteDebugArtifacts({
        debugDirectory: args.debugDirectory,
        fileBaseName: args.debugFileBaseName,
        requestLabel: args.requestLabel,
        prompt: args.prompt,
        request,
        response: {
          requestId: responseRecord.id,
          status: "completed",
          responseId: responseRecord.id,
          outputText,
          responseJson: responseRecord.output_parsed,
          startedAt: start,
          finishedAt: responseFinishedAt,
          durationMs: responseFinishedAt - start,
          ...(responseUsage.inputTokens !== undefined
            ? { usage: responseUsage }
            : {}),
        },
      });
      const apiResult: ShortRewriteApiResult = {
        id: responseRecord.id,
        outputText,
        ...responseUsage,
      };
      return apiResult;
    } catch (error) {
      lastError = error;
      await persistShortRewriteDebugArtifacts({
        debugDirectory: args.debugDirectory,
        fileBaseName: args.debugFileBaseName,
        requestLabel: args.requestLabel,
        prompt: args.prompt,
        request,
        error,
      });
      if (error instanceof StoryRetryableRequestError) {
        throw error;
      }
      if (attempt < args.maxRetries && isTransientOpenAiError(error)) {
        const jitter = 0.75 + Math.random() * 0.5;
        const backoff = Math.min(
          8_000,
          Math.round(500 * 2 ** attempt * jitter)
        );
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

function parseStructuredResult(
  outputText: string
): ShortNarrationResponse {
  const parsedJson = JSON.parse(outputText) as unknown;
  return shortNarrationResponseSchema.parse(parsedJson);
}

function extractStructuredResponseText(
  output: readonly unknown[] | undefined
): string | null {
  if (!output) {
    return null;
  }
  const texts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as {
      readonly type?: unknown;
      readonly content?: readonly unknown[];
    };
    if (record.type !== "message" || !Array.isArray(record.content)) {
      continue;
    }
    for (const content of record.content) {
      if (!content || typeof content !== "object") {
        continue;
      }
      const textRecord = content as {
        readonly type?: unknown;
        readonly text?: unknown;
      };
      if (
        textRecord.type === "output_text" &&
        typeof textRecord.text === "string" &&
        textRecord.text.trim().length > 0
      ) {
        texts.push(textRecord.text);
      }
    }
  }
  const combined = texts.join("").trim();
  return combined.length > 0 ? combined : null;
}

async function generateLanguagePayload(
  args: GenerateLanguageRequest
): Promise<GeneratedPayload> {
  const paths = resolveShortRewriteOutputPaths({
    outputRoot: args.outputRoot,
    episodeSlug: args.source.episodeSlug,
    episodeNumber: args.source.episodeNumber,
    language: args.language,
  });
  const languageDefinition = SHORT_REWRITE_SUPPORTED_LANGUAGES[args.language];
  const debugDirectory = path.join(
    args.outputRoot,
    args.source.episodeSlug,
    "debug"
  );
  const debugFileBaseName = `stories-rewrite-short-${args.language}`;
  const promptContext = {
    episodeNumber: args.source.episodeNumber,
    episodeSlug: args.source.episodeSlug,
    targetLanguage: args.language,
    targetLanguageName: languageDefinition.name,
    targetLocale: languageDefinition.locale,
    sourceStory: args.parent.narrationParagraphs.join("\n\n"),
    narration: args.parent.narrationParagraphs.join("\n\n"),
    title: args.parent.title,
  };
  const parsedSourceStory = {
    language: "en" as const,
    sourceFile: args.parent.sourcePath,
    sourceHash: args.parent.sourceSha256,
    episodeNumber: args.source.episodeNumber,
    slug: args.source.episodeSlug,
    title: args.parent.title,
    audioInstructions: [],
    narrationParagraphs: [...args.parent.narrationParagraphs],
    metadata: {
      episodeNumber: args.source.episodeNumber,
      primaryTitle: args.parent.title,
      audioInstructions: [],
      narration: [...args.parent.narrationParagraphs],
      tags: [],
      hashtags: [],
    },
    content: args.parent.narrationParagraphs.join("\n\n"),
  };
  const promptFacts = extractCanonicalStoryFacts(parsedSourceStory);
  const compiledPrompt = compileShortStoryPrompt({
    language: args.language,
    adaptationMode: "retention-optimized",
    sourceStory: parsedSourceStory,
    canonicalFacts: promptFacts,
    storyIr: adaptCanonicalStoryFactsToStoryIR(promptFacts, parsedSourceStory),
    sourceExtraction: args.sourceExtraction,
    adaptationContract: args.adaptationContract,
  });
  if (compiledPrompt.diagnostics.some((entry) => entry.blocking)) {
    throw new ShortRewriteValidationError(
      compiledPrompt.diagnostics
        .filter((entry) => entry.blocking)
        .map((entry) => entry.message)
        .join("; ")
    );
  }
  const promptFingerprint = buildShortRequestFingerprint({
    compiledPromptFingerprint: compiledPrompt.promptFingerprint,
    compilerVersion: compiledPrompt.compilerVersion,
    responseSchemaName: compiledPrompt.responseSchema.name,
    responseSchemaVersion: compiledPrompt.responseSchema.version,
    responseSchemaFingerprint: compiledPrompt.responseSchema.fingerprint,
    model: args.model,
    reasoningEffort: args.reasoningEffort,
    maxOutputTokens: args.maxOutputTokens,
    language: args.language,
    locale: languageDefinition.locale,
    parentFullHash: args.parent.parentFullHash,
    storyIrHash: args.parent.storyIrHash,
    shortContractHash: args.adaptationContract.contractHash,
  });
  const preflightDirectory = resolveStoryPreflightDirectory(
    resolveEpisodeCacheDirectory(args.outputRoot, args.source.episodeSlug)
  );
  const buildShortPreflight = (preflightArgs: {
    readonly repair: boolean;
    readonly promptFingerprint: string;
  }) => {
    return async (requestArgs: {
      readonly system: string;
      readonly user: string;
      readonly model: string;
      readonly maxOutputTokens: number;
      readonly reasoningEffort:
        | "none"
        | "minimal"
        | "low"
        | "medium"
        | "high"
        | "xhigh"
        | undefined;
      readonly requestLabel: string;
    }): Promise<void> => {
      const expectedOutputTokens = preflightArgs.repair
        ? Math.ceil(requestArgs.maxOutputTokens * 0.35)
        : Math.ceil(SHORT_REWRITE_HARD_WORD_RANGE.max * 1.45) + 450;
      const fingerprint: StoryRequestFingerprintInput = preflightArgs.repair
        ? {
            episodeSlug: args.source.episodeSlug,
            language: args.language,
            locale: SHORT_REWRITE_SUPPORTED_LANGUAGES[args.language].locale,
            variant: "short",
            owner: "narration",
            provider: "openai",
            model: requestArgs.model,
            stage: "short-repair",
            purpose: "repair",
            promptCompilerVersion: compiledPrompt.compilerVersion,
            promptFingerprint: preflightArgs.promptFingerprint,
            responseSchemaName: shortNarrationResponseSchemaDescriptor.name,
            responseSchemaVersion: shortNarrationResponseSchemaDescriptor.version,
            responseSchemaFingerprint:
              shortNarrationResponseSchemaDescriptor.fingerprint,
            reasoningEffort: requestArgs.reasoningEffort,
            maxOutputTokens: requestArgs.maxOutputTokens,
            storyIrHash: args.parent.storyIrHash,
            shortContractHash: args.adaptationContract.contractHash,
            shortContractVersion: args.adaptationContract.contractVersion,
            repairRoute: "validation-repair",
            repairScope: "short-regeneration",
            attemptSemantics: "repair-attempt",
            parent: {
              kind: "canonical-english-full",
              language: "en",
              locale: "en-US",
              variant: "full",
              fingerprint: args.adaptationContract.contractHash,
              sourceHash: args.parent.sourceSha256,
              storyIrHash: args.parent.storyIrHash,
              contractHash: args.parent.contractHash,
            },
            targetWordRange: SHORT_REWRITE_HARD_WORD_RANGE,
            targetDurationSeconds: { min: 55, max: 65 },
          }
        : {
            episodeSlug: args.source.episodeSlug,
            language: args.language,
            locale: SHORT_REWRITE_SUPPORTED_LANGUAGES[args.language].locale,
            variant: "short",
            owner: "narration",
            provider: "openai",
            model: requestArgs.model,
            stage:
              args.language === "en" ? "canonical-short" : "localized-short",
            purpose:
              args.language === "en" ? "initial-generation" : "localization",
            promptCompilerVersion: compiledPrompt.compilerVersion,
            promptFingerprint: preflightArgs.promptFingerprint,
            responseSchemaName: shortNarrationResponseSchemaDescriptor.name,
            responseSchemaVersion: shortNarrationResponseSchemaDescriptor.version,
            responseSchemaFingerprint:
              shortNarrationResponseSchemaDescriptor.fingerprint,
            reasoningEffort: requestArgs.reasoningEffort,
            maxOutputTokens: requestArgs.maxOutputTokens,
            storyIrHash: args.parent.storyIrHash,
            shortContractHash: args.adaptationContract.contractHash,
            shortContractVersion: args.adaptationContract.contractVersion,
            parent: {
              kind: "canonical-english-full",
              language: "en",
              locale: "en-US",
              variant: "full",
              fingerprint: args.adaptationContract.contractHash,
              sourceHash: args.parent.sourceSha256,
              storyIrHash: args.parent.storyIrHash,
              contractHash: args.parent.contractHash,
            },
            targetWordRange: SHORT_REWRITE_HARD_WORD_RANGE,
            targetDurationSeconds: { min: 55, max: 65 },
          };
      const request: StoryPreflightRequest = {
        episodeNumber: args.source.episodeNumber,
        episodeSlug: args.source.episodeSlug,
        operation: preflightArgs.repair ? "repair" : "generate",
        variant: preflightArgs.repair
          ? "short-repair"
          : args.language === "en"
            ? "canonical-english-short"
            : "localized-short",
        language: args.language,
        locale: SHORT_REWRITE_SUPPORTED_LANGUAGES[args.language].locale,
        model: requestArgs.model,
        ...(requestArgs.reasoningEffort
          ? { reasoningEffort: requestArgs.reasoningEffort }
          : {}),
        maxOutputTokens: requestArgs.maxOutputTokens,
        retryCap: preflightArgs.repair ? 1 : args.maxRetries,
        promptVersion: SHORT_REWRITE_PROMPT_VERSION,
        promptFingerprint: preflightArgs.promptFingerprint,
        schemaName: shortNarrationResponseSchemaDescriptor.name,
        schemaVersion: shortNarrationResponseSchemaDescriptor.version,
        schemaFingerprint: shortNarrationResponseSchemaDescriptor.fingerprint,
        sourceHash: args.source.sourceSha256,
        targetWordRange: SHORT_REWRITE_HARD_WORD_RANGE,
        targetDurationSeconds: {
          min: 55,
          max: 65,
        },
        parentArtifact: {
          kind: "canonical-english-full",
          fingerprint: args.adaptationContract.contractHash,
          sourceHash: args.parent.sourceSha256,
          language: "en",
          locale: "en-US",
          variant: "full",
          storyIrHash: args.parent.storyIrHash,
          contractHash: args.parent.contractHash,
          ...(args.parent.contractBuildFingerprint
            ? { contractBuildFingerprint: args.parent.contractBuildFingerprint }
            : {}),
        },
        minimumOutputTokens: expectedOutputTokens,
        components: [
          estimateStoryComponent({
            name: "system-instructions",
            label: "compiled short system instructions",
            text: requestArgs.system,
          }),
          estimateStoryComponent({
            name: preflightArgs.repair
              ? "repair-context"
              : "canonical-source-narration",
            label: preflightArgs.repair
              ? "short repair context"
              : "compiled short user prompt",
            text: requestArgs.user,
          }),
          {
            name: "response-schema-overhead",
            label: shortNarrationResponseSchemaDescriptor.name,
            estimatedTokens: estimateStructuredRequestWrapperTokens({
              schemaName: shortNarrationResponseSchemaDescriptor.name,
              schemaVersion: shortNarrationResponseSchemaDescriptor.version,
              schemaFingerprint: shortNarrationResponseSchemaDescriptor.fingerprint,
            }),
          },
          {
            name: "request-wrapper-overhead",
            label: "OpenAI Responses request wrapper",
            estimatedTokens: estimateStoryTokens(
              "responses-json-wrapper",
              "conservative-fallback"
            ),
          },
          {
            name: "expected-output",
            label: "minimum feasible short output",
            estimatedTokens: expectedOutputTokens,
          },
        ],
        fingerprint,
      };
      const result = await runAndPersistStoryPreflight({
        preflightDirectory,
        request,
      });
      assertStoryPreflightAllowed(result);
    };
  };
  if (args.dryRun) {
    const generation: ShortRewriteGeneration = {
      title: `${args.parent.title} (${languageDefinition.name})`,
      hook: firstSentence(args.parent.narrationParagraphs.join(" ")),
      narration: args.parent.narrationParagraphs.join("\n\n"),
      wordCount: countSpokenWords(args.parent.narrationParagraphs.join(" ")),
      estimatedDurationSecondsAt175Wpm: estimateDurationSeconds(
        countSpokenWords(args.parent.narrationParagraphs.join(" ")),
        175
      ),
      estimatedDurationSecondsAt180Wpm: estimateDurationSeconds(
        countSpokenWords(args.parent.narrationParagraphs.join(" ")),
        180
      ),
      thumbnailText: args.parent.title.split(" ").slice(0, 4).join(" "),
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
        schemaVersion: 2,
        promptVersion: SHORT_REWRITE_PROMPT_VERSION,
        promptFingerprint,
        status: "skipped",
        episodeId: args.source.episodeId,
        episodeSlug: args.source.episodeSlug,
        sourceLanguage: "en",
        targetLanguage: args.language,
        sourcePath: path.relative(
          path.join(args.outputRoot, args.source.episodeSlug),
          args.source.sourcePath
        ),
        sourceSha256: args.source.sourceSha256,
        locale: languageDefinition.locale,
        variant: "short",
        parent: {
          ...args.parent.identity,
          parentFullHash: args.parent.parentFullHash,
          sourceSha256: args.parent.sourceSha256,
        },
        storyIrHash: args.parent.storyIrHash,
        shortContractHash: args.adaptationContract.contractHash,
        shortContractVersion: args.adaptationContract.contractVersion,
        shortContractSchemaVersion: args.adaptationContract.schemaVersion,
        shortSourceExtractionHash: args.sourceExtraction.extractionHash,
        shortSourceExtractionVersion: args.sourceExtraction.version,
        canonical: args.parent.canonical,
        markdownOutputPath: path.relative(
          path.join(args.outputRoot, args.source.episodeSlug),
          paths.markdownPath
        ),
        jsonOutputPath: path.relative(
          path.join(args.outputRoot, args.source.episodeSlug),
          paths.jsonPath
        ),
        generatedAt,
        model: args.model,
        reasoningEffort: args.reasoningEffort,
        maxOutputTokens: args.maxOutputTokens,
        generationDurationMs: 0,
        promptLineage: {
          compilerVersion: compiledPrompt.compilerVersion,
          promptFingerprint,
          responseSchemaName: compiledPrompt.responseSchema.name,
          responseSchemaVersion: compiledPrompt.responseSchema.version,
          responseSchemaFingerprint: compiledPrompt.responseSchema.fingerprint,
        },
        validation,
      })
    );
    const jsonSidecar: ShortRewriteJsonSidecar = {
      schemaVersion: 2,
      episodeId: args.source.episodeId,
      episodeSlug: args.source.episodeSlug,
      sourceLanguage: "en",
      targetLanguage: args.language,
      locale: languageDefinition.locale,
      variant: "short",
      promptVersion: SHORT_REWRITE_PROMPT_VERSION,
      promptFingerprint,
      model: args.model,
      reasoningEffort: args.reasoningEffort,
      maxOutputTokens: args.maxOutputTokens,
      sourcePath: path.relative(
        path.join(args.outputRoot, args.source.episodeSlug),
        args.source.sourcePath
      ),
      sourceSha256: args.source.sourceSha256,
      parent: {
        ...args.parent.identity,
        parentFullHash: args.parent.parentFullHash,
        sourceSha256: args.parent.sourceSha256,
      },
      storyIrHash: args.parent.storyIrHash,
      shortSourceExtraction: args.sourceExtraction,
      shortAdaptationContract: args.adaptationContract,
      promptLineage: {
        compilerVersion: compiledPrompt.compilerVersion,
        promptFingerprint,
        responseSchemaName: compiledPrompt.responseSchema.name,
        responseSchemaVersion: compiledPrompt.responseSchema.version,
        responseSchemaFingerprint: compiledPrompt.responseSchema.fingerprint,
      },
      canonical: args.parent.canonical,
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
  const initialPrompt = {
    system: compiledPrompt.system,
    user: compiledPrompt.user,
  };
  const client = args.client;
  if (!client) {
    throw new OpenAIShortRewriteError(
      "Missing OpenAI client for short rewrite."
    );
  }
  let failedRequest: PersistedFailedRequestMetadata | undefined;
  let initialResponse: ShortRewriteApiResult;
  try {
    initialResponse = await requestStructuredShortRewrite({
      client,
      model: args.model,
      repairModel: args.repairModel,
      prompt: initialPrompt,
      temperature: args.temperature,
      reasoningEffort: args.reasoningEffort,
      maxOutputTokens: args.maxOutputTokens,
      repairReasoningEffort: args.repairReasoningEffort,
      repairMaxOutputTokens: args.repairMaxOutputTokens,
      timeoutMs: args.timeoutMs,
      maxRetries: args.maxRetries,
      signal: args.signal,
      requestLabel: `${languageDefinition.name} short rewrite`,
      debugDirectory,
      debugFileBaseName,
      preflight: buildShortPreflight({
        repair: false,
        promptFingerprint,
      }),
    });
  } catch (error) {
    if (!(error instanceof StoryRetryableRequestError)) {
      throw error;
    }
    failedRequest = error.metadata;
    const purpose = args.language === "en" ? "canonical-short" : "localized-short";
    const retryDecision = decideRetryRoute({
      purpose,
      incompleteReason: error.metadata.incompleteReason ?? null,
      currentOutputCap: args.maxOutputTokens,
      nextOutputCap: args.retryMaxOutputTokens,
    });
    if (retryDecision.action !== "regenerate") {
      throw error;
    }
    initialResponse = await requestStructuredShortRewrite({
      client,
      model: args.model,
      repairModel: args.repairModel,
      prompt: initialPrompt,
      temperature: args.temperature,
      reasoningEffort: args.reasoningEffort,
      maxOutputTokens: args.retryMaxOutputTokens,
      repairReasoningEffort: args.repairReasoningEffort,
      repairMaxOutputTokens: args.repairMaxOutputTokens,
      timeoutMs: args.timeoutMs,
      maxRetries: args.maxRetries,
      signal: args.signal,
      requestLabel: `${languageDefinition.name} short rewrite regenerate`,
      debugDirectory,
      debugFileBaseName,
      preflight: buildShortPreflight({
        repair: false,
        promptFingerprint: `${promptFingerprint}:regenerate`,
      }),
    });
  }
  const initialParsed = parseStructuredResult(initialResponse.outputText);
  const initialAnalysis = analyzeGeneratedPayload({
    parsed: initialParsed,
    language: args.language,
    source: args.source,
    parentTitle: args.parent.title,
    parent: args.parent,
    adaptationContract: args.adaptationContract,
  });
  let requestId = initialResponse.id;
  let usage = buildUsagePayload({
    ...(initialResponse.inputTokens !== undefined
      ? { inputTokens: initialResponse.inputTokens }
      : {}),
    ...(initialResponse.cachedInputTokens !== undefined
      ? { cachedInputTokens: initialResponse.cachedInputTokens }
      : {}),
    ...(initialResponse.reasoningTokens !== undefined
      ? { reasoningTokens: initialResponse.reasoningTokens }
      : {}),
    ...(initialResponse.outputTokens !== undefined
      ? { outputTokens: initialResponse.outputTokens }
      : {}),
    ...(initialResponse.totalTokens !== undefined
      ? { totalTokens: initialResponse.totalTokens }
      : {}),
  });
  let generation = initialAnalysis.generation;
  let validation = initialAnalysis.validation;
  let responsePayload = initialParsed;
  let issues = initialAnalysis.issues;
  let issueCodes = initialAnalysis.issueCodes;
  let warnings = [...initialAnalysis.warnings];
  const repairHistory: Array<{
    readonly stage: "repair" | "regenerate";
    readonly issues: readonly string[];
  }> = [];
  if (failedRequest?.incompleteReason === "max_output_tokens") {
    repairHistory.push({
      stage: "regenerate",
      issues: ["Initial short response exhausted max_output_tokens."],
    });
  }
  if (issues.length > 0) {
    const normalizedIssues = normalizeValidationErrors(issues);
    const retryDecision = decideRetryRoute({
      purpose: args.language === "en" ? "canonical-short" : "localized-short",
      issueCodes,
      issues: normalizedIssues,
      allowTargetedRepair: shouldUseTargetedShortRepair(normalizedIssues),
    });
    if (retryDecision.action === "block") {
      throw new ShortRewriteValidationError(normalizedIssues.join("; "));
    }
    if (retryDecision.action === "repair") {
      const repairPrompt = buildShortRewriteRepairPrompt({
        context: promptContext,
        invalidResult: responsePayload,
        validationErrors: normalizedIssues,
      });
      const repairResponse = await requestStructuredShortRewrite({
        client,
        model: args.repairModel ?? args.model,
        repairModel: args.repairModel,
        prompt: repairPrompt,
        temperature: args.temperature,
        reasoningEffort: args.repairReasoningEffort ?? args.reasoningEffort,
        maxOutputTokens: args.repairMaxOutputTokens ?? args.retryMaxOutputTokens,
        repairReasoningEffort: args.repairReasoningEffort,
        repairMaxOutputTokens: args.repairMaxOutputTokens,
        timeoutMs: args.timeoutMs,
        maxRetries: args.maxRetries,
        signal: args.signal,
        requestLabel: `${languageDefinition.name} short rewrite repair`,
        debugDirectory,
        debugFileBaseName,
        preflight: buildShortPreflight({
          repair: true,
          promptFingerprint: `${promptFingerprint}:repair`,
        }),
      });
      repairHistory.push({ stage: "repair", issues: normalizedIssues });
      requestId = repairResponse.id;
      usage = buildUsagePayload({
        inputTokens: (usage.inputTokens ?? 0) + (repairResponse.inputTokens ?? 0),
        cachedInputTokens:
          (usage.cachedInputTokens ?? 0) +
          (repairResponse.cachedInputTokens ?? 0),
        reasoningTokens:
          (usage.reasoningTokens ?? 0) + (repairResponse.reasoningTokens ?? 0),
        outputTokens:
          (usage.outputTokens ?? 0) + (repairResponse.outputTokens ?? 0),
        totalTokens: (usage.totalTokens ?? 0) + (repairResponse.totalTokens ?? 0),
      });
      responsePayload = parseStructuredResult(repairResponse.outputText);
      const repairedAnalysis = analyzeGeneratedPayload({
        parsed: responsePayload,
        language: args.language,
        source: args.source,
        parentTitle: args.parent.title,
        parent: args.parent,
        adaptationContract: args.adaptationContract,
      });
      generation = repairedAnalysis.generation;
      validation = repairedAnalysis.validation;
      warnings = [...repairedAnalysis.warnings];
      issues = repairedAnalysis.issues;
      issueCodes = repairedAnalysis.issueCodes;
    }
    if (issues.length > 0) {
      const regenerationPrompt = buildShortRewriteRegenerationPrompt({
        context: promptContext,
        validationErrors: normalizeValidationErrors(issues),
      });
      const regenerationResponse = await requestStructuredShortRewrite({
        client,
        model: args.model,
        repairModel: args.repairModel,
        prompt: regenerationPrompt,
        temperature: args.temperature,
        reasoningEffort: args.reasoningEffort,
        maxOutputTokens: args.retryMaxOutputTokens,
        repairReasoningEffort: args.repairReasoningEffort,
        repairMaxOutputTokens: args.repairMaxOutputTokens,
        timeoutMs: args.timeoutMs,
        maxRetries: args.maxRetries,
        signal: args.signal,
        requestLabel: `${languageDefinition.name} short rewrite regenerate`,
        debugDirectory,
        debugFileBaseName,
        preflight: buildShortPreflight({
          repair: false,
          promptFingerprint: `${promptFingerprint}:regenerate`,
        }),
      });
      repairHistory.push({
        stage: "regenerate",
        issues: normalizeValidationErrors(issues),
      });
      requestId = regenerationResponse.id;
      usage = buildUsagePayload({
        inputTokens:
          (usage.inputTokens ?? 0) + (regenerationResponse.inputTokens ?? 0),
        cachedInputTokens:
          (usage.cachedInputTokens ?? 0) +
          (regenerationResponse.cachedInputTokens ?? 0),
        reasoningTokens:
          (usage.reasoningTokens ?? 0) +
          (regenerationResponse.reasoningTokens ?? 0),
        outputTokens:
          (usage.outputTokens ?? 0) + (regenerationResponse.outputTokens ?? 0),
        totalTokens:
          (usage.totalTokens ?? 0) + (regenerationResponse.totalTokens ?? 0),
      });
      responsePayload = parseStructuredResult(regenerationResponse.outputText);
      const regeneratedAnalysis = analyzeGeneratedPayload({
        parsed: responsePayload,
        language: args.language,
        source: args.source,
        parentTitle: args.parent.title,
        parent: args.parent,
        adaptationContract: args.adaptationContract,
      });
      generation = regeneratedAnalysis.generation;
      validation = regeneratedAnalysis.validation;
      warnings = [...regeneratedAnalysis.warnings];
      issues = regeneratedAnalysis.issues;
      issueCodes = regeneratedAnalysis.issueCodes;
    }
    if (issues.length > 0) {
      throw new ShortRewriteValidationError(issues.join("; "));
    }
  }
  if (!isPreferredNarrationLength(generation.wordCount)) {
    warnings.push("Narration is outside the preferred range.");
  }
  const modelPricing = args.modelPricing?.[args.model];
  const cost = estimateTokenCostMicros(modelPricing?.token, {
    ...(usage.inputTokens !== undefined
      ? { inputTokens: usage.inputTokens }
      : {}),
    ...(usage.cachedInputTokens !== undefined
      ? { cachedInputTokens: usage.cachedInputTokens }
      : {}),
    ...(usage.outputTokens !== undefined
      ? { outputTokens: usage.outputTokens }
      : {}),
    audioInputTokens: 0,
    audioOutputTokens: 0,
  });
  const estimatedCostUsd =
    cost.costMicros === null ? null : cost.costMicros / 1_000_000;
  const failedRequestCostMicros =
    failedRequest && args.modelPricing?.[failedRequest.model]
      ? estimateTokenCostMicros(args.modelPricing[failedRequest.model]?.token, {
          ...(failedRequest.usage?.inputTokens !== undefined
            ? { inputTokens: failedRequest.usage.inputTokens }
            : {}),
          ...(failedRequest.usage?.cachedInputTokens !== undefined
            ? { cachedInputTokens: failedRequest.usage.cachedInputTokens }
            : {}),
          ...(failedRequest.usage?.outputTokens !== undefined
            ? { outputTokens: failedRequest.usage.outputTokens }
            : {}),
          audioInputTokens: 0,
          audioOutputTokens: 0,
        }).costMicros
      : null;
  const failedRequestWithCost =
    failedRequest
      ? buildPersistedFailedRequestMetadata({
          ...failedRequest,
          ...(failedRequestCostMicros !== null
            ? { estimatedCostUsd: failedRequestCostMicros / 1_000_000 }
            : failedRequest.estimatedCostUsd !== undefined
              ? { estimatedCostUsd: failedRequest.estimatedCostUsd }
              : {}),
        })
      : failedRequest;
  const generatedAt = new Date().toISOString();
  const jsonSidecar: ShortRewriteJsonSidecar = {
    schemaVersion: 2,
    episodeId: args.source.episodeId,
    episodeSlug: args.source.episodeSlug,
    sourceLanguage: "en",
    targetLanguage: args.language,
    locale: languageDefinition.locale,
    variant: "short",
    promptVersion: SHORT_REWRITE_PROMPT_VERSION,
    promptFingerprint,
    model: args.model,
    reasoningEffort: args.reasoningEffort,
    maxOutputTokens: args.maxOutputTokens,
    sourcePath: path.relative(
      path.join(args.outputRoot, args.source.episodeSlug),
      args.source.sourcePath
    ),
    sourceSha256: args.source.sourceSha256,
    parent: {
      ...args.parent.identity,
      parentFullHash: args.parent.parentFullHash,
      sourceSha256: args.parent.sourceSha256,
    },
    storyIrHash: args.parent.storyIrHash,
    shortSourceExtraction: args.sourceExtraction,
    shortAdaptationContract: args.adaptationContract,
    promptLineage: {
      compilerVersion: compiledPrompt.compilerVersion,
      promptFingerprint,
      responseSchemaName: compiledPrompt.responseSchema.name,
      responseSchemaVersion: compiledPrompt.responseSchema.version,
      responseSchemaFingerprint: compiledPrompt.responseSchema.fingerprint,
    },
    canonical: args.parent.canonical,
    generatedAt,
    generation,
    usage: buildUsagePayload({
      ...(usage.inputTokens !== undefined
        ? { inputTokens: usage.inputTokens }
        : {}),
      ...(usage.cachedInputTokens !== undefined
        ? { cachedInputTokens: usage.cachedInputTokens }
        : {}),
      ...(usage.reasoningTokens !== undefined
        ? { reasoningTokens: usage.reasoningTokens }
        : {}),
      ...(usage.outputTokens !== undefined
        ? { outputTokens: usage.outputTokens }
        : {}),
      ...(usage.totalTokens !== undefined
        ? { totalTokens: usage.totalTokens }
        : {}),
      estimatedCostUsd,
      pricingVersion: cost.pricingVersion,
    }),
    ...(repairHistory.length > 0 ? { repairHistory } : {}),
    validation: {
      ...validation,
      warnings,
    },
  };
  const artifact = shortRewriteArtifactSchema.parse(
    buildArtifactPayload({
      schemaVersion: 2,
      promptVersion: SHORT_REWRITE_PROMPT_VERSION,
      promptFingerprint,
      status: "completed",
      episodeId: args.source.episodeId,
      episodeSlug: args.source.episodeSlug,
      sourceLanguage: "en",
      targetLanguage: args.language,
      sourcePath: path.relative(
        path.join(args.outputRoot, args.source.episodeSlug),
        args.source.sourcePath
      ),
      sourceSha256: args.source.sourceSha256,
      locale: languageDefinition.locale,
      variant: "short",
      parent: {
        ...args.parent.identity,
        parentFullHash: args.parent.parentFullHash,
        sourceSha256: args.parent.sourceSha256,
      },
      storyIrHash: args.parent.storyIrHash,
      shortContractHash: args.adaptationContract.contractHash,
      shortContractVersion: args.adaptationContract.contractVersion,
      shortContractSchemaVersion: args.adaptationContract.schemaVersion,
      shortSourceExtractionHash: args.sourceExtraction.extractionHash,
      shortSourceExtractionVersion: args.sourceExtraction.version,
      canonical: args.parent.canonical,
      markdownOutputPath: path.relative(
        path.join(args.outputRoot, args.source.episodeSlug),
        paths.markdownPath
      ),
      jsonOutputPath: path.relative(
        path.join(args.outputRoot, args.source.episodeSlug),
        paths.jsonPath
      ),
      generatedAt,
      model: args.model,
      reasoningEffort: args.reasoningEffort,
      maxOutputTokens: args.maxOutputTokens,
      requestId,
      generationDurationMs: 0,
      ...(usage.inputTokens !== undefined
        ? { inputTokens: usage.inputTokens }
        : {}),
      ...(usage.cachedInputTokens !== undefined
        ? { cachedInputTokens: usage.cachedInputTokens }
        : {}),
      ...(usage.reasoningTokens !== undefined
        ? { reasoningTokens: usage.reasoningTokens }
        : {}),
      ...(usage.outputTokens !== undefined
        ? { outputTokens: usage.outputTokens }
        : {}),
      ...(usage.totalTokens !== undefined
        ? { totalTokens: usage.totalTokens }
        : {}),
      estimatedCostUsd,
      ...(failedRequestWithCost ? { failedRequest: failedRequestWithCost } : {}),
      promptLineage: {
        compilerVersion: compiledPrompt.compilerVersion,
        promptFingerprint,
        responseSchemaName: compiledPrompt.responseSchema.name,
        responseSchemaVersion: compiledPrompt.responseSchema.version,
        responseSchemaFingerprint: compiledPrompt.responseSchema.fingerprint,
      },
      ...(repairHistory.length > 0 ? { repairHistory } : {}),
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
  readonly parent: ShortRewriteResolvedParent;
  readonly language: StoryLanguage;
  readonly outputRoot: string;
  readonly model: string;
  readonly promptFingerprint: string;
  readonly shortContractHash: string;
  readonly shortSourceExtractionHash: string;
}): Promise<{
  readonly eligible: boolean;
  readonly artifact?: ShortRewriteArtifact;
}> {
  const paths = resolveShortRewriteOutputPaths({
    outputRoot: args.outputRoot,
    episodeSlug: args.source.episodeSlug,
    episodeNumber: args.source.episodeNumber,
    language: args.language,
  });
  if (
    !(await fileExists(paths.jsonPath)) ||
    !(await fileExists(paths.markdownPath))
  ) {
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
    parsed.parent.parentFullHash !== args.parent.parentFullHash ||
    parsed.parent.language !== args.parent.identity.language ||
    parsed.parent.locale !== args.parent.identity.locale ||
    parsed.shortAdaptationContract.contractHash !== args.shortContractHash ||
    parsed.shortSourceExtraction.extractionHash !== args.shortSourceExtractionHash ||
    parsed.promptFingerprint !== args.promptFingerprint ||
    parsed.promptVersion !== SHORT_REWRITE_PROMPT_VERSION ||
    parsed.model !== args.model ||
    parsed.targetLanguage !== args.language ||
    parsed.episodeSlug !== args.source.episodeSlug ||
    parsed.episodeId !== args.source.episodeId
  ) {
    return { eligible: false };
  }
  if (
    !parsed.validation.hardWordRangeSatisfied ||
    !parsed.validation.hookMatchesNarration
  ) {
    return { eligible: false };
  }
  const artifact = shortRewriteArtifactSchema.parse(
    buildArtifactPayload({
      schemaVersion: 2,
      promptVersion: SHORT_REWRITE_PROMPT_VERSION,
      promptFingerprint: args.promptFingerprint,
      status: "completed",
      episodeId: args.source.episodeId,
      episodeSlug: args.source.episodeSlug,
      sourceLanguage: "en",
      targetLanguage: args.language,
      sourcePath: path.relative(
        path.join(args.outputRoot, args.source.episodeSlug),
        args.source.sourcePath
      ),
      sourceSha256: args.source.sourceSha256,
      locale: parsed.locale,
      variant: "short",
      parent: parsed.parent,
      storyIrHash: parsed.storyIrHash,
      shortContractHash: parsed.shortAdaptationContract.contractHash,
      shortContractVersion: parsed.shortAdaptationContract.contractVersion,
      shortContractSchemaVersion:
        parsed.shortAdaptationContract.schemaVersion,
      shortSourceExtractionHash: parsed.shortSourceExtraction.extractionHash,
      shortSourceExtractionVersion: parsed.shortSourceExtraction.version,
      canonical: parsed.canonical,
      markdownOutputPath: path.relative(
        path.join(args.outputRoot, args.source.episodeSlug),
        paths.markdownPath
      ),
      jsonOutputPath: path.relative(
        path.join(args.outputRoot, args.source.episodeSlug),
        paths.jsonPath
      ),
      generatedAt: parsed.generatedAt,
      model: args.model,
      reasoningEffort: parsed.reasoningEffort,
      maxOutputTokens: parsed.maxOutputTokens,
      generationDurationMs: 0,
      promptLineage: parsed.promptLineage,
      repairHistory: parsed.repairHistory,
      validation: parsed.validation,
      ...(parsed.usage.inputTokens !== undefined
        ? { inputTokens: parsed.usage.inputTokens }
        : {}),
      ...(parsed.usage.cachedInputTokens !== undefined
        ? { cachedInputTokens: parsed.usage.cachedInputTokens }
        : {}),
      ...(parsed.usage.reasoningTokens !== undefined
        ? { reasoningTokens: parsed.usage.reasoningTokens }
        : {}),
      ...(parsed.usage.outputTokens !== undefined
        ? { outputTokens: parsed.usage.outputTokens }
        : {}),
      ...(parsed.usage.totalTokens !== undefined
        ? { totalTokens: parsed.usage.totalTokens }
        : {}),
      ...(parsed.usage.estimatedCostUsd !== undefined
        ? { estimatedCostUsd: parsed.usage.estimatedCostUsd }
        : {}),
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
  readonly promptFingerprint: string;
  readonly canonical: boolean;
}): Promise<void> {
  await updateShortRewriteManifestAtomically(args.manifestPath, (current) => {
    const nextArtifacts =
      current?.artifacts.filter(
        (artifact) => artifact.targetLanguage !== args.artifact.targetLanguage
      ) ?? [];
    nextArtifacts.push(args.artifact);
    return shortRewriteManifestSchema.parse({
      schemaVersion: 2,
      promptVersion: SHORT_REWRITE_PROMPT_VERSION,
      promptFingerprint: args.promptFingerprint,
      episodeId: args.source.episodeId,
      episodeSlug: args.source.episodeSlug,
      sourceLanguage: "en",
      sourcePath: path.relative(
        path.join(args.outputRoot, args.source.episodeSlug),
        args.source.sourcePath
      ),
      sourceSha256: args.source.sourceSha256,
      canonical: args.canonical,
      model: args.model,
      generatedAt: current?.generatedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      artifacts: nextArtifacts,
    });
  });
}

export async function rewriteShortStories(
  options: ShortRewriteRunOptions,
  services: Partial<
    ShortRewriteServices & {
      readonly signal?: AbortSignal;
      readonly logger?: Logger;
    }
  > = {}
): Promise<ShortRewriteRunSummary> {
  const runId = randomUUID();
  const logger =
    services.logger ?? createLogger(options.verbose ? "debug" : "info");
  const outputRoot = path.resolve(
    options.outputRoot ?? SHORT_REWRITE_DEFAULT_OUTPUT_ROOT
  );
  const resolvedSource = await resolveShortRewriteInput({
    inputPath: options.inputPath,
    episode: options.episode,
    episodeSlug: options.episodeSlug,
    outputRoot,
    allowSourceInput: options.allowSourceInput ?? false,
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
  let source = {
    ...resolvedSource,
    sourcePath: canonicalSourcePath,
  };
  if (!options.dryRun) {
    await materializeCanonicalSourceStory({
      sourcePath: resolvedSource.sourcePath,
      targetPath: canonicalSourcePath,
      sourceSha256: resolvedSource.sourceSha256,
      sourceRole: options.allowSourceInput
        ? "compatibility-input"
        : "generated-english-full",
      resolvedFrom:
        resolvedSource.resolvedFrom === "manifest"
          ? "batch-manifest"
          : resolvedSource.resolvedFrom,
      artifactSet: "short-story",
      overwrite: options.overwrite ?? options.force ?? false,
    });
    const cleanedContent = await fs.readFile(canonicalSourcePath, "utf8");
    const cleanedParsed = await parseCanonicalSourceStory(canonicalSourcePath);
    source = {
      ...source,
      sourceContent: cleanedContent,
      sourceSha256: sha256NormalizedSource(cleanedContent),
      title: cleanedParsed.title,
      narration: cleanedParsed.narrationParagraphs.join("\n\n"),
      audioInstructions: cleanedParsed.audioInstructions,
      metadataSection: {},
    };
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
  const failures: Array<{
    readonly language: StoryLanguage;
    readonly message: string;
  }> = [];
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
    const canonicalParsed = await parseCanonicalSourceStory(canonicalSourcePath);
    const canonicalFacts = extractCanonicalStoryFacts(canonicalParsed);
    const canonicalStoryIr = adaptCanonicalStoryFactsToStoryIR(
      canonicalFacts,
      canonicalParsed
    );
    const parent = await resolveShortRewriteParent({
      outputRoot,
      source,
      language,
      allowSourceInput: options.allowSourceInput ?? false,
    });
    const outputConstraints = {
      variant: "short" as const,
      targetWordRange: {
        min: SHORT_REWRITE_HARD_WORD_RANGE.min,
        max: SHORT_REWRITE_HARD_WORD_RANGE.max,
      },
      targetNarrationWpm: 178,
      targetDuration: {
        minSeconds: 55,
        maxSeconds: 65,
      },
      hookDeadlineSeconds: 8,
      fullVideoBridgeRequired: true,
    };
    const sourceExtraction = buildShortSourceExtraction({
      parent,
      storyIr: canonicalStoryIr,
      outputConstraints,
    });
    const adaptationContract = buildShortAdaptationContract({
      identity: {
        episodeId: source.episodeId,
        episodeSlug: source.episodeSlug,
        language,
        locale: SHORT_REWRITE_SUPPORTED_LANGUAGES[language].locale,
        variant: "short",
      },
      parent,
      storyIr: canonicalStoryIr,
      extraction: sourceExtraction,
      outputConstraints,
    });
    const compiledPrompt = compileShortStoryPrompt({
      language,
      adaptationMode: "retention-optimized",
      sourceStory: canonicalParsed,
      canonicalFacts,
      storyIr: canonicalStoryIr,
      sourceExtraction,
      adaptationContract,
    });
    const promptFingerprint = buildShortRequestFingerprint({
      compiledPromptFingerprint: compiledPrompt.promptFingerprint,
      compilerVersion: compiledPrompt.compilerVersion,
      responseSchemaName: compiledPrompt.responseSchema.name,
      responseSchemaVersion: compiledPrompt.responseSchema.version,
      responseSchemaFingerprint: compiledPrompt.responseSchema.fingerprint,
      model: options.model,
      reasoningEffort: options.reasoningEffort,
      maxOutputTokens:
        options.maxOutputTokens ?? DEFAULT_SHORT_REWRITE_MAX_OUTPUT_TOKENS,
      language,
      locale: SHORT_REWRITE_SUPPORTED_LANGUAGES[language].locale,
      parentFullHash: parent.parentFullHash,
      storyIrHash: parent.storyIrHash,
      shortContractHash: adaptationContract.contractHash,
    });
    const buildFailedArtifact = (
      message: string,
      generatedAt: string,
      durationMs: number,
      failedRequest?: PersistedFailedRequestMetadata
    ): ShortRewriteArtifact =>
      shortRewriteArtifactSchema.parse(
        buildArtifactPayload({
          schemaVersion: 2,
          promptVersion: SHORT_REWRITE_PROMPT_VERSION,
          promptFingerprint: promptFingerprint || "unavailable",
          status: "failed",
          episodeId: source.episodeId,
          episodeSlug: source.episodeSlug,
          sourceLanguage: "en",
          targetLanguage: language,
          sourcePath: path.relative(episodeRelativeRoot, source.sourcePath),
          sourceSha256: source.sourceSha256,
          locale: SHORT_REWRITE_SUPPORTED_LANGUAGES[language].locale,
          variant: "short",
          parent: {
            ...parent.identity,
            parentFullHash: parent.parentFullHash,
            sourceSha256: parent.sourceSha256,
          },
          storyIrHash: parent.storyIrHash,
          shortContractHash: adaptationContract.contractHash,
          shortContractVersion: adaptationContract.contractVersion,
          shortContractSchemaVersion: adaptationContract.schemaVersion,
          shortSourceExtractionHash: sourceExtraction.extractionHash,
          shortSourceExtractionVersion: sourceExtraction.version,
          canonical: parent.canonical,
          markdownOutputPath: path.relative(
            episodeRelativeRoot,
            paths.markdownPath
          ),
          jsonOutputPath: path.relative(episodeRelativeRoot, paths.jsonPath),
          generatedAt,
          model: options.model,
          reasoningEffort: options.reasoningEffort,
          maxOutputTokens:
            options.maxOutputTokens ?? DEFAULT_SHORT_REWRITE_MAX_OUTPUT_TOKENS,
          generationDurationMs: durationMs,
          ...(failedRequest ? { failedRequest } : {}),
          promptLineage: {
            promptFingerprint,
          },
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
          parent,
          sourceExtraction,
          adaptationContract,
          outputRoot,
          language,
          model: options.model,
          repairModel: options.repairModel,
          temperature: options.temperature ?? SHORT_REWRITE_DEFAULT_TEMPERATURE,
          reasoningEffort: options.reasoningEffort,
          maxOutputTokens:
            options.maxOutputTokens ?? DEFAULT_SHORT_REWRITE_MAX_OUTPUT_TOKENS,
          retryMaxOutputTokens:
            options.retryMaxOutputTokens ??
            DEFAULT_SHORT_REWRITE_RETRY_MAX_OUTPUT_TOKENS,
          repairReasoningEffort: options.repairReasoningEffort,
          repairMaxOutputTokens: options.repairMaxOutputTokens,
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
        parent,
        language,
        outputRoot,
        model: options.model,
        promptFingerprint,
        shortContractHash: adaptationContract.contractHash,
        shortSourceExtractionHash: sourceExtraction.extractionHash,
      });
      if (existing.eligible && existing.artifact && options.resume) {
        const skippedPayload = cloneArtifactPayload(existing.artifact);
        skippedPayload.status = "skipped";
        skippedPayload.generationDurationMs = 0;
        const skippedArtifact =
          shortRewriteArtifactSchema.parse(skippedPayload);
        await mergeManifest({
          manifestPath: paths.manifestPath,
          outputRoot,
          source,
          model: options.model,
          artifact: skippedArtifact,
          promptFingerprint:
            existing.artifact.promptFingerprint ?? "unavailable",
          canonical: parent.canonical,
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
          error: `${SHORT_REWRITE_SUPPORTED_LANGUAGES[language].name} output already exists and is valid. Use --resume to skip it or --overwrite to replace it.`,
        };
      }

      await ensureDir(path.dirname(paths.markdownPath));
      const payload = await generateLanguagePayload({
        source,
        parent,
        sourceExtraction,
        adaptationContract,
        outputRoot,
        language,
        model: options.model,
        repairModel: options.repairModel,
        temperature: options.temperature ?? SHORT_REWRITE_DEFAULT_TEMPERATURE,
        reasoningEffort: options.reasoningEffort,
        maxOutputTokens:
          options.maxOutputTokens ?? DEFAULT_SHORT_REWRITE_MAX_OUTPUT_TOKENS,
        retryMaxOutputTokens:
          options.retryMaxOutputTokens ??
          DEFAULT_SHORT_REWRITE_RETRY_MAX_OUTPUT_TOKENS,
        repairReasoningEffort: options.repairReasoningEffort,
        repairMaxOutputTokens: options.repairMaxOutputTokens,
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
        promptFingerprint: payload.artifact.promptFingerprint ?? "unavailable",
        canonical: parent.canonical,
      });
      return { language, artifact, skipped: false as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedArtifact = buildFailedArtifact(
        message,
        new Date().toISOString(),
        Date.now() - start,
        error instanceof StoryRetryableRequestError ? error.metadata : undefined
      );
      try {
        await mergeManifest({
          manifestPath: paths.manifestPath,
          outputRoot,
          source,
          model: options.model,
          artifact: failedArtifact,
          promptFingerprint: failedArtifact.promptFingerprint ?? "unavailable",
          canonical: parent.canonical,
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
  const concurrency = Math.max(
    1,
    options.maxConcurrency ?? SHORT_REWRITE_DEFAULT_CONCURRENCY
  );
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
    Array.from({ length: Math.min(concurrency, queue.length || 1) }, () =>
      worker()
    )
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
        result.artifact.estimatedCostUsd === null ||
        result.artifact.estimatedCostUsd === undefined
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
    promptFingerprint: artifacts.find((artifact) => artifact.promptFingerprint)
      ?.promptFingerprint,
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
