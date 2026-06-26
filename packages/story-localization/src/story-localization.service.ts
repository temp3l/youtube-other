import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ensureDir, fileExists } from "@mediaforge/shared";
import { createLogger, type LoggerContext } from "@mediaforge/observability";
import { getLanguageProfile, isShortLanguage } from "./language-profiles.js";
import { buildLocalizationPrompt } from "./localization-prompt-builder.js";
import { extractCanonicalStoryFacts } from "./canonical-facts.service.js";
import { discoverCanonicalSourceStories, resolveDefaultOutputDirectory, resolveDefaultSourceDirectory } from "./source-story-discovery.js";
import { parseCanonicalSourceStory } from "./source-story-parser.js";
import { generatedStoryPackageSchema, EnglishGeneratedStoryPackageSchema } from "./story-localization.schemas.js";
import { renderLocalizedFullStory, renderLocalizedShort } from "./story-markdown-renderer.js";
import { buildConfigurationHash, readCanonicalFactsCache, readLocalizationCacheEntry, resolveCacheDirectory, writeCanonicalFactsCache, writeLocalizationCacheEntry } from "./story-localization-cache.js";
import { estimateStoryLocalizationCost } from "./story-localization.cost-tracker.js";
import { StoryLocalizationApiError, StoryLocalizationConfigurationError, StoryLocalizationSchemaError, StoryLocalizationValidationError } from "./story-localization.errors.js";
import { copyFileAtomicIfChanged, countWords, estimateDurationSeconds, writeTextAtomicIfChanged } from "./story-localization.utils.js";
import { type CanonicalStoryFacts, type GeneratedStoryPackage, type LanguageCode, type ModelPricing, type ParsedSourceStory, type StoryLocalizationConfig, type StoryLocalizationEpisodeResult, type StoryLocalizationRunCounts, type StoryLocalizationRunResult } from "./story-localization.types.js";
import { detectForbiddenPhrases, detectGenericFiller, validateGeneratedStoryPackage } from "./generated-story-validator.js";
import { createOpenAiStoryClient, type OpenAiStoryClient } from "./story-localization-openai-batch.js";
import { runStoryLocalizationInBatchMode } from "./story-localization-batch-service.js";

export interface StoryLocalizationOptions {
  readonly client?: OpenAiStoryClient;
  readonly logger?: ReturnType<typeof createLogger>;
  readonly modelPricing?: Readonly<Record<string, ModelPricing>>;
}

const generatedPackageResponseSchema = generatedStoryPackageSchema;
const englishPackageResponseSchema = EnglishGeneratedStoryPackageSchema;

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

function buildShortPromptConfig(
  language: LanguageCode,
  sourceStory: ParsedSourceStory,
  canonicalFacts: CanonicalStoryFacts,
  adaptationMode: StoryLocalizationConfig["adaptationMode"]
): { readonly system: string; readonly user: string } {
  return buildLocalizationPrompt({
    languageProfile: getLanguageProfile(language),
    adaptationMode,
    sourceStory,
    canonicalFacts,
    target: "short",
  });
}

function buildFullPromptConfig(
  language: Exclude<LanguageCode, "en">,
  sourceStory: ParsedSourceStory,
  canonicalFacts: CanonicalStoryFacts,
  adaptationMode: StoryLocalizationConfig["adaptationMode"]
): { readonly system: string; readonly user: string } {
  return buildLocalizationPrompt({
    languageProfile: getLanguageProfile(language),
    adaptationMode,
    sourceStory,
    canonicalFacts,
    target: "full",
  });
}

function responseSchemaForLanguage(language: LanguageCode): unknown {
  const schema = language === "en" ? englishPackageResponseSchema : generatedPackageResponseSchema;
  return {
    type: "json_schema",
    name: language === "en" ? "english_story_package" : "generated_story_package",
    schema: z.toJSONSchema(schema),
    strict: true,
  } as const;
}

async function callOpenAiStructured(
  client: OpenAiStoryClient,
  model: string,
  system: string,
  user: string,
  schema: unknown,
  timeoutMs: number
): Promise<{ readonly json: unknown; readonly responseId: string; readonly usage?: { readonly inputTokens?: number; readonly outputTokens?: number; readonly cachedInputTokens?: number } }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Story localization request timed out.")), timeoutMs);
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
      throw new StoryLocalizationApiError("OpenAI returned an empty response.");
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
    throw new StoryLocalizationApiError("Failed to call OpenAI for story localization.", error);
  } finally {
    clearTimeout(timeout);
  }
}

async function generateStructuredStoryPackage<T>(
  client: OpenAiStoryClient,
  model: string,
  system: string,
  user: string,
  schema: unknown,
  timeoutMs: number,
  validate: (value: T) => string[]
): Promise<{
  readonly value: T;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly repaired: boolean;
}> {
  const initial = await callOpenAiStructured(client, model, system, user, schema, timeoutMs);
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
  const repair = await callOpenAiStructured(client, model, system, repairUser, schema, timeoutMs);
  try {
    value = repair.json as T;
  } catch (error) {
    throw new StoryLocalizationSchemaError("Unable to parse repaired OpenAI JSON response.", error);
  }
  const repairedIssues = validate(value);
  if (repairedIssues.length > 0) {
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
    readonly fullWordCount?: number | undefined;
    readonly shortWordCount: number;
    readonly shortEstimatedDurationSeconds: number;
    readonly removedGenericFiller: readonly string[];
    readonly adaptationNotes: readonly string[];
  };
} {
  return englishPackageResponseSchema.parse(json);
}

export function buildOutputFiles(
  outputDirectory: string,
  slug: string,
  language: LanguageCode
): { readonly full: string; readonly short: string } {
  return {
    full: path.join(outputDirectory, `${slug}-${language}-full.md`),
    short: path.join(outputDirectory, `${slug}-${language}-short.md`),
  };
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
  const cacheDir = resolveCacheDirectory(config.outputDirectory);
  await ensureDir(cacheDir);
  const { parsed, facts } = await prepareParsedStory(sourceFile);
  await ensureCacheFacts(cacheDir, parsed.sourceHash, facts);
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
  const englishShortPath = path.join(config.outputDirectory, `${parsed.slug}-en-short.md`);
  const englishShortPackage = await (async () => {
    try {
      if (!config.includeEnglishShort) {
        return buildEnglishShortPackage(parsed);
      }
      if (cachedEntry && (await fileExists(englishShortPath))) {
        return buildEnglishShortPackage(parsed);
      }
      const prompt = buildShortPromptConfig("en", parsed, facts, config.adaptationMode);
      const generated = await generateStructuredStoryPackage<Pick<GeneratedStoryPackage, "short" | "preservationChecklist" | "diagnostics">>(
        client,
        config.model,
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
    const languagePrompt = buildFullPromptConfig(language, parsed, facts, config.adaptationMode);
    try {
      const generated = await generateStructuredStoryPackage<GeneratedStoryPackage>(
        client,
        config.model,
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
        }
      );
      repairAttempts += generated.repaired ? 1 : 0;
      inputTokens += generated.inputTokens;
      outputTokens += generated.outputTokens;
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
    } catch (error) {
      languageFailures.push(`${language}: ${error instanceof Error ? error.message : String(error)}`);
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
