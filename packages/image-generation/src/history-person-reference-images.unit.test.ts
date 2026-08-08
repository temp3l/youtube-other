import { describe, expect, it } from "vitest";
import type { Scene } from "@mediaforge/domain";
import { resolveHistoricalPersonReferenceAssetPath } from "./history-person-reference-images.js";
import { resolveHistoricalPersonReferencesForScene } from "./history-person-reference-images.js";
import type { HistoryVisualPlan } from "./history-image-plan.js";

const scene = (id: string): Scene => ({
  id,
  sequenceNumber: Number(id.replace(/\D/gu, "")),
  canonicalNarration: "Napoleon reviewed the army.",
  sourceSegmentIds: [id],
  estimatedDurationSeconds: 4,
  timing: { startSeconds: 0, endSeconds: 4 },
  visualPurpose: "portrait archival image",
  textRequirement: { required: false },
  subject: "Napoleon Bonaparte",
  action: "reviews the army",
  setting: "1812 campaign",
  composition: "medium portrait composition",
  cameraFraming: "medium subject hold",
  mood: "evidence-aware",
  continuityReferences: [],
  onScreenText: "",
  negativeConstraints: [],
  aspectRatios: ["16:9", "9:16"],
  imagePrompt: "Napoleon portrait scene",
  expectedImageFilenames: [],
  qualityStatus: "draft",
});

const basePlan: HistoryVisualPlan = {
  beats: [],
  visualConcepts: [],
  shots: [
    {
      id: "shot-0001-01",
      beatId: "beat-0001",
      startMs: 0,
      endMs: 4000,
    },
  ],
  historicalPersonReferences: {
    usages: [
      {
        shotId: "shot-0001-01",
        beatId: "beat-0001",
        entityMentionId: "entity-1",
        canonicalPersonId: "napoleon-bonaparte",
        canonicalName: "Napoleon Bonaparte",
        likenessPolicy: "reference-required",
        selectedReferenceAssetIds: ["napoleon-bonaparte/canonical-likeness"],
        attachmentStatus: "attached",
        reason: "face-relevant-shot-with-curated-references",
      },
      {
        shotId: "shot-0002-01",
        beatId: "beat-0002",
        entityMentionId: "entity-2",
        canonicalPersonId: "napoleon-bonaparte",
        canonicalName: "Napoleon Bonaparte",
        likenessPolicy: "no-likeness",
        selectedReferenceAssetIds: [],
        attachmentStatus: "not-required",
        reason: "scene-does-not-require-likeness",
      },
    ],
    resolvedPersonCount: 1,
    attachedReferenceCount: 1,
  },
};

describe("historical person reference images", () => {
  it("includes references only for attached face-relevant shots", () => {
    const references = resolveHistoricalPersonReferencesForScene({
      plan: basePlan,
      scene: scene("scene-001"),
    });
    expect(references).toHaveLength(1);
    expect(references[0]?.characterId).toBe("napoleon-bonaparte");
    expect(references[0]?.filePath).toBe(
      resolveHistoricalPersonReferenceAssetPath(
        "napoleon-bonaparte/canonical-likeness"
      )
    );
  });

  it("returns no references for non-relevant visual treatments on the same person", () => {
    const references = resolveHistoricalPersonReferencesForScene({
      plan: {
        ...basePlan,
        shots: [
          {
            id: "shot-0002-01",
            beatId: "beat-0002",
            startMs: 4000,
            endMs: 8000,
          },
        ],
      },
      scene: scene("scene-001"),
    });
    expect(references).toEqual([]);
  });
});
