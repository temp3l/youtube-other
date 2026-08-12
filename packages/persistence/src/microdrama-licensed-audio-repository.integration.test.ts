import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  evaluateLicensedAudioProductionReadiness,
  planLicensedAudioAssetRecord,
} from "@mediaforge/domain";

import {
  MicrodramaLicensedAudioRepository,
  MicrodramaSQLiteRepository,
  createPersistence,
} from "./index.js";

const evaluatedAt = "2026-08-12T12:00:00.000Z";
const approvalHash = "f".repeat(64);

function createLicensedAudioRepository(): MicrodramaLicensedAudioRepository {
  const dir = mkdtempSync(
    path.join(os.tmpdir(), "mediaforge-microdrama-licensed-audio-")
  );
  const dbPath = path.join(dir, "microdrama.sqlite");
  const sqlite = createPersistence(dbPath);
  sqlite.migrate();
  new MicrodramaSQLiteRepository(sqlite).migrate();
  const repository = new MicrodramaLicensedAudioRepository(sqlite);
  repository.migrateLicensedAudio();
  return repository;
}

function importedFixtureAsset(input: {
  assetId: string;
  layerKind: "ambience" | "sfx" | "music";
  expiresAt?: string;
}) {
  return planLicensedAudioAssetRecord({
    assetId: input.assetId,
    layerKind: input.layerKind,
    assetHash: "e".repeat(64),
    mimeType: "audio/mpeg",
    byteSize: 4_096,
    storageUri: `file:///fixtures/audio/${input.layerKind}/${input.assetId}.mp3`,
    provenance: {
      sourceKind: "imported-file",
      importReference: `imports/${input.assetId}.mp3`,
      importedAt: "2026-06-01T00:00:00.000Z",
      importedBy: "operator.audio",
    },
    rights: {
      status: "licensed",
      licenseReference: `license.${input.assetId}.2026`,
      rightsHolders: ["Fixture Library"],
      permittedTerritories: ["WW"],
      commercialUse: true,
      expiresAt: input.expiresAt ?? "2027-01-01T00:00:00.000Z",
      approvalEvidenceHash: approvalHash,
      approvedAt: "2026-06-01T00:00:00.000Z",
      approvedBy: "rights-reviewer",
    },
    recordedAt: evaluatedAt,
  });
}

describe("microdrama licensed audio repository", () => {
  it("migrates licensed audio asset table", () => {
    const dir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-microdrama-licensed-audio-")
    );
    const dbPath = path.join(dir, "microdrama.sqlite");
    const sqlite = createPersistence(dbPath);
    sqlite.migrate();
    new MicrodramaSQLiteRepository(sqlite).migrate();
    const repository = new MicrodramaLicensedAudioRepository(sqlite);
    repository.migrateLicensedAudio();

    const tables = sqlite.database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((row) => row.name);
    expect(names).toContain("microdrama_licensed_audio_assets");
  });

  it("persists imported assets and blocks readiness when rights expire", () => {
    const repository = createLicensedAudioRepository();
    const ambience = importedFixtureAsset({
      assetId: "asset.ambience.city",
      layerKind: "ambience",
      expiresAt: "2026-08-01T00:00:00.000Z",
    });
    const sfx = importedFixtureAsset({
      assetId: "asset.sfx.phone",
      layerKind: "sfx",
    });
    repository.recordLicensedAudioAsset({ asset: ambience });
    repository.recordLicensedAudioAsset({ asset: sfx });

    expect(repository.getLicensedAudioAsset(ambience.assetId)?.fingerprint).toBe(
      ambience.fingerprint
    );

    const readiness = evaluateLicensedAudioProductionReadiness({
      tracks: {
        ambience: [
          {
            entryId: "entry.ambience.001",
            assetId: ambience.assetId,
            assetFingerprint: ambience.fingerprint,
            startMs: 0,
            endMs: 60_000,
          },
        ],
        sfx: [
          {
            entryId: "entry.sfx.001",
            assetId: sfx.assetId,
            assetFingerprint: sfx.fingerprint,
            startMs: 12_000,
            endMs: 13_500,
          },
        ],
        music: [],
      },
      assetsById: new Map([
        [ambience.assetId, repository.getLicensedAudioAsset(ambience.assetId)!],
        [sfx.assetId, repository.getLicensedAudioAsset(sfx.assetId)!],
      ]),
      evaluatedAt,
      territory: "US",
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.some((blocker) => blocker.code === "RIGHTS_EXPIRED")).toBe(
      true
    );
  });
});
