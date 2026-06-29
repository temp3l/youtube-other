import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  ensureDir,
  fileExists,
  hashFile,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import { createLogger, type LoggerContext } from "@mediaforge/observability";
import { extractCanonicalStoryFacts } from "./canonical-facts.service.js";
import {
  validateGeneratedStoryPackage,
  validateNarrationOnlyFullRewritePackage,
} from "./generated-story-validator.js";
import { getLanguageProfile } from "./language-profiles.js";
import { buildLocalizationPrompt } from "./localization-prompt-builder.js";
import { materializeCanonicalSourceStory } from "./short-rewrite.bootstrap.js";
import { buildCanonicalSourceFileName } from "./short-rewrite.utils.js";
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
  type StorySourceAnalysis,
} from "./story-production.js";
import {
  parseBatchOutputJsonl,
  type OpenAiBatchOutputLine,
  type OpenAiStoryClient,
  readRemoteFileText,
  requireBatchCapabilities,
} from "./story-localization-openai-batch.js";
import {
  EnglishGeneratedStoryPackageSchema,
  generatedStoryPackageSchema,
} from "./story-localization.schemas.js";
import {
  compileFullStoryPrompt,
  type CompiledStoryPrompt,
} from "./story-prompt-compiler.js";
import {
  adaptNarrationOnlyFullToLegacyRendererPackage,
  fullNarrationResponseSchemaDescriptor,
  normalizeNarrationOnlyBatchResult,
  type NarrationOnlyFullRewriteResponse,
} from "./story-prompt-response-schemas.js";
import {
  StoryBatchIndexService,
  entryFromLocalBatchManifest,
} from "./story-localization-batch-index.js";
import {
  buildDeterministicCustomId,
  createBaseManifest,
  createLocalBatchId,
  ensureBatchStorageLayout,
  errorPathFor,
  inputPathFor,
  manifestPathFor,
  readLocalBatchManifest,
  reportPathFor,
  resolveBatchStorageLayout,
  resultPathFor,
  saveLocalBatchManifest,
  serializeBatchRequestLines,
  toRepositoryRelativePath,
  withFileLock,
  fromRepositoryRelativePath,
} from "./story-localization-batch-storage.js";
import { estimateStoryLocalizationCost } from "./story-localization.cost-tracker.js";
import {
  readCanonicalFactsCache,
  readLocalizationCacheEntry,
  resolveEpisodeCacheDirectory,
  resolveEpisodeStoryOutputFiles,
  writeCanonicalFactsCache,
  writeLocalizationCacheEntry,
  buildConfigurationHash,
} from "./story-localization-cache.js";
import {
  StoryLocalizationApiError,
  StoryLocalizationConfigurationError,
  StoryLocalizationSchemaError,
  StoryLocalizationValidationError,
} from "./story-localization.errors.js";
import { renderLocalizedFullStory } from "./story-markdown-renderer.js";
import { parseCanonicalSourceStory } from "./source-story-parser.js";
import {
  type BatchImportResult,
  type BatchIndexEntry,
  type BatchPreparationResult,
  type BatchSubmissionResult,
  type CanonicalStoryFacts,
  type GeneratedStoryPackage,
  type LanguageCode,
  type LocalBatchManifest,
  type LocalBatchManifestItem,
  type OpenAIBatchRequestLine,
  type StoryBatchItem,
  type StoryLocalizationConfig,
  type StoryLocalizationEpisodeResult,
  type StoryLocalizationRunResult,
} from "./story-localization.types.js";
import {
  countWords,
  copyFileAtomicIfChanged,
  estimateDurationSeconds,
  shouldIncludeTemperatureForModel,
  writeTextAtomicIfChanged,
} from "./story-localization.utils.js";
import {
  estimateStoryComponent,
  estimateStoryTokens,
  estimateStructuredRequestWrapperTokens,
  runStoryGenerationPreflight,
  STORY_PREFLIGHT_POLICY_VERSION,
  type StoryPreflightComponent,
  type StoryPreflightRequest,
  type StoryPreflightResult,
} from "./story-generation-preflight.js";

function responseSchemaForLanguage(language: LanguageCode): unknown {
  const schema =
    language === "en"
      ? EnglishGeneratedStoryPackageSchema
      : generatedStoryPackageSchema;
  return {
    type: "json_schema",
    name:
      language === "en" ? "english_story_package" : "generated_story_package",
    schema: z.toJSONSchema(schema),
    strict: true,
  } as const;
}

function responseSchemaForCompiledPrompt(
  compiled: CompiledStoryPrompt
): unknown {
  return {
    type: "json_schema",
    name: compiled.responseSchema.name,
    schema: z.toJSONSchema(compiled.responseSchema.schema),
    strict: true,
  } as const;
}

function assertCompiledBatchPrompt(
  compiled: CompiledStoryPrompt,
  customContext: string
): void {
  const blocking = compiled.diagnostics.filter(
    (diagnostic) => diagnostic.blocking
  );
  if (blocking.length > 0 || !compiled.promptFingerprint) {
    throw new StoryLocalizationConfigurationError(
      `Unable to compile batch prompt for ${customContext}: ${
        blocking.map((diagnostic) => diagnostic.code).join(", ") ||
        "missing prompt fingerprint"
      }.`
    );
  }
  if (
    compiled.responseSchema.name !==
      fullNarrationResponseSchemaDescriptor.name ||
    compiled.responseSchema.version !==
      fullNarrationResponseSchemaDescriptor.version
  ) {
    throw new StoryLocalizationConfigurationError(
      `Batch full-story prompt for ${customContext} selected unsupported response schema ${compiled.responseSchema.name}@${compiled.responseSchema.version}.`
    );
  }
}

function buildFullStoryBatchConfigurationHash(args: {
  readonly sourceHash: string;
  readonly language: LanguageCode;
  readonly adaptationMode: StoryLocalizationConfig["adaptationMode"];
  readonly model: string;
  readonly temperature: number;
  readonly reasoningEffort: StoryLocalizationConfig["reasoningEffort"];
  readonly promptVersion: string;
  readonly promptFingerprint: string;
  readonly compilerVersion: string;
  readonly responseSchemaName: string;
  readonly responseSchemaVersion: string;
  readonly responseSchemaFingerprint: string;
  readonly shortWpm: number;
  readonly shortMinSeconds: number;
  readonly shortMaxSeconds: number;
}): string {
  return buildConfigurationHash([
    args.sourceHash,
    args.language,
    args.adaptationMode,
    args.model,
    String(args.temperature),
    args.reasoningEffort,
    args.promptVersion,
    args.compilerVersion,
    args.promptFingerprint,
    args.responseSchemaName,
    args.responseSchemaVersion,
    args.responseSchemaFingerprint,
    String(args.shortWpm),
    String(args.shortMinSeconds),
    String(args.shortMaxSeconds),
  ]);
}

function buildCacheKey(args: {
  readonly sourceHash: string;
  readonly language: LanguageCode;
  readonly adaptationMode: StoryLocalizationConfig["adaptationMode"];
  readonly model: string;
  readonly temperature: number;
  readonly reasoningEffort: StoryLocalizationConfig["reasoningEffort"];
  readonly promptVersion: string;
  readonly shortWpm: number;
  readonly shortMinSeconds: number;
  readonly shortMaxSeconds: number;
}): string {
  const profile = getLanguageProfile(args.language);
  return buildConfigurationHash([
    args.sourceHash,
    args.language,
    args.adaptationMode,
    args.model,
    String(args.temperature),
    args.reasoningEffort,
    args.promptVersion,
    JSON.stringify(profile.shortWordRange),
    String(args.shortWpm),
    String(args.shortMinSeconds),
    String(args.shortMaxSeconds),
  ]);
}

function buildEnglishShortMarkdown(
  episodeNumber: string,
  short: GeneratedStoryPackage["short"]
): string {
  return [
    `# Short ${episodeNumber} — ${short.title}`,
    "",
    "## Narration Instructions",
    "",
    ...short.narrationInstructions.map((line) => `- ${line}`),
    "",
    "## Narration Script",
    "",
    short.narrationParagraphs.join("\n\n"),
    "",
    "## Short Metadata",
    "",
    `**Primary title:** ${short.title}`,
    "",
    `**Thumbnail text:** ${short.thumbnailText}`,
    "",
    `**Description:** ${short.description}`,
    "",
    `**Hashtags:** ${short.hashtags.join(" ")}`,
    "",
    "**Format:** 1080 × 1920, 9:16 vertical",
    "",
    `**Recommended duration:** approximately ${short.recommendedDurationSeconds.min}-${short.recommendedDurationSeconds.max} seconds`,
    "",
    `**Visual guidance:** ${short.visualGuidance}`,
    "",
  ].join("\n");
}

