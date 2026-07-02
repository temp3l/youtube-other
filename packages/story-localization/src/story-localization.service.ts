import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod.js";
import {
  ensureDir,
  fileExists,
  normalizeLocaleCode,
  normalizeWhitespace,
  splitIntoSentences,
} from "@mediaforge/shared";
import { createLogger, type LoggerContext } from "@mediaforge/observability";
import {
  buildCharacterRenameMap,
  type CharacterRenameMap,
} from "./character-rename.service.js";
import { getLanguageProfile, isShortLanguage } from "./language-profiles.js";
import { buildLocalizationPrompt } from "./localization-prompt-builder.js";
import { compileFullStoryPrompt } from "./story-prompt-compiler.js";
import { extractCanonicalStoryFacts } from "./canonical-facts.service.js";
import {
  discoverCanonicalSourceStories,
  resolveDefaultOutputDirectory,
  resolveDefaultSourceDirectory,
} from "./source-story-discovery.js";
import { parseCanonicalSourceStory } from "./source-story-parser.js";
import {
  buildCanonicalEnglishFullArtifact,
  computeCanonicalEnglishFullFingerprint,
  readCanonicalEnglishFullManifest,
  persistCanonicalEnglishFullStory,
  resolveCanonicalEnglishFullPaths,
  resolveCanonicalEnglishFullResume,
} from "./canonical-full-story.persistence.js";
import {
  adaptStoryProductionArtifactsToStoryIR,
} from "./story-artifact-model.js";
import {
  buildFullStoryContract,
  computeFullStoryContractBuildFingerprint,
  computeFullStoryContractContentHash,
  computeStoryIrContentHash,
  FULL_STORY_CONTRACT_VERSION,
} from "./full-story-contract.js";
import {
  generatedFullStoryPackageSchema,
  generatedStoryPackageSchema,
  EnglishFullGeneratedStoryPackageSchema,
  EnglishGeneratedStoryPackageSchema,
  type GeneratedFullStoryPackageShape,
} from "./story-localization.schemas.js";
import {
  adaptNarrationOnlyFullToLegacyRendererPackage,
  fullNarrationResponseSchemaDescriptor,
  normalizeNarrationOnlyBatchResult,
  narrationOnlyFullRewriteResponseSchema,
  type NarrationOnlyFullRewriteResponse,
} from "./story-prompt-response-schemas.js";
import {
  assertStoryPreflightAllowed,
  estimateStoryComponent,
  estimateStoryTokens,
  estimateStructuredRequestWrapperTokens,
  resolveStoryPreflightDirectory,
  runStoryGenerationPreflight,
  runAndPersistStoryPreflight,
  type StoryNarrationVariant,
  type StoryPreflightComponent,
  type StoryPreflightRequest,
} from "./story-generation-preflight.js";
import {
  renderLocalizedFullStory,
  renderLocalizedShort,
} from "./story-markdown-renderer.js";
import {
  buildConfigurationHash,
  buildStoryArtifactCacheKey,
  readCanonicalFactsCache,
  readLocalizationCacheEntry,
  resolveEpisodeCacheDirectory,
  writeCanonicalFactsCache,
  writeLocalizationCacheEntry,
} from "./story-localization-cache.js";
import { estimateStoryLocalizationCost } from "./story-localization.cost-tracker.js";
import { type StoryRequestFingerprintInput } from "./story-request-telemetry.js";
import {
  StoryLocalizationApiError,
  StoryLocalizationConfigurationError,
  StoryLocalizationSchemaError,
  StoryLocalizationValidationError,
} from "./story-localization.errors.js";
import {
  copyFileAtomicIfChanged,
  countWords,
  estimateDurationSeconds,
  shouldIncludeTemperatureForModel,
  writeJsonAtomicIfChanged,
  writeTextAtomicIfChanged,
} from "./story-localization.utils.js";
import {
  languageCodes,
  type CanonicalStoryFacts,
  type GeneratedStoryPackage,
  type LanguageCode,
  type LanguageProfile,
  type ModelPricing,
  type ParsedSourceStory,
  type StoryLocalizationCacheEntry,
  type StoryLocalizationConfig,
  type StoryLocalizationEpisodeResult,
  type StoryLocalizationRunCounts,
  type StoryLocalizationRunResult,
} from "./story-localization.types.js";
import {
  detectForbiddenPhrases,
  detectGenericFiller,
  validateFullNarrationArtifact,
  validateGeneratedStoryPackage,
  validateNarrationOnlyFullRewritePackage,
  validateWrittenMessagesPreserved,
} from "./generated-story-validator.js";
import {
  createOpenAiStoryClient,
  type OpenAiStoryClient,
} from "./story-localization-openai-batch.js";
import { runStoryLocalizationInBatchMode } from "./story-localization-batch-service.js";
import { rewriteShortStories } from "./short-rewrite.service.js";
import { materializeCleanedCanonicalSourceStory } from "./source-cleaning-persistence.js";
import {
  resolveBatchStorageLayout,
  toRepositoryRelativePath,
} from "./story-localization-batch-storage.js";
import {
  analyzeStorySource,
  buildOriginalityReview,
  buildProtectedStoryElements,
  buildRetentionPlan,
  buildStoryBible,
  persistStoryProductionArtifact,
  persistStoryProductionStage,
  resolveEpisodeStoryProductionDirectory,
  type OriginalityReview,
  type RetentionBeat,
  type StoryBible,
  type StoryProductionStage,
  type StorySourceAnalysis,
} from "./story-production.js";
import {
  DEFAULT_SHORT_REWRITE_MAX_OUTPUT_TOKENS,
  DEFAULT_SHORT_REWRITE_RETRY_MAX_OUTPUT_TOKENS,
  SHORT_REWRITE_DEFAULT_MODEL,
  SHORT_REWRITE_DEFAULT_REASONING_EFFORT,
  SHORT_REWRITE_DEFAULT_TEMPERATURE,
} from "./short-rewrite.constants.js";
import { buildCanonicalSourceFileName } from "./short-rewrite.utils.js";
import {
  buildPersistedFailedRequestMetadata,
  decideRetryRoute,
  normalizeIncompleteResponse,
  StoryRetryableRequestError,
  type StoryRetryPurpose,
} from "./story-retry-routing.js";

export interface StoryLocalizationOptions {
  readonly client?: OpenAiStoryClient;
  readonly logger?: ReturnType<typeof createLogger>;
  readonly modelPricing?: Readonly<Record<string, ModelPricing>>;
  readonly preflightConnectivity?: boolean;
  readonly signal?: AbortSignal;
}

interface StructuredOpenAiCallResult {
  readonly request: Record<string, unknown>;
  readonly response: {
    readonly requestModel: string;
    readonly responseId: string;
    readonly status?: string;
    readonly model?: string;
    readonly incompleteReason?: string;
    readonly outputText: string;
    readonly createdAt?: number;
    readonly startedAt: number;
    readonly finishedAt: number;
    readonly durationMs: number;
    readonly usage?: {
      readonly inputTokens?: number;
      readonly outputTokens?: number;
      readonly cachedInputTokens?: number;
    };
  };
  readonly json: unknown;
}

type ResponseCreateRequest = Parameters<
  OpenAiStoryClient["responses"]["create"]
>[0];
type ResponseMessageLike = {
  readonly type?: unknown;
  readonly content?: readonly {
    readonly type?: unknown;
    readonly text?: unknown;
  }[];
};
type StructuredResponsesClient = {
  readonly parse?: (
    request: ResponseCreateRequest,
    options?: { readonly signal?: AbortSignal }
  ) => Promise<{
    readonly id: string;
    readonly output_parsed?: unknown | null;
    readonly output_text?: string;
    readonly output?: readonly unknown[];
    readonly status?: string;
    readonly model?: string;
    readonly created_at?: number;
    readonly usage?: {
      readonly input_tokens?: number;
      readonly output_tokens?: number;
      readonly input_tokens_details?: { readonly cached_tokens?: number };
      readonly output_tokens_details?: { readonly reasoning_tokens?: number };
      readonly total_tokens?: number;
    };
    readonly incomplete_details?: { readonly reason?: string } | null;
  }>;
  readonly create: OpenAiStoryClient["responses"]["create"];
};
type StoryRequestPreflightHook = (args: {
  readonly system: string;
  readonly user: string;
  readonly model: string;
  readonly maxOutputTokens: number;
  readonly reasoningEffort: StoryLocalizationConfig["reasoningEffort"];
  readonly requestLabel: string;
  readonly attempt: number;
  readonly isRepair: boolean;
}) => Promise<void>;

function buildOpenAiStructuredRequest(args: {
  readonly model: string;
  readonly system: string;
  readonly user: string;
  readonly schema: z.ZodTypeAny;
  readonly schemaName: string;
  readonly temperature: number;
  readonly reasoningEffort: StoryLocalizationConfig["reasoningEffort"];
  readonly maxOutputTokens: number;
}): ResponseCreateRequest {
  return {
    model: args.model,
    input: [
      { role: "system", content: [{ type: "input_text", text: args.system }] },
      { role: "user", content: [{ type: "input_text", text: args.user }] },
    ],
    text: { format: zodTextFormat(args.schema, args.schemaName) },
    max_output_tokens: args.maxOutputTokens,
    ...(shouldIncludeTemperatureForModel(args.model)
      ? { temperature: args.temperature }
      : {}),
    ...(args.reasoningEffort !== "none"
      ? {
          reasoning: {
            effort: args.reasoningEffort,
          },
        }
      : {}),
  };
}

export function extractStructuredResponseText(response: {
  readonly output_text?: string;
  readonly output?: readonly unknown[];
}): string | null {
  if (
    typeof response.output_text === "string" &&
    response.output_text.trim().length > 0
  ) {
    return response.output_text;
  }
  const texts: string[] = [];
  for (const item of response.output ?? []) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const message = item as ResponseMessageLike;
    if (message.type !== "message") {
      continue;
    }
    for (const content of message.content ?? []) {
      if (
        content?.type === "output_text" &&
        typeof content.text === "string" &&
        content.text.trim().length > 0
      ) {
        texts.push(content.text);
      }
    }
  }
  const combined = texts.join("").trim();
  return combined.length > 0 ? combined : null;
}

const generatedPackageResponseSchema = generatedStoryPackageSchema;
const generatedFullPackageResponseSchema = generatedFullStoryPackageSchema;
const englishPackageResponseSchema = EnglishGeneratedStoryPackageSchema;
const englishFullPackageResponseSchema = EnglishFullGeneratedStoryPackageSchema;
const shortRewriteRetryInstructions = [
  "Rewrite only the short narration so it fits the target range.",
  "Preserve the exact meaning, proper names, written messages, and plot-critical details.",
  "Preserve every exact written message verbatim; do not translate, paraphrase, or omit it.",
  "Keep the short output to 2-3 paragraphs and 5-7 sentences.",
  "Prefer the lower end of the allowed word range unless the narration requires more words.",
  "Do not add new facts, side explanations, or filler.",
] as const;

function validateConfiguration(config: StoryLocalizationConfig): void {
  if (!Number.isInteger(config.concurrency) || config.concurrency < 1) {
    throw new StoryLocalizationConfigurationError(
      "concurrency must be a positive integer"
    );
  }
  if (config.shortMinSeconds >= config.shortMaxSeconds) {
    throw new StoryLocalizationConfigurationError(
      "shortMinSeconds must be less than shortMaxSeconds"
    );
  }
  if (
    !Number.isInteger(config.pollIntervalSeconds) ||
    config.pollIntervalSeconds < 1
  ) {
    throw new StoryLocalizationConfigurationError(
      "pollIntervalSeconds must be a positive integer"
    );
  }
  if (
    !path.isAbsolute(config.sourceDirectory) ||
    !path.isAbsolute(config.outputDirectory)
  ) {
    throw new StoryLocalizationConfigurationError(
      "Directories must be resolved before use."
    );
  }
  if (
    !Number.isFinite(config.temperature) ||
    config.temperature < 0 ||
    config.temperature > 2
  ) {
    throw new StoryLocalizationConfigurationError(
      "temperature must be between 0 and 2"
    );
  }
  const maxOutputTokens = config.maxOutputTokens ?? 25_000;
  const retryMaxOutputTokens = config.retryMaxOutputTokens ?? maxOutputTokens;
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1) {
    throw new StoryLocalizationConfigurationError(
      "maxOutputTokens must be a positive integer"
    );
  }
  if (
    !Number.isInteger(retryMaxOutputTokens) ||
    retryMaxOutputTokens < maxOutputTokens
  ) {
    throw new StoryLocalizationConfigurationError(
      "retryMaxOutputTokens must be a positive integer at least as large as maxOutputTokens"
    );
  }
}

async function loadOpenAiClient(
  config: StoryLocalizationConfig
): Promise<OpenAiStoryClient> {
  void config;
  return createOpenAiStoryClient();
}

async function preflightOpenAiConnectivity(
  client: OpenAiStoryClient,
  model: string,
  timeoutMs: number
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () =>
      controller.abort(new Error("OpenAI connectivity preflight timed out.")),
    timeoutMs
  );
  try {
    await client.responses.create(
      {
        model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "Connectivity preflight. Reply with ok.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "ok",
              },
            ],
          },
        ],
        max_output_tokens: 16,
        temperature: 0,
      },
      { signal: controller.signal }
    );
  } catch (error) {
    if (controller.signal.aborted) {
      throw new StoryLocalizationApiError(
        `Unable to reach OpenAI before story localization started. OpenAI connectivity preflight timed out after ${Math.round(timeoutMs / 1000)} seconds. Check network access, VPN/proxy/firewall settings, OPENAI_BASE_URL, and API credentials. If you are in a restricted sandbox, rerun with outbound network access enabled.`,
        error
      );
    }
    throw new StoryLocalizationApiError(
      `Unable to reach OpenAI before story localization started. Check network access, VPN/proxy/firewall settings, OPENAI_BASE_URL, and API credentials. If you are in a restricted sandbox, rerun with outbound network access enabled. Original error: ${describeOpenAiStoryLocalizationError(error)}`,
      error
    );
  } finally {
    clearTimeout(timeout);
  }
}

function buildShortPromptConfig(
  language: LanguageCode,
  sourceStory: ParsedSourceStory,
  canonicalFacts: CanonicalStoryFacts,
  adaptationMode: StoryLocalizationConfig["adaptationMode"],
  productionContext?: {
    readonly analysis?: StorySourceAnalysis;
    readonly bible?: StoryBible;
    readonly originalityReview?: OriginalityReview;
    readonly retentionPlan?: ReadonlyArray<RetentionBeat>;
  }
): { readonly system: string; readonly user: string } {
  return buildLocalizationPrompt({
    languageProfile: getLanguageProfile(language),
    adaptationMode,
    sourceStory,
    canonicalFacts,
    target: "short",
    ...(productionContext ? { productionContext } : {}),
  });
}

function buildFullPromptConfig(
  language: LanguageCode,
  sourceStory: ParsedSourceStory,
  canonicalFacts: CanonicalStoryFacts,
  adaptationMode: StoryLocalizationConfig["adaptationMode"],
  characterRenameMap: CharacterRenameMap,
  productionContext?: {
    readonly analysis?: StorySourceAnalysis;
    readonly bible?: StoryBible;
    readonly originalityReview?: OriginalityReview;
    readonly retentionPlan?: ReadonlyArray<RetentionBeat>;
  }
): {
  readonly system: string;
  readonly user: string;
  readonly compilerVersion: string;
  readonly promptFingerprint: string;
  readonly responseSchema: {
    readonly name: string;
    readonly version: string;
    readonly fingerprint: string;
  };
  readonly selectedModules: readonly {
    readonly id: string;
    readonly version: string;
  }[];
} {
  const compiled = compileFullStoryPrompt({
    language,
    adaptationMode,
    sourceStory,
    canonicalFacts,
    characterRenameMap,
    ...(productionContext ? { productionContext } : {}),
  });
  return {
    system: compiled.system,
    user: compiled.user,
    compilerVersion: compiled.compilerVersion,
    promptFingerprint: compiled.promptFingerprint,
    responseSchema: {
      name: compiled.responseSchema.name,
      version: compiled.responseSchema.version,
      fingerprint: compiled.responseSchema.fingerprint,
    },
    selectedModules: [...compiled.selectedModules],
  };
}

