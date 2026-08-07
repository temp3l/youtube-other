import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import {
  createVeronicaPilotFixtures,
  runVeronicaSupplementalMediaPipeline,
  veronicaEpisodeStateDir,
  veronicaMediaPlanSchema,
} from "@mediaforge/veronica-media";

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
      };
      if (options.json) {
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
        return;
      }
      process.stdout.write(
        [
          `Veronica supplemental media pilot completed for ${options.episodeId}.`,
          `Plan: ${payload.planPath}`,
          `Approval pack: ${payload.approvalPackDir}`,
          `Render eligible: ${payload.renderEligible}`,
          `Landscape clips: ${payload.landscapeClips}`,
          `Portrait clips: ${payload.portraitClips}`,
        ].join("\n") + "\n",
      );
    });

  veronica
    .command("validate")
    .description("Validate an existing Veronica media plan artifact")
    .requiredOption("--plan <path>", "Path to veronica-media-plan.json")
    .action(async (options: { plan: string }) => {
      const raw = JSON.parse(await fs.readFile(path.resolve(options.plan), "utf8")) as unknown;
      veronicaMediaPlanSchema.parse(raw);
      process.stdout.write(`Valid plan: ${options.plan}\n`);
    });
}