function buildOutputFiles(
  outputDirectory: string,
  slug: string,
  language: LanguageCode
): {
  readonly full: string;
  readonly short: string;
  readonly rootScript: string;
} {
  const files = resolveEpisodeStoryOutputFiles(outputDirectory, slug, language);
  return {
    full: files.full,
    short: files.short,
    rootScript: files.rootScript,
  };
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
  return EnglishGeneratedStoryPackageSchema.parse(json);
}

async function ensureCachedFacts(
  cacheDir: string,
  sourceHash: string,
  facts: CanonicalStoryFacts
): Promise<void> {
  const cached = await readCanonicalFactsCache(cacheDir, sourceHash);
  if (!cached) {
    await writeCanonicalFactsCache(cacheDir, sourceHash, facts);
  }
}

function buildProductionContext(
  parsed: Awaited<ReturnType<typeof parseCanonicalSourceStory>>,
  facts: CanonicalStoryFacts
): {
  readonly analysis: StorySourceAnalysis;
  readonly bible: StoryBible;
  readonly originalityReview: OriginalityReview;
  readonly retentionPlan: readonly RetentionBeat[];
  readonly protectedElements: readonly ReturnType<
    typeof buildProtectedStoryElements
  >[number][];
} {
  const analysis = analyzeStorySource(parsed, facts);
  const bible = buildStoryBible(parsed, facts, analysis);
  return {
    analysis,
    bible,
    originalityReview: buildOriginalityReview(parsed, facts, analysis),
    retentionPlan: buildRetentionPlan(parsed, bible),
    protectedElements: buildProtectedStoryElements(bible),
  };
}

function englishShortBody(
  config: StoryLocalizationConfig,
  sourceFile: Awaited<ReturnType<typeof parseCanonicalSourceStory>>,
  facts: CanonicalStoryFacts,
  productionContext?: {
    readonly analysis?: StorySourceAnalysis;
    readonly bible?: StoryBible;
    readonly originalityReview?: OriginalityReview;
    readonly retentionPlan?: ReadonlyArray<RetentionBeat>;
  }
): Record<string, unknown> {
  const prompt = buildLocalizationPrompt({
    languageProfile: getLanguageProfile("en"),
    adaptationMode: config.adaptationMode,
    sourceStory: sourceFile,
    canonicalFacts: facts,
    target: "short",
    ...(productionContext ? { productionContext } : {}),
  });
  return {
    model: config.model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: prompt.system }],
      },
      { role: "user", content: [{ type: "input_text", text: prompt.user }] },
    ],
    text: { format: responseSchemaForLanguage("en") },
    max_output_tokens: 6000,
    ...(shouldIncludeTemperatureForModel(config.model)
      ? { temperature: config.temperature }
      : {}),
    ...(config.reasoningEffort !== "none"
      ? { reasoning: { effort: config.reasoningEffort } }
      : {}),
  };
}

function localizationBody(
  config: StoryLocalizationConfig,
  compiled: CompiledStoryPrompt
): Record<string, unknown> {
  return {
    model: config.model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: compiled.system }],
      },
      { role: "user", content: [{ type: "input_text", text: compiled.user }] },
    ],
    text: { format: responseSchemaForCompiledPrompt(compiled) },
    max_output_tokens: 6000,
    ...(shouldIncludeTemperatureForModel(config.model)
      ? { temperature: config.temperature }
      : {}),
    ...(config.reasoningEffort !== "none"
      ? { reasoning: { effort: config.reasoningEffort } }
      : {}),
  };
}

function buildManifestItem(args: {
  readonly customId: string;
  readonly parsed: Awaited<ReturnType<typeof parseCanonicalSourceStory>>;
  readonly canonicalSourcePath: string;
  readonly operation: StoryBatchItem["metadata"]["operation"];
  readonly configurationHash: string;
  readonly promptVersion: string;
  readonly compilerVersion?: string;
  readonly promptFingerprint?: string;
  readonly responseSchemaName?: string;
  readonly responseSchemaVersion?: string;
  readonly responseSchemaFingerprint?: string;
  readonly selectedModules?: LocalBatchManifestItem["selectedModules"];
  readonly plannedOutputPaths: readonly string[];
  readonly estimatedInputTokens: number;
  readonly estimatedOutputTokens?: number;
  readonly preflight?: LocalBatchManifestItem["preflight"];
  readonly status?: LocalBatchManifestItem["status"];
  readonly language?: LanguageCode;
}): LocalBatchManifestItem {
  return {
    customId: args.customId,
    episodeNumber: args.parsed.episodeNumber,
    ...(args.language ? { language: args.language } : {}),
    operation: args.operation,
    sourcePath: toRepositoryRelativePath(args.canonicalSourcePath),
    sourceHash: args.parsed.sourceHash,
    promptVersion: args.promptVersion,
    ...(args.compilerVersion ? { compilerVersion: args.compilerVersion } : {}),
    ...(args.promptFingerprint
      ? { promptFingerprint: args.promptFingerprint }
      : {}),
    ...(args.responseSchemaName
      ? { responseSchemaName: args.responseSchemaName }
      : {}),
    ...(args.responseSchemaVersion
      ? { responseSchemaVersion: args.responseSchemaVersion }
      : {}),
    ...(args.responseSchemaFingerprint
      ? { responseSchemaFingerprint: args.responseSchemaFingerprint }
      : {}),
    ...(args.selectedModules ? { selectedModules: args.selectedModules } : {}),
    configurationHash: args.configurationHash,
    plannedOutputPaths: args.plannedOutputPaths,
    estimatedInputTokens: args.estimatedInputTokens,
    ...(args.estimatedOutputTokens !== undefined
      ? { estimatedOutputTokens: args.estimatedOutputTokens }
      : {}),
    ...(args.preflight ? { preflight: args.preflight } : {}),
    status: args.status ?? "planned",
  };
}

function manifestPreflightSummary(
  result: StoryPreflightResult
): LocalBatchManifestItem["preflight"] {
  return {
    policyVersion: STORY_PREFLIGHT_POLICY_VERSION,
    requestFingerprint: result.requestFingerprint,
    status: result.status,
    ...(result.status === "blocked"
      ? {
          failureCodes: result.failureCodes,
          reason: result.reason,
        }
      : {}),
    requestedOutputTokens: result.diagnostics.requestedOutputTokens,
    contextWindowTokens: result.diagnostics.contextWindowTokens,
    maxModelOutputTokens: result.diagnostics.maxModelOutputTokens,
    safetyMarginTokens: result.diagnostics.safetyMarginTokens,
  };
}

function batchPromptComponents(args: {
  readonly system: string;
  readonly user: string;
  readonly schemaName: string;
  readonly schemaVersion: string;
  readonly schemaFingerprint: string;
  readonly expectedOutputTokens: number;
}): readonly StoryPreflightComponent[] {
  return [
    estimateStoryComponent({
      name: "system-instructions",
      label: "batch system instructions",
      text: args.system,
    }),
    estimateStoryComponent({
      name: "canonical-source-narration",
      label: "batch user prompt",
      text: args.user,
    }),
    {
      name: "response-schema-overhead",
      label: args.schemaName,
      estimatedTokens: estimateStructuredRequestWrapperTokens(args),
    },
    {
      name: "request-wrapper-overhead",
      label: "OpenAI batch request wrapper",
      estimatedTokens: estimateStoryTokens(
        "batch-responses-json-wrapper",
        "conservative-fallback"
      ),
    },
    {
      name: "expected-output",
      label: "minimum feasible batch output",
      estimatedTokens: args.expectedOutputTokens,
    },
  ];
}

function extractBatchPrompt(body: Record<string, unknown>): {
  readonly system: string;
  readonly user: string;
} {
  const input = Array.isArray(body["input"]) ? body["input"] : [];
  const getText = (role: string): string => {
    const message = input.find(
      (entry): entry is { readonly role: string; readonly content: readonly unknown[] } =>
        Boolean(entry) &&
        typeof entry === "object" &&
        (entry as { readonly role?: unknown }).role === role &&
        Array.isArray((entry as { readonly content?: unknown }).content)
    );
    const content = message?.content ?? [];
    return content
      .map((entry) =>
        entry &&
        typeof entry === "object" &&
        typeof (entry as { readonly text?: unknown }).text === "string"
          ? (entry as { readonly text: string }).text
          : ""
      )
      .join("\n");
  };
  return {
    system: getText("system"),
    user: getText("user"),
  };
}

