import { describe, expect, it } from "vitest";

import {
  NARRATIVE_SCHEMA_VERSION,
  buildCharacterVoiceProfileId,
  type ResolvedCharacterVoiceProfileRecord,
} from "@mediaforge/narrative-core";

import {
  CharacterVoiceRegistryResolver,
  type CharacterVoiceRegistryStore,
} from "./character-voice-registry.js";
import { SpeechDomainError } from "./platform/errors.js";

function activeRecord(input?: {
  readonly providerVoiceId?: string;
  readonly voiceBindingStatus?: "UNBOUND" | "CANARY_PENDING" | "CANARY_APPROVED";
  readonly canaryEvidenceArtifactHash?: string;
}): ResolvedCharacterVoiceProfileRecord {
  const profileId = buildCharacterVoiceProfileId("character.mara", "en-US");
  return {
    profile: {
      schemaVersion: NARRATIVE_SCHEMA_VERSION,
      profileId,
      characterId: "character.mara",
      locale: "en-US",
      displayName: "Mara",
      narrativeRole: "character",
      speechStyleNotes: "Warm and urgent.",
    },
    activeVersion: {
      schemaVersion: NARRATIVE_SCHEMA_VERSION,
      profileVersionId: "voice-version.mara.en-us.v1",
      profileId,
      versionNumber: 1,
      status: "ACTIVE",
      provider: "openai",
      modelIntent: "tts-1-hd",
      voiceBindingStatus: input?.voiceBindingStatus ?? "UNBOUND",
      ...(input?.providerVoiceId ? { providerVoiceId: input.providerVoiceId } : {}),
      ...(input?.canaryEvidenceArtifactHash
        ? { canaryEvidenceArtifactHash: input.canaryEvidenceArtifactHash }
        : {}),
      deliveryConfiguration: { paceWpm: 155, instructions: "Stay intimate." },
      pronunciationRevisionId: "pronunciation.mara.en-us.v1",
    },
    pronunciationRevision: {
      schemaVersion: NARRATIVE_SCHEMA_VERSION,
      pronunciationRevisionId: "pronunciation.mara.en-us.v1",
      profileId,
      profileVersionNumber: 1,
      locale: "en-US",
      entries: [],
    },
    consent: null,
  };
}

describe("character voice registry resolver", () => {
  it("resolves stable voice identity per character and locale without provider voice ids", async () => {
    const store: CharacterVoiceRegistryStore = {
      resolveActiveProfile: async (characterId, locale) => {
        if (characterId === "character.mara" && locale === "en-US") {
          return activeRecord();
        }
        return null;
      },
    };
    const resolver = new CharacterVoiceRegistryResolver(store);
    const resolved = await resolver.resolve({
      characterId: "character.mara",
      locale: "en-US",
    });
    expect(resolved.profileId).toBe(
      buildCharacterVoiceProfileId("character.mara", "en-US")
    );
    expect(resolved.profileVersionId).toBe("voice-version.mara.en-us.v1");
    expect(resolved.providerVoiceId).toBeUndefined();
    expect(resolved.speechProfile.configuration.provider).toBe("openai");
    if (resolved.speechProfile.configuration.provider === "openai") {
      expect(resolved.speechProfile.configuration.voice).toBe("unbound");
    }
  });

  it("rejects provider voice ids without canary evidence", async () => {
    const store: CharacterVoiceRegistryStore = {
      resolveActiveProfile: async () =>
        activeRecord({ providerVoiceId: "alloy", voiceBindingStatus: "UNBOUND" }),
    };
    const resolver = new CharacterVoiceRegistryResolver(store);
    await expect(
      resolver.resolve({ characterId: "character.mara", locale: "en-US" })
    ).rejects.toBeInstanceOf(SpeechDomainError);
  });

  it("accepts canary-approved provider voice ids", async () => {
    const store: CharacterVoiceRegistryStore = {
      resolveActiveProfile: async () =>
        activeRecord({
          providerVoiceId: "alloy",
          voiceBindingStatus: "CANARY_APPROVED",
          canaryEvidenceArtifactHash:
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        }),
    };
    const resolver = new CharacterVoiceRegistryResolver(store);
    const resolved = await resolver.resolve({
      characterId: "character.mara",
      locale: "en-US",
    });
    expect(resolved.providerVoiceId).toBe("alloy");
    if (resolved.speechProfile.configuration.provider === "openai") {
      expect(resolved.speechProfile.configuration.voice).toBe("alloy");
    }
  });
});
