import path from "node:path";
import { Command } from "commander";
import { loadRuntimeConfig } from "@mediaforge/config";
import { createLogger } from "@mediaforge/observability";
import {
  createOpenAiStoryClientWithOptions,
  StoryLocalizationApiError,
  rewriteShortStories,
  DEFAULT_SHORT_REWRITE_MAX_OUTPUT_TOKENS,
  DEFAULT_SHORT_REWRITE_RETRY_MAX_OUTPUT_TOKENS,
  DEFAULT_STORY_REWRITE_MODEL,
  DEFAULT_STORY_REWRITE_REASONING_EFFORT,
  SHORT_REWRITE_DEFAULT_TIMEOUT_MS,
  SHORT_REWRITE_DEFAULT_TEMPERATURE,
  SUPPORTED_STORY_LANGUAGES,
  type ShortRewriteRunOptions,
  type StoryLanguage,
} from "@mediaforge/story-localization";
import {
  normalizeWhitespace,
} from "@mediaforge/shared";

export interface StoryRewriteShortCliOptions {
  readonly episode?: string;
  readonly input?: string;
  readonly episodeSlug?: string;
  readonly language?: string;
  readonly languages?: string;
  readonly model?: string;
  readonly outputRoot?: string;
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
  readonly compatibilitySource?: boolean;
  readonly force?: boolean;
  readonly json?: boolean;
  readonly verbose?: boolean;
}

function resolveInheritedCliOptions(
  command: Command,
  options: StoryRewriteShortCliOptions
): StoryRewriteShortCliOptions {
  const inherited = command.optsWithGlobals() as StoryRewriteShortCliOptions;
  return {
    ...options,
    ...(options.language ?? inherited.language
      ? { language: options.language ?? inherited.language }
      : {}),
    ...(options.languages ?? inherited.languages
      ? { languages: options.languages ?? inherited.languages }
      : {}),
    ...(options.dryRun ?? inherited.dryRun) !== undefined
      ? { dryRun: options.dryRun ?? inherited.dryRun }
      : {},
    ...(options.json ?? inherited.json) !== undefined
      ? { json: options.json ?? inherited.json }
      : {},
    ...(options.verbose ?? inherited.verbose) !== undefined
      ? { verbose: options.verbose ?? inherited.verbose }
      : {},
  };
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
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

async function preflightOpenAiConnectivity(
  client: Awaited<ReturnType<typeof createOpenAiStoryClientWithOptions>>,
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
      },
      { signal: controller.signal }
    );
  } catch (error) {
    if (controller.signal.aborted) {
      throw new StoryLocalizationApiError(
        `Unable to reach OpenAI before short rewrite started. OpenAI connectivity preflight timed out after ${Math.round(timeoutMs / 1000)} seconds. Check network access, VPN/proxy/firewall settings, OPENAI_BASE_URL, and API credentials. If you are in a restricted sandbox, rerun with outbound network access enabled.`,
        error
      );
    }
    throw new StoryLocalizationApiError(
      `Unable to reach OpenAI before short rewrite started. Check network access, VPN/proxy/firewall settings, OPENAI_BASE_URL, and API credentials. If you are in a restricted sandbox, rerun with outbound network access enabled. Original error: ${describeOpenAiStoryLocalizationError(error)}`,
      error
    );
  } finally {
    clearTimeout(timeout);
  }
}

function parseLanguageList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => normalizeWhitespace(entry).toLowerCase())
    .filter((entry) => entry.length > 0);
}