function runBatchPreflight(args: {
  readonly parsed: Awaited<ReturnType<typeof parseCanonicalSourceStory>>;
  readonly language: LanguageCode;
  readonly operation: "generate" | "localize";
  readonly variant: "canonical-english-short" | "localized-full";
  readonly config: StoryLocalizationConfig;
  readonly body: Record<string, unknown>;
  readonly promptFingerprint: string;
  readonly schemaName: string;
  readonly schemaVersion: string;
  readonly schemaFingerprint: string;
  readonly sourceHash: string;
  readonly expectedOutputTokens: number;
  readonly parentArtifact?: StoryPreflightRequest["parentArtifact"];
}): StoryPreflightResult {
  const prompt = extractBatchPrompt(args.body);
  return runStoryGenerationPreflight({
    episodeNumber: args.parsed.episodeNumber,
    episodeSlug: args.parsed.slug,
    operation: args.operation,
    variant: args.variant,
    language: args.language,
    locale: getLanguageProfile(args.language).locale,
    model: args.config.model,
    reasoningEffort: args.config.reasoningEffort,
    maxOutputTokens:
      typeof args.body["max_output_tokens"] === "number"
        ? args.body["max_output_tokens"]
        : 6000,
    retryCap: 0,
    promptVersion: args.config.promptVersion,
    promptFingerprint: args.promptFingerprint,
    schemaName: args.schemaName,
    schemaVersion: args.schemaVersion,
    schemaFingerprint: args.schemaFingerprint,
    sourceHash: args.sourceHash,
    targetWordRange: {
      min: 1,
      max: Math.max(
        1,
        Math.ceil(countWords(args.parsed.narrationParagraphs.join(" ")) * 1.12)
      ),
    },
    components: batchPromptComponents({
      ...prompt,
      schemaName: args.schemaName,
      schemaVersion: args.schemaVersion,
      schemaFingerprint: args.schemaFingerprint,
      expectedOutputTokens: args.expectedOutputTokens,
    }),
    minimumOutputTokens: args.expectedOutputTokens,
    ...(args.parentArtifact ? { parentArtifact: args.parentArtifact } : {}),
  });
}

function buildEnglishShortBatchItem(args: {
  readonly parsed: Awaited<ReturnType<typeof parseCanonicalSourceStory>>;
  readonly canonicalSourcePath: string;
  readonly facts: CanonicalStoryFacts;
  readonly config: StoryLocalizationConfig;
  readonly configurationHash: string;
  readonly retryNumber?: number;
  readonly productionContext: {
    readonly analysis: StorySourceAnalysis;
    readonly bible: StoryBible;
    readonly originalityReview: OriginalityReview;
    readonly retentionPlan: readonly RetentionBeat[];
    readonly protectedElements: ReadonlyArray<
      ReturnType<typeof buildProtectedStoryElements>[number]
    >;
  };
}): {
  readonly requestItem?: StoryBatchItem;
  readonly manifestItem: LocalBatchManifestItem;
} {
  const body = englishShortBody(
    args.config,
    args.parsed,
    args.facts,
    args.productionContext
  );
  const outputFiles = buildOutputFiles(
    args.config.outputDirectory,
    args.parsed.slug,
    "en"
  );
  const customId = buildDeterministicCustomId({
    episodeNumber: args.parsed.episodeNumber,
    operation: "english-short",
    language: "en",
    sourceHash: args.parsed.sourceHash,
    configurationHash: args.configurationHash,
    ...(args.retryNumber && args.retryNumber > 0
      ? { retryNumber: args.retryNumber }
      : {}),
  });
  const schemaVersion = "legacy-english-story-package-v1";
  const schemaFingerprint = estimateStoryTokens(
    "english_story_package",
    "conservative-fallback"
  ).toString();
  const promptFingerprint = buildConfigurationHash([
    args.parsed.sourceHash,
    args.config.promptVersion,
    "english-short-batch",
    JSON.stringify(body),
  ]);
  const expectedOutputTokens =
    Math.ceil(getLanguageProfile("en").shortWordRange.max * 1.45) + 650;
  const preflight = runBatchPreflight({
    parsed: args.parsed,
    language: "en",
    operation: "generate",
    variant: "canonical-english-short",
    config: args.config,
    body,
    promptFingerprint,
    schemaName: "english_story_package",
    schemaVersion,
    schemaFingerprint,
    sourceHash: args.parsed.sourceHash,
    expectedOutputTokens,
    parentArtifact: {
      kind: "canonical-english-full",
      sourceHash: args.parsed.sourceHash,
    },
  });
  const manifestItem = buildManifestItem({
    customId,
    parsed: args.parsed,
    canonicalSourcePath: args.canonicalSourcePath,
    language: "en",
    operation: "english-short",
    configurationHash: args.configurationHash,
    promptVersion: args.config.promptVersion,
    promptFingerprint,
    plannedOutputPaths: [
      toRepositoryRelativePath(outputFiles.full),
      toRepositoryRelativePath(outputFiles.short),
    ],
    estimatedInputTokens: preflight.diagnostics.estimatedInputTokens,
    estimatedOutputTokens: preflight.diagnostics.estimatedMinimumOutputTokens,
    preflight: manifestPreflightSummary(preflight),
    status: preflight.status === "blocked" ? "preflight-failed" : "planned",
  });
  if (preflight.status === "blocked") {
    return { manifestItem };
  }
  return {
    requestItem: {
      customId,
      method: "POST",
      url: "/v1/responses",
      body,
      metadata: {
        episodeNumber: args.parsed.episodeNumber,
        sourceHash: args.parsed.sourceHash,
        operation: "english-short",
        language: "en",
        promptVersion: args.config.promptVersion,
        configurationHash: args.configurationHash,
      },
    },
    manifestItem,
  };
}

function buildLocalizationBatchItem(args: {
  readonly parsed: Awaited<ReturnType<typeof parseCanonicalSourceStory>>;
  readonly canonicalSourcePath: string;
  readonly facts: CanonicalStoryFacts;
  readonly config: StoryLocalizationConfig;
  readonly language: Exclude<LanguageCode, "en">;
  readonly compiledPrompt: CompiledStoryPrompt;
  readonly configurationHash: string;
  readonly retryNumber?: number;
  readonly productionContext: {
    readonly analysis: StorySourceAnalysis;
    readonly bible: StoryBible;
    readonly originalityReview: OriginalityReview;
    readonly retentionPlan: readonly RetentionBeat[];
    readonly protectedElements: ReadonlyArray<
      ReturnType<typeof buildProtectedStoryElements>[number]
    >;
  };
}): {
  readonly requestItem?: StoryBatchItem;
  readonly manifestItem: LocalBatchManifestItem;
} {
  assertCompiledBatchPrompt(
    args.compiledPrompt,
    `${args.parsed.episodeNumber}:${args.language}`
  );
  const body = localizationBody(args.config, args.compiledPrompt);
  const outputFiles = buildOutputFiles(
    args.config.outputDirectory,
    args.parsed.slug,
    args.language
  );
  const customId = buildDeterministicCustomId({
    episodeNumber: args.parsed.episodeNumber,
    operation: "localization",
    language: args.language,
    sourceHash: args.parsed.sourceHash,
    configurationHash: args.configurationHash,
    ...(args.retryNumber && args.retryNumber > 0
      ? { retryNumber: args.retryNumber }
      : {}),
  });
  const expectedOutputTokens =
    Math.ceil(countWords(args.parsed.narrationParagraphs.join(" ")) * 1.12 * 1.45) +
    650;
  const preflight = runBatchPreflight({
    parsed: args.parsed,
    language: args.language,
    operation: "localize",
    variant: "localized-full",
    config: args.config,
    body,
    promptFingerprint: args.compiledPrompt.promptFingerprint,
    schemaName: args.compiledPrompt.responseSchema.name,
    schemaVersion: args.compiledPrompt.responseSchema.version,
    schemaFingerprint: args.compiledPrompt.responseSchema.fingerprint,
    sourceHash: args.parsed.sourceHash,
    expectedOutputTokens,
    parentArtifact: {
      kind: "canonical-english-full",
      sourceHash: args.parsed.sourceHash,
    },
  });
  const manifestItem = buildManifestItem({
    customId,
    parsed: args.parsed,
    canonicalSourcePath: args.canonicalSourcePath,
    language: args.language,
    operation: "localization",
    configurationHash: args.configurationHash,
    promptVersion: args.config.promptVersion,
    compilerVersion: args.compiledPrompt.compilerVersion,
    promptFingerprint: args.compiledPrompt.promptFingerprint,
    responseSchemaName: args.compiledPrompt.responseSchema.name,
    responseSchemaVersion: args.compiledPrompt.responseSchema.version,
    responseSchemaFingerprint: args.compiledPrompt.responseSchema.fingerprint,
    selectedModules: args.compiledPrompt.selectedModules,
    plannedOutputPaths: [toRepositoryRelativePath(outputFiles.full)],
    estimatedInputTokens: preflight.diagnostics.estimatedInputTokens,
    estimatedOutputTokens: preflight.diagnostics.estimatedMinimumOutputTokens,
    preflight: manifestPreflightSummary(preflight),
    status: preflight.status === "blocked" ? "preflight-failed" : "planned",
  });
  if (preflight.status === "blocked") {
    return { manifestItem };
  }
  return {
    requestItem: {
      customId,
      method: "POST",
      url: "/v1/responses",
      body,
      metadata: {
        episodeNumber: args.parsed.episodeNumber,
        sourceHash: args.parsed.sourceHash,
        operation: "localization",
        language: args.language,
        promptVersion: args.config.promptVersion,
        compilerVersion: args.compiledPrompt.compilerVersion,
        promptFingerprint: args.compiledPrompt.promptFingerprint,
        responseSchemaName: args.compiledPrompt.responseSchema.name,
        responseSchemaVersion: args.compiledPrompt.responseSchema.version,
        responseSchemaFingerprint:
          args.compiledPrompt.responseSchema.fingerprint,
        selectedModules: args.compiledPrompt.selectedModules,
        configurationHash: args.configurationHash,
      },
    },
    manifestItem,
  };
}