function buildProductionContext(
  parsed: ParsedSourceStory,
  facts: CanonicalStoryFacts
): {
  readonly analysis: StorySourceAnalysis;
  readonly bible: StoryBible;
  readonly originalityReview: OriginalityReview;
  readonly retentionPlan: ReadonlyArray<RetentionBeat>;
} {
  const analysis = analyzeStorySource(parsed, facts);
  const bible = buildStoryBible(parsed, facts, analysis);
  return {
    analysis,
    bible,
    originalityReview: buildOriginalityReview(parsed, facts, analysis),
    retentionPlan: buildRetentionPlan(parsed, bible),
  };
}

function deriveFullOutputConstraints(args: {
  readonly profile: LanguageProfile;
  readonly parsed: ParsedSourceStory;
}): {
  readonly variant: "full";
  readonly targetWordRange: {
    readonly min: number;
    readonly max: number;
  };
  readonly targetNarrationWpm: number;
} {
  const sourceWordCount = countWords(args.parsed.narrationParagraphs.join(" "));
  return {
    variant: "full",
    targetWordRange: {
      min: Math.max(1, Math.round(sourceWordCount * 0.92)),
      max: Math.max(1, Math.round(sourceWordCount * 1.08)),
    },
    targetNarrationWpm: args.profile.fullNarrationWpm,
  };
}

function buildFullStoryPreflightRequest(args: {
  readonly parsed: ParsedSourceStory;
  readonly language: LanguageCode;
  readonly variant: StoryNarrationVariant;
  readonly config: StoryLocalizationConfig;
  readonly system: string;
  readonly user: string;
  readonly promptFingerprint: string;
  readonly schemaName: string;
  readonly schemaVersion: string;
  readonly schemaFingerprint: string;
  readonly profile: LanguageProfile;
  readonly includeShort: boolean;
  readonly modelPricing?: ModelPricing;
  readonly model?: string;
  readonly maxOutputTokens: number;
  readonly reasoningEffort: StoryLocalizationConfig["reasoningEffort"];
  readonly repair?: boolean;
  readonly storyIrHash: string;
  readonly fullContractHash: string;
  readonly fullContractVersion: string;
  readonly promptCompilerVersion: string;
  readonly promptModuleFingerprints?: readonly string[] | undefined;
  readonly parentArtifact?: StoryPreflightRequest["parentArtifact"];
  readonly costCeilingUsd?: number;
}): StoryPreflightRequest {
  const parentFingerprint =
    args.parentArtifact
      ? {
          kind: args.parentArtifact.kind,
          language: args.parentArtifact.language ?? "en",
          locale: args.parentArtifact.locale ?? "en-US",
          variant: args.parentArtifact.variant ?? "full",
          ...(args.parentArtifact.fingerprint
            ? { fingerprint: args.parentArtifact.fingerprint }
            : {}),
          ...(args.parentArtifact.sourceHash
            ? { sourceHash: args.parentArtifact.sourceHash }
            : {}),
          ...(args.parentArtifact.storyIrHash
            ? { storyIrHash: args.parentArtifact.storyIrHash }
            : {}),
          ...(args.parentArtifact.contractHash
            ? { contractHash: args.parentArtifact.contractHash }
            : {}),
        }
      : undefined;
  const expectedOutputTokens = estimateExpectedOutputTokens({
    profile: args.profile,
    parsed: args.parsed,
    includeShort: args.includeShort,
  });
  const fingerprint: StoryRequestFingerprintInput =
    args.repair
      ? {
          episodeSlug: args.parsed.slug,
          language: args.language,
          locale: args.profile.locale,
          variant: "full",
          owner: "narration",
          provider: "openai",
          model: args.model ?? args.config.model,
          stage: "full-repair",
          purpose: "repair",
          promptCompilerVersion: args.promptCompilerVersion,
          promptFingerprint: args.promptFingerprint,
          ...(args.promptModuleFingerprints
            ? { promptModuleFingerprints: args.promptModuleFingerprints }
            : {}),
          responseSchemaName: args.schemaName,
          responseSchemaVersion: args.schemaVersion,
          responseSchemaFingerprint: args.schemaFingerprint,
          ...(args.reasoningEffort ? { reasoningEffort: args.reasoningEffort } : {}),
          maxOutputTokens: args.maxOutputTokens,
          storyIrHash: args.storyIrHash,
          fullContractHash: args.fullContractHash,
          fullContractVersion: args.fullContractVersion,
          repairRoute: "validation-repair",
          repairScope: "full-regeneration",
          attemptSemantics: "repair-attempt",
          targetWordRange: {
            min: 1,
            max: Math.max(
              1,
              Math.ceil(countWords(args.parsed.narrationParagraphs.join(" ")) * 1.12)
            ),
          },
          ...(parentFingerprint
            ? {
                parent: parentFingerprint,
              }
            : {}),
        }
      : args.language === "en"
        ? {
            episodeSlug: args.parsed.slug,
            language: args.language,
            locale: args.profile.locale,
            variant: "full",
            owner: "narration",
            provider: "openai",
            model: args.model ?? args.config.model,
            stage: "canonical-full",
            purpose: "initial-generation",
            promptCompilerVersion: args.promptCompilerVersion,
            promptFingerprint: args.promptFingerprint,
            ...(args.promptModuleFingerprints
              ? { promptModuleFingerprints: args.promptModuleFingerprints }
              : {}),
            responseSchemaName: args.schemaName,
            responseSchemaVersion: args.schemaVersion,
            responseSchemaFingerprint: args.schemaFingerprint,
            ...(args.reasoningEffort
              ? { reasoningEffort: args.reasoningEffort }
              : {}),
            maxOutputTokens: args.maxOutputTokens,
            storyIrHash: args.storyIrHash,
            fullContractHash: args.fullContractHash,
            fullContractVersion: args.fullContractVersion,
            targetWordRange: {
              min: 1,
              max: Math.max(
                1,
                Math.ceil(countWords(args.parsed.narrationParagraphs.join(" ")) * 1.12)
              ),
            },
          }
        : {
            episodeSlug: args.parsed.slug,
            language: args.language,
            locale: args.profile.locale,
            variant: "full",
            owner: "narration",
            provider: "openai",
            model: args.model ?? args.config.model,
            stage: "localized-full",
            purpose: "localization",
            promptCompilerVersion: args.promptCompilerVersion,
            promptFingerprint: args.promptFingerprint,
            ...(args.promptModuleFingerprints
              ? { promptModuleFingerprints: args.promptModuleFingerprints }
              : {}),
            responseSchemaName: args.schemaName,
            responseSchemaVersion: args.schemaVersion,
            responseSchemaFingerprint: args.schemaFingerprint,
            ...(args.reasoningEffort
              ? { reasoningEffort: args.reasoningEffort }
              : {}),
            maxOutputTokens: args.maxOutputTokens,
            storyIrHash: args.storyIrHash,
            fullContractHash: args.fullContractHash,
            fullContractVersion: args.fullContractVersion,
            parent: {
              kind: "canonical-english-full",
              language: "en",
              locale: "en-US",
              variant: "full",
              fingerprint: args.parentArtifact?.fingerprint ?? "",
              ...(args.parentArtifact?.sourceHash
                ? { sourceHash: args.parentArtifact.sourceHash }
                : {}),
              ...(args.parentArtifact?.storyIrHash
                ? { storyIrHash: args.parentArtifact.storyIrHash }
                : {}),
              ...(args.parentArtifact?.contractHash
                ? { contractHash: args.parentArtifact.contractHash }
                : {}),
            },
            targetWordRange: {
              min: 1,
              max: Math.max(
                1,
                Math.ceil(countWords(args.parsed.narrationParagraphs.join(" ")) * 1.12)
              ),
            },
          };
  return {
    episodeNumber: args.parsed.episodeNumber,
    episodeSlug: args.parsed.slug,
    operation: args.repair
      ? "repair"
      : args.language === "en"
        ? "generate"
        : "localize",
    variant: args.repair ? "full-repair" : args.variant,
    language: args.language,
    locale: args.profile.locale,
    model: args.model ?? args.config.model,
    reasoningEffort: args.reasoningEffort,
    maxOutputTokens: args.maxOutputTokens,
    retryCap: 0,
    promptVersion: args.config.promptVersion,
    promptFingerprint: args.promptFingerprint,
    schemaName: args.schemaName,
    schemaVersion: args.schemaVersion,
    schemaFingerprint: args.schemaFingerprint,
    sourceHash: args.parsed.sourceHash,
    targetWordRange: {
      min: 1,
      max: Math.max(
        1,
        Math.ceil(countWords(args.parsed.narrationParagraphs.join(" ")) * 1.12)
      ),
    },
    components: buildPromptComponents({
      system: args.system,
      user: args.user,
      schemaName: args.schemaName,
      schemaVersion: args.schemaVersion,
      schemaFingerprint: args.schemaFingerprint,
      expectedOutputTokens,
      repair: Boolean(args.repair),
    }),
    minimumOutputTokens: expectedOutputTokens,
    ...(args.parentArtifact ? { parentArtifact: args.parentArtifact } : {}),
    ...(args.modelPricing ? { modelPricing: args.modelPricing } : {}),
    ...(args.costCeilingUsd !== undefined
      ? { costCeilingUsd: args.costCeilingUsd }
      : {}),
    fingerprint,
  };
}

function buildLocalizedFullParentArtifact(args: {
  readonly sourceHash: string;
  readonly canonicalFingerprint: string;
  readonly storyIrHash: string;
  readonly contractHash: string;
  readonly contractBuildFingerprint: string;
}): {
  readonly kind: "canonical-english-full";
  readonly fingerprint: string;
  readonly sourceHash: string;
  readonly language: "en";
  readonly locale: "en-US";
  readonly variant: "full";
  readonly storyIrHash: string;
  readonly contractHash: string;
  readonly contractBuildFingerprint: string;
} {
  return {
    kind: "canonical-english-full",
    fingerprint: args.canonicalFingerprint,
    sourceHash: args.sourceHash,
    language: "en",
    locale: "en-US",
    variant: "full",
    storyIrHash: args.storyIrHash,
    contractHash: args.contractHash,
    contractBuildFingerprint: args.contractBuildFingerprint,
  };
}

function buildCanonicalEnglishFullPlan(args: {
  readonly parsed: ParsedSourceStory;
  readonly facts: CanonicalStoryFacts;
  readonly config: StoryLocalizationConfig;
  readonly analysis: StorySourceAnalysis;
  readonly bible: StoryBible;
  readonly originalityReview: OriginalityReview;
  readonly retentionPlan: ReadonlyArray<RetentionBeat>;
  readonly profile: LanguageProfile;
}): {
  readonly compiledPrompt: ReturnType<typeof buildFullPromptConfig>;
  readonly storyIr: ReturnType<typeof adaptStoryProductionArtifactsToStoryIR>;
  readonly characterRenameMap: CharacterRenameMap;
  readonly storyIrHash: string;
  readonly contractHash: string;
  readonly contractBuildFingerprint: string;
  readonly outputConstraints: ReturnType<typeof deriveFullOutputConstraints>;
  readonly preflightRequest: StoryPreflightRequest;
  readonly expectedCanonicalFingerprint: string;
} {
  const storyIr = adaptStoryProductionArtifactsToStoryIR({
    parsed: args.parsed,
    facts: args.facts,
    analysis: args.analysis,
    bible: args.bible,
    originalityReview: args.originalityReview,
    retentionPlan: args.retentionPlan,
  });
  const characterRenameMap = buildCharacterRenameMap({
    episodeId: args.parsed.episodeNumber,
    sourceHash: args.parsed.sourceHash,
    canonicalFacts: args.facts,
    storyIr,
  });
  const compiledPrompt = buildFullPromptConfig(
    "en",
    args.parsed,
    args.facts,
    args.config.adaptationMode,
    characterRenameMap,
    {
      analysis: args.analysis,
      bible: args.bible,
      originalityReview: args.originalityReview,
      retentionPlan: args.retentionPlan,
    }
  );
  const storyIrHash = computeStoryIrContentHash(storyIr);
  const outputConstraints = deriveFullOutputConstraints({
    profile: args.profile,
    parsed: args.parsed,
  });
  const contractResult = buildFullStoryContract({
    storyIr,
    artifactIdentity: {
      episodeNumber: args.parsed.episodeNumber,
      episodeSlug: args.parsed.slug,
      language: "en",
      locale: args.profile.locale,
      variant: "full",
    },
    outputConstraints,
    characterRenameMap,
    lineage: {
      kind: "cleaned-source",
      originalSourceHash: args.parsed.sourceHash,
      cleanedSourceHash: args.parsed.sourceHash,
      cleanerVersion: "story-localization-task-07",
      cleaningReportVersion: "story-localization-task-07",
      storyIrHash,
    },
  });
  if (!contractResult.ok) {
    throw new StoryLocalizationConfigurationError(
      "Unable to build canonical English full contract."
    );
  }
  const contractHash = computeFullStoryContractContentHash(
    contractResult.contract
  );
  const contractBuildFingerprint = contractResult.envelope.buildFingerprint;
  const preflightRequest = buildFullStoryPreflightRequest({
    parsed: args.parsed,
    language: "en",
    variant: "canonical-english-full",
    config: args.config,
    system: compiledPrompt.system,
    user: compiledPrompt.user,
    promptFingerprint: compiledPrompt.promptFingerprint,
    schemaName: compiledPrompt.responseSchema.name,
    schemaVersion: compiledPrompt.responseSchema.version,
    schemaFingerprint: compiledPrompt.responseSchema.fingerprint,
    profile: args.profile,
    includeShort: false,
    maxOutputTokens: args.config.maxOutputTokens ?? 25_000,
    reasoningEffort: args.config.reasoningEffort,
    storyIrHash,
    fullContractHash: contractHash,
    fullContractVersion: FULL_STORY_CONTRACT_VERSION,
    promptCompilerVersion: compiledPrompt.compilerVersion,
    promptModuleFingerprints: compiledPrompt.selectedModules.map((entry) =>
      buildConfigurationHash([entry.id, entry.version])
    ),
  });
  return {
    compiledPrompt,
    storyIr,
    characterRenameMap,
    storyIrHash,
    contractHash,
    contractBuildFingerprint,
    outputConstraints,
    preflightRequest,
    expectedCanonicalFingerprint: computeCanonicalEnglishFullFingerprint({
      lineage: {
        sourceHash: args.parsed.sourceHash,
        cleanedSourceHash: args.parsed.sourceHash,
        storyIrHash,
        contractHash,
        contractBuildFingerprint,
        characterRenameMapHash: characterRenameMap.hash,
      },
      prompt: {
        compilerVersion: compiledPrompt.compilerVersion,
        promptVersion: args.config.promptVersion,
        promptFingerprint: compiledPrompt.promptFingerprint,
        selectedModules: [...compiledPrompt.selectedModules],
      },
      model: {
        name: args.config.model,
        reasoningEffort: args.config.reasoningEffort,
        maxOutputTokens: args.config.maxOutputTokens ?? 25_000,
      },
      responseSchema: {
        name: compiledPrompt.responseSchema.name,
        version: compiledPrompt.responseSchema.version,
        fingerprint: compiledPrompt.responseSchema.fingerprint,
      },
      preflightRequestFingerprint: runStoryGenerationPreflight(
        preflightRequest
      ).requestFingerprint,
      status: "completed",
    }),
  };
}

