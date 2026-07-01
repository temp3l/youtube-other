import path from "node:path";
import { Command } from "commander";
import {
  commandEpisodeBootstrapCharacters,
  commandEpisodeSyncCharacters,
} from "./episode-commands.js";
import { commandImagesResume } from "./images-resume-command.js";
import { loadRuntimeConfig } from "@mediaforge/config";
import { registerStoryRewriteShortCommand } from "./story-short-rewrite-command.js";
import { registerStoryRewriteFullCommand } from "./story-full-rewrite-command.js";
import { registerStoryAnalysisCommand } from "./story-analysis-command.js";
import { registerStoryPipelineCommand } from "./story-pipeline-command.js";
import {
  cancelStoryBatch,
  createOpenAiStoryClient,
  createStoryLocalizationConfig,
  discoverCanonicalSourceStories,
  importReadyStoryBatches,
  importStoryLocalizationBatch,
  getLanguageProfile,
  isShortLanguage,
  localizeStoryEpisode,
  parseCanonicalSourceStory,
  prepareStoryLocalizationBatch,
  refreshActiveStoryBatches,
  refreshStoryLocalizationBatch,
  retryFailedStoryBatch,
  resolveDefaultOutputDirectory,
  resolveDefaultSourceDirectory,
  selectSourceCandidates,
  submitStoryLocalizationBatch,
  StoryBatchIndexService,
  DEFAULT_STORY_REWRITE_MODEL,
  DEFAULT_FULL_REWRITE_MAX_OUTPUT_TOKENS,
  DEFAULT_FULL_REWRITE_RETRY_MAX_OUTPUT_TOKENS,
  DEFAULT_STORY_REWRITE_REASONING_EFFORT,
  SHORT_REWRITE_DEFAULT_TEMPERATURE,
  validateGeneratedStories,
  type LanguageCode,
  type StoryLocalizationEpisodeResult,
  type StoryLocalizationRunCounts,
} from "@mediaforge/story-localization";
import { createLogger } from "@mediaforge/observability";
import {
  ensureDir,
  fileExists,
  normalizeLocaleCode,
  normalizeWhitespace,
} from "@mediaforge/shared";
import fs from "node:fs/promises";

export interface StoryLocalizationCliOptions {
  readonly all?: boolean;
  readonly file?: string;
  readonly episode?: string;
  readonly sourceDir?: string;
  readonly outputDir?: string;
  readonly languages?: string;
  readonly includeEnglishShort?: boolean;
  readonly mode?: "batch" | "sync";
  readonly adaptationMode?: "faithful" | "retention-optimized";
  readonly shortMinSeconds?: number;
  readonly shortMaxSeconds?: number;
  readonly shortWpm?: number;
  readonly concurrency?: number;
  readonly model?: string;
  readonly fallbackToSync?: boolean;
  readonly force?: boolean;
  readonly submit?: boolean;
  readonly prepareBatch?: boolean;
  readonly wait?: boolean;
  readonly autoImport?: boolean;
  readonly pollIntervalSeconds?: number;
  readonly dryRun?: boolean;
  readonly validateOnly?: boolean;
  readonly verbose?: boolean;
}

export interface StoryBatchCliOptions {
  readonly batch?: string;
  readonly episode?: string;
  readonly outputDir?: string;
  readonly sourceDir?: string;
  readonly languages?: string;
  readonly model?: string;
  readonly repair?: boolean;
  readonly verbose?: boolean;
}

export interface StoryBootstrapSharedCliOptions {
  readonly episode?: string;
  readonly source?: string;
  readonly outputRoot?: string;
  readonly approve?: boolean;
  readonly force?: boolean;
  readonly json?: boolean;
  readonly verbose?: boolean;
}

function parseLanguages(
  value: string | undefined
): readonly Exclude<LanguageCode, "en">[] {
  if (!value) {
    return ["de", "es", "fr", "pt"];
  }
  const parsed = value
    .split(",")
    .map((entry) => normalizeWhitespace(entry).toLowerCase())
    .filter(Boolean)
    .map((entry) => normalizeLocaleCode(entry))
    .filter((entry): entry is Exclude<LanguageCode, "en"> =>
      isShortLanguage(entry)
    );
  return [...new Set(parsed)];
}