async function buildBatchItems(
  sourceFiles: readonly string[],
  config: StoryLocalizationConfig
): Promise<{
  readonly requestItems: readonly StoryBatchItem[];
  readonly manifestItems: readonly LocalBatchManifestItem[];
  readonly skippedCachedItemCount: number;
}> {
  const requestItems: StoryBatchItem[] = [];
  const manifestItems: LocalBatchManifestItem[] = [];
  let skippedCachedItemCount = 0;
  for (const sourcePath of sourceFiles) {
    const parsed = await parseCanonicalSourceStory(sourcePath);
    const canonicalSourcePath = path.join(
      config.outputDirectory,
      parsed.slug,
      "source",
      buildCanonicalSourceFileName({
        episodeNumber: parsed.episodeNumber,
        episodeSlug: parsed.slug,
      })
    );
    await materializeCanonicalSourceStory({
      sourcePath: parsed.sourceFile,
      targetPath: canonicalSourcePath,
      sourceSha256: parsed.sourceHash,
      sourceRole: "raw-author-source",
      resolvedFrom: "canonical-search",
      overwrite: config.force,
    });
    const canonicalParsed =
      await parseCanonicalSourceStory(canonicalSourcePath);
    const facts = extractCanonicalStoryFacts(canonicalParsed);
    const cacheDir = resolveEpisodeCacheDirectory(
      config.outputDirectory,
      canonicalParsed.slug
    );
    await ensureDir(cacheDir);
    await ensureCachedFacts(cacheDir, canonicalParsed.sourceHash, facts);
    const productionContext = buildProductionContext(canonicalParsed, facts);
    await ensureDir(
      resolveEpisodeStoryProductionDirectory(cacheDir, canonicalParsed)
    );
    await persistStoryProductionStage(cacheDir, canonicalParsed, "raw-source");
    await persistStoryProductionArtifact(
      cacheDir,
      canonicalParsed,
      "source-analysis.json",
      productionContext.analysis
    );
    await persistStoryProductionStage(
      cacheDir,
      canonicalParsed,
      "source-analysis"
    );
    await persistStoryProductionArtifact(
      cacheDir,
      canonicalParsed,
      "story-bible.json",
      productionContext.bible
    );
    await persistStoryProductionStage(cacheDir, canonicalParsed, "story-bible");
    await persistStoryProductionArtifact(
      cacheDir,
      canonicalParsed,
      "originality-review.json",
      productionContext.originalityReview
    );
    await persistStoryProductionStage(
      cacheDir,
      canonicalParsed,
      "originality-review"
    );
    await persistStoryProductionArtifact(
      cacheDir,
      canonicalParsed,
      "retention-plan.json",
      productionContext.retentionPlan
    );
    await persistStoryProductionArtifact(
      cacheDir,
      canonicalParsed,
      "protected-elements.json",
      productionContext.protectedElements
    );
    await persistStoryProductionStage(
      cacheDir,
      canonicalParsed,
      "retention-plan"
    );
    if (config.includeEnglishShort) {
      const configHash = buildCacheKey({
        sourceHash: canonicalParsed.sourceHash,
        language: "en",
        adaptationMode: config.adaptationMode,
        model: config.model,
        temperature: config.temperature,
        reasoningEffort: config.reasoningEffort,
        promptVersion: config.promptVersion,
        shortWpm: config.shortWpm,
        shortMinSeconds: config.shortMinSeconds,
        shortMaxSeconds: config.shortMaxSeconds,
      });
      const outputFiles = buildOutputFiles(
        config.outputDirectory,
        canonicalParsed.slug,
        "en"
      );
      const cacheEntry = await readLocalizationCacheEntry(
        cacheDir,
        canonicalParsed.sourceHash,
        configHash
      );
      if (cacheEntry && (await fileExists(outputFiles.short))) {
        skippedCachedItemCount += 1;
      } else {
        const item = buildEnglishShortBatchItem({
          parsed: canonicalParsed,
          canonicalSourcePath,
          facts,
          config,
          configurationHash: configHash,
          productionContext,
        });
        if (item.requestItem) {
          requestItems.push(item.requestItem);
        }
        manifestItems.push(item.manifestItem);
      }
    }
    for (const language of config.languages) {
      const compiledPrompt = compileFullStoryPrompt({
        language,
        adaptationMode: config.adaptationMode,
        sourceStory: canonicalParsed,
        canonicalFacts: facts,
        productionContext,
      });
      assertCompiledBatchPrompt(
        compiledPrompt,
        `${canonicalParsed.episodeNumber}:${language}`
      );
      const configHash = buildFullStoryBatchConfigurationHash({
        sourceHash: canonicalParsed.sourceHash,
        language,
        adaptationMode: config.adaptationMode,
        model: config.model,
        temperature: config.temperature,
        reasoningEffort: config.reasoningEffort,
        promptVersion: config.promptVersion,
        compilerVersion: compiledPrompt.compilerVersion,
        promptFingerprint: compiledPrompt.promptFingerprint,
        responseSchemaName: compiledPrompt.responseSchema.name,
        responseSchemaVersion: compiledPrompt.responseSchema.version,
        responseSchemaFingerprint: compiledPrompt.responseSchema.fingerprint,
        shortWpm: config.shortWpm,
        shortMinSeconds: config.shortMinSeconds,
        shortMaxSeconds: config.shortMaxSeconds,
      });
      const outputFiles = buildOutputFiles(
        config.outputDirectory,
        canonicalParsed.slug,
        language
      );
      const cacheEntry = await readLocalizationCacheEntry(
        cacheDir,
        canonicalParsed.sourceHash,
        configHash
      );
      if (cacheEntry && (await fileExists(outputFiles.full))) {
        skippedCachedItemCount += 1;
        continue;
      }
      const item = buildLocalizationBatchItem({
        parsed: canonicalParsed,
        canonicalSourcePath,
        facts,
        config,
        language,
        compiledPrompt,
        configurationHash: configHash,
        productionContext,
      });
      if (item.requestItem) {
        requestItems.push(item.requestItem);
      }
      manifestItems.push(item.manifestItem);
    }
  }
  return { requestItems, manifestItems, skippedCachedItemCount };
}

