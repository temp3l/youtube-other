import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { configurationErrorFromUnknown } from "./internal.js";

const configSchema = z.object({
  workspaceDir: z.string().min(1),
  dbPath: z.string().min(1),
  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]),
  defaultAspectRatio: z.enum(["16:9", "9:16"]),
  openArtBatchSize: z.number().int().positive(),
  ttsProvider: z.enum(["mock", "openai-compatible"]),
  transcriptionProvider: z.enum(["mock", "whisper.cpp"]),
  imageProvider: z.enum(["mock", "placeholder"]),
  textProvider: z.enum(["mock", "openai-compatible"]),
  whisperBin: z.string().min(1),
  whisperModel: z.string().optional(),
  whisperLanguage: z.string().optional(),
  whisperThreads: z.number().int().positive().optional(),
  whisperProcessors: z.number().int().positive().optional(),
  whisperTimeoutMs: z.number().int().positive().optional(),
  whisperMaxDurationSeconds: z.number().int().positive().optional(),
  openAiCompatibleBaseUrl: z.string().url().optional(),
  openAiCompatibleApiKey: z.string().optional(),
  openAiCompatibleModel: z.string().optional(),
  openAiCompatibleTtsVoice: z.string().optional(),
  apiPort: z.number().int().positive()
});
export type RuntimeConfig = z.infer<typeof configSchema>;

const envSchema = z.object({
  MEDIAFORGE_WORKSPACE: z.string().optional(),
  MEDIAFORGE_DB_PATH: z.string().optional(),
  MEDIAFORGE_LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).optional(),
  MEDIAFORGE_DEFAULT_ASPECT_RATIO: z.enum(["16:9", "9:16"]).optional(),
  MEDIAFORGE_OPENART_BATCH_SIZE: z.coerce.number().int().positive().optional(),
  MEDIAFORGE_TTS_PROVIDER: z.enum(["mock", "openai-compatible"]).optional(),
  MEDIAFORGE_TRANSCRIPTION_PROVIDER: z.enum(["mock", "whisper.cpp"]).optional(),
  MEDIAFORGE_IMAGE_PROVIDER: z.enum(["mock", "placeholder"]).optional(),
  MEDIAFORGE_TEXT_PROVIDER: z.enum(["mock", "openai-compatible"]).optional(),
  MEDIAFORGE_WHISPER_BIN: z.string().optional(),
  MEDIAFORGE_WHISPER_MODEL: z.string().optional(),
  MEDIAFORGE_WHISPER_LANGUAGE: z.string().optional(),
  MEDIAFORGE_WHISPER_THREADS: z.coerce.number().int().positive().optional(),
  MEDIAFORGE_WHISPER_PROCESSORS: z.coerce.number().int().positive().optional(),
  MEDIAFORGE_WHISPER_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  MEDIAFORGE_WHISPER_MAX_DURATION_SECONDS: z.coerce.number().int().positive().optional(),
  MEDIAFORGE_OPENAI_COMPATIBLE_BASE_URL: z.string().url().optional(),
  MEDIAFORGE_OPENAI_COMPATIBLE_API_KEY: z.string().optional(),
  MEDIAFORGE_OPENAI_COMPATIBLE_MODEL: z.string().optional(),
  MEDIAFORGE_OPENAI_COMPATIBLE_TTS_VOICE: z.string().optional(),
  MEDIAFORGE_API_PORT: z.coerce.number().int().positive().optional()
});

export async function loadPackageJsonConfig(configPath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function loadRuntimeConfig(overrides: Partial<RuntimeConfig> = {}): Promise<RuntimeConfig> {
  const env = envSchema.parse(process.env);
  const workspaceDir = overrides.workspaceDir ?? env.MEDIAFORGE_WORKSPACE ?? "./episodes";
  const dbPath = overrides.dbPath ?? env.MEDIAFORGE_DB_PATH ?? "./.mediaforge.sqlite";
  const localWhisperBin = path.resolve("tools/whisper.cpp/build/bin/whisper-cli");
  const localWhisperModel = path.resolve("tools/whisper.cpp/models/ggml-base.en.bin");
  const whisperBin = overrides.whisperBin ?? env.MEDIAFORGE_WHISPER_BIN ?? (await fs.stat(localWhisperBin).then(() => localWhisperBin).catch(() => "whisper-cli"));
  const whisperModel = overrides.whisperModel ?? env.MEDIAFORGE_WHISPER_MODEL ?? (await fs.stat(localWhisperModel).then(() => localWhisperModel).catch(() => undefined));
  const config = configSchema.parse({
    workspaceDir: path.resolve(workspaceDir),
    dbPath: path.resolve(dbPath),
    logLevel: overrides.logLevel ?? env.MEDIAFORGE_LOG_LEVEL ?? "info",
    defaultAspectRatio: overrides.defaultAspectRatio ?? env.MEDIAFORGE_DEFAULT_ASPECT_RATIO ?? "16:9",
    openArtBatchSize: overrides.openArtBatchSize ?? env.MEDIAFORGE_OPENART_BATCH_SIZE ?? 8,
    ttsProvider: overrides.ttsProvider ?? env.MEDIAFORGE_TTS_PROVIDER ?? "mock",
    transcriptionProvider: overrides.transcriptionProvider ?? env.MEDIAFORGE_TRANSCRIPTION_PROVIDER ?? "mock",
    imageProvider: overrides.imageProvider ?? env.MEDIAFORGE_IMAGE_PROVIDER ?? "placeholder",
    textProvider: overrides.textProvider ?? env.MEDIAFORGE_TEXT_PROVIDER ?? "mock",
    whisperBin,
    whisperModel,
    whisperLanguage: overrides.whisperLanguage ?? env.MEDIAFORGE_WHISPER_LANGUAGE,
    whisperThreads: overrides.whisperThreads ?? env.MEDIAFORGE_WHISPER_THREADS,
    whisperProcessors: overrides.whisperProcessors ?? env.MEDIAFORGE_WHISPER_PROCESSORS,
    whisperTimeoutMs: overrides.whisperTimeoutMs ?? env.MEDIAFORGE_WHISPER_TIMEOUT_MS,
    whisperMaxDurationSeconds: overrides.whisperMaxDurationSeconds ?? env.MEDIAFORGE_WHISPER_MAX_DURATION_SECONDS,
    openAiCompatibleBaseUrl: overrides.openAiCompatibleBaseUrl ?? env.MEDIAFORGE_OPENAI_COMPATIBLE_BASE_URL,
    openAiCompatibleApiKey: overrides.openAiCompatibleApiKey ?? env.MEDIAFORGE_OPENAI_COMPATIBLE_API_KEY,
    openAiCompatibleModel: overrides.openAiCompatibleModel ?? env.MEDIAFORGE_OPENAI_COMPATIBLE_MODEL,
    openAiCompatibleTtsVoice: overrides.openAiCompatibleTtsVoice ?? env.MEDIAFORGE_OPENAI_COMPATIBLE_TTS_VOICE,
    apiPort: overrides.apiPort ?? env.MEDIAFORGE_API_PORT ?? 3333
  });
  return config;
}

export async function loadEpisodeConfig(episodeDir: string): Promise<Record<string, unknown> | null> {
  return loadPackageJsonConfig(path.join(episodeDir, "episode.config.json"));
}

export function mergeConfig<T extends Record<string, unknown>>(defaults: T, ...layers: Array<Partial<T> | null | undefined>): T {
  return Object.assign({}, defaults, ...layers.filter((layer): layer is Partial<T> => layer !== null && layer !== undefined));
}

export function configError(message: string): Error {
  return configurationErrorFromUnknown(message);
}
