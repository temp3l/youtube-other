import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import {
  createVeronicaPilotFixtures,
  executeVeronicaRender,
  loadVeronicaPipelineResult,
  runVeronicaSupplementalMediaPipeline,
  veronicaEpisodeStateDir,
  veronicaMediaPlanSchema,
  veronicaRenderManifestSchema,
} from "@mediaforge/veronica-media";
import { generateVeronicaBeniniReviewPacks, runStrategicSupplementalMediaBridge } from "@mediaforge/strategic-reinvention";

export function registerVeronicaMediaCommands(program: Command): void {
  const veronica = program
    .command("veronica-media")
    .description("Veronica Benini supplemental media planning and rendering");

  veronica
    .command("pilot")
    .description("Run the deterministic Veronica supplemental-media pilot fixture")
    .requiredOption("--workspace <path>", "Episode workspace root")
    .option("--episode-id <id>", "Episode identifier", "episode-pilot")
    .option("--json", "Emit machine-readable output", false)
    .action(async (options: { workspace: string; episodeId: string; json: boolean }) => {
      const fixtures = createVeronicaPilotFixtures();
      const result = await runVeronicaSupplementalMediaPipeline({
        workspaceRoot: path.resolve(options.workspace),
        episodeId: options.episodeId,
        originalNarration: fixtures.narration.original,
        revisedNarration: fixtures.narration.revised,
        targetLanguage: "it",
        sourceLanguage: "it",
        supplementalFiles: fixtures.files,
        alignedSegments: fixtures.alignedSegments,
      });
      emitResult(options, result);
    });

  veronica
    .command("run")
    .description("Run supplemental media planning for a strategic-reinvention episode")
    .requiredOption("--workspace <path>", "Episode workspace root")
    .requiredOption("--episode-id <id>", "Episode identifier")
    .option("--narration <path>", "Optional narration script path override")
    .option("--supplemental-dir <path>", "Optional supplemental media directory override")
    .option("--no-resume", "Disable resume from cached pipeline state")
    .option("--json", "Emit machine-readable output", false)
    .action(
      async (options: {
        workspace: string;
        episodeId: string;
        narration?: string;
        supplementalDir?: string;
        resume: boolean;
        json: boolean;
      }) => {
        const result = await runStrategicSupplementalMediaBridge({
          workspaceRoot: path.resolve(options.workspace),
          episodeId: options.episodeId,
          resume: options.resume,
          ...(options.narration ? { narrationPath: options.narration } : {}),
          ...(options.supplementalDir ? { supplementalDir: options.supplementalDir } : {}),
        });
        emitResult(
          { workspace: options.workspace, episodeId: options.episodeId, json: options.json },
          result,
        );
      },
    );

  veronica
    .command("review-pack")
    .description("Generate per-episode and bulk Veronica approval review packs")
    .requiredOption("--workspace <path>", "Episode workspace root containing veronica-benini episodes")
    .option("--bulk-dir <path>", "Bulk aggregate output directory")
    .option(
      "--content-matrix <path>",
      "Discovery content-matrix.csv used to scaffold missing episodes",
    )
    .option("--scaffold-missing", "Scaffold episodes from the content matrix when absent", false)
    .option("--no-resume", "Disable resume from cached pipeline state")
    .option("--json", "Emit machine-readable output", false)
    .action(
      async (options: {
        workspace: string;
        bulkDir?: string;
        contentMatrix?: string;
        scaffoldMissing: boolean;
        resume: boolean;
        json: boolean;
      }) => {
        const workspaceRoot = path.resolve(options.workspace);
        const bulkOutputDir =
          options.bulkDir ?? path.join(workspaceRoot, "approval-packs");
        const result = await generateVeronicaBeniniReviewPacks({
          workspaceRoot,
          bulkOutputDir,
          scaffoldMissing: options.scaffoldMissing,
          resume: options.resume,
          ...(options.contentMatrix ? { contentMatrixPath: path.resolve(options.contentMatrix) } : {}),
        });
        const payload = {
          episodeCount: result.episodes.length,
          workspaceRoot: result.workspaceRoot,
          bulkOutputDir: result.bulk.outputDir,
          aggregateReviewPath: result.bulk.aggregateReviewPath,
          findingsPath: result.bulk.findingsPath,
          episodes: result.episodes,
        };
        if (options.json) {
          process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
          return;
        }
        process.stdout.write(
          [
            `Generated ${payload.episodeCount} Veronica review packs.`,
            `Workspace: ${payload.workspaceRoot}`,
            `Bulk review: ${payload.aggregateReviewPath}`,
            `Findings: ${payload.findingsPath}`,
          ].join("\n") + "\n",
        );
      },
    );

  veronica
    .command("validate")
    .description("Validate an existing Veronica media plan artifact")
    .requiredOption("--plan <path>", "Path to veronica-media-plan.json")
    .action(async (options: { plan: string }) => {
      const raw = JSON.parse(await fs.readFile(path.resolve(options.plan), "utf8")) as unknown;
      veronicaMediaPlanSchema.parse(raw);
      process.stdout.write(`Valid plan: ${options.plan}\n`);
    });

  veronica
    .command("render")
    .description("Compile or execute FFmpeg renders for cached Veronica manifests")
    .requiredOption("--workspace <path>", "Episode workspace root")
    .requiredOption("--episode-id <id>", "Episode identifier")
    .option("--aspect <16:9|9:16>", "Aspect ratio to render", "16:9")
    .option("--execute", "Execute FFmpeg on the host (default is compile-only)", false)
    .option("--json", "Emit machine-readable output", false)
    .action(
      async (options: {
        workspace: string;
        episodeId: string;
        aspect: "16:9" | "9:16";
        execute: boolean;
        json: boolean;
      }) => {
        const stateDir = veronicaEpisodeStateDir(
          path.resolve(options.workspace),
          options.episodeId,
        );
        const cached = await loadVeronicaPipelineResult({
          stateDir,
          episodeId: options.episodeId,
          targetLanguage: "it",
        });
        if (!cached) {
          throw new Error(
            `No cached Veronica pipeline state found under ${stateDir}. Run veronica-media run first.`,
          );
        }
        const manifestPath = path.join(
          stateDir,
          "renders",
          options.aspect === "16:9" ? "landscape-manifest.json" : "portrait-manifest.json",
        );
        const manifest = veronicaRenderManifestSchema.parse(
          JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown,
        );
        const result = executeVeronicaRender({
          manifest,
          execute: options.execute,
        });
        const payload = {
          episodeId: options.episodeId,
          aspect: options.aspect,
          executed: result.executed,
          outputPath: result.outputPath,
          commandCount: result.commands.length,
          skippedReason: result.skippedReason ?? null,
        };
        if (options.json) {
          process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
          return;
        }
        process.stdout.write(
          [
            `Veronica render ${result.executed ? "executed" : "compiled"} for ${options.episodeId}.`,
            `Aspect: ${options.aspect}`,
            `Output: ${result.outputPath}`,
            `Commands: ${result.commands.length}`,
            result.skippedReason ? `Note: ${result.skippedReason}` : "",
          ]
            .filter(Boolean)
            .join("\n") + "\n",
        );
      },
    );
}

function emitResult(
  options: { workspace: string; episodeId: string; json: boolean },
  result: Awaited<ReturnType<typeof runVeronicaSupplementalMediaPipeline>>,
): void {
  const payload = {
    episodeId: options.episodeId,
    stateDir: veronicaEpisodeStateDir(path.resolve(options.workspace), options.episodeId),
    planPath: path.join(
      veronicaEpisodeStateDir(path.resolve(options.workspace), options.episodeId),
      "veronica-media-plan.json",
    ),
    approvalPackDir: result.approvalPackDir,
    renderEligible: result.plan.approvalEligibility.renderEligible,
    landscapeClips: result.landscapeManifest.clips.length,
    portraitClips: result.portraitManifest.clips.length,
    contentHash: result.plan.contentHash,
    resumed: result.resumed ?? false,
  };
  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    [
      `Veronica supplemental media completed for ${options.episodeId}.`,
      `Plan: ${payload.planPath}`,
      `Approval pack: ${payload.approvalPackDir}`,
      `Render eligible: ${payload.renderEligible}`,
      `Resumed: ${payload.resumed}`,
      `Landscape clips: ${payload.landscapeClips}`,
      `Portrait clips: ${payload.portraitClips}`,
    ].join("\n") + "\n",
  );
}