async function buildRetryBatchItems(args: {
  readonly manifest: LocalBatchManifest;
  readonly retryableItems: readonly LocalBatchManifestItem[];
  readonly config: StoryLocalizationConfig;
}): Promise<{
  readonly requestItems: readonly StoryBatchItem[];
  readonly manifestItems: readonly LocalBatchManifestItem[];
}> {
  const requestItems: StoryBatchItem[] = [];
  const manifestItems: LocalBatchManifestItem[] = [];
  const nextRetryNumber = args.manifest.retryNumber + 1;
  for (const retryItem of args.retryableItems) {
    const parsed = await parseCanonicalSourceStory(
      fromRepositoryRelativePath(retryItem.sourcePath)
    );
    const canonicalSourcePath = path.join(
      args.config.outputDirectory,
      parsed.slug,
      "source",
      buildCanonicalSourceFileName({
        episodeNumber: parsed.episodeNumber,
        episodeSlug: parsed.slug,
      })
    );
    await materializeCanonicalSourceStory({
      sourcePath: parsed.sourceFile,
      targetPath: canonicalSourcePath,
      sourceSha256: parsed.sourceHash,
      sourceRole: "canonical-source-copy",
      resolvedFrom: "batch-manifest",
      overwrite: args.config.force,
    });
    const canonicalParsed =
      await parseCanonicalSourceStory(canonicalSourcePath);
    const facts = extractCanonicalStoryFacts(canonicalParsed);
    const cacheDir = resolveEpisodeCacheDirectory(
      args.config.outputDirectory,
      canonicalParsed.slug
    );
    const productionContext = buildProductionContext(canonicalParsed, facts);
    await ensureDir(
      resolveEpisodeStoryProductionDirectory(cacheDir, canonicalParsed)
    );
    await persistStoryProductionStage(cacheDir, canonicalParsed, "raw-source");
    await persistStoryProductionArtifact(
      cacheDir,
      canonicalParsed,
      "source-analysis.json",
      productionContext.analysis
    );
    await persistStoryProductionStage(
      cacheDir,
      canonicalParsed,
      "source-analysis"
    );
    await persistStoryProductionArtifact(
      cacheDir,
      canonicalParsed,
      "story-bible.json",
      productionContext.bible
    );
    await persistStoryProductionStage(cacheDir, canonicalParsed, "story-bible");
    await persistStoryProductionArtifact(
      cacheDir,
      canonicalParsed,
      "originality-review.json",
      productionContext.originalityReview
    );
    await persistStoryProductionStage(
      cacheDir,
      canonicalParsed,
      "originality-review"
    );
    await persistStoryProductionArtifact(
      cacheDir,
      canonicalParsed,
      "retention-plan.json",
      productionContext.retentionPlan
    );
    await persistStoryProductionArtifact(
      cacheDir,
      canonicalParsed,
      "protected-elements.json",
      productionContext.protectedElements
    );
    await persistStoryProductionStage(
      cacheDir,
      canonicalParsed,
      "retention-plan"
    );
    if (retryItem.operation === "english-short") {
      const item = buildEnglishShortBatchItem({
        parsed: canonicalParsed,
        canonicalSourcePath,
        facts,
        config: args.config,
        configurationHash: retryItem.configurationHash,
        retryNumber: nextRetryNumber,
        productionContext,
      });
      if (item.requestItem) {
        requestItems.push(item.requestItem);
      }
      manifestItems.push(item.manifestItem);
      continue;
    }
    if (retryItem.language && retryItem.language !== "en") {
      const compiledPrompt = compileFullStoryPrompt({
        language: retryItem.language,
        adaptationMode: args.config.adaptationMode,
        sourceStory: canonicalParsed,
        canonicalFacts: facts,
        productionContext,
      });
      assertCompiledBatchPrompt(
        compiledPrompt,
        `${canonicalParsed.episodeNumber}:${retryItem.language}`
      );
      const configurationHash =
        retryItem.promptFingerprint === compiledPrompt.promptFingerprint &&
        retryItem.responseSchemaFingerprint ===
          compiledPrompt.responseSchema.fingerprint
          ? retryItem.configurationHash
          : buildFullStoryBatchConfigurationHash({
              sourceHash: canonicalParsed.sourceHash,
              language: retryItem.language,
              adaptationMode: args.config.adaptationMode,
              model: args.config.model,
              temperature: args.config.temperature,
              reasoningEffort: args.config.reasoningEffort,
              promptVersion: args.config.promptVersion,
              compilerVersion: compiledPrompt.compilerVersion,
              promptFingerprint: compiledPrompt.promptFingerprint,
              responseSchemaName: compiledPrompt.responseSchema.name,
              responseSchemaVersion: compiledPrompt.responseSchema.version,
              responseSchemaFingerprint:
                compiledPrompt.responseSchema.fingerprint,
              shortWpm: args.config.shortWpm,
              shortMinSeconds: args.config.shortMinSeconds,
              shortMaxSeconds: args.config.shortMaxSeconds,
            });
      const item = buildLocalizationBatchItem({
        parsed: canonicalParsed,
        canonicalSourcePath,
        facts,
        config: args.config,
        language: retryItem.language,
        compiledPrompt,
        configurationHash,
        retryNumber: nextRetryNumber,
        productionContext,
      });
      if (item.requestItem) {
        requestItems.push(item.requestItem);
      }
      manifestItems.push(item.manifestItem);
    }
  }
  return { requestItems, manifestItems };
}

export async function prepareStoryLocalizationBatch(
  sourceFiles: readonly string[],
  config: StoryLocalizationConfig
): Promise<BatchPreparationResult> {
  if (config.processingMode !== "batch") {
    throw new StoryLocalizationConfigurationError(
      "Batch preparation requires processingMode=batch."
    );
  }
  const layout = await ensureBatchStorageLayout(config.outputDirectory);
  const localBatchId = await createLocalBatchId(layout);
  const { requestItems, manifestItems, skippedCachedItemCount } =
    await buildBatchItems(sourceFiles, config);
  const inputPath = inputPathFor(layout, localBatchId);
  const jsonl = serializeBatchRequestLines(requestItems);
  await writeTextAtomic(inputPath, jsonl);
  const manifest = createBaseManifest({
    localBatchId,
    model: config.model,
    inputFilePath: inputPath,
    inputFileHash: await hashFile(inputPath),
    items: manifestItems,
  });
  await saveLocalBatchManifest(layout, manifest);
  const index = new StoryBatchIndexService(config.outputDirectory);
  await index.initialize();
  await index.upsert(
    entryFromLocalBatchManifest(config.outputDirectory, manifest)
  );
  return {
    localBatchId,
    manifestPath: manifestPathFor(layout, localBatchId),
    inputFilePath: inputPath,
    itemCount: requestItems.length,
    skippedCachedItemCount,
  };
}

export async function submitStoryLocalizationBatch(
  localBatchId: string,
  config: StoryLocalizationConfig,
  client: OpenAiStoryClient
): Promise<BatchSubmissionResult> {
  requireBatchCapabilities(client);
  const layout = await ensureBatchStorageLayout(config.outputDirectory);
  const manifest = await readLocalBatchManifest(layout, localBatchId);
  if (!manifest) {
    throw new Error(`Unknown batch ${localBatchId}`);
  }
  if (manifest.status !== "prepared") {
    throw new Error(`Batch ${localBatchId} is not in prepared state.`);
  }
  const inputFilePath = fromRepositoryRelativePath(manifest.inputFilePath);
  const currentHash = await hashFile(inputFilePath);
  if (currentHash !== manifest.inputFileHash) {
    throw new Error(`Batch input hash mismatch for ${localBatchId}.`);
  }
  const uploaded = await client.files.create({
    file: fs.createReadStream(inputFilePath),
    purpose: "batch",
  });
  const created = await client.batches.create({
    input_file_id: uploaded.id,
    endpoint: "/v1/responses",
    completion_window: "24h",
    metadata: { local_batch_id: localBatchId },
  });
  const nextManifest: LocalBatchManifest = {
    ...manifest,
    updatedAt: new Date().toISOString(),
    openAIInputFileId: uploaded.id,
    openAIBatchId: created.id,
    status: "submitted",
    submittedAt: new Date().toISOString(),
    items: manifest.items.map((item) =>
      item.status === "preflight-failed"
        ? item
        : { ...item, status: "submitted" }
    ),
  };
  await saveLocalBatchManifest(layout, nextManifest);
  const index = new StoryBatchIndexService(config.outputDirectory);
  await index.upsert(
    entryFromLocalBatchManifest(config.outputDirectory, nextManifest)
  );
  return {
    localBatchId,
    openAIBatchId: created.id,
    openAIInputFileId: uploaded.id,
    status: "submitted",
  };
}