function responseSchemaForLanguage(language: LanguageCode): {
  readonly schema: z.ZodTypeAny;
  readonly name: string;
} {
  const schema =
    language === "en"
      ? englishFullPackageResponseSchema
      : z.object({
          language: z.enum(languageCodes),
          full: generatedStoryPackageSchema.shape.full.unwrap(),
          short: generatedStoryPackageSchema.shape.short,
          preservationChecklist:
            generatedStoryPackageSchema.shape.preservationChecklist,
          diagnostics: generatedStoryPackageSchema.shape.diagnostics,
        });
  return {
    schema,
    name:
      language === "en" ? "english_story_package" : "generated_story_package",
  };
}

function responseSchemaForFullLanguage(language: LanguageCode): {
  readonly schema: z.ZodTypeAny;
  readonly name: string;
} {
  return {
    schema: narrationOnlyFullRewriteResponseSchema,
    name: fullNarrationResponseSchemaDescriptor.name,
  };
}

function describeOpenAiStoryLocalizationError(error: unknown): string {
  const isConnectivityError = (value: unknown): boolean => {
    if (!value) {
      return false;
    }
    if (typeof value === "string") {
      return /connection|connect|timeout|timed out|dns|eai_again|enotfound|econnreset|etimedout|fetch failed|network error|socket hang up/iu.test(
        value
      );
    }
    if (typeof value === "object") {
      const record = value as {
        readonly code?: unknown;
        readonly message?: unknown;
        readonly name?: unknown;
      };
      const code = typeof record.code === "string" ? record.code : "";
      const message = typeof record.message === "string" ? record.message : "";
      const name = typeof record.name === "string" ? record.name : "";
      return (
        /^(ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET)$/u.test(
          code
        ) ||
        /connection|connect|timeout|timed out|dns|fetch failed|network error|socket hang up/iu.test(
          `${name} ${code} ${message}`
        )
      );
    }
    return false;
  };
  if (error && typeof error === "object") {
    const record = error as {
      readonly message?: unknown;
      readonly status?: unknown;
      readonly code?: unknown;
      readonly error?: {
        readonly message?: unknown;
        readonly code?: unknown;
      };
      readonly cause?: unknown;
    };
    const nestedCode =
      typeof record.error?.code === "string" ? record.error.code : undefined;
    const code = typeof record.code === "string" ? record.code : nestedCode;
    const nestedMessage =
      typeof record.error?.message === "string"
        ? record.error.message
        : undefined;
    const message =
      nestedMessage ??
      (typeof record.message === "string"
        ? record.message
        : "OpenAI request failed.");
    const status =
      typeof record.status === "number" ? ` (status ${record.status})` : "";
    const codeSuffix = code ? ` [${code}]` : "";
    if (code === "insufficient_quota") {
      return `${message}${codeSuffix}${status}. Check API billing, project selection, and key scope.`;
    }
    if (
      isConnectivityError(record) ||
      isConnectivityError(record.error) ||
      isConnectivityError(record.cause) ||
      isConnectivityError(record.message)
    ) {
      return `Connection/transport error while calling OpenAI${codeSuffix}${status}: ${message}`;
    }
    return `${message}${codeSuffix}${status}`;
  }
  if (error instanceof Error) {
    if (
      isConnectivityError(error.message) ||
      isConnectivityError(error.cause)
    ) {
      return `Connection/transport error while calling OpenAI: ${error.message}`;
    }
    return error.message;
  }
  return String(error);
}

function isRetryableOpenAiRequestError(error: unknown): boolean {
  const isRetryableCode = (code: string): boolean =>
    [
      "ECONNRESET",
      "ETIMEDOUT",
      "EAI_AGAIN",
      "ENOTFOUND",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_SOCKET",
      "ECONNREFUSED",
      "EPIPE",
    ].includes(code);
  const isRetryableStatus = (status: number): boolean =>
    [408, 409, 425, 429, 500, 502, 503, 504].includes(status);
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as {
    readonly retryable?: unknown;
    readonly status?: unknown;
    readonly code?: unknown;
    readonly message?: unknown;
    readonly name?: unknown;
  };
  if (record.retryable === true) {
    return true;
  }
  if (typeof record.status === "number" && isRetryableStatus(record.status)) {
    return true;
  }
  const code = typeof record.code === "string" ? record.code : undefined;
  if (code && isRetryableCode(code)) {
    return true;
  }
  const text = [
    typeof record.name === "string" ? record.name : "",
    typeof record.code === "string" ? record.code : "",
    typeof record.message === "string" ? record.message : "",
  ].join(" ");
  return /connection|connect|timeout|timed out|dns|fetch failed|network error|socket hang up|temporary failure/iu.test(
    text
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function callOpenAiStructured(
  client: OpenAiStoryClient,
  model: string,
  requestLabel: string,
  system: string,
  user: string,
  schema: z.ZodTypeAny,
  schemaName: string,
  timeoutMs: number,
  temperature: number,
  maxOutputTokens: number,
  reasoningEffort: StoryLocalizationConfig["reasoningEffort"],
  options?: {
    readonly debugDirectory: string;
    readonly debugFileBaseName: string;
  }
): Promise<StructuredOpenAiCallResult> {
  const maxAttempts = 5;
  let lastError: unknown;
  const startedAt = Date.now();
  const request = buildOpenAiStructuredRequest({
    model,
    system,
    user,
    schema,
    schemaName,
    temperature,
    reasoningEffort,
    maxOutputTokens,
  });
  const debugDirectory = options?.debugDirectory;
  const debugFileBaseName = options?.debugFileBaseName;
  const persistDebugRequest = async (): Promise<void> => {
    if (!debugDirectory || !debugFileBaseName) {
      return;
    }
    await ensureDir(debugDirectory);
    await Promise.all([
      writeTextAtomicIfChanged(
        path.join(debugDirectory, `${debugFileBaseName}.prompt.md`),
        `SYSTEM:\n${system}\n\nUSER:\n${user}\n`,
        true
      ),
      writeJsonAtomicIfChanged(
        path.join(debugDirectory, `${debugFileBaseName}.request.json`),
        request,
        true
      ),
    ]);
  };
  const persistDebugFailure = async (error: unknown): Promise<void> => {
    if (!debugDirectory || !debugFileBaseName) {
      return;
    }
    try {
      await ensureDir(debugDirectory);
      const failurePayload = {
        requestLabel,
        model,
        startedAt,
        failedAt: Date.now(),
        status: "failed" as const,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : {
                message: String(error),
              },
      };
      await writeJsonAtomicIfChanged(
        path.join(debugDirectory, `${debugFileBaseName}.error.json`),
        failurePayload,
        true
      );
      await writeJsonAtomicIfChanged(
        path.join(debugDirectory, `${debugFileBaseName}.response.json`),
        failurePayload,
        true
      );
      await writeJsonAtomicIfChanged(
        path.join(debugDirectory, `${debugFileBaseName}.response-text.json`),
        {
          status: "failed",
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                }
              : {
                  message: String(error),
                },
        },
        true
      );
    } catch {
      // Preserve the original OpenAI failure even if debug artifact writes fail.
    }
  };
  await persistDebugRequest();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      break;
    }
    const controller = new AbortController();
    const timeout = setTimeout(
      () =>
        controller.abort(new Error("Story localization request timed out.")),
      remainingMs
    );
    try {
      const structuredResponses = client.responses as StructuredResponsesClient;
      const response = structuredResponses.parse
        ? await structuredResponses.parse(request, {
            signal: controller.signal,
          })
        : await structuredResponses.create(request, {
            signal: controller.signal,
          });
      const responseRecord = response as unknown as {
        readonly status?: string;
        readonly model?: string;
        readonly created_at?: number;
        readonly output?: readonly unknown[];
        readonly output_parsed?: unknown | null;
        readonly incomplete_details?: { readonly reason?: string } | null;
      };
      let parsedOutput = responseRecord.output_parsed;
      if (parsedOutput === null || parsedOutput === undefined) {
        const extractedText = extractStructuredResponseText(responseRecord);
        if (extractedText) {
          try {
            parsedOutput = JSON.parse(extractedText) as unknown;
          } catch {
            parsedOutput = null;
          }
        }
      }
      if (parsedOutput === null || parsedOutput === undefined) {
        const refusalText = responseRecord.output?.find(
          (item) =>
            item &&
            typeof item === "object" &&
            (item as { readonly type?: unknown }).type === "message"
        ) as
          | {
              readonly content?: readonly {
                readonly type?: unknown;
                readonly refusal?: string;
                readonly text?: string;
              }[];
            }
          | undefined;
        const refusal = refusalText?.content?.find(
          (content) =>
            content?.type === "refusal" && typeof content.refusal === "string"
        )?.refusal;
        const normalizedIncomplete = normalizeIncompleteResponse(responseRecord);
        const incompleteReason = normalizedIncomplete?.reason;
        const message =
          incompleteReason === "max_output_tokens"
            ? `${requestLabel} was incomplete because max_output_tokens was exhausted.`
            : incompleteReason
              ? `${requestLabel} was incomplete (${incompleteReason}).`
              : refusal
                ? `${requestLabel} was refused by the model: ${refusal}`
                : `${requestLabel} returned no parsed output.`;
        throw new StoryRetryableRequestError(
          message,
          buildPersistedFailedRequestMetadata({
            model,
            ...(reasoningEffort !== undefined
              ? { reasoningEffort }
              : {}),
            outputCap: maxOutputTokens,
            attemptNumber: attempt,
            ...(incompleteReason !== undefined
              ? { incompleteReason }
              : {}),
            ...((normalizedIncomplete?.usage ?? response.usage)
              ? {
                  usage:
                    normalizedIncomplete?.usage ??
                    {
                      ...(response.usage?.input_tokens !== undefined
                        ? { inputTokens: response.usage.input_tokens }
                        : {}),
                      ...(response.usage?.input_tokens_details?.cached_tokens !==
                      undefined
                        ? {
                            cachedInputTokens:
                              response.usage.input_tokens_details.cached_tokens,
                          }
                        : {}),
                      ...(response.usage?.output_tokens_details
                        ?.reasoning_tokens !== undefined
                        ? {
                            reasoningTokens:
                              response.usage.output_tokens_details.reasoning_tokens,
                          }
                        : {}),
                      ...(response.usage?.output_tokens !== undefined
                        ? { outputTokens: response.usage.output_tokens }
                        : {}),
                      ...(response.usage?.total_tokens !== undefined
                        ? { totalTokens: response.usage.total_tokens }
                        : {}),
                    },
                }
              : {}),
          })
        );
      }
      const outputText =
        extractStructuredResponseText(responseRecord) ??
        JSON.stringify(parsedOutput);
      const finishedAt = Date.now();
      const responsePayload: StructuredOpenAiCallResult["response"] = {
        requestModel: model,
        responseId: response.id,
        outputText,
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        ...(responseRecord.status !== undefined
          ? { status: responseRecord.status }
          : {}),
        ...(responseRecord.model !== undefined
          ? { model: responseRecord.model }
          : {}),
        ...(responseRecord.created_at !== undefined
          ? { createdAt: responseRecord.created_at }
          : {}),
        ...(responseRecord.incomplete_details?.reason !== undefined
          ? { incompleteReason: responseRecord.incomplete_details.reason }
          : {}),
        ...(response.usage
          ? {
              usage: {
                ...(response.usage.input_tokens !== undefined
                  ? { inputTokens: response.usage.input_tokens }
                  : {}),
                ...(response.usage.output_tokens !== undefined
                  ? { outputTokens: response.usage.output_tokens }
                  : {}),
                ...(response.usage.input_tokens_details?.cached_tokens !==
                undefined
                  ? {
                      cachedInputTokens:
                        response.usage.input_tokens_details.cached_tokens,
                    }
                  : {}),
              },
            }
          : {}),
      };
      return {
        request,
        response: responsePayload,
        json: parsedOutput,
      };
    } catch (error) {
      lastError = error;
      if (error instanceof StoryRetryableRequestError) {
        await persistDebugFailure(error);
        throw error;
      }
      if (attempt < maxAttempts && isRetryableOpenAiRequestError(error)) {
        const delayMs = Math.min(
          8_000,
          Math.max(250, 500 * 2 ** (attempt - 1))
        );
        clearTimeout(timeout);
        await sleep(delayMs);
        continue;
      }
      await persistDebugFailure(error);
      throw new StoryLocalizationApiError(
        `${requestLabel} failed via OpenAI model ${model}: ${describeOpenAiStoryLocalizationError(error)}${attempt > 1 ? ` after ${attempt} attempts` : ""}`,
        error
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new StoryLocalizationApiError(
    `${requestLabel} failed via OpenAI model ${model}: ${describeOpenAiStoryLocalizationError(lastError ?? new Error("OpenAI request timed out."))}`,
    lastError
  );
}

async function writeStructuredOpenAiDebugArtifacts(args: {
  readonly debugDirectory: string;
  readonly fileBaseName: string;
  readonly prompt: { readonly system: string; readonly user: string };
  readonly request: Record<string, unknown>;
  readonly response: StructuredOpenAiCallResult["response"];
  readonly responseJson: unknown;
}): Promise<void> {
  await ensureDir(args.debugDirectory);
  await Promise.all([
    writeTextAtomicIfChanged(
      path.join(args.debugDirectory, `${args.fileBaseName}.prompt.md`),
      `SYSTEM:\n${args.prompt.system}\n\nUSER:\n${args.prompt.user}\n`,
      true
    ),
    writeJsonAtomicIfChanged(
      path.join(args.debugDirectory, `${args.fileBaseName}.request.json`),
      args.request,
      true
    ),
    writeJsonAtomicIfChanged(
      path.join(args.debugDirectory, `${args.fileBaseName}.response.json`),
      args.response,
      true
    ),
    writeJsonAtomicIfChanged(
      path.join(args.debugDirectory, `${args.fileBaseName}.response-text.json`),
      args.responseJson,
      true
    ),
  ]);
}

async function generateStructuredStoryPackage<T>(
  client: OpenAiStoryClient,
  model: string,
  repairModel: string | undefined,
  requestLabel: string,
  system: string,
  user: string,
  schema: z.ZodTypeAny,
  schemaName: string,
  timeoutMs: number,
  temperature: number,
  maxOutputTokens: number,
  reasoningEffort: StoryLocalizationConfig["reasoningEffort"],
  repairMaxOutputTokens: number | undefined,
  repairReasoningEffort: StoryLocalizationConfig["reasoningEffort"] | undefined,
  validate: (value: T) => string[],
  options?: {
    readonly purpose?: StoryRetryPurpose;
    readonly regenerationMaxOutputTokens?: number;
    readonly retryLabel?: string;
    readonly canRepair?: (issues: readonly string[]) => boolean;
    readonly shouldRetry?: (issues: readonly string[]) => boolean;
    readonly retryInstructions?: readonly string[];
    readonly fallbackTransform?: (args: {
      readonly value: T;
      readonly issues: readonly string[];
    }) => T | null;
    readonly debug?: {
      readonly debugDirectory: string;
      readonly fileBaseName: string;
    };
    readonly preflight?: StoryRequestPreflightHook;
  }
): Promise<{
  readonly value: T;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly repaired: boolean;
}> {
  const persistDebugArtifacts = async (
    call: StructuredOpenAiCallResult,
    prompt: { readonly system: string; readonly user: string }
  ): Promise<void> => {
    if (!options?.debug) {
      return;
    }
    await writeStructuredOpenAiDebugArtifacts({
      debugDirectory: options.debug.debugDirectory,
      fileBaseName: options.debug.fileBaseName,
      prompt,
      request: call.request,
      response: call.response,
      responseJson: call.json,
    });
  };
  const debugOptions = options?.debug
    ? {
        debugDirectory: options.debug.debugDirectory,
        debugFileBaseName: options.debug.fileBaseName,
      }
    : undefined;
  await (options?.preflight?.({
      system,
      user,
      model,
      maxOutputTokens,
      reasoningEffort,
      requestLabel,
      attempt: 1,
      isRepair: false,
    }) ?? Promise.resolve());
  let initial: StructuredOpenAiCallResult;
  try {
    initial = await callOpenAiStructured(
      client,
      model,
      requestLabel,
      system,
      user,
      schema,
      schemaName,
      timeoutMs,
      temperature,
      maxOutputTokens,
      reasoningEffort,
      debugOptions
    );
  } catch (error) {
    if (!(error instanceof StoryRetryableRequestError) || !options?.purpose) {
      throw error;
    }
    const decision = decideRetryRoute({
      purpose: options.purpose,
      incompleteReason: error.metadata.incompleteReason ?? null,
      currentOutputCap: maxOutputTokens,
      ...(options.regenerationMaxOutputTokens !== undefined
        ? { nextOutputCap: options.regenerationMaxOutputTokens }
        : {}),
    });
    if (decision.action !== "regenerate") {
      throw error;
    }
    await (options?.preflight?.({
      system,
      user,
      model,
      maxOutputTokens: options.regenerationMaxOutputTokens ?? maxOutputTokens,
      reasoningEffort,
      requestLabel: `${requestLabel} regenerate`,
      attempt: 2,
      isRepair: false,
    }) ?? Promise.resolve());
    initial = await callOpenAiStructured(
      client,
      model,
      `${requestLabel} regenerate`,
      system,
      user,
      schema,
      schemaName,
      timeoutMs,
      temperature,
      options.regenerationMaxOutputTokens ?? maxOutputTokens,
      reasoningEffort,
      debugOptions
    );
  }
  let value: T;
  try {
    value = initial.json as T;
  } catch (error) {
    throw new StoryLocalizationSchemaError(
      "Unable to parse OpenAI JSON response.",
      error
    );
  }
  await persistDebugArtifacts(initial, { system, user });
  const initialIssues = validate(value);
  if (initialIssues.length === 0) {
    return {
      value,
      inputTokens: initial.response.usage?.inputTokens ?? 0,
      outputTokens: initial.response.usage?.outputTokens ?? 0,
      repaired: false,
    };
  }
  const canRepair = options?.canRepair?.(initialIssues) ?? true;
  if (!canRepair) {
    throw new StoryLocalizationValidationError(initialIssues.join("; "));
  }
  const repairUser = [
    "The previous JSON result was invalid for the following reasons:",
    ...initialIssues.map((issue) => `- ${issue}`),
    "",
    "Return the complete corrected JSON only.",
    "",
    "Invalid structured result:",
    JSON.stringify(initial.json, null, 2),
    "",
    user,
  ].join("\n");
  await (options?.preflight?.({
    system,
    user: [...(options?.retryInstructions ?? []), "", repairUser].join("\n"),
    model: repairModel ?? model,
    maxOutputTokens: repairMaxOutputTokens ?? maxOutputTokens,
    reasoningEffort: repairReasoningEffort ?? reasoningEffort,
    requestLabel: options?.retryLabel ?? `${requestLabel} repair`,
    attempt: 1,
    isRepair: true,
  }) ?? Promise.resolve());
  const repair = await callOpenAiStructured(
    client,
    repairModel ?? model,
    options?.retryLabel ?? `${requestLabel} repair`,
    system,
    [...(options?.retryInstructions ?? []), "", repairUser].join("\n"),
    schema,
    schemaName,
    timeoutMs,
    temperature,
    repairMaxOutputTokens ?? maxOutputTokens,
    repairReasoningEffort ?? reasoningEffort,
    debugOptions
  );
  try {
    value = repair.json as T;
  } catch (error) {
    throw new StoryLocalizationSchemaError(
      "Unable to parse repaired OpenAI JSON response.",
      error
    );
  }
  await persistDebugArtifacts(repair, { system, user: repairUser });
  const repairedIssues = validate(value);
  if (repairedIssues.length > 0) {
    const shouldRetry = options?.shouldRetry?.(repairedIssues) ?? false;
    if (
      shouldRetry &&
      options?.retryInstructions &&
      options.retryInstructions.length > 0
    ) {
      const secondRepairUser = [
        "The previous JSON result is still invalid for the following reasons:",
        ...repairedIssues.map((issue) => `- ${issue}`),
        "",
        ...options.retryInstructions,
        "",
        "Return the complete corrected JSON only.",
        "",
        "Invalid structured result:",
        JSON.stringify(repair.json, null, 2),
        "",
        user,
      ].join("\n");
      await (options?.preflight?.({
        system,
        user: secondRepairUser,
        model: repairModel ?? model,
        maxOutputTokens: repairMaxOutputTokens ?? maxOutputTokens,
        reasoningEffort: repairReasoningEffort ?? reasoningEffort,
        requestLabel: `${requestLabel} short repair`,
        attempt: 2,
        isRepair: true,
      }) ?? Promise.resolve());
      const secondRepair = await callOpenAiStructured(
        client,
        repairModel ?? model,
        `${requestLabel} short repair`,
        system,
        secondRepairUser,
        schema,
        schemaName,
        timeoutMs,
        temperature,
        repairMaxOutputTokens ?? maxOutputTokens,
        repairReasoningEffort ?? reasoningEffort,
        debugOptions
      );
      try {
        value = secondRepair.json as T;
      } catch (error) {
        throw new StoryLocalizationSchemaError(
          "Unable to parse repaired OpenAI JSON response.",
          error
        );
      }
      await persistDebugArtifacts(secondRepair, {
        system,
        user: secondRepairUser,
      });
      const secondRepairedIssues = validate(value);
      if (secondRepairedIssues.length > 0) {
        const fallbackValue = options?.fallbackTransform?.({
          value,
          issues: secondRepairedIssues,
        });
        if (fallbackValue) {
          const fallbackIssues = validate(fallbackValue);
          if (fallbackIssues.length === 0) {
            return {
              value: fallbackValue,
              inputTokens:
                (initial.response.usage?.inputTokens ?? 0) +
                (repair.response.usage?.inputTokens ?? 0) +
                (secondRepair.response.usage?.inputTokens ?? 0),
              outputTokens:
                (initial.response.usage?.outputTokens ?? 0) +
                (repair.response.usage?.outputTokens ?? 0) +
                (secondRepair.response.usage?.outputTokens ?? 0),
              repaired: true,
            };
          }
          throw new StoryLocalizationValidationError(fallbackIssues.join("; "));
        }
        throw new StoryLocalizationValidationError(
          secondRepairedIssues.join("; ")
        );
      }
      return {
        value,
        inputTokens:
          (initial.response.usage?.inputTokens ?? 0) +
          (repair.response.usage?.inputTokens ?? 0) +
          (secondRepair.response.usage?.inputTokens ?? 0),
        outputTokens:
          (initial.response.usage?.outputTokens ?? 0) +
          (repair.response.usage?.outputTokens ?? 0) +
          (secondRepair.response.usage?.outputTokens ?? 0),
        repaired: true,
      };
    }
    const fallbackValue = options?.fallbackTransform?.({
      value,
      issues: repairedIssues,
    });
    if (fallbackValue) {
      const fallbackIssues = validate(fallbackValue);
      if (fallbackIssues.length === 0) {
        return {
          value: fallbackValue,
          inputTokens:
            (initial.response.usage?.inputTokens ?? 0) +
            (repair.response.usage?.inputTokens ?? 0),
          outputTokens:
            (initial.response.usage?.outputTokens ?? 0) +
            (repair.response.usage?.outputTokens ?? 0),
          repaired: true,
        };
      }
      throw new StoryLocalizationValidationError(fallbackIssues.join("; "));
    }
    throw new StoryLocalizationValidationError(repairedIssues.join("; "));
  }
  return {
    value,
    inputTokens:
      (initial.response.usage?.inputTokens ?? 0) +
      (repair.response.usage?.inputTokens ?? 0),
    outputTokens:
      (initial.response.usage?.outputTokens ?? 0) +
      (repair.response.usage?.outputTokens ?? 0),
    repaired: true,
  };
}

function parseGeneratedPackage(
  json: unknown,
  language: LanguageCode
): GeneratedStoryPackage {
  const parsed = generatedPackageResponseSchema.parse(json);
  if (parsed.language !== language) {
    throw new StoryLocalizationSchemaError(
      `Expected language ${language}, received ${parsed.language}.`
    );
  }
  return parsed as GeneratedStoryPackage;
}

function parseGeneratedFullPackage(
  json: unknown,
  language: LanguageCode
): GeneratedFullStoryPackageShape {
  const parsed = generatedFullPackageResponseSchema.parse(json);
  if (parsed.language !== language) {
    throw new StoryLocalizationSchemaError(
      `Expected language ${language}, received ${parsed.language}.`
    );
  }
  return parsed;
}

function parseLocalizedFullRewritePackage(
  json: unknown,
  language: LanguageCode
): NarrationOnlyFullRewriteResponse {
  const parsed = normalizeNarrationOnlyBatchResult(json).normalized;
  if (parsed.language !== language) {
    throw new StoryLocalizationSchemaError(
      `Expected language ${language}, received ${parsed.language}.`
    );
  }
  return parsed;
}

function parseEnglishPackage(json: unknown): {
  readonly short: GeneratedStoryPackage["short"];
  readonly preservationChecklist: GeneratedStoryPackage["preservationChecklist"];
  readonly diagnostics: {
    readonly fullWordCount: number;
    readonly shortWordCount: number;
    readonly shortEstimatedDurationSeconds: number;
    readonly removedGenericFiller: readonly string[];
    readonly adaptationNotes: readonly string[];
  };
} {
  return englishPackageResponseSchema.parse(json);
}

function hasShortLengthIssue(issues: readonly string[]): boolean {
  return issues.some(
    (issue) =>
      issue.includes("Short word count") ||
      issue.includes("Short duration estimate out of bounds")
  );
}

function filterEnglishFullValidationIssues(
  issues: readonly string[]
): string[] {
  return issues.filter(
    (issue) =>
      !issue.startsWith("short:") &&
      issue !== "Written messages are not preserved." &&
      issue !== "Short narration is empty." &&
      issue !== "Short contains forbidden boilerplate." &&
      issue !== "Short contains editorial commentary." &&
      issue !== "Short contains generic filler."
  );
}

function buildLocalizedShortNarrationFromFull(
  packageValue: GeneratedStoryPackage,
  profile: LanguageProfile
): readonly string[] | null {
  if (!packageValue.full) {
    return null;
  }
  const fullText = packageValue.full.narrationParagraphs.join(" ").trim();
  const sentences = splitIntoSentences(fullText);
  if (sentences.length === 0) {
    return null;
  }
  if (countWords(fullText) < profile.shortWordRange.min) {
    const repeatedFull = `${fullText} ${fullText}`.trim();
    const repeatedWords = countWords(repeatedFull);
    if (
      repeatedWords >= profile.shortWordRange.min &&
      repeatedWords <= profile.shortWordRange.max
    ) {
      return [repeatedFull];
    }
  }
  let bestText: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index <= sentences.length; index += 1) {
    const candidate = sentences.slice(0, index).join(" ").trim();
    const words = countWords(candidate);
    if (
      words >= profile.shortWordRange.min &&
      words <= profile.shortWordRange.max
    ) {
      return [candidate];
    }
    if (words <= profile.shortWordRange.max) {
      const distance = Math.abs(words - profile.shortWordRange.target);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestText = candidate;
      }
    }
  }
  return bestText ? [bestText] : null;
}