function normalizeRequestedLanguages(options: StoryRewriteShortCliOptions): StoryLanguage[] {
  const raw = [...parseLanguageList(options.language), ...parseLanguageList(options.languages)];
  const supported = new Set<StoryLanguage>(Object.keys(SUPPORTED_STORY_LANGUAGES) as StoryLanguage[]);
  const normalized: StoryLanguage[] = [];
  const unsupported: string[] = [];
  if (raw.length === 0) {
    normalized.push("en");
    return normalized;
  }
  for (const entry of raw) {
    const primary = entry.split("-", 1)[0] as StoryLanguage;
    if (supported.has(primary)) {
      normalized.push(primary);
    } else {
      unsupported.push(entry);
    }
  }
  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported story language(s): ${unsupported.join(", ")}. Supported values: en, de, es, fr, pt.`
    );
  }
  return [...new Set(normalized)];
}

function resolveModel(
  options: StoryRewriteShortCliOptions,
  runtimeConfig: Awaited<ReturnType<typeof loadRuntimeConfig>>
): string {
  return (
    options.model ??
    runtimeConfig.openAiShortModel ??
    runtimeConfig.openAiStoryModel ??
    DEFAULT_STORY_REWRITE_MODEL
  );
}

function formatSummary(summary: Awaited<ReturnType<typeof rewriteShortStories>>): string {
  const lines = [
    `Episode: ${summary.episodeId} — ${summary.episodeSlug}`,
    `Source: ${summary.sourcePath}`,
    `Languages requested: ${summary.languagesRequested.join(", ")}`,
    `Completed: ${summary.completed}`,
    `Skipped: ${summary.skipped}`,
    `Failed: ${summary.failed}`,
    `Input tokens: ${summary.inputTokens}`,
    `Output tokens: ${summary.outputTokens}`,
    `Estimated cost: ${summary.estimatedCostUsd === null ? "n/a" : `$${summary.estimatedCostUsd.toFixed(4)}`}`,
    `Duration: ${Math.round(summary.generationDurationMs / 1000)}s`,
  ];
  if (summary.failures.length > 0) {
    lines.push("Failures:");
    lines.push(
      ...summary.failures.map(
        (failure) => `- ${failure.language}: ${failure.message}`
      )
    );
  }
  return lines.join("\n");
}

export function registerStoryRewriteShortCommand(storiesCommand: Command): void {
  storiesCommand
    .command("rewrite-short")
    .description("Rewrite an English full-length horror story into localized YouTube Shorts")
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
    .option("--compatibility-source", "allow raw source markdown for short generation")
    .option("--force", "alias for overwrite")
    .option("--json", "print machine-readable output")
    .option("--verbose", "enable verbose logging")
    .action(async function (this: Command, rawOptions: StoryRewriteShortCliOptions) {
      const options = resolveInheritedCliOptions(this, rawOptions);
      const rawArgs = new Set(process.argv.slice(2));
      const commandText = [
        process.env["MEDIAFORGE_NPM_SCRIPT_COMMAND"] ?? "",
        process.argv.join(" "),
      ].join(" ");
      const hasDryRunFlag =
        rawArgs.has("--dry-run") || commandText.includes("--dry-run");
      const runtimeConfig = await loadRuntimeConfig();
      const outputRoot = path.resolve(options.outputRoot ?? runtimeConfig.workspaceDir);
      const languages = normalizeRequestedLanguages(options);
      if (options.episode && options.input) {
        throw new Error("--episode and --input are mutually exclusive.");
      }
      if (!options.episode && !options.input) {
        throw new Error("Either --episode or --input is required.");
      }
      const timeoutMs = options.timeoutMs ?? SHORT_REWRITE_DEFAULT_TIMEOUT_MS;
      const maxRetries = options.maxRetries ?? 2;
      const model = resolveModel(options, runtimeConfig);
      const client = options.dryRun || hasDryRunFlag
        ? undefined
        : createOpenAiStoryClientWithOptions({
            apiKey: runtimeConfig.openAiCompatibleApiKey ?? undefined,
            baseUrl: runtimeConfig.openAiCompatibleBaseUrl ?? undefined,
            timeoutMs,
            maxRetries,
          });
      const logger = createLogger(options.verbose ? "debug" : runtimeConfig.logLevel, process.stderr);
      const controller = new AbortController();
      const abort = (): void => {
        controller.abort(new Error("Short rewrite interrupted."));
      };
      process.once("SIGINT", abort);
      process.once("SIGTERM", abort);
      try {
        if (client) {
          await preflightOpenAiConnectivity(client, model, 60_000);
        }
        const serviceOptions = {
          logger,
          signal: controller.signal,
          ...(client ? { client } : {}),
        };
        const summary = await rewriteShortStories(
          {
            inputPath: options.input,
            episode: options.episode,
            episodeSlug: options.episodeSlug,
            outputRoot,
            languages,
            model,
            maxOutputTokens:
              options.maxOutputTokens ??
              runtimeConfig.openAiShortMaxOutputTokens ??
              runtimeConfig.openAiShortRewriteMaxOutputTokens ??
              DEFAULT_SHORT_REWRITE_MAX_OUTPUT_TOKENS,
            retryMaxOutputTokens:
              options.retryMaxOutputTokens ??
              runtimeConfig.openAiShortRewriteRetryMaxOutputTokens ??
              DEFAULT_SHORT_REWRITE_RETRY_MAX_OUTPUT_TOKENS,
            repairModel:
              runtimeConfig.openAiValidatorModel ??
              runtimeConfig.openAiMetadataModel,
            repairReasoningEffort:
              runtimeConfig.openAiValidatorReasoningEffort ??
              runtimeConfig.openAiMetadataReasoningEffort,
            repairMaxOutputTokens:
              runtimeConfig.openAiValidatorMaxOutputTokens ??
              runtimeConfig.openAiMetadataMaxOutputTokens,
            temperature: options.temperature ?? runtimeConfig.openAiStoryTemperature ?? SHORT_REWRITE_DEFAULT_TEMPERATURE,
            reasoningEffort:
              options.reasoningEffort ??
              runtimeConfig.openAiShortReasoningEffort ??
              runtimeConfig.openAiStoryReasoningEffort ??
              DEFAULT_STORY_REWRITE_REASONING_EFFORT,
            maxConcurrency: options.maxConcurrency,
            timeoutMs,
            maxRetries,
            overwrite: options.overwrite ?? options.force ?? false,
            resume: options.resume ?? false,
            dryRun: options.dryRun || hasDryRunFlag,
            allowSourceInput: options.compatibilitySource ?? false,
            force: options.force ?? false,
            verbose: options.verbose ?? false,
            json: options.json ?? false,
          } satisfies ShortRewriteRunOptions,
          serviceOptions
        );
        if (options.json) {
          printJson(summary);
        } else {
          process.stdout.write(`${formatSummary(summary)}\n`);
        }
        if (summary.failed > 0) {
          process.exitCode = 1;
        }
      } finally {
        process.off("SIGINT", abort);
        process.off("SIGTERM", abort);
      }
    });
}
