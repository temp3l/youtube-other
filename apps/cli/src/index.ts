#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Command } from "commander";
import {
  createPipeline,
  type CreateEpisodeOptions,
  type MediaForgeEnvironment
} from "@mediaforge/pipeline";
import { loadRuntimeConfig } from "@mediaforge/config";
import { episodeManifestSchema } from "@mediaforge/domain";
import { createLogger } from "@mediaforge/observability";
import {
  createPromptBatch,
  exportSceneWorkbook,
  localSceneNegativePrompt,
  localSceneStyle,
  importImageAssets,
  missingScenes,
  validateImageAssets
} from "@mediaforge/image-generation";
import { buildSrt, ensureDir, fileExists, writeJsonAtomic, writeTextAtomic } from "@mediaforge/shared";

interface CliOptions {
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  workspace?: string;
  db?: string;
}

interface DoctorCheck {
  readonly label: string;
  readonly status: "ok" | "missing";
  readonly detail: string;
  readonly kind: "required" | "optional" | "manual" | "credential";
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function isTruthy(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

async function buildEnvironment(options: CliOptions): Promise<MediaForgeEnvironment> {
  const overrides: {
    workspaceDir?: string;
    dbPath?: string;
  } = {};
  if (options.workspace) {
    overrides.workspaceDir = options.workspace;
  }
  if (options.db) {
    overrides.dbPath = options.db;
  }
  const config = await loadRuntimeConfig(overrides);
  createLogger(options.verbose ? "debug" : config.logLevel);
  const pipeline = await createPipeline(config);
  return pipeline.environment;
}

async function loadPipeline(options: CliOptions) {
  const environment = await buildEnvironment(options);
  return createPipeline(environment.config);
}

function describeDoctorItem(label: string, ok: boolean, detail: string, kind: "required" | "optional" | "manual" | "credential"): DoctorCheck {
  return { label, status: ok ? "ok" : "missing", detail, kind };
}

async function commandDoctor(options: CliOptions): Promise<void> {
  const overrides: { workspaceDir?: string; dbPath?: string } = {};
  if (options.workspace) {
    overrides.workspaceDir = options.workspace;
  }
  if (options.db) {
    overrides.dbPath = options.db;
  }
  const config = await loadRuntimeConfig(overrides);
  const checks: DoctorCheck[] = [];
  checks.push(describeDoctorItem("Node", process.versions.node.startsWith("22."), `Node ${process.versions.node}`, "required"));
  checks.push(describeDoctorItem("pnpm", spawnSync("pnpm", ["-v"], { encoding: "utf8" }).status === 0, "pnpm available", "required"));
  checks.push(describeDoctorItem("ffmpeg", spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0, "ffmpeg available", "required"));
  checks.push(describeDoctorItem("ffprobe", spawnSync("ffprobe", ["-version"], { encoding: "utf8" }).status === 0, "ffprobe available", "required"));
  checks.push(describeDoctorItem("yt-dlp", spawnSync("yt-dlp", ["--version"], { encoding: "utf8" }).status === 0, "yt-dlp available", "optional"));
  checks.push(describeDoctorItem("SQLite", true, "node:sqlite available in Node 22", "required"));
  checks.push(describeDoctorItem("Browser opener", spawnSync("xdg-open", ["--help"], { encoding: "utf8" }).status === 0, "xdg-open available", "optional"));
  checks.push(describeDoctorItem("whisper.cpp", spawnSync(config.whisperBin, ["--help"], { encoding: "utf8" }).status === 0, config.whisperBin, config.transcriptionProvider === "whisper.cpp" ? "required" : "optional"));
  const whisperModelExists = Boolean(config.whisperModel) && (await fs.stat(config.whisperModel ?? "").then(() => true).catch(() => false));
  checks.push(
    describeDoctorItem(
      "Whisper model",
      !config.whisperModel || whisperModelExists,
      config.whisperModel ?? "No model configured",
      config.transcriptionProvider === "whisper.cpp" ? "required" : "optional"
    )
  );
  const needsOpenAiCredentials = config.textProvider === "openai-compatible" || config.ttsProvider === "openai-compatible";
  checks.push(
    describeDoctorItem(
      "OpenAI API key",
      !needsOpenAiCredentials || Boolean(config.openAiCompatibleApiKey),
      needsOpenAiCredentials ? "Required for openai-compatible providers" : "Not required for the current configuration",
      needsOpenAiCredentials ? "credential" : "optional"
    )
  );
  const workspace = config.workspaceDir;
  await ensureDir(workspace);
  const writable = await fs.access(workspace).then(() => true).catch(() => false);
  checks.push(describeDoctorItem("Workspace writable", writable, workspace, "required"));
  const fonts = spawnSync("bash", ["-lc", "ls /usr/share/fonts >/dev/null 2>&1"], { encoding: "utf8" }).status === 0;
  checks.push(describeDoctorItem("Fonts", fonts, "System font directory", "optional"));
  const summary = {
    ok: checks.every((check) => check.status === "ok" || check.kind !== "required"),
    checks
  };
  printJson(summary);
}

async function commandInit(options: CliOptions): Promise<void> {
  const environment = await buildEnvironment(options);
  await ensureDir(environment.config.workspaceDir);
  if (!options.quiet) {
    process.stdout.write(`Workspace ready at ${environment.config.workspaceDir}\n`);
  }
}

async function commandCreate(options: CliOptions, input: CreateEpisodeOptions): Promise<void> {
  const pipeline = await loadPipeline(options);
  const manifest = await pipeline.createEpisode(input);
  if (options.json) {
    printJson(manifest);
    return;
  }
  process.stdout.write(`Created episode ${manifest.episodeId} at ${manifest.slug}\n`);
}

async function commandRun(options: CliOptions, episodeId: string): Promise<void> {
  const pipeline = await loadPipeline(options);
  const result = await pipeline.runEpisode(episodeId as never, {});
  if (options.json) {
    printJson(result);
    return;
  }
  process.stdout.write(`Completed ${result.episodeId}\n${result.outputPaths.join("\n")}\n`);
}

async function readManifestForEpisode(options: CliOptions, episodeId: string) {
  const pipeline = await loadPipeline(options);
  const workspace = pipeline.environment.config.workspaceDir;
  const entries = await fs.readdir(workspace, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const manifestPath = path.join(workspace, entry.name, "manifest.json");
    if (!(await fileExists(manifestPath))) {
      continue;
    }
    const manifest = episodeManifestSchema.parse(JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown);
    if (manifest.episodeId === episodeId) {
      return { manifestPath, episodeDir: path.dirname(manifestPath), manifest };
    }
  }
  throw new Error(`Episode not found: ${episodeId}`);
}

async function commandStatus(options: CliOptions, episodeId: string): Promise<void> {
  const { manifest } = await readManifestForEpisode(options, episodeId);
  if (options.json) {
    printJson(manifest);
    return;
  }
  process.stdout.write(`${manifest.episodeId} ${manifest.slug}\n`);
  process.stdout.write(`${manifest.pipelineRuns.length} pipeline runs\n`);
}

async function commandInspect(options: CliOptions, episodeId: string): Promise<void> {
  const { manifest } = await readManifestForEpisode(options, episodeId);
  printJson(manifest);
}

async function commandTranscriptExport(options: CliOptions, episodeId: string): Promise<void> {
  const { manifest, episodeDir } = await readManifestForEpisode(options, episodeId);
  const transcript = manifest.transcript;
  if (!transcript) {
    throw new Error("Transcript is not available in the manifest.");
  }
  const output = JSON.stringify(transcript, null, 2);
  if (options.json) {
    printJson(transcript);
    return;
  }
  process.stdout.write(`${output}\n`);
  await writeJsonAtomic(path.join(episodeDir, "original-transcript.json"), transcript);
  await writeTextAtomic(path.join(episodeDir, "original-transcript.srt"), buildSrt(transcript.segments));
}

async function commandScenesList(options: CliOptions, episodeId: string): Promise<void> {
  const { manifest } = await readManifestForEpisode(options, episodeId);
  const scenes = manifest.scenePlan?.scenes ?? [];
  process.stdout.write(`${scenes.map((scene) => `${scene.id} ${scene.timing.startSeconds}-${scene.timing.endSeconds}`).join("\n")}\n`);
}

async function commandScenesInspect(options: CliOptions, episodeId: string, sceneId: string): Promise<void> {
  const { manifest } = await readManifestForEpisode(options, episodeId);
  const scene = manifest.scenePlan?.scenes.find((item) => item.id === sceneId);
  if (!scene) {
    throw new Error(`Scene not found: ${sceneId}`);
  }
  printJson(scene);
}

async function commandImagesExportOpenArt(options: CliOptions, episodeId: string): Promise<void> {
  const { manifest, episodeDir } = await readManifestForEpisode(options, episodeId);
  if (!manifest.scenePlan) {
    throw new Error("Scene plan is not available.");
  }
  const prompts = createPromptBatch(manifest.scenePlan, "16:9", localSceneStyle, localSceneNegativePrompt);
  await exportSceneWorkbook(episodeDir, prompts, {
    batchSize: Number(process.env["MEDIAFORGE_OPENART_BATCH_SIZE"] ?? 8),
    aspectRatio: "16:9",
    globalStyle: localSceneStyle
  });
  if (!options.quiet) {
    process.stdout.write(`Exported scene workbook to ${path.join(episodeDir, "images", "scene-workbook.html")}\n`);
  }
}

async function commandImagesOpenOpenArt(options: CliOptions, episodeId: string): Promise<void> {
  const { episodeDir } = await readManifestForEpisode(options, episodeId);
  const workbook = path.join(episodeDir, "images", "scene-workbook.html");
  const opener = spawnSync("xdg-open", [workbook], { encoding: "utf8" });
  if (opener.status !== 0) {
    process.stdout.write(`${workbook}\n`);
  }
}

async function commandImagesImport(options: CliOptions, episodeId: string, fromDir: string): Promise<void> {
  const { manifest, episodeDir } = await readManifestForEpisode(options, episodeId);
  if (!manifest.scenePlan) {
    throw new Error("Scene plan is not available.");
  }
  const assets = await importImageAssets(episodeDir, manifest.scenePlan, fromDir);
  await writeJsonAtomic(path.join(episodeDir, "images", "generated", "imported.json"), assets);
  printJson(assets);
}

async function commandImagesValidate(options: CliOptions, episodeId: string): Promise<void> {
  const { manifest } = await readManifestForEpisode(options, episodeId);
  if (!manifest.scenePlan) {
    throw new Error("Scene plan is not available.");
  }
  const validation = validateImageAssets(manifest.scenePlan, manifest.images);
  printJson(validation);
}

async function commandImagesMissing(options: CliOptions, episodeId: string): Promise<void> {
  const { manifest } = await readManifestForEpisode(options, episodeId);
  if (!manifest.scenePlan) {
    throw new Error("Scene plan is not available.");
  }
  const missing = missingScenes(manifest.scenePlan, manifest.images);
  printJson(missing);
}

async function commandImagesReject(options: CliOptions, episodeId: string, sceneId: string, reason: string): Promise<void> {
  const { episodeDir } = await readManifestForEpisode(options, episodeId);
  await writeTextAtomic(path.join(episodeDir, "images", "rejected", `${sceneId}.txt`), reason);
  process.stdout.write(`Rejected ${sceneId}: ${reason}\n`);
}

async function commandImagesRegenerateWorkbook(options: CliOptions, episodeId: string, missingOnly: boolean): Promise<void> {
  const { manifest, episodeDir } = await readManifestForEpisode(options, episodeId);
  if (!manifest.scenePlan) {
    throw new Error("Scene plan is not available.");
  }
  const prompts = createPromptBatch(manifest.scenePlan, "16:9", localSceneStyle, localSceneNegativePrompt);
  const filtered = missingOnly ? prompts.filter((prompt) => !manifest.images.some((asset) => asset.sceneId === prompt.sceneId)) : prompts;
  await exportSceneWorkbook(episodeDir, filtered, {
    batchSize: Number(process.env["MEDIAFORGE_OPENART_BATCH_SIZE"] ?? 8),
    aspectRatio: "16:9",
    globalStyle: localSceneStyle
  });
}

async function commandImagesAssign(options: CliOptions, episodeId: string, sceneId: string, filePath: string): Promise<void> {
  const { episodeDir, manifest } = await readManifestForEpisode(options, episodeId);
  if (!manifest.scenePlan) {
    throw new Error("Scene plan is not available.");
  }
  const scene = manifest.scenePlan.scenes.find((item) => item.id === sceneId);
  if (!scene) {
    throw new Error(`Scene not found: ${sceneId}`);
  }
  const targetDir = path.join(episodeDir, "images", "inbox");
  await ensureDir(targetDir);
  const target = path.join(targetDir, scene.expectedImageFilenames[0] ?? path.basename(filePath));
  await fs.copyFile(filePath, target);
  process.stdout.write(`${target}\n`);
}

async function commandRender(options: CliOptions, episodeId: string, profile: "youtube" | "vertical"): Promise<void> {
  const { manifest, episodeDir } = await readManifestForEpisode(options, episodeId);
  if (!manifest.scenePlan) {
    throw new Error("Scene plan is not available.");
  }
  const captionsPath = path.join(episodeDir, "captions", "captions.ass");
  const renderProfile = {
    id: profile,
    label: profile,
    width: profile === "youtube" ? 1920 : 1080,
    height: profile === "youtube" ? 1080 : 1920,
    fps: 30,
    aspectRatio: profile === "youtube" ? "16:9" : "9:16",
    burnCaptions: true
  } as const;
  const pipeline = await loadPipeline(options);
  const result = await pipeline.renderer.render(
    {
      episodeDir,
      scenePlan: manifest.scenePlan,
      captionsPath,
      outputDir: path.join(episodeDir, "output"),
      renderProfile,
      captionBurnIn: true
    },
    new AbortController().signal
  );
  printJson(result);
}

async function commandMetadataGenerate(options: CliOptions, episodeId: string): Promise<void> {
  const { manifest, episodeDir } = await readManifestForEpisode(options, episodeId);
  if (!manifest.scenePlan || !manifest.rewrittenScript) {
    throw new Error("Rewritten script and scene plan are required.");
  }
  await writeJsonAtomic(path.join(episodeDir, "metadata", "youtube.json"), manifest.publishingMetadata ?? {});
  if (manifest.publishingMetadata) {
    process.stdout.write(`${path.join(episodeDir, "metadata", "youtube.json")}\n`);
  }
}

async function commandPackage(options: CliOptions, episodeId: string): Promise<void> {
  const { manifest } = await readManifestForEpisode(options, episodeId);
  printJson({
    episodeId: manifest.episodeId,
    slug: manifest.slug,
    artifacts: manifest.artifacts.length,
    scenes: manifest.scenePlan?.scenes.length ?? 0
  });
}

async function commandDbMigrate(options: CliOptions): Promise<void> {
  const pipeline = await loadPipeline(options);
  pipeline.environment.db.migrate();
  if (!options.quiet) {
    process.stdout.write(`Database migrated at ${pipeline.environment.config.dbPath}\n`);
  }
}

function addGlobalOptions(command: Command): Command {
  return command
    .option("--json", "output machine-readable JSON")
    .option("--quiet", "suppress non-essential output")
    .option("--verbose", "increase logging verbosity")
    .option("--dry-run", "preview actions without writing");
}

const program = addGlobalOptions(new Command());
program.name("mediaforge").description("Local-first media repurposing pipeline").version("0.0.0");
program
  .command("doctor")
  .description("Check local dependencies and environment readiness")
  .action(async () => {
    await commandDoctor(program.opts<CliOptions>());
  });
program
  .command("init")
  .description("Create the workspace directories")
  .action(async () => {
    await commandInit(program.opts<CliOptions>());
  });
program
  .command("create")
  .description("Create an episode from a local file or URL")
  .option("--file <path>", "local source file")
  .option("--url <url>", "source URL")
  .option("--transcript <path>", "local transcript file")
  .option("--slug <slug>", "episode slug")
.action(async (opts: { file?: string; url?: string; transcript?: string; slug?: string }) => {
    const input: CreateEpisodeOptions = {};
    if (opts.file) {
      input.filePath = opts.file;
    }
    if (opts.url) {
      input.url = opts.url;
    }
    if (opts.transcript) {
      input.transcriptPath = opts.transcript;
    }
    if (opts.slug) {
      input.slug = opts.slug;
    }
    await commandCreate(program.opts<CliOptions>(), input);
  });
program
  .command("run")
  .argument("<episode-id>")
  .description("Run the pipeline for an episode")
  .action(async (episodeId: string) => {
    await commandRun(program.opts<CliOptions>(), episodeId);
  });
program
  .command("status")
  .argument("<episode-id>")
  .description("Show episode status")
  .action(async (episodeId: string) => {
    await commandStatus(program.opts<CliOptions>(), episodeId);
  });
program
  .command("inspect")
  .argument("<episode-id>")
  .description("Print the episode manifest")
  .action(async (episodeId: string) => {
    await commandInspect(program.opts<CliOptions>(), episodeId);
  });
program
  .command("retry")
  .argument("<episode-id>")
  .description("Alias for run")
  .action(async (episodeId: string) => {
    await commandRun(program.opts<CliOptions>(), episodeId);
  });
program
  .command("clean")
  .argument("<episode-id>")
  .option("--generated-only", "remove generated outputs only")
  .description("Placeholder cleanup command")
  .action(async () => {
    process.stdout.write("Cleanup is not implemented in the first slice.\n");
  });

const transcriptCommand = program.command("transcript").description("Transcript utilities");
transcriptCommand
  .command("export")
  .argument("<episode-id>")
  .action(async (episodeId: string) => {
    await commandTranscriptExport(program.opts<CliOptions>(), episodeId);
  });

const scenesCommand = program.command("scenes").description("Scene utilities");
scenesCommand
  .command("list")
  .argument("<episode-id>")
  .action(async (episodeId: string) => {
    await commandScenesList(program.opts<CliOptions>(), episodeId);
  });
scenesCommand
  .command("inspect")
  .argument("<episode-id>")
  .requiredOption("--scene <scene-id>")
  .action(async (episodeId: string, opts: { scene: string }) => {
    await commandScenesInspect(program.opts<CliOptions>(), episodeId, opts.scene);
  });

const audioCommand = program.command("audio").description("Audio utilities");
audioCommand
  .command("generate")
  .argument("<episode-id>")
  .action(async (episodeId: string) => {
    await commandRun(program.opts<CliOptions>(), episodeId);
  });

program
  .command("align")
  .argument("<episode-id>")
  .action(async (episodeId: string) => {
    await commandRun(program.opts<CliOptions>(), episodeId);
  });

const imagesCommand = program.command("images").description("Local scene image workflow");
imagesCommand.command("export-openart").argument("<episode-id>").action(async (episodeId: string) => {
  await commandImagesExportOpenArt(program.opts<CliOptions>(), episodeId);
});
imagesCommand.command("open-openart").argument("<episode-id>").action(async (episodeId: string) => {
  await commandImagesOpenOpenArt(program.opts<CliOptions>(), episodeId);
});
imagesCommand.command("import").argument("<episode-id>").requiredOption("--from <directory>").action(async (episodeId: string, opts: { from: string }) => {
  await commandImagesImport(program.opts<CliOptions>(), episodeId, opts.from);
});
imagesCommand.command("validate").argument("<episode-id>").action(async (episodeId: string) => {
  await commandImagesValidate(program.opts<CliOptions>(), episodeId);
});
imagesCommand.command("missing").argument("<episode-id>").action(async (episodeId: string) => {
  await commandImagesMissing(program.opts<CliOptions>(), episodeId);
});
imagesCommand.command("reject").argument("<episode-id>").requiredOption("--scene <scene-id>").requiredOption("--reason <reason>").action(async (episodeId: string, opts: { scene: string; reason: string }) => {
  await commandImagesReject(program.opts<CliOptions>(), episodeId, opts.scene, opts.reason);
});
imagesCommand.command("regenerate-workbook").argument("<episode-id>").option("--missing-only").action(async (episodeId: string, opts: { missingOnly?: boolean }) => {
  await commandImagesRegenerateWorkbook(program.opts<CliOptions>(), episodeId, opts.missingOnly ?? false);
});
imagesCommand.command("assign").argument("<episode-id>").requiredOption("--scene <scene-id>").requiredOption("--file <path>").action(async (episodeId: string, opts: { scene: string; file: string }) => {
  await commandImagesAssign(program.opts<CliOptions>(), episodeId, opts.scene, opts.file);
});

program
  .command("render")
  .argument("<episode-id>")
  .option("--profile <profile>", "youtube or vertical", "youtube")
  .action(async (episodeId: string, opts: { profile: "youtube" | "vertical" }) => {
    await commandRender(program.opts<CliOptions>(), episodeId, opts.profile);
  });
program
  .command("metadata")
  .command("generate")
  .argument("<episode-id>")
  .action(async (episodeId: string) => {
    await commandMetadataGenerate(program.opts<CliOptions>(), episodeId);
  });
program
  .command("package")
  .argument("<episode-id>")
  .action(async (episodeId: string) => {
    await commandPackage(program.opts<CliOptions>(), episodeId);
  });

const dbCommand = program.command("db").description("Database utilities");
dbCommand.command("migrate").action(async () => {
  await commandDbMigrate(program.opts<CliOptions>());
});

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
