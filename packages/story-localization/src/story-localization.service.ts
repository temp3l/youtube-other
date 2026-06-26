import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ensureDir, fileExists, splitIntoSentences } from "@mediaforge/shared";
import { createLogger, type LoggerContext } from "@mediaforge/observability";
import { getLanguageProfile, isShortLanguage } from "./language-profiles.js";
import { buildLocalizationPrompt } from "./localization-prompt-builder.js";
import { extractCanonicalStoryFacts } from "./canonical-facts.service.js";
import { discoverCanonicalSourceStories, resolveDefaultOutputDirectory, resolveDefaultSourceDirectory } from "./source-story-discovery.js";
import { parseCanonicalSourceStory } from "./source-story-parser.js";
import { generatedStoryPackageSchema, EnglishGeneratedStoryPackageSchema } from "./story-localization.schemas.js";
import { renderLocalizedFullStory, renderLocalizedShort } from "./story-markdown-renderer.js";
import { buildConfigurationHash, readCanonicalFactsCache, readLocalizationCacheEntry, resolveEpisodeCacheDirectory, resolveEpisodeStoryOutputFiles, writeCanonicalFactsCache, writeLocalizationCacheEntry } from "./story-localization-cache.js";
import { estimateStoryLocalizationCost } from "./story-localization.cost-tracker.js";
import { StoryLocalizationApiError, StoryLocalizationConfigurationError, StoryLocalizationSchemaError, StoryLocalizationValidationError } from "./story-localization.errors.js";
import { copyFileAtomicIfChanged, countWords, estimateDurationSeconds, writeJsonAtomicIfChanged, writeTextAtomicIfChanged } from "./story-localization.utils.js";
import { languageCodes, type CanonicalStoryFacts, type GeneratedStoryPackage, type LanguageCode, type LanguageProfile, type ModelPricing, type ParsedSourceStory, type StoryLocalizationConfig, type StoryLocalizationEpisodeResult, type StoryLocalizationRunCounts, type StoryLocalizationRunResult } from "./story-localization.types.js";
import { detectForbiddenPhrases, detectGenericFiller, validateGeneratedStoryPackage, validateWrittenMessagesPreserved } from "./generated-story-validator.js";
import { createOpenAiStoryClient, type OpenAiStoryClient } from "./story-localization-openai-batch.js";
import { runStoryLocalizationInBatchMode } from "./story-localization-batch-service.js";
import { resolveBatchStorageLayout, toRepositoryRelativePath } from "./story-localization-batch-storage.js";
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

export interface StoryLocalizationOptions {
  readonly client?: OpenAiStoryClient;
  readonly logger?: ReturnType<typeof createLogger>;
  readonly modelPricing?: Readonly<Record<string, ModelPricing>>;
  readonly preflightConnectivity?: boolean;
}

const generatedPackageResponseSchema = generatedStoryPackageSchema;
const englishPackageResponseSchema = EnglishGeneratedStoryPackageSchema;
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
    throw new StoryLocalizationConfigurationError("concurrency must be a positive integer");
  }
  if (config.shortMinSeconds >= config.shortMaxSeconds) {
    throw new StoryLocalizationConfigurationError("shortMinSeconds must be less than shortMaxSeconds");
  }
  if (!Number.isInteger(config.pollIntervalSeconds) || config.pollIntervalSeconds < 1) {
    throw new StoryLocalizationConfigurationError("pollIntervalSeconds must be a positive integer");
  }
  if (!path.isAbsolute(config.sourceDirectory) || !path.isAbsolute(config.outputDirectory)) {
    throw new StoryLocalizationConfigurationError("Directories must be resolved before use.");
  }
}

async function loadOpenAiClient(config: StoryLocalizationConfig): Promise<OpenAiStoryClient> {
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
    () => controller.abort(new Error("OpenAI connectivity preflight timed out.")),
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
  language: Exclude<LanguageCode, "en">,
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
    target: "full",
    ...(productionContext ? { productionContext } : {}),
  });
}