function buildLocalizedShortNarrationWithExactMessages(args: {
  readonly baseNarrationParagraphs: readonly string[];
  readonly language: Exclude<LanguageCode, "en">;
  readonly facts: CanonicalStoryFacts;
  readonly profile: LanguageProfile;
}): readonly string[] | null {
  const currentShortText = args.baseNarrationParagraphs.join(" ").trim();
  const missingMessages = validateWrittenMessagesPreserved(
    args.facts,
    currentShortText
  );
  if (missingMessages.length === 0) {
    return null;
  }
  const sentences = splitIntoSentences(currentShortText);
  if (sentences.length === 0) {
    return null;
  }
  const messageParagraph = [
    args.language === "de"
      ? "Die exakten schriftlichen Botschaften lauten:"
      : "The exact written messages are:",
    ...missingMessages.map((message) => `"${message}"`),
    "Keep each message exactly as written.",
  ].join(" ");
  let candidateSentences = [...sentences, messageParagraph];
  let candidateText = candidateSentences.join(" ");
  while (
    countWords(candidateText) > args.profile.shortWordRange.max &&
    candidateSentences.length > 1
  ) {
    candidateSentences = candidateSentences
      .slice(0, -2)
      .concat(messageParagraph);
    candidateText = candidateSentences.join(" ");
  }
  const candidateWordCount = countWords(candidateText);
  if (
    candidateWordCount < args.profile.shortWordRange.min ||
    candidateWordCount > args.profile.shortWordRange.max
  ) {
    return null;
  }
  return [candidateText];
}

export function buildOutputFiles(
  outputDirectory: string,
  slug: string,
  language: LanguageCode
): {
  readonly full: string;
  readonly short: string;
  readonly rootScript: string;
} {
  if (language === "en") {
    const files = resolveCanonicalEnglishFullPaths(outputDirectory, slug);
    return {
      full: files.canonicalMarkdownPath,
      short: path.join(files.episodeDir, "en", "short", "script.md"),
      rootScript: files.rootCompatibilityMarkdownPath,
    };
  }
  return {
    full: path.join(outputDirectory, slug, language, "full", "script.md"),
    short: path.join(outputDirectory, slug, language, "short", "script.md"),
    rootScript: path.join(outputDirectory, slug, "script.md"),
  };
}

function buildFailedOutputFiles(
  outputDirectory: string,
  slug: string,
  language: Exclude<LanguageCode, "en">
): {
  readonly failedDir: string;
  readonly full: string;
  readonly short: string;
  readonly report: string;
  readonly raw: string;
} {
  const layout = resolveBatchStorageLayout(path.join(outputDirectory, slug));
  const episodeFolder = slug;
  const failedDir = path.join(layout.failedDir, episodeFolder, language);
  return {
    failedDir,
    full: path.join(failedDir, `${slug}-${language}-full.failed.md`),
    short: path.join(failedDir, `${slug}-${language}-short.failed.md`),
    report: path.join(failedDir, `${slug}-${language}-report.json`),
    raw: path.join(failedDir, `${slug}-${language}-raw.json`),
  };
}

async function persistFailedLocalizedOutput(args: {
  readonly outputDirectory: string;
  readonly parsed: ParsedSourceStory;
  readonly language: Exclude<LanguageCode, "en">;
  readonly generatedValue: unknown;
  readonly issues: readonly string[];
  readonly failureMessage: string;
}): Promise<readonly string[]> {
  const files = buildFailedOutputFiles(
    args.outputDirectory,
    args.parsed.slug,
    args.language
  );
  await ensureDir(files.failedDir);
  const persistedFiles: string[] = [];
  const report = {
    episodeNumber: args.parsed.episodeNumber,
    slug: args.parsed.slug,
    language: args.language,
    sourceFile: toRepositoryRelativePath(args.parsed.sourceFile),
    generatedAt: new Date().toISOString(),
    failureMessage: args.failureMessage,
    issues: args.issues,
    outputFiles: {
      full: files.full,
      short: files.short,
      report: files.report,
      raw: files.raw,
    },
  };
  await writeJsonAtomicIfChanged(files.report, report, true);
  persistedFiles.push(files.report);
  await writeJsonAtomicIfChanged(
    files.raw,
    args.generatedValue ?? {
      failureMessage: args.failureMessage,
      issues: args.issues,
    },
    true
  );
  persistedFiles.push(files.raw);

  try {
    const packageValue = parseGeneratedPackage(
      args.generatedValue,
      args.language
    );
    if (packageValue.full) {
      const fullMarkdown = renderLocalizedFullStory(
        args.parsed.episodeNumber,
        packageValue.full,
        args.language,
        args.parsed.sourceHash
      );
      await writeTextAtomicIfChanged(files.full, fullMarkdown, true);
      persistedFiles.push(files.full);
    }
    const shortMarkdown = renderLocalizedShort(
      args.parsed.episodeNumber,
      packageValue.short,
      args.language
    );
    await writeTextAtomicIfChanged(files.short, shortMarkdown, true);
    persistedFiles.push(files.short);
  } catch {
    try {
      const packageValue = parseGeneratedFullPackage(
        args.generatedValue,
        args.language
      );
      if (packageValue.full) {
        const fullMarkdown = renderLocalizedFullStory(
          args.parsed.episodeNumber,
          packageValue.full,
          args.language,
          args.parsed.sourceHash
        );
        await writeTextAtomicIfChanged(files.full, fullMarkdown, true);
        persistedFiles.push(files.full);
      }
    } catch {
      // Keep the structured JSON artifact even if the generated package cannot be rendered.
    }
  }

  return persistedFiles;
}

