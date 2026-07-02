import path from "node:path";
import { Command } from "commander";
import { loadRuntimeConfig } from "@mediaforge/config";
import {
  buildPlannedStoryWorkflowManifest,
  StoryWorkflowManifestStore,
  workflowManifestSchema,
  type WorkflowId,
} from "@mediaforge/story-localization";
import {
  buildStoryPipelineStatusJson,
  formatStoryPipelineStatus,
} from "./story-pipeline-status-output.js";

export interface StoryPipelineCliOptions {
  readonly episode?: string;
  readonly locales?: string;
  readonly formats?: string;
  readonly outputRoot?: string;
  readonly resume?: string | boolean;
  readonly dryRun?: boolean;
  readonly costEstimate?: boolean;
  readonly batchMode?: "sync" | "batch" | "hybrid";
  readonly json?: boolean;
  readonly verbose?: boolean;
}

export interface StoryPipelineReadCliOptions {
  readonly episode?: string;
  readonly workflow?: string;
  readonly outputRoot?: string;
  readonly json?: boolean;
}

interface StoryPipelineIo {
  readonly stdout: Pick<typeof process.stdout, "write">;
}

function splitCsv(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return entries.length > 0 ? entries : undefined;
}

async function maybeLoadResumedManifest(args: {
  readonly outputRoot: string;
  readonly episodeId: string;
  readonly resume: string | boolean | undefined;
}) {
  if (typeof args.resume !== "string" || args.resume.length === 0) {
    return null;
  }
  const store = new StoryWorkflowManifestStore(args.outputRoot, args.episodeId);
  return store.load(args.resume as WorkflowId);
}

export async function commandStoriesPipeline(
  options: StoryPipelineCliOptions,
  io: StoryPipelineIo = { stdout: process.stdout }
): Promise<void> {
  if (!options.episode) {
    throw new Error("--episode is required.");
  }
  if (!options.dryRun) {
    throw new Error("stories pipeline currently supports planning with --dry-run only.");
  }
  const runtimeConfig = await loadRuntimeConfig();
  const outputRoot = path.resolve(options.outputRoot ?? runtimeConfig.workspaceDir);
  const locales = splitCsv(options.locales);
  const formats = splitCsv(options.formats);
  const planned = buildPlannedStoryWorkflowManifest({
    episodeId: options.episode,
    dryRun: true,
    ...(locales !== undefined ? { locales } : {}),
    ...(formats !== undefined ? { formats } : {}),
  });
  const resumed = await maybeLoadResumedManifest({
    outputRoot,
    episodeId: planned.episodeId,
    resume: options.resume,
  });
  const manifest = workflowManifestSchema.parse(resumed ?? planned);

  if (options.json) {
    io.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
    return;
  }

  io.stdout.write(
    [
      `Workflow: ${manifest.workflowId}`,
      `Execution: ${manifest.executionId}`,
      `Episode: ${manifest.episodeId}`,
      `Locales: ${manifest.locales.join(", ")}`,
      `Formats: ${manifest.formats.join(", ")}`,
      `Planned stages: ${manifest.plannedStageCount}`,
      `Mode: ${options.batchMode ?? "hybrid"}`,
      options.costEstimate ? "Cost estimate: unavailable in dry-run skeleton" : null,
    ]
      .filter((line): line is string => line !== null)
      .join("\n") + "\n"
  );
}

async function loadWorkflowForRead(options: StoryPipelineReadCliOptions) {
  if (!options.episode) {
    throw new Error("--episode is required.");
  }
  if (!options.workflow) {
    throw new Error("--workflow is required.");
  }
  const runtimeConfig = await loadRuntimeConfig();
  const outputRoot = path.resolve(options.outputRoot ?? runtimeConfig.workspaceDir);
  const store = new StoryWorkflowManifestStore(outputRoot, options.episode);
  const manifest = await store.load(options.workflow as WorkflowId);
  if (!manifest) {
    throw new Error(`Workflow manifest not found: ${options.workflow}`);
  }
  return manifest;
}

export async function commandStoriesPipelineStatus(
  options: StoryPipelineReadCliOptions,
  io: StoryPipelineIo = { stdout: process.stdout }
): Promise<void> {
  const manifest = await loadWorkflowForRead(options);
  if (options.json) {
    io.stdout.write(`${JSON.stringify(buildStoryPipelineStatusJson(manifest), null, 2)}\n`);
    return;
  }
  io.stdout.write(formatStoryPipelineStatus(manifest));
}

export async function commandStoriesPipelineInspect(
  options: StoryPipelineReadCliOptions,
  io: StoryPipelineIo = { stdout: process.stdout }
): Promise<void> {
  const manifest = await loadWorkflowForRead(options);
  io.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

export function registerStoryPipelineCommand(storiesCommand: Command): void {
  const pipeline = storiesCommand
    .command("pipeline")
    .description("Plan the durable story workflow")
    .requiredOption("--episode <slug-or-number>", "episode slug or number")
    .option("--locales <comma-separated-locales>", "workflow locales")
    .option("--formats <comma-separated-formats>", "story formats")
    .option("--output-root <path>", "episode workspace root")
    .option("--resume [workflow-id]", "load an existing workflow manifest when available")
    .option("--dry-run", "plan without running stages")
    .option("--cost-estimate", "include dry-run cost estimate status")
    .option("--batch-mode <sync|batch|hybrid>", "provider execution mode", "hybrid")
    .option("--json", "print machine-readable workflow manifest")
    .option("--verbose", "enable verbose logging")
    .action((opts: StoryPipelineCliOptions) => commandStoriesPipeline(opts));
  pipeline
    .command("status")
    .requiredOption("--episode <slug-or-number>", "episode slug or number")
    .requiredOption("--workflow <workflow-id>", "workflow id")
    .option("--output-root <path>", "episode workspace root")
    .option("--json", "print machine-readable report")
    .action((opts: StoryPipelineReadCliOptions) =>
      commandStoriesPipelineStatus(opts)
    );
  pipeline
    .command("inspect")
    .requiredOption("--episode <slug-or-number>", "episode slug or number")
    .requiredOption("--workflow <workflow-id>", "workflow id")
    .option("--output-root <path>", "episode workspace root")
    .option("--json", "accepted for command symmetry; inspect is always JSON")
    .action((opts: StoryPipelineReadCliOptions) =>
      commandStoriesPipelineInspect(opts)
    );
}
