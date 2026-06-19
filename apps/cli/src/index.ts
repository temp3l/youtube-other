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
import { loadEpisodeConfig, loadRuntimeConfig, type RuntimeConfig, type RuntimeConfigOverrides } from "@mediaforge/config";
import {
  artifactIdSchema,
  episodeManifestSchema,
  rewrittenScriptSchema,
  sceneIdSchema,
  scenePlanSchema,
  type ArtifactReference
} from "@mediaforge/domain";
import { createLogger } from "@mediaforge/observability";
import { formatPublishingMetadataMarkdown, generateLocalizedPublishingMetadata } from "@mediaforge/metadata";
import {
  createPromptBatch,
  exportSceneWorkbook,
  generateOpenAiSceneImages,
  localSceneNegativePrompt,
  localSceneStyle,
  loadOpenAiImageGenerationSettings,
  importImageAssets,
  missingScenes,
  validateImageAssets
} from "@mediaforge/image-generation";
import {
  buildSrt,
  ensureDir,
  fileExists,
  formatTimestampLabel,
  hashFile,
  safeBasename,
  writeJsonAtomic,
  writeTextAtomic
} from "@mediaforge/shared";
import { loadEpisodeScriptMarkdown, loadSpeechVoiceSettings, splitEpisodeScriptMarkdown, writeEpisodeScriptMarkdown } from "@mediaforge/speech";

interface CliOptions {
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  workspace?: string;
  db?: string;
  ttsProvider?: "mock" | "openai-compatible";
  openAiBaseUrl?: string;
  openAiApiKey?: string;
  openAiSpeechModel?: string;
  openAiSpeechVoice?: string;
  speechVoicePreset?: "slow" | "fast";
  scriptLanguage?: string;
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

function serializeError(error: unknown): Record<string, unknown> {
  if (error === null || error === undefined) {
    return { value: String(error) };
  }
  if (typeof error !== "object") {
    return { value: String(error) };
  }
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(error)) {
    const value = (error as Record<string | symbol, unknown>)[key];
    result[String(key)] = value;
  }
  if (!("message" in result) && error instanceof Error) {
    result["message"] = error.message;
  }
  if (!("name" in result) && error instanceof Error) {
    result["name"] = error.name;
  }
  if (!("stack" in result) && error instanceof Error && error.stack) {
    result["stack"] = error.stack;
  }
  if ("cause" in error && (error as { cause?: unknown }).cause !== undefined) {
    result["cause"] = serializeError((error as { cause?: unknown }).cause);
  }
  return result;
}

function isTruthy(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

function configOverridesFromCli(options: CliOptions): RuntimeConfigOverrides {
  const overrides: RuntimeConfigOverrides = {};
  if (options.workspace) {
    overrides.workspaceDir = options.workspace;
  }
  if (options.db) {
    overrides.dbPath = options.db;
  }
  if (options.ttsProvider) {
    overrides.ttsProvider = options.ttsProvider;
  }
  if (options.openAiBaseUrl) {
    overrides.openAiCompatibleBaseUrl = options.openAiBaseUrl;
  }
  if (options.openAiApiKey) {
    overrides.openAiCompatibleApiKey = options.openAiApiKey;
  }
  if (options.openAiSpeechModel) {
    overrides.openAiSpeechModel = options.openAiSpeechModel;
  }
  if (options.openAiSpeechVoice) {
    overrides.openAiSpeechVoice = options.openAiSpeechVoice;
  }
  if (options.speechVoicePreset) {
    overrides.speechVoicePreset = options.speechVoicePreset;
  }
  if (options.scriptLanguage) {
    overrides.scriptLanguage = options.scriptLanguage;
  }
  return overrides;
}

function compactConfigOverrides(overrides: RuntimeConfigOverrides): RuntimeConfigOverrides {
  const compacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(overrides) as Array<[keyof RuntimeConfig, RuntimeConfig[keyof RuntimeConfig] | undefined]>) {
    if (value !== undefined) {
      compacted[String(key)] = value;
    }
  }
  return compacted as RuntimeConfigOverrides;
}

