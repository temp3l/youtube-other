import { describe, expect, it } from "vitest";

import {
  NARRATIVE_SCHEMA_VERSION,
  buildCharacterVoiceProfileId,
  characterVoiceProfileVersionPayloadSchema,
  parseCharacterVoiceProfileVersionPayload,
} from "./index.js";

describe("character voice registry schemas", () => {
  it("builds a stable profile id per character and locale", () => {
    expect(buildCharacterVoiceProfileId("character.mara", "en-US")).toBe(
      "voice.character.mara.en-us"
    );
    expect(buildCharacterVoiceProfileId("character.mara", "de-DE")).toBe(
      "voice.character.mara.de-de"
    );
  });

  it("rejects provider voice ids without canary evidence", () => {
    const parsed = parseCharacterVoiceProfileVersionPayload({
      schemaVersion: NARRATIVE_SCHEMA_VERSION,
      profileVersionId: "voice-version.mara.en-us.v1",
      profileId: buildCharacterVoiceProfileId("character.mara", "en-US"),
      versionNumber: 1,
      status: "DRAFT",
      provider: "openai",
      modelIntent: "tts-1-hd",
      voiceBindingStatus: "UNBOUND",
      providerVoiceId: "alloy",
      deliveryConfiguration: { paceWpm: 155 },
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts canary-approved provider voice ids with evidence", () => {
    const payload = characterVoiceProfileVersionPayloadSchema.parse({
      schemaVersion: NARRATIVE_SCHEMA_VERSION,
      profileVersionId: "voice-version.mara.en-us.v1",
      profileId: buildCharacterVoiceProfileId("character.mara", "en-US"),
      versionNumber: 1,
      status: "ACTIVE",
      provider: "openai",
      modelIntent: "tts-1-hd",
      voiceBindingStatus: "CANARY_APPROVED",
      providerVoiceId: "alloy",
      canaryEvidenceArtifactHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      deliveryConfiguration: { paceWpm: 155, instructions: "Warm and urgent." },
    });
    expect(payload.providerVoiceId).toBe("alloy");
  });
});
