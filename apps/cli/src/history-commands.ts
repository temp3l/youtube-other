import { Command } from "commander";

export type HistoryContentPackMode = "strict" | "lenient";
export type HistoryBatchFailureMode = "fail-fast" | "collect-errors";
export type HistoryPlannerVersion = "v1" | "v2" | "v3" | "v3.1" | "v3.2" | "v3.3";

export interface HistoryContentPackRequest {
  readonly packPath: string;
  readonly genre: "history";
  readonly mode: HistoryContentPackMode;
}

export interface HistoryContentPackImportRequest extends HistoryContentPackRequest {
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
  readonly inspectHistoryWorkflow?: (request: {
    readonly episodeId: string;
    readonly outputRoot?: string;
  }) => Promise<unknown>;
  readonly getHistoryNextStep?: (request: {
    readonly episodeId: string;
    readonly outputRoot?: string;
  }) => Promise<unknown>;
  readonly validateHistoryEpisodeFactuality?: (request: {
    readonly episodeId: string;
    readonly outputRoot?: string;
    readonly write?: boolean;
  }) => Promise<unknown>;
  readonly planHistoryVisuals?: (request: {
    readonly episodeId: string;
    readonly outputRoot?: string;
    readonly plannerVersion?: HistoryPlannerVersion;
    readonly force?: boolean;
  }) => Promise<unknown>;
  readonly decideHistoryVisualApproval?: (request: {
    readonly episodeId: string;
    readonly outputRoot?: string;
    readonly decision: "APPROVED" | "REJECTED";
    readonly planHash?: string;
    readonly reason?: string;
    readonly plannerVersion?: HistoryPlannerVersion;
    readonly derivativeHash?: string;
  }) => Promise<unknown>;
  readonly inspectHistoryVisualsV2?: (request: {
    readonly episodeId: string;
    readonly planHash: string;
    readonly outputRoot?: string;
  }) => Promise<unknown>;
  readonly reconcileHistoryVisualAudioV2?: (request: {
    readonly episodeId: string;
    readonly audioPath: string;
    readonly outputRoot?: string;
  }) => Promise<unknown>;
  readonly createHistoryReviewBundleV3?: (request: {
    readonly episodeId: string;
    readonly output: string;
    readonly outputRoot?: string;
    readonly regenerate?: boolean;
  }) => Promise<unknown>;
  readonly createHistoryReviewBundleV31?: (request: {
    readonly episodeId: string;
    readonly output: string;
    readonly outputRoot?: string;
    readonly regenerate?: boolean;
  }) => Promise<unknown>;
  readonly createHistoryReviewBundleV32?: (request: {
    readonly episodeId: string;
    readonly output: string;
    readonly outputRoot?: string;
    readonly regenerate?: boolean;
  }) => Promise<unknown>;
  readonly createHistoryReviewBundleV33?: (request: {
    readonly episodeId: string;
    readonly output: string;
    readonly outputRoot?: string;
    readonly regenerate?: boolean;
  }) => Promise<unknown>;
  readonly runHistoryV33Workflow?: (request: {
    readonly episodeId: string;
    readonly outputRoot?: string;
    readonly stage:
      | "normalize"
      | "extract-claims"
      | "retrieve-sources"
      | "assess-evidence"
      | "evaluate-provenance"
      | "freeze"
      | "plan"
      | "validate"
      | "export";
    readonly mode?: "offline-fixture" | "live-research" | "reuse-frozen-snapshot";
    readonly refreshSources?: boolean;
    readonly force?: boolean;
    readonly dryRun?: boolean;
    readonly approvalOutput?: string;
  }) => Promise<unknown>;
  readonly createCombinedHistoryApprovalBundleV33?: (request: {
    readonly episodeIds: readonly string[];
    readonly output: string;
    readonly outputRoot?: string;
    readonly regenerate?: boolean;
  }) => Promise<unknown>;
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
  process.stdout.write(
    `${JSON.stringify(value, null, json ? 2 : undefined)}\n`
  );
}

