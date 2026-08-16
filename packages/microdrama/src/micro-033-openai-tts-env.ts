import type { LocaleTtsModelConfiguration } from "@mediaforge/speech";

import { MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION } from "./micro-033-canary-bindings.js";

const OPENAI_SPEECH_OUTPUT_FORMATS = new Set([
  "mp3",
  "opus",
  "aac",
  "flac",
  "wav",
  "pcm",
]);

function resolveOpenAiSpeechOutputFormat(
  value: string | undefined
): LocaleTtsModelConfiguration["outputFormat"] | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (OPENAI_SPEECH_OUTPUT_FORMATS.has(normalized)) {
    return normalized as NonNullable<LocaleTtsModelConfiguration["outputFormat"]>;
  }
  return undefined;
}

/**
 * Operator/runtime OpenAI TTS configuration for MICRO-033.
 * Reads `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE` / `OPENAI_TTS_VOICE_EN`, and
 * `OPENAI_TTS_FORMAT` from the environment when set.
 */
export function resolveMicro033OpenAiTtsModelConfigurationFromEnv(): LocaleTtsModelConfiguration {
  const model =
    process.env.OPENAI_TTS_MODEL?.trim() ||
    MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION.model;
  const voice =
    process.env.OPENAI_TTS_VOICE_EN?.trim() ||
    process.env.OPENAI_TTS_VOICE?.trim() ||
    MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION.voice;
  const outputFormat =
    resolveOpenAiSpeechOutputFormat(process.env.OPENAI_TTS_FORMAT) ??
    MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION.outputFormat;

  return {
    provider: "openai",
    model,
    voice,
    instructions: MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION.instructions,
    speed: MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION.speed,
    ...(outputFormat ? { outputFormat } : {}),
  };
}

export function resolveMicro033ProviderVoiceIdFromEnv(): string {
  return resolveMicro033OpenAiTtsModelConfigurationFromEnv().voice;
}