function resolveSelection(
  options: StoryLocalizationCliOptions,
  discovered: Awaited<ReturnType<typeof discoverCanonicalSourceStories>>
): Awaited<ReturnType<typeof discoverCanonicalSourceStories>> {
  const selection: { file?: string; episode?: string; slug?: string } = {};
  if (options.file) {
    selection.file = options.file;
  }
  if (options.episode) {
    selection.episode = options.episode;
    selection.slug = options.episode;
  }
  const selected = selectSourceCandidates(discovered, selection);
  if (options.all || (!options.file && !options.episode)) {
    return discovered;
  }
  return selected;
}

export async function buildCommandConfig(
  options: StoryLocalizationCliOptions
): Promise<ReturnType<typeof createStoryLocalizationConfig>> {
  const runtimeConfig = await loadRuntimeConfig();
  const rawArgs = new Set(process.argv.slice(2));
  const commandText = [
    process.env["MEDIAFORGE_NPM_SCRIPT_COMMAND"] ?? "",
    process.argv.join(" "),
  ].join(" ");
  const hasDryRunFlag =
    rawArgs.has("--dry-run") || commandText.includes("--dry-run");
  const hasValidateOnlyFlag =
    rawArgs.has("--validate-only") || commandText.includes("--validate-only");
  return createStoryLocalizationConfig({
    sourceDirectory: options.sourceDir ?? resolveDefaultSourceDirectory(),
    outputDirectory: options.outputDir ?? resolveDefaultOutputDirectory(),
    languages: parseLanguages(options.languages),
    includeEnglishShort: options.includeEnglishShort ?? true,
    processingMode: options.mode ?? "batch",
    adaptationMode: options.adaptationMode ?? "retention-optimized",
    shortMinSeconds: options.shortMinSeconds ?? 55,
    shortMaxSeconds: options.shortMaxSeconds ?? 65,
    shortWpm: options.shortWpm ?? 180,
    concurrency: options.concurrency ?? 2,
    model:
      options.model ??
      runtimeConfig.openAiLocalizationModel ??
      DEFAULT_STORY_REWRITE_MODEL,
    temperature: SHORT_REWRITE_DEFAULT_TEMPERATURE,
    reasoningEffort:
      runtimeConfig.openAiLocalizationReasoningEffort ??
      DEFAULT_STORY_REWRITE_REASONING_EFFORT,
    maxOutputTokens:
      runtimeConfig.openAiLocalizationMaxOutputTokens ??
      DEFAULT_FULL_REWRITE_MAX_OUTPUT_TOKENS,
    retryMaxOutputTokens:
      runtimeConfig.openAiLocalizationMaxOutputTokens ??
      DEFAULT_FULL_REWRITE_RETRY_MAX_OUTPUT_TOKENS,
    repairModel:
      options.model ??
      runtimeConfig.openAiLocalizationModel ??
      DEFAULT_STORY_REWRITE_MODEL,
    repairReasoningEffort:
      runtimeConfig.openAiLocalizationReasoningEffort ??
      DEFAULT_STORY_REWRITE_REASONING_EFFORT,
    repairMaxOutputTokens:
      runtimeConfig.openAiLocalizationMaxOutputTokens ??
      DEFAULT_FULL_REWRITE_RETRY_MAX_OUTPUT_TOKENS,
    fallbackToSync: options.fallbackToSync ?? false,
    force: options.force ?? false,
    submit: options.submit ?? false,
    prepareBatch: options.prepareBatch ?? false,
    waitForBatch: options.wait ?? false,
    autoImport: options.autoImport ?? false,
    pollIntervalSeconds: options.pollIntervalSeconds ?? 60,
    dryRun: options.dryRun || hasDryRunFlag,
    validateOnly: options.validateOnly || hasValidateOnlyFlag,
    verbose: options.verbose ?? false,
  });
}

