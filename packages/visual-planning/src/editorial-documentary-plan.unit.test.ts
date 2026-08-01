import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { contentSourceManifestSchema, type ContentSourceManifest } from "@mediaforge/domain";

import {
  EditorialDocumentaryPlanningError,
  planEditorialDocumentaryCompositions,
  type EditorialAspectBrief,
  type SuppliedEditorialMedia,
} from "./editorial-documentary-plan.js";

const sourceHash = "a".repeat(64);
const mediaBytes = Buffer.from("immutable creator media bytes", "utf8");
const mediaHash = createHash("sha256").update(mediaBytes).digest("hex");

function manifest(overrides: Partial<ContentSourceManifest> = {}): ContentSourceManifest {
  return contentSourceManifestSchema.parse({
    schemaVersion: "1.1",
    sourceId: "source-notes",
    title: "Creator recording",
    owner: "Creator",
    sourceType: "creator-recording",
    provenance: { kind: "recording", location: "vault/source-notes.mov", originalLanguage: "it" },
    accessLevel: "public",
    rights: {
      status: "creator-owned",
      rightsHolders: ["Creator"],
      allowedUses: ["visualize"],
      permittedLocales: ["it"],
      commercialUse: true,
      expiresAt: "2027-01-01T00:00:00.000Z",
    },
    aiTransformations: {
      structure: true,
      summarize: true,
      adapt: true,
      translate: true,
      syntheticVoice: false,
      syntheticLikeness: false,
    },
    sensitivity: { classification: "normal", tags: ["none"], manualReviewRequired: false },
    sourceHash,
    createdAt: "2026-06-01T00:00:00.000Z",
    approvedAt: "2026-07-01T00:00:00.000Z",
    approvedBy: "rights-reviewer",
    ...overrides,
  });
}

function suppliedMedia(
  sourceManifest = manifest(),
  bytes: Uint8Array = mediaBytes,
  evidenceMediaHash = mediaHash,
): SuppliedEditorialMedia {
  return {
    mediaId: "media-creator-recording",
    mediaBytes: bytes,
    sourceManifest,
    rightsEvidence: { sourceId: "source-notes", sourceHash, mediaSha256: evidenceMediaHash },
  };
}

function aspectBrief(aspectRatio: "16:9" | "9:16"): EditorialAspectBrief {
  return {
    aspectRatio,
    compositions: [
      {
        beatId: "beat-hook",
        sourceIds: ["source-notes"],
        treatment: "supplied-creator-media",
        visualIntent: aspectRatio === "16:9" ? "Creator beside the key statement." : "Creator above the key statement.",
        authorship: "independent",
      },
      {
        beatId: "beat-framework",
        sourceIds: ["source-framework"],
        treatment: aspectRatio === "16:9" ? "decision-tree" : "typography",
        visualIntent: aspectRatio === "16:9" ? "Horizontal decision branches." : "Stacked decision steps.",
        authorship: "independent",
      },
    ],
  };
}

function plan(overrides: Partial<Parameters<typeof planEditorialDocumentaryCompositions>[0]> = {}) {
  return planEditorialDocumentaryCompositions({
    episodeId: "episode-strategy",
    locale: "it",
    commercial: true,
    targetAccessLevel: "public",
    plannedAt: "2026-08-01T12:00:00.000Z",
    landscape: aspectBrief("16:9"),
    portrait: aspectBrief("9:16"),
    suppliedMedia: [suppliedMedia()],
    ...overrides,
  });
}