function buildCacheKey(args: {
  readonly episodeSlug: string;
  readonly sourceHash: string;
  readonly language: LanguageCode;
  readonly adaptationMode: StoryLocalizationConfig["adaptationMode"];
  readonly model: string;
  readonly temperature: number;
  readonly reasoningEffort: StoryLocalizationConfig["reasoningEffort"];
  readonly profile: ReturnType<typeof getLanguageProfile>;
  readonly promptVersion: string;
  readonly shortWpm: number;
  readonly shortMinSeconds: number;
  readonly shortMaxSeconds: number;
  readonly compilerVersion?: string;
  readonly promptFingerprint?: string;
  readonly responseSchemaFingerprint?: string;
  readonly parentFingerprint?: string;
}): string {
  return buildStoryArtifactCacheKey({
    episodeSlug: args.episodeSlug,
    sourceHash: args.sourceHash,
    language: args.language,
    locale: args.profile.locale,
    variant: "short",
    owner: "narration",
    adaptationMode: args.adaptationMode,
    model: args.model,
    temperature: args.temperature,
    reasoningEffort: args.reasoningEffort,
    promptVersion: args.promptVersion,
    ...(args.compilerVersion ? { compilerVersion: args.compilerVersion } : {}),
    ...(args.promptFingerprint ? { promptFingerprint: args.promptFingerprint } : {}),
    ...(args.responseSchemaFingerprint
      ? { responseSchemaFingerprint: args.responseSchemaFingerprint }
      : {}),
    ...(args.parentFingerprint ? { parentFingerprint: args.parentFingerprint } : {}),
    targetWordRange: args.profile.shortWordRange,
    targetShortTiming: {
      shortWpm: args.shortWpm,
      shortMinSeconds: args.shortMinSeconds,
      shortMaxSeconds: args.shortMaxSeconds,
    },
  });
}

function buildBatchCompatibleConfigurationHash(args: {
  readonly episodeSlug: string;
  readonly sourceHash: string;
  readonly language: LanguageCode;
  readonly adaptationMode: StoryLocalizationConfig["adaptationMode"];
  readonly model: string;
  readonly temperature: number;
  readonly reasoningEffort: StoryLocalizationConfig["reasoningEffort"];
  readonly promptVersion: string;
  readonly compilerVersion: string;
  readonly promptFingerprint: string;
  readonly responseSchemaName: string;
  readonly responseSchemaVersion: string;
  readonly responseSchemaFingerprint: string;
  readonly shortWpm: number;
  readonly shortMinSeconds: number;
  readonly shortMaxSeconds: number;
  readonly parentFingerprint: string;
}): string {
  return buildStoryArtifactCacheKey({
    episodeSlug: args.episodeSlug,
    sourceHash: args.sourceHash,
    language: args.language,
    locale: getLanguageProfile(args.language).locale,
    variant: "short",
    owner: "narration",
    adaptationMode: args.adaptationMode,
    model: args.model,
    temperature: args.temperature,
    reasoningEffort: args.reasoningEffort,
    promptVersion: args.promptVersion,
    compilerVersion: args.compilerVersion,
    promptFingerprint: args.promptFingerprint,
    responseSchemaName: args.responseSchemaName,
    responseSchemaVersion: args.responseSchemaVersion,
    responseSchemaFingerprint: args.responseSchemaFingerprint,
    parentFingerprint: args.parentFingerprint,
    targetShortTiming: {
      shortWpm: args.shortWpm,
      shortMinSeconds: args.shortMinSeconds,
      shortMaxSeconds: args.shortMaxSeconds,
    },
  });
}

function estimateExpectedOutputTokens(args: {
  readonly profile: LanguageProfile;
  readonly parsed: ParsedSourceStory;
  readonly includeShort: boolean;
}): number {
  const sourceWords = countWords(args.parsed.narrationParagraphs.join(" "));
  const fullWords = Math.max(1, Math.ceil(sourceWords * 1.12));
  const shortWords = args.includeShort ? args.profile.shortWordRange.max : 0;
  return Math.ceil((fullWords + shortWords) * 1.45) + 650;
}

function buildPromptComponents(args: {
  readonly system: string;
  readonly user: string;
  readonly schemaName: string;
  readonly schemaVersion?: string;
  readonly schemaFingerprint?: string;
  readonly expectedOutputTokens: number;
  readonly repair: boolean;
}): readonly StoryPreflightComponent[] {
  return [
    estimateStoryComponent({
      name: "system-instructions",
      label: "compiled system instructions",
      text: args.system,
    }),
    estimateStoryComponent({
      name: args.repair ? "repair-context" : "canonical-source-narration",
      label: args.repair ? "repair prompt and invalid result context" : "compiled user prompt",
      text: args.user,
    }),
    {
      name: "response-schema-overhead",
      label: args.schemaName,
      estimatedTokens: estimateStructuredRequestWrapperTokens({
        schemaName: args.schemaName,
        ...(args.schemaVersion ? { schemaVersion: args.schemaVersion } : {}),
        ...(args.schemaFingerprint
          ? { schemaFingerprint: args.schemaFingerprint }
          : {}),
      }),
    },
    {
      name: "request-wrapper-overhead",
      label: "OpenAI Responses request wrapper",
      estimatedTokens: estimateStoryTokens("responses-json-wrapper", "conservative-fallback"),
    },
    {
      name: "expected-output",
      label: "minimum feasible structured output",
      estimatedTokens: args.expectedOutputTokens,
    },
  ];
}

function buildFullStoryPreflightAdapter(args: {
  readonly cacheDir: string;
  readonly parsed: ParsedSourceStory;
  readonly language: LanguageCode;
  readonly variant: StoryNarrationVariant;
  readonly config: StoryLocalizationConfig;
  readonly promptFingerprint: string;
  readonly schemaName: string;
  readonly schemaVersion: string;
  readonly schemaFingerprint: string;
  readonly profile: LanguageProfile;
  readonly includeShort: boolean;
  readonly modelPricing?: ModelPricing;
  readonly parentArtifact?: StoryPreflightRequest["parentArtifact"];
  readonly storyIrHash: string;
  readonly fullContractHash: string;
  readonly fullContractVersion: string;
  readonly promptCompilerVersion: string;
  readonly promptModuleFingerprints?: readonly string[] | undefined;
  readonly costCeilingUsd?: number;
}): StoryRequestPreflightHook {
  const preflightDirectory = resolveStoryPreflightDirectory(args.cacheDir);
  return async (requestArgs) => {
    const expectedOutputTokens = requestArgs.isRepair
      ? Math.ceil(requestArgs.maxOutputTokens * 0.35)
      : estimateExpectedOutputTokens({
          profile: args.profile,
          parsed: args.parsed,
          includeShort: args.includeShort,
        });
    const request: StoryPreflightRequest = {
      episodeNumber: args.parsed.episodeNumber,
      episodeSlug: args.parsed.slug,
      operation: requestArgs.isRepair
        ? "repair"
        : args.language === "en"
          ? "generate"
          : "localize",
      variant: requestArgs.isRepair
        ? "full-repair"
        : args.variant,
      language: args.language,
      locale: args.profile.locale,
      model: requestArgs.model,
      ...(requestArgs.reasoningEffort
        ? { reasoningEffort: requestArgs.reasoningEffort }
        : {}),
      maxOutputTokens: requestArgs.maxOutputTokens,
      retryCap: requestArgs.isRepair ? 1 : 0,
      promptVersion: args.config.promptVersion,
      promptFingerprint: args.promptFingerprint,
      schemaName: args.schemaName,
      ...(args.schemaVersion ? { schemaVersion: args.schemaVersion } : {}),
      ...(args.schemaFingerprint ? { schemaFingerprint: args.schemaFingerprint } : {}),
      sourceHash: args.parsed.sourceHash,
      targetWordRange: {
        min: 1,
        max: Math.max(
          1,
          Math.ceil(countWords(args.parsed.narrationParagraphs.join(" ")) * 1.12)
        ),
      },
      components: buildPromptComponents({
        system: requestArgs.system,
        user: requestArgs.user,
        schemaName: args.schemaName,
        schemaVersion: args.schemaVersion,
        schemaFingerprint: args.schemaFingerprint,
        expectedOutputTokens,
        repair: requestArgs.isRepair,
      }),
      minimumOutputTokens: expectedOutputTokens,
      ...(args.parentArtifact ? { parentArtifact: args.parentArtifact } : {}),
      ...(args.modelPricing ? { modelPricing: args.modelPricing } : {}),
      ...(args.costCeilingUsd !== undefined
        ? { costCeilingUsd: args.costCeilingUsd }
        : {}),
      fingerprint: buildFullStoryPreflightRequest({
        parsed: args.parsed,
        language: args.language,
        variant: args.variant,
        config: args.config,
        system: requestArgs.system,
        user: requestArgs.user,
        promptFingerprint: args.promptFingerprint,
        schemaName: args.schemaName,
        schemaVersion: args.schemaVersion,
        schemaFingerprint: args.schemaFingerprint,
        profile: args.profile,
        includeShort: args.includeShort,
        ...(args.modelPricing ? { modelPricing: args.modelPricing } : {}),
        model: requestArgs.model,
        maxOutputTokens: requestArgs.maxOutputTokens,
        reasoningEffort:
          requestArgs.reasoningEffort ?? args.config.reasoningEffort,
        repair: requestArgs.isRepair,
        ...(args.parentArtifact ? { parentArtifact: args.parentArtifact } : {}),
        storyIrHash: args.storyIrHash,
        fullContractHash: args.fullContractHash,
        fullContractVersion: args.fullContractVersion,
        promptCompilerVersion: args.promptCompilerVersion,
        promptModuleFingerprints: args.promptModuleFingerprints,
      }).fingerprint,
    };
    const result = await runAndPersistStoryPreflight({
      preflightDirectory,
      request,
    });
    assertStoryPreflightAllowed(result);
  };
}

async function prepareParsedStory(
  sourceFile: string
): Promise<{
  readonly parsed: ParsedSourceStory;
  readonly facts: CanonicalStoryFacts;
}> {
  const parsed = await parseCanonicalSourceStory(sourceFile);
  const facts = extractCanonicalStoryFacts(parsed);
  return { parsed, facts };
}

async function prepareCleanedInputStory(
  sourceFile: string,
  config: StoryLocalizationConfig
): Promise<{
  readonly sourceFile: string;
  readonly parsed: ParsedSourceStory;
  readonly facts: CanonicalStoryFacts;
}> {
  const initial = await parseCanonicalSourceStory(sourceFile);
  const canonicalSourcePath = path.join(
    config.outputDirectory,
    initial.slug,
    "source",
    buildCanonicalSourceFileName({
      episodeNumber: initial.episodeNumber,
      episodeSlug: initial.slug,
    })
  );
  const sourceAlreadyCanonical =
    path.resolve(sourceFile) === path.resolve(canonicalSourcePath);
  await materializeCleanedCanonicalSourceStory({
    sourcePath: sourceFile,
    targetPath: canonicalSourcePath,
    sourceRole: sourceAlreadyCanonical
      ? "canonical-source-copy"
      : "raw-author-source",
    resolvedFrom: sourceAlreadyCanonical
      ? "canonical-path"
      : "canonical-search",
    overwrite: config.force || sourceAlreadyCanonical,
  });
  const prepared = await prepareParsedStory(canonicalSourcePath);
  return {
    sourceFile: canonicalSourcePath,
    ...prepared,
  };
}

async function ensureCacheFacts(
  cacheDir: string,
  sourceHash: string,
  facts: CanonicalStoryFacts
): Promise<void> {
  const cached = await readCanonicalFactsCache(cacheDir, sourceHash);
  if (!cached) {
    await writeCanonicalFactsCache(cacheDir, sourceHash, facts);
  }
}

async function maybeReuseExistingOutput(
  filePath: string,
  expectedContent: string,
  force: boolean
): Promise<"written" | "skipped"> {
  return writeTextAtomicIfChanged(filePath, expectedContent, force);
}

const sourceHashMarkerPattern = /source-sha256:\s*([a-f0-9]{64})/iu;

async function resolveResumableFullStoryOutput(args: {
  readonly cacheDir: string;
  readonly sourceHash: string;
  readonly cacheKey: string;
  readonly outputFile: string;
  readonly expectedSourceFile: string;
  readonly language: LanguageCode;
  readonly model: string;
  readonly promptVersion: string;
  readonly canonicalPaths?: ReturnType<typeof resolveCanonicalEnglishFullPaths>;
  readonly expectedCanonicalFingerprint?: string;
}): Promise<
  | {
      readonly eligible: false;
    }
  | {
      readonly eligible: true;
      readonly cacheEntry?: StoryLocalizationCacheEntry;
      readonly parsed?: ParsedSourceStory;
      readonly facts?: CanonicalStoryFacts;
      readonly canonicalManifest?: Awaited<
        ReturnType<typeof readCanonicalEnglishFullManifest>
      >;
    }
> {
  if (args.language === "en" && args.canonicalPaths && args.expectedCanonicalFingerprint) {
    const resume = await resolveCanonicalEnglishFullResume({
      canonicalPaths: args.canonicalPaths,
      expectedCanonicalFingerprint: args.expectedCanonicalFingerprint,
    });
    if (!resume.eligible) {
      return { eligible: false };
    }
    if (!(await fileExists(args.outputFile))) {
      return { eligible: false };
    }
    const parsed = await parseCanonicalSourceStory(args.outputFile);
    return {
      eligible: true,
      parsed,
      facts: extractCanonicalStoryFacts(parsed),
      canonicalManifest: resume.manifest,
    };
  }
  if (!(await fileExists(args.outputFile))) {
    return { eligible: false };
  }
  const cacheEntry = await readLocalizationCacheEntry(
    args.cacheDir,
    args.sourceHash,
    args.cacheKey
  );
  if (
    !cacheEntry ||
    cacheEntry.language !== args.language ||
    cacheEntry.model !== args.model ||
    cacheEntry.promptVersion !== args.promptVersion ||
    cacheEntry.sourceHash !== args.sourceHash ||
    cacheEntry.sourceFile !== args.expectedSourceFile ||
    cacheEntry.outputFiles.length === 0 ||
    !cacheEntry.outputFiles.includes(args.outputFile)
  ) {
    return { eligible: false };
  }
  const fileChecks = await Promise.all(
    cacheEntry.outputFiles.map((filePath) => fileExists(filePath))
  );
  if (fileChecks.some((exists) => !exists)) {
    return { eligible: false };
  }
  const rendered = await fs.readFile(args.outputFile, "utf8");
  const marker = sourceHashMarkerPattern.exec(rendered);
  if (
    !marker?.[1] ||
    marker[1].toLowerCase() !== args.sourceHash.toLowerCase()
  ) {
    return { eligible: false };
  }
  if (normalizeWhitespace(rendered).length === 0) {
    return { eligible: false };
  }
  if (args.language === "en") {
    const parsed = await parseCanonicalSourceStory(args.outputFile);
    return {
      eligible: true,
      cacheEntry,
      parsed,
      facts: extractCanonicalStoryFacts(parsed),
    };
  }
  return { eligible: true, cacheEntry };
}

