import type {
  CharacterVoiceProfilePayload,
  CharacterVoiceProfileVersionPayload,
} from "@mediaforge/narrative-core";
import type { CharacterVoiceRegistryPersistencePort } from "@mediaforge/persistence";

import {
  SEVEN_MINUTES_AHEAD_NARRATOR_CHARACTER_ID,
  SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
  registerSevenMinutesAheadNarratorVoiceProfile,
} from "./seven-minutes-ahead-narrator-voice-registry.js";

export async function ensureSevenMinutesAheadNarratorVoiceProfilePersisted(input: {
  readonly port: CharacterVoiceRegistryPersistencePort;
  readonly createdAt: string;
  readonly locale?: "en-US";
}): Promise<{
  readonly profile: CharacterVoiceProfilePayload;
  readonly version: CharacterVoiceProfileVersionPayload;
  readonly created: boolean;
}> {
  const locale = input.locale ?? "en-US";
  const existing = await input.port.resolveActiveProfile(
    SEVEN_MINUTES_AHEAD_NARRATOR_CHARACTER_ID,
    locale
  );
  if (
    existing?.activeVersion?.profileVersionId ===
      SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID &&
    existing.activeVersion.status === "ACTIVE"
  ) {
    return {
      profile: existing.profile,
      version: existing.activeVersion,
      created: false,
    };
  }

  const registered = registerSevenMinutesAheadNarratorVoiceProfile({
    port: input.port,
    createdAt: input.createdAt,
    locale,
  });
  return { ...registered, created: true };
}
