import path from "node:path";
import { Command } from "commander";
import { loadRuntimeConfig } from "@mediaforge/config";
import { createLogger } from "@mediaforge/observability";
import {
  analyzeStoryProduction,
  buildStoryProductionInspectPayload,
  createOpenAiStoryClientWithOptions,
  resolveStoryProductionAnalysisSource,
  resolveStoryProductionAnalysisStatus,
} from "@mediaforge/story-localization";

export interface StoryAnalysisCliOptions {
  readonly episode?: string;
  readonly language?: string;
  readonly format?: "full" | "short";
  readonly outputRoot?: string;
  readonly force?: boolean;
  readonly refresh?: boolean;
  readonly model?: string;
  readonly reasoningEffort?: "low" | "medium" | "high";
  readonly json?: boolean;
  readonly verbose?: boolean;
}

function resolveInheritedCliOptions(
  command: Command,
  options: StoryAnalysisCliOptions
): StoryAnalysisCliOptions {
  const inherited = command.optsWithGlobals() as StoryAnalysisCliOptions;
  return {
    ...options,
    ...(options.language ?? inherited.language
      ? { language: options.language ?? inherited.language }
      : {}),
    ...(options.json ?? inherited.json) !== undefined
      ? { json: options.json ?? inherited.json }
      : {},
    ...(options.verbose ?? inherited.verbose) !== undefined
      ? { verbose: options.verbose ?? inherited.verbose }
      : {},
  };
}

async function buildStoryInspectPayload(
  options: StoryAnalysisCliOptions
): Promise<Record<string, unknown>> {
  if (!options.episode) {
    throw new Error("--episode is required.");
  }
  const runtimeConfig = await loadRuntimeConfig();
  const outputRoot = path.resolve(options.outputRoot ?? runtimeConfig.workspaceDir);
  const language = options.language ?? "en";
  const format = options.format ?? "full";
  if (format !== "full") {
    throw new Error("Story production analysis supports --format full only in v1.");
  }
  const source = await resolveStoryProductionAnalysisSource({
    outputRoot,
    episodeSlug: options.episode,
    language,
    format,
  });
  const status = await resolveStoryProductionAnalysisStatus({
    outputRoot,
    episodeSlug: source.episodeSlug,
    language,
    format,
    model:
      options.model ??
      runtimeConfig.openAiValidatorModel ??
      runtimeConfig.openAiStoryModel,
    reasoningEffort:
      options.reasoningEffort ??
      runtimeConfig.openAiValidatorReasoningEffort ??
      "medium",
  });
  return buildStoryProductionInspectPayload({ source, status });
}

