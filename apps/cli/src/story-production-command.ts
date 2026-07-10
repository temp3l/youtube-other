import { Command } from "commander";
import {
  type StoryProductionStatusEntry,
  type StoryProductionStatusReport,
} from "@mediaforge/story-localization";
import {
  loadProductionStatuses,
  type LoadedProductionStatus,
  type StoryWorkflowSelectionOptions,
} from "./story-workflow-command-helpers.js";
import { mergeCommandOptions } from "./command-option-helpers.js";
import {
  collectStoryProductionRepairSuggestions,
  registerStoryProductionRepairCommand,
} from "./story-render-command.js";

export interface StoryProductionCliOptions extends StoryWorkflowSelectionOptions {
  readonly limit?: number;
  readonly languages?: string;
  readonly profiles?: string;
  readonly json?: boolean;
}

interface StoryProductionIo {
  readonly stdout: Pick<typeof process.stdout, "write">;
}

interface StoryProductionBatchAction {
  readonly episodeId: string;
  readonly status: "ready" | "retryable" | "blocked" | "waiting" | "completed";
  readonly stageTypes: readonly string[];
  readonly commands: readonly string[];
  readonly reason?: string;
}

interface StoryProductionTodoItem {
  readonly episodeId: string;
  readonly stageType: string;
  readonly locale?: string;
  readonly format?: string;
  readonly reason?: string;
  readonly commands: readonly string[];
}

const actionableStageTypes = new Set([
  "rewrite-full",
  "validate-full",
  "quality-full",
  "localize-full",
  "rewrite-short",
  "validate-short",
  "quality-short",
  "scene-extraction",
  "visual-model",
  "image-prompt",
  "image-generation",
  "thumbnail",
  "audio",
  "render",
]);

const stagePriority = new Map(
  [
    "rewrite-full",
    "validate-full",
    "quality-full",
    "localize-full",
    "rewrite-short",
    "validate-short",
    "quality-short",
    "scene-extraction",
    "visual-model",
    "image-prompt",
    "image-generation",
    "thumbnail",
    "audio",
    "render",
  ].map((stageType, index) => [stageType, index])
);

function formatEntry(entry: StoryProductionStatusEntry): string {
  const target = [entry.episodeId, entry.locale, entry.format].filter(Boolean).join(" / ");
  const reason =
    entry.message ??
    entry.blockedBy[0]?.message ??
    entry.waitingOn[0]?.message;
  return [
    `- ${entry.stageType} :: ${target || entry.episodeId}`,
    `status=${entry.status}`,
    reason ? `reason=${reason}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" | ");
}

function formatStatusReport(report: StoryProductionStatusReport): string {
  const ready = report.entries.filter((entry) => entry.status === "ready");
  const retryable = report.entries.filter((entry) => entry.status === "retryable");
  const blocked = report.entries.filter((entry) => entry.status === "blocked");
  const waiting = report.entries.filter((entry) => entry.status === "waiting");
  return [
    `Workflow: ${report.workflowId}`,
    `Execution: ${report.executionId}`,
    `Episode: ${report.episodeId}`,
    `Summary: ${report.summary.ready} ready, ${report.summary.retryable} retryable, ${report.summary.blocked} blocked, ${report.summary.waiting} waiting, ${report.summary.completed} completed`,
    "Categories:",
    ...report.categories.map(
      (category) =>
        `- ${category.category}: ${category.ready} ready, ${category.retryable} retryable, ${category.blocked} blocked, ${category.waiting} waiting, ${category.completed} completed`
    ),
    ...(ready.length > 0 ? ["Ready:", ...ready.map(formatEntry)] : []),
    ...(retryable.length > 0
      ? ["Retryable:", ...retryable.map(formatEntry)]
      : []),
    ...(blocked.length > 0 ? ["Blocked:", ...blocked.map(formatEntry)] : []),
    ...(waiting.length > 0 ? ["Waiting:", ...waiting.map(formatEntry)] : []),
  ].join("\n");
}

function collectActionableEntries(
  statuses: readonly LoadedProductionStatus[],
  limit: number
): readonly StoryProductionStatusEntry[] {
  return statuses
    .flatMap((entry) => entry.report.entries)
    .filter(
      (entry) =>
        (entry.status === "ready" || entry.status === "retryable") &&
        actionableStageTypes.has(entry.stageType)
    )
    .sort((left, right) =>
      [
        left.episodeId.localeCompare(right.episodeId),
        left.status.localeCompare(right.status),
        left.stageType.localeCompare(right.stageType),
        (left.locale ?? "").localeCompare(right.locale ?? ""),
        (left.format ?? "").localeCompare(right.format ?? ""),
      ].find((value) => value !== 0) ?? 0
    )
    .slice(0, limit);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort((left, right) =>
    left.localeCompare(right)
  );
}

function parseOptionalCsv(value: string | undefined): ReadonlySet<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  );
}

function entryMatchesFilters(
  entry: StoryProductionStatusEntry,
  options: Pick<StoryProductionCliOptions, "languages" | "profiles">
): boolean {
  const languages = parseOptionalCsv(options.languages);
  const profiles = parseOptionalCsv(options.profiles);
  if (languages.size > 0 && entry.locale && !languages.has(entry.locale)) {
    return false;
  }
  if (profiles.size > 0 && entry.format && !profiles.has(entry.format)) {
    return false;
  }
  return true;
}

function stageTypePriority(stageType: string): number {
  return stagePriority.get(stageType) ?? Number.MAX_SAFE_INTEGER;
}

function sortEntries(
  entries: readonly StoryProductionStatusEntry[]
): readonly StoryProductionStatusEntry[] {
  return [...entries].sort((left, right) =>
    [
      stageTypePriority(left.stageType),
      (left.locale ?? "").localeCompare(right.locale ?? ""),
      (left.format ?? "").localeCompare(right.format ?? ""),
    ].find((value) => value !== 0) ?? 0
  );
}

function describeTarget(args: {
  readonly episodeId: string;
  readonly locale?: string;
  readonly format?: string;
}): string {
  return [args.episodeId, args.locale, args.format].filter(Boolean).join(" / ");
}

function formatAction(action: StoryProductionBatchAction): string {
  return [
    `- ${action.episodeId}`,
    `status=${action.status}`,
    action.stageTypes.length > 0 ? `stage=${action.stageTypes.join(",")}` : null,
    action.reason ? `reason=${action.reason}` : null,
    action.commands[0] ? `cmd=${action.commands[0]}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" | ");
}

