import path from "node:path";
import { randomUUID } from "node:crypto";
import { Command } from "commander";
import { loadRuntimeConfig } from "@mediaforge/config";
import { createLogger } from "@mediaforge/observability";
import {
  createOpenAiStoryClientWithOptions,
  createStoryLocalizationConfig,
  buildCanonicalSourceFileName,
  DEFAULT_FULL_REWRITE_MAX_OUTPUT_TOKENS,
  DEFAULT_FULL_REWRITE_RETRY_MAX_OUTPUT_TOKENS,
  DEFAULT_STORY_REWRITE_MODEL,
  DEFAULT_STORY_REWRITE_REASONING_EFFORT,
  SHORT_REWRITE_DEFAULT_TEMPERATURE,
  type LanguageCode,
  resolveFullRewriteInput,
  localizeStoryEpisode,
  materializeCanonicalSourceStory,
} from "@mediaforge/story-localization";
import { normalizeWhitespace } from "@mediaforge/shared";

export interface StoryRewriteFullCliOptions {
  readonly episode?: string;
  readonly input?: string;
  readonly episodeSlug?: string;
  readonly language?: string;
  readonly languages?: string;
  readonly outputRoot?: string;
  readonly model?: string;
  readonly temperature?: number;
  readonly reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  readonly maxOutputTokens?: number;
  readonly retryMaxOutputTokens?: number;
  readonly maxConcurrency?: number;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly overwrite?: boolean;
  readonly resume?: boolean;
  readonly dryRun?: boolean;
  readonly force?: boolean;
  readonly json?: boolean;
  readonly verbose?: boolean;
}

function parseLanguageList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => normalizeWhitespace(entry).toLowerCase())
    .filter(Boolean);
}

function normalizeTargetLanguages(value: string | undefined, singleLanguage?: string): string[] {
  const values = [...parseLanguageList(singleLanguage), ...parseLanguageList(value)];
  return [...new Set(values.filter((entry) => entry !== "en"))];
}

