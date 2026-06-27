#!/usr/bin/env node
import "dotenv/config";
import {
  loadEpisodeConfig,
  loadRuntimeConfig,
  type RuntimeConfig,
  type RuntimeConfigOverrides,
} from "@mediaforge/config";
import {
  artifactIdSchema,
  episodeManifestSchema,
  normalizedTranscriptSchema,
  rewrittenScriptSchema,
  sceneIdSchema,
  scenePlanSchema,
  type ArtifactReference,
  type NormalizedTranscript,
} from "@mediaforge/domain";
import {
  approveEpisodeCharacter,
  createPromptBatch,
  exportSceneWorkbook,
  generateEpisodeImageReferences,
  generateEpisodeImages,
  generateOpenAiSceneImages,
  importImageAssets,
  loadEpisodeImageGenerationSettings,
  loadOpenAiImageGenerationSettings,
  localSceneNegativePrompt,
  localSceneStyle,
  missingScenes,
  planEpisodeImageGeneration,
  regenerateEpisodeCharacter,
  validateImageAssets,
} from "@mediaforge/image-generation";
import {
  findEpisodeScenesFile,
  generateYoutubeMetadataFromScenesFile,
  listEpisodeSceneFiles,
  readAndValidateScenesFile,
  YOUTUBE_METADATA_PROMPT_VERSION,
  type YoutubeMetadata,
  type YoutubeMetadataGenerationInfo,
  type YoutubeMetadataGenerationOptions,
  type YoutubeMetadataOutputs,
} from "@mediaforge/metadata";
import {
  FFmpegVideoRenderer,
  HybridFFmpegVideoRenderer,
  backfillSceneClipManifests,
  validateRenderedVideo,
  type RemoteRenderSettings,
} from "@mediaforge/rendering";
import {
  uploadYoutubeEpisode,
  type YoutubeUploadCommandInput,
  type YoutubeUploadOverrides,
  type YoutubeAuthSettings,
} from "@mediaforge/youtube-upload";
import {
  createExecutionTelemetry,
  createLogger,
  currentExecutionTelemetry,
  withExecutionTelemetry,
} from "@mediaforge/observability";
import {
  createPipeline,
  type CreateEpisodeOptions,
  type MediaForgeEnvironment,
} from "@mediaforge/pipeline";
import { runCommand } from "@mediaforge/process-runner";
import {
  buildSrt,
  ensureDir,
  ensureWorkspacePath,
  fileExists,
  formatTimestampLabel,
  hashFile,
  normalizeWhitespace,
  safeBasename,
  slugify,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import {
  loadEpisodeScriptMarkdown,
  loadSpeechVoiceSettings,
  splitEpisodeScriptMarkdown,
  writeEpisodeScriptMarkdown,
} from "@mediaforge/speech";
import {
  buildVisualScenesFromSubtitleSegments,
  normalizeTranscriptFromWords,
  parseWhisperRawArtifact,
  validateNormalizedTranscript,
  writeNormalizedTranscriptArtifacts,
  type WhisperRawTranscriptArtifact,
} from "@mediaforge/transcription";
import { Command } from "commander";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { registerEpisodeCommands } from "./episode-commands.js";
import { registerStoryLocalizationCommands } from "./story-localization-commands.js";

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
  speechVoicePreset?: "slow" | "fast" | "very-fast";
  scriptLanguage?: string;
  sceneLimit?: number;
  fromStage?: string;
  untilStage?: string;
  allowUnapprovedCharacterReferences?: boolean;
  force?: boolean;
  episode?: string;
  scene?: string;
  character?: string;
}

type YoutubeChannelRuntimeConfig = RuntimeConfig & {
  youtubeChannelIdGerman?: string;
  youtubeChannelIdSpanish?: string;
  youtubeChannelIdFrench?: string;
  youtubeRefreshTokenGerman?: string;
  youtubeRefreshTokenSpanish?: string;
  youtubeRefreshTokenFrench?: string;
};