function emitHistoryV33(value: unknown, json: boolean | undefined): void {
  if (json) {
    emit(value, true);
    return;
  }
  const record = value && typeof value === "object"
    ? value as Record<string, unknown>
    : { result: value };
  const lines = [
    `History V3.3 ${String(record["stage"] ?? "workflow")} complete.`,
    ...(record["episodeId"] ? [`Episode: ${String(record["episodeId"])}`] : []),
    ...(record["researchSnapshotHash"] ? [`Research snapshot: ${String(record["researchSnapshotHash"])}`] : []),
    ...(record["planHash"] ? [`Plan: ${String(record["planHash"])}`] : []),
    ...(record["zipSha256"] ? [`ZIP SHA-256: ${String(record["zipSha256"])}`] : []),
    ...(Array.isArray(record["episodes"]) ? [`Episodes: ${record["episodes"].length}`] : []),
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

function requireHistoryGenre(genre: string | undefined): "history" {
  if (genre === undefined || genre === "history") return "history";
  throw new Error(
    `History content packs require --genre history; received ${genre}.`
  );
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
    .option(
      "--strict",
      "fail on safe manifest or editorial contract mismatches"
    )
    .option("--lenient", "report safe compatibility mismatches as warnings")
    .option("--json", "emit machine-readable output");
}

/** Registers offline History preset and reusable content-pack operations. */
export function registerHistoryCommands(
  program: Command,
  dependencies: HistoryCommandDependencies
): void {
  const inherited = (): {
    readonly dryRun?: boolean;
    readonly json?: boolean;
  } => program.opts<{ readonly dryRun?: boolean; readonly json?: boolean }>();
  const history = program
    .command("history")
    .description("Inspect and advance History documentary workflows");
  history
    .command("presets")
    .description("List the available History documentary presets")
    .option("--json", "emit machine-readable output")
    .action((options: { readonly json?: boolean }) => {
      emit(
        { genre: "history", presets: dependencies.listHistoryPresets() },
        options.json ?? inherited().json
      );
    });

  if (dependencies.inspectHistoryWorkflow && dependencies.getHistoryNextStep) {
    const workflow = history
      .command("workflow")
      .description("Inspect offline History workflow state");
    workflow
      .command("status <episode-id>")
      .option("--output-root <path>")
      .option("--json")
      .action(
        async (
          episodeId: string,
          options: { readonly outputRoot?: string; readonly json?: boolean }
        ) => {
          emit(
            await dependencies.inspectHistoryWorkflow!({
              episodeId,
              ...(options.outputRoot ? { outputRoot: options.outputRoot } : {}),
            }),
            options.json ?? inherited().json
          );
        }
      );
    workflow
      .command("next <episode-id>")
      .option("--output-root <path>")
      .option("--json")
      .action(
        async (
          episodeId: string,
          options: { readonly outputRoot?: string; readonly json?: boolean }
        ) => {
          emit(
            await dependencies.getHistoryNextStep!({
              episodeId,
              ...(options.outputRoot ? { outputRoot: options.outputRoot } : {}),
            }),
            options.json ?? inherited().json
          );
        }
      );
  }

  if (dependencies.validateHistoryEpisodeFactuality) {
    history
      .command("factuality")
      .description("Run deterministic History factuality checks")
      .command("validate <episode-id>")
      .option("--output-root <path>")
      .option(
        "--write",
        "persist an audit after required research artifacts exist"
      )
      .option("--json")
      .action(
        async (
          episodeId: string,
          options: {
            readonly outputRoot?: string;
            readonly write?: boolean;
            readonly json?: boolean;
          }
        ) => {
          emit(
            await dependencies.validateHistoryEpisodeFactuality!({
              episodeId,
              ...(options.outputRoot ? { outputRoot: options.outputRoot } : {}),
              ...(options.write ? { write: true } : {}),
            }),
            options.json ?? inherited().json
          );
        }
      );
  }

  if (
    dependencies.planHistoryVisuals &&
    dependencies.decideHistoryVisualApproval
  ) {
    const visuals = history
      .command("visuals")
      .description(
        "Plan and explicitly approve History visuals before media generation"
      );
    visuals
      .command("plan <episode-id>")
      .option("--output-root <path>")
      .option("--planner-version <version>", "opt-in planner version", "v1")
      .option("--force", "regenerate a new versioned planning artifact")
      .option("--json")
      .action(
        async (
          episodeId: string,
          options: {
            readonly outputRoot?: string;
            readonly plannerVersion?: HistoryPlannerVersion;
            readonly force?: boolean;
            readonly json?: boolean;
          }
        ) => {
          emit(
            await dependencies.planHistoryVisuals!({
              episodeId,
              ...(options.plannerVersion === "v2" ||
              options.plannerVersion === "v3" ||
              options.plannerVersion === "v3.1" ||
              options.plannerVersion === "v3.2" ||
              options.plannerVersion === "v3.3"
                ? { plannerVersion: options.plannerVersion }
                : {}),
              ...(options.force ? { force: true } : {}),
              ...(options.outputRoot ? { outputRoot: options.outputRoot } : {}),
            }),
            options.json ?? inherited().json
          );
        }
      );
    visuals
      .command("approve <episode-id>")
      .requiredOption("--plan-hash <sha256>", "current visual plan hash")
      .option(
        "--derivative-hash <sha256>",
        "required for v2 renderable approval"
      )
      .option("--planner-version <version>", "approval artifact version", "v1")
      .option("--output-root <path>")
      .option("--json")
      .action(
        async (
          episodeId: string,
          options: {
            readonly planHash: string;
            readonly derivativeHash?: string;
            readonly plannerVersion?: HistoryPlannerVersion;
            readonly outputRoot?: string;
            readonly json?: boolean;
          }
        ) => {
          emit(
            await dependencies.decideHistoryVisualApproval!({
              episodeId,
              decision: "APPROVED",
              planHash: options.planHash,
              ...(options.derivativeHash
                ? { derivativeHash: options.derivativeHash }
                : {}),
              ...(options.plannerVersion === "v2" ||
              options.plannerVersion === "v3" ||
              options.plannerVersion === "v3.1" ||
              options.plannerVersion === "v3.2" ||
              options.plannerVersion === "v3.3"
                ? { plannerVersion: options.plannerVersion }
                : {}),
              ...(options.outputRoot ? { outputRoot: options.outputRoot } : {}),
            }),
            options.json ?? inherited().json
          );
        }
      );
    visuals
      .command("reject <episode-id>")
      .requiredOption("--reason <text>", "reason the plan needs regeneration")
      .option("--planner-version <version>", "approval artifact version", "v1")
      .option("--output-root <path>")
      .option("--json")
      .action(
        async (
          episodeId: string,
          options: {
            readonly reason: string;
            readonly plannerVersion?: HistoryPlannerVersion;
            readonly outputRoot?: string;
            readonly json?: boolean;
          }
        ) => {
          emit(
            await dependencies.decideHistoryVisualApproval!({
              episodeId,
              decision: "REJECTED",
              reason: options.reason,
              ...(options.plannerVersion === "v2" ||
              options.plannerVersion === "v3" ||
              options.plannerVersion === "v3.1" ||
              options.plannerVersion === "v3.2" ||
              options.plannerVersion === "v3.3"
                ? { plannerVersion: options.plannerVersion }
                : {}),
              ...(options.outputRoot ? { outputRoot: options.outputRoot } : {}),
            }),
            options.json ?? inherited().json
          );
        }
      );
    if (dependencies.inspectHistoryVisualsV2) {
      visuals
        .command("inspect <episode-id>")
        .description(
          "Read the opt-in v2 visual diagnostics without planning or generation"
        )
        .option("--output-root <path>")
        .requiredOption("--plan-hash <sha256>", "v2 plan hash to inspect")
        .option("--json")
        .action(
          async (
            episodeId: string,
            options: {
              readonly outputRoot?: string;
              readonly planHash: string;
              readonly json?: boolean;
            }
          ) => {
            emit(
              await dependencies.inspectHistoryVisualsV2!({
                episodeId,
                planHash: options.planHash,
                ...(options.outputRoot
                  ? { outputRoot: options.outputRoot }
                  : {}),
              }),
              options.json ?? inherited().json
            );
          }
        );
      visuals
        .command("validate <episode-id>")
        .description("Validate/read the immutable opt-in v2 diagnostics")
        .requiredOption("--plan-hash <sha256>", "v2 plan hash to validate")
        .option("--output-root <path>")
        .option("--json")
        .action(
          async (
            episodeId: string,
            options: {
              readonly outputRoot?: string;
              readonly planHash: string;
              readonly json?: boolean;
            }
          ) => {
            emit(
              await dependencies.inspectHistoryVisualsV2!({
                episodeId,
                planHash: options.planHash,
                ...(options.outputRoot
                  ? { outputRoot: options.outputRoot }
                  : {}),
              }),
              options.json ?? inherited().json
            );
          }
        );
    }
    if (dependencies.reconcileHistoryVisualAudioV2) {
      visuals
        .command("reconcile-audio <episode-id>")
        .description(
          "Create a new opt-in v2 timing revision from measured local audio"
        )
        .requiredOption("--audio-path <path>", "local narration audio file")
        .option("--output-root <path>")
        .option("--json")
        .action(
          async (
            episodeId: string,
            options: {
              readonly audioPath: string;
              readonly outputRoot?: string;
              readonly json?: boolean;
            }
          ) => {
            emit(
              await dependencies.reconcileHistoryVisualAudioV2!({
                episodeId,
                audioPath: options.audioPath,
                ...(options.outputRoot
                  ? { outputRoot: options.outputRoot }
                  : {}),
              }),
              options.json ?? inherited().json
            );
          }
        );
    }
    if (
      dependencies.createHistoryReviewBundleV3 ||
      dependencies.createHistoryReviewBundleV31 ||
      dependencies.createHistoryReviewBundleV32 ||
      dependencies.createHistoryReviewBundleV33
    ) {
      visuals
        .command("review-bundle <episode-id>")
        .description(
          "Export a compact, redacted History review ZIP without media generation"
        )
        .requiredOption("--output <directory>")
        .option(
          "--planner-version <version>",
          "review-bundle planner version",
          "v3"
        )
        .option("--output-root <path>")
        .option("--regenerate", "regenerate the selected plan before export")
        .option("--json")
        .action(
          async (
            episodeId: string,
            options: {
              readonly output: string;
              readonly plannerVersion?: "v3" | "v3.1" | "v3.2" | "v3.3";
              readonly outputRoot?: string;
              readonly regenerate?: boolean;
              readonly json?: boolean;
            }
          ) => {
            const create = options.plannerVersion === "v3.3"
              ? dependencies.createHistoryReviewBundleV33
              : options.plannerVersion === "v3.2"
                ? dependencies.createHistoryReviewBundleV32
              : options.plannerVersion === "v3.1"
                ? dependencies.createHistoryReviewBundleV31
                : dependencies.createHistoryReviewBundleV3;
            if (!create)
              throw new Error(
                `History ${options.plannerVersion ?? "v3"} review-bundle export is unavailable.`
              );
            emit(
              await create({
                episodeId,
                output: options.output,
                ...(options.outputRoot
                  ? { outputRoot: options.outputRoot }
                  : {}),
                ...(options.regenerate ? { regenerate: true } : {}),
              }),
              options.json ?? inherited().json
            );
          }
        );
    }
  }

  if (dependencies.runHistoryV33Workflow) {
    const v33 = history
      .command("v3.3")
      .description("Run explicit, resumable History V3.3 research and deterministic packaging phases");
    const stages = [
      ["normalize", "normalize"],
      ["extract-claims", "extract-claims"],
      ["retrieve-sources", "retrieve-sources"],
      ["assess-evidence", "assess-evidence"],
      ["evaluate-provenance", "evaluate-provenance"],
      ["freeze", "freeze"],
      ["plan", "plan"],
      ["validate", "validate"],
      ["export", "export"],
      ["regenerate", "export"],
    ] as const;
    for (const [commandName, stage] of stages) {
      v33
        .command(`${commandName} <episode-id>`)
        .option("--output-root <path>")
        .option("--output <directory>")
        .option("--offline-fixture")
        .option("--live-research")
        .option("--reuse-frozen-snapshot")
        .option("--refresh-source")
        .option("--force")
        .option("--dry-run")
        .option("--json")
        .action(async (episodeId: string, options: {
          readonly outputRoot?: string;
          readonly output?: string;
          readonly offlineFixture?: boolean;
          readonly liveResearch?: boolean;
          readonly reuseFrozenSnapshot?: boolean;
          readonly refreshSource?: boolean;
          readonly force?: boolean;
          readonly dryRun?: boolean;
          readonly json?: boolean;
        }) => {
          const selectedModes = [options.offlineFixture, options.liveResearch, options.reuseFrozenSnapshot].filter(Boolean).length;
          if (selectedModes > 1) throw new Error("Select only one History V3.3 research mode.");
          const mode = options.liveResearch
            ? "live-research" as const
            : options.reuseFrozenSnapshot
              ? "reuse-frozen-snapshot" as const
              : "offline-fixture" as const;
          emitHistoryV33(await dependencies.runHistoryV33Workflow!({
            episodeId,
            stage,
            mode,
            ...(options.outputRoot ? { outputRoot: options.outputRoot } : {}),
            ...(options.output ? { approvalOutput: options.output } : {}),
            ...(options.refreshSource ? { refreshSources: true } : {}),
            ...(options.force || commandName === "regenerate" ? { force: true } : {}),
            ...(options.dryRun ?? inherited().dryRun ? { dryRun: true } : {}),
          }), options.json ?? inherited().json);
        });
    }
    if (dependencies.createCombinedHistoryApprovalBundleV33) {
      v33
        .command("compare <episode-ids...>")
        .requiredOption("--output <directory>")
        .option("--output-root <path>")
        .option("--regenerate")
        .option("--json")
        .action(async (episodeIds: string[], options: { readonly output: string; readonly outputRoot?: string; readonly regenerate?: boolean; readonly json?: boolean }) => {
          emitHistoryV33(await dependencies.createCombinedHistoryApprovalBundleV33!({
            episodeIds,
            output: options.output,
            ...(options.outputRoot ? { outputRoot: options.outputRoot } : {}),
            ...(options.regenerate ? { regenerate: true } : {}),
          }), options.json ?? inherited().json);
        });
    }
  }

  const contentPack = program
    .command("content-pack")
    .description(
      "Inspect, validate, and import reusable editorial content packs"
    );

  contentPack
    .command("inspect <pack-path>")
    .description("Inspect a History content pack without importing it")
    .option("--json", "emit machine-readable output")
    .action(async (packPath: string, options: { readonly json?: boolean }) => {
      emit(
        await dependencies.inspectHistoryContentPack(packPath),
        options.json ?? inherited().json
      );
    });

  contentPackOptions(
    contentPack
      .command("validate <pack-path>")
      .description(
        "Validate a History pack structurally without provider calls"
      )
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
      .description(
        "Import a validated History pack into the canonical workflow"
      )
      .option(
        "--dry-run",
        "validate and plan without writing production artifacts"
      )
      .option(
        "--fail-fast",
        "stop the bounded batch on its first episode error"
      )
      .option(
        "--collect-errors",
        "complete independent files and report all errors"
      )
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
