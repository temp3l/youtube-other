import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  CharacterVoiceSQLiteRepository,
} from "../../persistence/src/character-voice-sqlite-repository.js";
import {
  MicrodramaSQLiteRepository,
} from "../../persistence/src/microdrama-sqlite-repository.js";
import { createPersistence } from "../../persistence/src/index.js";

import { ensureSevenMinutesAheadNarratorVoiceProfilePersisted } from "./seven-minutes-ahead-narrator-voice-persistence.js";
import {
  SEVEN_MINUTES_AHEAD_NARRATOR_CHARACTER_ID,
  SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
} from "./seven-minutes-ahead-narrator-voice-registry.js";

const CREATED_AT = "2026-08-12T06:00:00.000Z";

function createRepository(): CharacterVoiceSQLiteRepository {
  const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-micro-033-voice-"));
  const dbPath = path.join(dir, "microdrama.sqlite");
  const sqlite = createPersistence(dbPath);
  sqlite.migrate();
  new MicrodramaSQLiteRepository(sqlite).migrate();
  const repository = new CharacterVoiceSQLiteRepository(sqlite);
  repository.migrate();
  return repository;
}

describe("seven minutes ahead narrator voice SQLite persistence", () => {
  it("persists an active UNBOUND narrator profile for MICRO-033 preflight", async () => {
    const repository = createRepository();

    const first = await ensureSevenMinutesAheadNarratorVoiceProfilePersisted({
      port: repository,
      createdAt: CREATED_AT,
    });
    const second = await ensureSevenMinutesAheadNarratorVoiceProfilePersisted({
      port: repository,
      createdAt: CREATED_AT,
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);

    const resolved = await repository.resolveActiveProfile(
      SEVEN_MINUTES_AHEAD_NARRATOR_CHARACTER_ID,
      "en-US"
    );
    expect(resolved?.activeVersion?.profileVersionId).toBe(
      SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID
    );
    expect(resolved?.activeVersion?.voiceBindingStatus).toBe("UNBOUND");
    expect(resolved?.activeVersion?.status).toBe("ACTIVE");
  });
});
