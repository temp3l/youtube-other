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
  loadEpisodeSceneVisualPlan,
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
  generateYoutubeMetadataForTarget,
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
  type VideoRenderRequest,
} from "@mediaforge/rendering";
import {
  generateUploadMetadataForEpisode,
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
  createEpisodePathResolver,
  ensureDir,
  ensureWorkspacePath,
  fileExists,
  formatTimestampLabel,
  hashFile,
  hashText,
  normalizeWhitespace,
  normalizeContentVariant,
  normalizeEpisodeId,
  normalizeLocaleCode,
  safeBasename,
  slugify,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import {
  getLanguageProfile,
  type LanguageCode,
} from "@mediaforge/story-localization";
import {
  buildAudioInstructionArtifact,
  computeTtsDependencyFingerprint,
  computeSpeechModelConfigFingerprint,
  computeSpeechVoiceConfigFingerprint,
  NarrationPipeline,
  buildNarrationBatchStatus,
  buildNarrationTargetStatus,
  buildNarrationTargetStatusFromError,
  buildNarrationTargetStatusFromResult,
  narrationPipelineExitCode,
  narrationPipelineModeSchema,
  narrationPipelineStageSchema,
  runVoiceBenchmark,
  type AudioInstructionArtifact,
  type NarrationBatchStatus,
  type NarrationPipelineMode,
  type NarrationPipelineResult,
  type NarrationPipelineStage,
  type NarrationTargetStatus,
  type SpeechNarrationDependency,
  type SpeechVoicePreset,
  type TtsGenerationRecord,
  loadEpisodeScriptMarkdown,
  listEpisodeScriptLanguages,
  DEFAULT_SPEECH_VOICE,
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
import {
  buildEpisodeImageSummaryOutput,
  summarizeEpisodeImageState,
  type EpisodeImageSummary,
} from "./episode-image-summary.js";
import { buildEpisodeStatusOutput } from "./episode-status-output.js";
import { buildImageStatusOutput } from "./images-status-output.js";
import { registerImagesResumeCommand } from "./images-resume-command.js";
import { registerImagesSyncSharedCommand } from "./images-sync-shared-command.js";
import {
  summarizeRemoteStatusJob,
  type RawRemoteLogEntry,
  type RawRemoteStatusJob,
  type RemoteStatusJobSummary,
} from "./render-remote-inspection.js";
import { buildRemoteRenderShellScript } from "./render-remote-shell.js";
import { buildSceneInspectOutput } from "./scene-inspect-output.js";
import { registerShotsCommands } from "./shots.js";
import { registerStoryLocalizationCommands } from "./story-localization-commands.js";
import { registerThumbnailCommands } from "./thumbnail-commands.js";
import { resolveUploadThumbnailPath } from "./youtube-upload-thumbnail.js";

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
  narrationPipelineMode?: NarrationPipelineMode;
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

function formatPercent(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${(value * 100).toFixed(1)}%`
    : "unavailable";
}

function formatEstimatedSavings(value: Record<string, unknown>): string {
  const currency = value["currency"];
  const estimatedSavingsMicros = value["estimatedSavingsMicros"];
  if (
    currency === "USD" &&
    typeof estimatedSavingsMicros === "number" &&
    Number.isFinite(estimatedSavingsMicros)
  ) {
    return `estimated USD ${(estimatedSavingsMicros / 1_000_000).toFixed(2)}`;
  }
  return "unavailable";
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
  if (options.narrationPipelineMode) {
    overrides.narrationPipelineMode = options.narrationPipelineMode;
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

function buildRemoteSshArgs(remote: RemoteRenderSettings): string[] {
  return [
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
  ];
}

function spawnRemoteCommand(
  remote: RemoteRenderSettings,
  command: readonly string[]
): ReturnType<typeof spawnSync> {
  return spawnSync(
    "ssh",
    [
      ...buildRemoteSshArgs(remote),
      `${remote.user}@${remote.host}`,
      ...command,
    ],
    {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    }
  );
}

function spawnSyncStderr(result: ReturnType<typeof spawnSync>): string {
  return typeof result.stderr === "string"
    ? result.stderr
    : result.stderr.toString("utf8");
}

function spawnSyncStdout(result: ReturnType<typeof spawnSync>): string {
  return typeof result.stdout === "string"
    ? result.stdout
    : result.stdout.toString("utf8");
}

function buildRemoteInspectNodeScript(): string {
  return [
    "const fs=require('node:fs/promises');",
    "const path=require('node:path');",
    "async function readJson(filePath){try{return JSON.parse(await fs.readFile(filePath,'utf8'));}catch{return undefined;}}",
    "async function readDir(dirPath){try{return await fs.readdir(dirPath,{withFileTypes:true});}catch{return [];}}",
    "function tailText(text,lines){const value=Number.parseInt(lines,10);const count=Number.isFinite(value)&&value>0?value:40;return text.split(/\\r?\\n/u).slice(-count).join('\\n').trim();}",
    "async function inspectStatus(baseDir,jobId,limitArg,includeLogsArg,tailArg,allArg){",
    "const jobsRoot=path.join(baseDir,'jobs');",
    "const includeLogs=includeLogsArg==='true';",
    "const includeAll=allArg==='true';",
    "const rawLimit=Number.parseInt(limitArg,10);",
    "const limit=Number.isFinite(rawLimit)&&rawLimit>0?rawLimit:10;",
    "let jobs=(await readDir(jobsRoot)).filter((entry)=>entry.isDirectory()).map((entry)=>entry.name);",
    "const stats=await Promise.all(jobs.map(async(name)=>({name,stat:await fs.stat(path.join(jobsRoot,name)).catch(()=>undefined)})));",
    "stats.sort((left,right)=>(right.stat?.mtimeMs??0)-(left.stat?.mtimeMs??0));",
    "jobs=stats.map((entry)=>entry.name);",
    "if(jobId){jobs=jobs.filter((name)=>name===jobId);}else if(!includeAll){jobs=jobs.slice(0,limit);}",
    "const payload=[];",
    "for(const name of jobs){",
    "const jobRoot=path.join(jobsRoot,name);",
    "const metadataRoot=path.join(jobRoot,'metadata');",
    "const logsRoot=path.join(jobRoot,'logs');",
    "const manifest=await readJson(path.join(metadataRoot,'job-manifest.json'));",
    "const metadataEntries=await readDir(metadataRoot);",
    "const clipResults=[];",
    "const parseErrors=[];",
    "for(const entry of metadataEntries){",
    "if(!entry.isFile()||!entry.name.endsWith('.json')||entry.name==='job-manifest.json'||entry.name==='results.json'){continue;}",
    "const result=await readJson(path.join(metadataRoot,entry.name));",
    "if(result&&typeof result==='object'){clipResults.push(result);}else{parseErrors.push(entry.name);}",
    "}",
    "const logEntries=await readDir(logsRoot);",
    "const logs=[];",
    "if(includeLogs){",
    "for(const entry of logEntries){",
    "if(!entry.isFile()||!entry.name.endsWith('.log')){continue;}",
    "const text=await fs.readFile(path.join(logsRoot,entry.name),'utf8').catch(()=>undefined);",
    "if(typeof text==='string'){logs.push({clipId:entry.name.replace(/\\.log$/u,''),text:tailText(text,tailArg)});}",
    "}",
    "}",
    "payload.push({",
    "jobId:name,",
    "episodeId:typeof manifest?.episodeId==='string'?manifest.episodeId:undefined,",
    "generatedAt:typeof manifest?.generatedAt==='string'?manifest.generatedAt:undefined,",
    "totalClips:Array.isArray(manifest?.jobs)?manifest.jobs.length:undefined,",
    "clipIds:Array.isArray(manifest?.jobs)?manifest.jobs.map((job)=>job?.clipId).filter((clipId)=>typeof clipId==='string'):undefined,",
    "clipResults,",
    "logCount:logEntries.filter((entry)=>entry.isFile()&&entry.name.endsWith('.log')).length,",
    "logs,",
    "updatedAtMs:(await fs.stat(jobRoot).catch(()=>undefined))?.mtimeMs,",
    "parseErrors",
    "});",
    "}",
    "process.stdout.write(JSON.stringify({jobs:payload},null,2));",
    "}",
    "async function inspectLogs(baseDir,jobId,clipId,tailArg){",
    "if(!jobId){throw new Error('A job id is required.');}",
    "const logsRoot=path.join(baseDir,'jobs',jobId,'logs');",
    "const entries=await readDir(logsRoot);",
    "if(entries.length===0){throw new Error(`No logs found for remote job ${jobId}.`);}",
    "const logs=[];",
    "for(const entry of entries){",
    "if(!entry.isFile()||!entry.name.endsWith('.log')){continue;}",
    "const currentClipId=entry.name.replace(/\\.log$/u,'');",
    "if(clipId&&clipId!==currentClipId){continue;}",
    "const text=await fs.readFile(path.join(logsRoot,entry.name),'utf8').catch(()=>undefined);",
    "if(typeof text==='string'){logs.push({clipId:currentClipId,text:tailText(text,tailArg)});}",
    "}",
    "if(logs.length===0){throw new Error(clipId?`No logs found for clip ${clipId} in remote job ${jobId}.`:`No logs found for remote job ${jobId}.`);}",
    "process.stdout.write(JSON.stringify({jobId,entries:logs},null,2));",
    "}",
    "async function main(){",
    "const mode=process.argv[2];",
    "const baseDir=process.argv[3];",
    "if(!mode||!baseDir){throw new Error('Usage: node -e <script> <mode> <baseDir>');}",
    "if(mode==='status'){await inspectStatus(baseDir,process.argv[4]??'',process.argv[5]??'10',process.argv[6]??'false',process.argv[7]??'40',process.argv[8]??'false');return;}",
    "if(mode==='logs'){await inspectLogs(baseDir,process.argv[4]??'',process.argv[5]??'',process.argv[6]??'40');return;}",
    "throw new Error(`Unsupported mode: ${mode}`);",
    "}",
    "main().catch((error)=>{process.stderr.write(`${error instanceof Error?error.message:String(error)}\\n`);process.exit(1);});",
  ].join("");
}

interface RemoteStatusOptions {
  readonly job?: string;
  readonly limit?: string;
  readonly all?: boolean;
  readonly includeLogs?: boolean;
  readonly tail?: string;
}

interface RemoteLogsOptions {
  readonly clip?: string;
  readonly tail?: string;
}

function parsePositiveIntegerOption(
  value: string | undefined,
  label: string,
  fallback: number
): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function parseRemoteStatusResponse(stdout: string): RemoteStatusJobSummary[] {
  const parsed = JSON.parse(stdout) as { jobs?: RawRemoteStatusJob[] };
  return (parsed.jobs ?? []).map((job) => summarizeRemoteStatusJob(job));
}

function formatRemoteStatusSummary(
  jobs: readonly RemoteStatusJobSummary[]
): string {
  if (jobs.length === 0) {
    return "No remote render jobs found.\n";
  }
  const lines = jobs.flatMap((job) => {
    const timestamp = job.generatedAt ?? "unknown-time";
    const summary = [
      job.jobId,
      job.state,
      job.episodeId ?? "unknown-episode",
      `${job.counts.succeeded}/${job.counts.total} ok`,
      `${job.counts.failed} failed`,
      `${job.counts.missing} missing`,
      timestamp,
    ].join(" | ");
    const excerpts = (job.logs ?? []).map((entry) =>
      `  log:${entry.clipId} ${entry.text.split(/\r?\n/u)[0] ?? ""}`.trimEnd()
    );
    return [summary, ...excerpts];
  });
  return `${lines.join("\n")}\n`;
}

function formatRemoteLogOutput(
  jobId: string,
  entries: readonly RawRemoteLogEntry[]
): string {
  return `${entries
    .map((entry) => `# ${jobId}:${entry.clipId}\n${entry.text.trim()}`)
    .join("\n\n")}\n`;
}

function isEnglishLanguage(language: string): boolean {
  return language.toLowerCase() === "en";
}

function episodePathContext(episodeDir: string, language: string) {
  const episodeRoot = path.resolve(episodeDir);
  const resolver = createEpisodePathResolver(path.dirname(episodeRoot));
  const context = {
    episodeId: normalizeEpisodeId(path.basename(episodeRoot)),
    locale: normalizeLocaleCode(language),
    variant: normalizeContentVariant("full"),
  };
  return { resolver, context };
}

function localizedAudioBaseDir(episodeDir: string, language: string): string {
  const { resolver, context } = episodePathContext(episodeDir, language);
  return resolver.localeVariantRoot(context);
}

function localizedSegmentsDirFromBase(audioBaseDir: string): string {
  return path.join(audioBaseDir, "audio", "segments");
}

function localizedNarrationPathFromBase(audioBaseDir: string): string {
  return path.join(audioBaseDir, "audio", "narration.wav");
}

function localizedMetadataDirFromBase(audioBaseDir: string): string {
  return path.join(audioBaseDir, "metadata");
}

function localizedSuffix(language: string): string {
  return isEnglishLanguage(language) ? "" : `-${safeBasename(language)}`;
}

function localizedSegmentsDir(episodeDir: string, language: string): string {
  return localizedSegmentsDirFromBase(
    localizedAudioBaseDir(episodeDir, language)
  );
}

function localizedNarrationPath(episodeDir: string, language: string): string {
  return localizedNarrationPathFromBase(
    localizedAudioBaseDir(episodeDir, language)
  );
}

function localizedMetadataDir(episodeDir: string, language: string): string {
  return localizedMetadataDirFromBase(
    localizedAudioBaseDir(episodeDir, language)
  );
}

function canonicalGeneratedImagesDir(episodeDir: string): string {
  const episodeRoot = path.resolve(episodeDir);
  const resolver = createEpisodePathResolver(path.dirname(episodeRoot));
  return resolver.sharedGeneratedImagesDir(
    normalizeEpisodeId(path.basename(episodeRoot))
  );
}

function episodeManifestPath(episodeDir: string): string {
  const episodeRoot = path.resolve(episodeDir);
  const resolver = createEpisodePathResolver(path.dirname(episodeRoot));
  return resolver.manifestPath(normalizeEpisodeId(path.basename(episodeRoot)));
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
  const segmentsDir = localizedSegmentsDirFromBase(
    localizedAudioBaseDir(episodeDir, language)
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

function localeForLanguage(language: string): string {
  switch (language) {
    case "de":
      return "de-DE";
    case "es":
      return "es-ES";
    case "fr":
      return "fr-FR";
    case "pt":
      return "pt-BR";
    default:
      return "en-US";
  }
}

function isLanguageCode(language: string): language is LanguageCode {
  return (
    language === "en" ||
    language === "de" ||
    language === "es" ||
    language === "fr" ||
    language === "pt"
  );
}

function defaultPaceWpmForPreset(preset: SpeechVoicePreset): number {
  if (preset === "very-fast") {
    return 190;
  }
  if (preset === "slow") {
    return 145;
  }
  return 180;
}

function resolveNarrationTempoSettings(
  language: string,
  variant: "full" | "short",
  preset: SpeechVoicePreset
): { readonly paceWpm?: number; readonly speed?: number } {
  if (!isLanguageCode(language)) {
    return {};
  }
  const profile = getLanguageProfile(language);
  const paceWpm =
    variant === "short" ? profile.shortNarrationWpm : profile.fullNarrationWpm;
  const basePaceWpm = defaultPaceWpmForPreset(preset);
  const speed = Number((paceWpm / Math.max(1, basePaceWpm)).toFixed(3));
  return {
    paceWpm,
    ...(Number.isFinite(speed) && speed > 0 ? { speed } : {}),
  };
}

async function loadValidatedNarrationDependency(
  episodeDir: string,
  language: string,
  variant: "full" | "short" = "full"
): Promise<
  SpeechNarrationDependency & {
    readonly filePath: string;
  }
> {
  const script = await loadNarrationScriptMarkdown(episodeDir, language);
  const narrationText = normalizeWhitespace(script.text);
  const episodeSlug = path.basename(episodeDir);
  const episodeNumber = episodeSlug.split("-")[0] ?? episodeSlug;
  const locale = localeForLanguage(language);
  return {
    episodeNumber,
    episodeSlug,
    language,
    locale,
    variant,
    narrationText,
    narrationFingerprint: hashText(narrationText),
    filePath: script.filePath,
  };
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
    let manifestPath: string;
    try {
      manifestPath = createEpisodePathResolver(workspace).manifestPath(
        normalizeEpisodeId(entry.name)
      );
    } catch {
      continue;
    }
    if (!(await fileExists(manifestPath))) {
      continue;
    }
    const manifest = episodeManifestSchema.parse(
      JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown
    );
    if (manifest.episodeId === episodeId) {
      const episodeDir = path.dirname(manifestPath);
      let nextManifest = manifest;
      let shouldWrite = false;

      if (!nextManifest.scenePlan) {
        const scenePlanCandidates = [
          createEpisodePathResolver(
            path.dirname(episodeDir)
          ).canonicalScenesPath(normalizeEpisodeId(path.basename(episodeDir))),
          path.join(episodeDir, "scenes.json"),
          path.join(episodeDir, "output", "scenes.json"),
        ];
        const scenePlanPath = (
          await Promise.all(
            scenePlanCandidates.map(async (candidate) => ({
              candidate,
              exists: await fileExists(candidate),
            }))
          )
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
  audioInstruction: AudioInstructionArtifact,
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
          instructions: audioInstruction.instructions,
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
  readonly audioInstruction: AudioInstructionArtifact;
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
    instructions: args.audioInstruction.instructions,
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
      await writeJsonAtomic(path.join(promptDir, "index.json"), {
        episodeId: args.episodeSlug,
        language: args.language,
        chunkCount: args.chunks.length,
        generatedAt: args.generatedAt,
        prompts: promptRecords.map((record, index) => ({
          chunkIndex: index + 1,
          sceneId: record.sceneId,
          file: `chunk-${String(index + 1).padStart(3, "0")}.json`,
        })),
      });
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
  const { manifest, episodeDir } = await readManifestForEpisode(
    options,
    episodeId
  );
  const imageStatus = (await summarizeEpisodeImageState(
    episodeDir,
    manifest.scenePlan?.scenes.map((scene) => scene.id) ?? []
  )) as EpisodeImageSummary;
  const locale =
    typeof manifest.transcript?.language === "string"
      ? manifest.transcript.language
      : "en";
  const visualRetention = (await fs
    .readFile(
      path.join(
        episodeDir,
        "state",
        "visual-retention",
        `summary.full.${locale}.json`
      ),
      "utf8"
    )
    .then((value) => JSON.parse(value) as Record<string, unknown>)
    .catch(() => undefined)) as
    | undefined
    | Record<string, unknown>;
  const status = buildEpisodeStatusOutput({
    episodeId: manifest.episodeId,
    slug: manifest.slug,
    pipelineRuns: manifest.pipelineRuns.length,
    imageGeneration: {
      totalBatches: imageStatus.manifestedScenes,
      pendingBatches: imageStatus.plannedScenes - imageStatus.manifestedScenes,
      requiresImportBatches: imageStatus.missingManifests,
      importedBatches: imageStatus.generatedScenes,
      failedBatches: imageStatus.failedScenes,
      mergedWithPreviousScenes: imageStatus.mergeWithPreviousScenes,
      mergedWithNextScenes: imageStatus.mergeWithNextScenes,
      reusedScenes: imageStatus.reusedScenes,
      readyForRender: imageStatus.readyForRender,
      retryableFailedScenes: imageStatus.retryableFailedScenes,
      failureCategories: imageStatus.failureCategories,
      episodeNumbers: [manifest.episodeId],
      sceneCount: manifest.scenePlan?.scenes.length ?? 0,
      ...(visualRetention ? { visualRetention: visualRetention as never } : {}),
    },
  });
  if (options.json) {
    printJson(status);
    return;
  }
  const lines = [
    `${status.episodeId} ${status.slug}`,
    `${status.pipelineRuns} pipeline runs`,
    `images ready: ${imageStatus.readyForRender ? "yes" : "no"}`,
    `images scenes: ${imageStatus.generatedScenes} generated, ${imageStatus.failedScenes} failed, ${imageStatus.missingManifests} missing manifests, ${imageStatus.missingImages} missing images`,
    `images merges: ${imageStatus.mergeWithPreviousScenes} merged with previous, ${imageStatus.mergeWithNextScenes} merged with next, ${imageStatus.reusedScenes} reused`,
  ];
  const visual = status.visualRetention;
  if (visual) {
    const cache = visual["derivedClipCache"] as Record<string, unknown>;
    lines.push(
      `Visual retention: ${String(visual["rolloutMode"])}${visual["fallbackReason"] ? ` (${String(visual["fallbackReason"])})` : ""}`,
      `Validation: ${String(visual["validation"])}`,
      `Source images: ${String(visual["sourceImages"])}`,
      `Rendered shots: ${String(visual["renderedShots"])}`,
      `Shots per image: ${typeof visual["shotsPerImage"] === "number" ? visual["shotsPerImage"].toFixed(2) : "unavailable"}`,
      `Opening changes (first 8s): ${String(visual["openingChangesFirstEightSeconds"])}`,
      `Longest static interval: ${typeof visual["longestStaticIntervalSeconds"] === "number" ? visual["longestStaticIntervalSeconds"].toFixed(2) : "0.00"}s`,
      `Derived cache: ${String(cache["hits"])} hits / ${String(cache["misses"])} misses (${formatPercent(cache["hitRatio"])})`,
      `Avoided image calls: ${String(visual["avoidedImageGenerationCalls"])}`,
      `Estimated image savings: ${formatEstimatedSavings(visual["estimatedImageSavings"] as Record<string, unknown>)}`,
    );
  }
  process.stdout.write(lines.join("\n") + "\n");
}

async function commandInspect(
  options: CliOptions,
  episodeId: string
): Promise<void> {
  const { manifest, episodeDir } = await readManifestForEpisode(
    options,
    episodeId
  );
  const imageStatus = (await summarizeEpisodeImageState(
    episodeDir,
    manifest.scenePlan?.scenes.map((scene) => scene.id) ?? []
  )) as EpisodeImageSummary;
  printJson({
    ...manifest,
    imageGeneration: buildEpisodeImageSummaryOutput(imageStatus),
  });
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
  if (config.narrationPipelineMode === "new") {
    await runAudioNarrationPipeline(options, episodeId, "all", {
      ...(options.json !== undefined ? { json: options.json } : {}),
      ...(options.dryRun !== undefined ? { dryRun: options.dryRun } : {}),
    });
    return;
  }
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
  const narrationDependency = await loadValidatedNarrationDependency(
    episodeDir,
    language
  );
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
  const localizedNarrationChunks = balanceScriptChunksForScenes(
    splitEpisodeScriptMarkdown(narrationDependency.narrationText),
    sceneCount
  );
  const chunks =
    language !== "en"
      ? localizedNarrationChunks
      : sceneChunks.length > 0
        ? sceneChunks
        : rewrittenChunks.length > 0
          ? balanceScriptChunksForScenes(rewrittenChunks, sceneCount)
          : localizedNarrationChunks;
  if (chunks.length === 0) {
    throw new Error(
      `No narration text found in ${narrationDependency.filePath}.`
    );
  }
  const audioDir = path.join(audioBaseDir, "audio");
  const segmentsDir = localizedSegmentsDirFromBase(audioBaseDir);
  const narrationPath = localizedNarrationPathFromBase(audioBaseDir);
  const audioInstructionPath = path.join(audioDir, "audio-instructions.json");
  const ttsGenerationPath = path.join(audioDir, "tts-generation.json");
  const episodeSlug = manifest?.slug ?? episodeId;
  if (options.dryRun) {
    printJson({
      episodeId,
      language,
      scriptPath: narrationDependency.filePath,
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
  const speechVoicePreset: SpeechVoicePreset =
    config.speechVoicePreset ?? episodeConfig?.speechVoicePreset ?? "fast";
  const narrationTempo = resolveNarrationTempoSettings(
    language,
    "full",
    speechVoicePreset
  );
  const speechSettings = loadSpeechVoiceSettings({
    preset: speechVoicePreset,
    ...(language ? { language } : {}),
    artifactType: "full",
    ...(narrationTempo.paceWpm !== undefined
      ? { paceWpm: narrationTempo.paceWpm }
      : {}),
    ...(narrationTempo.speed !== undefined
      ? { speed: narrationTempo.speed }
      : {}),
  });
  await ensureDir(segmentsDir);
  await cleanupStaleAudioTempFiles(audioDir, segmentsDir);
  await cleanupAudioGenerationArtifacts(audioDir, segmentsDir, narrationPath);
  const scriptSourcePath = await writeEpisodeScriptMarkdown(
    audioBaseDir,
    narrationDependency.narrationText,
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
    config.openAiSpeechVoice ?? config.openAiCompatibleTtsVoice ?? DEFAULT_SPEECH_VOICE;
  const audioInstruction = buildAudioInstructionArtifact({
    narration: narrationDependency,
    speechConfig: {
      model,
      voice,
      baseInstructions: speechSettings.instructions,
      ...(speechSettings.speed !== undefined
        ? { speed: speechSettings.speed }
        : {}),
    },
  });
  const voiceConfigFingerprint = computeSpeechVoiceConfigFingerprint({
    voice,
    speed: speechSettings.speed,
  });
  const speechModelConfigFingerprint = computeSpeechModelConfigFingerprint({
    model,
    voice,
    baseInstructions: speechSettings.instructions,
    ...(speechSettings.speed !== undefined
      ? { speed: speechSettings.speed }
      : {}),
  });
  const dependencyFingerprint = computeTtsDependencyFingerprint({
    narrationFingerprint: narrationDependency.narrationFingerprint,
    voiceConfigFingerprint,
    speechModelConfigFingerprint,
    audioInstructionFingerprint: audioInstruction.instructionFingerprint,
  });
  await writeAudioPromptLogs({
    episodeDir,
    episodeSlug,
    language,
    chunks,
    audioInstruction,
    model,
    voice,
    generatedAt,
  });
  try {
    let generated;
    try {
      await writeJsonAtomic(audioInstructionPath, audioInstruction);
      generated = await synthesizeSpeechChunks(
        pipeline,
        chunks,
        speechSettings,
        audioInstruction,
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
      await cleanupAudioGenerationArtifacts(
        audioDir,
        segmentsDir,
        narrationPath
      );
      generated = await synthesizeSpeechChunks(
        pipeline,
        chunks,
        speechSettings,
        audioInstruction,
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
      throw new Error(
        concat.stderr || "Failed to concatenate narration audio."
      );
    }
    const narrationStats = await fs.stat(narrationPath);
    completeArtifacts.push({
      id: artifactIdSchema.parse(
        `artifact-${slugify(`${episodeSlug}-narration-${language}`)}`
      ),
      kind:
        language === "en" ? "audio.narration" : `audio.narration.${language}`,
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
      await writeJsonAtomic(episodeManifestPath(episodeDir), manifest);
    }
    await writeJsonAtomic(path.join(audioDir, "generation-report.json"), {
      episodeId,
      slug: episodeSlug,
      language,
      scriptPath: narrationDependency.filePath,
      narrationPath,
      segmentsDir,
      segmentCount: chunks.length,
      narrationFingerprint: narrationDependency.narrationFingerprint,
      dependencyFingerprint,
      audioInstructionPath,
      generatedAt,
    });
    const ttsGenerationRecord: TtsGenerationRecord = {
      schemaVersion: "tts-generation-record-v1",
      owner: "audio",
      status: "completed",
      episodeSlug,
      language,
      variant: narrationDependency.variant,
      narrationFingerprint: narrationDependency.narrationFingerprint,
      voiceConfigFingerprint,
      speechModelConfigFingerprint,
      audioInstructionFingerprint: audioInstruction.instructionFingerprint,
      dependencyFingerprint,
      narrationPath,
      segmentCount: chunks.length,
      generatedAt,
    };
    await writeJsonAtomic(ttsGenerationPath, ttsGenerationRecord);
    if (options.json) {
      printJson({
        episodeId,
        language,
        scriptPath: narrationDependency.filePath,
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
  } catch (error) {
    await writeJsonAtomic(ttsGenerationPath, {
      schemaVersion: "tts-generation-record-v1",
      owner: "audio",
      status: "failed",
      episodeSlug,
      language,
      variant: narrationDependency.variant,
      narrationFingerprint: narrationDependency.narrationFingerprint,
      voiceConfigFingerprint,
      speechModelConfigFingerprint,
      audioInstructionFingerprint: audioInstruction.instructionFingerprint,
      dependencyFingerprint,
      segmentCount: 0,
      generatedAt,
      failureMessage: error instanceof Error ? error.message : String(error),
    } satisfies TtsGenerationRecord);
    throw error;
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
      audioDir: localizedSegmentsDirFromBase(audioBaseDir),
      clipsDir: path.join(
        audioBaseDir,
        "renders",
        localizedClipsDirName(language)
      ),
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
      sceneAudioDir: localizedSegmentsDirFromBase(audioBaseDir),
      imageDir: canonicalGeneratedImagesDir(episodeDir),
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
  const initialConfig = await loadRuntimeConfig(
    configOverridesFromCli(options)
  );
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
    sceneAudioDir: localizedSegmentsDirFromBase(audioBaseDir),
    imageDir: canonicalGeneratedImagesDir(episodeRootDir),
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
  const { manifest, episodeDir } = await readManifestForEpisode(
    options,
    episodeId
  );
  const scene = manifest.scenePlan?.scenes.find((item) => item.id === sceneId);
  if (!scene) {
    throw new Error(`Scene not found: ${sceneId}`);
  }
  const visualPlan = await loadEpisodeSceneVisualPlan(episodeDir, sceneId);
  printJson(buildSceneInspectOutput(scene, visualPlan));
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
      `Exported scene workbook to ${path.join(episodeDir, "state", "image-generation", "scene-workbook.html")}\n`
    );
  }
}

async function commandImagesOpenOpenArt(
  options: CliOptions,
  episodeId: string
): Promise<void> {
  const { episodeDir } = await readManifestForEpisode(options, episodeId);
  const workbook = path.join(
    episodeDir,
    "state",
    "image-generation",
    "scene-workbook.html"
  );
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

async function commandImagesStatus(
  options: CliOptions,
  episodeId: string
): Promise<void> {
  const { manifest, episodeDir } = await readManifestForEpisode(
    options,
    episodeId
  );
  const report = (await summarizeEpisodeImageState(
    episodeDir,
    manifest.scenePlan?.scenes.map((scene) => scene.id) ?? []
  )) as EpisodeImageSummary;
  const locale =
    typeof manifest.transcript?.language === "string"
      ? manifest.transcript.language
      : "en";
  const visualRetention = (await fs
    .readFile(
      path.join(
        episodeDir,
        "state",
        "visual-retention",
        `summary.full.${locale}.json`
      ),
      "utf8"
    )
    .then((value) => JSON.parse(value) as Record<string, unknown>)
    .catch(() => undefined)) as
    | undefined
    | Record<string, unknown>;
  printJson(
    buildImageStatusOutput({
      totalBatches: report.manifestedScenes,
      pendingBatches: report.plannedScenes - report.manifestedScenes,
      requiresImportBatches: report.missingManifests,
      importedBatches: report.generatedScenes,
      failedBatches: report.failedScenes,
      mergedWithPreviousScenes: report.mergeWithPreviousScenes,
      mergedWithNextScenes: report.mergeWithNextScenes,
      reusedScenes: report.reusedScenes,
      readyForRender: report.readyForRender,
      retryableFailedScenes: report.retryableFailedScenes,
      failureCategories: report.failureCategories,
      episodeNumbers: [manifest.episodeId],
      sceneCount: manifest.scenePlan?.scenes.length ?? 0,
      ...(visualRetention ? { visualRetention: visualRetention as never } : {}),
    })
  );
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
    const variant = profile === "vertical" ? "short" : "full";
    printJson({
      episodeId,
      language,
      locale: language === "en" ? "en-US" : language,
      variant,
      parentFingerprint: `dry-run:${episodeId}:${language}:${variant}:narration`,
      selectedRenderProfile: profile,
      stageReuseDecision: "dry-run-no-render",
      clipsDir: path.join(
        audioBaseDir,
        "renders",
        localizedClipsDirName(language)
      ),
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
  const variant: "full" | "short" = profile === "vertical" ? "short" : "full";
  const mediaContext: NonNullable<VideoRenderRequest["mediaContext"]> = {
    identity: {
      episodeId,
      language,
      locale: language === "en" ? "en-US" : language,
      variant,
      owner: "render",
    },
    narration: {
      owner: "narration",
      episodeId,
      language,
      locale: language === "en" ? "en-US" : language,
      variant,
      fingerprint: `cli:${episodeId}:${language}:${profile}:narration`,
      status: "ready",
    },
    ...(profile === "vertical"
      ? {
          shortMediaRequirements: {
            aspectRatio: "9:16" as const,
            durationSeconds:
              manifest.scenePlan.scenes[manifest.scenePlan.scenes.length - 1]
                ?.timing.endSeconds,
            safeVerticalComposition: true,
            focalSubjectPlacement: "center third",
            textSafeArea: "top and bottom 12 percent",
          },
        }
      : {}),
  };
  const renderRequest: VideoRenderRequest = {
    episodeDir,
    scenePlan: manifest.scenePlan,
    outputDir: path.join(audioBaseDir, "renders", profile),
    clipsOutputDir: path.join(audioBaseDir, "renders"),
    renderProfile,
    captionBurnIn: Boolean(captionsPath),
    clipsDirName: localizedClipsDirName(language),
    sceneAudioDir: localizedSegmentsDirFromBase(audioBaseDir),
    imageDir: canonicalGeneratedImagesDir(episodeDir),
    outputSuffix: localizedOutputSuffix(language),
    trailingSilenceRatio: config.trailingSilenceRatio,
    trailingSilenceBufferSeconds: config.trailingSilenceBufferSeconds,
    mediaContext,
    ...(captionsPath ? { captionsPath } : {}),
  };
  const result = await pipeline.renderer.render(
    renderRequest,
    new AbortController().signal
  );
  printJson(result);
}

function parseAudioLanguageList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  const languages: string[] = [];
  for (const rawEntry of value.split(",")) {
    const entry = normalizeWhitespace(rawEntry).toLowerCase();
    if (entry.length === 0) {
      continue;
    }
    if (!languages.includes(entry)) {
      languages.push(entry);
    }
  }
  return languages;
}

interface AudioNarrationCommandOptions {
  readonly episode?: string;
  readonly language?: string;
  readonly languages?: string;
  readonly variant?: "full" | "short";
  readonly allLanguages?: boolean;
  readonly allVariants?: boolean;
  readonly resume?: boolean;
  readonly force?: boolean;
  readonly validationOnly?: boolean;
  readonly dryRun?: boolean;
  readonly strict?: boolean;
  readonly json?: boolean;
  readonly concurrency?: string;
}

interface VoiceBenchmarkCommandOptions {
  readonly voices?: string;
  readonly maxSamples?: string;
  readonly language?: string;
  readonly variant?: "full" | "short";
  readonly outputDir?: string;
  readonly benchmarkLabelMode?: "anonymous" | "voice";
  readonly json?: boolean;
}

function parseNarrationVariant(value: string | undefined): "full" | "short" {
  if (value === undefined) {
    return "full";
  }
  if (value === "full" || value === "short") {
    return value;
  }
  throw new Error("--variant must be full or short.");
}

function parseNarrationConcurrency(value: string | undefined): number {
  return parsePositiveIntegerOption(value, "--concurrency", 1);
}

function ensureNarrationPipelineMode(value: string | undefined): NarrationPipelineMode {
  return narrationPipelineModeSchema.parse(value ?? "legacy");
}

function normalizeRequestedNarrationLanguages(
  values: readonly string[],
  availableLanguages: readonly string[],
  options: { readonly requireAvailable: boolean }
): string[] {
  const normalized = values.map((language) => normalizeLocaleCode(language));
  const unique = normalized.filter(
    (language, index, all) => all.indexOf(language) === index
  );
  if (options.requireAvailable) {
    const missing = unique.filter((language) => !availableLanguages.includes(language));
    if (missing.length > 0) {
      throw new Error(
        `Requested narration language(s) are not available for this episode: ${missing.join(", ")}.`
      );
    }
  }
  return unique;
}

function summarizeNarrationBatchStatus(status: NarrationBatchStatus): string {
  const lines = [
    `Narration targets: ${status.summary.total} total, ${status.summary.success} success, ${status.summary.warning} warning, ${status.summary.blocked} blocked, ${status.summary.failed} failed`,
    ...status.targets.map((target) => {
      const latest =
        target.latestStage && target.latestStageStatus
          ? ` ${target.latestStage}:${target.latestStageStatus}`
          : "";
      const failure = target.failureClass ? ` ${target.failureClass}` : "";
      const message = target.message ? ` - ${target.message}` : "";
      return `${target.episodeId} ${target.language}/${target.variant} ${target.rolloutMode} ${target.outcome}${latest}${failure}${message}`;
    }),
  ];
  return `${lines.join("\n")}\n`;
}

async function runAudioNarrationPipeline(
  options: CliOptions,
  episodeId: string,
  stage: NarrationPipelineStage,
  commandOptions: AudioNarrationCommandOptions = {}
): Promise<NarrationPipelineResult[]> {
  markEpisodeTelemetry(episodeId);
  const resolved = await readEpisodeWorkspaceForAudio(options, episodeId);
  const { episodeDir } = resolved;
  const episodeConfig = await loadEpisodeConfig(episodeDir);
  const config = await loadRuntimeConfig(
    configOverridesFromCli(options),
    episodeConfig ? compactConfigOverrides(episodeConfig) : {}
  );
  const rolloutMode = ensureNarrationPipelineMode(config.narrationPipelineMode);
  const availableLanguages = await listEpisodeScriptLanguages(episodeDir);
  const requestedLanguages = [
    ...parseAudioLanguageList(commandOptions.languages),
    ...(commandOptions.language ? [commandOptions.language] : []),
    ...(options.scriptLanguage ? [options.scriptLanguage] : []),
  ].filter((language, index, all) => all.indexOf(language) === index);
  const languages = normalizeRequestedNarrationLanguages(
    commandOptions.allLanguages
      ? availableLanguages
      : requestedLanguages.length > 0
        ? requestedLanguages
        : [config.scriptLanguage ?? episodeConfig?.scriptLanguage ?? "en"],
    availableLanguages,
    { requireAvailable: stage !== "status" && stage !== "inspect" }
  );
  if (languages.length === 0) {
    throw new Error(`No narration languages found in ${episodeDir}.`);
  }
  const variants = commandOptions.allVariants
    ? (["full", "short"] as const)
    : ([parseNarrationVariant(commandOptions.variant)] as const);
  const speechVoicePreset: SpeechVoicePreset =
    config.speechVoicePreset ?? episodeConfig?.speechVoicePreset ?? "fast";
  const model =
    config.openAiSpeechModel ??
    config.openAiCompatibleModel ??
    "gpt-4o-mini-tts";
  const voice =
    config.openAiSpeechVoice ?? config.openAiCompatibleTtsVoice ?? DEFAULT_SPEECH_VOICE;
  let loadedPipeline: Awaited<ReturnType<typeof loadPipeline>> | null = null;
  const loadTargetPipeline = async () => {
    loadedPipeline ??= await loadPipeline(options, episodeDir);
    return loadedPipeline;
  };
  const runner = new NarrationPipeline();
  const results: NarrationPipelineResult[] = [];
  const targetStatuses: NarrationTargetStatus[] = [];
  for (const language of languages) {
    for (const variant of variants) {
      const targetStartedAt = Date.now();
      const target = {
        episodeId,
        language,
        locale: normalizeLocaleCode(language),
        variant,
        rolloutMode,
      };
      const narrationTempo = resolveNarrationTempoSettings(
        language,
        variant,
        speechVoicePreset
      );
      const speechSettings = loadSpeechVoiceSettings({
        preset: speechVoicePreset,
        ...(language ? { language } : {}),
        artifactType: variant,
        ...(narrationTempo.paceWpm !== undefined
          ? { paceWpm: narrationTempo.paceWpm }
          : {}),
        ...(narrationTempo.speed !== undefined
          ? { speed: narrationTempo.speed }
          : {}),
      });
      try {
        const result = await runner.run({
          episodeDir,
          episodeId,
          language,
          variant,
          stage,
          rolloutMode,
          ...(commandOptions.resume !== undefined ? { resume: commandOptions.resume } : {}),
          ...(commandOptions.force !== undefined ? { force: commandOptions.force } : {}),
          ...(commandOptions.dryRun ?? options.dryRun
            ? { dryRun: commandOptions.dryRun ?? options.dryRun }
            : {}),
          ...(commandOptions.validationOnly !== undefined
            ? { validationOnly: commandOptions.validationOnly }
            : {}),
          concurrency: parseNarrationConcurrency(commandOptions.concurrency),
          model,
          voice,
          ...(speechSettings.speed !== undefined ? { speed: speechSettings.speed } : {}),
          outputFormat: "wav",
          baseVoiceInstructions: speechSettings.instructions,
          synthesizeChunk: async (request) => {
            const pipeline = await loadTargetPipeline();
            const idMatch = request.chunkId.match(/([0-9]+)$/u);
            const sceneNumber = idMatch?.[1] ?? "001";
            await pipeline.speech.synthesize(
              {
                sceneId: sceneIdSchema.parse(`scene-${sceneNumber.padStart(3, "0")}`),
                text: request.text,
                voiceProfile: speechSettings.profile,
                outputPath: request.outputPath,
                ...(request.targetDurationSeconds !== undefined
                  ? { targetDurationSeconds: request.targetDurationSeconds }
                  : {}),
                instructions: request.instructions,
              },
              new AbortController().signal
            );
          },
        });
        results.push(result);
        targetStatuses.push(
          buildNarrationTargetStatusFromResult(
            result,
            Math.max(0, Date.now() - targetStartedAt)
          )
        );
      } catch (error) {
        targetStatuses.push(
          buildNarrationTargetStatusFromError({
            target,
            error,
            durationMs: Math.max(0, Date.now() - targetStartedAt),
          })
        );
      }
    }
  }
  const batchStatus = buildNarrationBatchStatus({
    targets: targetStatuses,
    strictMode: commandOptions.strict ?? false,
  });
  if (commandOptions.json ?? options.json) {
    printJson(batchStatus);
  } else if (!options.quiet) {
    process.stdout.write(summarizeNarrationBatchStatus(batchStatus));
  }
  if (batchStatus.exitCode !== narrationPipelineExitCode.ok) {
    process.exitCode = batchStatus.exitCode;
  }
  return results;
}

function parseVoiceList(value: string | undefined): readonly string[] | undefined {
  if (!value) {
    return undefined;
  }
  const voices = value.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
  return voices.length > 0 ? voices : undefined;
}

function parseBenchmarkLabelMode(value: string | undefined): "anonymous" | "voice" {
  if (value === undefined || value === "anonymous") {
    return "anonymous";
  }
  if (value === "voice") {
    return "voice";
  }
  throw new Error("--benchmark-label-mode must be anonymous or voice.");
}

async function commandAudioNarrationBenchmarkVoices(
  options: CliOptions,
  commandOptions: VoiceBenchmarkCommandOptions
): Promise<void> {
  const config = await loadRuntimeConfig(configOverridesFromCli(options));
  if (config.ttsProvider !== "openai-compatible") {
    throw new Error("Voice benchmarking requires --tts-provider openai-compatible.");
  }
  const pipeline = await loadPipeline(options);
  const language = commandOptions.language ?? options.scriptLanguage ?? config.scriptLanguage ?? "en";
  const variant = parseNarrationVariant(commandOptions.variant);
  const outputDir = path.resolve(
    commandOptions.outputDir ?? path.join(config.workspaceDir, "state", "voice-benchmarks", language, variant)
  );
  const voices = parseVoiceList(commandOptions.voices);
  const result = await runVoiceBenchmark({
    outputDir,
    provider: pipeline.speech,
    ...(voices ? { voices } : {}),
    maxSamples: parsePositiveIntegerOption(commandOptions.maxSamples, "--max-samples", 4),
    labelMode: parseBenchmarkLabelMode(commandOptions.benchmarkLabelMode),
    model: config.openAiSpeechModel ?? config.openAiCompatibleModel ?? "gpt-4o-mini-tts",
    language,
    variant,
    ...(config.speechVoicePreset ? { preset: config.speechVoicePreset } : {}),
  });
  if (commandOptions.json ?? options.json) {
    printJson(result);
    return;
  }
  process.stdout.write(
    [
      `Voice benchmark: ${path.join(outputDir, "voice-benchmark.json")}`,
      `Samples: ${result.samples.length}`,
      `Completed: ${result.samples.filter((sample) => sample.status === "completed").length}`,
      `Failed: ${result.samples.filter((sample) => sample.status === "failed").length}`,
    ].join("\n") + "\n"
  );
}

async function commandAudioGenerateLocalized(
  options: CliOptions & { readonly languages?: string; readonly strict?: boolean },
  episodeId: string
): Promise<void> {
  markEpisodeTelemetry(episodeId);
  const resolved = await readEpisodeWorkspaceForAudio(options, episodeId);
  const availableLanguages = await listEpisodeScriptLanguages(
    resolved.episodeDir
  );
  const requestedLanguages = parseAudioLanguageList(options.languages);
  const selectedLanguages =
    requestedLanguages.length > 0
      ? requestedLanguages
      : availableLanguages.filter((language) => language !== "en");
  if (selectedLanguages.length === 0) {
    throw new Error(`No localized scripts found in ${resolved.episodeDir}.`);
  }
  const languages = normalizeRequestedNarrationLanguages(
    selectedLanguages,
    availableLanguages,
    { requireAvailable: true }
  );
  const episodeConfig = await loadEpisodeConfig(resolved.episodeDir);
  const config = await loadRuntimeConfig(
    configOverridesFromCli(options),
    episodeConfig ? compactConfigOverrides(episodeConfig) : {}
  );
  const rolloutMode = ensureNarrationPipelineMode(config.narrationPipelineMode);
  if (rolloutMode === "new") {
    await runAudioNarrationPipeline(options, episodeId, "all", {
      languages: languages.join(","),
      ...(options.dryRun !== undefined ? { dryRun: options.dryRun } : {}),
      ...(options.json !== undefined ? { json: options.json } : {}),
      ...(options.strict !== undefined ? { strict: options.strict } : {}),
    });
    return;
  }
  const targetStatuses: NarrationTargetStatus[] = [];
  for (const language of languages) {
    const targetStartedAt = Date.now();
    const target = {
      episodeId,
      language,
      locale: normalizeLocaleCode(language),
      variant: "full" as const,
      rolloutMode,
    };
    try {
      await commandAudioGenerate(
        { ...options, json: false, quiet: true, scriptLanguage: language },
        episodeId
      );
      targetStatuses.push(
        buildNarrationTargetStatus({
          target,
          outcome: "success",
          durationMs: Math.max(0, Date.now() - targetStartedAt),
        })
      );
    } catch (error) {
      targetStatuses.push(
        buildNarrationTargetStatusFromError({
          target,
          error,
          durationMs: Math.max(0, Date.now() - targetStartedAt),
        })
      );
    }
  }
  const batchStatus = buildNarrationBatchStatus({
    targets: targetStatuses,
    strictMode: options.strict ?? false,
  });
  if (options.json) {
    printJson(batchStatus);
  } else if (!options.quiet) {
    process.stdout.write(summarizeNarrationBatchStatus(batchStatus));
  }
  if (batchStatus.exitCode !== narrationPipelineExitCode.ok) {
    process.exitCode = batchStatus.exitCode;
  }
}

async function commandRenderRemoteCheck(options: CliOptions): Promise<void> {
  const config = await loadRuntimeConfig(configOverridesFromCli(options));
  const remote = buildRemoteRenderSettings(config);
  if (!remote.enabled) {
    process.stdout.write("Remote rendering is disabled.\n");
    return;
  }
  const result = spawnRemoteCommand(remote, [
    "bash",
    "-lc",
    buildRemoteRenderShellScript("check"),
    "--",
    remote.baseDir,
  ]);
  if (result.status !== 0) {
    throw new Error(spawnSyncStderr(result) || "Remote preflight failed.");
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
  const result = spawnRemoteCommand(remote, [
    "bash",
    "-lc",
    buildRemoteRenderShellScript("cleanup"),
    "--",
    remote.baseDir,
    String(cutoffMinutes),
  ]);
  if (result.status !== 0) {
    throw new Error(spawnSyncStderr(result) || "Remote cleanup failed.");
  }
  process.stdout.write(
    `Cleaned remote jobs older than ${remote.cleanupMaxAgeHours}h.\n`
  );
}

async function commandRenderRemoteVerify(options: CliOptions): Promise<void> {
  const config = await loadRuntimeConfig(configOverridesFromCli(options));
  const remote = buildRemoteRenderSettings(config);
  if (!remote.enabled) {
    throw new Error(
      "REMOTE_RENDER_ENABLED must be true for the remote render verify command."
    );
  }
  const tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "mediaforge-remote-verify-")
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
        visualPurpose: "local render verify",
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
        visualPurpose: "remote render verify",
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
  const clipManifests = await Promise.all(
    scenePlan.scenes.map(async (scene) => {
      const manifestPath = path.join(result.clipsDir, `${scene.id}.json`);
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
        renderer?: "local" | "remote";
      };
      const expectedRenderer = scene.id === "scene-002" ? "remote" : "local";
      return {
        clipId: scene.id,
        expectedRenderer,
        renderer: manifest.renderer ?? "local",
        fallbackUsed:
          expectedRenderer === "remote" &&
          (manifest.renderer ?? "local") !== "remote",
      };
    })
  );
  const payload = {
    ok:
      outputs.every((output) => output.validation.valid) &&
      clipManifests.some(
        (clip) => clip.renderer === "remote" && clip.fallbackUsed === false
      ) &&
      clipManifests.every((clip) => clip.fallbackUsed === false),
    episodeDir,
    remoteEnabled: remote.enabled,
    sceneClips: clipManifests,
    outputs,
  };
  if (options.json) {
    printJson(payload);
  } else {
    process.stdout.write(
      [
        `Remote render verify ${payload.ok ? "passed" : "failed"}.`,
        ...payload.sceneClips.map(
          (clip) =>
            `${clip.clipId}: renderer=${clip.renderer} fallback=${clip.fallbackUsed ? "yes" : "no"}`
        ),
      ].join("\n") + "\n"
    );
  }
  if (!payload.ok) {
    const error = new Error("Remote render verify failed.");
    (
      error as Error & {
        verify?: typeof payload;
      }
    ).verify = payload;
    throw error;
  }
}

async function commandRenderRemoteStatus(
  options: CliOptions,
  statusOptions: RemoteStatusOptions
): Promise<void> {
  const config = await loadRuntimeConfig(configOverridesFromCli(options));
  const remote = buildRemoteRenderSettings(config);
  if (!remote.enabled) {
    if (options.json) {
      printJson({ enabled: false, jobs: [] });
    } else {
      process.stdout.write("Remote rendering is disabled.\n");
    }
    return;
  }
  const limit = parsePositiveIntegerOption(statusOptions.limit, "limit", 10);
  const tail = parsePositiveIntegerOption(statusOptions.tail, "tail", 40);
  const result = spawnRemoteCommand(remote, [
    "node",
    "-e",
    buildRemoteInspectNodeScript(),
    "status",
    remote.baseDir,
    statusOptions.job ?? "",
    String(limit),
    statusOptions.includeLogs ? "true" : "false",
    String(tail),
    statusOptions.all ? "true" : "false",
  ]);
  if (result.status !== 0) {
    throw new Error(
      spawnSyncStderr(result) || "Remote status inspection failed."
    );
  }
  const jobs = parseRemoteStatusResponse(spawnSyncStdout(result));
  if (options.json) {
    printJson({ enabled: true, jobs });
    return;
  }
  process.stdout.write(formatRemoteStatusSummary(jobs));
}

async function commandRenderRemoteLogs(
  options: CliOptions,
  jobId: string,
  logOptions: RemoteLogsOptions
): Promise<void> {
  const config = await loadRuntimeConfig(configOverridesFromCli(options));
  const remote = buildRemoteRenderSettings(config);
  if (!remote.enabled) {
    throw new Error("REMOTE_RENDER_ENABLED must be true for remote logs.");
  }
  const tail = parsePositiveIntegerOption(logOptions.tail, "tail", 40);
  const result = spawnRemoteCommand(remote, [
    "node",
    "-e",
    buildRemoteInspectNodeScript(),
    "logs",
    remote.baseDir,
    jobId,
    logOptions.clip ?? "",
    String(tail),
  ]);
  if (result.status !== 0) {
    throw new Error(
      spawnSyncStderr(result) || `Failed to fetch logs for ${jobId}.`
    );
  }
  const payload = JSON.parse(spawnSyncStdout(result)) as {
    jobId: string;
    entries: RawRemoteLogEntry[];
  };
  if (options.json) {
    printJson(payload);
    return;
  }
  process.stdout.write(formatRemoteLogOutput(payload.jobId, payload.entries));
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
  const narration = await loadValidatedNarrationDependency(
    episodeDir,
    language
  );
  const generationOptions: Omit<YoutubeMetadataGenerationOptions, "baseUrl"> & {
    baseUrl?: string;
  } = {
    apiKey:
      config.openAiCompatibleApiKey ?? process.env["OPENAI_API_KEY"] ?? "",
    model: config.openAiMetadataModel ?? "gpt-5.4-mini",
    reasoningEffort: config.openAiMetadataReasoningEffort,
    maxOutputTokens: config.openAiMetadataMaxOutputTokens ?? 3000,
    repairModel:
      config.openAiValidatorModel ??
      config.openAiMetadataModel ??
      "gpt-5.4-mini",
    repairReasoningEffort:
      config.openAiValidatorReasoningEffort ??
      config.openAiMetadataReasoningEffort,
    repairMaxOutputTokens:
      config.openAiValidatorMaxOutputTokens ??
      config.openAiMetadataMaxOutputTokens,
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
      parentNarrationFingerprint: narration.narrationFingerprint,
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
      locale: narration.locale,
      variant: narration.variant,
      narration: {
        episodeNumber: narration.episodeNumber,
        episodeSlug: narration.episodeSlug,
        language: narration.language,
        locale: narration.locale,
        variant: narration.variant,
        narrationText: narration.narrationText,
        narrationFingerprint: narration.narrationFingerprint,
      },
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
  await writeJsonAtomic(episodeManifestPath(episodeDir), manifest);
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
  readonly parentNarrationFingerprint?: string;
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
        const narration = await loadValidatedNarrationDependency(
          targetData.episodeDir,
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
          parentNarrationFingerprint: narration.narrationFingerprint,
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
        reasoningEffort: config.openAiMetadataReasoningEffort,
        maxOutputTokens: config.openAiMetadataMaxOutputTokens,
        repairModel:
          config.openAiValidatorModel ??
          config.openAiMetadataModel ??
          "gpt-5.4-mini",
        repairReasoningEffort:
          config.openAiValidatorReasoningEffort ??
          config.openAiMetadataReasoningEffort,
        repairMaxOutputTokens:
          config.openAiValidatorMaxOutputTokens ??
          config.openAiMetadataMaxOutputTokens,
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
      const targetData = await readAndValidateScenesFile(
        target.sourceFilePath,
        language
      );
      const narration = await loadValidatedNarrationDependency(
        targetData.episodeDir,
        language
      );
      const generation = await generateYoutubeMetadataForTarget(
        {
          ...targetData,
          locale: narration.locale,
          variant: narration.variant,
          narration: {
            episodeNumber: narration.episodeNumber,
            episodeSlug: narration.episodeSlug,
            language: narration.language,
            locale: narration.locale,
            variant: narration.variant,
            narrationText: narration.narrationText,
            narrationFingerprint: narration.narrationFingerprint,
          },
        },
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

function inferThumbnailFormatFromVideoPath(
  videoPath: string
): "full" | "short" {
  return /(?:^|[\\/])vertical(?:[\\/]|$)|9x16/u.test(videoPath)
    ? "short"
    : "full";
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
      reasoningEffort: config.openAiMetadataReasoningEffort,
      maxOutputTokens: config.openAiMetadataMaxOutputTokens,
      repairModel:
        config.openAiValidatorModel ??
        config.openAiMetadataModel ??
        "gpt-5.4-mini",
      repairReasoningEffort:
        config.openAiValidatorReasoningEffort ??
        config.openAiMetadataReasoningEffort,
      repairMaxOutputTokens:
        config.openAiValidatorMaxOutputTokens ??
        config.openAiMetadataMaxOutputTokens,
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
  let effectiveGenerateMetadata = uploadOptions.generateMetadata;
  let effectiveMetadataPath = uploadOptions.metadataPath;
  let effectiveThumbnailPath = uploadOptions.thumbnailPath;
  if (!effectiveThumbnailPath) {
    let resolvedUploadInputs;
    const uploadResolutionOverrides = {
      languageHint: uploadLanguage,
      ...(uploadOptions.videoPath
        ? { videoPath: uploadOptions.videoPath }
        : {}),
      thumbnailPath: path.join(
        episodeDir,
        ".thumbnail-resolution-placeholder.png"
      ),
    } as YoutubeUploadOverrides;
    if (uploadOptions.generateMetadata) {
      if (!metadataGeneration) {
        throw new Error(
          "--generate-metadata requires metadata generation settings."
        );
      }
      const scenesFilePath = await findEpisodeScenesFile(
        config.workspaceDir,
        uploadOptions.episode
      );
      const generatedMetadata = await generateYoutubeMetadataFromScenesFile(
        scenesFilePath,
        {
          apiKey: metadataGeneration.apiKey,
          model: metadataGeneration.model,
          reasoningEffort: metadataGeneration.reasoningEffort,
          maxOutputTokens: metadataGeneration.maxOutputTokens,
          repairModel: metadataGeneration.repairModel,
          repairReasoningEffort: metadataGeneration.repairReasoningEffort,
          repairMaxOutputTokens: metadataGeneration.repairMaxOutputTokens,
          language: uploadLanguage,
          promptText: metadataGeneration.promptText,
          maxRetries: metadataGeneration.maxRetries,
          timeoutMs: metadataGeneration.timeoutMs,
          keepFile: metadataGeneration.keepFile,
          ...(metadataGeneration.baseUrl
            ? { baseUrl: metadataGeneration.baseUrl }
            : {}),
        }
      );
      effectiveGenerateMetadata = false;
      effectiveMetadataPath = generatedMetadata.outputs.jsonPath;
      resolvedUploadInputs = await generateUploadMetadataForEpisode(
        episodeDir,
        uploadOptions.episode,
        uploadResolutionOverrides,
        effectiveMetadataPath
      );
    } else {
      resolvedUploadInputs = await generateUploadMetadataForEpisode(
        episodeDir,
        uploadOptions.episode,
        uploadResolutionOverrides,
        effectiveMetadataPath
      );
    }
    effectiveThumbnailPath = await resolveUploadThumbnailPath({
      workspaceRoot: config.workspaceDir,
      episodeDir,
      resolvedUpload: {
        metadata: resolvedUploadInputs.metadata,
        resolvedLanguage: resolvedUploadInputs.metadata.source.language,
        resolvedVariant: inferThumbnailFormatFromVideoPath(
          resolvedUploadInputs.resolvedVideoPath
        ),
      },
      ...(uploadOptions.force !== undefined
        ? { force: uploadOptions.force }
        : {}),
    });
  }
  const result = await uploadYoutubeEpisode({
    workspaceDir: config.workspaceDir,
    episodeId: uploadOptions.episode,
    episodeDir,
    auth,
    force: uploadOptions.force,
    generateMetadata: effectiveGenerateMetadata,
    metadataPath: effectiveMetadataPath,
    overrides: {
      languageHint: uploadLanguage,
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
      ...(effectiveThumbnailPath
        ? { thumbnailPath: effectiveThumbnailPath }
        : {}),
    } as YoutubeUploadOverrides,
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
    .option(
      "--narration-pipeline-mode <legacy|shadow|new>",
      "staged narration rollout mode"
    )
    .option(
      "--speech-voice-preset <preset>",
      "slow, fast, or very-fast speech settings"
    )
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
audioCommand
  .command("generate-localized")
  .description(
    "Generate audio for every localized script available in the episode workspace"
  )
  .argument("<episode-id>")
  .option("--languages <comma-separated-languages>", "target languages")
  .option("--dry-run", "preview actions without writing")
  .option("--strict", "return a strict warning exit code when warnings are present")
  .action(
    async (
      episodeId: string,
      opts: { languages?: string; dryRun?: boolean; strict?: boolean }
    ) => {
      const cliOptions: CliOptions & { readonly languages?: string; readonly strict?: boolean } = {
        ...program.opts<CliOptions>(),
        ...(opts.dryRun !== undefined ? { dryRun: opts.dryRun } : {}),
        ...(opts.languages !== undefined ? { languages: opts.languages } : {}),
        ...(opts.strict !== undefined ? { strict: opts.strict } : {}),
      };
      await commandAudioGenerateLocalized(cliOptions, episodeId);
    }
  );

const audioNarrationCommand = audioCommand
  .command("narration")
  .description("Staged narration pipeline utilities");

function addAudioNarrationOptions(command: Command): Command {
  return command
    .requiredOption("--episode <episode-id>", "episode slug or id")
    .option("--language <code>", "target language")
    .option("--languages <comma-separated-languages>", "target languages")
    .option("--variant <full|short>", "narration variant", "full")
    .option("--all-languages", "run all script languages found for the episode")
    .option("--all-variants", "run full and short variants")
    .option("--resume", "reuse completed artifacts when valid")
    .option("--force", "rerun completed stages")
    .option("--validation-only", "skip mutation stages and validate existing artifacts")
    .option("--dry-run", "print planned work without writing")
    .option("--strict", "return a strict warning exit code when warnings are present")
    .option("--concurrency <n>", "maximum local narration chunk concurrency", "1")
    .option("--json", "print machine-readable output");
}

for (const stage of [
  "prepare",
  "plan",
  "generate",
  "assemble",
  "validate",
  "status",
  "inspect",
] as const satisfies readonly NarrationPipelineStage[]) {
  addAudioNarrationOptions(
    audioNarrationCommand.command(stage).description(`Run narration ${stage}`)
  ).action(async (opts: AudioNarrationCommandOptions) => {
    const parsedStage = narrationPipelineStageSchema.parse(stage);
    const cliOptions: CliOptions = {
      ...program.opts<CliOptions>(),
      ...(opts.dryRun !== undefined ? { dryRun: opts.dryRun } : {}),
      ...(opts.json !== undefined ? { json: opts.json } : {}),
    };
    await runAudioNarrationPipeline(cliOptions, opts.episode ?? "", parsedStage, opts);
  });
}

audioNarrationCommand
  .command("benchmark-voices")
  .description("Generate anonymized OpenAI voice benchmark samples")
  .option("--voices <comma-separated-voices>", "OpenAI voices to benchmark")
  .option("--max-samples <n>", "maximum samples to generate", "4")
  .option("--language <code>", "benchmark language")
  .option("--variant <full|short>", "narration variant", "full")
  .option("--output-dir <path>", "benchmark artifact directory")
  .option("--benchmark-label-mode <anonymous|voice>", "sample label mode", "anonymous")
  .option("--json", "print machine-readable output")
  .action(async (opts: VoiceBenchmarkCommandOptions) => {
    const cliOptions: CliOptions = {
      ...program.opts<CliOptions>(),
      ...(opts.json !== undefined ? { json: opts.json } : {}),
    };
    await commandAudioNarrationBenchmarkVoices(cliOptions, opts);
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
registerImagesResumeCommand(imagesCommand);
registerImagesSyncSharedCommand(imagesCommand);
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
  .command("status")
  .argument("<episode-id>")
  .description("Show image generation readiness")
  .action(async (episodeId: string) => {
    await commandImagesStatus(program.opts<CliOptions>(), episodeId);
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
    await commandRenderRemoteVerify(program.opts<CliOptions>());
  });
renderRemoteCommand
  .command("verify")
  .description("Run a deterministic end-to-end remote render verification")
  .action(async () => {
    await commandRenderRemoteVerify(program.opts<CliOptions>());
  });
renderRemoteCommand
  .command("status")
  .description("Inspect remote render jobs")
  .option("--job <job-id>", "inspect one exact remote job id")
  .option("--limit <count>", "limit job summaries when --all is not set")
  .option("--all", "include all remote jobs")
  .option("--include-logs", "include tailed log excerpts in the output")
  .option(
    "--tail <lines>",
    "number of log lines to include when logs are requested"
  )
  .action(
    async (opts: {
      job?: string;
      limit?: string;
      all?: boolean;
      includeLogs?: boolean;
      tail?: string;
    }) => {
      await commandRenderRemoteStatus(program.opts<CliOptions>(), opts);
    }
  );
renderRemoteCommand
  .command("logs")
  .argument("<job-id>")
  .description("Fetch logs for a remote render job")
  .option("--clip <clip-id>", "fetch logs for a single clip id")
  .option("--tail <lines>", "number of log lines to return", "40")
  .action(async (jobId: string, opts: { clip?: string; tail?: string }) => {
    await commandRenderRemoteLogs(program.opts<CliOptions>(), jobId, opts);
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
registerShotsCommands(program);
registerStoryLocalizationCommands(program);
registerThumbnailCommands(program);

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
  logger: createLogger(
    resolveLogLevel(process.env["MEDIAFORGE_LOG_LEVEL"]),
    process.stderr
  ),
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
