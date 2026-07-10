import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { runCommand } from "@mediaforge/process-runner";
import {
  loadProductionStatuses,
  type StoryWorkflowSelectionOptions,
} from "./story-workflow-command-helpers.js";
import { mergeCommandOptions } from "./command-option-helpers.js";

export interface StoryAudioCliOptions extends StoryWorkflowSelectionOptions {
  readonly languages?: string;
  readonly profiles?: string;
  readonly onlyReady?: boolean;
  readonly force?: boolean;
  readonly strict?: boolean;
  readonly json?: boolean;
}

interface StoryAudioIo {
  readonly stdout: Pick<typeof process.stdout, "write">;
}

interface StoryAudioTarget {
  readonly episodeId: string;
  readonly locale: string;
  readonly variant: string;
  readonly status: "ready" | "retryable" | "blocked" | "waiting" | "completed";
  readonly reason?: string;
}

interface StoryAudioCommandResult {
  readonly generatedAt: string;
  readonly strictMode: boolean;
  readonly summary: {
    readonly success: number;
    readonly warning: number;
    readonly blocked: number;
    readonly failed: number;
    readonly total: number;
  };
  readonly exitCode: number;
  readonly targets: readonly unknown[];
}

interface StoryAudioExecutionResult {
  readonly episodeId: string;
  readonly locale: string;
  readonly variant: string;
  readonly exitCode: number;
  readonly summary: StoryAudioCommandResult["summary"];
}

interface StoryAudioSkippedTarget {
  readonly episodeId: string;
  readonly locale: string;
  readonly variant: string;
  readonly reason: string;
}

const mediaforgeBinPath = fileURLToPath(
  new URL("../bin/mediaforge.js", import.meta.url)
);

function splitCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function formatTarget(target: {
  readonly episodeId: string;
  readonly locale: string;
  readonly variant: string;
}): string {
  return `${target.episodeId} / ${target.locale} / ${target.variant}`;
}

function targetMatchesFilters(
  target: Pick<StoryAudioTarget, "locale" | "variant">,
  options: Pick<StoryAudioCliOptions, "languages" | "profiles">
): boolean {
  const languages = new Set(splitCsv(options.languages));
  const profiles = new Set(splitCsv(options.profiles));
  if (languages.size > 0 && !languages.has(target.locale)) {
    return false;
  }
  if (profiles.size > 0 && !profiles.has(target.variant)) {
    return false;
  }
  return true;
}

function selectAudioTargets(
  options: StoryAudioCliOptions,
  statuses: Awaited<ReturnType<typeof loadProductionStatuses>>
): readonly StoryAudioTarget[] {
  const deduped = new Map<string, StoryAudioTarget>();
  for (const status of statuses) {
    for (const entry of status.report.entries) {
      if (
        entry.stageType !== "audio" ||
        entry.locale === undefined ||
        entry.format === undefined ||
        !targetMatchesFilters(
          { locale: entry.locale, variant: entry.format },
          options
        )
      ) {
        continue;
      }
      deduped.set(`${entry.episodeId}:${entry.locale}:${entry.format}`, {
        episodeId: entry.episodeId,
        locale: entry.locale,
        variant: entry.format,
        status: entry.status,
        ...(entry.message
          ? { reason: entry.message }
          : entry.blockedBy[0]?.message
            ? { reason: entry.blockedBy[0].message }
            : {}),
      });
    }
  }
  return [...deduped.values()].sort((left, right) =>
    [
      left.episodeId.localeCompare(right.episodeId),
      left.locale.localeCompare(right.locale),
      left.variant.localeCompare(right.variant),
    ].find((value) => value !== 0) ?? 0
  );
}

async function runAudioTarget(args: {
  readonly target: StoryAudioTarget;
  readonly mode: "generate" | "validate";
  readonly options: StoryAudioCliOptions;
}): Promise<StoryAudioExecutionResult> {
  const command = [
    mediaforgeBinPath,
    "--json",
    ...(args.options.outputRoot !== undefined
      ? ["--workspace", args.options.outputRoot]
      : []),
    "audio",
    "narration",
    "validate",
    "--episode",
    args.target.episodeId,
    "--language",
    args.target.locale,
    "--variant",
    args.target.variant,
    ...(args.options.strict ? ["--strict"] : []),
    ...(args.mode === "generate"
      ? args.options.force
        ? ["--force"]
        : ["--resume"]
      : ["--validation-only"]),
  ];
  const result = await runCommand(process.execPath, command, {
    allowNonZeroExit: true,
  });
  const parsed = JSON.parse(result.stdout) as StoryAudioCommandResult;
  return {
    episodeId: args.target.episodeId,
    locale: args.target.locale,
    variant: args.target.variant,
    exitCode: result.exitCode,
    summary: parsed.summary,
  };
}