function isEnglishLanguage(language: string): boolean {
  return language.toLowerCase() === "en";
}

function localizedSuffix(language: string): string {
  return isEnglishLanguage(language) ? "" : `-${safeBasename(language)}`;
}

function localizedSegmentsDir(episodeDir: string, language: string): string {
  return path.join(episodeDir, "audio", isEnglishLanguage(language) ? "segments" : `segments-${safeBasename(language)}`);
}

function localizedNarrationPath(episodeDir: string, language: string): string {
  return path.join(episodeDir, "audio", isEnglishLanguage(language) ? "narration.wav" : `narration-${safeBasename(language)}.wav`);
}

function localizedMetadataDir(episodeDir: string, language: string): string {
  return isEnglishLanguage(language) ? path.join(episodeDir, "metadata") : path.join(episodeDir, "metadata", safeBasename(language));
}

function localizedClipsDirName(language: string): string {
  return isEnglishLanguage(language) ? "clips" : `clips-${safeBasename(language)}`;
}

function localizedOutputSuffix(language: string): string {
  return localizedSuffix(language);
}

function balanceScriptChunksForScenes(chunks: string[], sceneCount?: number): string[] {
  if (!sceneCount || sceneCount <= 0 || chunks.length === sceneCount) {
    return chunks;
  }
  if (chunks.length === 0) {
    return [];
  }
  if (chunks.length > sceneCount) {
    const grouped: string[] = [];
    const step = chunks.length / sceneCount;
    for (let index = 0; index < sceneCount; index += 1) {
      const start = Math.floor(index * step);
      const end = index === sceneCount - 1 ? chunks.length : Math.max(start + 1, Math.floor((index + 1) * step));
      grouped.push(chunks.slice(start, end).join(" ").trim());
    }
    return grouped.map((chunk, index) => chunk.length > 0 ? chunk : chunks[Math.min(index, chunks.length - 1)] ?? "");
  }
  const padded = [...chunks];
  const tail = chunks[chunks.length - 1] ?? chunks[0] ?? "";
  while (padded.length < sceneCount) {
    padded.push(tail);
  }
  return padded;
}

async function buildEnvironment(options: CliOptions): Promise<MediaForgeEnvironment> {
  const config = await loadRuntimeConfig(configOverridesFromCli(options));
  createLogger(options.verbose ? "debug" : config.logLevel);
  const pipeline = await createPipeline(configOverridesFromCli(options));
  return pipeline.environment;
}

async function loadPipeline(options: CliOptions, episodeDir?: string) {
  const overrides = compactConfigOverrides(configOverridesFromCli(options));
  const episodeConfig = episodeDir ? await loadEpisodeConfig(episodeDir) : null;
  const emptyEpisodeOverrides: RuntimeConfigOverrides = {};
  return createPipeline(overrides, episodeConfig ? compactConfigOverrides(episodeConfig) : emptyEpisodeOverrides);
}

function describeDoctorItem(label: string, ok: boolean, detail: string, kind: "required" | "optional" | "manual" | "credential"): DoctorCheck {
  return { label, status: ok ? "ok" : "missing", detail, kind };
}

