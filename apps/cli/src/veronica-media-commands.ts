import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { runCommand } from "@mediaforge/process-runner";
import {
  createVeronicaPilotFixtures,
  executeVeronicaRender,
  loadVeronicaPipelineResult,
  runVeronicaSupplementalMediaPipeline,
  veronicaEpisodeStateDir,
  veronicaMediaPlanSchema,
  veronicaRenderManifestSchema,
} from "@mediaforge/veronica-media";
import {
  generatePositioningVisualPlans,
  generateVeronicaBeniniReviewPacks,
  preparePositioningProductionEpisode,
  runStrategicSupplementalMediaBridge,
} from "@mediaforge/strategic-reinvention";

const mediaforgeBinPath = fileURLToPath(
  new URL("../bin/mediaforge.js", import.meta.url),
);

type VeronicaLanguage = "en" | "de" | "es" | "fr" | "pt" | "it";
type VeronicaVariant = "full" | "short";

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

export function registerVeronicaMediaCommands(program: Command): void {
  const veronica = program
    .command("veronica-media")
    .description("Veronica Benini supplemental media planning and rendering");

  veronica
    .command("prepare-production")
    .description("Adapt an approved Veronica positioning plan to canonical image and speech episode artifacts")
    .requiredOption("--workspace <path>", "Episode workspace root")
    .requiredOption("--episode-id <id>", "Episode identifier")
    .requiredOption("--language <code>", "Narration language")
    .requiredOption("--variant <full|short>", "Production variant")
    .option("--plan <path>", "Positioning visual plan (defaults to source/visual-plan.json)")
    .option("--script <path>", "Narration script override")
    .option("--json", "Emit machine-readable output", false)
    .action(async (options: {
      workspace: string;
      episodeId: string;
      language: VeronicaLanguage;
      variant: VeronicaVariant;
      plan?: string;
      script?: string;
      json: boolean;
    }) => {
      const result = await preparePositioningProductionEpisode({
        workspaceRoot: path.resolve(options.workspace),
        episodeId: options.episodeId,
        language: options.language,
        variant: options.variant,
        ...(options.plan ? { planPath: path.resolve(options.plan) } : {}),
        ...(options.script ? { scriptPath: path.resolve(options.script) } : {}),
      });
      if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
      }
      process.stdout.write(
        `Prepared ${result.episodeId} (${result.language}/${result.variant}) with ${result.sceneCount} canonical scenes.\nManifest: ${result.manifestPath}\n`,
      );
    });

  const images = veronica
    .command("images")
    .description("Generate Veronica positioning images through the canonical image pipeline");
  images
    .command("generate")
    .requiredOption("--workspace <path>", "Episode workspace root")
    .requiredOption("--episode-id <id>", "Episode identifier")
    .option("--mode <sync|batch>", "Synchronous or provider-batch execution", "sync")
    .option("--language <code>", "Batch localization coordinate", "it")
    .option("--variant <full|short>", "Image production variant", "full")
    .option("--concurrency <number>", "Bounded synchronous scene concurrency", (value) =>
      parsePositiveInteger(value, "--concurrency"),
    )
    .option("--max-batch-size <number>", "Maximum provider requests per image batch", (value) =>
      parsePositiveInteger(value, "--max-batch-size"),
    )
    .option("--phase <auto|references|scenes>", "Image batch planning phase", "auto")
    .option("--dry-run", "Plan work without provider submission", false)
    .option("--json", "Emit machine-readable output", false)
    .action(async (options: {
      workspace: string;
      episodeId: string;
      mode: "sync" | "batch";
      language: VeronicaLanguage;
      variant: VeronicaVariant;
      concurrency?: number;
      maxBatchSize?: number;
      phase: "auto" | "references" | "scenes";
      dryRun: boolean;
      json: boolean;
    }) => {
      const args = [
        mediaforgeBinPath,
        "--workspace",
        path.resolve(options.workspace),
        ...(options.json ? ["--json"] : []),
        "images",
      ];
      if (options.mode === "batch") {
        args.push(
          "batch",
          "prepare",
          "--episode",
          options.episodeId,
          "--languages",
          options.language,
          "--variants",
          options.variant,
          "--phase",
          options.phase,
        );
        if (options.maxBatchSize !== undefined) {
          args.push("--max-batch-size", String(options.maxBatchSize));
        }
        if (options.dryRun) args.push("--dry-run");
      } else {
        args.push("resume", "--episode", options.episodeId);
        if (options.json) args.push("--json");
        if (options.concurrency !== undefined) {
          args.push("--concurrency", String(options.concurrency));
        }
      }
      const result = await runCommand(process.execPath, args, {
        allowNonZeroExit: true,
      });
      process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      if (result.exitCode !== 0) process.exitCode = result.exitCode;
    });

  const speech = veronica
    .command("speech")
    .description("Run the canonical staged narration pipeline for Veronica episodes");
  for (const entry of [
    { name: "plan", stage: "plan", validationOnly: false },
    { name: "generate", stage: "validate", validationOnly: false },
    { name: "validate", stage: "validate", validationOnly: true },
    { name: "status", stage: "status", validationOnly: false },
  ] as const) {
    speech
      .command(entry.name)
      .requiredOption("--workspace <path>", "Episode workspace root")
      .requiredOption("--episode-id <id>", "Episode identifier")
      .option("--language <code>", "Narration language", "it")
      .option("--languages <codes>", "Comma-separated narration languages")
      .option("--variant <full|short>", "Narration variant", "full")
      .option("--all-languages", "Process all available script languages", false)
      .option("--all-variants", "Process full and short variants", false)
      .option("--concurrency <number>", "Bounded narration chunk concurrency", (value) =>
        parsePositiveInteger(value, "--concurrency"),
      )
      .option("--resume", "Reuse valid narration artifacts", false)
      .option("--dry-run", "Plan speech work without provider dispatch", false)
      .option("--strict", "Treat warnings as a non-zero result", false)
      .option("--json", "Emit machine-readable output", false)
      .action(async (options: {
        workspace: string;
        episodeId: string;
        language: VeronicaLanguage;
        languages?: string;
        variant: VeronicaVariant;
        allLanguages: boolean;
        allVariants: boolean;
        concurrency?: number;
        resume: boolean;
        dryRun: boolean;
        strict: boolean;
        json: boolean;
      }) => {
        const args = [
          mediaforgeBinPath,
          "--workspace",
          path.resolve(options.workspace),
          ...(options.json ? ["--json"] : []),
          "audio",
          "narration",
          entry.stage,
          "--episode",
          options.episodeId,
          "--language",
          options.language,
          "--variant",
          options.variant,
          ...(options.languages ? ["--languages", options.languages] : []),
          ...(options.allLanguages ? ["--all-languages"] : []),
          ...(options.allVariants ? ["--all-variants"] : []),
          ...(options.concurrency !== undefined
            ? ["--concurrency", String(options.concurrency)]
            : []),
          ...(options.resume ? ["--resume"] : []),
          ...(options.dryRun ? ["--dry-run"] : []),
          ...(options.strict ? ["--strict"] : []),
          ...(entry.validationOnly ? ["--validation-only"] : []),
        ];
        const result = await runCommand(process.execPath, args, {
          allowNonZeroExit: true,
        });
        process.stdout.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
        if (result.exitCode !== 0) process.exitCode = result.exitCode;
      });
  }

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
    .command("plan-positioning-series")
    .description("Create canonical locale-independent visual plans for a Veronica positioning narration pack")
    .requiredOption("--pack <path>", "Extracted optimized positioning-series content pack")
    .requiredOption("--output <path>", "Visual-plan review output directory")
    .option("--json", "Emit machine-readable output", false)
    .action(async (options: { pack: string; output: string; json: boolean }) => {
      const result = await generatePositioningVisualPlans({
        packDir: path.resolve(options.pack),
        outputDir: path.resolve(options.output),
      });
      if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
      }
      process.stdout.write(
        `Generated ${result.contentIds.length} canonical positioning visual plans.\nBulk review: ${result.reviewPackPath}\n`,
      );
    });

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
