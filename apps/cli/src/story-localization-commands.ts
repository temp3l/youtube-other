import path from "node:path";
import { Command } from "commander";
import {
  createStoryLocalizationConfig,
  discoverCanonicalSourceStories,
  getLanguageProfile,
  isShortLanguage,
  localizeStoryEpisode,
  parseCanonicalSourceStory,
  resolveDefaultOutputDirectory,
  resolveDefaultSourceDirectory,
  selectSourceCandidates,
  validateGeneratedStories,
  type LanguageCode,
  type StoryLocalizationEpisodeResult,
} from "@mediaforge/story-localization";
import { createLogger } from "@mediaforge/observability";
import { ensureDir, fileExists, normalizeWhitespace } from "@mediaforge/shared";
import fs from "node:fs/promises";

export interface StoryLocalizationCliOptions {
  readonly all?: boolean;
  readonly file?: string;
  readonly episode?: string;
  readonly sourceDir?: string;
  readonly outputDir?: string;
  readonly languages?: string;
  readonly includeEnglishShort?: boolean;
  readonly adaptationMode?: "faithful" | "retention-optimized";
  readonly shortMinSeconds?: number;
  readonly shortMaxSeconds?: number;
  readonly shortWpm?: number;
  readonly concurrency?: number;
  readonly model?: string;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly validateOnly?: boolean;
  readonly verbose?: boolean;
}