async function runStoryAudioCommand(
  mode: "generate" | "validate",
  options: StoryAudioCliOptions,
  io: StoryAudioIo = { stdout: process.stdout }
): Promise<void> {
  const statuses = await loadProductionStatuses(options);
  const targets = selectAudioTargets(options, statuses);
  const executableStatuses =
    mode === "validate"
      ? new Set<StoryAudioTarget["status"]>(["completed"])
      : new Set<StoryAudioTarget["status"]>(["ready", "retryable"]);
  const executable = targets.filter((target) =>
    executableStatuses.has(target.status)
  );
  const skipped = targets
    .filter((target) => !executableStatuses.has(target.status))
    .map(
      (target): StoryAudioSkippedTarget => ({
        episodeId: target.episodeId,
        locale: target.locale,
        variant: target.variant,
        reason:
          target.reason ??
          `Audio target is ${target.status}, not ready for ${mode}.`,
      })
    );

  if (executable.length === 0 && !options.onlyReady) {
    throw new Error(`No ready audio targets matched the selection for stories audio ${mode}.`);
  }

  const results: StoryAudioExecutionResult[] = [];
  for (const target of executable) {
    results.push(await runAudioTarget({ target, mode, options }));
  }

  const summary = {
    executed: results.length,
    skipped: skipped.length,
    success: results.reduce((count, result) => count + result.summary.success, 0),
    warning: results.reduce((count, result) => count + result.summary.warning, 0),
    blocked: results.reduce((count, result) => count + result.summary.blocked, 0),
    failed: results.reduce((count, result) => count + result.summary.failed, 0),
  };

  if (results.some((result) => result.exitCode !== 0)) {
    process.exitCode = 1;
  }

  if (options.json) {
    io.stdout.write(
      `${JSON.stringify({ mode, summary, results, skipped }, null, 2)}\n`
    );
    return;
  }

  io.stdout.write(
    [
      `Stories audio ${mode}: executed ${summary.executed}, skipped ${summary.skipped}`,
      `Summary: ${summary.success} success, ${summary.warning} warning, ${summary.blocked} blocked, ${summary.failed} failed`,
      ...results.map(
        (result) =>
          `- ${formatTarget(result)} | success=${result.summary.success} warning=${result.summary.warning} blocked=${result.summary.blocked} failed=${result.summary.failed}`
      ),
      ...(skipped.length > 0
        ? [
            "Skipped:",
            ...skipped.map(
              (target) =>
                `- ${formatTarget(target)} | reason=${target.reason}`
            ),
          ]
        : []),
    ].join("\n") + "\n"
  );
}

export async function commandStoriesAudioGenerate(
  options: StoryAudioCliOptions,
  io: StoryAudioIo = { stdout: process.stdout }
): Promise<void> {
  await runStoryAudioCommand("generate", options, io);
}

export async function commandStoriesAudioValidate(
  options: StoryAudioCliOptions,
  io: StoryAudioIo = { stdout: process.stdout }
): Promise<void> {
  await runStoryAudioCommand("validate", options, io);
}

export function registerStoryAudioCommand(storiesCommand: Command): void {
  const audio = storiesCommand
    .command("audio")
    .description("Story-oriented narration execution wrappers");
  for (const entry of [
    {
      name: "generate",
      description: "Run narration generation through the staged validate surface",
      action: commandStoriesAudioGenerate,
    },
    {
      name: "validate",
      description: "Validate existing narration artifacts without mutation",
      action: commandStoriesAudioValidate,
    },
  ] as const) {
    audio
      .command(entry.name)
      .option("--episode <slug-or-number>", "episode slug or number")
      .option("--episodes <comma-separated-episodes>", "episode slugs or numbers")
      .option("--workflow <workflow-id>", "workflow id for single-episode reads")
      .option("--output-root <path>", "episode workspace root")
      .option("--languages <comma-separated-languages>", "target locales")
      .option("--profiles <comma-separated-profiles>", "target profiles")
      .option("--only-ready", "skip blocked outputs instead of failing")
      .option("--force", "rerun completed targets")
      .option("--strict", "treat warnings as a non-zero nested narration result")
      .option("--json", "print machine-readable output")
      .action((opts: StoryAudioCliOptions, command: Command) =>
        entry.action(mergeCommandOptions(command, opts))
      );
  }
}