export function registerStoryRewriteFullCommand(storiesCommand: Command): void {
  storiesCommand
    .command("rewrite-full")
    .description("Rewrite an English full-length horror story into optimized full and localized episode outputs")
    .option("--episode <id-or-slug>", "episode id or slug")
    .option("--input <path>", "explicit English full-story markdown input")
    .option("--episode-slug <slug>", "canonical episode slug for bootstrapped input")
    .option("--language <code>", "single target language")
    .option("--languages <comma-separated-codes>", "target languages")
    .option("--model <model>", "OpenAI model")
    .option("--output-root <path>", "output root directory")
    .option("--temperature <number>", "sampling temperature", (value) => Number(value))
    .option("--reasoning-effort <value>", "reasoning effort")
    .option("--max-output-tokens <number>", "maximum output tokens", (value) => Number(value))
    .option("--retry-max-output-tokens <number>", "retry output tokens", (value) => Number(value))
    .option("--max-concurrency <number>", "maximum concurrent requests", (value) => Number(value))
    .option("--timeout-ms <number>", "request timeout in milliseconds", (value) => Number(value))
    .option("--max-retries <number>", "maximum transient retries", (value) => Number(value))
    .option("--overwrite", "overwrite existing outputs")
    .option("--resume", "skip valid outputs and regenerate invalid ones")
    .option("--dry-run", "plan the run without calling OpenAI or writing files")
    .option("--force", "alias for overwrite")
    .option("--json", "print machine-readable output")
    .option("--verbose", "enable verbose logging")
    .action(async (options: StoryRewriteFullCliOptions) => {
      const rawArgs = new Set(process.argv.slice(2));
      const commandText = [
        process.env["MEDIAFORGE_NPM_SCRIPT_COMMAND"] ?? "",
        process.argv.join(" "),
      ].join(" ");
      const hasDryRunFlag =
        rawArgs.has("--dry-run") || commandText.includes("--dry-run");
      if (options.episode && options.input) {
        throw new Error("--episode and --input are mutually exclusive.");
      }
      if (!options.episode && !options.input) {
        throw new Error("Either --episode or --input is required.");
      }

      const runtimeConfig = await loadRuntimeConfig();
      const outputRoot = path.resolve(options.outputRoot ?? runtimeConfig.workspaceDir);
      const resolved = await resolveFullRewriteInput({
        inputPath: options.input,
        episode: options.episode,
        episodeSlug: options.episodeSlug,
        outputRoot,
      });
      const canonicalSourcePath = path.join(
        outputRoot,
        resolved.episodeSlug,
        "source",
        buildCanonicalSourceFileName({
          episodeNumber: resolved.episodeNumber,
          episodeSlug: resolved.episodeSlug,
        })
      );
      if (!(options.dryRun || hasDryRunFlag)) {
        await materializeCanonicalSourceStory({
          sourcePath: resolved.sourcePath,
          targetPath: canonicalSourcePath,
          sourceSha256: resolved.sourceSha256,
          overwrite: options.overwrite ?? options.force ?? false,
        });
      }
      const sourceFile = options.dryRun || hasDryRunFlag ? resolved.sourcePath : canonicalSourcePath;
      const requestedLanguages = normalizeTargetLanguages(options.languages, options.language);
      if (options.dryRun || hasDryRunFlag) {
        const planned = {
          command: "stories rewrite-full",
          episodeId: resolved.episodeNumber,
          episodeSlug: resolved.episodeSlug,
          sourceFile: canonicalSourcePath,
          plannedOutputs: {
            englishFull: path.join(outputRoot, resolved.episodeSlug, "script.md"),
            localized: requestedLanguages.map((language) =>
              ({
                language,
                full: path.join(outputRoot, resolved.episodeSlug, language, "full", "script.md"),
              })
            ),
          },
          dryRun: true,
        };
        process.stdout.write(`${JSON.stringify(planned, null, 2)}\n`);
        return;
      }

      const config = createStoryLocalizationConfig({
        sourceDirectory: outputRoot,
        outputDirectory: outputRoot,
        languages: requestedLanguages as readonly Exclude<LanguageCode, "en">[],
        includeEnglishShort: false,
        includeLocalizedShorts: false,
        processingMode: "sync",
        timeoutMs: options.timeoutMs ?? 180_000,
        maxOutputTokens:
          options.maxOutputTokens ??
          runtimeConfig.openAiStoryMaxOutputTokens ??
          DEFAULT_FULL_REWRITE_MAX_OUTPUT_TOKENS,
        retryMaxOutputTokens:
          options.retryMaxOutputTokens ??
          runtimeConfig.openAiStoryRetryMaxOutputTokens ??
          DEFAULT_FULL_REWRITE_RETRY_MAX_OUTPUT_TOKENS,
        model:
          options.model ??
          runtimeConfig.openAiStoryModel ??
          DEFAULT_STORY_REWRITE_MODEL,
        temperature: options.temperature ?? runtimeConfig.openAiStoryTemperature ?? SHORT_REWRITE_DEFAULT_TEMPERATURE,
        reasoningEffort:
          options.reasoningEffort ??
          runtimeConfig.openAiStoryReasoningEffort ??
          DEFAULT_STORY_REWRITE_REASONING_EFFORT,
        repairModel:
          runtimeConfig.openAiValidatorModel ??
          runtimeConfig.openAiMetadataModel,
        repairReasoningEffort:
          runtimeConfig.openAiValidatorReasoningEffort ??
          runtimeConfig.openAiMetadataReasoningEffort,
        repairMaxOutputTokens:
          runtimeConfig.openAiValidatorMaxOutputTokens ??
          runtimeConfig.openAiMetadataMaxOutputTokens,
        force: options.overwrite ?? options.force ?? false,
        resume: options.resume ?? false,
        dryRun: options.dryRun || hasDryRunFlag,
        verbose: options.verbose ?? false,
        debugOutputs: true,
        debugPrefix: "stories-rewrite-full",
      });
      const client = options.dryRun || hasDryRunFlag
        ? undefined
        : createOpenAiStoryClientWithOptions({
            apiKey: runtimeConfig.openAiCompatibleApiKey ?? undefined,
            baseUrl: runtimeConfig.openAiCompatibleBaseUrl ?? undefined,
            timeoutMs: options.timeoutMs ?? 180_000,
            maxRetries: options.maxRetries ?? 2,
          });
      const logger = createLogger(options.verbose ? "debug" : runtimeConfig.logLevel, process.stderr);
      const result = await localizeStoryEpisode(sourceFile, config, {
        ...(client ? { client } : {}),
        logger,
      });
      const payload = {
        command: "stories rewrite-full",
        runId: randomUUID(),
        episodeId: result.episodeNumber,
        episodeSlug: result.slug,
        sourceFile: result.sourceFile,
        generatedFiles: result.generatedFiles,
        skippedFiles: result.skippedFiles,
        cacheHit: result.cacheHit,
        repairAttempts: result.repairAttempts,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        estimatedCostUsd: result.estimatedCostUsd,
        failure: result.failure,
      };
      if (options.json) {
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      } else {
        process.stdout.write(
          [
            `Episode: ${result.episodeNumber} — ${result.slug}`,
            `Source: ${result.sourceFile}`,
            `Generated: ${result.generatedFiles.length}`,
            `Skipped: ${result.skippedFiles.length}`,
            `Input tokens: ${result.inputTokens}`,
            `Output tokens: ${result.outputTokens}`,
            `Estimated cost: ${result.estimatedCostUsd === null ? "n/a" : `$${result.estimatedCostUsd.toFixed(4)}`}`,
          ].join("\n") + "\n"
        );
      }
      if (result.failure) {
        process.exitCode = 1;
      }
    });
}
