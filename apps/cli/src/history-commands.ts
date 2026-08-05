import { Command } from "commander";

export type HistoryContentPackMode = "strict" | "lenient";
export type HistoryBatchFailureMode = "fail-fast" | "collect-errors";

export interface HistoryContentPackRequest {
  readonly packPath: string;
  readonly genre: "history";
  readonly mode: HistoryContentPackMode;
}

export interface HistoryContentPackImportRequest
  extends HistoryContentPackRequest {
  readonly dryRun: boolean;
  readonly failureMode: HistoryBatchFailureMode;
}

/**
 * The CLI deliberately receives these operations instead of constructing a
 * provider runtime. Structural content-pack operations must remain offline.
 */
export interface HistoryCommandDependencies {
  readonly listHistoryPresets: () => readonly unknown[];
  readonly inspectHistoryContentPack: (packPath: string) => Promise<unknown>;
  readonly validateHistoryContentPack: (
    request: HistoryContentPackRequest
  ) => Promise<unknown>;
  readonly importHistoryContentPack: (
    request: HistoryContentPackImportRequest
  ) => Promise<unknown>;
  readonly inspectHistoryWorkflow?: (request: { readonly episodeId: string; readonly outputRoot?: string }) => Promise<unknown>;
  readonly getHistoryNextStep?: (request: { readonly episodeId: string; readonly outputRoot?: string }) => Promise<unknown>;
  readonly validateHistoryEpisodeFactuality?: (request: { readonly episodeId: string; readonly outputRoot?: string; readonly write?: boolean }) => Promise<unknown>;
}

interface ContentPackOptions {
  readonly genre?: string;
  readonly strict?: boolean;
  readonly lenient?: boolean;
  readonly dryRun?: boolean;
  readonly failFast?: boolean;
  readonly collectErrors?: boolean;
  readonly json?: boolean;
}

function emit(value: unknown, json: boolean | undefined): void {
  process.stdout.write(`${JSON.stringify(value, null, json ? 2 : undefined)}\n`);
}

function requireHistoryGenre(genre: string | undefined): "history" {
  if (genre === undefined || genre === "history") return "history";
  throw new Error(`History content packs require --genre history; received ${genre}.`);
}

function resolveMode(options: ContentPackOptions): HistoryContentPackMode {
  if (options.strict && options.lenient) {
    throw new Error("Use either --strict or --lenient, not both.");
  }
  return options.lenient ? "lenient" : "strict";
}

function resolveFailureMode(
  options: ContentPackOptions
): HistoryBatchFailureMode {
  if (options.failFast && options.collectErrors) {
    throw new Error("Use either --fail-fast or --collect-errors, not both.");
  }
  return options.failFast ? "fail-fast" : "collect-errors";
}

function contentPackOptions(command: Command): Command {
  return command
    .option("--genre <id>", "canonical target genre", "history")
    .option("--strict", "fail on safe manifest or editorial contract mismatches")
    .option("--lenient", "report safe compatibility mismatches as warnings")
    .option("--json", "emit machine-readable output");
}

/** Registers offline History preset and reusable content-pack operations. */
export function registerHistoryCommands(
  program: Command,
  dependencies: HistoryCommandDependencies
): void {
  const inherited = (): { readonly dryRun?: boolean; readonly json?: boolean } =>
    program.opts<{ readonly dryRun?: boolean; readonly json?: boolean }>();
  const history = program
    .command("history")
    .description("Inspect and advance History documentary workflows");
  history.command("presets")
    .description("List the available History documentary presets")
    .option("--json", "emit machine-readable output")
    .action((options: { readonly json?: boolean }) => {
      emit({ genre: "history", presets: dependencies.listHistoryPresets() }, options.json ?? inherited().json);
    });

  if (dependencies.inspectHistoryWorkflow && dependencies.getHistoryNextStep) {
    const workflow = history.command("workflow").description("Inspect offline History workflow state");
    workflow.command("status <episode-id>")
      .option("--output-root <path>")
      .option("--json")
      .action(async (episodeId: string, options: { readonly outputRoot?: string; readonly json?: boolean }) => {
        emit(await dependencies.inspectHistoryWorkflow!({ episodeId, ...(options.outputRoot ? { outputRoot: options.outputRoot } : {}) }), options.json ?? inherited().json);
      });
    workflow.command("next <episode-id>")
      .option("--output-root <path>")
      .option("--json")
      .action(async (episodeId: string, options: { readonly outputRoot?: string; readonly json?: boolean }) => {
        emit(await dependencies.getHistoryNextStep!({ episodeId, ...(options.outputRoot ? { outputRoot: options.outputRoot } : {}) }), options.json ?? inherited().json);
      });
  }

  if (dependencies.validateHistoryEpisodeFactuality) {
    history.command("factuality")
      .description("Run deterministic History factuality checks")
      .command("validate <episode-id>")
      .option("--output-root <path>")
      .option("--write", "persist an audit after required research artifacts exist")
      .option("--json")
      .action(async (episodeId: string, options: { readonly outputRoot?: string; readonly write?: boolean; readonly json?: boolean }) => {
        emit(await dependencies.validateHistoryEpisodeFactuality!({ episodeId, ...(options.outputRoot ? { outputRoot: options.outputRoot } : {}), ...(options.write ? { write: true } : {}) }), options.json ?? inherited().json);
      });
  }

  const contentPack = program
    .command("content-pack")
    .description("Inspect, validate, and import reusable editorial content packs");

  contentPack
    .command("inspect <pack-path>")
    .description("Inspect a History content pack without importing it")
    .option("--json", "emit machine-readable output")
    .action(async (packPath: string, options: { readonly json?: boolean }) => {
      emit(await dependencies.inspectHistoryContentPack(packPath), options.json ?? inherited().json);
    });

  contentPackOptions(
    contentPack
      .command("validate <pack-path>")
      .description("Validate a History pack structurally without provider calls")
  ).action(async (packPath: string, options: ContentPackOptions) => {
    const result = await dependencies.validateHistoryContentPack({
      packPath,
      genre: requireHistoryGenre(options.genre),
      mode: resolveMode(options),
    });
    emit(result, options.json ?? inherited().json);
  });

  contentPackOptions(
    contentPack
      .command("import <pack-path>")
      .description("Import a validated History pack into the canonical workflow")
      .option("--dry-run", "validate and plan without writing production artifacts")
      .option("--fail-fast", "stop the bounded batch on its first episode error")
      .option("--collect-errors", "complete independent files and report all errors")
  ).action(async (packPath: string, options: ContentPackOptions) => {
    const result = await dependencies.importHistoryContentPack({
      packPath,
      genre: requireHistoryGenre(options.genre),
      mode: resolveMode(options),
      dryRun: options.dryRun ?? inherited().dryRun ?? false,
      failureMode: resolveFailureMode(options),
    });
    emit(result, options.json ?? inherited().json);
  });
}
