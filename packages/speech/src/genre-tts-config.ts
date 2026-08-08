import type { ContentProfileId } from "@mediaforge/domain";

/**
 * ElevenLabs voice resolution precedence (highest first):
 * 1. explicit runtime override (`ttsVoiceId` / CLI `--tts-voice-id`)
 * 2. genre environment variable (history: `HISTORY_CHANNEL_VOICE_ID`)
 * 3. genre default from `GENRE_ELEVENLABS_DEFAULTS` (history only today)
 *
 * Blank or whitespace-only voice IDs are treated as absent at every step.
 * History defaults do not apply to unrelated genres.
 */
export const HISTORY_DEFAULT_ELEVENLABS_VOICE_ID = "9Ft9sm9dzvprPILZmLJl";
export const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_flash_v2_5";

export type RuntimeTtsProvider = "mock" | "openai-compatible" | "elevenlabs";

export type GenreTtsGenre = ContentProfileId | (string & {});

export interface GenreElevenLabsPolicy {
  readonly voiceId?: string;
}

export const GENRE_ELEVENLABS_DEFAULTS: Readonly<
  Record<string, GenreElevenLabsPolicy>
> = {
  history: {
    voiceId: HISTORY_DEFAULT_ELEVENLABS_VOICE_ID,
  },
};

export const GENRE_VOICE_ENVIRONMENT_VARIABLES: Readonly<
  Record<string, string>
> = {
  history: "HISTORY_CHANNEL_VOICE_ID",
};

export interface GenreTtsEnvironment {
  readonly historyChannelVoiceId?: string | undefined;
  readonly elevenLabsModelId?: string | undefined;
  readonly genreVoiceIds?: Readonly<Record<string, string | undefined>>;
}

export interface GenreTtsOverrides {
  readonly voiceId?: string | undefined;
  readonly modelId?: string | undefined;
}

export interface ResolveTtsConfigInput {
  readonly genre: GenreTtsGenre;
  readonly provider: RuntimeTtsProvider;
  readonly overrides?: GenreTtsOverrides;
  readonly environment?: GenreTtsEnvironment;
  readonly openAi?: {
    readonly model: string;
    readonly voice: string;
  };
}

export interface ResolvedElevenLabsTtsConfig {
  readonly provider: "elevenlabs";
  readonly voiceId: string;
  readonly modelId: string;
}

export interface ResolvedOpenAiTtsConfig {
  readonly provider: "openai-compatible";
  readonly model: string;
  readonly voice: string;
}

export interface ResolvedMockTtsConfig {
  readonly provider: "mock";
}

export type ResolvedTtsConfig =
  | ResolvedElevenLabsTtsConfig
  | ResolvedOpenAiTtsConfig
  | ResolvedMockTtsConfig;

export function normalizeConfiguredVoiceId(
  value: string | undefined
): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function resolveEpisodeGenre(
  sourceMetadata: unknown
): GenreTtsGenre | undefined {
  if (!sourceMetadata || typeof sourceMetadata !== "object") {
    return undefined;
  }
  const genre = Reflect.get(sourceMetadata, "genre");
  if (typeof genre !== "string") {
    return undefined;
  }
  return normalizeConfiguredVoiceId(genre);
}

function resolveGenreEnvironmentVoiceId(
  genre: GenreTtsGenre,
  environment: GenreTtsEnvironment | undefined
): string | undefined {
  const fromMap = normalizeConfiguredVoiceId(
    environment?.genreVoiceIds?.[genre]
  );
  if (fromMap) {
    return fromMap;
  }
  if (genre === "history") {
    return normalizeConfiguredVoiceId(environment?.historyChannelVoiceId);
  }
  return undefined;
}

function resolveGenreDefaultVoiceId(genre: GenreTtsGenre): string | undefined {
  return normalizeConfiguredVoiceId(
    GENRE_ELEVENLABS_DEFAULTS[genre]?.voiceId
  );
}

export function resolveElevenLabsVoiceId(input: {
  readonly genre: GenreTtsGenre;
  readonly overrides?: GenreTtsOverrides;
  readonly environment?: GenreTtsEnvironment;
}): string | undefined {
  return (
    normalizeConfiguredVoiceId(input.overrides?.voiceId) ??
    resolveGenreEnvironmentVoiceId(input.genre, input.environment) ??
    resolveGenreDefaultVoiceId(input.genre)
  );
}

export function resolveElevenLabsModelId(input: {
  readonly overrides?: GenreTtsOverrides;
  readonly environment?: GenreTtsEnvironment;
}): string {
  return (
    normalizeConfiguredVoiceId(input.overrides?.modelId) ??
    normalizeConfiguredVoiceId(input.environment?.elevenLabsModelId) ??
    DEFAULT_ELEVENLABS_MODEL_ID
  );
}

export function assertElevenLabsApiKeyConfigured(input: {
  readonly genre: GenreTtsGenre;
  readonly apiKey: string | undefined;
}): void {
  if (normalizeConfiguredVoiceId(input.apiKey)) {
    return;
  }
  throw new Error(
    `ElevenLabs TTS was selected for genre "${input.genre}", but ELEVENLABS_API_KEY is not configured.`
  );
}

export function resolveTtsConfig(input: ResolveTtsConfigInput): ResolvedTtsConfig {
  if (input.provider === "mock") {
    return { provider: "mock" };
  }
  if (input.provider === "openai-compatible") {
    const model = input.openAi?.model ?? "gpt-4o-mini-tts";
    const voice = input.openAi?.voice ?? "onyx";
    return { provider: "openai-compatible", model, voice };
  }
  const voiceId = resolveElevenLabsVoiceId({
    genre: input.genre,
    ...(input.overrides ? { overrides: input.overrides } : {}),
    ...(input.environment ? { environment: input.environment } : {}),
  });
  if (!voiceId) {
    throw new Error(
      `ElevenLabs TTS was selected for genre "${input.genre}", but no voice ID is configured.`
    );
  }
  return {
    provider: "elevenlabs",
    voiceId,
    modelId: resolveElevenLabsModelId({
      ...(input.overrides ? { overrides: input.overrides } : {}),
      ...(input.environment ? { environment: input.environment } : {}),
    }),
  };
}

export function describeElevenLabsApiKeyConfiguration(
  apiKey: string | undefined
): { readonly configured: boolean } {
  return {
    configured: Boolean(normalizeConfiguredVoiceId(apiKey)),
  };
}