function responseSchemaForLanguage(language: LanguageCode): unknown {
  const schema =
    language === "en"
      ? englishPackageResponseSchema
      : z.object({
          language: z.enum(languageCodes),
          full: generatedStoryPackageSchema.shape.full.unwrap(),
          short: generatedStoryPackageSchema.shape.short,
          preservationChecklist: generatedStoryPackageSchema.shape.preservationChecklist,
          diagnostics: generatedStoryPackageSchema.shape.diagnostics,
        });
  return {
    type: "json_schema",
    name: language === "en" ? "english_story_package" : "generated_story_package",
    schema: z.toJSONSchema(schema),
    strict: true,
  } as const;
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
      const message =
        typeof record.message === "string" ? record.message : "";
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
    };
    const nestedCode =
      typeof record.error?.code === "string" ? record.error.code : undefined;
    const code =
      typeof record.code === "string" ? record.code : nestedCode;
    const nestedMessage =
      typeof record.error?.message === "string" ? record.error.message : undefined;
    const message =
      nestedMessage ??
      (typeof record.message === "string" ? record.message : "OpenAI request failed.");
    const status =
      typeof record.status === "number" ? ` (status ${record.status})` : "";
    const codeSuffix = code ? ` [${code}]` : "";
    if (code === "insufficient_quota") {
      return `${message}${codeSuffix}${status}. Check API billing, project selection, and key scope.`;
    }
    if (
      isConnectivityError(record) ||
      isConnectivityError(record.error) ||
      isConnectivityError(record.message)
    ) {
      return `Connection/transport error while calling OpenAI${codeSuffix}${status}: ${message}`;
    }
    return `${message}${codeSuffix}${status}`;
  }
  if (error instanceof Error) {
    if (isConnectivityError(error.message) || isConnectivityError(error.cause)) {
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
  schema: unknown,
  timeoutMs: number
): Promise<{ readonly json: unknown; readonly responseId: string; readonly usage?: { readonly inputTokens?: number; readonly outputTokens?: number; readonly cachedInputTokens?: number } }> {
  const maxAttempts = 5;
  let lastError: unknown;
  const startedAt = Date.now();
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
      const response = await client.responses.create(
        {
          model,
          input: [
            { role: "system", content: [{ type: "input_text", text: system }] },
            { role: "user", content: [{ type: "input_text", text: user }] },
          ],
          text: { format: schema },
          max_output_tokens: 6000,
          temperature: 0.4,
        },
        { signal: controller.signal }
      );
      if (!response.output_text) {
        throw new StoryLocalizationApiError(
          `${requestLabel} returned an empty OpenAI response.`
        );
      }
      return {
        json: JSON.parse(response.output_text) as unknown,
        responseId: response.id,
        ...(response.usage
          ? {
              usage: {
                ...(response.usage.input_tokens !== undefined
                  ? { inputTokens: response.usage.input_tokens }
                  : {}),
                ...(response.usage.output_tokens !== undefined
                  ? { outputTokens: response.usage.output_tokens }
                  : {}),
                ...(response.usage.input_tokens_details?.cached_tokens !== undefined
                  ? {
                      cachedInputTokens:
                        response.usage.input_tokens_details.cached_tokens,
                    }
                  : {}),
              },
            }
          : {}),
      };
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts && isRetryableOpenAiRequestError(error)) {
        const delayMs = Math.min(
          8_000,
          Math.max(250, 500 * 2 ** (attempt - 1))
        );
        clearTimeout(timeout);
        await sleep(delayMs);
        continue;
      }
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

async function generateStructuredStoryPackage<T>(
  client: OpenAiStoryClient,
  model: string,
  requestLabel: string,
  system: string,
  user: string,
  schema: unknown,
  timeoutMs: number,
  validate: (value: T) => string[],
  options?: {
    readonly retryLabel?: string;
    readonly shouldRetry?: (issues: readonly string[]) => boolean;
    readonly retryInstructions?: readonly string[];
    readonly fallbackTransform?: (args: {
      readonly value: T;
      readonly issues: readonly string[];
    }) => T | null;
  }
): Promise<{
  readonly value: T;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly repaired: boolean;
}> {
  const initial = await callOpenAiStructured(
    client,
    model,
    requestLabel,
    system,
    user,
    schema,
    timeoutMs
  );
  let value: T;
  try {
    value = initial.json as T;
  } catch (error) {
    throw new StoryLocalizationSchemaError("Unable to parse OpenAI JSON response.", error);
  }
  const initialIssues = validate(value);
  if (initialIssues.length === 0) {
    return {
      value,
      inputTokens: initial.usage?.inputTokens ?? 0,
      outputTokens: initial.usage?.outputTokens ?? 0,
      repaired: false,
    };
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
  const repair = await callOpenAiStructured(
    client,
    model,
    options?.retryLabel ?? `${requestLabel} repair`,
    system,
    [
      ...(options?.retryInstructions ?? []),
      "",
      repairUser,
    ].join("\n"),
    schema,
    timeoutMs
  );
  try {
    value = repair.json as T;
  } catch (error) {
    throw new StoryLocalizationSchemaError("Unable to parse repaired OpenAI JSON response.", error);
  }
  const repairedIssues = validate(value);
  if (repairedIssues.length > 0) {
    const shouldRetry = options?.shouldRetry?.(repairedIssues) ?? false;
    if (shouldRetry && options?.retryInstructions && options.retryInstructions.length > 0) {
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
      const secondRepair = await callOpenAiStructured(
        client,
        model,
        `${requestLabel} short repair`,
        system,
        secondRepairUser,
        schema,
        timeoutMs
      );
      try {
        value = secondRepair.json as T;
      } catch (error) {
        throw new StoryLocalizationSchemaError("Unable to parse repaired OpenAI JSON response.", error);
      }
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
                (initial.usage?.inputTokens ?? 0) +
                (repair.usage?.inputTokens ?? 0) +
                (secondRepair.usage?.inputTokens ?? 0),
              outputTokens:
                (initial.usage?.outputTokens ?? 0) +
                (repair.usage?.outputTokens ?? 0) +
                (secondRepair.usage?.outputTokens ?? 0),
              repaired: true,
            };
          }
          throw new StoryLocalizationValidationError(fallbackIssues.join("; "));
        }
        throw new StoryLocalizationValidationError(secondRepairedIssues.join("; "));
      }
      return {
        value,
        inputTokens: (initial.usage?.inputTokens ?? 0) + (repair.usage?.inputTokens ?? 0) + (secondRepair.usage?.inputTokens ?? 0),
        outputTokens: (initial.usage?.outputTokens ?? 0) + (repair.usage?.outputTokens ?? 0) + (secondRepair.usage?.outputTokens ?? 0),
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
          inputTokens: (initial.usage?.inputTokens ?? 0) + (repair.usage?.inputTokens ?? 0),
          outputTokens: (initial.usage?.outputTokens ?? 0) + (repair.usage?.outputTokens ?? 0),
          repaired: true,
        };
      }
      throw new StoryLocalizationValidationError(fallbackIssues.join("; "));
    }
    throw new StoryLocalizationValidationError(repairedIssues.join("; "));
  }
  return {
    value,
    inputTokens: (initial.usage?.inputTokens ?? 0) + (repair.usage?.inputTokens ?? 0),
    outputTokens: (initial.usage?.outputTokens ?? 0) + (repair.usage?.outputTokens ?? 0),
    repaired: true,
  };
}

