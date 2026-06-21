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
  normalizedTranscriptSchema,
  rewrittenScriptSchema,
  sceneIdSchema,
  scenePlanSchema,
  type NormalizedTranscript,
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
import { runCommand } from "@mediaforge/process-runner";
import {
  buildSrt,
  ensureDir,
  fileExists,
  formatTimestampLabel,
  hashFile,
  normalizeWhitespace,
  slugify,
  safeBasename,
  writeJsonAtomic,
  writeTextAtomic
} from "@mediaforge/shared";
import { loadEpisodeScriptMarkdown, loadSpeechVoiceSettings, splitEpisodeScriptMarkdown, writeEpisodeScriptMarkdown } from "@mediaforge/speech";
import {
  buildVisualScenesFromSubtitleSegments,
  normalizeTranscriptFromWords,
  parseWhisperRawArtifact,
  validateNormalizedTranscript,
  writeNormalizedTranscriptArtifacts,
  type WhisperRawTranscriptArtifact
} from "@mediaforge/transcription";

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

function countWords(text: string): number {
  return normalizeWhitespace(text).split(/\s+/u).filter(Boolean).length;
}

function splitSpeechSentences(text: string): string[] {
  const normalized = normalizeWhitespace(text);
  if (normalized.length === 0) {
    return [];
  }
  const sentences = normalized
    .split(/(?<=[.!?…]["'»”)]*)\s+/u)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter((sentence) => sentence.length > 0);
  return sentences.length > 0 ? sentences : [normalized];
}

function splitLongChunk(chunk: string): [string, string] | null {
  const words = normalizeWhitespace(chunk).split(/\s+/u).filter(Boolean);
  if (words.length <= 1) {
    return null;
  }
  const midpoint = Math.max(1, Math.floor(words.length / 2));
  return [words.slice(0, midpoint).join(" "), words.slice(midpoint).join(" ")];
}

function rebalanceChunks(chunks: string[], desiredCount: number): string[] {
  if (desiredCount <= 0) {
    return chunks;
  }
  const normalized = chunks.map((chunk) => normalizeWhitespace(chunk)).filter((chunk) => chunk.length > 0);
  if (normalized.length === 0) {
    return [];
  }
  if (normalized.length > desiredCount) {
    const balanced: string[] = [];
    const step = normalized.length / desiredCount;
    for (let index = 0; index < desiredCount; index += 1) {
      const start = Math.floor(index * step);
      const end = index === desiredCount - 1 ? normalized.length : Math.max(start + 1, Math.floor((index + 1) * step));
      balanced.push(normalized.slice(start, end).join(" "));
    }
    return balanced.map((chunk) => normalizeWhitespace(chunk)).filter((chunk) => chunk.length > 0);
  }
  const expanded = [...normalized];
  while (expanded.length < desiredCount) {
    let splitIndex = -1;
    let longestLength = 0;
    for (let index = 0; index < expanded.length; index += 1) {
      const wordCount = countWords(expanded[index] ?? "");
      if (wordCount > longestLength) {
        longestLength = wordCount;
        splitIndex = index;
      }
    }
    if (splitIndex === -1) {
      break;
    }
    const target = expanded[splitIndex];
    if (target === undefined) {
      break;
    }
    const split = splitLongChunk(target);
    if (!split) {
      break;
    }
    expanded.splice(splitIndex, 1, split[0], split[1]);
  }
  return expanded.slice(0, desiredCount);
}

async function localizedSceneAudioIsComplete(episodeDir: string, language: string, expectedCount: number): Promise<boolean> {
  const segmentsDir = localizedSegmentsDir(episodeDir, language);
  const existing = await fs.readdir(segmentsDir, { withFileTypes: true }).catch(() => []);
  const wavCount = existing.filter((entry) => entry.isFile() && entry.name.endsWith(".wav")).length;
  return wavCount >= expectedCount;
}

async function loadNarrationScriptMarkdown(episodeDir: string, language: string): Promise<{ readonly filePath: string; readonly text: string }> {
  const languageSlug = safeBasename(language);
  const candidates = [
    path.join(episodeDir, "script", `rewritten-script-${languageSlug}.md`),
    path.join(episodeDir, "script", "rewritten-script.md"),
    path.join(episodeDir, "languages", `script-${languageSlug}.md`),
    path.join(episodeDir, "script.md")
  ];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return {
        filePath: candidate,
        text: await fs.readFile(candidate, "utf8")
      };
    }
  }
  throw new Error(`Missing rewritten narration script in ${episodeDir}.`);
}

function balanceScriptChunksForScenes(chunks: string[], sceneCount?: number): string[] {
  const normalized = chunks.map((chunk) => normalizeWhitespace(chunk)).filter((chunk) => chunk.length > 0);
  if (!sceneCount || sceneCount <= 0 || normalized.length === 0) {
    return normalized;
  }
  if (normalized.length === sceneCount) {
    return normalized;
  }
  const sentenceChunks = normalized.flatMap((chunk) => splitSpeechSentences(chunk));
  const packed = rebalanceChunks(sentenceChunks.length > 0 ? sentenceChunks : normalized, sceneCount);
  return packed.length > 0 ? packed : normalized;
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

async function resolveEpisodeSourceAudioPath(
  episodeDir: string,
  manifest: { readonly source: { readonly filePath?: string | undefined } } | null
): Promise<string> {
  const candidates: string[] = [];
  const sourceFilePath = manifest?.source?.filePath;
  if (sourceFilePath) {
    candidates.push(sourceFilePath);
  }
  const sourceDir = path.join(episodeDir, "source");
  const rootEntries = await fs.readdir(sourceDir, { withFileTypes: true }).catch(() => []);
  for (const entry of rootEntries) {
    if (!entry.isFile()) {
      continue;
    }
    const candidate = path.join(sourceDir, entry.name);
    if (/^source-media\./u.test(entry.name) || /\.(?:wav|mp3|m4a|mp4|mkv|webm|ogg|flac)$/iu.test(entry.name)) {
      candidates.push(candidate);
    }
  }
  const episodeEntries = await fs.readdir(episodeDir, { withFileTypes: true }).catch(() => []);
  for (const entry of episodeEntries) {
    if (!entry.isFile()) {
      continue;
    }
    if (/^source-media\./u.test(entry.name) || /\.(?:wav|mp3|m4a|mp4|mkv|webm|ogg|flac)$/iu.test(entry.name)) {
      candidates.push(path.join(episodeDir, entry.name));
    }
  }
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  throw new Error(`No source audio file could be located for ${path.basename(episodeDir)}.`);
}

function transcriptSegmentationOptionsFromConfig(config: RuntimeConfig): {
  readonly minDurationSeconds: number;
  readonly maxDurationSeconds: number;
  readonly maxSilenceSeconds: number;
  readonly timestampPrecision: number;
  readonly maxSingleWordDurationSeconds: number;
  readonly boundaryLookbackWords: number;
} {
  return {
    minDurationSeconds: config.transcriptMinSegmentSeconds,
    maxDurationSeconds: config.transcriptMaxSegmentSeconds,
    maxSilenceSeconds: config.transcriptMaxSilenceSeconds,
    timestampPrecision: config.transcriptTimestampPrecision,
    maxSingleWordDurationSeconds: config.transcriptMaxWordDurationSeconds,
    boundaryLookbackWords: config.transcriptBoundaryLookbackWords
  };
}

async function readTranscriptArtifacts(episodeDir: string): Promise<{
  readonly rawPath: string;
  readonly normalizedPath: string;
  readonly raw: WhisperRawTranscriptArtifact | null;
  readonly normalized: NormalizedTranscript | null;
}> {
  const transcriptDir = path.join(episodeDir, "transcript");
  const rawPath = path.join(transcriptDir, "transcript.raw.json");
  const normalizedPath = path.join(transcriptDir, "transcript.json");
  const legacyRawPath = path.join(episodeDir, "original-transcript.json");
  const rawCandidate = (await fileExists(rawPath))
    ? rawPath
    : (await fileExists(legacyRawPath))
      ? legacyRawPath
      : null;
  const normalizedCandidate = (await fileExists(normalizedPath)) ? normalizedPath : null;
  const raw = rawCandidate ? parseWhisperRawArtifact(JSON.parse(await fs.readFile(rawCandidate, "utf8")) as unknown) : null;
  const normalized = normalizedCandidate
    ? normalizedTranscriptSchema.parse(JSON.parse(await fs.readFile(normalizedCandidate, "utf8")) as unknown)
    : null;
  return {
    rawPath,
    normalizedPath,
    raw,
    normalized
  };
}

async function inspectAudioDurationSeconds(filePath: string): Promise<number> {
  const result = await runCommand("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath], {
    timeoutMs: 120000
  });
  const duration = Number.parseFloat(result.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Unable to inspect duration for ${filePath}`);
  }
  return duration;
}

async function commandTranscriptGenerate(options: CliOptions, episodeId: string): Promise<void> {
  const { manifest, episodeDir } = await readEpisodeWorkspaceForAudio(options, episodeId);
  if (!manifest) {
    throw new Error(`Episode manifest not found for ${episodeId}`);
  }
  const config = await loadRuntimeConfig(configOverridesFromCli(options), (await loadEpisodeConfig(episodeDir)) ?? {});
  if (config.transcriptionProvider === "whisper.cpp" && !config.whisperWordTimestamps) {
    throw new Error("Transcript generation requires WHISPER_WORD_TIMESTAMPS=true when using whisper.cpp.");
  }
  const audioPath = await resolveEpisodeSourceAudioPath(episodeDir, manifest);
  const audioDurationSeconds = await inspectAudioDurationSeconds(audioPath);
  const outputPaths = {
    raw: path.join(episodeDir, "transcript", "transcript.raw.json"),
    normalized: path.join(episodeDir, "transcript", "transcript.json"),
    srt: path.join(episodeDir, "transcript", "transcript.srt")
  };
  if (options.dryRun) {
    printJson({
      episodeId,
      audioPath,
      audioDurationSeconds,
      transcriptionProvider: config.transcriptionProvider,
      whisperBin: config.whisperBin,
      whisperModel: config.whisperModel,
      openAiTranscriptionModel: config.openAiTranscriptionModel,
      language: config.whisperLanguage ?? config.scriptLanguage,
      outputPaths,
      dryRun: true
    });
    return;
  }
  const pipeline = await loadPipeline(options, episodeDir);
  const transcriptionLanguage = config.whisperLanguage ?? config.openAiTranscriptionLanguage ?? config.scriptLanguage;
  const transcriptRequest = transcriptionLanguage
    ? {
        sourceId: manifest.episodeId,
        audioPath,
        episodeDir,
        language: transcriptionLanguage
      }
    : {
        sourceId: manifest.episodeId,
        audioPath,
        episodeDir
      };
  const transcript = await pipeline.transcription.transcribe(transcriptRequest, new AbortController().signal);
  const artifacts = await readTranscriptArtifacts(episodeDir);
  const raw = artifacts.raw;
  const normalized = artifacts.normalized ?? normalizedTranscriptSchema.parse({
    schemaVersion: 1,
    sourceId: transcript.sourceId,
    language: transcript.language,
    text: transcript.text,
    segments: transcript.segments,
    words: transcript.words,
    generation: {
      provider: config.transcriptionProvider,
      model: config.whisperModel ?? config.openAiTranscriptionModel ?? "unknown",
      generatedAt: new Date().toISOString(),
      wordTimestamps: true as const
    }
  });
  const visualSceneCount = buildVisualScenesFromSubtitleSegments(normalized.segments, {
    minDurationSeconds: config.visualSceneMinSeconds,
    maxDurationSeconds: config.visualSceneMaxSeconds
  }).length;
  const summary = {
    episodeId,
    backend: raw?.backend ?? config.transcriptionProvider,
    model: raw?.model ?? config.whisperModel ?? config.openAiTranscriptionModel ?? "unknown",
    language: normalized.language,
    audioDurationSeconds,
    wordCount: normalized.words.length,
    rawSegmentCount: raw?.rawSegments.length ?? 0,
    normalizedSubtitleCount: normalized.segments.length,
    visualSceneCount,
    outputPaths: [artifacts.rawPath, artifacts.normalizedPath, outputPaths.srt]
  };
  if (options.json) {
    printJson(summary);
    return;
  }
  process.stdout.write(
    [
      `backend: ${summary.backend}`,
      `model: ${summary.model}`,
      `language: ${summary.language}`,
      `audio duration: ${summary.audioDurationSeconds.toFixed(3)}s`,
      `word count: ${summary.wordCount}`,
      `raw segment count: ${summary.rawSegmentCount}`,
      `normalized subtitle count: ${summary.normalizedSubtitleCount}`,
      `visual scene count: ${summary.visualSceneCount}`,
      `output paths:`,
      ...summary.outputPaths.map((value) => `  ${value}`)
    ].join("\n") + "\n"
  );
}

async function commandTranscriptNormalize(options: CliOptions, episodeId: string): Promise<void> {
  const { episodeDir, manifest } = await readEpisodeWorkspaceForAudio(options, episodeId);
  if (!manifest) {
    throw new Error(`Episode manifest not found for ${episodeId}`);
  }
  const config = await loadRuntimeConfig(configOverridesFromCli(options), (await loadEpisodeConfig(episodeDir)) ?? {});
  const artifacts = await readTranscriptArtifacts(episodeDir);
  if (!artifacts.raw) {
    throw new Error(`No raw Whisper transcript found for ${episodeId}.`);
  }
  const normalized = normalizeTranscriptFromWords({
    sourceId: artifacts.raw.sourceId,
    language: artifacts.raw.language,
    words: artifacts.raw.words,
    provider: artifacts.raw.backend,
    model: artifacts.raw.model,
    generatedAt: new Date().toISOString(),
    options: transcriptSegmentationOptionsFromConfig(config)
  });
  if (options.dryRun) {
    printJson({
      episodeId,
      rawPath: artifacts.rawPath,
      normalizedPath: artifacts.normalizedPath,
      subtitleCount: normalized.segments.length,
      wordCount: normalized.words.length,
      dryRun: true
    });
    return;
  }
  await writeNormalizedTranscriptArtifacts(path.join(episodeDir, "transcript"), artifacts.rawPath, artifacts.normalizedPath, artifacts.raw, normalized);
  if (options.json) {
    printJson(normalized);
    return;
  }
  process.stdout.write(`${artifacts.normalizedPath}\n`);
}

async function commandTranscriptValidate(options: CliOptions, episodeId: string): Promise<void> {
  const { episodeDir, manifest } = await readEpisodeWorkspaceForAudio(options, episodeId);
  if (!manifest) {
    throw new Error(`Episode manifest not found for ${episodeId}`);
  }
  const config = await loadRuntimeConfig(configOverridesFromCli(options), (await loadEpisodeConfig(episodeDir)) ?? {});
  const artifacts = await readTranscriptArtifacts(episodeDir);
  const issues: string[] = [];
  const spokenRawWords = (artifacts.raw?.words ?? []).filter(
    (word: { readonly text: string }) =>
      normalizeWhitespace(word.text).length > 0 && !/^\[(?:music|música|applause|silence)\]$/iu.test(word.text)
  );
  if (!artifacts.raw) {
    issues.push("missing raw Whisper transcript");
  }
  if (!artifacts.normalized) {
    issues.push("missing normalized transcript");
  } else {
    try {
      validateNormalizedTranscript(artifacts.normalized);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (artifacts.raw && artifacts.normalized) {
    if (spokenRawWords.length !== artifacts.normalized.words.length) {
      issues.push("word count mismatch between raw and normalized transcript");
    }
    const visualSceneCount = buildVisualScenesFromSubtitleSegments(artifacts.normalized.segments, {
      minDurationSeconds: config.visualSceneMinSeconds,
      maxDurationSeconds: config.visualSceneMaxSeconds
    }).length;
    if (visualSceneCount > artifacts.normalized.segments.length) {
      issues.push("visual scenes should not exceed subtitle segments");
    }
  }
  const summary = {
    episodeId,
    valid: issues.length === 0,
    issues,
    rawPath: artifacts.rawPath,
    normalizedPath: artifacts.normalizedPath,
    subtitleCount: artifacts.normalized?.segments.length ?? 0,
    wordCount: artifacts.normalized?.words.length ?? 0
  };
  if (options.json) {
    printJson(summary);
    return;
  }
  if (!summary.valid) {
    throw new Error(issues.join("; "));
  }
  process.stdout.write(`Transcript valid for ${episodeId}\n`);
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
  if (config.ttsProvider !== "openai-compatible" || !config.openAiCompatibleApiKey) {
    throw new Error("OpenAI speech is required for narration generation; mock speech is disabled.");
  }
  const language = config.scriptLanguage ?? episodeConfig?.scriptLanguage ?? "en";
  const script = await loadNarrationScriptMarkdown(episodeDir, language);
  const rewrittenChunks =
    manifest?.rewrittenScript?.sections
      .map((section) => normalizeWhitespace(section.text))
      .filter((chunk) => chunk.length > 0) ?? [];
  const sceneChunks = manifest?.scenePlan?.scenes
    .map((scene) => normalizeWhitespace(scene.canonicalNarration))
    .filter((chunk) => chunk.length > 0) ?? [];
  const sceneCount = manifest?.scenePlan?.scenes.length;
  const chunks =
    sceneChunks.length > 0
      ? sceneChunks
      : rewrittenChunks.length > 0
        ? balanceScriptChunksForScenes(rewrittenChunks, sceneCount)
      : balanceScriptChunksForScenes(splitEpisodeScriptMarkdown(script.text), sceneCount);
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
  const segmentPaths: string[] = Array(chunks.length).fill("");
  const artifacts: Array<ArtifactReference | undefined> = Array(chunks.length).fill(undefined);
  const workerCount = Math.min(2, chunks.length);
  let nextIndex = 0;
  const takeIndex = (): number | null => {
    if (nextIndex >= chunks.length) {
      return null;
    }
    const current = nextIndex;
    nextIndex += 1;
    return current;
  };
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = takeIndex();
      if (index === null) {
        return;
      }
      const chunk = chunks[index];
      if (chunk === undefined) {
        return;
      }
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
      segmentPaths[index] = outputPath;
      const stats = await fs.stat(outputPath);
      artifacts[index] = {
        id: artifactIdSchema.parse(`artifact-${slugify(`${episodeSlug}-segment-${String(index + 1).padStart(3, "0")}-${language}`)}`),
        kind: language === "en" ? "audio.segment" : `audio.segment.${language}`,
        path: outputPath,
        mimeType: "audio/wav",
        sizeBytes: stats.size,
        checksumSha256: await hashFile(outputPath),
        createdAt: generatedAt
      };
    }
  });
  await Promise.all(workers);
  const completeSegmentPaths = segmentPaths.filter((segmentPath): segmentPath is string => segmentPath.length > 0);
  const completeArtifacts = artifacts.filter((artifact): artifact is ArtifactReference => artifact !== undefined);
  const segmentsListPath = path.join(audioDir, "segments.txt");
  await writeTextAtomic(segmentsListPath, completeSegmentPaths.map((segmentPath) => `file '${segmentPath.replace(/'/g, "'\\''")}'`).join("\n"));
  const concat = spawnSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", segmentsListPath, "-c", "copy", narrationPath], { encoding: "utf8" });
  if (concat.status !== 0) {
    throw new Error(concat.stderr || "Failed to concatenate narration audio.");
  }
  const narrationStats = await fs.stat(narrationPath);
  completeArtifacts.push({
    id: artifactIdSchema.parse(`artifact-${slugify(`${episodeSlug}-narration-${language}`)}`),
    kind: language === "en" ? "audio.narration" : `audio.narration.${language}`,
    path: narrationPath,
    mimeType: "audio/wav",
    sizeBytes: narrationStats.size,
    checksumSha256: await hashFile(narrationPath),
    createdAt: generatedAt
  });
  completeArtifacts.push({
    id: artifactIdSchema.parse(`artifact-${slugify(`${episodeSlug}-script-source-${language}`)}`),
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
      ...completeArtifacts
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
      segmentPaths: completeSegmentPaths
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
  if (!await localizedSceneAudioIsComplete(episodeDir, language, manifest.scenePlan.scenes.length)) {
    await commandAudioGenerate({ ...options, json: false, quiet: true }, episodeId);
  }
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
    imageDir: path.join(episodeDir, "images", "generated"),
    trailingSilenceRatio: config.trailingSilenceRatio
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
  const promptBatch = createPromptBatch(manifest.scenePlan, "16:9", localSceneStyle, localSceneNegativePrompt);
  const promptBySceneId = new Map(promptBatch.map((prompt) => [prompt.sceneId, prompt] as const));
  const selectedScenes = sceneId ? manifest.scenePlan.scenes.filter((scene) => scene.id === sceneId) : manifest.scenePlan.scenes;
  if (selectedScenes.length === 0) {
    throw new Error(sceneId ? `Scene not found: ${sceneId}` : "No scenes available.");
  }
  const jobs = selectedScenes.map((scene) => ({
    scene,
    prompt: promptBySceneId.get(scene.id)?.prompt ?? scene.imagePrompt,
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

async function commandRender(options: CliOptions, episodeId: string, profile: "youtube" | "vertical", burnCaptions = true): Promise<void> {
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
  if (!await localizedSceneAudioIsComplete(episodeDir, language, manifest.scenePlan.scenes.length)) {
    await commandAudioGenerate({ ...options, json: false, quiet: true }, episodeId);
  }
  const captionsPath = burnCaptions && isEnglishLanguage(language) ? path.join(episodeDir, "captions", "captions.ass") : undefined;
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
    trailingSilenceRatio: config.trailingSilenceRatio,
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
  .option("--title <title>", "episode title")
  .option("--slug <slug>", "episode slug")
.action(async (opts: { file?: string; url?: string; transcript?: string; title?: string; slug?: string }) => {
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
    if (opts.title) {
      input.title = opts.title;
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
  .command("generate")
  .requiredOption("--episode <episode-id>")
  .description("Run Whisper, write raw and normalized transcript artifacts")
  .action(async (opts: { episode: string }) => {
    await commandTranscriptGenerate(program.opts<CliOptions>(), opts.episode);
  });
transcriptCommand
  .command("normalize")
  .requiredOption("--episode <episode-id>")
  .description("Normalize an existing raw Whisper transcript without rerunning Whisper")
  .action(async (opts: { episode: string }) => {
    await commandTranscriptNormalize(program.opts<CliOptions>(), opts.episode);
  });
transcriptCommand
  .command("validate")
  .requiredOption("--episode <episode-id>")
  .description("Validate transcript artifacts locally")
  .action(async (opts: { episode: string }) => {
    await commandTranscriptValidate(program.opts<CliOptions>(), opts.episode);
  });
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
  .option("--no-captions", "render without burned-in captions")
  .action(async (episodeId: string, opts: { profile: "youtube" | "vertical"; captions?: boolean }) => {
    await commandRender(program.opts<CliOptions>(), episodeId, opts.profile, opts.captions ?? true);
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
