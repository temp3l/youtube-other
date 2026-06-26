import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  ensureDir,
  fileExists,
  hashFile,
  readJsonIfExists,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import { createLogger, type LoggerContext } from "@mediaforge/observability";
import { extractCanonicalStoryFacts } from "./canonical-facts.service.js";
import {
  detectForbiddenPhrases,
  detectGenericFiller,
  validateGeneratedStoryPackage,
} from "./generated-story-validator.js";
import { getLanguageProfile } from "./language-profiles.js";
import {
  buildCompactStorySource,
  buildLocalizationPrompt,
} from "./localization-prompt-builder.js";
import {
  parseBatchOutputJsonl,
  type OpenAiBatchOutputLine,
  type OpenAiStoryClient,
  readRemoteFileText,
  requireBatchCapabilities,
} from "./story-localization-openai-batch.js";
import {
  batchIndexFileSchema,
  EnglishGeneratedStoryPackageSchema,
  generatedStoryPackageSchema,
} from "./story-localization.schemas.js";
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
  resolveCacheDirectory,
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
import {
  renderLocalizedFullStory,
  renderLocalizedShort,
} from "./story-markdown-renderer.js";
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
  writeTextAtomicIfChanged,
} from "./story-localization.utils.js";

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

function buildCacheKey(args: {
  readonly sourceHash: string;
  readonly language: LanguageCode;
  readonly adaptationMode: StoryLocalizationConfig["adaptationMode"];
  readonly model: string;
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
    args.promptVersion,
    JSON.stringify(profile.shortWordRange),
    String(args.shortWpm),
    String(args.shortMinSeconds),
    String(args.shortMaxSeconds),
  ]);
}

function estimatePromptTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
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
} {
  return {
    full: path.join(outputDirectory, `${slug}-${language}-full.md`),
    short: path.join(outputDirectory, `${slug}-${language}-short.md`),
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

function parseGeneratedPackage(
  json: unknown,
  language: LanguageCode
): GeneratedStoryPackage {
  const parsed = generatedStoryPackageSchema.parse(json);
  if (parsed.language !== language) {
    throw new StoryLocalizationSchemaError(
      `Expected language ${language}, received ${parsed.language}.`
    );
  }
  return parsed as GeneratedStoryPackage;
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

function englishShortBody(
  config: StoryLocalizationConfig,
  sourceFile: Awaited<ReturnType<typeof parseCanonicalSourceStory>>,
  facts: CanonicalStoryFacts
): Record<string, unknown> {
  const prompt = buildLocalizationPrompt({
    languageProfile: getLanguageProfile("en"),
    adaptationMode: config.adaptationMode,
    sourceStory: sourceFile,
    canonicalFacts: facts,
    target: "short",
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
    temperature: 0.4,
  };
}

function localizationBody(
  config: StoryLocalizationConfig,
  language: Exclude<LanguageCode, "en">,
  sourceFile: Awaited<ReturnType<typeof parseCanonicalSourceStory>>,
  facts: CanonicalStoryFacts
): Record<string, unknown> {
  const prompt = buildLocalizationPrompt({
    languageProfile: getLanguageProfile(language),
    adaptationMode: config.adaptationMode,
    sourceStory: sourceFile,
    canonicalFacts: facts,
    target: "full",
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
    text: { format: responseSchemaForLanguage(language) },
    max_output_tokens: 6000,
    temperature: 0.4,
  };
}

function buildManifestItem(args: {
  readonly customId: string;
  readonly parsed: Awaited<ReturnType<typeof parseCanonicalSourceStory>>;
  readonly operation: StoryBatchItem["metadata"]["operation"];
  readonly configurationHash: string;
  readonly promptVersion: string;
  readonly plannedOutputPaths: readonly string[];
  readonly estimatedInputTokens: number;
  readonly language?: LanguageCode;
}): LocalBatchManifestItem {
  return {
    customId: args.customId,
    episodeNumber: args.parsed.episodeNumber,
    ...(args.language ? { language: args.language } : {}),
    operation: args.operation,
    sourcePath: toRepositoryRelativePath(args.parsed.sourceFile),
    sourceHash: args.parsed.sourceHash,
    promptVersion: args.promptVersion,
    configurationHash: args.configurationHash,
    plannedOutputPaths: args.plannedOutputPaths,
    estimatedInputTokens: args.estimatedInputTokens,
    status: "planned",
  };
}

function buildEnglishShortBatchItem(args: {
  readonly parsed: Awaited<ReturnType<typeof parseCanonicalSourceStory>>;
  readonly facts: CanonicalStoryFacts;
  readonly config: StoryLocalizationConfig;
  readonly configurationHash: string;
  readonly retryNumber?: number;
}): {
  readonly requestItem: StoryBatchItem;
  readonly manifestItem: LocalBatchManifestItem;
} {
  const body = englishShortBody(args.config, args.parsed, args.facts);
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
    manifestItem: buildManifestItem({
      customId,
      parsed: args.parsed,
      language: "en",
      operation: "english-short",
      configurationHash: args.configurationHash,
      promptVersion: args.config.promptVersion,
      plannedOutputPaths: [
        toRepositoryRelativePath(outputFiles.full),
        toRepositoryRelativePath(outputFiles.short),
      ],
      estimatedInputTokens: estimatePromptTokens(JSON.stringify(body)),
    }),
  };
}

function buildLocalizationBatchItem(args: {
  readonly parsed: Awaited<ReturnType<typeof parseCanonicalSourceStory>>;
  readonly facts: CanonicalStoryFacts;
  readonly config: StoryLocalizationConfig;
  readonly language: Exclude<LanguageCode, "en">;
  readonly configurationHash: string;
  readonly retryNumber?: number;
}): {
  readonly requestItem: StoryBatchItem;
  readonly manifestItem: LocalBatchManifestItem;
} {
  const body = localizationBody(
    args.config,
    args.language,
    args.parsed,
    args.facts
  );
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
        configurationHash: args.configurationHash,
      },
    },
    manifestItem: buildManifestItem({
      customId,
      parsed: args.parsed,
      language: args.language,
      operation: "localization",
      configurationHash: args.configurationHash,
      promptVersion: args.config.promptVersion,
      plannedOutputPaths: [
        toRepositoryRelativePath(outputFiles.full),
        toRepositoryRelativePath(outputFiles.short),
      ],
      estimatedInputTokens: estimatePromptTokens(JSON.stringify(body)),
    }),
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
  const cacheDir = resolveCacheDirectory(config.outputDirectory);
  await ensureDir(cacheDir);
  const requestItems: StoryBatchItem[] = [];
  const manifestItems: LocalBatchManifestItem[] = [];
  let skippedCachedItemCount = 0;
  for (const sourcePath of sourceFiles) {
    const parsed = await parseCanonicalSourceStory(sourcePath);
    const facts = extractCanonicalStoryFacts(parsed);
    await ensureCachedFacts(cacheDir, parsed.sourceHash, facts);
    if (config.includeEnglishShort) {
      const configHash = buildCacheKey({
        sourceHash: parsed.sourceHash,
        language: "en",
        adaptationMode: config.adaptationMode,
        model: config.model,
        promptVersion: config.promptVersion,
        shortWpm: config.shortWpm,
        shortMinSeconds: config.shortMinSeconds,
        shortMaxSeconds: config.shortMaxSeconds,
      });
      const outputFiles = buildOutputFiles(
        config.outputDirectory,
        parsed.slug,
        "en"
      );
      const cacheEntry = await readLocalizationCacheEntry(
        cacheDir,
        parsed.sourceHash,
        configHash
      );
      if (cacheEntry && (await fileExists(outputFiles.short))) {
        skippedCachedItemCount += 1;
      } else {
        const item = buildEnglishShortBatchItem({
          parsed,
          facts,
          config,
          configurationHash: configHash,
        });
        requestItems.push(item.requestItem);
        manifestItems.push(item.manifestItem);
      }
    }
    for (const language of config.languages) {
      const configHash = buildCacheKey({
        sourceHash: parsed.sourceHash,
        language,
        adaptationMode: config.adaptationMode,
        model: config.model,
        promptVersion: config.promptVersion,
        shortWpm: config.shortWpm,
        shortMinSeconds: config.shortMinSeconds,
        shortMaxSeconds: config.shortMaxSeconds,
      });
      const outputFiles = buildOutputFiles(
        config.outputDirectory,
        parsed.slug,
        language
      );
      const cacheEntry = await readLocalizationCacheEntry(
        cacheDir,
        parsed.sourceHash,
        configHash
      );
      if (
        cacheEntry &&
        (await fileExists(outputFiles.full)) &&
        (await fileExists(outputFiles.short))
      ) {
        skippedCachedItemCount += 1;
        continue;
      }
      const item = buildLocalizationBatchItem({
        parsed,
        facts,
        config,
        language,
        configurationHash: configHash,
      });
      requestItems.push(item.requestItem);
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
    const facts = extractCanonicalStoryFacts(parsed);
    if (retryItem.operation === "english-short") {
      const item = buildEnglishShortBatchItem({
        parsed,
        facts,
        config: args.config,
        configurationHash: retryItem.configurationHash,
        retryNumber: nextRetryNumber,
      });
      requestItems.push(item.requestItem);
      manifestItems.push(item.manifestItem);
      continue;
    }
    if (retryItem.language && retryItem.language !== "en") {
      const item = buildLocalizationBatchItem({
        parsed,
        facts,
        config: args.config,
        language: retryItem.language,
        configurationHash: retryItem.configurationHash,
        retryNumber: nextRetryNumber,
      });
      requestItems.push(item.requestItem);
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
    items: manifest.items.map((item) => ({ ...item, status: "submitted" })),
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
  const cacheDir = resolveCacheDirectory(args.config.outputDirectory);
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
  readonly packageValue: GeneratedStoryPackage;
  readonly sourceFile: Awaited<ReturnType<typeof parseCanonicalSourceStory>>;
  readonly facts: CanonicalStoryFacts;
  readonly config: StoryLocalizationConfig;
}): Promise<readonly string[]> {
  const language = args.manifestItem.language;
  if (!language || language === "en") {
    throw new Error("Localization import requires a non-English language.");
  }
  const issues = validateGeneratedStoryPackage(
    args.packageValue,
    args.facts,
    getLanguageProfile(language),
    args.sourceFile,
    language
  );
  if (issues.length > 0) {
    throw new StoryLocalizationValidationError(issues.join("; "));
  }
  if (!args.packageValue.full) {
    throw new StoryLocalizationSchemaError(
      `Missing full story payload for ${language}.`
    );
  }
  const outputFiles = buildOutputFiles(
    args.config.outputDirectory,
    args.sourceFile.slug,
    language
  );
  const fullWrite = await writeTextAtomicIfChanged(
    outputFiles.full,
    renderLocalizedFullStory(
      args.sourceFile.episodeNumber,
      args.packageValue.full,
      language
    ),
    true
  );
  const shortWrite = await writeTextAtomicIfChanged(
    outputFiles.short,
    renderLocalizedShort(
      args.sourceFile.episodeNumber,
      args.packageValue.short,
      language
    ),
    true
  );
  const cacheDir = resolveCacheDirectory(args.config.outputDirectory);
  await writeLocalizationCacheEntry(cacheDir, {
    sourceFile: args.sourceFile.sourceFile,
    sourceHash: args.sourceFile.sourceHash,
    configurationHash: args.manifestItem.configurationHash,
    promptVersion: args.config.promptVersion,
    model: args.config.model,
    language,
    generatedAt: new Date().toISOString(),
    outputFiles: [outputFiles.full, outputFiles.short],
  });
  return [
    ...(fullWrite === "written" ? [outputFiles.full] : []),
    ...(shortWrite === "written" ? [outputFiles.short] : []),
  ];
}

function lineByCustomId(
  lines: readonly OpenAiBatchOutputLine[]
): Map<string, OpenAiBatchOutputLine> {
  return new Map(lines.map((line) => [line.custom_id, line]));
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
      const persistedFiles: string[] = [];
      let failedItemCount = 0;
      const nextItems: LocalBatchManifestItem[] = [];
      for (const item of refreshed.items) {
        const sourceFile = await parseCanonicalSourceStory(
          fromRepositoryRelativePath(item.sourcePath)
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
          const outputTextValue = line.response?.body.output_text;
          if (!outputTextValue) {
            throw new StoryLocalizationSchemaError(
              `Batch item missing output_text: ${item.customId}`
            );
          }
          const parsedJson = JSON.parse(outputTextValue) as unknown;
          const persisted =
            item.operation === "english-short"
              ? await importEnglishShortResult({
                  manifestItem: item,
                  payload: parseEnglishPackage(parsedJson),
                  sourceFile,
                  facts,
                  config,
                })
              : await importLocalizationResult({
                  manifestItem: item,
                  packageValue: parseGeneratedPackage(
                    parsedJson,
                    item.language ?? "en"
                  ),
                  sourceFile,
                  facts,
                  config,
                });
          persistedFiles.push(...persisted);
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