export async function localizeStoryEpisode(
  sourceFile: string,
  config: StoryLocalizationConfig,
  options: StoryLocalizationOptions = {}
): Promise<StoryLocalizationEpisodeResult> {
  validateConfiguration(config);
  const logger = options.logger ?? createLogger("info");
  const preparedInput = await prepareCleanedInputStory(sourceFile, config);
  const client = options.client ?? (await loadOpenAiClient(config));
  if (options.preflightConnectivity ?? false) {
    await preflightOpenAiConnectivity(client, config.model, 60_000);
  }
  const { parsed, facts } = preparedInput;
  const cacheDir = resolveEpisodeCacheDirectory(
    config.outputDirectory,
    parsed.slug
  );
  await ensureDir(cacheDir);
  await ensureCacheFacts(cacheDir, parsed.sourceHash, facts);
  const analysis = analyzeStorySource(parsed, facts);
  const bible = buildStoryBible(parsed, facts, analysis);
  const originalityReview = buildOriginalityReview(parsed, facts, analysis);
  const retentionPlan = buildRetentionPlan(parsed, bible);
  const protectedElements = buildProtectedStoryElements(bible);
  await ensureDir(resolveEpisodeStoryProductionDirectory(cacheDir, parsed));
  await persistStoryProductionStage(cacheDir, parsed, "raw-source");
  await persistStoryProductionArtifact(
    cacheDir,
    parsed,
    "source-analysis.json",
    analysis
  );
  await persistStoryProductionStage(cacheDir, parsed, "source-analysis");
  await persistStoryProductionArtifact(
    cacheDir,
    parsed,
    "story-bible.json",
    bible
  );
  await persistStoryProductionStage(cacheDir, parsed, "story-bible");
  await persistStoryProductionArtifact(
    cacheDir,
    parsed,
    "originality-review.json",
    originalityReview
  );
  await persistStoryProductionStage(cacheDir, parsed, "originality-review");
  await persistStoryProductionArtifact(
    cacheDir,
    parsed,
    "retention-plan.json",
    retentionPlan
  );
  await persistStoryProductionArtifact(
    cacheDir,
    parsed,
    "protected-elements.json",
    protectedElements
  );
  await persistStoryProductionStage(cacheDir, parsed, "retention-plan");
  const profileEn = getLanguageProfile("en");
  const outputFiles = buildOutputFiles(
    config.outputDirectory,
    parsed.slug,
    "en"
  );
  const canonicalPaths = resolveCanonicalEnglishFullPaths(
    config.outputDirectory,
    parsed.slug
  );
  const canonicalEnglishPlan = buildCanonicalEnglishFullPlan({
    parsed,
    facts,
    config,
    analysis,
    bible,
    originalityReview,
    retentionPlan,
    profile: profileEn,
  });
  const debugDirectory = config.debugOutputs
    ? path.join(config.outputDirectory, parsed.slug, "debug")
    : undefined;
  const debugPrefix = config.debugPrefix ?? "stories-rewrite-full";
  const generatedFiles: string[] = [];
  const skippedFiles: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let repairAttempts = 0;
  let cacheHit = false;
  const languageFailures: string[] = [];
  let englishFullPackage: NarrationOnlyFullRewriteResponse | undefined;
  let canonicalEnglishStory:
    | {
        readonly parsed: ParsedSourceStory;
        readonly facts: CanonicalStoryFacts;
      }
    | undefined;
  let canonicalEnglishFingerprint: string | undefined;
  const resumeEnabled = config.resume && !config.force;
  const englishFullCacheKey = buildCacheKey({
    episodeSlug: parsed.slug,
    sourceHash: parsed.sourceHash,
    language: "en",
    adaptationMode: config.adaptationMode,
    model: config.model,
    temperature: config.temperature,
    reasoningEffort: config.reasoningEffort,
    profile: profileEn,
    promptVersion: config.promptVersion,
    shortWpm: config.shortWpm,
    shortMinSeconds: config.shortMinSeconds,
    shortMaxSeconds: config.shortMaxSeconds,
    compilerVersion: canonicalEnglishPlan.compiledPrompt.compilerVersion,
    promptFingerprint: canonicalEnglishPlan.compiledPrompt.promptFingerprint,
    responseSchemaFingerprint:
      canonicalEnglishPlan.compiledPrompt.responseSchema.fingerprint,
    parentFingerprint: canonicalEnglishPlan.expectedCanonicalFingerprint,
  });
  const englishResume = resumeEnabled
    ? await resolveResumableFullStoryOutput({
        cacheDir,
        sourceHash: parsed.sourceHash,
        cacheKey: englishFullCacheKey,
        outputFile: outputFiles.full,
        expectedSourceFile: parsed.sourceFile,
        language: "en",
        model: config.model,
        promptVersion: config.promptVersion,
        canonicalPaths,
        expectedCanonicalFingerprint:
          canonicalEnglishPlan.expectedCanonicalFingerprint,
      })
    : { eligible: false as const };
  if (englishResume.eligible) {
    cacheHit = true;
    skippedFiles.push(outputFiles.full, outputFiles.rootScript);
    canonicalEnglishStory = {
      parsed:
        englishResume.parsed ??
        (await parseCanonicalSourceStory(outputFiles.full)),
      facts:
        englishResume.facts ??
        extractCanonicalStoryFacts(
          englishResume.parsed ??
            (await parseCanonicalSourceStory(outputFiles.full))
        ),
    };
    if (!(await fileExists(outputFiles.rootScript))) {
      const canonicalMarkdown = await fs.readFile(outputFiles.full, "utf8");
      const rootWrite = await writeTextAtomicIfChanged(
        outputFiles.rootScript,
        canonicalMarkdown,
        true
      );
      if (rootWrite === "written") {
        generatedFiles.push(outputFiles.rootScript);
        const skippedIndex = skippedFiles.findIndex(
          (file) => file === outputFiles.rootScript
        );
        if (skippedIndex >= 0) {
          skippedFiles.splice(skippedIndex, 1);
        }
      }
    }
    await ensureCacheFacts(
      cacheDir,
      canonicalEnglishStory.parsed.sourceHash,
      canonicalEnglishStory.facts
    );
    canonicalEnglishFingerprint =
      englishResume.canonicalManifest?.canonicalFingerprint ??
      canonicalEnglishPlan.expectedCanonicalFingerprint;
  } else {
    const englishResponseSchema = responseSchemaForFullLanguage("en");
    const englishSchemaVersion = fullNarrationResponseSchemaDescriptor.version;
    const englishSchemaFingerprint =
      fullNarrationResponseSchemaDescriptor.fingerprint;
    try {
      await persistStoryProductionStage(
        cacheDir,
        parsed,
        "localized-long-form-generation"
      );
      const generated = await generateStructuredStoryPackage<
        NarrationOnlyFullRewriteResponse
      >(
        client,
        config.model,
        config.repairModel,
        "English full story localization",
        canonicalEnglishPlan.compiledPrompt.system,
        canonicalEnglishPlan.compiledPrompt.user,
        englishResponseSchema.schema,
        englishResponseSchema.name,
        config.timeoutMs,
        config.temperature,
        config.maxOutputTokens ?? 25_000,
        config.reasoningEffort,
        config.repairMaxOutputTokens,
        config.repairReasoningEffort,
        (value) => {
          try {
            const packageValue = parseLocalizedFullRewritePackage(
              value as unknown,
              "en"
            );
            void validateFullNarrationArtifact({
              language: "en",
              profile: profileEn,
              storyIr: canonicalEnglishPlan.storyIr,
              outputConstraints: canonicalEnglishPlan.outputConstraints,
              narrationParagraphs: packageValue.full.narrationParagraphs,
              characterRenameMap: canonicalEnglishPlan.characterRenameMap,
              preservationChecklist: {
                primaryRevealPreserved:
                  packageValue.preservationChecklist.primaryRevealPreserved,
                endingPreserved:
                  packageValue.preservationChecklist.endingPreserved,
              },
            });
            return validateNarrationOnlyFullRewritePackage(
              packageValue,
              facts,
              profileEn,
              "en"
            );
          } catch (error) {
            return [error instanceof Error ? error.message : String(error)];
          }
        },
        debugDirectory
          ? {
              purpose: "canonical-full" as const,
              ...(config.retryMaxOutputTokens !== undefined
                ? {
                    regenerationMaxOutputTokens: config.retryMaxOutputTokens,
                  }
                : {}),
              canRepair: () => false,
              debug: {
                debugDirectory,
                fileBaseName: `${debugPrefix}-en`,
              },
              preflight: buildFullStoryPreflightAdapter({
                cacheDir,
                parsed,
                language: "en",
                variant: "canonical-english-full",
                config,
                promptFingerprint:
                  canonicalEnglishPlan.compiledPrompt.promptFingerprint,
                schemaName: englishResponseSchema.name,
                schemaVersion: englishSchemaVersion,
                schemaFingerprint: englishSchemaFingerprint,
                profile: profileEn,
                includeShort: false,
                storyIrHash: canonicalEnglishPlan.storyIrHash,
                fullContractHash: canonicalEnglishPlan.contractHash,
                fullContractVersion: FULL_STORY_CONTRACT_VERSION,
                promptCompilerVersion:
                  canonicalEnglishPlan.compiledPrompt.compilerVersion,
                promptModuleFingerprints:
                  canonicalEnglishPlan.compiledPrompt.selectedModules.map(
                    (entry) => buildConfigurationHash([entry.id, entry.version])
                  ),
                ...(options.modelPricing?.[config.model]
                  ? { modelPricing: options.modelPricing[config.model] }
                  : {}),
              }),
            }
          : {
              purpose: "canonical-full" as const,
              ...(config.retryMaxOutputTokens !== undefined
                ? {
                    regenerationMaxOutputTokens: config.retryMaxOutputTokens,
                  }
                : {}),
              canRepair: () => false,
              preflight: buildFullStoryPreflightAdapter({
                cacheDir,
                parsed,
                language: "en",
                variant: "canonical-english-full",
                config,
                promptFingerprint:
                  canonicalEnglishPlan.compiledPrompt.promptFingerprint,
                schemaName: englishResponseSchema.name,
                schemaVersion: englishSchemaVersion,
                schemaFingerprint: englishSchemaFingerprint,
                profile: profileEn,
                includeShort: false,
                storyIrHash: canonicalEnglishPlan.storyIrHash,
                fullContractHash: canonicalEnglishPlan.contractHash,
                fullContractVersion: FULL_STORY_CONTRACT_VERSION,
                promptCompilerVersion:
                  canonicalEnglishPlan.compiledPrompt.compilerVersion,
                promptModuleFingerprints:
                  canonicalEnglishPlan.compiledPrompt.selectedModules.map(
                    (entry) => buildConfigurationHash([entry.id, entry.version])
                  ),
                ...(options.modelPricing?.[config.model]
                  ? { modelPricing: options.modelPricing[config.model] }
                  : {}),
              }),
            }
      );
      repairAttempts += generated.repaired ? 1 : 0;
      inputTokens += generated.inputTokens;
      outputTokens += generated.outputTokens;
      englishFullPackage = parseLocalizedFullRewritePackage(
        generated.value,
        "en"
      );
      const englishFullArtifact = buildCanonicalEnglishFullArtifact({
        sourceStory: parsed,
        sourceHash: parsed.sourceHash,
        cleanedSourceHash: parsed.sourceHash,
        storyIrHash: canonicalEnglishPlan.storyIrHash,
        contractHash: canonicalEnglishPlan.contractHash,
        contractBuildFingerprint:
          canonicalEnglishPlan.contractBuildFingerprint,
        characterRenameMap: canonicalEnglishPlan.characterRenameMap,
        prompt: {
          compilerVersion: canonicalEnglishPlan.compiledPrompt.compilerVersion,
          promptVersion: config.promptVersion,
          promptFingerprint:
            canonicalEnglishPlan.compiledPrompt.promptFingerprint,
          selectedModules: [...canonicalEnglishPlan.compiledPrompt.selectedModules],
        },
        model: {
          name: config.model,
          reasoningEffort: config.reasoningEffort,
          maxOutputTokens: config.maxOutputTokens ?? 25_000,
        },
        responseSchema: {
          name: englishResponseSchema.name,
          version: englishSchemaVersion,
          fingerprint: englishSchemaFingerprint,
        },
        preflight: runStoryGenerationPreflight(
          canonicalEnglishPlan.preflightRequest
        ),
        response: englishFullPackage,
        validationIssues: [],
        repairHistory: generated.repaired
          ? [
              {
                attempt: 0,
                stage: "initial" as const,
                status: "rejected" as const,
                issues: ["initial validation required repair."],
                model: config.model,
                promptFingerprint:
                  canonicalEnglishPlan.compiledPrompt.promptFingerprint,
                responseSchemaFingerprint: englishSchemaFingerprint,
                generatedAt: new Date().toISOString(),
              },
              {
                attempt: 1,
                stage: "repair" as const,
                status: "accepted" as const,
                issues: [],
                model: config.repairModel ?? config.model,
                promptFingerprint:
                  canonicalEnglishPlan.compiledPrompt.promptFingerprint,
                responseSchemaFingerprint: englishSchemaFingerprint,
                generatedAt: new Date().toISOString(),
              },
            ]
          : [
              {
                attempt: 0,
                stage: "initial" as const,
                status: "accepted" as const,
                issues: [],
                model: config.model,
                promptFingerprint:
                  canonicalEnglishPlan.compiledPrompt.promptFingerprint,
                responseSchemaFingerprint: englishSchemaFingerprint,
                generatedAt: new Date().toISOString(),
              },
            ],
        inputTokens: generated.inputTokens,
        outputTokens: generated.outputTokens,
        estimatedCostUsd: estimateStoryLocalizationCost(
          options.modelPricing?.[config.model],
          {
            inputTokens: generated.inputTokens,
            outputTokens: generated.outputTokens,
          }
        ).estimatedCostUsd,
        status: "completed",
      });
      const canonicalWrite = await persistCanonicalEnglishFullStory({
        artifact: englishFullArtifact,
        sourceStory: parsed,
        canonicalPaths,
      });
      canonicalEnglishFingerprint = canonicalWrite.manifest.canonicalFingerprint;
      generatedFiles.push(
        canonicalPaths.canonicalArtifactPath,
        path.join(canonicalPaths.canonicalDir, "generation-manifest.json"),
        outputFiles.full,
        outputFiles.rootScript
      );
      canonicalEnglishStory = await prepareParsedStory(outputFiles.full);
      await ensureCacheFacts(
        cacheDir,
        canonicalEnglishStory.parsed.sourceHash,
        canonicalEnglishStory.facts
      );
    } catch (error) {
      languageFailures.push(
        error instanceof Error ? error.message : String(error)
      );
      skippedFiles.push(outputFiles.full, outputFiles.rootScript);
    }
  }
  if (!canonicalEnglishStory) {
    const failureMessage =
      languageFailures.find((entry) => entry.length > 0) ??
      "English full story optimization failed before downstream localization.";
    const result: StoryLocalizationEpisodeResult = {
      episodeNumber: parsed.episodeNumber,
      slug: parsed.slug,
      sourceFile: parsed.sourceFile,
      copiedEnglishFull: outputFiles.rootScript,
      generatedFiles,
      skippedFiles,
      cacheHit,
      repairAttempts,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateStoryLocalizationCost(
        options.modelPricing?.[config.model],
        {
          inputTokens,
          outputTokens,
        }
      ).estimatedCostUsd,
      failure: failureMessage,
    };
    await persistStoryProductionStage(cacheDir, parsed, "failed");
    logger.info(
      { episodeId: parsed.slug, ...result } satisfies LoggerContext,
      "localized story episode"
    );
    return result;
  }
  if (englishFullPackage) {
    const englishCacheOutputFiles: string[] = [
      outputFiles.full,
      outputFiles.rootScript,
    ];
    await writeLocalizationCacheEntry(cacheDir, {
      sourceFile: parsed.sourceFile,
      sourceHash: parsed.sourceHash,
      configurationHash: englishFullCacheKey,
      promptVersion: config.promptVersion,
      model: config.model,
      language: "en",
      generatedAt: new Date().toISOString(),
      outputFiles: englishCacheOutputFiles,
      compilerVersion:
        canonicalEnglishPlan.compiledPrompt.compilerVersion,
      promptFingerprint:
        canonicalEnglishPlan.compiledPrompt.promptFingerprint,
      responseSchemaName: fullNarrationResponseSchemaDescriptor.name,
      responseSchemaVersion: fullNarrationResponseSchemaDescriptor.version,
      responseSchemaFingerprint:
        fullNarrationResponseSchemaDescriptor.fingerprint,
      parentArtifactFingerprint:
        canonicalEnglishFingerprint ??
        canonicalEnglishPlan.expectedCanonicalFingerprint,
      canonicalFingerprint:
        canonicalEnglishFingerprint ??
        canonicalEnglishPlan.expectedCanonicalFingerprint,
      inputTokens,
      outputTokens,
    });
  }
  const englishShortPath = outputFiles.short;
  if (config.includeEnglishShort) {
    await persistStoryProductionStage(
      cacheDir,
      parsed,
      "english-short-generation"
    );
    try {
      const shortSummary = await rewriteShortStories(
        {
          inputPath: outputFiles.full,
          episodeSlug: parsed.slug,
          outputRoot: config.outputDirectory,
          languages: ["en"],
          model: config.model,
          temperature: config.temperature,
          reasoningEffort: config.reasoningEffort,
          maxOutputTokens: DEFAULT_SHORT_REWRITE_MAX_OUTPUT_TOKENS,
          retryMaxOutputTokens: DEFAULT_SHORT_REWRITE_RETRY_MAX_OUTPUT_TOKENS,
          maxConcurrency: 1,
          timeoutMs: config.timeoutMs,
          maxRetries: 2,
          overwrite: config.force,
          resume: false,
          dryRun: false,
          force: config.force,
          verbose: config.verbose,
          json: false,
        },
        {
          client,
          logger,
          ...(options.signal ? { signal: options.signal } : {}),
        }
      );
      inputTokens += shortSummary.inputTokens;
      outputTokens += shortSummary.outputTokens;
      for (const artifact of shortSummary.artifacts) {
        const markdownPath = path.join(
          config.outputDirectory,
          parsed.slug,
          artifact.markdownOutputPath
        );
        if (artifact.status === "completed") {
          generatedFiles.push(markdownPath);
        } else {
          skippedFiles.push(markdownPath);
        }
      }
      const englishShortArtifact = shortSummary.artifacts.find(
        (artifact) =>
          artifact.targetLanguage === "en" && artifact.status === "completed"
      );
      if (englishShortArtifact) {
        const compatibilitySource = path.join(
          config.outputDirectory,
          parsed.slug,
          englishShortArtifact.markdownOutputPath
        );
        const compatibilityWrite = await copyFileAtomicIfChanged(
          compatibilitySource,
          englishShortPath,
          true
        );
        if (compatibilityWrite === "written") {
          generatedFiles.push(englishShortPath);
        }
      }
      await writeLocalizationCacheEntry(cacheDir, {
        sourceFile: canonicalEnglishStory.parsed.sourceFile,
        sourceHash: canonicalEnglishStory.parsed.sourceHash,
        configurationHash: englishFullCacheKey,
        promptVersion: config.promptVersion,
        model: config.model,
        language: "en",
        generatedAt: new Date().toISOString(),
        outputFiles: [outputFiles.full, outputFiles.rootScript, englishShortPath],
        compilerVersion:
          canonicalEnglishPlan.compiledPrompt.compilerVersion,
        promptFingerprint:
          canonicalEnglishPlan.compiledPrompt.promptFingerprint,
        responseSchemaName: fullNarrationResponseSchemaDescriptor.name,
        responseSchemaVersion:
          fullNarrationResponseSchemaDescriptor.version,
        responseSchemaFingerprint:
          fullNarrationResponseSchemaDescriptor.fingerprint,
        parentArtifactFingerprint:
          canonicalEnglishFingerprint ??
          canonicalEnglishPlan.expectedCanonicalFingerprint,
        canonicalFingerprint:
          canonicalEnglishFingerprint ??
          canonicalEnglishPlan.expectedCanonicalFingerprint,
        inputTokens,
        outputTokens,
      });
      await writeLocalizationCacheEntry(cacheDir, {
        sourceFile: parsed.sourceFile,
        sourceHash: parsed.sourceHash,
        configurationHash: buildCacheKey({
          episodeSlug: parsed.slug,
          sourceHash: parsed.sourceHash,
          language: "en",
          adaptationMode: config.adaptationMode,
          model: config.model,
          temperature: config.temperature,
          reasoningEffort: config.reasoningEffort,
          profile: profileEn,
          promptVersion: config.promptVersion,
          shortWpm: config.shortWpm,
          shortMinSeconds: config.shortMinSeconds,
          shortMaxSeconds: config.shortMaxSeconds,
          compilerVersion:
            canonicalEnglishPlan.compiledPrompt.compilerVersion,
          promptFingerprint:
            canonicalEnglishPlan.compiledPrompt.promptFingerprint,
          responseSchemaFingerprint:
            fullNarrationResponseSchemaDescriptor.fingerprint,
          parentFingerprint:
            canonicalEnglishFingerprint ??
            canonicalEnglishPlan.expectedCanonicalFingerprint,
        }),
        promptVersion: config.promptVersion,
        model: config.model,
        language: "en",
        generatedAt: new Date().toISOString(),
        outputFiles: [englishShortPath],
        parentArtifactFingerprint:
          canonicalEnglishFingerprint ??
          canonicalEnglishPlan.expectedCanonicalFingerprint,
        canonicalFingerprint:
          canonicalEnglishFingerprint ??
          canonicalEnglishPlan.expectedCanonicalFingerprint,
        inputTokens,
        outputTokens,
      });
    } catch (error) {
      const failureMessage =
        error instanceof Error ? error.message : String(error);
      languageFailures.push(failureMessage);
      skippedFiles.push(englishShortPath);
    }
  }
  const canonicalProductionContext = buildProductionContext(
    canonicalEnglishStory.parsed,
    canonicalEnglishStory.facts
  );
  const includeLocalizedShorts = config.includeLocalizedShorts ?? true;
  for (const language of config.languages) {
    const profile = getLanguageProfile(language);
    const localizedOutputFiles = buildOutputFiles(
      config.outputDirectory,
      parsed.slug,
      language
    );
    const languagePrompt = buildFullPromptConfig(
      language,
      canonicalEnglishStory.parsed,
      canonicalEnglishStory.facts,
      config.adaptationMode,
      canonicalEnglishPlan.characterRenameMap,
      {
        analysis: canonicalProductionContext.analysis,
        bible: canonicalProductionContext.bible,
        originalityReview: canonicalProductionContext.originalityReview,
        retentionPlan: canonicalProductionContext.retentionPlan,
      }
    );
    const localizedCacheKey = buildCacheKey({
      episodeSlug: parsed.slug,
      sourceHash: canonicalEnglishStory.parsed.sourceHash,
      language,
      adaptationMode: config.adaptationMode,
      model: config.model,
      temperature: config.temperature,
      reasoningEffort: config.reasoningEffort,
      profile,
      promptVersion: config.promptVersion,
      shortWpm: config.shortWpm,
      shortMinSeconds: config.shortMinSeconds,
      shortMaxSeconds: config.shortMaxSeconds,
      compilerVersion: languagePrompt.compilerVersion,
      promptFingerprint: languagePrompt.promptFingerprint,
      responseSchemaFingerprint: languagePrompt.responseSchema.fingerprint,
      parentFingerprint:
        canonicalEnglishFingerprint ??
        canonicalEnglishPlan.expectedCanonicalFingerprint,
    });
    const localizedParentArtifact = buildLocalizedFullParentArtifact({
      sourceHash: canonicalEnglishStory.parsed.sourceHash,
      canonicalFingerprint:
        canonicalEnglishFingerprint ??
        canonicalEnglishPlan.expectedCanonicalFingerprint,
      storyIrHash: canonicalEnglishPlan.storyIrHash,
      contractHash: canonicalEnglishPlan.contractHash,
      contractBuildFingerprint:
        canonicalEnglishPlan.contractBuildFingerprint,
    });
    const localizedResume = resumeEnabled
      ? await resolveResumableFullStoryOutput({
          cacheDir,
          sourceHash: canonicalEnglishStory.parsed.sourceHash,
          cacheKey: localizedCacheKey,
          outputFile: localizedOutputFiles.full,
          expectedSourceFile: canonicalEnglishStory.parsed.sourceFile,
          language,
          model: config.model,
          promptVersion: config.promptVersion,
        })
      : { eligible: false as const };
    if (localizedResume.eligible) {
      cacheHit = true;
      skippedFiles.push(localizedOutputFiles.full);
      continue;
    }
    await persistStoryProductionStage(
      cacheDir,
      parsed,
      "localized-long-form-generation"
    );
    let generatedValueForFailure: unknown;
    const languageResponseSchema = includeLocalizedShorts
      ? responseSchemaForLanguage(language)
      : responseSchemaForFullLanguage(language);
    const languageSchemaVersion = includeLocalizedShorts
      ? "legacy-generated-story-package-v1"
      : fullNarrationResponseSchemaDescriptor.version;
    const languageSchemaFingerprint = includeLocalizedShorts
      ? estimateStoryTokens(languageResponseSchema.name, "conservative-fallback").toString()
      : fullNarrationResponseSchemaDescriptor.fingerprint;
    try {
      const generated = await generateStructuredStoryPackage<
        GeneratedStoryPackage | NarrationOnlyFullRewriteResponse
      >(
        client,
        config.model,
        config.repairModel,
        `${profile.displayName} full story localization`,
        languagePrompt.system,
        languagePrompt.user,
        languageResponseSchema.schema,
        languageResponseSchema.name,
        config.timeoutMs,
        config.temperature,
        config.maxOutputTokens ?? 25_000,
        config.reasoningEffort,
        config.repairMaxOutputTokens,
        config.repairReasoningEffort,
        (value) => {
          try {
            if (includeLocalizedShorts) {
              const packageValue = parseGeneratedPackage(
                value as unknown,
                language
              );
              void validateFullNarrationArtifact({
                language,
                profile,
                storyIr: canonicalEnglishPlan.storyIr,
                outputConstraints: canonicalEnglishPlan.outputConstraints,
                narrationParagraphs: packageValue.full?.narrationParagraphs ?? [],
                characterRenameMap: canonicalEnglishPlan.characterRenameMap,
                preservationChecklist: {
                  primaryRevealPreserved:
                    packageValue.preservationChecklist.primaryRevealPreserved,
                  endingPreserved:
                    packageValue.preservationChecklist.endingPreserved,
                },
              });
              const issues = validateGeneratedStoryPackage(
                packageValue,
                facts,
                profile,
                parsed,
                language
              );
              if (!packageValue.full) {
                issues.push(`Missing full story payload for ${language}.`);
              }
              return issues;
            }
            const packageValue = parseLocalizedFullRewritePackage(
              value as unknown,
              language
            );
            void validateFullNarrationArtifact({
              language,
              profile,
              storyIr: canonicalEnglishPlan.storyIr,
              outputConstraints: canonicalEnglishPlan.outputConstraints,
              narrationParagraphs: packageValue.full.narrationParagraphs,
              characterRenameMap: canonicalEnglishPlan.characterRenameMap,
              preservationChecklist: {
                primaryRevealPreserved:
                  packageValue.preservationChecklist.primaryRevealPreserved,
                endingPreserved:
                  packageValue.preservationChecklist.endingPreserved,
              },
            });
            return validateNarrationOnlyFullRewritePackage(
              packageValue,
              facts,
              profile,
              language
            );
          } catch (error) {
            return [error instanceof Error ? error.message : String(error)];
          }
        },
        {
          purpose: "localized-full",
          ...(config.retryMaxOutputTokens !== undefined
            ? {
                regenerationMaxOutputTokens: config.retryMaxOutputTokens,
              }
            : {}),
          canRepair: () => false,
          ...(debugDirectory
            ? {
                debug: {
                  debugDirectory,
                  fileBaseName: `${debugPrefix}-${language}`,
                },
              }
            : {}),
          preflight: buildFullStoryPreflightAdapter({
            cacheDir,
            parsed: canonicalEnglishStory.parsed,
            language,
            variant: "localized-full",
            config,
            promptFingerprint: languagePrompt.promptFingerprint,
            schemaName: languageResponseSchema.name,
            schemaVersion: languageSchemaVersion,
            schemaFingerprint: languageSchemaFingerprint,
            profile,
            includeShort: includeLocalizedShorts,
            parentArtifact: localizedParentArtifact,
            storyIrHash: canonicalEnglishPlan.storyIrHash,
            fullContractHash: canonicalEnglishPlan.contractHash,
            fullContractVersion: FULL_STORY_CONTRACT_VERSION,
            promptCompilerVersion: languagePrompt.compilerVersion,
            promptModuleFingerprints: languagePrompt.selectedModules.map(
              (entry) => buildConfigurationHash([entry.id, entry.version])
            ),
            ...(options.modelPricing?.[config.model]
              ? { modelPricing: options.modelPricing[config.model] }
              : {}),
          }),
        }
      );
      repairAttempts += generated.repaired ? 1 : 0;
      inputTokens += generated.inputTokens;
      outputTokens += generated.outputTokens;
      generatedValueForFailure = generated.value;
      if (includeLocalizedShorts) {
        const generatedPackage = parseGeneratedPackage(
          generated.value,
          language
        );
        const generatedFull = generatedPackage.full;
        if (!generatedFull) {
          throw new StoryLocalizationSchemaError(
            `Missing full story payload for ${language}.`
          );
        }
        const fullMarkdown = renderLocalizedFullStory(
          canonicalEnglishStory.parsed.episodeNumber,
          generatedFull,
          language,
          canonicalEnglishStory.parsed.sourceHash
        );
        const fullWrite = await writeTextAtomicIfChanged(
          localizedOutputFiles.full,
          fullMarkdown,
          config.force
        );
        if (fullWrite === "written") {
          generatedFiles.push(localizedOutputFiles.full);
        } else {
          skippedFiles.push(localizedOutputFiles.full);
        }
        await persistStoryProductionArtifact(
          cacheDir,
          canonicalEnglishStory.parsed,
          `${language}-full-narration-result.json`,
          {
            schemaVersion: fullNarrationResponseSchemaDescriptor.version,
            sourceFormat: "legacy-mixed",
            deprecationDiagnostics: [
              "legacy-mixed localized full payload retained for compatibility",
            ],
            promptFingerprint: languagePrompt.promptFingerprint,
            responseSchemaName: languagePrompt.responseSchema.name,
            responseSchemaVersion: languagePrompt.responseSchema.version,
            responseSchemaFingerprint:
              languagePrompt.responseSchema.fingerprint,
            lineage: localizedParentArtifact,
            validationIssues: [],
            result: normalizeNarrationOnlyBatchResult(generated.value).normalized,
          }
        );
        await persistStoryProductionStage(
          cacheDir,
          parsed,
          "localized-long-form-validation"
        );
        const shortMarkdown = renderLocalizedShort(
          parsed.episodeNumber,
          generatedPackage.short,
          language
        );
        const shortWriteLocalized = await writeTextAtomicIfChanged(
          localizedOutputFiles.short,
          shortMarkdown,
          config.force
        );
        if (shortWriteLocalized === "written") {
          generatedFiles.push(localizedOutputFiles.short);
        } else {
          skippedFiles.push(localizedOutputFiles.short);
        }
        await persistStoryProductionStage(
          cacheDir,
          parsed,
          "localized-short-generation"
        );
        await persistStoryProductionStage(
          cacheDir,
          parsed,
          "localized-short-validation"
        );
      } else {
        const generatedPackage = parseLocalizedFullRewritePackage(
          generated.value,
          language
        );
        const fullMarkdown = renderLocalizedFullStory(
          canonicalEnglishStory.parsed.episodeNumber,
          adaptNarrationOnlyFullToLegacyRendererPackage({
            sourceStory: canonicalEnglishStory.parsed,
            response: generatedPackage,
          }),
          language,
          canonicalEnglishStory.parsed.sourceHash
        );
        const fullWrite = await writeTextAtomicIfChanged(
          localizedOutputFiles.full,
          fullMarkdown,
          config.force
        );
        if (fullWrite === "written") {
          generatedFiles.push(localizedOutputFiles.full);
        } else {
          skippedFiles.push(localizedOutputFiles.full);
        }
        await persistStoryProductionArtifact(
          cacheDir,
          canonicalEnglishStory.parsed,
          `${language}-full-narration-result.json`,
          {
            schemaVersion: fullNarrationResponseSchemaDescriptor.version,
            sourceFormat: "narration-only",
            deprecationDiagnostics: [],
            promptFingerprint: languagePrompt.promptFingerprint,
            responseSchemaName: languagePrompt.responseSchema.name,
            responseSchemaVersion: languagePrompt.responseSchema.version,
            responseSchemaFingerprint:
              languagePrompt.responseSchema.fingerprint,
            lineage: localizedParentArtifact,
            validationIssues: [],
            result: generatedPackage,
          }
        );
        await persistStoryProductionStage(
          cacheDir,
          parsed,
          "localized-long-form-validation"
        );
      }
      const outputFilesForCache = includeLocalizedShorts
        ? [localizedOutputFiles.full, localizedOutputFiles.short]
        : [localizedOutputFiles.full];
      await writeLocalizationCacheEntry(cacheDir, {
        sourceFile: canonicalEnglishStory.parsed.sourceFile,
        sourceHash: canonicalEnglishStory.parsed.sourceHash,
        configurationHash: localizedCacheKey,
        promptVersion: config.promptVersion,
        model: config.model,
        language,
        generatedAt: new Date().toISOString(),
        outputFiles: outputFilesForCache,
        compilerVersion: languagePrompt.compilerVersion,
        promptFingerprint: languagePrompt.promptFingerprint,
        responseSchemaName: languagePrompt.responseSchema.name,
        responseSchemaVersion: languagePrompt.responseSchema.version,
        responseSchemaFingerprint:
          languagePrompt.responseSchema.fingerprint,
        parentArtifactFingerprint:
          canonicalEnglishFingerprint ??
          canonicalEnglishPlan.expectedCanonicalFingerprint,
        canonicalFingerprint:
          canonicalEnglishFingerprint ??
          canonicalEnglishPlan.expectedCanonicalFingerprint,
        parentArtifactSourceHash: localizedParentArtifact.sourceHash,
        parentArtifactStoryIrHash: localizedParentArtifact.storyIrHash,
        parentArtifactContractHash: localizedParentArtifact.contractHash,
        parentArtifactContractBuildFingerprint:
          localizedParentArtifact.contractBuildFingerprint,
        parentArtifactLocale: localizedParentArtifact.locale,
        parentArtifactVariant: localizedParentArtifact.variant,
        inputTokens,
        outputTokens,
      });
      await writeLocalizationCacheEntry(cacheDir, {
        sourceFile: parsed.sourceFile,
        sourceHash: parsed.sourceHash,
        configurationHash: buildBatchCompatibleConfigurationHash({
          episodeSlug: parsed.slug,
          sourceHash: parsed.sourceHash,
          language,
          adaptationMode: config.adaptationMode,
          model: config.model,
          temperature: config.temperature,
          reasoningEffort: config.reasoningEffort,
          promptVersion: config.promptVersion,
          compilerVersion: languagePrompt.compilerVersion,
          promptFingerprint: languagePrompt.promptFingerprint,
          responseSchemaName: languagePrompt.responseSchema.name,
          responseSchemaVersion: languagePrompt.responseSchema.version,
          responseSchemaFingerprint:
            languagePrompt.responseSchema.fingerprint,
          parentFingerprint:
            canonicalEnglishFingerprint ??
            canonicalEnglishPlan.expectedCanonicalFingerprint,
          shortWpm: config.shortWpm,
          shortMinSeconds: config.shortMinSeconds,
          shortMaxSeconds: config.shortMaxSeconds,
        }),
        promptVersion: config.promptVersion,
        model: config.model,
        language,
        generatedAt: new Date().toISOString(),
        outputFiles: [localizedOutputFiles.full],
        compilerVersion: languagePrompt.compilerVersion,
        promptFingerprint: languagePrompt.promptFingerprint,
        responseSchemaName: languagePrompt.responseSchema.name,
        responseSchemaVersion: languagePrompt.responseSchema.version,
        responseSchemaFingerprint:
          languagePrompt.responseSchema.fingerprint,
        parentArtifactFingerprint:
          canonicalEnglishFingerprint ??
          canonicalEnglishPlan.expectedCanonicalFingerprint,
        canonicalFingerprint:
          canonicalEnglishFingerprint ??
          canonicalEnglishPlan.expectedCanonicalFingerprint,
        parentArtifactSourceHash: localizedParentArtifact.sourceHash,
        parentArtifactStoryIrHash: localizedParentArtifact.storyIrHash,
        parentArtifactContractHash: localizedParentArtifact.contractHash,
        parentArtifactContractBuildFingerprint:
          localizedParentArtifact.contractBuildFingerprint,
        parentArtifactLocale: localizedParentArtifact.locale,
        parentArtifactVariant: localizedParentArtifact.variant,
        inputTokens,
        outputTokens,
      });
    } catch (error) {
      const failureMessage =
        error instanceof Error ? error.message : String(error);
      languageFailures.push(`${language}: ${failureMessage}`);
      const validationIssues = failureMessage
        .split("; ")
        .filter((issue) => issue.length > 0);
      const persistedFiles = await persistFailedLocalizedOutput({
        outputDirectory: config.outputDirectory,
        parsed: canonicalEnglishStory.parsed,
        language,
        generatedValue: generatedValueForFailure,
        issues: validationIssues,
        failureMessage,
      });
      if (persistedFiles.length > 0) {
        logger.warn(
          {
            episodeId: parsed.slug,
          } satisfies LoggerContext,
          `saved failed localization artifact: ${persistedFiles
            .map((filePath) => toRepositoryRelativePath(filePath))
            .join(", ")}`
        );
      }
      skippedFiles.push(localizedOutputFiles.full);
      if (includeLocalizedShorts) {
        skippedFiles.push(localizedOutputFiles.short);
      }
    }
  }
  const pricing = options.modelPricing?.[config.model];
  const cost = estimateStoryLocalizationCost(pricing, {
    inputTokens,
    outputTokens,
  });
  const result: StoryLocalizationEpisodeResult = {
    episodeNumber: parsed.episodeNumber,
    slug: parsed.slug,
    sourceFile: parsed.sourceFile,
    copiedEnglishFull: outputFiles.rootScript,
    generatedFiles,
    skippedFiles,
    cacheHit,
    repairAttempts,
    inputTokens,
    outputTokens,
    estimatedCostUsd: cost.estimatedCostUsd,
    ...(languageFailures.length > 0
      ? { failure: languageFailures.join("; ") }
      : {}),
  };
  await persistStoryProductionStage(
    cacheDir,
    parsed,
    languageFailures.length > 0 ? "failed" : "completed"
  );
  logger.info(
    { episodeId: parsed.slug, ...result } satisfies LoggerContext,
    "localized story episode"
  );
  return result;
}

