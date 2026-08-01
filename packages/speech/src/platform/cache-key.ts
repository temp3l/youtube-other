import { createHash } from "node:crypto";
import {
  AUDIO_MASTERING_PROFILE_VERSION,
  SPEECH_CACHE_KEY_SCHEMA_VERSION,
  type ResolvedSpeechProfile,
} from "./contracts.js";

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

function canonicalize(value: unknown): CanonicalValue {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Cache-key values must be finite");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalize(record[key])])
    );
  }
  throw new TypeError("Cache-key values must be JSON-compatible");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
export function normalizeSpeechText(text: string): string {
  return text.normalize("NFC");
}

export interface SpeechCacheKeyResult {
  readonly schemaVersion: typeof SPEECH_CACHE_KEY_SCHEMA_VERSION;
  readonly cacheKey: string;
  readonly canonicalInput: string;
}

export function createSpeechCacheKey(input: {
  readonly text: string;
  readonly profile: ResolvedSpeechProfile;
  readonly masteringProfileVersion?: string;
}): SpeechCacheKeyResult {
  const configuration = input.profile.configuration;
  const cacheInput = {
    schemaVersion: SPEECH_CACHE_KEY_SCHEMA_VERSION,
    text: normalizeSpeechText(input.text),
    language: input.profile.language,
    provider: configuration.provider,
    model:
      configuration.provider === "openai"
        ? configuration.model
        : configuration.modelId,
    voice:
      configuration.provider === "openai"
        ? configuration.voice
        : configuration.voiceId,
    settings:
      configuration.provider === "openai"
        ? { speed: configuration.speed }
        : configuration.settings,
    instructions:
      configuration.provider === "openai"
        ? (configuration.instructions ?? null)
        : null,
    pronunciationDictionaryVersions:
      configuration.provider === "elevenlabs"
        ? configuration.pronunciationDictionaryVersions
        : [],
    outputFormat:
      configuration.provider === "openai"
        ? (configuration.outputFormat ?? "wav")
        : configuration.outputFormat,
    textNormalization:
      configuration.provider === "elevenlabs"
        ? (configuration.textNormalization ?? "auto")
        : null,
    chunking: configuration.chunking ?? null,
    profileVersionId: input.profile.profileVersionId,
    audioMasteringProfileVersion:
      input.masteringProfileVersion ?? AUDIO_MASTERING_PROFILE_VERSION,
  };
  const canonicalInput = canonicalJson(cacheInput);
  return {
    schemaVersion: SPEECH_CACHE_KEY_SCHEMA_VERSION,
    canonicalInput,
    cacheKey: createHash("sha256").update(canonicalInput, "utf8").digest("hex"),
  };
}
