import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  NARRATIVE_SCHEMA_VERSION,
  computePayloadHash,
  type SeriesBibleRevision,
} from "@mediaforge/narrative-core";

import {
  MicrodramaConcurrencyError,
  MicrodramaDuplicateRevisionError,
  MicrodramaSQLiteRepository,
  copyMicrodramaDatabaseBackup,
  createPersistence,
  writeMicrodramaBackupManifest,
} from "./index.js";

const createdAt = "2026-08-12T00:00:00.000Z";

function seriesBibleRevision(revisionNumber = 1): SeriesBibleRevision {
  const payload = {
    schemaVersion: NARRATIVE_SCHEMA_VERSION,
    seriesId: "series.alpha",
    premise: "A serialized suspense premise.",
    genre: "thriller",
    audience: "Adults",
    emotionalPromise: "Urgent curiosity",
    centralConflict: "Trust versus deception",
    centralMystery: "Unknown messenger",
    tone: "Tense",
    themes: ["identity"],
    storytellingRules: ["End on cliffhangers"],
    prohibitedPatterns: ["Fourth-wall breaks"],
  };
  return {
    schemaVersion: NARRATIVE_SCHEMA_VERSION,
    revisionId: `rev.series-bible.${revisionNumber}`,
    aggregateId: "series.alpha",
    aggregateKind: "series_bible",
    revisionNumber,
    payload,
    contentHash: computePayloadHash(payload),
    parentRevisionIds: [],
    status: "DRAFT",
    provenance: { sourceKind: "import" },
    createdAt,
  };
}

function createRepository(): {
  repository: MicrodramaSQLiteRepository;
  sqlite: ReturnType<typeof createPersistence>;
} {
  const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-microdrama-"));
  const dbPath = path.join(dir, "microdrama.sqlite");
  const sqlite = createPersistence(dbPath);
  sqlite.migrate();
  const repository = new MicrodramaSQLiteRepository(sqlite);
  repository.migrate();
  return { repository, sqlite };
}

describe("microdrama SQLite repository", () => {
  it("migrates embedded microdrama tables", () => {
    const { sqlite } = createRepository();
    const tables = sqlite.database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((row) => row.name);
    expect(names).toContain("microdrama_narrative_revisions");
    expect(names).toContain("microdrama_events");
    expect(names).toContain("microdrama_artifact_references");
    expect(names).toContain("microdrama_projections");
  });

  it("stores narrative revisions and replays append events", () => {
    const { repository } = createRepository();
    const revision = seriesBibleRevision();
    repository.appendNarrativeRevision({ envelope: revision });

    expect(repository.getNarrativeRevision(revision.revisionId)).toMatchObject({
      revisionId: revision.revisionId,
      aggregateKind: "series_bible",
    });

    const events = repository.replayEvents();
    expect(events.length).toBe(1);
    expect(events[0]?.eventKind).toBe("revision_appended");
    expect(events[0]?.sequence).toBe(1);
  });

  it("rejects duplicate revision ids", () => {
    const { repository } = createRepository();
    const revision = seriesBibleRevision();
    repository.appendNarrativeRevision({ envelope: revision });
    expect(() =>
      repository.appendNarrativeRevision({ envelope: revision })
    ).toThrow(MicrodramaDuplicateRevisionError);
  });

  it("enforces projection CAS updates", () => {
    const { repository } = createRepository();
    const first = repository.replaceProjection({
      projectionKey: "canon.head",
      projection: { acceptedRevisionId: "rev.1" },
      contentHash: computePayloadHash({ acceptedRevisionId: "rev.1" }),
      updatedAt: createdAt,
    });
    expect(first.projectionRevision).toBe(1);

    const second = repository.replaceProjection({
      projectionKey: "canon.head",
      expectedProjectionRevision: 1,
      projection: { acceptedRevisionId: "rev.2" },
      contentHash: computePayloadHash({ acceptedRevisionId: "rev.2" }),
      updatedAt: "2026-08-12T01:00:00.000Z",
    });
    expect(second.projectionRevision).toBe(2);

    expect(() =>
      repository.replaceProjection({
        projectionKey: "canon.head",
        expectedProjectionRevision: 1,
        projection: { acceptedRevisionId: "rev.stale" },
        contentHash: computePayloadHash({ acceptedRevisionId: "rev.stale" }),
        updatedAt: "2026-08-12T02:00:00.000Z",
      })
    ).toThrow(MicrodramaConcurrencyError);
  });

  it("registers artifact references without storing blob bytes", () => {
    const { repository } = createRepository();
    const artifact = repository.registerArtifactReference({
      artifactHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      mimeType: "text/markdown",
      byteSize: 1200,
      storageUri: "file:///tmp/import/script.md",
      provenance: { sourceKind: "import" },
      recordedAt: createdAt,
    });
    expect(artifact.byteSize).toBe(1200);
    expect(repository.getArtifactReference(artifact.artifactHash)?.storageUri).toBe(
      "file:///tmp/import/script.md"
    );
  });

  it("exports backup manifest and database copy contract", async () => {
    const { repository, sqlite } = createRepository();
    repository.registerArtifactReference({
      artifactHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      mimeType: "application/json",
      byteSize: 42,
      storageUri: "file:///tmp/import/manifest.json",
      provenance: { sourceKind: "import" },
      recordedAt: createdAt,
    });

    const manifest = repository.exportBackupManifest();
    expect(manifest.schemaVersion).toBe("mediaforge.microdrama-backup.v1");
    expect(manifest.artifactReferences.length).toBe(1);

    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-microdrama-backup-"));
    const targetDb = path.join(dir, "restored.sqlite");
    await copyMicrodramaDatabaseBackup(sqlite, targetDb);
    await writeMicrodramaBackupManifest(manifest, path.join(dir, "manifest.json"));

    const restored = createPersistence(targetDb);
    const restoredRepository = new MicrodramaSQLiteRepository(restored);
    restoredRepository.migrate();
    expect(
      restoredRepository.getArtifactReference(
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      )?.storageUri
    ).toBe("file:///tmp/import/manifest.json");
  });
});