function parseGeneratedPackage(json: unknown, language: LanguageCode): GeneratedStoryPackage {
  const parsed = generatedPackageResponseSchema.parse(json);
  if (parsed.language !== language) {
    throw new StoryLocalizationSchemaError(`Expected language ${language}, received ${parsed.language}.`);
  }
  return parsed as GeneratedStoryPackage;
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
      issue.includes("Short word count") || issue.includes("Short duration estimate out of bounds")
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
    if (words >= profile.shortWordRange.min && words <= profile.shortWordRange.max) {
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
    candidateSentences = candidateSentences.slice(0, -2).concat(messageParagraph);
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
): { readonly full: string; readonly short: string; readonly rootScript: string } {
  const files = resolveEpisodeStoryOutputFiles(outputDirectory, slug, language);
  return {
    full: files.full,
    short: files.short,
    rootScript: files.rootScript,
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
        args.language
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
    // Keep the structured JSON artifact even if the generated package cannot be rendered.
  }

  return persistedFiles;
}

function buildCacheKey(args: {
  readonly sourceHash: string;
  readonly language: LanguageCode;
  readonly adaptationMode: StoryLocalizationConfig["adaptationMode"];
  readonly model: string;
  readonly profile: ReturnType<typeof getLanguageProfile>;
  readonly promptVersion: string;
  readonly shortWpm: number;
  readonly shortMinSeconds: number;
  readonly shortMaxSeconds: number;
}): string {
  return buildConfigurationHash([
    args.sourceHash,
    args.language,
    args.adaptationMode,
    args.model,
    args.promptVersion,
    JSON.stringify(args.profile.shortWordRange),
    String(args.shortWpm),
    String(args.shortMinSeconds),
    String(args.shortMaxSeconds),
  ]);
}

async function prepareParsedStory(sourceFile: string): Promise<{ readonly parsed: ParsedSourceStory; readonly facts: CanonicalStoryFacts }> {
  const parsed = await parseCanonicalSourceStory(sourceFile);
  const facts = extractCanonicalStoryFacts(parsed);
  return { parsed, facts };
}

async function ensureCacheFacts(cacheDir: string, sourceHash: string, facts: CanonicalStoryFacts): Promise<void> {
  const cached = await readCanonicalFactsCache(cacheDir, sourceHash);
  if (!cached) {
    await writeCanonicalFactsCache(cacheDir, sourceHash, facts);
  }
}

async function maybeReuseExistingOutput(filePath: string, expectedContent: string, force: boolean): Promise<"written" | "skipped"> {
  return writeTextAtomicIfChanged(filePath, expectedContent, force);
}

function buildEnglishShortPackage(
  source: ParsedSourceStory,
  profile = getLanguageProfile("en")
): {
  readonly language: "en";
  readonly full: undefined;
  readonly short: GeneratedStoryPackage["short"];
  readonly preservationChecklist: GeneratedStoryPackage["preservationChecklist"];
  readonly diagnostics: GeneratedStoryPackage["diagnostics"];
} {
  const narration = source.narrationParagraphs.slice(0, 4);
  const shortText = narration.join(" ");
  return {
    language: "en",
    full: undefined,
    short: {
      title: source.title,
      narrationInstructions: [
        "Use the same narrator as the full episode.",
        `Keep the pace close to ${profile.shortNarrationWpm} words per minute.`,
        "Begin immediately and keep the hook visible from the first sentence.",
      ],
      narrationParagraphs: narration,
      thumbnailText: source.metadata.thumbnailText ?? source.title.slice(0, 50),
      description: source.metadata.seoDescription ?? shortText,
      hashtags: source.metadata.hashtags.length > 0 ? source.metadata.hashtags : profile.defaultShortHashtags,
      targetNarrationWpm: profile.shortNarrationWpm,
      recommendedDurationSeconds: { min: 55, max: 65 },
      visualGuidance: source.metadata.visualDirection ?? "Use short, high-contrast shots with a clear opening threat.",
    },
    preservationChecklist: {
      charactersPreserved: true,
      relationshipsPreserved: true,
      chronologyPreserved: true,
      criticalObjectsPreserved: true,
      cluesPreserved: true,
      writtenMessagesPreserved: true,
      primaryRevealPreserved: true,
      endingPreserved: true,
      noNewPlotElementsAdded: true,
    },
    diagnostics: {
      fullWordCount: countWords(source.narrationParagraphs.join(" ")),
      shortWordCount: countWords(shortText),
      shortEstimatedDurationSeconds: estimateDurationSeconds(countWords(shortText), profile.shortNarrationWpm),
      removedGenericFiller: [],
      adaptationNotes: ["Derived directly from the English full story."],
    },
  };
}

export async function localizeStoryEpisode(
  sourceFile: string,
  config: StoryLocalizationConfig,
  options: StoryLocalizationOptions = {}
): Promise<StoryLocalizationEpisodeResult> {
  validateConfiguration(config);
  const logger = options.logger ?? createLogger("info");
  const client = options.client ?? (await loadOpenAiClient(config));
  if (options.preflightConnectivity ?? false) {
    await preflightOpenAiConnectivity(client, config.model, 60_000);
  }
  const { parsed, facts } = await prepareParsedStory(sourceFile);
  const cacheDir = resolveEpisodeCacheDirectory(config.outputDirectory, parsed.slug);
  await ensureDir(cacheDir);
  await ensureCacheFacts(cacheDir, parsed.sourceHash, facts);
  const analysis = analyzeStorySource(parsed, facts);
  const bible = buildStoryBible(parsed, facts, analysis);
  const originalityReview = buildOriginalityReview(parsed, facts, analysis);
  const retentionPlan = buildRetentionPlan(parsed, bible);
  const protectedElements = buildProtectedStoryElements(bible);
  await ensureDir(resolveEpisodeStoryProductionDirectory(cacheDir, parsed));
  await persistStoryProductionStage(cacheDir, parsed, "raw-source");
  await persistStoryProductionArtifact(cacheDir, parsed, "source-analysis.json", analysis);
  await persistStoryProductionStage(cacheDir, parsed, "source-analysis");
  await persistStoryProductionArtifact(cacheDir, parsed, "story-bible.json", bible);
  await persistStoryProductionStage(cacheDir, parsed, "story-bible");
  await persistStoryProductionArtifact(cacheDir, parsed, "originality-review.json", originalityReview);
  await persistStoryProductionStage(cacheDir, parsed, "originality-review");
  await persistStoryProductionArtifact(cacheDir, parsed, "retention-plan.json", retentionPlan);
  await persistStoryProductionArtifact(cacheDir, parsed, "protected-elements.json", protectedElements);
  await persistStoryProductionStage(cacheDir, parsed, "retention-plan");
  const profileEn = getLanguageProfile("en");
  const outputFiles = buildOutputFiles(config.outputDirectory, parsed.slug, "en");
  const generatedFiles: string[] = [];
  const skippedFiles: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let repairAttempts = 0;
  let cacheHit = false;
  const languageFailures: string[] = [];
  const sourceCopyResult = await copyFileAtomicIfChanged(parsed.sourceFile, outputFiles.full, config.force);
  if (sourceCopyResult === "written") {
    generatedFiles.push(outputFiles.full);
  } else {
    skippedFiles.push(outputFiles.full);
  }
  const shortCacheKey = buildCacheKey({
    sourceHash: parsed.sourceHash,
    language: "en",
    adaptationMode: config.adaptationMode,
    model: config.model,
    profile: profileEn,
    promptVersion: config.promptVersion,
    shortWpm: config.shortWpm,
    shortMinSeconds: config.shortMinSeconds,
    shortMaxSeconds: config.shortMaxSeconds,
  });
  const cachedEntry = await readLocalizationCacheEntry(cacheDir, parsed.sourceHash, shortCacheKey);
  if (cachedEntry) {
    cacheHit = true;
  }
    const englishShortPath = outputFiles.short;
  const englishShortPackage = await (async () => {
    try {
      if (!config.includeEnglishShort) {
        return buildEnglishShortPackage(parsed);
      }
      if (cachedEntry && (await fileExists(englishShortPath))) {
        return buildEnglishShortPackage(parsed);
      }
      await persistStoryProductionStage(cacheDir, parsed, "english-short-generation");
      const prompt = buildShortPromptConfig("en", parsed, facts, config.adaptationMode, {
        analysis,
        bible,
        originalityReview,
        retentionPlan,
      });
      const generated = await generateStructuredStoryPackage<Pick<GeneratedStoryPackage, "short" | "preservationChecklist" | "diagnostics">>(
        client,
        config.model,
        "English short story localization",
        prompt.system,
        prompt.user,
        responseSchemaForLanguage("en"),
        60_000,
        (value) => {
          const issues: string[] = [];
          try {
            const parsedValue = parseEnglishPackage(value);
            const packageValue: GeneratedStoryPackage = {
              language: "en",
              full: undefined,
              short: parsedValue.short,
              preservationChecklist: parsedValue.preservationChecklist,
              diagnostics: {
                fullWordCount: parsedValue.diagnostics.fullWordCount ?? 0,
                shortWordCount: parsedValue.diagnostics.shortWordCount,
                shortEstimatedDurationSeconds: parsedValue.diagnostics.shortEstimatedDurationSeconds,
                removedGenericFiller: parsedValue.diagnostics.removedGenericFiller,
                adaptationNotes: parsedValue.diagnostics.adaptationNotes,
              },
            };
            issues.push(...validateGeneratedStoryPackage(packageValue, facts, profileEn, parsed, "en"));
          } catch (error) {
            issues.push(error instanceof Error ? error.message : String(error));
          }
          return issues;
        },
        {
          retryLabel: "English short story localization length repair",
          shouldRetry: hasShortLengthIssue,
          retryInstructions: shortRewriteRetryInstructions,
        }
      );
      repairAttempts += generated.repaired ? 1 : 0;
      inputTokens += generated.inputTokens;
      outputTokens += generated.outputTokens;
      const parsedResult = parseEnglishPackage(generated.value);
      const packageValue: GeneratedStoryPackage = {
        language: "en",
        full: undefined,
        short: parsedResult.short,
        preservationChecklist: parsedResult.preservationChecklist,
        diagnostics: {
          fullWordCount: parsedResult.diagnostics.fullWordCount ?? 0,
          shortWordCount: parsedResult.diagnostics.shortWordCount,
          shortEstimatedDurationSeconds: parsedResult.diagnostics.shortEstimatedDurationSeconds,
          removedGenericFiller: parsedResult.diagnostics.removedGenericFiller,
          adaptationNotes: parsedResult.diagnostics.adaptationNotes,
        },
      };
      const issues = validateGeneratedStoryPackage(packageValue, facts, profileEn, parsed, "en");
      if (issues.length > 0) {
        throw new StoryLocalizationValidationError(issues.join("; "));
      }
      await persistStoryProductionStage(cacheDir, parsed, "english-short-validation");
      return packageValue;
    } catch (error) {
      languageFailures.push(error instanceof Error ? error.message : String(error));
      return buildEnglishShortPackage(parsed);
    }
  })();
  if (config.includeEnglishShort) {
    const englishShortContent = [
      `# Short ${parsed.episodeNumber} — ${englishShortPackage.short.title}`,
      "",
      "## Narration Instructions",
      "",
      ...englishShortPackage.short.narrationInstructions.map((line) => `- ${line}`),
      "",
      "## Narration Script",
      "",
      englishShortPackage.short.narrationParagraphs.join("\n\n"),
      "",
      "## Short Metadata",
      "",
      `**Primary title:** ${englishShortPackage.short.title}`,
      "",
      `**Thumbnail text:** ${englishShortPackage.short.thumbnailText}`,
      "",
      `**Description:** ${englishShortPackage.short.description}`,
      "",
      `**Hashtags:** ${englishShortPackage.short.hashtags.join(" ")}`,
      "",
      "**Format:** 1080 × 1920, 9:16 vertical",
      "",
      `**Recommended duration:** approximately ${englishShortPackage.short.recommendedDurationSeconds.min}–${englishShortPackage.short.recommendedDurationSeconds.max} seconds`,
      "",
      `**Visual guidance:** ${englishShortPackage.short.visualGuidance}`,
      "",
    ].join("\n");
    const shortWrite = await maybeReuseExistingOutput(englishShortPath, englishShortContent, config.force);
    if (shortWrite === "written") {
      generatedFiles.push(englishShortPath);
    } else {
      skippedFiles.push(englishShortPath);
    }
  }
  await writeLocalizationCacheEntry(cacheDir, {
    sourceFile: parsed.sourceFile,
    sourceHash: parsed.sourceHash,
    configurationHash: shortCacheKey,
    promptVersion: config.promptVersion,
    model: config.model,
    language: "en",
    generatedAt: new Date().toISOString(),
      outputFiles: config.includeEnglishShort ? [outputFiles.full, englishShortPath] : [outputFiles.full],
    inputTokens,
    outputTokens,
  });
  for (const language of config.languages) {
    const profile = getLanguageProfile(language);
    const localizedOutputFiles = buildOutputFiles(config.outputDirectory, parsed.slug, language);
    await persistStoryProductionStage(cacheDir, parsed, "localized-long-form-generation");
    const languagePrompt = buildFullPromptConfig(language, parsed, facts, config.adaptationMode, {
      analysis,
      bible,
      originalityReview,
      retentionPlan,
    });
    let generatedValueForFailure: unknown;
    try {
      const generated = await generateStructuredStoryPackage<GeneratedStoryPackage>(
        client,
        config.model,
        `${profile.displayName} full story localization`,
        languagePrompt.system,
        languagePrompt.user,
        responseSchemaForLanguage(language),
        90_000,
        (value) => {
          const issues: string[] = [];
          try {
            const packageValue = parseGeneratedPackage(value as unknown, language);
            issues.push(...validateGeneratedStoryPackage(packageValue, facts, profile, parsed, language));
            if (!packageValue.full) {
              issues.push(`Missing full story payload for ${language}.`);
            }
          } catch (error) {
            issues.push(error instanceof Error ? error.message : String(error));
          }
          return issues;
        },
        {
          retryLabel: `${profile.displayName} full story localization length repair`,
          shouldRetry: hasShortLengthIssue,
          retryInstructions: shortRewriteRetryInstructions,
          fallbackTransform: (args) => {
            const parsedPackage = parseGeneratedPackage(args.value as unknown, language);
            const derivedShort = hasShortLengthIssue(args.issues)
              ? buildLocalizedShortNarrationFromFull(parsedPackage, profile)
              : null;
            const nextShortNarration =
              buildLocalizedShortNarrationWithExactMessages({
                baseNarrationParagraphs:
                  derivedShort ?? parsedPackage.short.narrationParagraphs,
                language,
                facts,
                profile,
              }) ?? derivedShort;
            if (!nextShortNarration) {
              return null;
            }
            return {
              ...parsedPackage,
              short: {
                ...parsedPackage.short,
                narrationParagraphs: nextShortNarration,
              },
              diagnostics: {
                ...parsedPackage.diagnostics,
                shortWordCount: countWords(nextShortNarration.join(" ")),
                shortEstimatedDurationSeconds: estimateDurationSeconds(
                  countWords(nextShortNarration.join(" ")),
                  parsedPackage.short.targetNarrationWpm
                ),
              },
            };
          },
        }
      );
      repairAttempts += generated.repaired ? 1 : 0;
      inputTokens += generated.inputTokens;
      outputTokens += generated.outputTokens;
      generatedValueForFailure = generated.value;
      const generatedPackage = parseGeneratedPackage(generated.value, language);
      const generatedFull = generatedPackage.full;
      if (!generatedFull) {
        throw new StoryLocalizationSchemaError(`Missing full story payload for ${language}.`);
      }
      const fullMarkdown = renderLocalizedFullStory(parsed.episodeNumber, generatedFull, language);
      const shortMarkdown = renderLocalizedShort(parsed.episodeNumber, generatedPackage.short, language);
      const fullWrite = await writeTextAtomicIfChanged(localizedOutputFiles.full, fullMarkdown, config.force);
      const shortWriteLocalized = await writeTextAtomicIfChanged(localizedOutputFiles.short, shortMarkdown, config.force);
      if (fullWrite === "written") {
        generatedFiles.push(localizedOutputFiles.full);
      } else {
        skippedFiles.push(localizedOutputFiles.full);
      }
      if (shortWriteLocalized === "written") {
        generatedFiles.push(localizedOutputFiles.short);
      } else {
        skippedFiles.push(localizedOutputFiles.short);
      }
      await persistStoryProductionStage(cacheDir, parsed, "localized-long-form-validation");
      await persistStoryProductionStage(cacheDir, parsed, "localized-short-generation");
      const outputFilesForCache = [localizedOutputFiles.full, localizedOutputFiles.short];
      await writeLocalizationCacheEntry(cacheDir, {
        sourceFile: parsed.sourceFile,
        sourceHash: parsed.sourceHash,
        configurationHash: buildCacheKey({
          sourceHash: parsed.sourceHash,
          language,
          adaptationMode: config.adaptationMode,
          model: config.model,
          profile,
          promptVersion: config.promptVersion,
          shortWpm: config.shortWpm,
          shortMinSeconds: config.shortMinSeconds,
          shortMaxSeconds: config.shortMaxSeconds,
        }),
        promptVersion: config.promptVersion,
        model: config.model,
        language,
        generatedAt: new Date().toISOString(),
        outputFiles: outputFilesForCache,
        inputTokens,
        outputTokens,
      });
      await persistStoryProductionStage(cacheDir, parsed, "localized-short-validation");
    } catch (error) {
      const failureMessage = error instanceof Error ? error.message : String(error);
      languageFailures.push(`${language}: ${failureMessage}`);
      const validationIssues = failureMessage.split("; ").filter((issue) => issue.length > 0);
      const persistedFiles = await persistFailedLocalizedOutput({
        outputDirectory: config.outputDirectory,
        parsed,
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
      skippedFiles.push(localizedOutputFiles.full, localizedOutputFiles.short);
    }
  }
  const pricing = options.modelPricing?.[config.model];
  const cost = estimateStoryLocalizationCost(pricing, { inputTokens, outputTokens });
  const result: StoryLocalizationEpisodeResult = {
    episodeNumber: parsed.episodeNumber,
    slug: parsed.slug,
    sourceFile: parsed.sourceFile,
    copiedEnglishFull: outputFiles.full,
    generatedFiles,
    skippedFiles,
    cacheHit,
    repairAttempts,
    inputTokens,
    outputTokens,
    estimatedCostUsd: cost.estimatedCostUsd,
    ...(languageFailures.length > 0 ? { failure: languageFailures.join("; ") } : {}),
  };
  await persistStoryProductionStage(cacheDir, parsed, languageFailures.length > 0 ? "failed" : "completed");
  logger.info({ episodeId: parsed.slug, ...result } satisfies LoggerContext, "localized story episode");
  return result;
}

export async function localizeStories(
  config: StoryLocalizationConfig,
  options: StoryLocalizationOptions = {}
): Promise<StoryLocalizationRunResult> {
  validateConfiguration(config);
  const started = Date.now();
  const logger = options.logger ?? createLogger(config.verbose ? "debug" : "info");
  const sourceDirectory = config.sourceDirectory || resolveDefaultSourceDirectory();
  const outputDirectory = config.outputDirectory || resolveDefaultOutputDirectory();
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
      const episodeResult = await localizeStoryEpisode(candidate.filePath, config, {
        client,
        logger,
        ...(options.modelPricing ? { modelPricing: options.modelPricing } : {}),
      });
      results.push(episodeResult);
      copiedEnglishFull += 1;
      generatedEnglishShort += 1;
      generatedGermanFull += config.languages.includes("de") ? 1 : 0;
      generatedGermanShort += config.languages.includes("de") ? 1 : 0;
      generatedSpanishFull += config.languages.includes("es") ? 1 : 0;
      generatedSpanishShort += config.languages.includes("es") ? 1 : 0;
      generatedFrenchFull += config.languages.includes("fr") ? 1 : 0;
      generatedFrenchShort += config.languages.includes("fr") ? 1 : 0;
      generatedPortugueseFull += config.languages.includes("pt") ? 1 : 0;
      generatedPortugueseShort += config.languages.includes("pt") ? 1 : 0;
      skipped += episodeResult.skippedFiles.length;
      cacheHits += episodeResult.cacheHit ? 1 : 0;
      repairAttempts += episodeResult.repairAttempts;
      totalInputTokens += episodeResult.inputTokens;
      totalOutputTokens += episodeResult.outputTokens;
      estimatedTotalCostUsd = episodeResult.estimatedCostUsd ?? estimatedTotalCostUsd;
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
      logger.error({ episodeId: candidate.slug, error }, "story localization failed");
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

export async function validateGeneratedStories(outputDirectory: string): Promise<string[]> {
  const entries = await fs.readdir(outputDirectory, { withFileTypes: true });
  const issues: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }
    const content = await fs.readFile(path.join(outputDirectory, entry.name), "utf8");
    if (detectForbiddenPhrases(content).length > 0) {
      issues.push(`${entry.name}: forbidden boilerplate`);
    }
    if (detectGenericFiller(content).length > 0) {
      issues.push(`${entry.name}: generic filler`);
    }
  }
  return issues;
}

export function createStoryLocalizationConfig(input: Partial<StoryLocalizationConfig> & {
  readonly sourceDirectory?: string;
  readonly outputDirectory?: string;
}): StoryLocalizationConfig {
  const sourceDirectory = path.resolve(input.sourceDirectory ?? resolveDefaultSourceDirectory());
  const outputDirectory = path.resolve(input.outputDirectory ?? resolveDefaultOutputDirectory());
  return {
    sourceDirectory,
    outputDirectory,
    languages: (input.languages ?? ["de", "es", "fr", "pt"]) as readonly Exclude<LanguageCode, "en">[],
    includeEnglishShort: input.includeEnglishShort ?? true,
    processingMode: input.processingMode ?? "batch",
    adaptationMode: input.adaptationMode ?? "retention-optimized",
    shortMinSeconds: input.shortMinSeconds ?? 55,
    shortMaxSeconds: input.shortMaxSeconds ?? 65,
    shortWpm: input.shortWpm ?? 180,
    concurrency: input.concurrency ?? 2,
    model: input.model ?? "gpt-4o-mini",
    fallbackToSync: input.fallbackToSync ?? false,
    force: input.force ?? false,
    submit: input.submit ?? false,
    prepareBatch: input.prepareBatch ?? false,
    waitForBatch: input.waitForBatch ?? false,
    autoImport: input.autoImport ?? false,
    pollIntervalSeconds: input.pollIntervalSeconds ?? 60,
    dryRun: input.dryRun ?? false,
    validateOnly: input.validateOnly ?? false,
    verbose: input.verbose ?? false,
    promptVersion: input.promptVersion ?? "story-localization-v1",
  };
}
