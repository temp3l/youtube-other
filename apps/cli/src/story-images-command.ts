import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { runCommand } from "@mediaforge/process-runner";
import {
  collectEpisodes,
  loadProductionStatuses,
  type StoryWorkflowSelectionOptions,
} from "./story-workflow-command-helpers.js";
import { mergeCommandOptions } from "./command-option-helpers.js";

export interface StoryImagesCliOptions extends StoryWorkflowSelectionOptions {
  readonly onlyReady?: boolean;
  readonly concurrency?: number;
  readonly allowUnapprovedCharacterReferences?: boolean;
  readonly force?: boolean;
  readonly json?: boolean;
  readonly verbose?: boolean;
}

interface StoryImagesIo {
  readonly stdout: Pick<typeof process.stdout, "write">;
}

interface StoryImagesExecutionResult {
  readonly episodeId: string;
  readonly generated: number;
  readonly skipped: number;
  readonly failed: number;
  readonly total: number;
}

interface StoryImagesSkippedEpisode {
  readonly episodeId: string;
  readonly reason: string;
}

const mediaforgeBinPath = fileURLToPath(
  new URL("../bin/mediaforge.js", import.meta.url)
);

const imageStageTypes = new Set([
  "scene-extraction",
  "visual-model",
  "image-prompt",
  "image-generation",
  "thumbnail",
]);

function executableImageEpisodes(
  statuses: Awaited<ReturnType<typeof loadProductionStatuses>>
): Set<string> {
  const episodes = new Set<string>();
  for (const status of statuses) {
    if (
      status.report.entries.some(
        (entry) =>
          imageStageTypes.has(entry.stageType) &&
          (entry.status === "ready" || entry.status === "retryable")
      )
    ) {
      episodes.add(status.report.episodeId);
    }
  }
  return episodes;
}

async function runImagesEpisode(
  episodeId: string,
  options: StoryImagesCliOptions
): Promise<StoryImagesExecutionResult> {
  const command = [
    mediaforgeBinPath,
    "--json",
    "stories",
    "resume-images",
    "--episode",
    episodeId,
    ...(options.outputRoot !== undefined
      ? ["--output-root", options.outputRoot]
      : []),
    ...(options.concurrency !== undefined
      ? ["--concurrency", String(options.concurrency)]
      : []),
    ...(options.allowUnapprovedCharacterReferences
      ? ["--allow-unapproved-character-references"]
      : []),
    ...(options.force ? ["--force"] : []),
    ...(options.verbose ? ["--verbose"] : []),
  ];
  const result = await runCommand(process.execPath, command, {
    allowNonZeroExit: true,
  });
  const parsed = JSON.parse(result.stdout) as {
    readonly episodeId: string;
    readonly generated: number;
    readonly skipped: number;
    readonly failed: number;
    readonly total: number;
  };
  if (result.exitCode !== 0) {
    process.exitCode = 1;
  }
  return {
    episodeId: parsed.episodeId,
    generated: parsed.generated,
    skipped: parsed.skipped,
    failed: parsed.failed,
    total: parsed.total,
  };
}

export async function commandStoriesImagesGenerate(
  options: StoryImagesCliOptions,
  io: StoryImagesIo = { stdout: process.stdout }
): Promise<void> {
  const episodes = collectEpisodes(options);
  const runnableEpisodes = options.onlyReady
    ? executableImageEpisodes(await loadProductionStatuses(options))
    : new Set(episodes);
  const selected = episodes.filter((episodeId) => runnableEpisodes.has(episodeId));
  const skipped = episodes
    .filter((episodeId) => !runnableEpisodes.has(episodeId))
    .map(
      (episodeId): StoryImagesSkippedEpisode => ({
        episodeId,
        reason: "No ready or retryable image targets matched the current workflow state.",
      })
    );

  if (selected.length === 0 && !options.onlyReady) {
    throw new Error("No episode targets matched stories images generate.");
  }

  const results: StoryImagesExecutionResult[] = [];
  for (const episodeId of selected) {
    results.push(await runImagesEpisode(episodeId, options));
  }

  const summary = {
    executed: results.length,
    skipped: skipped.length,
    generated: results.reduce((count, result) => count + result.generated, 0),
    failed: results.reduce((count, result) => count + result.failed, 0),
    total: results.reduce((count, result) => count + result.total, 0),
  };

  if (options.json) {
    io.stdout.write(
      `${JSON.stringify({ summary, results, skipped }, null, 2)}\n`
    );
    return;
  }

  io.stdout.write(
    [
      `Stories images generate: executed ${summary.executed}, skipped ${summary.skipped}`,
      `Summary: ${summary.generated} generated, ${summary.failed} failed, ${summary.total} total`,
      ...results.map(
        (result) =>
          `- ${result.episodeId} | generated=${result.generated} skipped=${result.skipped} failed=${result.failed} total=${result.total}`
      ),
      ...(skipped.length > 0
        ? [
            "Skipped:",
            ...skipped.map(
              (episode) =>
                `- ${episode.episodeId} | reason=${episode.reason}`
            ),
          ]
        : []),
    ].join("\n") + "\n"
  );
}

export function registerStoryImagesCommand(storiesCommand: Command): void {
  const images = storiesCommand
    .command("images")
    .description("Story-oriented image execution wrappers");
  images
    .command("generate")
    .option("--episode <slug-or-number>", "episode slug or number")
    .option("--episodes <comma-separated-episodes>", "episode slugs or numbers")
    .option("--workflow <workflow-id>", "workflow id for single-episode reads")
    .option("--output-root <path>", "episode workspace root")
    .option("--only-ready", "skip blocked outputs instead of failing")
    .option("--concurrency <number>", "parallel scene generation", (value) =>
      Number(value)
    )
    .option("--allow-unapproved-character-references")
    .option("--force")
    .option("--json", "print machine-readable output")
    .option("--verbose")
    .action((opts: StoryImagesCliOptions, command: Command) =>
      commandStoriesImagesGenerate(mergeCommandOptions(command, opts))
    );
}
