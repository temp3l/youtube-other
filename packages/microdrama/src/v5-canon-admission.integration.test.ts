import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  createPersistence,
  MicrodramaSQLiteRepository,
} from "@mediaforge/persistence";

import {
  compileV5CanonAdmission,
  persistV5CanonAdmission,
  replayV5CanonAdmission,
  validateV5CanonAdmissionProjection,
  verifyReplayedCanonAdmission,
} from "./index.js";

const V5_PACK_ROOT = path.resolve(
  import.meta.dirname,
  "../../../content-packs/seven-minutes-ahead-content-pack-v5-remediated"
);
const ADMITTED_AT = "2026-08-12T03:10:00.000Z";

function createRepository(): MicrodramaSQLiteRepository {
  const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-microdrama-admission-"));
  const dbPath = path.join(dir, "microdrama.sqlite");
  const sqlite = createPersistence(dbPath);
  sqlite.migrate();
  const repository = new MicrodramaSQLiteRepository(sqlite);
  repository.migrate();
  return repository;
}

describe("V5 canon admission persistence", () => {
  it("persists and replays accepted canon over all 100 episode identities", () => {
    const admission = compileV5CanonAdmission(V5_PACK_ROOT, ADMITTED_AT);
    if (!admission.ok) {
      throw new Error(admission.issues.map((issue) => issue.message).join("\n"));
    }

    const repository = createRepository();
    persistV5CanonAdmission(repository, admission.bundle);

    const projection = validateV5CanonAdmissionProjection(
      replayV5CanonAdmission(repository)
    );
    expect(projection.importId).toBe(admission.bundle.importId);
    expect(projection.episodeIdentities).toHaveLength(100);
    expect(projection.scriptRevisionIds).toHaveLength(400);
    expect(verifyReplayedCanonAdmission(repository, admission.bundle)).toBe(true);
  });
});