function formatTodoItem(item: StoryProductionTodoItem): string {
  return [
    `- ${describeTarget(item)}`,
    `stage=${item.stageType}`,
    item.reason ? `reason=${item.reason}` : null,
    ...item.commands.map((command) => `  cmd: ${command}`),
  ]
    .filter((part): part is string => part !== null)
    .join("\n");
}

function buildFullRewriteCommand(
  episodeId: string,
  entries: readonly StoryProductionStatusEntry[]
): readonly string[] {
  const languages = uniqueSorted(
    entries
      .map((entry) => entry.locale ?? "")
      .filter((locale) => locale.length > 0 && locale !== "en")
  );
  return [
    [
      `npm run mediaforge -- stories rewrite-full --episode ${episodeId}`,
      ...(languages.length > 0 ? [`--languages ${languages.join(",")}`] : []),
      "--resume",
    ].join(" "),
  ];
}

function buildShortRewriteCommand(
  episodeId: string,
  entries: readonly StoryProductionStatusEntry[]
): readonly string[] {
  const languages = uniqueSorted(
    entries
      .map((entry) => entry.locale ?? "")
      .filter((locale) => locale.length > 0)
  );
  return [
    [
      `npm run mediaforge -- stories rewrite-short --episode ${episodeId}`,
      ...(languages.length > 0 ? [`--languages ${languages.join(",")}`] : []),
      "--resume",
    ].join(" "),
  ];
}

function buildImageResumeCommand(episodeId: string): readonly string[] {
  return [
    `npm run mediaforge -- stories images generate --episode ${episodeId} --only-ready`,
  ];
}

function buildAudioCommands(
  episodeId: string,
  entries: readonly StoryProductionStatusEntry[]
): readonly string[] {
  const filtered = sortEntries(entries).filter(
    (
      entry
    ): entry is StoryProductionStatusEntry & {
      readonly locale: string;
      readonly format: string;
    } => entry.locale !== undefined && entry.format !== undefined
  );
  const languages = uniqueSorted(filtered.map((entry) => entry.locale));
  const profiles = uniqueSorted(filtered.map((entry) => entry.format));
  return [
    [
      `npm run mediaforge -- stories audio generate --episode ${episodeId}`,
      ...(languages.length > 0 ? [`--languages ${languages.join(",")}`] : []),
      ...(profiles.length > 0 ? [`--profiles ${profiles.join(",")}`] : []),
      "--only-ready",
    ].join(" "),
  ];
}