export async function refreshStoryLocalizationBatch(
  batchRef: string,
  config: StoryLocalizationConfig,
  client: OpenAiStoryClient
): Promise<LocalBatchManifest> {
  requireBatchCapabilities(client);
  const layout = await ensureBatchStorageLayout(config.outputDirectory);
  const index = new StoryBatchIndexService(config.outputDirectory);
  const entry =
    (await index.getByLocalBatchId(batchRef)) ??
    (await index.getByOpenAIBatchId(batchRef));
  if (!entry?.openAIBatchId) {
    throw new Error(`Unable to resolve submitted batch ${batchRef}.`);
  }
  const manifest = await readLocalBatchManifest(layout, entry.localBatchId);
  if (!manifest) {
    throw new Error(`Missing manifest for ${entry.localBatchId}`);
  }
  const remote = await client.batches.retrieve(entry.openAIBatchId);
  const nextManifest: LocalBatchManifest = {
    ...manifest,
    updatedAt: new Date().toISOString(),
    status: remote.status,
    ...(remote.output_file_id ? { outputFileId: remote.output_file_id } : {}),
    ...(remote.error_file_id ? { errorFileId: remote.error_file_id } : {}),
    ...(remote.completed_at
      ? { completedAt: new Date(remote.completed_at * 1000).toISOString() }
      : {}),
    ...(remote.request_counts
      ? {
          requestCounts: {
            total: remote.request_counts.total,
            completed: remote.request_counts.completed,
            failed: remote.request_counts.failed,
          },
        }
      : {}),
  };
  await saveLocalBatchManifest(layout, nextManifest);
  await index.upsert(
    entryFromLocalBatchManifest(config.outputDirectory, nextManifest)
  );
  return nextManifest;
}

async function importEnglishShortResult(args: {
  readonly manifestItem: LocalBatchManifestItem;
  readonly payload: ReturnType<typeof parseEnglishPackage>;
  readonly sourceFile: Awaited<ReturnType<typeof parseCanonicalSourceStory>>;
  readonly facts: CanonicalStoryFacts;
  readonly config: StoryLocalizationConfig;
}): Promise<readonly string[]> {
  const profile = getLanguageProfile("en");
  const packageValue: GeneratedStoryPackage = {
    language: "en",
    full: undefined,
    short: args.payload.short,
    preservationChecklist: args.payload.preservationChecklist,
    diagnostics: {
      fullWordCount: args.payload.diagnostics.fullWordCount,
      shortWordCount: args.payload.diagnostics.shortWordCount,
      shortEstimatedDurationSeconds:
        args.payload.diagnostics.shortEstimatedDurationSeconds,
      removedGenericFiller: args.payload.diagnostics.removedGenericFiller,
      adaptationNotes: args.payload.diagnostics.adaptationNotes,
    },
  };
  const issues = validateGeneratedStoryPackage(
    packageValue,
    args.facts,
    profile,
    args.sourceFile,
    "en"
  );
  if (issues.length > 0) {
    throw new StoryLocalizationValidationError(issues.join("; "));
  }
  const outputFiles = buildOutputFiles(
    args.config.outputDirectory,
    args.sourceFile.slug,
    "en"
  );
  const copied = await copyFileAtomicIfChanged(
    args.sourceFile.sourceFile,
    outputFiles.full,
    true
  );
  const shortWrite = await writeTextAtomicIfChanged(
    outputFiles.short,
    buildEnglishShortMarkdown(
      args.sourceFile.episodeNumber,
      args.payload.short
    ),
    true
  );
  const persisted: string[] = [];
  if (copied === "written") {
    persisted.push(outputFiles.full);
  }
  if (shortWrite === "written") {
    persisted.push(outputFiles.short);
  }
  const cacheDir = resolveEpisodeCacheDirectory(
    args.config.outputDirectory,
    args.sourceFile.slug
  );
  await writeLocalizationCacheEntry(cacheDir, {
    sourceFile: args.sourceFile.sourceFile,
    sourceHash: args.sourceFile.sourceHash,
    configurationHash: args.manifestItem.configurationHash,
    promptVersion: args.config.promptVersion,
    model: args.config.model,
    language: "en",
    generatedAt: new Date().toISOString(),
    outputFiles: [outputFiles.full, outputFiles.short],
  });
  return persisted;
}

async function importLocalizationResult(args: {
  readonly manifestItem: LocalBatchManifestItem;
  readonly response: NarrationOnlyFullRewriteResponse;
  readonly detectedFormat: "narration-only" | "legacy-mixed";
  readonly deprecationDiagnostics: readonly string[];
  readonly sourceFile: Awaited<ReturnType<typeof parseCanonicalSourceStory>>;
  readonly facts: CanonicalStoryFacts;
  readonly config: StoryLocalizationConfig;
}): Promise<readonly string[]> {
  const language = args.manifestItem.language;
  if (!language || language === "en") {
    throw new Error("Localization import requires a non-English language.");
  }
  const issues = validateNarrationOnlyFullRewritePackage(
    args.response,
    args.facts,
    getLanguageProfile(language),
    language
  );
  if (issues.length > 0) {
    throw new StoryLocalizationValidationError(issues.join("; "));
  }
  const outputFiles = buildOutputFiles(
    args.config.outputDirectory,
    args.sourceFile.slug,
    language
  );
  const cacheDir = resolveEpisodeCacheDirectory(
    args.config.outputDirectory,
    args.sourceFile.slug
  );
  const rendererPackage = adaptNarrationOnlyFullToLegacyRendererPackage({
    sourceStory: args.sourceFile,
    response: args.response,
  });
  const fullWrite = await writeTextAtomicIfChanged(
    outputFiles.full,
    renderLocalizedFullStory(
      args.sourceFile.episodeNumber,
      rendererPackage,
      language,
      args.sourceFile.sourceHash
    ),
    true
  );
  await persistStoryProductionArtifact(
    cacheDir,
    args.sourceFile,
    `${language}-full-narration-result.json`,
    {
      schemaVersion: fullNarrationResponseSchemaDescriptor.version,
      sourceFormat: args.detectedFormat,
      deprecationDiagnostics: args.deprecationDiagnostics,
      promptFingerprint: args.manifestItem.promptFingerprint,
      responseSchemaName: args.manifestItem.responseSchemaName,
      responseSchemaVersion: args.manifestItem.responseSchemaVersion,
      responseSchemaFingerprint: args.manifestItem.responseSchemaFingerprint,
      result: args.response,
    }
  );
  await writeLocalizationCacheEntry(cacheDir, {
    sourceFile: args.sourceFile.sourceFile,
    sourceHash: args.sourceFile.sourceHash,
    configurationHash: args.manifestItem.configurationHash,
    promptVersion: args.config.promptVersion,
    model: args.config.model,
    language,
    generatedAt: new Date().toISOString(),
    outputFiles: [outputFiles.full],
  });
  return [...(fullWrite === "written" ? [outputFiles.full] : [])];
}

function lineByCustomId(
  lines: readonly OpenAiBatchOutputLine[]
): Map<string, OpenAiBatchOutputLine> {
  const mapped = new Map<string, OpenAiBatchOutputLine>();
  const duplicates: string[] = [];
  for (const line of lines) {
    if (mapped.has(line.custom_id)) {
      duplicates.push(line.custom_id);
      continue;
    }
    mapped.set(line.custom_id, line);
  }
  if (duplicates.length > 0) {
    throw new StoryLocalizationSchemaError(
      `Duplicate batch result custom IDs: ${duplicates.join(", ")}.`
    );
  }
  return mapped;
}