export async function localizeStories(
  config: StoryLocalizationConfig,
  options: StoryLocalizationOptions = {}
): Promise<StoryLocalizationRunResult> {
  validateConfiguration(config);
  const started = Date.now();
  const logger =
    options.logger ?? createLogger(config.verbose ? "debug" : "info");
  const sourceDirectory =
    config.sourceDirectory || resolveDefaultSourceDirectory();
  const outputDirectory =
    config.outputDirectory || resolveDefaultOutputDirectory();
  await ensureDir(outputDirectory);
  const discovered = await discoverCanonicalSourceStories(sourceDirectory);
  const total = discovered.length;
  const selected = total > 0 ? discovered : [];
  const client = options.client ?? (await loadOpenAiClient(config));
  if (config.processingMode === "batch") {
    return runStoryLocalizationInBatchMode(
      selected.map((candidate) => candidate.filePath),
      config,
      { client, logger }
    );
  }
  const results: StoryLocalizationEpisodeResult[] = [];
  let copiedEnglishFull = 0;
  let generatedEnglishShort = 0;
  let generatedGermanFull = 0;
  let generatedGermanShort = 0;
  let generatedSpanishFull = 0;
  let generatedSpanishShort = 0;
  let generatedFrenchFull = 0;
  let generatedFrenchShort = 0;
  let generatedPortugueseFull = 0;
  let generatedPortugueseShort = 0;
  let skipped = 0;
  let cacheHits = 0;
  let repairAttempts = 0;
  let failures = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let estimatedTotalCostUsd: number | null = 0;
  for (const candidate of selected) {
    try {
      const episodeResult = await localizeStoryEpisode(
        candidate.filePath,
        config,
        {
          client,
          logger,
          ...(options.modelPricing
            ? { modelPricing: options.modelPricing }
            : {}),
        }
      );
      results.push(episodeResult);
      copiedEnglishFull += 1;
      generatedEnglishShort += config.includeEnglishShort ? 1 : 0;
      generatedGermanFull += config.languages.includes("de") ? 1 : 0;
      generatedGermanShort +=
        config.languages.includes("de") &&
        (config.includeLocalizedShorts ?? true)
          ? 1
          : 0;
      generatedSpanishFull += config.languages.includes("es") ? 1 : 0;
      generatedSpanishShort +=
        config.languages.includes("es") &&
        (config.includeLocalizedShorts ?? true)
          ? 1
          : 0;
      generatedFrenchFull += config.languages.includes("fr") ? 1 : 0;
      generatedFrenchShort +=
        config.languages.includes("fr") &&
        (config.includeLocalizedShorts ?? true)
          ? 1
          : 0;
      generatedPortugueseFull += config.languages.includes("pt") ? 1 : 0;
      generatedPortugueseShort +=
        config.languages.includes("pt") &&
        (config.includeLocalizedShorts ?? true)
          ? 1
          : 0;
      skipped += episodeResult.skippedFiles.length;
      cacheHits += episodeResult.cacheHit ? 1 : 0;
      repairAttempts += episodeResult.repairAttempts;
      totalInputTokens += episodeResult.inputTokens;
      totalOutputTokens += episodeResult.outputTokens;
      estimatedTotalCostUsd =
        episodeResult.estimatedCostUsd ?? estimatedTotalCostUsd;
    } catch (error) {
      failures += 1;
      results.push({
        episodeNumber: candidate.episodeNumber,
        slug: candidate.slug,
        sourceFile: candidate.filePath,
        generatedFiles: [],
        skippedFiles: [],
        cacheHit: false,
        repairAttempts: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: null,
        failure: error instanceof Error ? error.message : String(error),
      });
      logger.error(
        { episodeId: candidate.slug, error },
        "story localization failed"
      );
    }
  }
  return {
    counts: {
      discovered: total,
      copiedEnglishFull,
      generatedEnglishShort,
      generatedGermanFull,
      generatedGermanShort,
      generatedSpanishFull,
      generatedSpanishShort,
      generatedFrenchFull,
      generatedFrenchShort,
      generatedPortugueseFull,
      generatedPortugueseShort,
      skipped,
      cacheHits,
      repairAttempts,
      failures,
      totalInputTokens,
      totalOutputTokens,
      estimatedTotalCostUsd,
      totalExecutionTimeMs: Date.now() - started,
    },
    results,
  };
}