export function registerStoryAnalysisCommand(storiesCommand: Command): void {
  storiesCommand
    .command("analyze")
    .description("Analyze a persisted full story artifact for production readiness")
    .requiredOption("--episode <slug-or-number>", "episode slug or number")
    .option("--language <code>", "language", "en")
    .option("--format <full>", "story format", "full")
    .option("--output-root <path>", "output root directory")
    .option("--force", "rerun regardless of current cached analysis")
    .option("--refresh", "rerun only when the current analysis is stale or missing")
    .option("--model <model>", "OpenAI model override")
    .option("--reasoning-effort <level>", "reasoning effort")
    .option("--json", "print machine-readable output")
    .option("--verbose", "enable verbose logging")
    .action(async function (this: Command, rawOptions: StoryAnalysisCliOptions) {
      const options = resolveInheritedCliOptions(this, rawOptions);
      const runtimeConfig = await loadRuntimeConfig();
      const outputRoot = path.resolve(options.outputRoot ?? runtimeConfig.workspaceDir);
      const format = options.format ?? "full";
      if (format !== "full") {
        throw new Error("Story production analysis supports --format full only in v1.");
      }
      const model =
        options.model ??
        runtimeConfig.openAiValidatorModel ??
        runtimeConfig.openAiStoryModel ??
        "gpt-5.4-mini";
      const reasoningEffort =
        options.reasoningEffort ??
        runtimeConfig.openAiValidatorReasoningEffort ??
        "medium";
      const maxOutputTokens =
        runtimeConfig.openAiValidatorMaxOutputTokens ?? 6_000;
      const logger = createLogger(options.verbose ? "debug" : runtimeConfig.logLevel, process.stderr);
      const client = createOpenAiStoryClientWithOptions({
        apiKey: runtimeConfig.openAiCompatibleApiKey ?? undefined,
        baseUrl: runtimeConfig.openAiCompatibleBaseUrl ?? undefined,
      });
      const result = await analyzeStoryProduction({
        episode: options.episode ?? "",
        language: options.language ?? "en",
        format: "full",
        outputRoot,
        force: options.force,
        refresh: options.refresh,
        model,
        reasoningEffort,
        maxOutputTokens,
        runtimeConfig,
        client,
        verbose: options.verbose,
      });
      logger.debug(
        {
          episode: options.episode,
          language: options.language ?? "en",
          cacheStatus: result.cacheStatus,
          pass: result.artifact.pass,
          verdict: result.artifact.verdict,
        },
        "story_production_analysis_complete"
      );
      if (options.json) {
        process.stdout.write(`${JSON.stringify(result.artifact, null, 2)}\n`);
      } else {
        process.stdout.write(result.report);
      }
      process.exitCode = result.exitCode;
    });

  storiesCommand
    .command("inspect")
    .description("Inspect current story production analysis state")
    .requiredOption("--episode <slug-or-number>", "episode slug or number")
    .option("--language <code>", "language", "en")
    .option("--format <full>", "story format", "full")
    .option("--output-root <path>", "output root directory")
    .option("--model <model>", "OpenAI model override")
    .option("--reasoning-effort <level>", "reasoning effort")
    .option("--json", "print machine-readable output")
    .action(async function (this: Command, rawOptions: StoryAnalysisCliOptions) {
      const options = resolveInheritedCliOptions(this, rawOptions);
      const payload = await buildStoryInspectPayload(options);
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    });

  storiesCommand
    .command("status")
    .description("Show story production analysis readiness")
    .requiredOption("--episode <slug-or-number>", "episode slug or number")
    .option("--language <code>", "language", "en")
    .option("--format <full>", "story format", "full")
    .option("--output-root <path>", "output root directory")
    .option("--model <model>", "OpenAI model override")
    .option("--reasoning-effort <level>", "reasoning effort")
    .option("--json", "print machine-readable output")
    .action(async function (this: Command, rawOptions: StoryAnalysisCliOptions) {
      const options = resolveInheritedCliOptions(this, rawOptions);
      const payload = await buildStoryInspectPayload(options);
      const status =
        payload["analysisState"] === "CURRENT"
          ? (payload["verdict"] ?? "READY")
          : payload["analysisState"] === "MISSING"
            ? "NOT_ANALYZED"
            : payload["analysisState"] === "STALE"
              ? "ANALYSIS_STALE"
              : payload["analysisState"] === "INVALID"
                ? "ANALYSIS_FAILED"
                : "BLOCKED";
      process.stdout.write(
        `${JSON.stringify(
          {
            episode: payload["episode"],
            episodeSlug: payload["episodeSlug"],
            language: payload["language"],
            format: payload["format"],
            status,
            pass: payload["pass"] ?? false,
            verdict: payload["verdict"],
            analysisCurrent: payload["analysisCurrent"],
            failedGateCount: Array.isArray(payload["failedProductionGates"])
              ? payload["failedProductionGates"].length
              : 0,
            blockingIssueCount: payload["blockingIssueCount"] ?? 0,
            requiredChangeCount: payload["requiredChangeCount"] ?? 0,
            publishingReady:
              payload["analysisCurrent"] === true && payload["pass"] === true,
          },
          null,
          2
        )}\n`
      );
    });
}