interface DoctorCheck {
  readonly label: string;
  readonly status: "ok" | "missing";
  readonly detail: string;
  readonly kind: "required" | "optional" | "manual" | "credential";
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function markEpisodeTelemetry(episodeId: string): void {
  currentExecutionTelemetry()?.setEpisodeId(episodeId);
}

function resolveLogLevel(
  value: string | undefined
): "info" | "debug" | "warn" | "error" | "trace" | "fatal" | "silent" {
  if (
    value === "info" ||
    value === "debug" ||
    value === "warn" ||
    value === "error" ||
    value === "trace" ||
    value === "fatal" ||
    value === "silent"
  ) {
    return value;
  }
  return "info";
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

function compactConfigOverrides(
  overrides: RuntimeConfigOverrides
): RuntimeConfigOverrides {
  const compacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(overrides) as Array<
    [keyof RuntimeConfig, RuntimeConfig[keyof RuntimeConfig] | undefined]
  >) {
    if (value !== undefined) {
      compacted[String(key)] = value;
    }
  }
  return compacted as RuntimeConfigOverrides;
}

function buildRemoteRenderSettings(
  config: RuntimeConfig
): RemoteRenderSettings {
  return {
    enabled: config.remoteRenderEnabled,
    host: config.remoteRenderHost,
    user: config.remoteRenderUser,
    port: config.remoteRenderPort,
    baseDir: config.remoteRenderBaseDir,
    concurrency: config.remoteRenderConcurrency,
    connectTimeoutSeconds: config.remoteRenderConnectTimeoutSeconds,
    commandTimeoutSeconds: config.remoteRenderCommandTimeoutSeconds,
    maxRetries: config.remoteRenderMaxRetries,
    fallbackToLocal: config.remoteRenderFallbackToLocal,
    keepFiles: config.remoteRenderKeepFiles,
    verifyHostKey: config.remoteRenderVerifyHostKey,
    ...(config.remoteRenderKnownHostsFile
      ? { knownHostsFile: config.remoteRenderKnownHostsFile }
      : {}),
    ...(config.remoteRenderSshPrivateKey
      ? { sshPrivateKey: config.remoteRenderSshPrivateKey }
      : {}),
    uploadMethod: config.remoteRenderUploadMethod,
    ...(config.localRenderConcurrency
      ? { localRenderConcurrency: config.localRenderConcurrency }
      : {}),
    cleanupMaxAgeHours: config.remoteRenderCleanupMaxAgeHours,
  };
}

function isEnglishLanguage(language: string): boolean {
  return language.toLowerCase() === "en";
}

function localizedAudioBaseDir(episodeDir: string, language: string): string {
  return path.join(path.resolve(episodeDir), "locales", safeBasename(language), "full");
}

function localizedSuffix(language: string): string {
  return isEnglishLanguage(language) ? "" : `-${safeBasename(language)}`;
}

function localizedSegmentsDir(episodeDir: string, language: string): string {
  return path.join(localizedAudioBaseDir(episodeDir, language), "audio", "segments");
}

function localizedNarrationPath(episodeDir: string, language: string): string {
  return path.join(localizedAudioBaseDir(episodeDir, language), "audio", "narration.wav");
}

function localizedMetadataDir(episodeDir: string, language: string): string {
  return path.join(localizedAudioBaseDir(episodeDir, language), "metadata");
}

function localizedClipsDirName(language: string): string {
  return isEnglishLanguage(language)
    ? "clips"
    : `clips-${safeBasename(language)}`;
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
  const normalized = chunks
    .map((chunk) => normalizeWhitespace(chunk))
    .filter((chunk) => chunk.length > 0);
  if (normalized.length === 0) {
    return [];
  }
  if (normalized.length > desiredCount) {
    const balanced: string[] = [];
    const step = normalized.length / desiredCount;
    for (let index = 0; index < desiredCount; index += 1) {
      const start = Math.floor(index * step);
      const end =
        index === desiredCount - 1
          ? normalized.length
          : Math.max(start + 1, Math.floor((index + 1) * step));
      balanced.push(normalized.slice(start, end).join(" "));
    }
    return balanced
      .map((chunk) => normalizeWhitespace(chunk))
      .filter((chunk) => chunk.length > 0);
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

async function localizedSceneAudioIsComplete(
  episodeDir: string,
  language: string,
  expectedCount: number
): Promise<boolean> {
  const segmentsDir = localizedSegmentsDir(
    localizedAudioBaseDir(episodeDir, language),
    language
  );
  const existing = await fs
    .readdir(segmentsDir, { withFileTypes: true })
    .catch(() => []);
  const wavCount = existing.filter(
    (entry) => entry.isFile() && entry.name.endsWith(".wav")
  ).length;
  return wavCount >= expectedCount;
}

async function loadNarrationScriptMarkdown(
  episodeDir: string,
  language: string
): Promise<{ readonly filePath: string; readonly text: string }> {
  return loadEpisodeScriptMarkdown(episodeDir, language, "Narration Script");
}

function balanceScriptChunksForScenes(
  chunks: string[],
  sceneCount?: number
): string[] {
  const normalized = chunks
    .map((chunk) => normalizeWhitespace(chunk))
    .filter((chunk) => chunk.length > 0);
  if (!sceneCount || sceneCount <= 0 || normalized.length === 0) {
    return normalized;
  }
  if (normalized.length === sceneCount) {
    return normalized;
  }
  const sentenceChunks = normalized.flatMap((chunk) =>
    splitSpeechSentences(chunk)
  );
  const packed = rebalanceChunks(
    sentenceChunks.length > 0 ? sentenceChunks : normalized,
    sceneCount
  );
  return packed.length > 0 ? packed : normalized;
}

async function buildEnvironment(
  options: CliOptions
): Promise<MediaForgeEnvironment> {
  const config = await loadRuntimeConfig(configOverridesFromCli(options));
  createLogger(options.verbose ? "debug" : config.logLevel);
  const pipeline = await createPipeline(configOverridesFromCli(options));
  return pipeline.environment;
}

async function loadPipeline(options: CliOptions, episodeDir?: string) {
  const overrides = compactConfigOverrides(configOverridesFromCli(options));
  const episodeConfig = episodeDir ? await loadEpisodeConfig(episodeDir) : null;
  const emptyEpisodeOverrides: RuntimeConfigOverrides = {};
  return createPipeline(
    overrides,
    episodeConfig
      ? compactConfigOverrides(episodeConfig)
      : emptyEpisodeOverrides
  );
}

function describeDoctorItem(
  label: string,
  ok: boolean,
  detail: string,
  kind: "required" | "optional" | "manual" | "credential"
): DoctorCheck {
  return { label, status: ok ? "ok" : "missing", detail, kind };
}

async function commandDoctor(options: CliOptions): Promise<void> {
  const config = await loadRuntimeConfig(configOverridesFromCli(options));
  const checks: DoctorCheck[] = [];
  checks.push(
    describeDoctorItem(
      "Node",
      process.versions.node.startsWith("22."),
      `Node ${process.versions.node}`,
      "required"
    )
  );
  checks.push(
    describeDoctorItem(
      "pnpm",
      spawnSync("pnpm", ["-v"], { encoding: "utf8" }).status === 0,
      "pnpm available",
      "required"
    )
  );
  checks.push(
    describeDoctorItem(
      "ffmpeg",
      spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0,
      "ffmpeg available",
      "required"
    )
  );
  checks.push(
    describeDoctorItem(
      "ffprobe",
      spawnSync("ffprobe", ["-version"], { encoding: "utf8" }).status === 0,
      "ffprobe available",
      "required"
    )
  );
  checks.push(
    describeDoctorItem(
      "yt-dlp",
      spawnSync("yt-dlp", ["--version"], { encoding: "utf8" }).status === 0,
      "yt-dlp available",
      "optional"
    )
  );
  checks.push(
    describeDoctorItem(
      "SQLite",
      true,
      "node:sqlite available in Node 22",
      "required"
    )
  );
  checks.push(
    describeDoctorItem(
      "Browser opener",
      spawnSync("xdg-open", ["--help"], { encoding: "utf8" }).status === 0,
      "xdg-open available",
      "optional"
    )
  );
  checks.push(
    describeDoctorItem(
      "whisper.cpp",
      spawnSync(config.whisperBin ?? "whisper-cli", ["--help"], {
        encoding: "utf8",
      }).status === 0,
      config.whisperBin ?? "whisper-cli",
      config.transcriptionProvider === "whisper.cpp" ? "required" : "optional"
    )
  );
  const whisperModelExists =
    Boolean(config.whisperModel) &&
    (await fs
      .stat(config.whisperModel ?? "")
      .then(() => true)
      .catch(() => false));
  checks.push(
    describeDoctorItem(
      "Whisper model",
      !config.whisperModel || whisperModelExists,
      config.whisperModel ?? "No model configured",
      config.transcriptionProvider === "whisper.cpp" ? "required" : "optional"
    )
  );
  const needsOpenAiCredentials =
    config.textProvider === "openai-compatible" ||
    config.ttsProvider === "openai-compatible";
  checks.push(
    describeDoctorItem(
      "OpenAI API key",
      !needsOpenAiCredentials || Boolean(config.openAiCompatibleApiKey),
      needsOpenAiCredentials
        ? "Required for openai-compatible providers"
        : "Not required for the current configuration",
      needsOpenAiCredentials ? "credential" : "optional"
    )
  );
  const workspace = config.workspaceDir;
  await ensureDir(workspace);
  const writable = await fs
    .access(workspace)
    .then(() => true)
    .catch(() => false);
  checks.push(
    describeDoctorItem("Workspace writable", writable, workspace, "required")
  );
  const fonts =
    spawnSync("bash", ["-lc", "ls /usr/share/fonts >/dev/null 2>&1"], {
      encoding: "utf8",
    }).status === 0;
  checks.push(
    describeDoctorItem("Fonts", fonts, "System font directory", "optional")
  );
  const summary = {
    ok: checks.every(
      (check) => check.status === "ok" || check.kind !== "required"
    ),
    checks,
  };
  printJson(summary);
}

async function commandInit(options: CliOptions): Promise<void> {
  const environment = await buildEnvironment(options);
  await ensureDir(environment.config.workspaceDir);
  if (!options.quiet) {
    process.stdout.write(
      `Workspace ready at ${environment.config.workspaceDir}\n`
    );
  }
}

async function commandCreate(
  options: CliOptions,
  input: CreateEpisodeOptions
): Promise<void> {
  const pipeline = await loadPipeline(options);
  const manifest = await pipeline.createEpisode(input);
  if (options.json) {
    printJson(manifest);
    return;
  }
  process.stdout.write(
    `Created episode ${manifest.episodeId} at ${manifest.slug}\n`
  );
}

async function commandRun(
  options: CliOptions,
  episodeId: string
): Promise<void> {
  markEpisodeTelemetry(episodeId);
  const { episodeDir } = await readManifestForEpisode(options, episodeId);
  const pipeline = await loadPipeline(options, episodeDir);
  const result = await pipeline.runEpisode(episodeId as never, {
    ...(options.fromStage ? { fromStage: options.fromStage as never } : {}),
    ...(options.untilStage ? { untilStage: options.untilStage as never } : {}),
    ...(options.sceneLimit ? { sceneLimit: options.sceneLimit } : {}),
  });
  if (options.json) {
    printJson(result);
    return;
  }
  process.stdout.write(
    `Completed ${result.episodeId}\n${result.outputPaths.join("\n")}\n`
  );
}

async function readManifestForEpisode(options: CliOptions, episodeId: string) {
  const config = await loadRuntimeConfig(configOverridesFromCli(options));
  const workspace = config.workspaceDir;
  const entries = await fs
    .readdir(workspace, { withFileTypes: true })
    .catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const manifestPath = path.join(workspace, entry.name, "manifest.json");
    if (!(await fileExists(manifestPath))) {
      continue;
    }
    const manifest = episodeManifestSchema.parse(
      JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown
    );
    console.log({ episodeId: manifest.episodeId, manifestPath });
    if (manifest.episodeId === episodeId) {
      const episodeDir = path.dirname(manifestPath);
      let nextManifest = manifest;
      let shouldWrite = false;

      if (!nextManifest.scenePlan) {
        const scenePlanCandidates = [
          path.join(episodeDir, "canonical", "scenes.json"),
          path.join(episodeDir, "scenes.json"),
          path.join(episodeDir, "output", "scenes.json"),
        ];
        const scenePlanPath = (
          await Promise.all(scenePlanCandidates.map(async (candidate) => ({
            candidate,
            exists: await fileExists(candidate),
          })))
        ).find((entry) => entry.exists)?.candidate;
        if (scenePlanPath) {
          nextManifest = {
            ...nextManifest,
            scenePlan: scenePlanSchema.parse(
              JSON.parse(await fs.readFile(scenePlanPath, "utf8")) as unknown
            ),
            updatedAt: new Date().toISOString(),
          };
          shouldWrite = true;
        }
      }

      if (!nextManifest.rewrittenScript) {
        const rewrittenScriptPath = path.join(
          episodeDir,
          "script",
          "rewritten-script.json"
        );
        if (await fileExists(rewrittenScriptPath)) {
          nextManifest = {
            ...nextManifest,
            rewrittenScript: rewrittenScriptSchema.parse(
              JSON.parse(
                await fs.readFile(rewrittenScriptPath, "utf8")
              ) as unknown
            ),
            updatedAt: new Date().toISOString(),
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

async function readEpisodeWorkspaceForAudio(
  options: CliOptions,
  episodeId: string
) {
  const config = await loadRuntimeConfig(configOverridesFromCli(options));
  const directDir = path.join(config.workspaceDir, episodeId);
  const directScriptExists =
    (await fileExists(path.join(directDir, "script.md"))) ||
    (await fileExists(path.join(directDir, "script", "rewritten-script.md")));
  const directManifestPath = path.join(directDir, "manifest.json");
  if (directScriptExists || (await fileExists(directManifestPath))) {
    const manifest = (await fileExists(directManifestPath))
      ? episodeManifestSchema.parse(
          JSON.parse(await fs.readFile(directManifestPath, "utf8")) as unknown
        )
      : null;
    return { episodeDir: directDir, manifest };
  }
  const manifestResult = await readManifestForEpisode(options, episodeId);
  return manifestResult;
}

async function resolveEpisodeSourceAudioPath(
  episodeDir: string,
  manifest: {
    readonly source: { readonly filePath?: string | undefined };
  } | null
): Promise<string> {
  const candidates: string[] = [];
  const sourceFilePath = manifest?.source?.filePath;
  if (sourceFilePath) {
    candidates.push(sourceFilePath);
  }
  const sourceDir = path.join(episodeDir, "source");
  const rootEntries = await fs
    .readdir(sourceDir, { withFileTypes: true })
    .catch(() => []);
  for (const entry of rootEntries) {
    if (!entry.isFile()) {
      continue;
    }
    const candidate = path.join(sourceDir, entry.name);
    if (
      /^source-media\./u.test(entry.name) ||
      /\.(?:wav|mp3|m4a|mp4|mkv|webm|ogg|flac)$/iu.test(entry.name)
    ) {
      candidates.push(candidate);
    }
  }
  const episodeEntries = await fs
    .readdir(episodeDir, { withFileTypes: true })
    .catch(() => []);
  for (const entry of episodeEntries) {
    if (!entry.isFile()) {
      continue;
    }
    if (
      /^source-media\./u.test(entry.name) ||
      /\.(?:wav|mp3|m4a|mp4|mkv|webm|ogg|flac)$/iu.test(entry.name)
    ) {
      candidates.push(path.join(episodeDir, entry.name));
    }
  }
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `No source audio file could be located for ${path.basename(episodeDir)}.`
  );
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
    boundaryLookbackWords: config.transcriptBoundaryLookbackWords,
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
  const normalizedCandidate = (await fileExists(normalizedPath))
    ? normalizedPath
    : null;
  const raw = rawCandidate
    ? parseWhisperRawArtifact(
        JSON.parse(await fs.readFile(rawCandidate, "utf8")) as unknown
      )
    : null;
  const normalized = normalizedCandidate
    ? normalizedTranscriptSchema.parse(
        JSON.parse(await fs.readFile(normalizedCandidate, "utf8")) as unknown
      )
    : null;
  return {
    rawPath,
    normalizedPath,
    raw,
    normalized,
  };
}

async function inspectAudioDurationSeconds(filePath: string): Promise<number> {
  const result = await runCommand(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    {
      timeoutMs: 120000,
    }
  );
  const duration = Number.parseFloat(result.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Unable to inspect duration for ${filePath}`);
  }
  return duration;
}

function isInsufficientQuotaError(error: unknown): boolean {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /insufficient_quota|exceeded your current quota|does not have access to model/i.test(
    message
  );
}

async function cleanupAudioGenerationArtifacts(
  audioDir: string,
  segmentsDir: string,
  narrationPath: string
): Promise<void> {
  const entries = await fs
    .readdir(segmentsDir, { withFileTypes: true })
    .catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        await fs
          .rm(path.join(segmentsDir, entry.name), { force: true })
          .catch(() => {});
      })
  );
  await Promise.all([
    fs.rm(path.join(audioDir, "segments.txt"), { force: true }).catch(() => {}),
    fs
      .rm(path.join(audioDir, "generation-report.json"), { force: true })
      .catch(() => {}),
    fs.rm(narrationPath, { force: true }).catch(() => {}),
  ]);
}

async function cleanupStaleAudioTempFiles(
  audioDir: string,
  segmentsDir: string
): Promise<void> {
  const directories = [audioDir, segmentsDir];
  await Promise.all(
    directories.map(async (directory) => {
      const entries = await fs
        .readdir(directory, { withFileTypes: true })
        .catch(() => []);
      await Promise.all(
        entries
          .filter((entry) => entry.isFile() && entry.name.endsWith(".tmp"))
          .map(async (entry) => {
            await fs
              .rm(path.join(directory, entry.name), { force: true })
              .catch(() => {});
          })
      );
    })
  );
}

function resolveTtsConcurrency(): number {
  const raw =
    process.env["TTS_CONCURRENCY"] ??
    process.env["OPENAI_TTS_CONCURRENCY"] ??
    "3";
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }
  return parsed;
}

async function synthesizeSpeechChunks(
  pipeline: Awaited<ReturnType<typeof loadPipeline>>,
  chunks: ReadonlyArray<string>,
  speechSettings: Awaited<ReturnType<typeof loadSpeechVoiceSettings>>,
  segmentsDir: string,
  episodeSlug: string,
  language: string,
  generatedAt: string,
  concurrency: number
): Promise<{
  segmentPaths: string[];
  artifacts: Array<ArtifactReference | undefined>;
}> {
  const segmentPaths: string[] = Array(chunks.length).fill("");
  const artifacts: Array<ArtifactReference | undefined> = Array(
    chunks.length
  ).fill(undefined);
  const effectiveConcurrency = Math.min(
    Math.max(1, concurrency),
    Math.max(1, chunks.length)
  );
  let nextIndex = 0;
  const workers = Array.from({ length: effectiveConcurrency }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= chunks.length) {
        return;
      }
      const chunk = chunks[index];
      if (chunk === undefined) {
        continue;
      }
      const sceneId = sceneIdSchema.parse(
        `scene-${String(index + 1).padStart(3, "0")}`
      );
      const outputPath = path.join(
        segmentsDir,
        `${safeBasename(`segment-${String(index + 1).padStart(3, "0")}`)}.wav`
      );
      await pipeline.speech.synthesize(
        {
          sceneId,
          text: chunk,
          voiceProfile: speechSettings.profile,
          outputPath,
        },
        new AbortController().signal
      );
      segmentPaths[index] = outputPath;
      const stats = await fs.stat(outputPath);
      artifacts[index] = {
        id: artifactIdSchema.parse(
          `artifact-${slugify(`${episodeSlug}-segment-${String(index + 1).padStart(3, "0")}-${language}`)}`
        ),
        kind: language === "en" ? "audio.segment" : `audio.segment.${language}`,
        path: outputPath,
        mimeType: "audio/wav",
        sizeBytes: stats.size,
        checksumSha256: await hashFile(outputPath),
        createdAt: generatedAt,
      };
    }
  });
  await Promise.all(workers);
  return { segmentPaths, artifacts };
}

function buildSpeechRequestPayload(
  chunk: string,
  options: {
    readonly model: string;
    readonly voice: string;
    readonly instructions: string;
    readonly responseFormat: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
  }
): {
  readonly input: string;
  readonly model: string;
  readonly voice: string;
  readonly instructions: string;
  readonly response_format: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
} {
  return {
    input: chunk,
    model: options.model,
    voice: options.voice,
    instructions: options.instructions,
    response_format: options.responseFormat,
  };
}

async function writeAudioPromptLogs(args: {
  readonly episodeDir: string;
  readonly episodeSlug: string;
  readonly language: string;
  readonly chunks: ReadonlyArray<string>;
  readonly speechSettings: Awaited<ReturnType<typeof loadSpeechVoiceSettings>>;
  readonly model: string;
  readonly voice: string;
  readonly generatedAt: string;
}): Promise<void> {
  const canonicalPromptDir = path.join(
    localizedAudioBaseDir(args.episodeDir, args.language),
    "audio",
    "prompts"
  );
  const legacyPromptDir = path.join(
    args.episodeDir,
    safeBasename(args.language),
    "audio",
    "prompts"
  );
  const payloadBase = {
    model: args.model,
    voice: args.voice,
    instructions: args.speechSettings.instructions,
    responseFormat: "wav" as const,
  };
  const promptRecords = args.chunks.map((chunk, index) => {
    const sceneId = `scene-${String(index + 1).padStart(3, "0")}`;
    const requestPayload = buildSpeechRequestPayload(chunk, {
      ...payloadBase,
      responseFormat: payloadBase.responseFormat,
    });
    return {
      episodeId: args.episodeSlug,
      episodeSlug: args.episodeSlug,
      language: args.language,
      chunkIndex: index + 1,
      chunkCount: args.chunks.length,
      sceneId,
      generatedAt: args.generatedAt,
      request: requestPayload,
    };
  });
  await Promise.all(
    [canonicalPromptDir, legacyPromptDir].map(async (promptDir) => {
      await ensureDir(promptDir);
      await writeJsonAtomic(
        path.join(promptDir, "index.json"),
        {
          episodeId: args.episodeSlug,
          language: args.language,
          chunkCount: args.chunks.length,
          generatedAt: args.generatedAt,
          prompts: promptRecords.map((record, index) => ({
            chunkIndex: index + 1,
            sceneId: record.sceneId,
            file: `chunk-${String(index + 1).padStart(3, "0")}.json`,
          })),
        }
      );
      await Promise.all(
        promptRecords.map(async (record, index) => {
          const fileName = `chunk-${String(index + 1).padStart(3, "0")}.json`;
          await writeJsonAtomic(path.join(promptDir, fileName), record);
        })
      );
    })
  );
}

async function commandTranscriptGenerate(
  options: CliOptions,
  episodeId: string
): Promise<void> {
  markEpisodeTelemetry(episodeId);
  const { manifest, episodeDir } = await readEpisodeWorkspaceForAudio(
    options,
    episodeId
  );
  if (!manifest) {
    throw new Error(`Episode manifest not found for ${episodeId}`);
  }
  const config = await loadRuntimeConfig(
    configOverridesFromCli(options),
    (await loadEpisodeConfig(episodeDir)) ?? {}
  );
  if (
    config.transcriptionProvider === "whisper.cpp" &&
    !config.whisperWordTimestamps
  ) {
    throw new Error(
      "Transcript generation requires WHISPER_WORD_TIMESTAMPS=true when using whisper.cpp."
    );
  }
  const audioPath = await resolveEpisodeSourceAudioPath(episodeDir, manifest);
  const audioDurationSeconds = await inspectAudioDurationSeconds(audioPath);
  const outputPaths = {
    raw: path.join(episodeDir, "transcript", "transcript.raw.json"),
    normalized: path.join(episodeDir, "transcript", "transcript.json"),
    srt: path.join(episodeDir, "transcript", "transcript.srt"),
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
      dryRun: true,
    });
    return;
  }
  const pipeline = await loadPipeline(options, episodeDir);
  const transcriptionLanguage =
    config.whisperLanguage ??
    config.openAiTranscriptionLanguage ??
    config.scriptLanguage;
  const transcriptRequest = transcriptionLanguage
    ? {
        sourceId: manifest.episodeId,
        audioPath,
        episodeDir,
        language: transcriptionLanguage,
      }
    : {
        sourceId: manifest.episodeId,
        audioPath,
        episodeDir,
      };
  const transcript = await pipeline.transcription.transcribe(
    transcriptRequest,
    new AbortController().signal
  );
  const artifacts = await readTranscriptArtifacts(episodeDir);
  const raw = artifacts.raw;
  const normalized =
    artifacts.normalized ??
    normalizedTranscriptSchema.parse({
      schemaVersion: 1,
      sourceId: transcript.sourceId,
      language: transcript.language,
      text: transcript.text,
      segments: transcript.segments,
      words: transcript.words,
      generation: {
        provider: config.transcriptionProvider,
        model:
          config.whisperModel ?? config.openAiTranscriptionModel ?? "unknown",
        generatedAt: new Date().toISOString(),
        wordTimestamps: true as const,
      },
    });
  const visualSceneCount = buildVisualScenesFromSubtitleSegments(
    normalized.segments,
    {
      targetDurationSeconds: 600 / config.visualSceneTargetPer10Minutes,
      minDurationSeconds: config.visualSceneMinSeconds,
      maxDurationSeconds: config.visualSceneMaxSeconds,
    }
  ).length;
  const summary = {
    episodeId,
    backend: raw?.backend ?? config.transcriptionProvider,
    model:
      raw?.model ??
      config.whisperModel ??
      config.openAiTranscriptionModel ??
      "unknown",
    language: normalized.language,
    audioDurationSeconds,
    wordCount: normalized.words.length,
    rawSegmentCount: raw?.rawSegments.length ?? 0,
    normalizedSubtitleCount: normalized.segments.length,
    visualSceneCount,
    outputPaths: [artifacts.rawPath, artifacts.normalizedPath, outputPaths.srt],
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
      ...summary.outputPaths.map((value) => `  ${value}`),
    ].join("\n") + "\n"
  );
}

async function commandTranscriptNormalize(
  options: CliOptions,
  episodeId: string
): Promise<void> {
  markEpisodeTelemetry(episodeId);
  const { episodeDir, manifest } = await readEpisodeWorkspaceForAudio(
    options,
    episodeId
  );
  if (!manifest) {
    throw new Error(`Episode manifest not found for ${episodeId}`);
  }
  const config = await loadRuntimeConfig(
    configOverridesFromCli(options),
    (await loadEpisodeConfig(episodeDir)) ?? {}
  );
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
    options: transcriptSegmentationOptionsFromConfig(config),
  });
  if (options.dryRun) {
    printJson({
      episodeId,
      rawPath: artifacts.rawPath,
      normalizedPath: artifacts.normalizedPath,
      subtitleCount: normalized.segments.length,
      wordCount: normalized.words.length,
      dryRun: true,
    });
    return;
  }
  await writeNormalizedTranscriptArtifacts(
    path.join(episodeDir, "transcript"),
    artifacts.rawPath,
    artifacts.normalizedPath,
    artifacts.raw,
    normalized
  );
  if (options.json) {
    printJson(normalized);
    return;
  }
  process.stdout.write(`${artifacts.normalizedPath}\n`);
}

async function commandTranscriptValidate(
  options: CliOptions,
  episodeId: string
): Promise<void> {
  markEpisodeTelemetry(episodeId);
  const { episodeDir, manifest } = await readEpisodeWorkspaceForAudio(
    options,
    episodeId
  );
  if (!manifest) {
    throw new Error(`Episode manifest not found for ${episodeId}`);
  }
  const config = await loadRuntimeConfig(
    configOverridesFromCli(options),
    (await loadEpisodeConfig(episodeDir)) ?? {}
  );
  const artifacts = await readTranscriptArtifacts(episodeDir);
  const issues: string[] = [];
  const spokenRawWords = (artifacts.raw?.words ?? []).filter(
    (word: { readonly text: string }) =>
      normalizeWhitespace(word.text).length > 0 &&
      !/^\[(?:music|música|applause|silence)\]$/iu.test(word.text)
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
    const visualSceneCount = buildVisualScenesFromSubtitleSegments(
      artifacts.normalized.segments,
      {
        targetDurationSeconds: 600 / config.visualSceneTargetPer10Minutes,
        minDurationSeconds: config.visualSceneMinSeconds,
        maxDurationSeconds: config.visualSceneMaxSeconds,
      }
    ).length;
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
    wordCount: artifacts.normalized?.words.length ?? 0,
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

async function commandStatus(
  options: CliOptions,
  episodeId: string
): Promise<void> {
  const { manifest } = await readManifestForEpisode(options, episodeId);
  if (options.json) {
    printJson(manifest);
    return;
  }
  process.stdout.write(`${manifest.episodeId} ${manifest.slug}\n`);
  process.stdout.write(`${manifest.pipelineRuns.length} pipeline runs\n`);
}

async function commandInspect(
  options: CliOptions,
  episodeId: string
): Promise<void> {
  const { manifest } = await readManifestForEpisode(options, episodeId);
  printJson(manifest);
}

async function commandTranscriptExport(
  options: CliOptions,
  episodeId: string
): Promise<void> {
  const { manifest, episodeDir } = await readManifestForEpisode(
    options,
    episodeId
  );
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
  await writeJsonAtomic(
    path.join(episodeDir, "original-transcript.json"),
    transcript
  );
  await writeTextAtomic(
    path.join(episodeDir, "original-transcript.srt"),
    buildSrt(transcript.segments)
  );
}

async function commandAudioGenerate(
  options: CliOptions,
  episodeId: string
): Promise<void> {
  markEpisodeTelemetry(episodeId);
  const overrides = compactConfigOverrides(configOverridesFromCli(options));
  const resolved = await readEpisodeWorkspaceForAudio(options, episodeId);
  const { episodeDir, manifest } = resolved;
  const episodeConfig = await loadEpisodeConfig(episodeDir);
  const emptyEpisodeOverrides: RuntimeConfigOverrides = {};
  const config = await loadRuntimeConfig(
    overrides,
    episodeConfig
      ? compactConfigOverrides(episodeConfig)
      : emptyEpisodeOverrides
  );
  if (
    config.ttsProvider !== "openai-compatible" ||
    !config.openAiCompatibleApiKey
  ) {
    throw new Error(
      "OpenAI speech is required for narration generation; mock speech is disabled."
    );
  }
  const language =
    config.scriptLanguage ?? episodeConfig?.scriptLanguage ?? "en";
  const script = await loadNarrationScriptMarkdown(episodeDir, language);
  const audioBaseDir = localizedAudioBaseDir(episodeDir, language);
  const rewrittenChunks =
    manifest?.rewrittenScript?.sections
      .map((section) => normalizeWhitespace(section.text))
      .filter((chunk) => chunk.length > 0) ?? [];
  const sceneChunks =
    manifest?.scenePlan?.scenes
      .map((scene) => normalizeWhitespace(scene.canonicalNarration))
      .filter((chunk) => chunk.length > 0) ?? [];
  const sceneCount = manifest?.scenePlan?.scenes.length;
  const chunks =
    sceneChunks.length > 0
      ? sceneChunks
      : rewrittenChunks.length > 0
        ? balanceScriptChunksForScenes(rewrittenChunks, sceneCount)
        : balanceScriptChunksForScenes(
            splitEpisodeScriptMarkdown(script.text),
            sceneCount
          );
  if (chunks.length === 0) {
    throw new Error(`No narration text found in ${script.filePath}.`);
  }
  const audioDir = path.join(audioBaseDir, "audio");
  const segmentsDir = localizedSegmentsDir(audioBaseDir, language);
  const narrationPath = localizedNarrationPath(audioBaseDir, language);
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
      dryRun: true,
    });
    return;
  }
  const pipeline = await createPipeline(
    overrides,
    episodeConfig
      ? compactConfigOverrides(episodeConfig)
      : emptyEpisodeOverrides
  );
  const speechSettings = loadSpeechVoiceSettings({
    ...(config.speechVoicePreset
      ? { preset: config.speechVoicePreset }
      : episodeConfig?.speechVoicePreset
        ? { preset: episodeConfig.speechVoicePreset }
        : {}),
    ...(language ? { language } : {}),
  });
  await ensureDir(segmentsDir);
  await cleanupStaleAudioTempFiles(audioDir, segmentsDir);
  await cleanupAudioGenerationArtifacts(audioDir, segmentsDir, narrationPath);
  const scriptSourcePath = await writeEpisodeScriptMarkdown(
    audioBaseDir,
    script.text,
    language
  );
  const generatedAt = new Date().toISOString();
  const preferredConcurrency = Math.min(
    resolveTtsConcurrency(),
    Math.max(1, chunks.length)
  );
  const model =
    config.openAiSpeechModel ??
    config.openAiCompatibleModel ??
    "gpt-4o-mini-tts";
  const voice =
    config.openAiSpeechVoice ??
    config.openAiCompatibleTtsVoice ??
    "onyx";
  await writeAudioPromptLogs({
    episodeDir,
    episodeSlug,
    language,
    chunks,
    speechSettings,
    model,
    voice,
    generatedAt,
  });
  let generated;
  try {
    generated = await synthesizeSpeechChunks(
      pipeline,
      chunks,
      speechSettings,
      segmentsDir,
      episodeSlug,
      language,
      generatedAt,
      preferredConcurrency
    );
  } catch (error) {
    if (chunks.length <= 1 || preferredConcurrency <= 1) {
      throw error;
    }
    await cleanupAudioGenerationArtifacts(audioDir, segmentsDir, narrationPath);
    generated = await synthesizeSpeechChunks(
      pipeline,
      chunks,
      speechSettings,
      segmentsDir,
      episodeSlug,
      language,
      generatedAt,
      1
    );
  }
  const { segmentPaths, artifacts } = generated;
  const completeSegmentPaths = segmentPaths.filter(
    (segmentPath): segmentPath is string => segmentPath.length > 0
  );
  const completeArtifacts = artifacts.filter(
    (artifact): artifact is ArtifactReference => artifact !== undefined
  );
  const segmentsListPath = path.join(audioDir, "segments.txt");
  await writeTextAtomic(
    segmentsListPath,
    completeSegmentPaths
      .map((segmentPath) => `file '${segmentPath.replace(/'/g, "'\\''")}'`)
      .join("\n")
  );
  const concat = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      segmentsListPath,
      "-c",
      "copy",
      narrationPath,
    ],
    { encoding: "utf8" }
  );
  if (concat.status !== 0) {
    throw new Error(concat.stderr || "Failed to concatenate narration audio.");
  }
  const narrationStats = await fs.stat(narrationPath);
  completeArtifacts.push({
    id: artifactIdSchema.parse(
      `artifact-${slugify(`${episodeSlug}-narration-${language}`)}`
    ),
    kind: language === "en" ? "audio.narration" : `audio.narration.${language}`,
    path: narrationPath,
    mimeType: "audio/wav",
    sizeBytes: narrationStats.size,
    checksumSha256: await hashFile(narrationPath),
    createdAt: generatedAt,
  });
  completeArtifacts.push({
    id: artifactIdSchema.parse(
      `artifact-${slugify(`${episodeSlug}-script-source-${language}`)}`
    ),
    kind:
      language === "en"
        ? "audio.script-source"
        : `audio.script-source.${language}`,
    path: scriptSourcePath,
    mimeType: "text/markdown",
    sizeBytes: (await fs.stat(scriptSourcePath)).size,
    checksumSha256: await hashFile(scriptSourcePath),
    createdAt: generatedAt,
  });
  if (manifest) {
    manifest.artifacts = [
      ...manifest.artifacts.filter((artifact) => {
        const kinds =
          language === "en"
            ? ["audio.segment", "audio.narration", "audio.script-source"]
            : [
                `audio.segment.${language}`,
                `audio.narration.${language}`,
                `audio.script-source.${language}`,
              ];
        return !kinds.includes(artifact.kind);
      }),
      ...completeArtifacts,
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
    generatedAt,
  });
  if (options.json) {
    printJson({
      episodeId,
      language,
      scriptPath: script.filePath,
      narrationPath,
      segmentsDir,
      segmentCount: chunks.length,
      segmentPaths: completeSegmentPaths,
    });
    return;
  }
  if (!options.quiet) {
    process.stdout.write(
      `Generated narration for ${episodeId} (${language})\n${narrationPath}\n`
    );
  }
}

async function commandClipsGenerate(
  options: CliOptions,
  episodeId: string
): Promise<void> {
  markEpisodeTelemetry(episodeId);
  const { manifest, episodeDir } = await readManifestForEpisode(
    options,
    episodeId
  );
  if (!manifest.scenePlan) {
    throw new Error("Scene plan is not available.");
  }
  const episodeConfig = await loadEpisodeConfig(episodeDir);
  const config = await loadRuntimeConfig(
    configOverridesFromCli(options),
    episodeConfig ? compactConfigOverrides(episodeConfig) : {}
  );
  const language =
    config.scriptLanguage ?? episodeConfig?.scriptLanguage ?? "en";
  const audioBaseDir = localizedAudioBaseDir(episodeDir, language);
  if (options.dryRun) {
    printJson({
      episodeId,
      language,
      audioDir: localizedSegmentsDir(audioBaseDir, language),
      clipsDir: path.join(audioBaseDir, "renders", localizedClipsDirName(language)),
      dryRun: true,
    });
    return;
  }
  const pipeline = await loadPipeline(options, episodeDir);
  const scenePlan = options.sceneLimit
    ? {
        ...manifest.scenePlan,
        scenes: manifest.scenePlan.scenes.slice(0, options.sceneLimit),
      }
    : manifest.scenePlan;
  const renderProfile = {
    id: "clips",
    label: "Localized clips",
    width: config.defaultAspectRatio === "16:9" ? 1920 : 1080,
    height: config.defaultAspectRatio === "16:9" ? 1080 : 1920,
    fps: 30,
    aspectRatio: config.defaultAspectRatio,
    burnCaptions: false,
  } as const;
  const result = await pipeline.renderer.renderSceneClips(
    {
      episodeDir,
      scenePlan,
      outputDir: path.join(audioBaseDir, "renders"),
      renderProfile,
      captionBurnIn: false,
      clipsDirName: localizedClipsDirName(language),
      sceneAudioDir: localizedSegmentsDir(audioBaseDir, language),
      imageDir: path.join(episodeDir, "state", "image-generation", "images"),
      trailingSilenceRatio: config.trailingSilenceRatio,
      trailingSilenceBufferSeconds: config.trailingSilenceBufferSeconds,
    },
    new AbortController().signal
  );
  if (options.json) {
    printJson({ episodeId, language, ...result });
    return;
  }
  process.stdout.write(
    `Generated localized clips for ${episodeId} (${language})\n${result.clipsDir}\n`
  );
}

async function commandClipsBackfillManifests(
  options: CliOptions,
  episodeId: string
): Promise<void> {
  markEpisodeTelemetry(episodeId);
  const initialConfig = await loadRuntimeConfig(configOverridesFromCli(options));
  const episodeDirCandidates = [
    path.join(initialConfig.workspaceDir, "episodes", episodeId),
    path.join(initialConfig.workspaceDir, episodeId),
    path.resolve("episodes", episodeId),
    path.resolve(episodeId),
  ];
  let resolvedEpisodeDir: string | undefined;
  let scenesFilePath: string | undefined;
  for (const candidate of episodeDirCandidates) {
    const candidateScenes = path.join(candidate, "shared", "scenes.json");
    if (await fileExists(candidateScenes)) {
      resolvedEpisodeDir = candidate;
      scenesFilePath = candidateScenes;
      break;
    }
  }
  if (!resolvedEpisodeDir || !scenesFilePath) {
    scenesFilePath = await findEpisodeScenesFile(
      initialConfig.workspaceDir,
      episodeId
    );
    resolvedEpisodeDir = path.dirname(path.dirname(scenesFilePath));
  }
  const target = await readAndValidateScenesFile(
    scenesFilePath,
    initialConfig.scriptLanguage ?? "en"
  );
  const episodeRootDir =
    path.basename(target.episodeDir) === "shared"
      ? path.dirname(target.episodeDir)
      : target.episodeDir;
  const episodeConfig = await loadEpisodeConfig(episodeRootDir);
  const config = await loadRuntimeConfig(
    configOverridesFromCli(options),
    episodeConfig ? compactConfigOverrides(episodeConfig) : {}
  );
  const language =
    config.scriptLanguage ?? episodeConfig?.scriptLanguage ?? "en";
  const audioBaseDir = localizedAudioBaseDir(episodeRootDir, language);
  const captionsPath =
    isEnglishLanguage(language) &&
    (await fileExists(path.join(audioBaseDir, "captions", "captions.ass")))
      ? path.join(audioBaseDir, "captions", "captions.ass")
      : undefined;
  const result = await backfillSceneClipManifests({
    episodeDir: episodeRootDir,
    scenePlan: target.scenePlan,
    outputDir: path.join(audioBaseDir, "renders", "youtube"),
    renderProfile: {
      id: "youtube",
      label: "youtube",
      width: 1920,
      height: 1080,
      fps: 30,
      aspectRatio: "16:9",
      burnCaptions: Boolean(captionsPath),
    },
    captionBurnIn: Boolean(captionsPath),
    clipsDirName: localizedClipsDirName(language),
    sceneAudioDir: localizedSegmentsDir(audioBaseDir, language),
    imageDir: path.join(episodeRootDir, "state", "image-generation", "images"),
    trailingSilenceRatio: config.trailingSilenceRatio,
    trailingSilenceBufferSeconds: config.trailingSilenceBufferSeconds,
  });
  process.stdout.write(
    [
      `Backfilled clip manifests for ${episodeId} (${language})`,
      `Clips dir: ${result.clipsDir}`,
      `Written: ${result.written}`,
      `Skipped: ${result.skipped}`,
    ].join("\n") + "\n"
  );
}

async function commandScenesList(
  options: CliOptions,
  episodeId: string
): Promise<void> {
  const { manifest } = await readManifestForEpisode(options, episodeId);
  const scenes = manifest.scenePlan?.scenes ?? [];
  process.stdout.write(
    `${scenes.map((scene) => `${scene.id} ${scene.timing.startSeconds}-${scene.timing.endSeconds}`).join("\n")}\n`
  );
}

async function commandScenesInspect(
  options: CliOptions,
  episodeId: string,
  sceneId: string
): Promise<void> {
  const { manifest } = await readManifestForEpisode(options, episodeId);
  const scene = manifest.scenePlan?.scenes.find((item) => item.id === sceneId);
  if (!scene) {
    throw new Error(`Scene not found: ${sceneId}`);
  }
  printJson(scene);
}

async function commandImagesExportOpenArt(
  options: CliOptions,
  episodeId: string
): Promise<void> {
  const { manifest, episodeDir } = await readManifestForEpisode(
    options,
    episodeId
  );
  if (!manifest.scenePlan) {
    throw new Error("Scene plan is not available.");
  }
  const prompts = createPromptBatch(
    manifest.scenePlan,
    "16:9",
    localSceneStyle,
    localSceneNegativePrompt
  );
  await exportSceneWorkbook(episodeDir, prompts, {
    batchSize: Number(process.env["MEDIAFORGE_OPENART_BATCH_SIZE"] ?? 8),
    aspectRatio: "16:9",
    globalStyle: localSceneStyle,
  });
  if (!options.quiet) {
    process.stdout.write(
      `Exported scene workbook to ${path.join(episodeDir, "images", "scene-workbook.html")}\n`
    );
  }
}

async function commandImagesOpenOpenArt(
  options: CliOptions,
  episodeId: string
): Promise<void> {
  const { episodeDir } = await readManifestForEpisode(options, episodeId);
  const workbook = path.join(episodeDir, "images", "scene-workbook.html");
  const opener = spawnSync("xdg-open", [workbook], { encoding: "utf8" });
  if (opener.status !== 0) {
    process.stdout.write(`${workbook}\n`);
  }
}

async function commandImagesImport(
  options: CliOptions,
  episodeId: string,
  fromDir: string
): Promise<void> {
  const { manifest, episodeDir } = await readManifestForEpisode(
    options,
    episodeId
  );
  if (!manifest.scenePlan) {
    throw new Error("Scene plan is not available.");
  }
  const assets = await importImageAssets(
    episodeDir,
    manifest.scenePlan,
    fromDir
  );
  await writeJsonAtomic(
    path.join(episodeDir, "images", "generated", "imported.json"),
    assets
  );
  printJson(assets);
}

async function commandImagesValidate(
  options: CliOptions,
  episodeId: string
): Promise<void> {
  const { manifest } = await readManifestForEpisode(options, episodeId);
  if (!manifest.scenePlan) {
    throw new Error("Scene plan is not available.");
  }
  const validation = validateImageAssets(manifest.scenePlan, manifest.images);
  printJson(validation);
}

async function commandImagesMissing(
  options: CliOptions,
  episodeId: string
): Promise<void> {
  const { manifest } = await readManifestForEpisode(options, episodeId);
  if (!manifest.scenePlan) {
    throw new Error("Scene plan is not available.");
  }
  const missing = missingScenes(manifest.scenePlan, manifest.images);
  printJson(missing);
}

async function commandImagesReject(
  options: CliOptions,
  episodeId: string,
  sceneId: string,
  reason: string
): Promise<void> {
  const { episodeDir } = await readManifestForEpisode(options, episodeId);
  await writeTextAtomic(
    path.join(episodeDir, "images", "rejected", `${sceneId}.txt`),
    reason
  );
  process.stdout.write(`Rejected ${sceneId}: ${reason}\n`);
}

async function commandImagesRegenerateWorkbook(
  options: CliOptions,
  episodeId: string,
  missingOnly: boolean
): Promise<void> {
  const { manifest, episodeDir } = await readManifestForEpisode(
    options,
    episodeId
  );
  if (!manifest.scenePlan) {
    throw new Error("Scene plan is not available.");
  }
  const prompts = createPromptBatch(
    manifest.scenePlan,
    "16:9",
    localSceneStyle,
    localSceneNegativePrompt
  );
  const filtered = missingOnly
    ? prompts.filter(
        (prompt) =>
          !manifest.images.some((asset) => asset.sceneId === prompt.sceneId)
      )
    : prompts;
  await exportSceneWorkbook(episodeDir, filtered, {
    batchSize: Number(process.env["MEDIAFORGE_OPENART_BATCH_SIZE"] ?? 8),
    aspectRatio: "16:9",
    globalStyle: localSceneStyle,
  });
}

async function commandImagesAssign(
  options: CliOptions,
  episodeId: string,
  sceneId: string,
  filePath: string
): Promise<void> {
  const { episodeDir, manifest } = await readManifestForEpisode(
    options,
    episodeId
  );
  if (!manifest.scenePlan) {
    throw new Error("Scene plan is not available.");
  }
  const scene = manifest.scenePlan.scenes.find((item) => item.id === sceneId);
  if (!scene) {
    throw new Error(`Scene not found: ${sceneId}`);
  }
  const targetDir = path.join(episodeDir, "images", "inbox");
  await ensureDir(targetDir);
  const target = path.join(
    targetDir,
    scene.expectedImageFilenames[0] ?? path.basename(filePath)
  );
  await fs.copyFile(filePath, target);
  process.stdout.write(`${target}\n`);
}

async function readEpisodeScenePlan(options: CliOptions, episodeId: string) {
  const { manifest, episodeDir } = await readManifestForEpisode(
    options,
    episodeId
  );
  if (!manifest.scenePlan) {
    throw new Error("Scene plan is not available.");
  }
  return { manifest, episodeDir, scenePlan: manifest.scenePlan };
}

async function commandImagesPlan(
  options: CliOptions,
  episodeId: string,
  sceneId?: string
): Promise<void> {
  markEpisodeTelemetry(episodeId);
  const { manifest, episodeDir, scenePlan } = await readEpisodeScenePlan(
    options,
    episodeId
  );
  const settings = loadEpisodeImageGenerationSettings({
    OPENAI_API_KEY: process.env["OPENAI_API_KEY"] ?? "dry-run",
    OPENAI_IMAGE_MODEL: process.env["OPENAI_IMAGE_MODEL"],
    OPENAI_IMAGE_SIZE: process.env["OPENAI_IMAGE_SIZE"],
    OPENAI_IMAGE_QUALITY: process.env["OPENAI_IMAGE_QUALITY"],
    OPENAI_IMAGE_CONCURRENCY: process.env["OPENAI_IMAGE_CONCURRENCY"],
    OPENAI_IMAGE_MAX_RETRIES: process.env["OPENAI_IMAGE_MAX_RETRIES"],
    OPENAI_IMAGE_TIMEOUT_MS: process.env["OPENAI_IMAGE_TIMEOUT_MS"],
    OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES:
      options.allowUnapprovedCharacterReferences
        ? "true"
        : process.env["OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES"],
    OPENAI_IMAGE_FORCE: options.force
      ? "true"
      : process.env["OPENAI_IMAGE_FORCE"],
    OPENAI_BASE_URL: process.env["OPENAI_BASE_URL"],
    OPENAI_ORGANIZATION: process.env["OPENAI_ORGANIZATION"],
    OPENAI_PROJECT: process.env["OPENAI_PROJECT"],
  });
  const results = await planEpisodeImageGeneration(
    episodeDir,
    manifest.episodeId,
    scenePlan,
    settings,
    sceneId !== undefined ? { sceneId } : undefined
  );
  printJson(results);
}

async function commandImagesGenerate(
  options: CliOptions,
  episodeId: string,
  sceneId?: string
): Promise<void> {
  markEpisodeTelemetry(episodeId);
  const { manifest, episodeDir, scenePlan } = await readEpisodeScenePlan(
    options,
    episodeId
  );
  const settings = loadEpisodeImageGenerationSettings({
    OPENAI_API_KEY: process.env["OPENAI_API_KEY"],
    OPENAI_IMAGE_MODEL: process.env["OPENAI_IMAGE_MODEL"],
    OPENAI_IMAGE_SIZE: process.env["OPENAI_IMAGE_SIZE"],
    OPENAI_IMAGE_QUALITY: process.env["OPENAI_IMAGE_QUALITY"],
    OPENAI_IMAGE_CONCURRENCY: process.env["OPENAI_IMAGE_CONCURRENCY"],
    OPENAI_IMAGE_MAX_RETRIES: process.env["OPENAI_IMAGE_MAX_RETRIES"],
    OPENAI_IMAGE_TIMEOUT_MS: process.env["OPENAI_IMAGE_TIMEOUT_MS"],
    OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES:
      options.allowUnapprovedCharacterReferences
        ? "true"
        : process.env["OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES"],
    OPENAI_IMAGE_FORCE: options.force
      ? "true"
      : process.env["OPENAI_IMAGE_FORCE"],
    OPENAI_BASE_URL: process.env["OPENAI_BASE_URL"],
    OPENAI_ORGANIZATION: process.env["OPENAI_ORGANIZATION"],
    OPENAI_PROJECT: process.env["OPENAI_PROJECT"],
  });
  const results = await generateEpisodeImages(
    episodeDir,
    manifest.episodeId,
    scenePlan,
    settings,
    {
      ...(sceneId !== undefined ? { sceneId } : {}),
      ...(options.force !== undefined ? { force: options.force } : {}),
    }
  );
  printJson(results);
}

async function commandImagesGenerateCharacterReferences(
  options: CliOptions,
  episodeId: string,
  characterId?: string
): Promise<void> {
  markEpisodeTelemetry(episodeId);
  const { manifest, episodeDir } = await readEpisodeScenePlan(
    options,
    episodeId
  );
  const settings = loadEpisodeImageGenerationSettings({
    OPENAI_API_KEY: process.env["OPENAI_API_KEY"],
    OPENAI_IMAGE_MODEL: process.env["OPENAI_IMAGE_MODEL"],
    OPENAI_IMAGE_SIZE: process.env["OPENAI_IMAGE_SIZE"],
    OPENAI_IMAGE_QUALITY: process.env["OPENAI_IMAGE_QUALITY"],
    OPENAI_IMAGE_CONCURRENCY: process.env["OPENAI_IMAGE_CONCURRENCY"],
    OPENAI_IMAGE_MAX_RETRIES: process.env["OPENAI_IMAGE_MAX_RETRIES"],
    OPENAI_IMAGE_TIMEOUT_MS: process.env["OPENAI_IMAGE_TIMEOUT_MS"],
    OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES:
      options.allowUnapprovedCharacterReferences
        ? "true"
        : process.env["OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES"],
    OPENAI_IMAGE_FORCE: options.force
      ? "true"
      : process.env["OPENAI_IMAGE_FORCE"],
    OPENAI_BASE_URL: process.env["OPENAI_BASE_URL"],
    OPENAI_ORGANIZATION: process.env["OPENAI_ORGANIZATION"],
    OPENAI_PROJECT: process.env["OPENAI_PROJECT"],
  });
  const registry = await generateEpisodeImageReferences(
    episodeDir,
    manifest.episodeId,
    settings,
    characterId !== undefined ? { characterId } : undefined
  );
  printJson(registry);
}

async function commandImagesApproveCharacter(
  options: CliOptions,
  episodeId: string,
  characterId: string
): Promise<void> {
  markEpisodeTelemetry(episodeId);
  const { manifest, episodeDir } = await readEpisodeScenePlan(
    options,
    episodeId
  );
  const registry = await approveEpisodeCharacter(
    episodeDir,
    manifest.episodeId,
    characterId
  );
  printJson(registry);
}

async function commandImagesRegenerateCharacter(
  options: CliOptions,
  episodeId: string,
  characterId: string
): Promise<void> {
  markEpisodeTelemetry(episodeId);
  const { manifest, episodeDir } = await readEpisodeScenePlan(
    options,
    episodeId
  );
  const settings = loadEpisodeImageGenerationSettings({
    OPENAI_API_KEY: process.env["OPENAI_API_KEY"],
    OPENAI_IMAGE_MODEL: process.env["OPENAI_IMAGE_MODEL"],
    OPENAI_IMAGE_SIZE: process.env["OPENAI_IMAGE_SIZE"],
    OPENAI_IMAGE_QUALITY: process.env["OPENAI_IMAGE_QUALITY"],
    OPENAI_IMAGE_CONCURRENCY: process.env["OPENAI_IMAGE_CONCURRENCY"],
    OPENAI_IMAGE_MAX_RETRIES: process.env["OPENAI_IMAGE_MAX_RETRIES"],
    OPENAI_IMAGE_TIMEOUT_MS: process.env["OPENAI_IMAGE_TIMEOUT_MS"],
    OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES:
      options.allowUnapprovedCharacterReferences
        ? "true"
        : process.env["OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES"],
    OPENAI_IMAGE_FORCE: options.force
      ? "true"
      : process.env["OPENAI_IMAGE_FORCE"],
    OPENAI_BASE_URL: process.env["OPENAI_BASE_URL"],
    OPENAI_ORGANIZATION: process.env["OPENAI_ORGANIZATION"],
    OPENAI_PROJECT: process.env["OPENAI_PROJECT"],
  });
  const registry = await regenerateEpisodeCharacter(
    episodeDir,
    manifest.episodeId,
    characterId,
    settings
  );
  printJson(registry);
}

async function commandImagesGenerateOpenAi(
  options: CliOptions,
  episodeId: string,
  sceneId?: string
): Promise<void> {
  markEpisodeTelemetry(episodeId);
  const { manifest, episodeDir } = await readManifestForEpisode(
    options,
    episodeId
  );
  if (!manifest.scenePlan) {
    throw new Error("Scene plan is not available.");
  }
  const settings = loadOpenAiImageGenerationSettings(process.env);
  const promptBatch = createPromptBatch(
    manifest.scenePlan,
    "16:9",
    localSceneStyle,
    localSceneNegativePrompt
  );
  const promptBySceneId = new Map(
    promptBatch.map((prompt) => [prompt.sceneId, prompt] as const)
  );
  const selectedScenes = sceneId
    ? manifest.scenePlan.scenes.filter((scene) => scene.id === sceneId)
    : manifest.scenePlan.scenes;
  if (selectedScenes.length === 0) {
    throw new Error(
      sceneId ? `Scene not found: ${sceneId}` : "No scenes available."
    );
  }
  const jobs = selectedScenes.map((scene) => ({
    scene,
    prompt: promptBySceneId.get(scene.id)?.prompt ?? scene.imagePrompt,
    episodeSlug: manifest.slug,
    episodeDir,
    normalizedFilename: scene.expectedImageFilenames[0] ?? `${scene.id}.png`,
  }));
  const results = await generateOpenAiSceneImages(jobs, settings);
  printJson(
    results.map(
      (
        result: Awaited<ReturnType<typeof generateOpenAiSceneImages>>[number]
      ) => ({
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
        finalChecksumSha256: result.finalChecksumSha256,
      })
    )
  );
}

async function commandRender(
  options: CliOptions,
  episodeId: string,
  profile: "youtube" | "vertical",
  burnCaptions = true
): Promise<void> {
  markEpisodeTelemetry(episodeId);
  const { manifest, episodeDir } = await readManifestForEpisode(
    options,
    episodeId
  );
  if (!manifest.scenePlan) {
    throw new Error("Scene plan is not available.");
  }
  const episodeConfig = await loadEpisodeConfig(episodeDir);
  const config = await loadRuntimeConfig(
    configOverridesFromCli(options),
    episodeConfig ? compactConfigOverrides(episodeConfig) : {}
  );
  const language =
    config.scriptLanguage ?? episodeConfig?.scriptLanguage ?? "en";
  const audioBaseDir = localizedAudioBaseDir(episodeDir, language);
  if (options.dryRun) {
    printJson({
      episodeId,
      language,
      clipsDir: path.join(audioBaseDir, "renders", localizedClipsDirName(language)),
      cleanPath: path.join(
        audioBaseDir,
        "renders",
        profile,
        `youtube-${profile === "youtube" ? "16x9" : "9x16"}${localizedOutputSuffix(language)}-clean.mp4`
      ),
      captionedPath: path.join(
        audioBaseDir,
        "renders",
        profile,
        `youtube-${profile === "youtube" ? "16x9" : "9x16"}${localizedOutputSuffix(language)}-captioned.mp4`
      ),
      dryRun: true,
    });
    return;
  }
  const captionsPath =
    burnCaptions && isEnglishLanguage(language)
      ? path.join(audioBaseDir, "captions", "captions.ass")
      : undefined;
  const renderProfile = {
    id: profile,
    label: profile,
    width: profile === "youtube" ? 1920 : 1080,
    height: profile === "youtube" ? 1080 : 1920,
    fps: 30,
    aspectRatio: profile === "youtube" ? "16:9" : "9:16",
    burnCaptions: true,
  } as const;
  const pipeline = await loadPipeline(options, episodeDir);
  const renderRequest = {
    episodeDir,
    scenePlan: manifest.scenePlan,
    outputDir: path.join(audioBaseDir, "renders", profile),
    renderProfile,
    captionBurnIn: Boolean(captionsPath),
    clipsDirName: localizedClipsDirName(language),
    sceneAudioDir: localizedSegmentsDir(audioBaseDir, language),
    imageDir: path.join(episodeDir, "state", "image-generation", "images"),
    outputSuffix: localizedOutputSuffix(language),
    trailingSilenceRatio: config.trailingSilenceRatio,
    trailingSilenceBufferSeconds: config.trailingSilenceBufferSeconds,
    ...(captionsPath ? { captionsPath } : {}),
  };
  const result = await pipeline.renderer.render(
    renderRequest,
    new AbortController().signal
  );
  printJson(result);
}

function renderRemoteShellScript(kind: "check" | "cleanup"): string {
  if (kind === "check") {
    return [
      "set -Eeuo pipefail",
      "umask 077",
      'test "$(id -u)" -ne 0',
      "command -v ffmpeg >/dev/null",
      "command -v ffprobe >/dev/null",
      "command -v rsync >/dev/null",
      'mkdir -p "$1/jobs"',
      'chmod 700 "$1" "$1/jobs"',
      'tmpdir="$1/.remote-check-$(date +%s)-$$"',
      'mkdir -p "$tmpdir"',
      'ffmpeg -y -f lavfi -i testsrc2=duration=1:size=64x64:rate=30 -c:v libx264 -pix_fmt yuv420p "$tmpdir/test.mp4"',
      'ffprobe -v error -show_streams -show_format "$tmpdir/test.mp4" >/dev/null',
      'rm -rf "$tmpdir"',
    ].join("; ");
  }
  return [
    "set -Eeuo pipefail",
    "umask 077",
    'jobs_dir="$1/jobs"',
    'cutoff_minutes="$2"',
    'find "$jobs_dir" -mindepth 1 -maxdepth 1 -type d -mmin "+${cutoff_minutes}" -exec rm -rf -- {} +',
  ].join("; ");
}

async function commandRenderRemoteCheck(options: CliOptions): Promise<void> {
  const config = await loadRuntimeConfig(configOverridesFromCli(options));
  const remote = buildRemoteRenderSettings(config);
  if (!remote.enabled) {
    process.stdout.write("Remote rendering is disabled.\n");
    return;
  }
  const sshArgs = [
    "-p",
    String(remote.port),
    "-o",
    "BatchMode=yes",
    "-o",
    `ConnectTimeout=${remote.connectTimeoutSeconds}`,
    "-o",
    `StrictHostKeyChecking=${remote.verifyHostKey ? "yes" : "no"}`,
    ...(remote.knownHostsFile
      ? ["-o", `UserKnownHostsFile=${remote.knownHostsFile}`]
      : []),
    ...(remote.sshPrivateKey ? ["-i", remote.sshPrivateKey] : []),
    `${remote.user}@${remote.host}`,
    "bash",
    "-lc",
    renderRemoteShellScript("check"),
    "--",
    remote.baseDir,
  ];
  const result = spawnSync("ssh", sshArgs, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || "Remote preflight failed.");
  }
  process.stdout.write(
    `Remote render preflight succeeded for ${remote.user}@${remote.host}\n`
  );
}

async function commandRenderRemoteCleanup(options: CliOptions): Promise<void> {
  const config = await loadRuntimeConfig(configOverridesFromCli(options));
  const remote = buildRemoteRenderSettings(config);
  if (!remote.enabled) {
    process.stdout.write("Remote rendering is disabled.\n");
    return;
  }
  const cutoffMinutes = Math.max(1, remote.cleanupMaxAgeHours * 60);
  const sshArgs = [
    "-p",
    String(remote.port),
    "-o",
    "BatchMode=yes",
    "-o",
    `ConnectTimeout=${remote.connectTimeoutSeconds}`,
    "-o",
    `StrictHostKeyChecking=${remote.verifyHostKey ? "yes" : "no"}`,
    ...(remote.knownHostsFile
      ? ["-o", `UserKnownHostsFile=${remote.knownHostsFile}`]
      : []),
    ...(remote.sshPrivateKey ? ["-i", remote.sshPrivateKey] : []),
    `${remote.user}@${remote.host}`,
    "bash",
    "-lc",
    renderRemoteShellScript("cleanup"),
    "--",
    remote.baseDir,
    String(cutoffMinutes),
  ];
  const result = spawnSync("ssh", sshArgs, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || "Remote cleanup failed.");
  }
  process.stdout.write(
    `Cleaned remote jobs older than ${remote.cleanupMaxAgeHours}h.\n`
  );
}

async function commandRenderRemoteTest(options: CliOptions): Promise<void> {
  const config = await loadRuntimeConfig(configOverridesFromCli(options));
  const remote = buildRemoteRenderSettings(config);
  if (!remote.enabled) {
    throw new Error(
      "REMOTE_RENDER_ENABLED must be true for the remote render test."
    );
  }
  const tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "mediaforge-remote-test-")
  );
  const episodeDir = path.join(tmpDir, "episode");
  const imageDir = path.join(episodeDir, "images", "generated");
  const audioDir = path.join(episodeDir, "audio", "segments");
  const outputDir = path.join(episodeDir, "output");
  await Promise.all([
    ensureDir(imageDir),
    ensureDir(audioDir),
    ensureDir(outputDir),
  ]);
  const makePng = (filePath: string, color: string) =>
    spawnSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `color=c=${color}:s=64x64:d=1`,
        "-frames:v",
        "1",
        filePath,
      ],
      { encoding: "utf8" }
    );
  const makeWav = (filePath: string, frequency: number) =>
    spawnSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=${frequency}:sample_rate=24000:duration=1`,
        filePath,
      ],
      { encoding: "utf8" }
    );
  if (
    makePng(path.join(imageDir, "scene-001__000000-000001__16x9.png"), "red")
      .status !== 0
  ) {
    throw new Error("Failed to generate local test image.");
  }
  if (
    makePng(path.join(imageDir, "scene-002__000001-000002__16x9.png"), "blue")
      .status !== 0
  ) {
    throw new Error("Failed to generate local test image.");
  }
  if (makeWav(path.join(audioDir, "scene-001.wav"), 440).status !== 0) {
    throw new Error("Failed to generate local test audio.");
  }
  if (makeWav(path.join(audioDir, "scene-002.wav"), 550).status !== 0) {
    throw new Error("Failed to generate local test audio.");
  }
  const scenePlan = scenePlanSchema.parse({
    sourceId: "episode-remote-test",
    scenes: [
      {
        id: "scene-001",
        sequenceNumber: 1,
        canonicalNarration: "A red test frame appears.",
        sourceSegmentIds: ["scene-001"],
        estimatedDurationSeconds: 1,
        timing: { startSeconds: 0, endSeconds: 1 },
        visualPurpose: "local render test",
        textRequirement: { required: false },
        subject: "red frame",
        action: "shown",
        setting: "test scene",
        composition: "centered",
        cameraFraming: "medium shot",
        mood: "neutral",
        continuityReferences: [],
        onScreenText: "",
        negativeConstraints: [],
        aspectRatios: ["16:9"],
        imagePrompt: "red frame",
        expectedImageFilenames: ["scene-001__000000-000001__16x9.png"],
        qualityStatus: "draft",
      },
      {
        id: "scene-002",
        sequenceNumber: 2,
        canonicalNarration: "A blue test frame appears.",
        sourceSegmentIds: ["scene-002"],
        estimatedDurationSeconds: 1,
        timing: { startSeconds: 1, endSeconds: 2 },
        visualPurpose: "remote render test",
        textRequirement: { required: false },
        subject: "blue frame",
        action: "shown",
        setting: "test scene",
        composition: "centered",
        cameraFraming: "medium shot",
        mood: "neutral",
        continuityReferences: [],
        onScreenText: "",
        negativeConstraints: [],
        aspectRatios: ["16:9"],
        imagePrompt: "blue frame",
        expectedImageFilenames: ["scene-002__000001-000002__16x9.png"],
        qualityStatus: "draft",
      },
    ],
  });
  const renderer = new HybridFFmpegVideoRenderer(remote);
  const result = await renderer.renderSceneClips(
    {
      episodeDir,
      scenePlan,
      outputDir,
      renderProfile: {
        id: "test",
        label: "test",
        width: 64,
        height: 64,
        fps: 30,
        aspectRatio: "16:9",
        burnCaptions: false,
      },
      captionBurnIn: false,
      imageDir,
      sceneAudioDir: audioDir,
      trailingSilenceRatio: 0,
      trailingSilenceBufferSeconds: 0,
    },
    new AbortController().signal
  );
  const outputs = await Promise.all(
    result.clipPaths.map(async (clipPath) => ({
      clipPath,
      hash: await hashFile(clipPath),
      validation: await validateRenderedVideo(clipPath),
    }))
  );
  printJson({
    episodeDir,
    outputs,
  });
}

async function commandMetadataGenerate(
  options: CliOptions,
  episodeId: string
): Promise<void> {
  markEpisodeTelemetry(episodeId);
  const { manifest, episodeDir } = await readManifestForEpisode(
    options,
    episodeId
  );
  if (!manifest.scenePlan) {
    throw new Error("Scene plan is required.");
  }
  const episodeConfig = await loadEpisodeConfig(episodeDir);
  const config = await loadRuntimeConfig(
    configOverridesFromCli(options),
    episodeConfig ? compactConfigOverrides(episodeConfig) : {}
  );
  const language =
    config.scriptLanguage ?? episodeConfig?.scriptLanguage ?? "en";
  const metadataDir = localizedMetadataDir(episodeDir, language);
  const scenesFilePath = await findEpisodeScenesFile(
    config.workspaceDir,
    episodeId
  );
  const target = await readAndValidateScenesFile(scenesFilePath, language);
  const generationOptions: Omit<YoutubeMetadataGenerationOptions, "baseUrl"> & {
    baseUrl?: string;
  } = {
    apiKey:
      config.openAiCompatibleApiKey ?? process.env["OPENAI_API_KEY"] ?? "",
    model: config.openAiMetadataModel ?? "gpt-5.4-mini",
    reasoningEffort: config.openAiMetadataReasoningEffort ?? "low",
    language,
    promptText: await fs.readFile(
      path.resolve("prompts", "youtube-metadata.prompt.md"),
      "utf8"
    ),
    promptVersion: YOUTUBE_METADATA_PROMPT_VERSION,
    maxRetries: config.openAiMetadataMaxRetries ?? 3,
    timeoutMs: config.openAiMetadataTimeoutMs ?? 120000,
    keepFile: config.openAiMetadataKeepFile,
    logger: createLogger(options.verbose ? "debug" : config.logLevel),
  };
  const baseUrl =
    config.openAiCompatibleBaseUrl ?? process.env["OPENAI_BASE_URL"];
  if (baseUrl !== undefined) {
    generationOptions.baseUrl = baseUrl;
  }
  if (options.dryRun) {
    printJson({
      episodeId,
      language,
      sourceFilePath: scenesFilePath,
      metadataDir,
      model: generationOptions.model,
      promptVersion: generationOptions.promptVersion,
      sceneCount: target.scenePlan.scenes.length,
      durationSeconds: target.durationSeconds,
      youtubeMarkdownPath: path.join(metadataDir, "youtube.md"),
      youtubeJsonPath: path.join(metadataDir, "youtube-metadata.json"),
      dryRun: true,
    });
    return;
  }
  const { generateYoutubeMetadataForTarget } =
    await import("@mediaforge/metadata");
  const generation = await generateYoutubeMetadataForTarget(
    {
      ...target,
      outputDir: metadataDir,
      sourceId: manifest.episodeId,
      language,
    },
    generationOptions
  );
  await writeTextAtomic(
    path.join(metadataDir, "youtube.md"),
    await fs.readFile(generation.outputs.markdownPath, "utf8")
  );
  const chapterLines = generation.metadata.chapters.items
    .map(
      (chapter: YoutubeMetadata["chapters"]["items"][number]) =>
        `${formatTimestampLabel(chapter.startSeconds)} ${chapter.title}`
    )
    .join("\n");
  manifest.publishingMetadata = {
    sourceId: manifest.episodeId,
    platform: "youtube",
    language: generation.metadata.source.language,
    titleCandidates: [
      generation.metadata.title.recommended,
      ...generation.metadata.title.alternatives,
    ],
    recommendedTitle: generation.metadata.title.recommended,
    description: generation.metadata.description,
    tags: generation.metadata.tags.items,
    hashtags: generation.metadata.hashtags,
    chapters: generation.metadata.chapters.items.map(
      (chapter: YoutubeMetadata["chapters"]["items"][number]) => ({
        timestampSeconds: chapter.startSeconds,
        title: chapter.title,
      })
    ),
    thumbnailTextCandidates: [
      generation.metadata.thumbnail.recommendedText,
      ...generation.metadata.thumbnail.alternativeTexts,
    ],
    coverTextCandidates: [
      generation.metadata.thumbnail.recommendedText,
      ...generation.metadata.thumbnail.alternativeTexts,
    ],
    pinnedComment: generation.metadata.pinnedComment,
    summary: generation.metadata.contentSummary,
    primaryKeyword: generation.metadata.seo.primaryKeyword,
    secondaryKeywords: generation.metadata.seo.secondaryKeywords,
    warnings: generation.metadata.verificationWarnings.map(
      (warning: YoutubeMetadata["verificationWarnings"][number]) =>
        `${warning.claim}: ${warning.reason}`
    ),
  };
  await writeJsonAtomic(path.join(episodeDir, "manifest.json"), manifest);
  process.stdout.write(`${path.join(metadataDir, "youtube.md")}\n`);
}

interface YoutubeMetadataRunSummary {
  readonly episodeSlug: string;
  readonly sourceFilePath: string;
  readonly outputs: YoutubeMetadataOutputs;
  readonly generation?: YoutubeMetadataGenerationInfo;
  readonly cacheHit?: boolean;
  readonly dryRun: boolean;
  readonly sceneCount: number;
  readonly durationSeconds: number;
  readonly language: string;
  readonly model: string;
  readonly promptVersion: string;
}

function youtubeMetadataPromptPath(): string {
  return path.resolve("prompts", "youtube-metadata.prompt.md");
}

async function loadYoutubeMetadataPromptText(): Promise<{
  readonly filePath: string;
  readonly text: string;
}> {
  const filePath = youtubeMetadataPromptPath();
  if (!(await fileExists(filePath))) {
    throw new Error(`Missing metadata prompt file: ${filePath}`);
  }
  return {
    filePath,
    text: await fs.readFile(filePath, "utf8"),
  };
}

function youtubeMetadataOutputsForEpisode(
  episodeDir: string
): YoutubeMetadataOutputs {
  const outputDir = path.join(episodeDir, "output");
  return {
    outputDir,
    jsonPath: path.join(outputDir, "youtube-metadata.json"),
    markdownPath: path.join(outputDir, "youtube-metadata.md"),
    descriptionPath: path.join(outputDir, "youtube-description.txt"),
    chaptersPath: path.join(outputDir, "youtube-chapters.txt"),
    tagsPath: path.join(outputDir, "youtube-tags.txt"),
    pinnedCommentPath: path.join(outputDir, "youtube-pinned-comment.txt"),
    generationPath: path.join(outputDir, "youtube-metadata-generation.json"),
  };
}

async function resolveYoutubeMetadataTargets(
  options: CliOptions,
  sourcePath: string | undefined,
  episodeSlug: string | undefined,
  all: boolean
): Promise<
  Array<{ readonly episodeSlug: string; readonly sourceFilePath: string }>
> {
  const config = await loadRuntimeConfig(configOverridesFromCli(options));
  if (all) {
    if (sourcePath || episodeSlug) {
      throw new Error(
        "--all cannot be combined with an explicit source path or --episode."
      );
    }
    return listEpisodeSceneFiles(config.workspaceDir);
  }
  if (sourcePath) {
    if (episodeSlug) {
      throw new Error(
        "Use either an explicit source path or --episode, not both."
      );
    }
    const resolved = ensureWorkspacePath(
      config.workspaceDir,
      path.resolve(sourcePath)
    );
    if (!(await fileExists(resolved))) {
      throw new Error(`Missing scenes file: ${resolved}`);
    }
    const episodeDir =
      path.basename(path.dirname(resolved)) === "output"
        ? path.dirname(path.dirname(resolved))
        : path.dirname(resolved);
    return [
      {
        episodeSlug: path.basename(episodeDir),
        sourceFilePath: resolved,
      },
    ];
  }
  if (!episodeSlug) {
    throw new Error("Provide a scenes file path, --episode, or --all.");
  }
  const sourceFilePath = await findEpisodeScenesFile(
    config.workspaceDir,
    episodeSlug
  );
  return [{ episodeSlug, sourceFilePath }];
}

async function commandMetadataYoutube(
  options: CliOptions,
  sourcePath: string | undefined,
  metadataOptions: {
    readonly episode?: string;
    readonly all?: boolean;
    readonly force?: boolean;
  }
): Promise<void> {
  const config = await loadRuntimeConfig(configOverridesFromCli(options));
  const prompt = await loadYoutubeMetadataPromptText();
  const language =
    config.youtubeMetadataLanguage ?? config.scriptLanguage ?? "en";
  const targets = await resolveYoutubeMetadataTargets(
    options,
    sourcePath,
    metadataOptions.episode,
    metadataOptions.all ?? false
  );
  if (options.dryRun) {
    const summary = await Promise.all(
      targets.map(async (target) => {
        const targetData = await readAndValidateScenesFile(
          target.sourceFilePath,
          language
        );
        const outputs = youtubeMetadataOutputsForEpisode(targetData.episodeDir);
        return {
          episodeSlug: target.episodeSlug,
          sourceFilePath: target.sourceFilePath,
          outputs,
          dryRun: true,
          sceneCount: targetData.scenePlan.scenes.length,
          durationSeconds: targetData.durationSeconds,
          language,
          model: config.openAiMetadataModel ?? "gpt-5.4-mini",
          promptVersion: "youtube-metadata-v1",
        } satisfies YoutubeMetadataRunSummary;
      })
    );
    printJson(summary.length === 1 ? summary[0] : summary);
    return;
  }
  const results: YoutubeMetadataRunSummary[] = [];
  let failed = false;
  for (const target of targets) {
    try {
      currentExecutionTelemetry()?.setEpisodeId(target.episodeSlug);
      const baseUrl =
        config.openAiCompatibleBaseUrl ?? process.env["OPENAI_BASE_URL"];
      const generationOptions: Omit<
        YoutubeMetadataGenerationOptions,
        "baseUrl"
      > & { baseUrl?: string } = {
        apiKey:
          config.openAiCompatibleApiKey ?? process.env["OPENAI_API_KEY"] ?? "",
        model: config.openAiMetadataModel ?? "gpt-5.4-mini",
        reasoningEffort: config.openAiMetadataReasoningEffort ?? "low",
        language,
        promptText: prompt.text,
        promptVersion: "youtube-metadata-v1",
        maxRetries: config.openAiMetadataMaxRetries ?? 3,
        timeoutMs: config.openAiMetadataTimeoutMs ?? 120000,
        keepFile: config.openAiMetadataKeepFile,
        force: metadataOptions.force ?? false,
        logger: createLogger(options.verbose ? "debug" : config.logLevel),
      };
      if (baseUrl !== undefined) {
        generationOptions.baseUrl = baseUrl;
      }
      const generation = await generateYoutubeMetadataFromScenesFile(
        target.sourceFilePath,
        generationOptions
      );
      results.push({
        episodeSlug: target.episodeSlug,
        sourceFilePath: target.sourceFilePath,
        outputs: generation.outputs,
        generation: generation.generation,
        cacheHit: generation.cacheHit,
        dryRun: false,
        sceneCount: generation.metadata.source.sceneCount,
        durationSeconds: generation.metadata.source.durationSeconds,
        language: generation.metadata.source.language,
        model: generation.generation.model,
        promptVersion: generation.generation.promptVersion,
      });
      if (!options.quiet) {
        process.stdout.write(`${generation.outputs.jsonPath}\n`);
      }
    } catch (error: unknown) {
      failed = true;
      process.stderr.write(
        `${JSON.stringify(serializeError(error), null, 2)}\n`
      );
    }
  }
  if (options.json) {
    printJson(results.length === 1 ? results[0] : results);
  }
  if (failed) {
    process.exitCode = 1;
  }
}

function inferLanguageFromPath(
  candidatePath: string | undefined
): string | undefined {
  if (!candidatePath) {
    return undefined;
  }
  const normalized = candidatePath
    .split(path.sep)
    .map((segment) => segment.toLowerCase());
  for (const segment of normalized) {
    if (segment === "de" || segment === "es" || segment === "fr") {
      return segment;
    }
  }
  return undefined;
}

async function resolveYoutubeUploadLanguage(
  episodeDir: string,
  config: RuntimeConfig,
  uploadOptions: {
    readonly metadataPath?: string;
    readonly videoPath?: string;
    readonly generateMetadata?: boolean;
  }
): Promise<string> {
  const candidatePaths = [
    uploadOptions.metadataPath
      ? path.resolve(episodeDir, uploadOptions.metadataPath)
      : undefined,
    uploadOptions.videoPath
      ? path.resolve(episodeDir, uploadOptions.videoPath)
      : undefined,
  ].filter((entry): entry is string => entry !== undefined);
  for (const candidate of candidatePaths) {
    const inferred = inferLanguageFromPath(candidate);
    if (inferred) {
      return inferred;
    }
  }
  const metadataCandidates = [
    path.join(episodeDir, "metadata", "youtube.json"),
    path.join(episodeDir, "metadata", "youtube-metadata.json"),
    path.join(episodeDir, "output", "youtube.json"),
    path.join(episodeDir, "output", "youtube-metadata.json"),
  ];
  for (const candidate of metadataCandidates) {
    if (!(await fileExists(candidate))) {
      continue;
    }
    try {
      const raw = JSON.parse(await fs.readFile(candidate, "utf8")) as {
        source?: { language?: unknown };
      };
      if (
        typeof raw.source?.language === "string" &&
        raw.source.language.trim().length > 0
      ) {
        return raw.source.language;
      }
    } catch {
      continue;
    }
  }
  return config.scriptLanguage ?? "en";
}

function resolveYoutubeChannelIdForLanguage(
  config: RuntimeConfig,
  language: string | undefined
): string | undefined {
  const youtubeConfig = config as YoutubeChannelRuntimeConfig;
  const normalized = language?.trim().toLowerCase();
  if (!normalized) {
    return youtubeConfig.youtubeChannelId;
  }
  const prefix = normalized.split("-")[0];
  if (prefix === "de") {
    return (
      youtubeConfig.youtubeChannelIdGerman ?? youtubeConfig.youtubeChannelId
    );
  }
  if (prefix === "es") {
    return (
      youtubeConfig.youtubeChannelIdSpanish ?? youtubeConfig.youtubeChannelId
    );
  }
  if (prefix === "fr") {
    return (
      youtubeConfig.youtubeChannelIdFrench ?? youtubeConfig.youtubeChannelId
    );
  }
  return youtubeConfig.youtubeChannelId;
}

function resolveYoutubeRefreshTokenForLanguage(
  config: RuntimeConfig,
  language: string | undefined
): string | undefined {
  const youtubeConfig = config as YoutubeChannelRuntimeConfig;
  const normalized = language?.trim().toLowerCase();
  if (!normalized) {
    return youtubeConfig.youtubeRefreshToken;
  }
  const prefix = normalized.split("-")[0];
  if (prefix === "de") {
    return (
      youtubeConfig.youtubeRefreshTokenGerman ??
      youtubeConfig.youtubeRefreshToken
    );
  }
  if (prefix === "es") {
    return (
      youtubeConfig.youtubeRefreshTokenSpanish ??
      youtubeConfig.youtubeRefreshToken
    );
  }
  if (prefix === "fr") {
    return (
      youtubeConfig.youtubeRefreshTokenFrench ??
      youtubeConfig.youtubeRefreshToken
    );
  }
  return youtubeConfig.youtubeRefreshToken;
}

function resolveYoutubeAuthSettings(
  config: RuntimeConfig,
  channelId?: string
): YoutubeAuthSettings {
  const clientId = config.youtubeClientId ?? process.env["YOUTUBE_CLIENT_ID"];
  const clientSecret =
    config.youtubeClientSecret ?? process.env["YOUTUBE_CLIENT_SECRET"];
  const refreshToken =
    config.youtubeRefreshToken ?? process.env["YOUTUBE_REFRESH_TOKEN"];
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, or YOUTUBE_REFRESH_TOKEN."
    );
  }
  const authBase: YoutubeAuthSettings = {
    clientId,
    clientSecret,
    refreshToken,
    ...(config.youtubeRedirectUri
      ? { redirectUri: config.youtubeRedirectUri }
      : {}),
  };
  const resolvedChannelId = channelId ?? config.youtubeChannelId;
  if (resolvedChannelId) {
    return {
      ...authBase,
      channelId: resolvedChannelId,
    };
  }
  return authBase;
}

async function commandYoutubeUpload(
  options: CliOptions,
  uploadOptions: {
    readonly episode: string;
    readonly force?: boolean;
    readonly generateMetadata?: boolean;
    readonly metadataPath?: string;
    readonly playlistId?: string;
    readonly privacyStatus?: "private" | "public" | "unlisted";
    readonly publishAt?: string;
    readonly notifySubscribers?: boolean;
    readonly videoPath?: string;
    readonly thumbnailPath?: string;
  }
): Promise<void> {
  markEpisodeTelemetry(uploadOptions.episode);
  const config = await loadRuntimeConfig(configOverridesFromCli(options));
  const { episodeDir } = await readManifestForEpisode(
    options,
    uploadOptions.episode
  );
  const uploadLanguage = await resolveYoutubeUploadLanguage(
    episodeDir,
    config,
    uploadOptions
  );
  const authConfig = {
    ...config,
    youtubeRefreshToken:
      resolveYoutubeRefreshTokenForLanguage(config, uploadLanguage) ??
      config.youtubeRefreshToken,
  };
  const auth = resolveYoutubeAuthSettings(
    authConfig,
    resolveYoutubeChannelIdForLanguage(config, uploadLanguage)
  );
  let metadataGeneration: YoutubeUploadCommandInput["metadataGeneration"];
  if (uploadOptions.generateMetadata) {
    metadataGeneration = {
      apiKey:
        config.openAiCompatibleApiKey ?? process.env["OPENAI_API_KEY"] ?? "",
      model: config.openAiMetadataModel ?? "gpt-5.4-mini",
      reasoningEffort: config.openAiMetadataReasoningEffort ?? "low",
      promptText: await fs.readFile(
        path.resolve("prompts", "youtube-metadata.prompt.md"),
        "utf8"
      ),
      maxRetries: config.openAiMetadataMaxRetries ?? 3,
      timeoutMs: config.openAiMetadataTimeoutMs ?? 120000,
      keepFile: config.openAiMetadataKeepFile,
    };
    const baseUrl =
      config.openAiCompatibleBaseUrl ?? process.env["OPENAI_BASE_URL"];
    if (baseUrl) {
      metadataGeneration = { ...metadataGeneration, baseUrl };
    }
  }
  const result = await uploadYoutubeEpisode({
    workspaceDir: config.workspaceDir,
    episodeId: uploadOptions.episode,
    episodeDir,
    auth,
    force: uploadOptions.force,
    generateMetadata: uploadOptions.generateMetadata,
    metadataPath: uploadOptions.metadataPath,
    overrides: {
      ...(uploadOptions.playlistId
        ? { playlistId: uploadOptions.playlistId }
        : {}),
      ...(uploadOptions.privacyStatus
        ? { privacyStatus: uploadOptions.privacyStatus }
        : {}),
      ...(uploadOptions.publishAt
        ? { publishAt: uploadOptions.publishAt }
        : {}),
      ...(uploadOptions.notifySubscribers !== undefined
        ? { notifySubscribers: uploadOptions.notifySubscribers }
        : {}),
      ...(uploadOptions.videoPath
        ? { videoPath: uploadOptions.videoPath }
        : {}),
      ...(uploadOptions.thumbnailPath
        ? { thumbnailPath: uploadOptions.thumbnailPath }
        : {}),
    },
    metadataGeneration,
    logger: createLogger(options.verbose ? "debug" : config.logLevel),
  });
  if (options.json) {
    printJson(result.report);
    return;
  }
  process.stdout.write(
    [
      `Uploaded ${uploadOptions.episode}`,
      `Video ID: ${result.report.youtubeVideoId ?? "n/a"}`,
      `Report: ${result.reportPath}`,
      `Markdown: ${result.markdownPath}`,
      result.skipped ? "Status: skipped" : "Status: uploaded",
    ].join("\n") + "\n"
  );
}

async function commandPackage(
  options: CliOptions,
  episodeId: string
): Promise<void> {
  markEpisodeTelemetry(episodeId);
  const { manifest } = await readManifestForEpisode(options, episodeId);
  printJson({
    episodeId: manifest.episodeId,
    slug: manifest.slug,
    artifacts: manifest.artifacts.length,
    scenes: manifest.scenePlan?.scenes.length ?? 0,
  });
}

async function commandDbMigrate(options: CliOptions): Promise<void> {
  const pipeline = await loadPipeline(options);
  pipeline.environment.db.migrate();
  if (!options.quiet) {
    process.stdout.write(
      `Database migrated at ${pipeline.environment.config.dbPath}\n`
    );
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
    .option("--speech-voice-preset <preset>", "slow, fast, or very-fast speech settings")
    .option(
      "--language <code>",
      "localized script language, for example en, es, pt"
    );
}

const program = addGlobalOptions(new Command());
program
  .name("mediaforge")
  .description("Local-first media repurposing pipeline")
  .version("0.0.0");
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
  .action(
    async (opts: {
      file?: string;
      url?: string;
      transcript?: string;
      title?: string;
      slug?: string;
    }) => {
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
    }
  );
program
  .command("run")
  .argument("<episode-id>")
  .option("--from <stage>", "start from a pipeline stage")
  .option("--until <stage>", "stop at a pipeline stage")
  .option(
    "--scene-limit <n>",
    "process only the first N scenes",
    (value: string) => Number.parseInt(value, 10)
  )
  .description("Run the pipeline for an episode")
  .action(
    async (
      episodeId: string,
      opts: { from?: string; until?: string; sceneLimit?: number }
    ) => {
      const cliOptions: CliOptions = { ...program.opts<CliOptions>() };
      if (opts.from) {
        cliOptions.fromStage = opts.from;
      }
      if (opts.until) {
        cliOptions.untilStage = opts.until;
      }
      if (opts.sceneLimit !== undefined) {
        cliOptions.sceneLimit = opts.sceneLimit;
      }
      await commandRun(cliOptions, episodeId);
    }
  );
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

const transcriptCommand = program
  .command("transcript")
  .description("Transcript utilities");
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
  .description(
    "Normalize an existing raw Whisper transcript without rerunning Whisper"
  )
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
    await commandScenesInspect(
      program.opts<CliOptions>(),
      episodeId,
      opts.scene
    );
  });

const audioCommand = program.command("audio").description("Audio utilities");
audioCommand
  .command("generate")
  .argument("<episode-id>")
  .action(async (episodeId: string) => {
    await commandAudioGenerate(program.opts<CliOptions>(), episodeId);
  });

const clipsCommand = program
  .command("clips")
  .description("Language-specific clip utilities");
clipsCommand
  .command("generate")
  .argument("<episode-id>")
  .option(
    "--scene-limit <n>",
    "generate only the first N clips",
    (value: string) => Number.parseInt(value, 10)
  )
  .action(async (episodeId: string, opts: { sceneLimit?: number }) => {
    const cliOptions: CliOptions = { ...program.opts<CliOptions>() };
    if (opts.sceneLimit !== undefined) {
      cliOptions.sceneLimit = opts.sceneLimit;
    }
    await commandClipsGenerate(cliOptions, episodeId);
  });
clipsCommand
  .command("backfill-manifests")
  .argument("<episode-id>")
  .description("Generate missing clip sidecar manifests from existing clips")
  .action(async (episodeId: string) => {
    await commandClipsBackfillManifests(program.opts<CliOptions>(), episodeId);
  });

program
  .command("align")
  .argument("<episode-id>")
  .action(async (episodeId: string) => {
    await commandRun(program.opts<CliOptions>(), episodeId);
  });

const imagesCommand = program
  .command("images")
  .description("Local scene image workflow");
imagesCommand
  .command("plan")
  .requiredOption("--episode <episode-id>")
  .option("--scene <scene-id>")
  .option("--allow-unapproved-character-references")
  .option("--force")
  .action(
    async (opts: {
      episode: string;
      scene?: string;
      allowUnapprovedCharacterReferences?: boolean;
      force?: boolean;
    }) => {
      const cliOptions: CliOptions = {
        ...program.opts<CliOptions>(),
        episode: opts.episode,
        ...(opts.scene !== undefined ? { scene: opts.scene } : {}),
        ...(opts.allowUnapprovedCharacterReferences !== undefined
          ? {
              allowUnapprovedCharacterReferences:
                opts.allowUnapprovedCharacterReferences,
            }
          : {}),
        ...(opts.force !== undefined ? { force: opts.force } : {}),
      };
      await commandImagesPlan(cliOptions, opts.episode, opts.scene);
    }
  );
imagesCommand
  .command("generate")
  .requiredOption("--episode <episode-id>")
  .option("--scene <scene-id>")
  .option("--allow-unapproved-character-references")
  .option("--force")
  .action(
    async (opts: {
      episode: string;
      scene?: string;
      allowUnapprovedCharacterReferences?: boolean;
      force?: boolean;
    }) => {
      const cliOptions: CliOptions = {
        ...program.opts<CliOptions>(),
        episode: opts.episode,
        ...(opts.scene !== undefined ? { scene: opts.scene } : {}),
        ...(opts.allowUnapprovedCharacterReferences !== undefined
          ? {
              allowUnapprovedCharacterReferences:
                opts.allowUnapprovedCharacterReferences,
            }
          : {}),
        ...(opts.force !== undefined ? { force: opts.force } : {}),
      };
      await commandImagesGenerate(cliOptions, opts.episode, opts.scene);
    }
  );
imagesCommand
  .command("generate-character-references")
  .requiredOption("--episode <episode-id>")
  .option("--character <character-id>")
  .option("--force")
  .action(
    async (opts: { episode: string; character?: string; force?: boolean }) => {
      const cliOptions: CliOptions = {
        ...program.opts<CliOptions>(),
        episode: opts.episode,
        ...(opts.character !== undefined ? { character: opts.character } : {}),
        ...(opts.force !== undefined ? { force: opts.force } : {}),
      };
      await commandImagesGenerateCharacterReferences(
        cliOptions,
        opts.episode,
        opts.character
      );
    }
  );
imagesCommand
  .command("approve-character")
  .requiredOption("--episode <episode-id>")
  .requiredOption("--character <character-id>")
  .action(async (opts: { episode: string; character: string }) => {
    const cliOptions: CliOptions = {
      ...program.opts<CliOptions>(),
      episode: opts.episode,
      character: opts.character,
    };
    await commandImagesApproveCharacter(
      cliOptions,
      opts.episode,
      opts.character
    );
  });
imagesCommand
  .command("regenerate-character")
  .requiredOption("--episode <episode-id>")
  .requiredOption("--character <character-id>")
  .option("--force")
  .action(
    async (opts: { episode: string; character: string; force?: boolean }) => {
      const cliOptions: CliOptions = {
        ...program.opts<CliOptions>(),
        episode: opts.episode,
        character: opts.character,
        ...(opts.force !== undefined ? { force: opts.force } : {}),
      };
      await commandImagesRegenerateCharacter(
        cliOptions,
        opts.episode,
        opts.character
      );
    }
  );
imagesCommand
  .command("export-openart")
  .argument("<episode-id>")
  .action(async (episodeId: string) => {
    await commandImagesExportOpenArt(program.opts<CliOptions>(), episodeId);
  });
imagesCommand
  .command("open-openart")
  .argument("<episode-id>")
  .action(async (episodeId: string) => {
    await commandImagesOpenOpenArt(program.opts<CliOptions>(), episodeId);
  });
imagesCommand
  .command("import")
  .argument("<episode-id>")
  .requiredOption("--from <directory>")
  .action(async (episodeId: string, opts: { from: string }) => {
    await commandImagesImport(program.opts<CliOptions>(), episodeId, opts.from);
  });
imagesCommand
  .command("validate")
  .argument("<episode-id>")
  .action(async (episodeId: string) => {
    await commandImagesValidate(program.opts<CliOptions>(), episodeId);
  });
imagesCommand
  .command("missing")
  .argument("<episode-id>")
  .action(async (episodeId: string) => {
    await commandImagesMissing(program.opts<CliOptions>(), episodeId);
  });
imagesCommand
  .command("reject")
  .argument("<episode-id>")
  .requiredOption("--scene <scene-id>")
  .requiredOption("--reason <reason>")
  .action(
    async (episodeId: string, opts: { scene: string; reason: string }) => {
      await commandImagesReject(
        program.opts<CliOptions>(),
        episodeId,
        opts.scene,
        opts.reason
      );
    }
  );
imagesCommand
  .command("regenerate-workbook")
  .argument("<episode-id>")
  .option("--missing-only")
  .action(async (episodeId: string, opts: { missingOnly?: boolean }) => {
    await commandImagesRegenerateWorkbook(
      program.opts<CliOptions>(),
      episodeId,
      opts.missingOnly ?? false
    );
  });
imagesCommand
  .command("assign")
  .argument("<episode-id>")
  .requiredOption("--scene <scene-id>")
  .requiredOption("--file <path>")
  .action(async (episodeId: string, opts: { scene: string; file: string }) => {
    await commandImagesAssign(
      program.opts<CliOptions>(),
      episodeId,
      opts.scene,
      opts.file
    );
  });
imagesCommand
  .command("generate-openai")
  .argument("<episode-id>")
  .option("--scene <scene-id>")
  .action(async (episodeId: string, opts: { scene?: string }) => {
    await commandImagesGenerateOpenAi(
      program.opts<CliOptions>(),
      episodeId,
      opts.scene
    );
  });

const renderCommand = program
  .command("render")
  .argument("<episode-id>")
  .option("--profile <profile>", "youtube or vertical", "youtube")
  .option("--no-captions", "render without burned-in captions")
  .action(
    async (
      episodeId: string,
      opts: { profile: "youtube" | "vertical"; captions?: boolean }
    ) => {
      await commandRender(
        program.opts<CliOptions>(),
        episodeId,
        opts.profile,
        opts.captions ?? true
      );
    }
  );
const renderRemoteCommand = renderCommand
  .command("remote")
  .description("Remote rendering utilities");
renderRemoteCommand
  .command("check")
  .description("Run an SSH/ffmpeg/rsync preflight against the remote worker")
  .action(async () => {
    await commandRenderRemoteCheck(program.opts<CliOptions>());
  });
renderRemoteCommand
  .command("cleanup")
  .description("Remove stale remote render workspaces")
  .action(async () => {
    await commandRenderRemoteCleanup(program.opts<CliOptions>());
  });
renderRemoteCommand
  .command("test")
  .description("Render a deterministic local and remote clip pair")
  .action(async () => {
    await commandRenderRemoteTest(program.opts<CliOptions>());
  });
const metadataCommand = program
  .command("metadata")
  .description("Metadata utilities");
metadataCommand
  .command("generate")
  .argument("<episode-id>")
  .action(async (episodeId: string) => {
    await commandMetadataGenerate(program.opts<CliOptions>(), episodeId);
  });
metadataCommand
  .command("youtube")
  .argument("[source]")
  .option("--episode <episode-slug>")
  .option("--all")
  .option("--force")
  .action(
    async (
      source: string | undefined,
      opts: { episode?: string; all?: boolean; force?: boolean }
    ) => {
      await commandMetadataYoutube(program.opts<CliOptions>(), source, opts);
    }
  );
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

const youtubeCommand = program
  .command("youtube")
  .description("YouTube utilities");
youtubeCommand
  .command("upload")
  .requiredOption("--episode <episode-id>")
  .option("--generate-metadata", "regenerate metadata before upload")
  .option("--metadata-path <path>", "explicit metadata file path")
  .option("--playlist-id <playlist-id>", "add the uploaded video to a playlist")
  .option("--privacy-status <status>", "private, unlisted, or public")
  .option("--publish-at <timestamp>", "future RFC 3339 publish timestamp")
  .option("--notify-subscribers", "notify subscribers on publish")
  .option("--video-path <path>", "override rendered video path")
  .option("--thumbnail-path <path>", "override thumbnail path")
  .option("--force", "regenerate even if a previous upload report exists")
  .description("Upload a completed episode to YouTube")
  .action(
    async (opts: {
      episode: string;
      generateMetadata?: boolean;
      metadataPath?: string;
      playlistId?: string;
      privacyStatus?: "private" | "public" | "unlisted";
      publishAt?: string;
      notifySubscribers?: boolean;
      videoPath?: string;
      thumbnailPath?: string;
      force?: boolean;
    }) => {
      await commandYoutubeUpload(program.opts<CliOptions>(), opts);
    }
  );

registerEpisodeCommands(program);
registerStoryLocalizationCommands(program);

const executionId = process.env["MEDIAFORGE_EXECUTION_ID"] ?? randomUUID();
const startedAt =
  process.env["MEDIAFORGE_EXECUTION_STARTED_AT"] ?? new Date().toISOString();
const telemetry = createExecutionTelemetry({
  context: {
    executionId,
    command:
      process.env["MEDIAFORGE_NPM_SCRIPT_COMMAND"] ??
      process.argv.slice(2).join(" "),
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    startedAt,
    ...(process.env["MEDIAFORGE_NPM_SCRIPT"]
      ? { npmScript: process.env["MEDIAFORGE_NPM_SCRIPT"] }
      : {}),
  },
  logger: createLogger(resolveLogLevel(process.env["MEDIAFORGE_LOG_LEVEL"])),
  reportDir: path.join(process.cwd(), ".mediaforge", "execution-reports"),
});

await withExecutionTelemetry(telemetry, async () => {
  try {
    await program.parseAsync(process.argv);
    await telemetry.finalize({
      success: true,
      exitCode: typeof process.exitCode === "number" ? process.exitCode : 0,
      endedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    await telemetry.finalize({
      success: false,
      exitCode: 1,
      endedAt: new Date().toISOString(),
    });
    process.stderr.write(`${JSON.stringify(serializeError(error), null, 2)}\n`);
    process.exitCode = 1;
  }
});