async function printDryRunSummary(
  selected: ReadonlyArray<{
    readonly filePath: string;
    readonly episodeNumber: string;
    readonly slug: string;
  }>,
  config: ReturnType<typeof createStoryLocalizationConfig>
): Promise<void> {
  const planned = selected.map((candidate) => {
    const episodeRoot = path.join(
      config.outputDirectory,
      `${candidate.episodeNumber}-${candidate.slug}`
    );
    const files = [
      path.join(episodeRoot, "en", "full", "script.md"),
      path.join(episodeRoot, "script.md"),
      ...(config.includeEnglishShort
        ? [path.join(episodeRoot, "en", "short", "script.md")]
        : []),
      ...config.languages.flatMap((language: Exclude<LanguageCode, "en">) => [
        path.join(episodeRoot, language, "full", "script.md"),
        path.join(episodeRoot, language, "short", "script.md"),
      ]),
    ];
    return {
      episodeNumber: candidate.episodeNumber,
      slug: candidate.slug,
      sourceFile: candidate.filePath,
      outputFiles: files,
      apiCalls:
        1 + config.languages.length + (config.includeEnglishShort ? 1 : 0),
    };
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        dryRun: true,
        sourceDirectory: config.sourceDirectory,
        outputDirectory: config.outputDirectory,
        languages: config.languages,
        planned,
        estimatedApiCalls: planned.reduce(
          (total, item) => total + item.apiCalls,
          0
        ),
      },
      null,
      2
    )}\n`
  );
}

async function runValidateOnly(outputDirectory: string): Promise<void> {
  const issues = await validateGeneratedStories(outputDirectory);
  process.stdout.write(
    `${JSON.stringify(
      {
        validateOnly: true,
        outputDirectory,
        issues,
        ok: issues.length === 0,
      },
      null,
      2
    )}\n`
  );
}

function summarizeResults(
  results: readonly StoryLocalizationEpisodeResult[],
  config: ReturnType<typeof createStoryLocalizationConfig>
): Record<string, unknown> {
  const summary = {
    sourceDirectory: config.sourceDirectory,
    outputDirectory: config.outputDirectory,
    discovered: results.length,
    copiedEnglishFull: results.filter((result) => result.copiedEnglishFull)
      .length,
    englishShorts: results.filter((result: StoryLocalizationEpisodeResult) =>
      result.generatedFiles.some((file: string) =>
        file.endsWith(path.join("en", "short", "script.md"))
      )
    ).length,
    germanFull: results.filter((result: StoryLocalizationEpisodeResult) =>
      result.generatedFiles.some((file: string) =>
        file.endsWith(path.join("de", "full", "script.md"))
      )
    ).length,
    germanShort: results.filter((result: StoryLocalizationEpisodeResult) =>
      result.generatedFiles.some((file: string) =>
        file.endsWith(path.join("de", "short", "script.md"))
      )
    ).length,
    spanishFull: results.filter((result: StoryLocalizationEpisodeResult) =>
      result.generatedFiles.some((file: string) =>
        file.endsWith(path.join("es", "full", "script.md"))
      )
    ).length,
    spanishShort: results.filter((result: StoryLocalizationEpisodeResult) =>
      result.generatedFiles.some((file: string) =>
        file.endsWith(path.join("es", "short", "script.md"))
      )
    ).length,
    frenchFull: results.filter((result: StoryLocalizationEpisodeResult) =>
      result.generatedFiles.some((file: string) =>
        file.endsWith(path.join("fr", "full", "script.md"))
      )
    ).length,
    frenchShort: results.filter((result: StoryLocalizationEpisodeResult) =>
      result.generatedFiles.some((file: string) =>
        file.endsWith(path.join("fr", "short", "script.md"))
      )
    ).length,
    portugueseFull: results.filter((result: StoryLocalizationEpisodeResult) =>
      result.generatedFiles.some((file: string) =>
        file.endsWith(path.join("pt", "full", "script.md"))
      )
    ).length,
    portugueseShort: results.filter((result: StoryLocalizationEpisodeResult) =>
      result.generatedFiles.some((file: string) =>
        file.endsWith(path.join("pt", "short", "script.md"))
      )
    ).length,
    skippedFiles: results.flatMap((result) => result.skippedFiles),
    cacheHits: results.filter((result) => result.cacheHit).length,
    repairAttempts: results.reduce(
      (total, result) => total + result.repairAttempts,
      0
    ),
    failures: results.filter((result) => result.failure).length,
    totalInputTokens: results.reduce(
      (total, result) => total + result.inputTokens,
      0
    ),
    totalOutputTokens: results.reduce(
      (total, result) => total + result.outputTokens,
      0
    ),
    estimatedTotalCostUsd: results.reduce(
      (total, result) => total + (result.estimatedCostUsd ?? 0),
      0
    ),
  };
  return summary;
}

async function localizeSelectedStories(
  selected: ReadonlyArray<{
    readonly filePath: string;
    readonly episodeNumber: string;
    readonly slug: string;
  }>,
  config: ReturnType<typeof createStoryLocalizationConfig>,
  logger: ReturnType<typeof createLogger>
): Promise<{
  readonly counts: StoryLocalizationRunCounts;
  readonly results: readonly StoryLocalizationEpisodeResult[];
}> {
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
  const started = Date.now();

  for (const candidate of selected) {
    try {
      const episodeResult = await localizeStoryEpisode(candidate.filePath, config, {
        logger,
        preflightConnectivity: true,
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
      discovered: selected.length,
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

export async function commandStoriesLocalize(
  options: StoryLocalizationCliOptions
): Promise<void> {
  const config = await buildCommandConfig(options);
  const logger = createLogger(config.verbose ? "debug" : "info");
  await ensureDir(config.outputDirectory);
  const discovered = await discoverCanonicalSourceStories(
    config.sourceDirectory
  );
  const selected = resolveSelection(options, discovered);
  if (options.validateOnly) {
    await runValidateOnly(config.outputDirectory);
    return;
  }
  if (options.dryRun) {
    await printDryRunSummary(selected, config);
    return;
  }
  if (config.processingMode === "batch") {
    if (config.prepareBatch || config.submit) {
      const batch = await prepareStoryLocalizationBatch(
        selected.map((candidate) => candidate.filePath),
        config
      );
      process.stdout.write(
        `${JSON.stringify(
          {
            mode: "batch",
            prepared: true,
            localBatchId: batch.localBatchId,
            manifestPath: batch.manifestPath,
            inputFilePath: batch.inputFilePath,
            itemCount: batch.itemCount,
            skippedCachedItemCount: batch.skippedCachedItemCount,
          },
          null,
          2
        )}\n`
      );
      if (config.submit) {
        const submitted = await submitStoryLocalizationBatch(
          batch.localBatchId,
          config,
          createOpenAiStoryClient()
        );
        process.stdout.write(
          `${JSON.stringify(
            {
              submitted: true,
              localBatchId: submitted.localBatchId,
              openAIBatchId: submitted.openAIBatchId,
              nextCommands: {
                status: `npm run stories:batches -- status --batch ${submitted.localBatchId}`,
                import: `npm run stories:batches -- import --batch ${submitted.localBatchId}`,
              },
            },
            null,
            2
          )}\n`
        );
      }
      return;
    }
  }
  const run = await localizeSelectedStories(selected, config, logger);
  process.stdout.write(
    `Story localization summary\n${JSON.stringify(
      {
        ...summarizeResults(
          run.results as readonly StoryLocalizationEpisodeResult[],
          config
        ),
        counts: run.counts,
        results: run.results,
      },
      null,
      2
    )}\n`
  );
}

export async function buildBatchConfig(
  options: StoryBatchCliOptions
): Promise<ReturnType<typeof createStoryLocalizationConfig>> {
  const runtimeConfig = await loadRuntimeConfig();
  return createStoryLocalizationConfig({
    sourceDirectory: options.sourceDir ?? resolveDefaultSourceDirectory(),
    outputDirectory: options.outputDir ?? resolveDefaultOutputDirectory(),
    languages: parseLanguages(options.languages),
    includeEnglishShort: true,
    processingMode: "batch",
    model:
      options.model ??
      runtimeConfig.openAiLocalizationModel ??
      DEFAULT_STORY_REWRITE_MODEL,
    temperature: SHORT_REWRITE_DEFAULT_TEMPERATURE,
    reasoningEffort:
      runtimeConfig.openAiLocalizationReasoningEffort ??
      DEFAULT_STORY_REWRITE_REASONING_EFFORT,
    maxOutputTokens:
      runtimeConfig.openAiLocalizationMaxOutputTokens ??
      DEFAULT_FULL_REWRITE_MAX_OUTPUT_TOKENS,
    retryMaxOutputTokens:
      runtimeConfig.openAiLocalizationMaxOutputTokens ??
      DEFAULT_FULL_REWRITE_RETRY_MAX_OUTPUT_TOKENS,
    repairModel:
      options.model ??
      runtimeConfig.openAiLocalizationModel ??
      DEFAULT_STORY_REWRITE_MODEL,
    repairReasoningEffort:
      runtimeConfig.openAiLocalizationReasoningEffort ??
      DEFAULT_STORY_REWRITE_REASONING_EFFORT,
    repairMaxOutputTokens:
      runtimeConfig.openAiLocalizationMaxOutputTokens ??
      DEFAULT_FULL_REWRITE_RETRY_MAX_OUTPUT_TOKENS,
    verbose: options.verbose ?? false,
  });
}

async function printBatchEntries(entries: readonly unknown[]): Promise<void> {
  process.stdout.write(`${JSON.stringify(entries, null, 2)}\n`);
}

export async function commandStoriesBatchesList(
  options: StoryBatchCliOptions
): Promise<void> {
  const config = await buildBatchConfig(options);
  const index = new StoryBatchIndexService(config.outputDirectory);
  await index.initialize();
  await printBatchEntries(await index.list());
}

export async function commandStoriesBatchesLatest(
  options: StoryBatchCliOptions
): Promise<void> {
  const config = await buildBatchConfig(options);
  const index = new StoryBatchIndexService(config.outputDirectory);
  await index.initialize();
  const latest = await index.getLatest();
  await printBatchEntries(latest ? [latest] : []);
}

export async function commandStoriesBatchesPending(
  options: StoryBatchCliOptions
): Promise<void> {
  const config = await buildBatchConfig(options);
  const index = new StoryBatchIndexService(config.outputDirectory);
  await index.initialize();
  await printBatchEntries(
    await index.list({
      statuses: [
        "prepared",
        "submitted",
        "validating",
        "in_progress",
        "finalizing",
      ],
    })
  );
}

export async function commandStoriesBatchesReady(
  options: StoryBatchCliOptions
): Promise<void> {
  const config = await buildBatchConfig(options);
  const index = new StoryBatchIndexService(config.outputDirectory);
  await index.initialize();
  await printBatchEntries(await index.list({ requiresImport: true }));
}

export async function commandStoriesBatchesFailed(
  options: StoryBatchCliOptions
): Promise<void> {
  const config = await buildBatchConfig(options);
  const index = new StoryBatchIndexService(config.outputDirectory);
  await index.initialize();
  await printBatchEntries(
    await index.list({
      statuses: ["failed", "partially_completed", "imported_with_failures"],
    })
  );
}

export async function commandStoriesBatchesExpired(
  options: StoryBatchCliOptions
): Promise<void> {
  const config = await buildBatchConfig(options);
  const index = new StoryBatchIndexService(config.outputDirectory);
  await index.initialize();
  await printBatchEntries(await index.list({ statuses: ["expired"] }));
}

export async function commandStoriesBatchesFind(
  options: StoryBatchCliOptions
): Promise<void> {
  if (!options.episode) {
    throw new Error("--episode is required");
  }
  const config = await buildBatchConfig(options);
  const index = new StoryBatchIndexService(config.outputDirectory);
  await index.initialize();
  await printBatchEntries(await index.findByEpisode(options.episode));
}

export async function commandStoriesBatchesShow(
  options: StoryBatchCliOptions
): Promise<void> {
  if (!options.batch) {
    throw new Error("--batch is required");
  }
  const config = await buildBatchConfig(options);
  const index = new StoryBatchIndexService(config.outputDirectory);
  await index.initialize();
  const entry =
    (await index.getByLocalBatchId(options.batch)) ??
    (await index.getByOpenAIBatchId(options.batch));
  await printBatchEntries(entry ? [entry] : []);
}

export async function commandStoriesBatchesStatus(
  options: StoryBatchCliOptions
): Promise<void> {
  if (!options.batch) {
    throw new Error("--batch is required");
  }
  const config = await buildBatchConfig(options);
  const refreshed = await refreshStoryLocalizationBatch(
    options.batch,
    config,
    createOpenAiStoryClient()
  );
  process.stdout.write(`${JSON.stringify(refreshed, null, 2)}\n`);
}

export async function commandStoriesBatchesRefresh(
  options: StoryBatchCliOptions
): Promise<void> {
  const config = await buildBatchConfig(options);
  const refreshed = await refreshActiveStoryBatches(
    config,
    createOpenAiStoryClient()
  );
  await printBatchEntries(refreshed);
}

export async function commandStoriesBatchesImport(
  options: StoryBatchCliOptions
): Promise<void> {
  if (!options.batch) {
    throw new Error("--batch is required");
  }
  const config = await buildBatchConfig(options);
  const imported = await importStoryLocalizationBatch(
    options.batch,
    config,
    createOpenAiStoryClient()
  );
  process.stdout.write(`${JSON.stringify(imported, null, 2)}\n`);
}

export async function commandStoriesBatchesImportReady(
  options: StoryBatchCliOptions
): Promise<void> {
  const config = await buildBatchConfig(options);
  const imported = await importReadyStoryBatches(
    config,
    createOpenAiStoryClient()
  );
  await printBatchEntries(imported);
}

export async function commandStoriesBatchesRetryFailed(
  options: StoryBatchCliOptions
): Promise<void> {
  if (!options.batch) {
    throw new Error("--batch is required");
  }
  const config = await buildBatchConfig(options);
  const retried = await retryFailedStoryBatch(options.batch, config);
  process.stdout.write(`${JSON.stringify(retried, null, 2)}\n`);
}

export async function commandStoriesBatchesCancel(
  options: StoryBatchCliOptions
): Promise<void> {
  if (!options.batch) {
    throw new Error("--batch is required");
  }
  const config = await buildBatchConfig(options);
  const cancelled = await cancelStoryBatch(
    options.batch,
    config,
    createOpenAiStoryClient()
  );
  process.stdout.write(`${JSON.stringify(cancelled, null, 2)}\n`);
}

export async function commandStoriesBatchesVerifyIndex(
  options: StoryBatchCliOptions
): Promise<void> {
  const config = await buildBatchConfig(options);
  const index = new StoryBatchIndexService(config.outputDirectory);
  await index.initialize();
  if (options.repair) {
    const repair = await index.rebuild();
    process.stdout.write(`${JSON.stringify(repair, null, 2)}\n`);
    return;
  }
  const report = await index.verify();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

export async function commandStoriesBatchesRebuildIndex(
  options: StoryBatchCliOptions
): Promise<void> {
  const config = await buildBatchConfig(options);
  const index = new StoryBatchIndexService(config.outputDirectory);
  await index.initialize();
  const report = await index.rebuild();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

export function registerStoryLocalizationCommands(program: Command): void {
  const normalizeCommandFlags = (
    opts: StoryLocalizationCliOptions
  ): StoryLocalizationCliOptions => {
    const rawArgs = new Set(process.argv.slice(2));
    const commandText = [
      process.env["MEDIAFORGE_NPM_SCRIPT_COMMAND"] ?? "",
      process.argv.join(" "),
    ].join(" ");
    return {
      ...opts,
      dryRun:
        opts.dryRun ||
        rawArgs.has("--dry-run") ||
        commandText.includes("--dry-run"),
      validateOnly:
        opts.validateOnly ||
        rawArgs.has("--validate-only") ||
        commandText.includes("--validate-only"),
    };
  };

  const stories = program.command("stories").description("Story localization utilities");
  stories
    .command("localize")
    .option("--all", "process all discovered English full stories")
    .option("--file <path>", "explicit canonical English full story file")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source-dir <path>", "source directory")
    .option("--output-dir <path>", "output directory")
    .option("--languages <comma-separated-languages>", "target languages")
    .option("--include-english-short", "generate an English short")
    .option("--mode <batch|sync>", "processing mode")
    .option(
      "--adaptation-mode <faithful|retention-optimized>",
      "adaptation mode"
    )
    .option("--short-min-seconds <number>", "minimum short duration", (value) =>
      Number(value)
    )
    .option("--short-max-seconds <number>", "maximum short duration", (value) =>
      Number(value)
    )
    .option("--short-wpm <number>", "short narration wpm", (value) =>
      Number(value)
    )
    .option("--concurrency <number>", "concurrency", (value) => Number(value))
    .option("--model <model>", "OpenAI model")
    .option("--fallback-to-sync", "allow explicit fallback to sync")
    .option("--force", "overwrite generated files")
    .option("--submit", "submit the prepared batch")
    .option("--prepare-batch", "prepare a batch without submitting it")
    .option("--wait", "wait for batch completion")
    .option("--auto-import", "import a batch automatically after completion")
    .option(
      "--poll-interval-seconds <number>",
      "status polling interval",
      (value) => Number(value)
    )
    .option("--dry-run", "show the plan only")
    .option("--validate-only", "validate existing outputs only")
    .option("--verbose", "enable verbose logging")
    .action(async (opts: StoryLocalizationCliOptions) =>
      commandStoriesLocalize(normalizeCommandFlags(opts))
    );

  registerStoryRewriteShortCommand(stories);
  registerStoryRewriteFullCommand(stories);
  registerStoryAnalysisCommand(stories);
  registerStoryPipelineCommand(stories);
  stories
    .command("resume-images")
    .description("Resume partial image generation for an episode and bootstrap manifest.json when needed")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--output-root <path>", "output root")
    .option("--concurrency <number>", "parallel scene generation", (value) =>
      Number(value)
    )
    .option("--allow-unapproved-character-references")
    .option("--force")
    .option("--json")
    .option("--verbose")
    .action(async (opts: {
      episode?: string;
      source?: string;
      outputRoot?: string;
      concurrency?: number;
      allowUnapprovedCharacterReferences?: boolean;
      force?: boolean;
      json?: boolean;
      verbose?: boolean;
    }) =>
      commandImagesResume({
        ...(opts.episode !== undefined ? { episode: opts.episode } : {}),
        ...(opts.source !== undefined ? { source: opts.source } : {}),
        ...(opts.outputRoot !== undefined ? { workspace: opts.outputRoot } : {}),
        ...(opts.concurrency !== undefined ? { concurrency: opts.concurrency } : {}),
        ...(opts.allowUnapprovedCharacterReferences !== undefined
          ? {
              allowUnapprovedCharacterReferences:
                opts.allowUnapprovedCharacterReferences,
            }
          : {}),
        ...(opts.force !== undefined ? { force: opts.force } : {}),
        ...(opts.json !== undefined ? { json: opts.json } : {}),
        ...(opts.verbose !== undefined ? { verbose: opts.verbose } : {}),
      })
    );
  stories
    .command("bootstrap-shared")
    .description("Sync the shared character map and generate character reference images for an episode")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--output-root <path>", "output root")
    .option("--approve", "approve generated references")
    .option("--force", "overwrite generated artifacts")
    .option("--json", "print machine-readable output")
    .option("--verbose", "enable verbose logging")
    .action(async (opts: StoryBootstrapSharedCliOptions) =>
      commandEpisodeBootstrapCharacters({
        ...(opts.episode !== undefined ? { episode: opts.episode } : {}),
        ...(opts.source !== undefined ? { source: opts.source } : {}),
        ...(opts.outputRoot !== undefined ? { outputRoot: opts.outputRoot } : {}),
        ...(opts.approve !== undefined ? { approve: opts.approve } : {}),
        ...(opts.force !== undefined ? { force: opts.force } : {}),
        ...(opts.json !== undefined ? { json: opts.json } : {}),
        ...(opts.verbose !== undefined ? { verbose: opts.verbose } : {}),
      })
    );
  stories
    .command("sync-characters")
    .description("Copy the canonical source-pack characters.json into the shared episode workspace")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source <path>", "source root")
    .option("--output-root <path>", "output root")
    .option("--force")
    .option("--json", "print machine-readable output")
    .option("--verbose", "enable verbose logging")
    .action(async (opts: StoryBootstrapSharedCliOptions) =>
      commandEpisodeSyncCharacters({
        ...(opts.episode !== undefined ? { episode: opts.episode } : {}),
        ...(opts.source !== undefined ? { source: opts.source } : {}),
        ...(opts.outputRoot !== undefined ? { outputRoot: opts.outputRoot } : {}),
        ...(opts.force !== undefined ? { force: opts.force } : {}),
        ...(opts.json !== undefined ? { json: opts.json } : {}),
        ...(opts.verbose !== undefined ? { verbose: opts.verbose } : {}),
      })
    );

  const batches = program
    .command("stories:batches")
    .description("Story localization batch utilities");
  batches
    .command("list")
    .option("--output-dir <path>")
    .option("--verbose")
    .action(commandStoriesBatchesList);
  batches
    .command("latest")
    .option("--output-dir <path>")
    .option("--verbose")
    .action(commandStoriesBatchesLatest);
  batches
    .command("pending")
    .option("--output-dir <path>")
    .option("--verbose")
    .action(commandStoriesBatchesPending);
  batches
    .command("ready")
    .option("--output-dir <path>")
    .option("--verbose")
    .action(commandStoriesBatchesReady);
  batches
    .command("completed")
    .option("--output-dir <path>")
    .option("--verbose")
    .action(commandStoriesBatchesReady);
  batches
    .command("failed")
    .option("--output-dir <path>")
    .option("--verbose")
    .action(commandStoriesBatchesFailed);
  batches
    .command("expired")
    .option("--output-dir <path>")
    .option("--verbose")
    .action(commandStoriesBatchesExpired);
  batches
    .command("find")
    .requiredOption("--episode <episode>")
    .option("--output-dir <path>")
    .option("--verbose")
    .action(commandStoriesBatchesFind);
  batches
    .command("show")
    .requiredOption("--batch <id>")
    .option("--output-dir <path>")
    .option("--verbose")
    .action(commandStoriesBatchesShow);
  batches
    .command("status")
    .requiredOption("--batch <id>")
    .option("--output-dir <path>")
    .option("--verbose")
    .action(commandStoriesBatchesStatus);
  batches
    .command("refresh")
    .option("--output-dir <path>")
    .option("--verbose")
    .action(commandStoriesBatchesRefresh);
  batches
    .command("import")
    .requiredOption("--batch <id>")
    .option("--output-dir <path>")
    .option("--verbose")
    .action(commandStoriesBatchesImport);
  batches
    .command("import-ready")
    .option("--output-dir <path>")
    .option("--verbose")
    .action(commandStoriesBatchesImportReady);
  batches
    .command("retry-failed")
    .requiredOption("--batch <id>")
    .option("--output-dir <path>")
    .option("--verbose")
    .action(commandStoriesBatchesRetryFailed);
  batches
    .command("cancel")
    .requiredOption("--batch <id>")
    .option("--output-dir <path>")
    .option("--verbose")
    .action(commandStoriesBatchesCancel);
  batches
    .command("verify-index")
    .option("--output-dir <path>")
    .option("--repair")
    .option("--verbose")
    .action(commandStoriesBatchesVerifyIndex);
  batches
    .command("rebuild-index")
    .option("--output-dir <path>")
    .option("--verbose")
    .action(commandStoriesBatchesRebuildIndex);
}