function buildRenderCommand(
  episodeId: string,
  entries: readonly StoryProductionStatusEntry[]
): readonly string[] {
  const languages = uniqueSorted(
    entries
      .map((entry) => entry.locale ?? "")
      .filter((locale) => locale.length > 0)
  );
  const profiles = uniqueSorted(
    entries
      .map((entry) => entry.format ?? "")
      .filter((format) => format.length > 0)
  );
  return [
    [
      `npm run mediaforge -- stories render --episode ${episodeId}`,
      ...(languages.length > 0 ? [`--languages ${languages.join(",")}`] : []),
      ...(profiles.length > 0 ? [`--profiles ${profiles.join(",")}`] : []),
      "--only-ready",
    ].join(" "),
  ];
}

function commandsForEntries(
  episodeId: string,
  entries: readonly StoryProductionStatusEntry[]
): readonly string[] {
  const ordered = sortEntries(entries);
  const first = ordered[0];
  if (!first) {
    return [];
  }
  if (
    first.stageType === "rewrite-full" ||
    first.stageType === "validate-full" ||
    first.stageType === "quality-full" ||
    first.stageType === "localize-full"
  ) {
    return buildFullRewriteCommand(episodeId, ordered);
  }
  if (
    first.stageType === "rewrite-short" ||
    first.stageType === "validate-short" ||
    first.stageType === "quality-short"
  ) {
    return buildShortRewriteCommand(episodeId, ordered);
  }
  if (
    first.stageType === "scene-extraction" ||
    first.stageType === "visual-model" ||
    first.stageType === "image-prompt" ||
    first.stageType === "image-generation" ||
    first.stageType === "thumbnail"
  ) {
    return buildImageResumeCommand(episodeId);
  }
  if (first.stageType === "audio") {
    return buildAudioCommands(episodeId, ordered);
  }
  if (first.stageType === "render") {
    return buildRenderCommand(episodeId, ordered);
  }
  return [];
}

function buildAction(
  report: StoryProductionStatusReport,
  options: Pick<StoryProductionCliOptions, "languages" | "profiles">
): StoryProductionBatchAction {
  const retryable = sortEntries(
    report.entries.filter(
      (entry) =>
        entry.status === "retryable" &&
        actionableStageTypes.has(entry.stageType) &&
        entryMatchesFilters(entry, options)
    )
  );
  if (retryable.length > 0) {
    return {
      episodeId: report.episodeId,
      status: "retryable",
      stageTypes: uniqueSorted(retryable.map((entry) => entry.stageType)),
      commands: [
        `npm run mediaforge -- stories batch todo --episode ${report.episodeId}`,
      ],
      reason: retryable[0]?.message,
    };
  }

  const blocked = sortEntries(
    report.entries.filter(
      (entry) =>
        entry.status === "blocked" &&
        actionableStageTypes.has(entry.stageType) &&
        entryMatchesFilters(entry, options)
    )
  );
  if (blocked.length > 0) {
    return {
      episodeId: report.episodeId,
      status: "blocked",
      stageTypes: uniqueSorted(blocked.map((entry) => entry.stageType)),
      commands: [
        `npm run mediaforge -- stories batch todo --episode ${report.episodeId}`,
      ],
      reason: blocked[0]?.message,
    };
  }

  const ready = sortEntries(
    report.entries.filter(
      (entry) =>
        entry.status === "ready" &&
        actionableStageTypes.has(entry.stageType) &&
        entryMatchesFilters(entry, options)
    )
  );
  if (ready.length > 0) {
    const firstPriority = stageTypePriority(ready[0]?.stageType ?? "");
    const nextEntries = ready.filter(
      (entry) => stageTypePriority(entry.stageType) === firstPriority
    );
    return {
      episodeId: report.episodeId,
      status: "ready",
      stageTypes: uniqueSorted(nextEntries.map((entry) => entry.stageType)),
      commands: commandsForEntries(report.episodeId, nextEntries),
      reason: nextEntries[0]?.message,
    };
  }

  if (report.summary.waiting > 0) {
    return {
      episodeId: report.episodeId,
      status: "waiting",
      stageTypes: [],
      commands: [],
      reason: "Waiting on upstream stages.",
    };
  }

  return {
    episodeId: report.episodeId,
    status: "completed",
    stageTypes: [],
    commands: [],
    reason: "All actionable stages are complete.",
  };
}

function limitItems<T>(items: readonly T[], limit: number | undefined): readonly T[] {
  return items.slice(0, limit ?? items.length);
}

