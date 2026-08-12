import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  NARRATIVE_SCHEMA_VERSION,
  buildCharacterVoiceProfileId,
} from "@mediaforge/narrative-core";

import {
  CharacterVoiceDuplicateVersionError,
  CharacterVoiceProfileVersionImmutableError,
  CharacterVoiceSQLiteRepository,
  MicrodramaSQLiteRepository,
  createPersistence,
} from "./index.js";

const createdAt = "2026-08-12T00:00:00.000Z";

function createRepository(): CharacterVoiceSQLiteRepository {
  const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-character-voice-"));
  const dbPath = path.join(dir, "microdrama.sqlite");
  const sqlite = createPersistence(dbPath);
  sqlite.migrate();
  const microdrama = new MicrodramaSQLiteRepository(sqlite);
  microdrama.migrate();
  const repository = new CharacterVoiceSQLiteRepository(sqlite);
  repository.migrate();
  return repository;
}

function maraProfile() {
  return {
    schemaVersion: NARRATIVE_SCHEMA_VERSION,
    profileId: buildCharacterVoiceProfileId("character.mara", "en-US"),
    characterId: "character.mara",
    locale: "en-US" as const,
    displayName: "Mara",
    narrativeRole: "character" as const,
    speechStyleNotes: "Warm, urgent, intimate.",
  };
}

describe("character voice SQLite repository", () => {
  it("migrates character voice registry tables", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-character-voice-"));
    const dbPath = path.join(dir, "microdrama.sqlite");
    const sqlite = createPersistence(dbPath);
    sqlite.migrate();
    new MicrodramaSQLiteRepository(sqlite).migrate();
    const repository = new CharacterVoiceSQLiteRepository(sqlite);
    repository.migrate();
    const tables = sqlite.database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;
    expect(tables.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        "microdrama_character_voice_profiles",
        "microdrama_character_voice_profile_versions",
        "microdrama_character_voice_pronunciation_revisions",
        "microdrama_character_voice_consent_records",
      ])
    );
  });

  it("persists stable active voice identity per character and locale", () => {
    const repository = createRepository();
    repository.registerProfile({ payload: maraProfile(), createdAt });

    const pronunciationRevisionId = "pronunciation.mara.en-us.v1";
    repository.appendPronunciationRevision({
      payload: {
        schemaVersion: NARRATIVE_SCHEMA_VERSION,
        pronunciationRevisionId,
        profileId: buildCharacterVoiceProfileId("character.mara", "en-US"),
        profileVersionNumber: 1,
        locale: "en-US",
        entries: [
          {
            entryId: "entry.mara-name",
            grapheme: "Mara",
            spokenForm: "MAH-rah",
            scope: "profile",
          },
        ],
      },
      createdAt,
    });

    const versionId = "voice-version.mara.en-us.v1";
    repository.appendProfileVersion({
      payload: {
        schemaVersion: NARRATIVE_SCHEMA_VERSION,
        profileVersionId: versionId,
        profileId: buildCharacterVoiceProfileId("character.mara", "en-US"),
        versionNumber: 1,
        status: "DRAFT",
        provider: "openai",
        modelIntent: "tts-1-hd",
        voiceBindingStatus: "UNBOUND",
        deliveryConfiguration: { paceWpm: 155 },
        pronunciationRevisionId,
      },
      createdAt,
    });

    repository.activateProfileVersion({
      profileVersionId: versionId,
      expectedRevision: 0,
      activatedAt: createdAt,
    });

    const resolved = repository.resolveActiveProfile("character.mara", "en-US");
    expect(resolved?.profile.profileId).toBe(
      buildCharacterVoiceProfileId("character.mara", "en-US")
    );
    expect(resolved?.activeVersion?.profileVersionId).toBe(versionId);
    expect(resolved?.activeVersion?.providerVoiceId).toBeUndefined();
    expect(resolved?.pronunciationRevision?.entries).toHaveLength(1);

    repository.registerProfile({
      payload: {
        ...maraProfile(),
        profileId: buildCharacterVoiceProfileId("character.mara", "de-DE"),
        locale: "de-DE",
        displayName: "Mara",
      },
      createdAt,
    });
    expect(
      repository.resolveActiveProfile("character.mara", "de-DE")?.profile.locale
    ).toBe("de-DE");
  });

  it("rejects duplicate profile versions and preserves immutable activated revisions", () => {
    const repository = createRepository();
    repository.registerProfile({ payload: maraProfile(), createdAt });
    const versionId = "voice-version.mara.en-us.v1";
    const versionPayload = {
      schemaVersion: NARRATIVE_SCHEMA_VERSION,
      profileVersionId: versionId,
      profileId: buildCharacterVoiceProfileId("character.mara", "en-US"),
      versionNumber: 1,
      status: "DRAFT" as const,
      provider: "openai" as const,
      modelIntent: "tts-1-hd",
      voiceBindingStatus: "UNBOUND" as const,
      deliveryConfiguration: { paceWpm: 155 },
    };
    repository.appendProfileVersion({ payload: versionPayload, createdAt });
    expect(() =>
      repository.appendProfileVersion({ payload: versionPayload, createdAt })
    ).toThrow(CharacterVoiceDuplicateVersionError);

    repository.activateProfileVersion({
      profileVersionId: versionId,
      expectedRevision: 0,
      activatedAt: createdAt,
    });
    expect(() =>
      repository.activateProfileVersion({
        profileVersionId: versionId,
        expectedRevision: 1,
        activatedAt: createdAt,
      })
    ).toThrow(CharacterVoiceProfileVersionImmutableError);
  });

  it("records bounded canary-approved provider binding on active UNBOUND versions", () => {
    const repository = createRepository();
    repository.registerProfile({ payload: maraProfile(), createdAt });
    const versionId = "voice-version.mara.en-us.v1";
    repository.appendProfileVersion({
      payload: {
        schemaVersion: NARRATIVE_SCHEMA_VERSION,
        profileVersionId: versionId,
        profileId: buildCharacterVoiceProfileId("character.mara", "en-US"),
        versionNumber: 1,
        status: "DRAFT",
        provider: "openai",
        modelIntent: "tts-1-hd",
        voiceBindingStatus: "UNBOUND",
        deliveryConfiguration: { paceWpm: 155, instructions: "Stay intimate." },
      },
      createdAt,
    });
    repository.activateProfileVersion({
      profileVersionId: versionId,
      expectedRevision: 0,
      activatedAt: createdAt,
    });

    const evidenceHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const bound = repository.recordBoundedCanaryApprovedProviderBinding({
      profileVersionId: versionId,
      providerVoiceId: "alloy",
      canaryEvidenceArtifactHash: evidenceHash,
      recordedAt: createdAt,
    });
    expect(bound.voiceBindingStatus).toBe("CANARY_APPROVED");
    expect(bound.providerVoiceId).toBe("alloy");
    expect(bound.canaryEvidenceArtifactHash).toBe(evidenceHash);
  });
});
