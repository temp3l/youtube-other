import {
  NARRATIVE_SCHEMA_VERSION,
  type CharacterVoiceProfilePayload,
  type CharacterVoiceProfileVersionPayload,
} from "@mediaforge/narrative-core";
import type { CharacterVoiceRegistryPersistencePort } from "@mediaforge/persistence";

export const SEVEN_MINUTES_AHEAD_NARRATOR_CHARACTER_ID =
  "character.narrator" as const;

export const SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_ID =
  "voice.character.narrator.en-us" as const;

export const SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID =
  "voice-version.narrator.en-us.v1" as const;

export const SEVEN_MINUTES_AHEAD_NARRATOR_OPENAI_MODEL_INTENT = "tts-1-hd" as const;

export const SEVEN_MINUTES_AHEAD_NARRATOR_OPENAI_PROVIDER = "openai" as const;

export const SEVEN_MINUTES_AHEAD_NARRATOR_TARGET_PACE_WPM = 155;

export function sevenMinutesAheadNarratorProfileId(locale: "en-US" = "en-US") {
  if (locale !== "en-US") {
    throw new Error(`unsupported narrator locale ${locale}`);
  }
  return SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_ID;
}

export function buildSevenMinutesAheadNarratorVoiceProfile(
  locale: "en-US" = "en-US"
): CharacterVoiceProfilePayload {
  return {
    schemaVersion: NARRATIVE_SCHEMA_VERSION,
    profileId: sevenMinutesAheadNarratorProfileId(locale),
    characterId: SEVEN_MINUTES_AHEAD_NARRATOR_CHARACTER_ID,
    locale,
    displayName: "Narrator",
    narrativeRole: "narrator",
    speechStyleNotes:
      "Intimate microdrama narration at 155 WPM lexical target; provider voice unbound until canary evidence.",
  };
}

export function buildSevenMinutesAheadNarratorVoiceProfileVersion(
  locale: "en-US" = "en-US"
): CharacterVoiceProfileVersionPayload {
  return {
    schemaVersion: NARRATIVE_SCHEMA_VERSION,
    profileVersionId: SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
    profileId: sevenMinutesAheadNarratorProfileId(locale),
    versionNumber: 1,
    status: "DRAFT",
    provider: SEVEN_MINUTES_AHEAD_NARRATOR_OPENAI_PROVIDER,
    modelIntent: SEVEN_MINUTES_AHEAD_NARRATOR_OPENAI_MODEL_INTENT,
    voiceBindingStatus: "UNBOUND",
    deliveryConfiguration: {
      paceWpm: SEVEN_MINUTES_AHEAD_NARRATOR_TARGET_PACE_WPM,
      instructions: "Measured pacing for microdrama.",
    },
  };
}

export function registerSevenMinutesAheadNarratorVoiceProfile(input: {
  readonly port: CharacterVoiceRegistryPersistencePort;
  readonly createdAt: string;
  readonly locale?: "en-US";
}): {
  readonly profile: CharacterVoiceProfilePayload;
  readonly version: CharacterVoiceProfileVersionPayload;
} {
  const locale = input.locale ?? "en-US";
  const profile = buildSevenMinutesAheadNarratorVoiceProfile(locale);
  const version = buildSevenMinutesAheadNarratorVoiceProfileVersion(locale);

  input.port.registerProfile({ payload: profile, createdAt: input.createdAt });
  input.port.appendProfileVersion({ payload: version, createdAt: input.createdAt });
  input.port.activateProfileVersion({
    profileVersionId: version.profileVersionId,
    expectedRevision: 0,
    activatedAt: input.createdAt,
  });

  return { profile, version };
}