function parseLanguages(value: string | undefined): readonly Exclude<LanguageCode, "en">[] {
  if (!value) {
    return ["de", "es", "fr", "pt"];
  }
  const parsed = value
    .split(",")
    .map((entry) => normalizeWhitespace(entry).toLowerCase())
    .filter(Boolean)
    .filter((entry): entry is Exclude<LanguageCode, "en"> => isShortLanguage(entry));
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

function buildCommandConfig(options: StoryLocalizationCliOptions): ReturnType<typeof createStoryLocalizationConfig> {
  return createStoryLocalizationConfig({
    sourceDirectory: options.sourceDir ?? resolveDefaultSourceDirectory(),
    outputDirectory: options.outputDir ?? resolveDefaultOutputDirectory(),
    languages: parseLanguages(options.languages),
    includeEnglishShort: options.includeEnglishShort ?? true,
    adaptationMode: options.adaptationMode ?? "retention-optimized",
    shortMinSeconds: options.shortMinSeconds ?? 55,
    shortMaxSeconds: options.shortMaxSeconds ?? 65,
    shortWpm: options.shortWpm ?? 180,
    concurrency: options.concurrency ?? 2,
    model: options.model ?? "gpt-4o-mini",
    force: options.force ?? false,
    dryRun: options.dryRun ?? false,
    validateOnly: options.validateOnly ?? false,
    verbose: options.verbose ?? false,
  });
}

async function printDryRunSummary(
  selected: ReadonlyArray<{ readonly filePath: string; readonly episodeNumber: string; readonly slug: string }>,
  config: ReturnType<typeof createStoryLocalizationConfig>
): Promise<void> {
  const planned = selected.map((candidate) => {
    const base = path.join(config.outputDirectory, `${candidate.slug}`);
    const files = [
      `${base}-en-full.md`,
      ...(config.includeEnglishShort ? [`${base}-en-short.md`] : []),
      ...config.languages.flatMap((language: Exclude<LanguageCode, "en">) => [
        `${base}-${language}-full.md`,
        `${base}-${language}-short.md`,
      ]),
    ];
    return {
      episodeNumber: candidate.episodeNumber,
      slug: candidate.slug,
      sourceFile: candidate.filePath,
      outputFiles: files,
      apiCalls: 1 + config.languages.length + (config.includeEnglishShort ? 1 : 0),
    };
  });
  process.stdout.write(`${JSON.stringify({
    dryRun: true,
    sourceDirectory: config.sourceDirectory,
    outputDirectory: config.outputDirectory,
    languages: config.languages,
    planned,
    estimatedApiCalls: planned.reduce((total, item) => total + item.apiCalls, 0),
  }, null, 2)}\n`);
}

async function runValidateOnly(outputDirectory: string): Promise<void> {
  const issues = await validateGeneratedStories(outputDirectory);
  process.stdout.write(`${JSON.stringify({
    validateOnly: true,
    outputDirectory,
    issues,
    ok: issues.length === 0,
  }, null, 2)}\n`);
}

function summarizeResults(results: readonly StoryLocalizationEpisodeResult[], config: ReturnType<typeof createStoryLocalizationConfig>): Record<string, unknown> {
  const summary = {
    sourceDirectory: config.sourceDirectory,
    outputDirectory: config.outputDirectory,
    discovered: results.length,
    copiedEnglishFull: results.filter((result) => result.copiedEnglishFull).length,
    englishShorts: results.filter((result: StoryLocalizationEpisodeResult) => result.generatedFiles.some((file: string) => file.endsWith("-en-short.md"))).length,
    germanFull: results.filter((result: StoryLocalizationEpisodeResult) => result.generatedFiles.some((file: string) => file.endsWith("-de-full.md"))).length,
    germanShort: results.filter((result: StoryLocalizationEpisodeResult) => result.generatedFiles.some((file: string) => file.endsWith("-de-short.md"))).length,
    spanishFull: results.filter((result: StoryLocalizationEpisodeResult) => result.generatedFiles.some((file: string) => file.endsWith("-es-full.md"))).length,
    spanishShort: results.filter((result: StoryLocalizationEpisodeResult) => result.generatedFiles.some((file: string) => file.endsWith("-es-short.md"))).length,
    frenchFull: results.filter((result: StoryLocalizationEpisodeResult) => result.generatedFiles.some((file: string) => file.endsWith("-fr-full.md"))).length,
    frenchShort: results.filter((result: StoryLocalizationEpisodeResult) => result.generatedFiles.some((file: string) => file.endsWith("-fr-short.md"))).length,
    portugueseFull: results.filter((result: StoryLocalizationEpisodeResult) => result.generatedFiles.some((file: string) => file.endsWith("-pt-full.md"))).length,
    portugueseShort: results.filter((result: StoryLocalizationEpisodeResult) => result.generatedFiles.some((file: string) => file.endsWith("-pt-short.md"))).length,
    skippedFiles: results.flatMap((result) => result.skippedFiles),
    cacheHits: results.filter((result) => result.cacheHit).length,
    repairAttempts: results.reduce((total, result) => total + result.repairAttempts, 0),
    failures: results.filter((result) => result.failure).length,
    totalInputTokens: results.reduce((total, result) => total + result.inputTokens, 0),
    totalOutputTokens: results.reduce((total, result) => total + result.outputTokens, 0),
    estimatedTotalCostUsd: results.reduce((total, result) => total + (result.estimatedCostUsd ?? 0), 0),
  };
  return summary;
}

export async function commandStoriesLocalize(options: StoryLocalizationCliOptions): Promise<void> {
  const config = buildCommandConfig(options);
  const logger = createLogger(config.verbose ? "debug" : "info");
  await ensureDir(config.outputDirectory);
  const discovered = await discoverCanonicalSourceStories(config.sourceDirectory);
  const selected = resolveSelection(options, discovered);
  if (options.validateOnly) {
    await runValidateOnly(config.outputDirectory);
    return;
  }
  if (options.dryRun) {
    await printDryRunSummary(selected, config);
    return;
  }
  const results: StoryLocalizationEpisodeResult[] = [];
  for (const candidate of selected) {
    const result = await localizeStoryEpisode(candidate.filePath, config, { logger });
    results.push(result);
  }
  process.stdout.write(`Story localization summary\n${JSON.stringify({
    ...summarizeResults(results, config),
    results,
  }, null, 2)}\n`);
}

export function registerStoryLocalizationCommands(program: Command): void {
  program
    .command("stories")
    .description("Story localization utilities")
    .command("localize")
    .option("--all", "process all discovered English full stories")
    .option("--file <path>", "explicit canonical English full story file")
    .option("--episode <number-or-slug>", "episode number or slug")
    .option("--source-dir <path>", "source directory")
    .option("--output-dir <path>", "output directory")
    .option("--languages <comma-separated-languages>", "target languages")
    .option("--include-english-short", "generate an English short")
    .option("--adaptation-mode <faithful|retention-optimized>", "adaptation mode")
    .option("--short-min-seconds <number>", "minimum short duration", (value) => Number(value))
    .option("--short-max-seconds <number>", "maximum short duration", (value) => Number(value))
    .option("--short-wpm <number>", "short narration wpm", (value) => Number(value))
    .option("--concurrency <number>", "concurrency", (value) => Number(value))
    .option("--model <model>", "OpenAI model")
    .option("--force", "overwrite generated files")
    .option("--dry-run", "show the plan only")
    .option("--validate-only", "validate existing outputs only")
    .option("--verbose", "enable verbose logging")
    .action(async (opts: StoryLocalizationCliOptions) => commandStoriesLocalize(opts));
}