export async function commandStoriesProductionStatus(
  options: StoryProductionCliOptions,
  io: StoryProductionIo = { stdout: process.stdout }
): Promise<void> {
  const statuses = await loadProductionStatuses(options);
  if (options.json) {
    io.stdout.write(
      `${JSON.stringify(statuses.map((entry) => entry.report), null, 2)}\n`
    );
    return;
  }
  io.stdout.write(
    `${statuses.map((entry) => formatStatusReport(entry.report)).join("\n\n")}\n`
  );
}

export async function commandStoriesProductionNext(
  options: StoryProductionCliOptions,
  io: StoryProductionIo = { stdout: process.stdout }
): Promise<void> {
  const statuses = await loadProductionStatuses(options);
  const limit = options.limit ?? 20;
  const actionable = collectActionableEntries(statuses, limit);
  if (options.json) {
    io.stdout.write(`${JSON.stringify({ actionable }, null, 2)}\n`);
    return;
  }
  io.stdout.write(
    [
      `Next actionable stages: ${actionable.length}`,
      ...(actionable.length > 0
        ? actionable.map(formatEntry)
        : ["- none"]),
    ].join("\n") + "\n"
  );
}

export async function commandStoriesProductionResume(
  options: StoryProductionCliOptions,
  io: StoryProductionIo = { stdout: process.stdout }
): Promise<void> {
  const statuses = await loadProductionStatuses(options);
  const limit = options.limit ?? 20;
  const actionable = collectActionableEntries(statuses, limit);
  if (options.json) {
    io.stdout.write(
      `${JSON.stringify({ resumed: [], actionable, blocked: statuses.map((entry) => entry.report.summary.blocked).reduce((sum, count) => sum + count, 0) }, null, 2)}\n`
    );
    return;
  }
  io.stdout.write(
    [
      "Resume plan:",
      ...(actionable.length > 0
        ? actionable.map(formatEntry)
        : ["- no eligible stages"]),
      "Blocked and waiting stages were excluded from resume planning.",
    ].join("\n") + "\n"
  );
}