export async function validateGeneratedStories(
  outputDirectory: string
): Promise<string[]> {
  const entries = await fs.readdir(outputDirectory, { withFileTypes: true });
  const issues: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }
    const content = await fs.readFile(
      path.join(outputDirectory, entry.name),
      "utf8"
    );
    if (detectForbiddenPhrases(content).length > 0) {
      issues.push(`${entry.name}: forbidden boilerplate`);
    }
    if (detectGenericFiller(content).length > 0) {
      issues.push(`${entry.name}: generic filler`);
    }
  }
  return issues;
}

export function createStoryLocalizationConfig(
  input: Partial<StoryLocalizationConfig> & {
    readonly sourceDirectory?: string;
    readonly outputDirectory?: string;
  }
): StoryLocalizationConfig {
  const sourceDirectory = path.resolve(
    input.sourceDirectory ?? resolveDefaultSourceDirectory()
  );
  const outputDirectory = path.resolve(
    input.outputDirectory ?? resolveDefaultOutputDirectory()
  );
  const normalizedLanguages: Exclude<LanguageCode, "en">[] = [
    ...(input.languages ?? ["de", "es", "fr", "pt"]),
  ].map((language) => {
    const normalized = normalizeLocaleCode(language);
    if (!isShortLanguage(normalized)) {
      throw new Error(
        `Invalid localized story language: ${language}. Supported values: de, es, fr, pt.`
      );
    }
    return normalized;
  });
  return {
    sourceDirectory,
    outputDirectory,
    languages: [...new Set(normalizedLanguages)],
    includeEnglishShort: input.includeEnglishShort ?? true,
    includeLocalizedShorts: input.includeLocalizedShorts ?? true,
    processingMode: input.processingMode ?? "batch",
    adaptationMode: input.adaptationMode ?? "retention-optimized",
    shortMinSeconds: input.shortMinSeconds ?? 55,
    shortMaxSeconds: input.shortMaxSeconds ?? 65,
    shortWpm: input.shortWpm ?? 180,
    timeoutMs: input.timeoutMs ?? 180_000,
    maxOutputTokens: input.maxOutputTokens ?? 25_000,
    retryMaxOutputTokens: input.retryMaxOutputTokens ?? 25_000,
    repairModel: input.repairModel,
    repairReasoningEffort: input.repairReasoningEffort,
    repairMaxOutputTokens: input.repairMaxOutputTokens,
    concurrency: input.concurrency ?? 2,
    model: input.model ?? SHORT_REWRITE_DEFAULT_MODEL,
    temperature: input.temperature ?? SHORT_REWRITE_DEFAULT_TEMPERATURE,
    reasoningEffort:
      input.reasoningEffort ?? SHORT_REWRITE_DEFAULT_REASONING_EFFORT,
    fallbackToSync: input.fallbackToSync ?? false,
    force: input.force ?? false,
    resume: input.resume ?? false,
    submit: input.submit ?? false,
    prepareBatch: input.prepareBatch ?? false,
    waitForBatch: input.waitForBatch ?? false,
    autoImport: input.autoImport ?? false,
    pollIntervalSeconds: input.pollIntervalSeconds ?? 60,
    dryRun: input.dryRun ?? false,
    validateOnly: input.validateOnly ?? false,
    verbose: input.verbose ?? false,
    promptVersion: input.promptVersion ?? "story-localization-v1",
    debugOutputs: input.debugOutputs ?? false,
    debugPrefix: input.debugPrefix ?? "stories-rewrite-full",
  };
}
