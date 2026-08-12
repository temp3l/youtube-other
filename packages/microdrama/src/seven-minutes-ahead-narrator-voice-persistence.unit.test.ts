import { describe, expect, it } from "vitest";

import type {
  CharacterVoiceProfilePayload,
  CharacterVoiceProfileVersionPayload,
  ResolvedCharacterVoiceProfileRecord,
} from "@mediaforge/narrative-core";

import { ensureSevenMinutesAheadNarratorVoiceProfilePersisted } from "./seven-minutes-ahead-narrator-voice-persistence.js";
import {
  SEVEN_MINUTES_AHEAD_NARRATOR_CHARACTER_ID,
  SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
  registerSevenMinutesAheadNarratorVoiceProfile,
} from "./seven-minutes-ahead-narrator-voice-registry.js";

const CREATED_AT = "2026-08-12T06:00:00.000Z";

type NarratorVoiceRegistrationPort = Parameters<
  typeof registerSevenMinutesAheadNarratorVoiceProfile
>[0]["port"];

function inMemoryVoicePort(): NarratorVoiceRegistrationPort {
  let resolved: ResolvedCharacterVoiceProfileRecord | null = null;
  return {
    migrate: () => undefined,
    registerProfile: (input: { payload: CharacterVoiceProfilePayload }) => {
      if (!resolved) {
        resolved = {
          profile: input.payload,
          activeVersion: null,
          pronunciationRevision: null,
          consent: null,
        };
      } else {
        resolved = { ...resolved, profile: input.payload };
      }
      return input.payload;
    },
    registerConsentRecord: () => {
      throw new Error("not implemented");
    },
    appendProfileVersion: (input: { payload: CharacterVoiceProfileVersionPayload }) => {
      if (!resolved) {
        throw new Error("missing profile");
      }
      resolved = { ...resolved, activeVersion: input.payload };
      return input.payload;
    },
    appendPronunciationRevision: () => {
      throw new Error("not implemented");
    },
    activateProfileVersion: (input: {
      profileVersionId: string;
    }): CharacterVoiceProfileVersionPayload => {
      if (!resolved?.activeVersion) {
        throw new Error("missing version");
      }
      const activeVersion = {
        ...resolved.activeVersion,
        status: "ACTIVE" as const,
        profileVersionId: input.profileVersionId,
      };
      resolved = { ...resolved, activeVersion };
      return activeVersion;
    },
    getProfile: () => resolved?.profile ?? null,
    getProfileVersion: () => resolved?.activeVersion ?? null,
    resolveActiveProfile: async (characterId, locale) => {
      if (
        resolved &&
        characterId === resolved.profile.characterId &&
        locale === resolved.profile.locale &&
        resolved.activeVersion?.status === "ACTIVE"
      ) {
        return resolved;
      }
      return null;
    },
  };
}

describe("seven minutes ahead narrator voice persistence", () => {
  it("creates the narrator profile once and reuses the active revision", async () => {
    const port = inMemoryVoicePort();

    const first = await ensureSevenMinutesAheadNarratorVoiceProfilePersisted({
      port,
      createdAt: CREATED_AT,
    });
    const second = await ensureSevenMinutesAheadNarratorVoiceProfilePersisted({
      port,
      createdAt: CREATED_AT,
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(first.version.profileVersionId).toBe(
      SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID
    );

    const resolved = await port.resolveActiveProfile(
      SEVEN_MINUTES_AHEAD_NARRATOR_CHARACTER_ID,
      "en-US"
    );
    expect(resolved?.activeVersion?.profileVersionId).toBe(
      SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID
    );
  });
});