export async function importStoryLocalizationBatch(
  batchRef: string,
  config: StoryLocalizationConfig,
  client: OpenAiStoryClient
): Promise<BatchImportResult> {
  requireBatchCapabilities(client);
  const layout = await ensureBatchStorageLayout(config.outputDirectory);
  const index = new StoryBatchIndexService(config.outputDirectory);
  await index.initialize();
  const resolvedEntry =
    (await index.getByLocalBatchId(batchRef)) ??
    (await index.getByOpenAIBatchId(batchRef));
  const lockId = resolvedEntry?.localBatchId ?? batchRef;
  return withFileLock(
    path.join(layout.locksDir, `import-${lockId}.lock`),
    async () => {
      const refreshed = await refreshStoryLocalizationBatch(
        batchRef,
        config,
        client
      );
      if (!refreshed.openAIBatchId) {
        throw new Error(`Batch ${batchRef} has not been submitted.`);
      }
      if (!refreshed.outputFileId && !refreshed.errorFileId) {
        throw new Error(`Batch ${batchRef} has no downloadable output yet.`);
      }
      const outputText = refreshed.outputFileId
        ? await readRemoteFileText(client, refreshed.outputFileId)
        : "";
      const errorText = refreshed.errorFileId
        ? await readRemoteFileText(client, refreshed.errorFileId)
        : "";
      const resultFilePath = resultPathFor(layout, refreshed.localBatchId);
      const errorFilePath = errorPathFor(layout, refreshed.localBatchId);
      const reportFilePath = reportPathFor(layout, refreshed.localBatchId);
      if (outputText) {
        await writeTextAtomic(resultFilePath, outputText);
      }
      if (errorText) {
        await writeTextAtomic(errorFilePath, errorText);
      }
      const successLines = lineByCustomId(parseBatchOutputJsonl(outputText));
      const errorLines = lineByCustomId(parseBatchOutputJsonl(errorText));
      const duplicatedAcrossFiles = [...successLines.keys()].filter(
        (customId) => errorLines.has(customId)
      );
      if (duplicatedAcrossFiles.length > 0) {
        throw new StoryLocalizationSchemaError(
          `Duplicate batch result custom IDs across output and error files: ${duplicatedAcrossFiles.join(", ")}.`
        );
      }
      const expectedCustomIds = new Set(
        refreshed.items.map((item) => item.customId)
      );
      const unexpectedCustomIds = [
        ...[...successLines.keys()].filter(
          (customId) => !expectedCustomIds.has(customId)
        ),
        ...[...errorLines.keys()].filter(
          (customId) => !expectedCustomIds.has(customId)
        ),
      ].sort((left, right) => left.localeCompare(right));
      const persistedFiles: string[] = [];
      let failedItemCount = 0;
      const nextItems: LocalBatchManifestItem[] = [];
      for (const item of refreshed.items) {
        if (item.status === "preflight-failed") {
          failedItemCount += 1;
          nextItems.push(item);
          continue;
        }
        const sourceFile = await parseCanonicalSourceStory(
          fromRepositoryRelativePath(item.sourcePath)
        );
        const cacheDir = resolveEpisodeCacheDirectory(
          config.outputDirectory,
          sourceFile.slug
        );
        const facts = extractCanonicalStoryFacts(sourceFile);
        try {
          const line =
            successLines.get(item.customId) ?? errorLines.get(item.customId);
          if (!line) {
            throw new StoryLocalizationValidationError(
              `Missing batch output for ${item.customId}.`
            );
          }
          if (line.error) {
            throw new StoryLocalizationApiError(
              line.error.message ?? `Batch item failed: ${item.customId}`
            );
          }
          if (
            line.response?.status_code !== undefined &&
            (line.response.status_code < 200 ||
              line.response.status_code >= 300)
          ) {
            throw new StoryLocalizationApiError(
              `Batch item ${item.customId} returned HTTP ${line.response.status_code}.`
            );
          }
          const outputTextValue = line.response?.body.output_text;
          if (!outputTextValue) {
            throw new StoryLocalizationSchemaError(
              `Batch item missing output_text: ${item.customId}`
            );
          }
          const parsedJson = JSON.parse(outputTextValue) as unknown;
          let persisted: readonly string[];
          if (item.operation === "english-short") {
            persisted = await importEnglishShortResult({
              manifestItem: item,
              payload: parseEnglishPackage(parsedJson),
              sourceFile,
              facts,
              config,
            });
          } else {
            const normalized = normalizeNarrationOnlyBatchResult(parsedJson);
            if (
              item.promptFingerprint &&
              item.responseSchemaFingerprint &&
              item.responseSchemaFingerprint !==
                fullNarrationResponseSchemaDescriptor.fingerprint
            ) {
              throw new StoryLocalizationSchemaError(
                `Batch item ${item.customId} response schema fingerprint mismatch.`
              );
            }
            if (
              item.responseSchemaVersion &&
              item.responseSchemaVersion !==
                fullNarrationResponseSchemaDescriptor.version
            ) {
              throw new StoryLocalizationSchemaError(
                `Batch item ${item.customId} has unsupported response schema version ${item.responseSchemaVersion}.`
              );
            }
            persisted = await importLocalizationResult({
              manifestItem: item,
              response: normalized.normalized,
              detectedFormat: normalized.detectedFormat,
              deprecationDiagnostics: normalized.deprecationDiagnostics,
              sourceFile,
              facts,
              config,
            });
          }
          persistedFiles.push(...persisted);
          await persistStoryProductionStage(cacheDir, sourceFile, "completed");
          nextItems.push({
            ...item,
            status: "persisted",
            resultImportedAt: new Date().toISOString(),
            ...(line.response?.body.usage
              ? {
                  usage: {
                    inputTokens: line.response.body.usage.input_tokens ?? 0,
                    outputTokens: line.response.body.usage.output_tokens ?? 0,
                    ...(line.response.body.usage.input_tokens_details
                      ?.cached_tokens !== undefined
                      ? {
                          cachedInputTokens:
                            line.response.body.usage.input_tokens_details
                              .cached_tokens,
                        }
                      : {}),
                  },
                }
              : {}),
          });
        } catch (error) {
          failedItemCount += 1;
          await persistStoryProductionStage(cacheDir, sourceFile, "failed");
          nextItems.push({
            ...item,
            status:
              error instanceof StoryLocalizationSchemaError
                ? "schema-invalid"
                : error instanceof StoryLocalizationValidationError
                  ? "content-invalid"
                  : "api-failed",
            error: {
              message: error instanceof Error ? error.message : String(error),
            },
          });
        }
      }
      const report = {
        localBatchId: refreshed.localBatchId,
        importedAt: new Date().toISOString(),
        totalItems: refreshed.items.length,
        failedItemCount,
        unexpectedCustomIds,
        persistedFiles: persistedFiles.map((filePath) =>
          toRepositoryRelativePath(filePath)
        ),
      };
      await writeJsonAtomic(reportFilePath, report);
      const nextManifest: LocalBatchManifest = {
        ...refreshed,
        updatedAt: new Date().toISOString(),
        status: failedItemCount > 0 ? "imported_with_failures" : "imported",
        importedAt: new Date().toISOString(),
        items: nextItems,
        resultFilePath: toRepositoryRelativePath(resultFilePath),
        ...(errorText
          ? { errorFilePath: toRepositoryRelativePath(errorFilePath) }
          : {}),
        reportFilePath: toRepositoryRelativePath(reportFilePath),
      };
      await saveLocalBatchManifest(layout, nextManifest);
      await index.upsert(
        entryFromLocalBatchManifest(config.outputDirectory, nextManifest)
      );
      return {
        localBatchId: refreshed.localBatchId,
        importedItemCount: refreshed.items.length - failedItemCount,
        failedItemCount,
        persistedFiles,
        status: failedItemCount > 0 ? "imported_with_failures" : "imported",
      };
    }
  );
}

export async function listStoryBatches(
  outputDirectory: string,
  kind: "all" | "latest" | "pending" | "ready" | "failed" | "expired"
): Promise<readonly BatchIndexEntry[]> {
  const index = new StoryBatchIndexService(outputDirectory);
  await index.initialize();
  switch (kind) {
    case "all":
      return index.list();
    case "latest": {
      const latest = await index.getLatest();
      return latest ? [latest] : [];
    }
    case "pending":
      return index.list({
        statuses: [
          "prepared",
          "submitted",
          "validating",
          "in_progress",
          "finalizing",
        ],
      });
    case "ready":
      return index.list({ requiresImport: true });
    case "failed":
      return index.list({
        statuses: ["failed", "partially_completed", "imported_with_failures"],
      });
    case "expired":
      return index.list({ statuses: ["expired"] });
    default:
      return [];
  }
}

export async function importReadyStoryBatches(
  config: StoryLocalizationConfig,
  client: OpenAiStoryClient
): Promise<readonly BatchImportResult[]> {
  const index = new StoryBatchIndexService(config.outputDirectory);
  await index.initialize();
  const ready = await index.list({ requiresImport: true });
  const results: BatchImportResult[] = [];
  for (const entry of ready) {
    try {
      results.push(
        await importStoryLocalizationBatch(entry.localBatchId, config, client)
      );
    } catch {
      continue;
    }
  }
  return results;
}

