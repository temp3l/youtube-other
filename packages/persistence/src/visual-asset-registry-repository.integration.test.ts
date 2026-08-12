import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import {
  VISUAL_ASSET_REGISTRY_SCHEMA_VERSION,
  type VisualRegistryRevisionEnvelope,
} from "@mediaforge/domain";
import { computePayloadHash } from "@mediaforge/narrative-core";

import { MicrodramaSQLiteRepository } from "./microdrama-sqlite-repository.js";
import { VisualAssetRegistryRepository } from "./visual-asset-registry-repository.js";
import {
  VisualRegistryDuplicateRevisionError,
  VisualRegistryRevisionMismatchError,
  VisualRegistryRevisionNotFoundError,
} from "./visual-asset-registry-port.js";

const createdAt = "2026-08-12T00:00:00.000Z";
const seriesId = "series.seven-minutes-ahead";
const portraitHash =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function characterRevision(
  revisionNumber = 1,
  overrides: Partial<VisualRegistryRevisionEnvelope> = {}
): VisualRegistryRevisionEnvelope {
  const payload = {
    displayName: "Mira Chen",
    characterId: "char.mira-chen",
  };
  const envelope = {
    schemaVersion: VISUAL_ASSET_REGISTRY_SCHEMA_VERSION,
    revisionId: `var.char.mira-chen.rev.${revisionNumber}`,
    seriesId,
    entryId: "char.mira-chen",
    entryKind: "character" as const,
    revisionNumber,
    status: "DRAFT" as const,
    payload,
    contentHash: computePayloadHash(payload),
    parentRevisionIds: [],
    referenceAssets: [
      {
        artifactHash: portraitHash,
        mimeType: "image/png",
        byteSize: 2048,
        storageUri: "file:///registry/char.mira-chen/portrait.png",
        role: "portrait" as const,
      },
    ],
    provenance: { sourceKind: "import" as const },
    createdAt,
    ...overrides,
  };
  return envelope;
}

function createRepositories(): {
  registry: VisualAssetRegistryRepository;
} {
  const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-visual-registry-"));
  const dbPath = path.join(dir, "microdrama.sqlite");
  const sqlite = {
    database: new DatabaseSync(dbPath),
    config: { dbPath },
  };
  const microdrama = new MicrodramaSQLiteRepository(sqlite);
  microdrama.migrate();
  const registry = new VisualAssetRegistryRepository(sqlite);
  registry.migrate();
  return { registry };
}

describe("visual asset registry repository", () => {
  it("migrates embedded visual registry tables", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-visual-registry-"));
    const dbPath = path.join(dir, "microdrama.sqlite");
    const sqlite = {
      database: new DatabaseSync(dbPath),
      config: { dbPath },
    };
    new MicrodramaSQLiteRepository(sqlite).migrate();
    new VisualAssetRegistryRepository(sqlite).migrate();

    const tables = sqlite.database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((row) => row.name);
    expect(names).toContain("microdrama_visual_registry_revisions");
    expect(names).toContain("microdrama_visual_registry_accepted");
  });

  it("stores revisions and resolves accepted head revision", () => {
    const { registry } = createRepositories();
    const revision = characterRevision();
    registry.appendRevision({ envelope: revision });
    registry.acceptRevision({
      seriesId,
      entryId: revision.entryId,
      entryKind: revision.entryKind,
      revisionId: revision.revisionId,
      acceptedAt: createdAt,
    });

    expect(registry.getRevision(revision.revisionId)?.status).toBe("ACCEPTED");
    expect(registry.getAcceptedRevision(seriesId, revision.entryId, "character")).toMatchObject(
      {
        revisionId: revision.revisionId,
        referenceAssets: [{ artifactHash: portraitHash, role: "portrait" }],
      }
    );
  });

  it("rejects duplicate revision ids", () => {
    const { registry } = createRepositories();
    const revision = characterRevision();
    registry.appendRevision({ envelope: revision });
    expect(() => registry.appendRevision({ envelope: revision })).toThrow(
      VisualRegistryDuplicateRevisionError
    );
  });

  it("rejects acceptance when revision entry identity mismatches", () => {
    const { registry } = createRepositories();
    const revision = characterRevision();
    registry.appendRevision({ envelope: revision });
    expect(() =>
      registry.acceptRevision({
        seriesId,
        entryId: "char.other",
        entryKind: "character",
        revisionId: revision.revisionId,
        acceptedAt: createdAt,
      })
    ).toThrow(VisualRegistryRevisionMismatchError);
  });

  it("lists revisions in revision-number order", () => {
    const { registry } = createRepositories();
    const first = characterRevision(1);
    const second = characterRevision(2, {
      revisionId: "var.char.mira-chen.rev.2",
      parentRevisionIds: [first.revisionId],
    });
    registry.appendRevision({ envelope: first });
    registry.appendRevision({ envelope: second });

    const revisions = registry.listRevisionsByEntry(seriesId, "char.mira-chen", "character");
    expect(revisions.map((item) => item.revisionNumber)).toEqual([1, 2]);
  });

  it("throws when updating a missing revision status", () => {
    const { registry } = createRepositories();
    expect(() =>
      registry.updateRevisionStatus({
        revisionId: "var.missing.rev.1",
        status: "ACCEPTED",
        updatedAt: createdAt,
      })
    ).toThrow(VisualRegistryRevisionNotFoundError);
  });
});