async function commandDoctor(options: CliOptions): Promise<void> {
  const config = await loadRuntimeConfig(configOverridesFromCli(options));
  const checks: DoctorCheck[] = [];
  checks.push(describeDoctorItem("Node", process.versions.node.startsWith("22."), `Node ${process.versions.node}`, "required"));
  checks.push(describeDoctorItem("pnpm", spawnSync("pnpm", ["-v"], { encoding: "utf8" }).status === 0, "pnpm available", "required"));
  checks.push(describeDoctorItem("ffmpeg", spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0, "ffmpeg available", "required"));
  checks.push(describeDoctorItem("ffprobe", spawnSync("ffprobe", ["-version"], { encoding: "utf8" }).status === 0, "ffprobe available", "required"));
  checks.push(describeDoctorItem("yt-dlp", spawnSync("yt-dlp", ["--version"], { encoding: "utf8" }).status === 0, "yt-dlp available", "optional"));
  checks.push(describeDoctorItem("SQLite", true, "node:sqlite available in Node 22", "required"));
  checks.push(describeDoctorItem("Browser opener", spawnSync("xdg-open", ["--help"], { encoding: "utf8" }).status === 0, "xdg-open available", "optional"));
  checks.push(
    describeDoctorItem(
      "whisper.cpp",
      spawnSync(config.whisperBin ?? "whisper-cli", ["--help"], { encoding: "utf8" }).status === 0,
      config.whisperBin ?? "whisper-cli",
      config.transcriptionProvider === "whisper.cpp" ? "required" : "optional"
    )
  );
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
  const { episodeDir } = await readManifestForEpisode(options, episodeId);
  const pipeline = await loadPipeline(options, episodeDir);
  const result = await pipeline.runEpisode(episodeId as never, {});
  if (options.json) {
    printJson(result);
    return;
  }
  process.stdout.write(`Completed ${result.episodeId}\n${result.outputPaths.join("\n")}\n`);
}

async function readManifestForEpisode(options: CliOptions, episodeId: string) {
  const config = await loadRuntimeConfig(configOverridesFromCli(options));
  const workspace = config.workspaceDir;
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
      const episodeDir = path.dirname(manifestPath);
      let nextManifest = manifest;
      let shouldWrite = false;

      if (!nextManifest.scenePlan) {
        const scenePlanPath = path.join(episodeDir, "scenes.json");
        if (await fileExists(scenePlanPath)) {
          nextManifest = {
            ...nextManifest,
            scenePlan: scenePlanSchema.parse(JSON.parse(await fs.readFile(scenePlanPath, "utf8")) as unknown),
            updatedAt: new Date().toISOString()
          };
          shouldWrite = true;
        }
      }

      if (!nextManifest.rewrittenScript) {
        const rewrittenScriptPath = path.join(episodeDir, "script", "rewritten-script.json");
        if (await fileExists(rewrittenScriptPath)) {
          nextManifest = {
            ...nextManifest,
            rewrittenScript: rewrittenScriptSchema.parse(JSON.parse(await fs.readFile(rewrittenScriptPath, "utf8")) as unknown),
            updatedAt: new Date().toISOString()
          };
          shouldWrite = true;
        }
      }

      if (shouldWrite) {
        await writeJsonAtomic(manifestPath, nextManifest);
      }

      return { manifestPath, episodeDir, manifest: nextManifest };
    }
  }
  throw new Error(`Episode not found: ${episodeId}`);
}