export async function refreshActiveStoryBatches(
  config: StoryLocalizationConfig,
  client: OpenAiStoryClient
): Promise<readonly LocalBatchManifest[]> {
  const index = new StoryBatchIndexService(config.outputDirectory);
  await index.initialize();
  const active = await index.list({
    statuses: ["submitted", "validating", "in_progress", "finalizing"],
  });
  const refreshed: LocalBatchManifest[] = [];
  for (const entry of active) {
    refreshed.push(
      await refreshStoryLocalizationBatch(entry.localBatchId, config, client)
    );
  }
  return refreshed;
}

export async function retryFailedStoryBatch(
  batchRef: string,
  config: StoryLocalizationConfig
): Promise<BatchPreparationResult> {
  const layout = await ensureBatchStorageLayout(config.outputDirectory);
  const index = new StoryBatchIndexService(config.outputDirectory);
  await index.initialize();
  const entry =
    (await index.getByLocalBatchId(batchRef)) ??
    (await index.getByOpenAIBatchId(batchRef));
  if (!entry) {
    throw new Error(`Unknown batch ${batchRef}`);
  }
  const manifest = await readLocalBatchManifest(layout, entry.localBatchId);
  if (!manifest) {
    throw new Error(`Missing manifest for ${entry.localBatchId}`);
  }
  const retryable = manifest.items.filter((item) =>
    [
      "api-failed",
      "expired",
      "schema-invalid",
      "content-invalid",
      "repair-required",
    ].includes(item.status)
  );
  const { requestItems, manifestItems } = await buildRetryBatchItems({
    manifest,
    retryableItems: retryable,
    config,
  });
  const localBatchId = await createLocalBatchId(layout);
  const inputPath = inputPathFor(layout, localBatchId);
  const jsonl = serializeBatchRequestLines(requestItems);
  await writeTextAtomic(inputPath, jsonl);
  const nextManifest: LocalBatchManifest = {
    ...createBaseManifest({
      localBatchId,
      rootLocalBatchId: manifest.rootLocalBatchId,
      parentLocalBatchId: manifest.localBatchId,
      retryNumber: manifest.retryNumber + 1,
      model: config.model,
      inputFilePath: inputPath,
      inputFileHash: await hashFile(inputPath),
      items: manifestItems,
    }),
    rootLocalBatchId: manifest.rootLocalBatchId,
    parentLocalBatchId: manifest.localBatchId,
    retryNumber: manifest.retryNumber + 1,
  };
  await saveLocalBatchManifest(layout, nextManifest);
  await index.upsert(
    entryFromLocalBatchManifest(config.outputDirectory, nextManifest)
  );
  return {
    localBatchId,
    manifestPath: manifestPathFor(layout, localBatchId),
    inputFilePath: inputPath,
    itemCount: requestItems.length,
    skippedCachedItemCount: 0,
  };
}

export async function cancelStoryBatch(
  batchRef: string,
  config: StoryLocalizationConfig,
  client: OpenAiStoryClient
): Promise<LocalBatchManifest> {
  requireBatchCapabilities(client);
  const layout = await ensureBatchStorageLayout(config.outputDirectory);
  const index = new StoryBatchIndexService(config.outputDirectory);
  const entry =
    (await index.getByLocalBatchId(batchRef)) ??
    (await index.getByOpenAIBatchId(batchRef));
  if (!entry?.openAIBatchId) {
    throw new Error(`Unable to resolve submitted batch ${batchRef}.`);
  }
  await client.batches.cancel(entry.openAIBatchId);
  const manifest = await readLocalBatchManifest(layout, entry.localBatchId);
  if (!manifest) {
    throw new Error(`Missing manifest for ${entry.localBatchId}.`);
  }
  const nextManifest: LocalBatchManifest = {
    ...manifest,
    updatedAt: new Date().toISOString(),
    status: "cancelling",
  };
  await saveLocalBatchManifest(layout, nextManifest);
  await index.upsert(
    entryFromLocalBatchManifest(config.outputDirectory, nextManifest)
  );
  return nextManifest;
}

export async function runStoryLocalizationInBatchMode(
  sourceFiles: readonly string[],
  config: StoryLocalizationConfig,
  options: {
    readonly client?: OpenAiStoryClient;
    readonly logger?: ReturnType<typeof createLogger>;
  } = {}
): Promise<StoryLocalizationRunResult> {
  const logger =
    options.logger ?? createLogger(config.verbose ? "debug" : "info");
  const client = options.client;
  const preparation = await prepareStoryLocalizationBatch(sourceFiles, config);
  logger.info(
    { episodeId: preparation.localBatchId } satisfies LoggerContext,
    "prepared story localization batch"
  );
  if (!config.submit || preparation.itemCount === 0) {
    return {
      counts: {
        discovered: sourceFiles.length,
        copiedEnglishFull: 0,
        generatedEnglishShort: 0,
        generatedGermanFull: 0,
        generatedGermanShort: 0,
        generatedSpanishFull: 0,
        generatedSpanishShort: 0,
        generatedFrenchFull: 0,
        generatedFrenchShort: 0,
        generatedPortugueseFull: 0,
        generatedPortugueseShort: 0,
        skipped: preparation.skippedCachedItemCount,
        cacheHits: 0,
        repairAttempts: 0,
        failures: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        estimatedTotalCostUsd: 0,
        totalExecutionTimeMs: 0,
      },
      results: [
        {
          episodeNumber: "",
          slug: preparation.localBatchId,
          sourceFile: preparation.inputFilePath,
          generatedFiles: [],
          skippedFiles: [],
          cacheHit: preparation.skippedCachedItemCount > 0,
          repairAttempts: 0,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: 0,
        },
      ],
    };
  }
  if (!client) {
    throw new StoryLocalizationConfigurationError(
      "A client is required for batch submission."
    );
  }
  const submitted = await submitStoryLocalizationBatch(
    preparation.localBatchId,
    config,
    client
  );
  logger.info(
    { episodeId: submitted.localBatchId } satisfies LoggerContext,
    "submitted story localization batch"
  );
  if (!config.waitForBatch) {
    return {
      counts: {
        discovered: sourceFiles.length,
        copiedEnglishFull: 0,
        generatedEnglishShort: 0,
        generatedGermanFull: 0,
        generatedGermanShort: 0,
        generatedSpanishFull: 0,
        generatedSpanishShort: 0,
        generatedFrenchFull: 0,
        generatedFrenchShort: 0,
        generatedPortugueseFull: 0,
        generatedPortugueseShort: 0,
        skipped: preparation.skippedCachedItemCount,
        cacheHits: 0,
        repairAttempts: 0,
        failures: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        estimatedTotalCostUsd: 0,
        totalExecutionTimeMs: 0,
      },
      results: [
        {
          episodeNumber: "",
          slug: submitted.localBatchId,
          sourceFile: preparation.inputFilePath,
          generatedFiles: [],
          skippedFiles: [],
          cacheHit: false,
          repairAttempts: 0,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: 0,
        },
      ],
    };
  }
  while (true) {
    const refreshed = await refreshStoryLocalizationBatch(
      submitted.localBatchId,
      config,
      client
    );
    if (
      ["completed", "failed", "expired", "cancelled"].includes(refreshed.status)
    ) {
      if (
        config.autoImport &&
        ["completed", "failed", "expired", "cancelled"].includes(
          refreshed.status
        )
      ) {
        await importStoryLocalizationBatch(
          submitted.localBatchId,
          config,
          client
        );
      }
      break;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, config.pollIntervalSeconds * 1000)
    );
  }
  return {
    counts: {
      discovered: sourceFiles.length,
      copiedEnglishFull: 0,
      generatedEnglishShort: 0,
      generatedGermanFull: 0,
      generatedGermanShort: 0,
      generatedSpanishFull: 0,
      generatedSpanishShort: 0,
      generatedFrenchFull: 0,
      generatedFrenchShort: 0,
      generatedPortugueseFull: 0,
      generatedPortugueseShort: 0,
      skipped: preparation.skippedCachedItemCount,
      cacheHits: 0,
      repairAttempts: 0,
      failures: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      estimatedTotalCostUsd: 0,
      totalExecutionTimeMs: 0,
    },
    results: [],
  };
}
