import type { LocaleTtsModelConfiguration } from "@mediaforge/speech";

import { MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION } from "./micro-033-canary-bindings.js";
import type { Micro035CanaryLocale } from "./micro-035-canary-bindings.js";

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

function resolveLocaleVoiceFromEnv(locale: Micro035CanaryLocale): string {
  switch (locale) {
    case "de-DE":
      return (
        process.env.OPENAI_TTS_VOICE_DE?.trim() ||
        process.env.OPENAI_TTS_VOICE?.trim() ||
        MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION.voice
      );
    case "es-ES":
      return (
        process.env.OPENAI_TTS_VOICE_ES?.trim() ||
        process.env.OPENAI_TTS_VOICE?.trim() ||
        MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION.voice
      );
    case "pt-BR":
      return (
        process.env.OPENAI_TTS_VOICE_PT_BR?.trim() ||
        process.env.OPENAI_TTS_VOICE?.trim() ||
        MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION.voice
      );
    default:
      return (
        process.env.OPENAI_TTS_VOICE?.trim() ||
        MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION.voice
      );
  }
}

export function resolveMicro035OpenAiTtsModelConfigurationForLocale(
  locale: Micro035CanaryLocale
): LocaleTtsModelConfiguration {
  const model =
    process.env.OPENAI_TTS_MODEL?.trim() ||
    MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION.model;
  const voice = resolveLocaleVoiceFromEnv(locale);
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