async function readEpisodeWorkspaceForAudio(options: CliOptions, episodeId: string) {
  const config = await loadRuntimeConfig(configOverridesFromCli(options));
  const directDir = path.join(config.workspaceDir, episodeId);
  const directScriptExists =
    (await fileExists(path.join(directDir, "script.md"))) || (await fileExists(path.join(directDir, "script", "rewritten-script.md")));
  const directManifestPath = path.join(directDir, "manifest.json");
  if (directScriptExists || (await fileExists(directManifestPath))) {
    const manifest = (await fileExists(directManifestPath))
      ? episodeManifestSchema.parse(JSON.parse(await fs.readFile(directManifestPath, "utf8")) as unknown)
      : null;
    return { episodeDir: directDir, manifest };
  }
  const manifestResult = await readManifestForEpisode(options, episodeId);
  return manifestResult;
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

async function commandAudioGenerate(options: CliOptions, episodeId: string): Promise<void> {
  const overrides = compactConfigOverrides(configOverridesFromCli(options));
  const resolved = await readEpisodeWorkspaceForAudio(options, episodeId);
  const { episodeDir, manifest } = resolved;
  const episodeConfig = await loadEpisodeConfig(episodeDir);
  const emptyEpisodeOverrides: RuntimeConfigOverrides = {};
  const config = await loadRuntimeConfig(overrides, episodeConfig ? compactConfigOverrides(episodeConfig) : emptyEpisodeOverrides);
  if (config.ttsProvider === "openai-compatible" && !config.openAiCompatibleApiKey) {
    throw new Error("OpenAI speech is configured but no API key is available.");
  }
  const language = config.scriptLanguage ?? episodeConfig?.scriptLanguage ?? "en";
  const script = await loadEpisodeScriptMarkdown(episodeDir, language);
  const sceneCount = manifest?.scenePlan?.scenes.length;
  const chunks = balanceScriptChunksForScenes(splitEpisodeScriptMarkdown(script.text), sceneCount);
  if (chunks.length === 0) {
    throw new Error(`No narration text found in ${script.filePath}.`);
  }
  const audioDir = path.join(episodeDir, "audio");
  const segmentsDir = localizedSegmentsDir(episodeDir, language);
  const narrationPath = localizedNarrationPath(episodeDir, language);
  const episodeSlug = manifest?.slug ?? episodeId;
  if (options.dryRun) {
    printJson({
      episodeId,
      language,
      scriptPath: script.filePath,
      outputDir: audioDir,
      narrationPath,
      segmentsDir,
      segmentCount: chunks.length,
      dryRun: true
    });
    return;
  }
  const pipeline = await createPipeline(overrides, episodeConfig ? compactConfigOverrides(episodeConfig) : emptyEpisodeOverrides);
  const speechSettings = loadSpeechVoiceSettings({
    ...(config.speechVoicePreset ? { preset: config.speechVoicePreset } : episodeConfig?.speechVoicePreset ? { preset: episodeConfig.speechVoicePreset } : {}),
    ...(language ? { language } : {})
  });
  await ensureDir(segmentsDir);
  const scriptSourcePath = await writeEpisodeScriptMarkdown(episodeDir, script.text, language);
  const generatedAt = new Date().toISOString();
  const segmentPaths: string[] = [];
  const artifacts: ArtifactReference[] = [];
  for (const [index, chunk] of chunks.entries()) {
    const sceneId = sceneIdSchema.parse(`scene-${String(index + 1).padStart(3, "0")}`);
    const outputPath = path.join(segmentsDir, `${safeBasename(`segment-${String(index + 1).padStart(3, "0")}`)}.wav`);
    const words = chunk.trim().split(/\s+/u).filter(Boolean).length;
    const estimatedDurationSeconds = Math.max(2, Math.ceil((words / speechSettings.profile.paceWpm) * 60));
    await pipeline.speech.synthesize(
      {
        sceneId,
        text: chunk,
        voiceProfile: speechSettings.profile,
        outputPath,
        targetDurationSeconds: estimatedDurationSeconds
      },
      new AbortController().signal
    );
    segmentPaths.push(outputPath);
    const stats = await fs.stat(outputPath);
    artifacts.push({
      id: artifactIdSchema.parse(`artifact-${safeBasename(`${episodeSlug}-segment-${String(index + 1).padStart(3, "0")}-${language}`)}`),
      kind: language === "en" ? "audio.segment" : `audio.segment.${language}`,
      path: outputPath,
      mimeType: "audio/wav",
      sizeBytes: stats.size,
      checksumSha256: await hashFile(outputPath),
      createdAt: generatedAt
    });
  }
  const segmentsListPath = path.join(audioDir, "segments.txt");
  await writeTextAtomic(segmentsListPath, segmentPaths.map((segmentPath) => `file '${segmentPath.replace(/'/g, "'\\''")}'`).join("\n"));
  const concat = spawnSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", segmentsListPath, "-c", "copy", narrationPath], { encoding: "utf8" });
  if (concat.status !== 0) {
    throw new Error(concat.stderr || "Failed to concatenate narration audio.");
  }
  const narrationStats = await fs.stat(narrationPath);
  artifacts.push({
    id: artifactIdSchema.parse(`artifact-${safeBasename(`${episodeSlug}-narration-${language}`)}`),
    kind: language === "en" ? "audio.narration" : `audio.narration.${language}`,
    path: narrationPath,
    mimeType: "audio/wav",
    sizeBytes: narrationStats.size,
    checksumSha256: await hashFile(narrationPath),
    createdAt: generatedAt
  });
  artifacts.push({
    id: artifactIdSchema.parse(`artifact-${safeBasename(`${episodeSlug}-script-source-${language}`)}`),
    kind: language === "en" ? "audio.script-source" : `audio.script-source.${language}`,
    path: scriptSourcePath,
    mimeType: "text/markdown",
    sizeBytes: (await fs.stat(scriptSourcePath)).size,
    checksumSha256: await hashFile(scriptSourcePath),
    createdAt: generatedAt
  });
  if (manifest) {
    manifest.artifacts = [
      ...manifest.artifacts.filter((artifact) => {
        const kinds = language === "en" ? ["audio.segment", "audio.narration", "audio.script-source"] : [`audio.segment.${language}`, `audio.narration.${language}`, `audio.script-source.${language}`];
        return !kinds.includes(artifact.kind);
      }),
      ...artifacts
    ];
    manifest.updatedAt = generatedAt;
    await writeJsonAtomic(path.join(episodeDir, "manifest.json"), manifest);
  }
  await writeJsonAtomic(path.join(audioDir, "generation-report.json"), {
    episodeId,
    slug: episodeSlug,
    language,
    scriptPath: script.filePath,
    narrationPath,
    segmentsDir,
    segmentCount: chunks.length,
    generatedAt
  });
  if (options.json) {
    printJson({
      episodeId,
      language,
      scriptPath: script.filePath,
      narrationPath,
      segmentsDir,
      segmentCount: chunks.length,
      segmentPaths
    });
    return;
  }
  if (!options.quiet) {
    process.stdout.write(`Generated narration for ${episodeId} (${language})\n${narrationPath}\n`);
  }
}

async function commandClipsGenerate(options: CliOptions, episodeId: string): Promise<void> {
  const { manifest, episodeDir } = await readManifestForEpisode(options, episodeId);
  if (!manifest.scenePlan) {
    throw new Error("Scene plan is not available.");
  }
  const episodeConfig = await loadEpisodeConfig(episodeDir);
  const config = await loadRuntimeConfig(configOverridesFromCli(options), episodeConfig ? compactConfigOverrides(episodeConfig) : {});
  const language = config.scriptLanguage ?? episodeConfig?.scriptLanguage ?? "en";
  if (options.dryRun) {
    printJson({
      episodeId,
      language,
      audioDir: localizedSegmentsDir(episodeDir, language),
      clipsDir: path.join(episodeDir, "output", localizedClipsDirName(language)),
      dryRun: true
    });
    return;
  }
  await commandAudioGenerate({ ...options, json: false, quiet: true }, episodeId);
  const pipeline = await loadPipeline(options, episodeDir);
  const renderProfile = {
    id: "clips",
    label: "Localized clips",
    width: config.defaultAspectRatio === "16:9" ? 1920 : 1080,
    height: config.defaultAspectRatio === "16:9" ? 1080 : 1920,
    fps: 30,
    aspectRatio: config.defaultAspectRatio,
    burnCaptions: false
  } as const;
  const result = await pipeline.renderer.renderSceneClips(
    {
      episodeDir,
      scenePlan: manifest.scenePlan,
      outputDir: path.join(episodeDir, "output"),
      renderProfile,
      captionBurnIn: false,
      clipsDirName: localizedClipsDirName(language),
      sceneAudioDir: localizedSegmentsDir(episodeDir, language),
      imageDir: path.join(episodeDir, "images", "generated")
    },
    new AbortController().signal
  );
  if (options.json) {
    printJson({ episodeId, language, ...result });
    return;
  }
  process.stdout.write(`Generated localized clips for ${episodeId} (${language})\n${result.clipsDir}\n`);
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

async function commandImagesGenerateOpenAi(options: CliOptions, episodeId: string, sceneId?: string): Promise<void> {
  const { manifest, episodeDir } = await readManifestForEpisode(options, episodeId);
  if (!manifest.scenePlan) {
    throw new Error("Scene plan is not available.");
  }
  const settings = loadOpenAiImageGenerationSettings(process.env);
  const selectedScenes = sceneId ? manifest.scenePlan.scenes.filter((scene) => scene.id === sceneId) : manifest.scenePlan.scenes;
  if (selectedScenes.length === 0) {
    throw new Error(sceneId ? `Scene not found: ${sceneId}` : "No scenes available.");
  }
  const jobs = selectedScenes.map((scene) => ({
    scene,
    prompt: scene.imagePrompt,
    episodeSlug: manifest.slug,
    episodeDir,
    normalizedFilename: scene.expectedImageFilenames[0] ?? `${scene.id}.png`
  }));
  const results = await generateOpenAiSceneImages(jobs, settings);
  printJson(
    results.map((result: Awaited<ReturnType<typeof generateOpenAiSceneImages>>[number]) => ({
      sceneId: result.sceneId,
      sourcePath: result.sourcePath,
      renderedPath: result.renderedPath,
      promptPath: result.promptPath,
      rawPath: result.rawPath,
      normalizedPath: result.renderedPath,
      width: result.width,
      height: result.height,
      checksumSha256: result.checksumSha256,
      rawChecksumSha256: result.rawChecksumSha256,
      finalChecksumSha256: result.finalChecksumSha256
    }))
  );
}

async function commandRender(options: CliOptions, episodeId: string, profile: "youtube" | "vertical"): Promise<void> {
  const { manifest, episodeDir } = await readManifestForEpisode(options, episodeId);
  if (!manifest.scenePlan) {
    throw new Error("Scene plan is not available.");
  }
  const episodeConfig = await loadEpisodeConfig(episodeDir);
  const config = await loadRuntimeConfig(configOverridesFromCli(options), episodeConfig ? compactConfigOverrides(episodeConfig) : {});
  const language = config.scriptLanguage ?? episodeConfig?.scriptLanguage ?? "en";
  if (options.dryRun) {
    printJson({
      episodeId,
      language,
      clipsDir: path.join(episodeDir, "output", localizedClipsDirName(language)),
      cleanPath: path.join(episodeDir, "output", `youtube-${profile === "youtube" ? "16x9" : "9x16"}${localizedOutputSuffix(language)}-clean.mp4`),
      captionedPath: path.join(episodeDir, "output", `youtube-${profile === "youtube" ? "16x9" : "9x16"}${localizedOutputSuffix(language)}-captioned.mp4`),
      dryRun: true
    });
    return;
  }
  await commandAudioGenerate({ ...options, json: false, quiet: true }, episodeId);
  const captionsPath = isEnglishLanguage(language) ? path.join(episodeDir, "captions", "captions.ass") : undefined;
  const renderProfile = {
    id: profile,
    label: profile,
    width: profile === "youtube" ? 1920 : 1080,
    height: profile === "youtube" ? 1080 : 1920,
    fps: 30,
    aspectRatio: profile === "youtube" ? "16:9" : "9:16",
    burnCaptions: true
  } as const;
  const pipeline = await loadPipeline(options, episodeDir);
  const renderRequest = {
    episodeDir,
    scenePlan: manifest.scenePlan,
    outputDir: path.join(episodeDir, "output"),
    renderProfile,
    captionBurnIn: Boolean(captionsPath),
    clipsDirName: localizedClipsDirName(language),
    sceneAudioDir: localizedSegmentsDir(episodeDir, language),
    imageDir: path.join(episodeDir, "images", "generated"),
    outputSuffix: localizedOutputSuffix(language),
    ...(captionsPath ? { captionsPath } : {})
  };
  const result = await pipeline.renderer.render(renderRequest, new AbortController().signal);
  printJson(result);
}

async function commandMetadataGenerate(options: CliOptions, episodeId: string): Promise<void> {
  const { manifest, episodeDir } = await readManifestForEpisode(options, episodeId);
  if (!manifest.scenePlan) {
    throw new Error("Scene plan is required.");
  }
  const episodeConfig = await loadEpisodeConfig(episodeDir);
  const config = await loadRuntimeConfig(configOverridesFromCli(options), episodeConfig ? compactConfigOverrides(episodeConfig) : {});
  const language = config.scriptLanguage ?? episodeConfig?.scriptLanguage ?? "en";
  const script = await loadEpisodeScriptMarkdown(episodeDir, language);
  const metadata = generateLocalizedPublishingMetadata({
    sourceId: manifest.episodeId,
    language,
    scriptText: script.text,
    scenePlan: manifest.scenePlan,
    platform: "youtube"
  });
  const metadataDir = localizedMetadataDir(episodeDir, language);
  if (options.dryRun) {
    printJson({
      episodeId,
      language,
      metadataDir,
      youtubeMarkdownPath: path.join(metadataDir, "youtube.md"),
      youtubeJsonPath: path.join(metadataDir, "youtube.json"),
      dryRun: true
    });
    return;
  }
  await ensureDir(metadataDir);
  const youtubeJsonPath = path.join(metadataDir, "youtube.json");
  const youtubeMarkdownPath = path.join(metadataDir, "youtube.md");
  const chapterLines = metadata.chapters.map((chapter) => `${formatTimestampLabel(chapter.timestampSeconds)} ${chapter.title}`).join("\n");
  await writeJsonAtomic(youtubeJsonPath, metadata);
  await writeTextAtomic(youtubeMarkdownPath, [formatPublishingMetadataMarkdown(metadata), "", "## Chapter descriptions", chapterLines].join("\n"));
  await writeTextAtomic(path.join(metadataDir, "chapters.txt"), chapterLines);
  await writeTextAtomic(path.join(metadataDir, "description.txt"), metadata.description);
  await writeTextAtomic(path.join(metadataDir, "titles.txt"), metadata.titleCandidates.join("\n"));
  await writeTextAtomic(path.join(metadataDir, "tags.txt"), metadata.tags.join("\n"));
  await writeTextAtomic(path.join(metadataDir, "publishing.md"), formatPublishingMetadataMarkdown(metadata));
  manifest.publishingMetadata = {
    ...(manifest.publishingMetadata ?? {}),
    ...metadata,
    language
  };
  await writeJsonAtomic(path.join(episodeDir, "manifest.json"), manifest);
  process.stdout.write(`${youtubeMarkdownPath}\n`);
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
    .option("--dry-run", "preview actions without writing")
    .option("--tts-provider <provider>", "mock or openai-compatible")
    .option("--openai-base-url <url>", "OpenAI API base URL")
    .option("--openai-api-key <key>", "OpenAI API key")
    .option("--openai-speech-model <model>", "OpenAI speech model")
    .option("--openai-speech-voice <voice>", "OpenAI speech voice")
    .option("--speech-voice-preset <preset>", "slow or fast speech settings")
    .option("--language <code>", "localized script language, for example en, es, pt");
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
    await commandAudioGenerate(program.opts<CliOptions>(), episodeId);
  });

const clipsCommand = program.command("clips").description("Language-specific clip utilities");
clipsCommand
  .command("generate")
  .argument("<episode-id>")
  .action(async (episodeId: string) => {
    await commandClipsGenerate(program.opts<CliOptions>(), episodeId);
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
imagesCommand.command("generate-openai").argument("<episode-id>").option("--scene <scene-id>").action(async (episodeId: string, opts: { scene?: string }) => {
  await commandImagesGenerateOpenAi(program.opts<CliOptions>(), episodeId, opts.scene);
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
  process.stderr.write(`${JSON.stringify(serializeError(error), null, 2)}\n`);
  process.exitCode = 1;
});