function expectPlanningCode(run: () => unknown, code: EditorialDocumentaryPlanningError["code"]): void {
  try {
    run();
    throw new Error(`Expected ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(EditorialDocumentaryPlanningError);
    expect((error as EditorialDocumentaryPlanningError).code).toBe(code);
  }
}

describe("editorial documentary composition plans", () => {
  it("retains matching beat/source lineage in independently authored aspect plans", () => {
    const plans = plan();

    expect(plans.landscape).toMatchObject({ aspectRatio: "16:9", planId: "episode-strategy-editorial-16x9" });
    expect(plans.portrait).toMatchObject({ aspectRatio: "9:16", planId: "episode-strategy-editorial-9x16" });
    expect(plans.landscape.compositions[1]).toMatchObject({ beatId: "beat-framework", treatment: "decision-tree" });
    expect(plans.portrait.compositions[1]).toMatchObject({ beatId: "beat-framework", treatment: "typography" });
    expect(plans.landscape.compositions[0]?.sourceIds).toEqual(plans.portrait.compositions[0]?.sourceIds);
    expect(plans.landscape.compositions[0]?.compositionId).not.toBe(plans.portrait.compositions[0]?.compositionId);
    expect(plans.portrait.compositions[0]).toMatchObject({ suppliedMediaSha256: mediaHash });
  });

  it("rejects missing, reused, crop-derived, or lineage-divergent portrait briefs", () => {
    expectPlanningCode(() => plan({ portrait: { aspectRatio: "9:16", compositions: [] } }), "INVALID_ASPECT_BRIEF");
    expectPlanningCode(() => plan({
      portrait: {
        aspectRatio: "9:16",
        compositions: aspectBrief("9:16").compositions.map((composition) => ({
          ...composition,
          authorship: "crop-derived" as const,
          sourceCompositionId: `${composition.beatId}-16x9`,
        })),
      },
    }), "PORTRAIT_PLAN_NOT_INDEPENDENT");
    const divergent = aspectBrief("9:16");
    expectPlanningCode(() => plan({
      portrait: {
        ...divergent,
        compositions: divergent.compositions.map((composition) => composition.beatId === "beat-hook"
          ? { ...composition, sourceIds: ["source-other"] }
          : composition),
      },
    }), "ASPECT_LINEAGE_MISMATCH");
  });

  it("requires strict manifest/hash-bound commercial rights, safe access, sensitivity, and approval evidence", () => {
    expectPlanningCode(() => plan({ suppliedMedia: [suppliedMedia(manifest(), mediaBytes, "c".repeat(64))] }), "SUPPLIED_MEDIA_HASH_MISMATCH");
    expectPlanningCode(() => plan({ suppliedMedia: [suppliedMedia(manifest(), Buffer.from("changed creator media bytes", "utf8"))] }), "SUPPLIED_MEDIA_HASH_MISMATCH");
    expectPlanningCode(() => plan({ suppliedMedia: [suppliedMedia(manifest({ rights: { ...manifest().rights, commercialUse: false } }))] }), "SUPPLIED_MEDIA_RIGHTS_REQUIRED");
    expect(plan({
      commercial: false,
      suppliedMedia: [suppliedMedia(manifest({ rights: { ...manifest().rights, commercialUse: false } }))],
    }).landscape.compositions[0]?.suppliedMediaSha256).toBe(mediaHash);
    expectPlanningCode(() => plan({ suppliedMedia: [suppliedMedia(manifest({ rights: { ...manifest().rights, permittedLocales: ["en"] } }))] }), "SUPPLIED_MEDIA_RIGHTS_REQUIRED");
    expectPlanningCode(() => plan({ suppliedMedia: [suppliedMedia(manifest({ rights: { ...manifest().rights, expiresAt: "2026-07-01T00:00:00.000Z" } }))] }), "SUPPLIED_MEDIA_EXPIRED");
    expectPlanningCode(() => plan({ suppliedMedia: [suppliedMedia(manifest({ accessLevel: "premium", sensitivity: { classification: "normal", tags: ["none"], manualReviewRequired: true } }))] }), "SUPPLIED_MEDIA_ACCESS_LEAKAGE");
    expectPlanningCode(() => plan({ suppliedMedia: [suppliedMedia(manifest({ sensitivity: { classification: "blocked", tags: ["none"], manualReviewRequired: true } }))] }), "SUPPLIED_MEDIA_SENSITIVITY_BLOCKED");
    expectPlanningCode(() => plan({ suppliedMedia: [suppliedMedia(manifest({ sensitivity: { classification: "high-risk", tags: ["none"], manualReviewRequired: true } }))] }), "SUPPLIED_MEDIA_SENSITIVITY_BLOCKED");
    expectPlanningCode(() => plan({ suppliedMedia: [suppliedMedia(manifest({ sensitivity: { classification: "sensitive", tags: ["none"], manualReviewRequired: false } }))] }), "SUPPLIED_MEDIA_SENSITIVITY_BLOCKED");
    expect(plan({
      suppliedMedia: [suppliedMedia(manifest({ sensitivity: { classification: "sensitive", tags: ["none"], manualReviewRequired: true } }))],
    }).portrait.compositions[0]?.suppliedMediaSha256).toBe(mediaHash);
    expectPlanningCode(() => plan({ suppliedMedia: [suppliedMedia(manifest({ approvedAt: undefined, approvedBy: undefined }))] }), "SUPPLIED_MEDIA_APPROVAL_REQUIRED");
  });
});