export async function commandStoriesProductionBatch(
  options: StoryProductionCliOptions,
  io: StoryProductionIo = { stdout: process.stdout }
): Promise<void> {
  const statuses = await loadProductionStatuses(options);
  const actions = statuses.map((entry) => buildAction(entry.report, options));
  const payload = {
    summary: {
      ready: actions.filter((action) => action.status === "ready").length,
      retryable: actions.filter((action) => action.status === "retryable").length,
      blocked: actions.filter((action) => action.status === "blocked").length,
      waiting: actions.filter((action) => action.status === "waiting").length,
      completed: actions.filter((action) => action.status === "completed").length,
    },
    actions: limitItems(actions, options.limit),
  };
  if (options.json) {
    io.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  io.stdout.write(
    [
      `Production batch: ${payload.actions.length} episodes`,
      `Summary: ${payload.summary.ready} ready, ${payload.summary.retryable} retryable, ${payload.summary.blocked} blocked, ${payload.summary.waiting} waiting, ${payload.summary.completed} completed`,
      ...payload.actions.map(formatAction),
    ].join("\n") + "\n"
  );
}

export async function commandStoriesBatchTodo(
  options: StoryProductionCliOptions,
  io: StoryProductionIo = { stdout: process.stdout }
): Promise<void> {
  const statuses = await loadProductionStatuses(options);
  const repairSuggestions = await collectStoryProductionRepairSuggestions(options);
  const repairMap = new Map(
    repairSuggestions.map((entry) => [
      `${entry.episodeId}:${entry.locale}:${entry.variant}`,
      entry,
    ])
  );

  const retryable = limitItems(
    statuses.flatMap((status) =>
      sortEntries(
        status.report.entries.filter(
          (entry) =>
            entry.status === "retryable" &&
            actionableStageTypes.has(entry.stageType) &&
            entryMatchesFilters(entry, options)
        )
      ).map((entry) => ({
        episodeId: entry.episodeId,
        stageType: entry.stageType,
        ...(entry.locale ? { locale: entry.locale } : {}),
        ...(entry.format ? { format: entry.format } : {}),
        ...(entry.message ? { reason: entry.message } : {}),
        commands: commandsForEntries(entry.episodeId, [entry]),
      }))
    ),
    options.limit
  );

  const blocked = limitItems(
    statuses.flatMap((status) =>
      sortEntries(
        status.report.entries.filter(
          (entry) =>
            entry.status === "blocked" &&
            actionableStageTypes.has(entry.stageType) &&
            entryMatchesFilters(entry, options)
        )
      ).map((entry) => {
        const repair =
          entry.stageType === "render" && entry.locale && entry.format
            ? repairMap.get(`${entry.episodeId}:${entry.locale}:${entry.format}`)
            : undefined;
        return {
          episodeId: entry.episodeId,
          stageType: entry.stageType,
          ...(entry.locale ? { locale: entry.locale } : {}),
          ...(entry.format ? { format: entry.format } : {}),
          reason:
            repair?.issues[0]?.message ??
            entry.message ??
            entry.blockedBy[0]?.message,
          commands:
            repair?.commands.length && repair.commands.length > 0
              ? repair.commands
              : commandsForEntries(entry.episodeId, [entry]),
        };
      })
    ),
    options.limit
  );

  const ready = limitItems(
    statuses
      .map((status) => buildAction(status.report, options))
      .filter((action) => action.status === "ready")
      .map((action) => ({
        episodeId: action.episodeId,
        stageType: action.stageTypes.join(","),
        ...(action.reason ? { reason: action.reason } : {}),
        commands: action.commands,
      })),
    options.limit
  );

  const payload = {
    summary: {
      retryable: retryable.length,
      blocked: blocked.length,
      ready: ready.length,
    },
    retryable,
    blocked,
    ready,
  };
  if (options.json) {
    io.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  io.stdout.write(
    [
      `Todo summary: ${payload.summary.retryable} retryable, ${payload.summary.blocked} blocked, ${payload.summary.ready} ready`,
      ...(retryable.length > 0
        ? ["Retryable:", ...retryable.map(formatTodoItem)]
        : []),
      ...(blocked.length > 0 ? ["Blocked:", ...blocked.map(formatTodoItem)] : []),
      ...(ready.length > 0 ? ["Ready:", ...ready.map(formatTodoItem)] : []),
    ].join("\n") + "\n"
  );
}

export function registerStoryProductionCommand(storiesCommand: Command): void {
  const production = storiesCommand
    .command("production")
    .description("Inspect gated production readiness from persisted workflow state");
  production
    .command("status")
    .option("--episode <slug-or-number>", "episode slug or number")
    .option("--episodes <comma-separated-episodes>", "episode slugs or numbers")
    .option("--workflow <workflow-id>", "workflow id for single-episode reads")
    .option("--output-root <path>", "episode workspace root")
    .option("--json", "print machine-readable report")
    .action((opts: StoryProductionCliOptions, command: Command) =>
      commandStoriesProductionStatus(mergeCommandOptions(command, opts))
    );
  production
    .command("next")
    .option("--episode <slug-or-number>", "episode slug or number")
    .option("--episodes <comma-separated-episodes>", "episode slugs or numbers")
    .option("--workflow <workflow-id>", "workflow id for single-episode reads")
    .option("--output-root <path>", "episode workspace root")
    .option("--limit <number>", "maximum actionable entries", (value) =>
      Number(value)
    )
    .option("--json", "print machine-readable report")
    .action((opts: StoryProductionCliOptions, command: Command) =>
      commandStoriesProductionNext(mergeCommandOptions(command, opts))
    );
  production
    .command("resume")
    .option("--episode <slug-or-number>", "episode slug or number")
    .option("--episodes <comma-separated-episodes>", "episode slugs or numbers")
    .option("--workflow <workflow-id>", "workflow id for single-episode reads")
    .option("--output-root <path>", "episode workspace root")
    .option("--limit <number>", "maximum actionable entries", (value) =>
      Number(value)
    )
    .option("--json", "print machine-readable report")
    .action((opts: StoryProductionCliOptions, command: Command) =>
      commandStoriesProductionResume(mergeCommandOptions(command, opts))
    );
  production
    .command("batch")
    .option("--episode <slug-or-number>", "episode slug or number")
    .option("--episodes <comma-separated-episodes>", "episode slugs or numbers")
    .option("--workflow <workflow-id>", "workflow id for single-episode reads")
    .option("--output-root <path>", "episode workspace root")
    .option("--limit <number>", "maximum episode actions", (value) => Number(value))
    .option("--languages <comma-separated-languages>", "target locales")
    .option("--profiles <comma-separated-profiles>", "target profiles")
    .option("--json", "print machine-readable report")
    .action((opts: StoryProductionCliOptions, command: Command) =>
      commandStoriesProductionBatch(mergeCommandOptions(command, opts))
    );
  registerStoryProductionRepairCommand(production);
}
