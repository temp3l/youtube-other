import { describe, expect, it } from "vitest";

import {
  VISUAL_ASSET_REGISTRY_SCHEMA_VERSION,
  type VisualAssetRegistryReadPort,
  type VisualRegistryRevisionEnvelope,
} from "@mediaforge/domain";
import { computePayloadHash } from "@mediaforge/narrative-core";

import { resolveShotVisualContinuity } from "./visual-asset-continuity.js";

const seriesId = "series.seven-minutes-ahead";
const createdAt = "2026-08-12T00:00:00.000Z";
const portraitHash =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function approvedCharacterRevision(
  overrides: Partial<VisualRegistryRevisionEnvelope> = {}
): VisualRegistryRevisionEnvelope {
  const payload = {
    displayName: "Mira Chen",
    characterId: "char.mira-chen",
  };
  return {
    schemaVersion: VISUAL_ASSET_REGISTRY_SCHEMA_VERSION,
    revisionId: "var.char.mira-chen.rev.1",
    seriesId,
    entryId: "char.mira-chen",
    entryKind: "character",
    revisionNumber: 1,
    status: "ACCEPTED",
    payload,
    contentHash: computePayloadHash(payload),
    parentRevisionIds: [],
    referenceAssets: [
      {
        artifactHash: portraitHash,
        mimeType: "image/png",
        byteSize: 1024,
        storageUri: "file:///registry/char.mira-chen/portrait.png",
        role: "portrait",
      },
    ],
    provenance: { sourceKind: "import" },
    createdAt,
    ...overrides,
  };
}

function memoryRegistry(
  revisions: Record<string, VisualRegistryRevisionEnvelope>
): VisualAssetRegistryReadPort {
  return {
    getRevision(revisionId: string) {
      return revisions[revisionId] ?? null;
    },
    getAcceptedRevision(series, entryId, entryKind) {
      return (
        Object.values(revisions).find(
          (revision) =>
            revision.seriesId === series &&
            revision.entryId === entryId &&
            revision.entryKind === entryKind &&
            revision.status === "ACCEPTED"
        ) ?? null
      );
    },
  };
}

describe("visual asset continuity resolution", () => {
  it("resolves approved stable registry ids and revisions for shots", () => {
    const revision = approvedCharacterRevision();
    const result = resolveShotVisualContinuity({
      seriesId,
      references: [
        {
          entryId: "char.mira-chen",
          entryKind: "character",
          revisionId: revision.revisionId,
        },
      ],
      registry: memoryRegistry({ [revision.revisionId]: revision }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected continuity resolution to succeed");
    }
    expect(result.resolution.resolvedReferences).toHaveLength(1);
    expect(result.resolution.resolvedReferences[0]?.revision.referenceAssets[0]).toMatchObject(
      {
        artifactHash: portraitHash,
        storageUri: "file:///registry/char.mira-chen/portrait.png",
      }
    );
  });

  it("returns explicit locale-variant reason when locale matches", () => {
    const revision = approvedCharacterRevision({
      localeVariant: {
        locale: "de-DE",
        reason: "Localized phone UI requires German signage in frame.",
      },
    });
    const result = resolveShotVisualContinuity({
      seriesId,
      locale: "de-DE",
      references: [
        {
          entryId: "char.mira-chen",
          entryKind: "character",
          revisionId: revision.revisionId,
        },
      ],
      registry: memoryRegistry({ [revision.revisionId]: revision }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected continuity resolution to succeed");
    }
    expect(result.resolution.resolvedReferences[0]?.localeVariantReason).toEqual({
      locale: "de-DE",
      reason: "Localized phone UI requires German signage in frame.",
    });
  });

  it("fails closed when a shot references an unapproved revision", () => {
    const revision = approvedCharacterRevision({ status: "DRAFT" });
    const result = resolveShotVisualContinuity({
      seriesId,
      references: [
        {
          entryId: "char.mira-chen",
          entryKind: "character",
          revisionId: revision.revisionId,
        },
      ],
      registry: memoryRegistry({ [revision.revisionId]: revision }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected continuity resolution to fail");
    }
    expect(result.issues[0]?.code).toBe("revision_not_approved");
  });

  it("fails closed when registry revision identity does not match shot reference", () => {
    const revision = approvedCharacterRevision();
    const result = resolveShotVisualContinuity({
      seriesId,
      references: [
        {
          entryId: "char.other",
          entryKind: "character",
          revisionId: revision.revisionId,
        },
      ],
      registry: memoryRegistry({ [revision.revisionId]: revision }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected continuity resolution to fail");
    }
    expect(result.issues[0]?.code).toBe("entry_mismatch");
  });
});
