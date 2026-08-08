import { describe, expect, it } from "vitest";

import {
  type ProductionUnitSnapshot,
  productionUnitAddressKey,
} from "./artifact-lineage-contracts.js";
import {
  deriveGateEvidenceUpdates,
  previewProductionUnitInvalidation,
} from "./artifact-invalidation.js";

const projectedAt = "2026-08-08T12:00:00.000Z";

function fingerprint(seed: string): string {
  return seed.padEnd(64, "a").slice(0, 64);
}

function unit(
  kind: ProductionUnitSnapshot["address"]["kind"],
  unitKey?: string,
  status: ProductionUnitSnapshot["status"] = "valid",
  inputSeed = "input",
  contentSeed = "content"
): ProductionUnitSnapshot {
  return {
    address: unitKey ? { kind, unitKey } : { kind },
    inputFingerprint: fingerprint(inputSeed),
    contentHash: fingerprint(contentSeed),
    status,
    artifactRecordId: `record-${productionUnitAddressKey({ kind, ...(unitKey ? { unitKey } : {}) })}`,
  };
}

describe("production unit invalidation preview", () => {
  const portfolio: readonly ProductionUnitSnapshot[] = [
    unit("brief_script", undefined, "valid", "brief-input", "brief-content"),
    unit("narration", undefined, "valid", "narration-input", "narration-content"),
    unit("visual_plan", undefined, "valid", "visual-input", "visual-content"),
    unit("scene_visual", "scene-001", "valid", "scene-1-input", "scene-1-content"),
    unit("scene_visual", "scene-002", "valid", "scene-2-input", "scene-2-content"),
    unit("map", "map-main", "valid", "map-input", "map-content"),
    unit("diagram", "diagram-main", "valid", "diagram-input", "diagram-content"),
    unit("tts", undefined, "valid", "tts-input", "tts-content"),
    unit("subtitles", undefined, "valid", "subtitles-input", "subtitles-content"),
    unit("render", undefined, "valid", "render-input", "render-content"),
    unit("review_readiness", undefined, "valid", "review-input", "review-content"),
    unit("publish_readiness", undefined, "valid", "publish-input", "publish-content"),
  ];

  it("invalidates narration downstream voice and render evidence without touching brief", () => {
    const preview = previewProductionUnitInvalidation({
      units: portfolio,
      changes: [
        {
          address: { kind: "narration" },
          nextInputFingerprint: fingerprint("narration-input-v2"),
          reason: "script_line_changed",
        },
      ],
      projectedAt,
    });

    const invalidatedKeys = preview.invalidatedUnits.map((entry) =>
      productionUnitAddressKey(entry.address)
    );
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        "narration",
        "tts",
        "subtitles",
        "render",
        "review_readiness",
        "publish_readiness",
      ])
    );
    expect(invalidatedKeys).not.toContain("brief_script");
    expect(preview.preservedUnits.map(productionUnitAddressKey)).toContain(
      "brief_script"
    );
    expect(preview.regenerationTargets.map(productionUnitAddressKey)).not.toContain(
      "review_readiness"
    );
  });

  it("invalidates all planned visuals when the visual plan changes", () => {
    const preview = previewProductionUnitInvalidation({
      units: portfolio,
      changes: [
        {
          address: { kind: "visual_plan" },
          nextInputFingerprint: fingerprint("visual-input-v2"),
        },
      ],
      projectedAt,
    });

    const invalidatedKeys = preview.invalidatedUnits.map((entry) =>
      productionUnitAddressKey(entry.address)
    );
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        "visual_plan",
        "scene_visual:scene-001",
        "scene_visual:scene-002",
        "map:map-main",
        "diagram:diagram-main",
        "render",
        "review_readiness",
        "publish_readiness",
      ])
    );
    expect(invalidatedKeys).not.toContain("narration");
    expect(invalidatedKeys).not.toContain("tts");
  });

  it("regenerates one scene visual without invalidating sibling scenes", () => {
    const preview = previewProductionUnitInvalidation({
      units: portfolio,
      changes: [
        {
          address: { kind: "scene_visual", unitKey: "scene-001" },
          nextContentHash: fingerprint("scene-1-content-v2"),
          reason: "scene_asset_replaced",
        },
      ],
      projectedAt,
    });

    const invalidatedKeys = preview.invalidatedUnits.map((entry) =>
      productionUnitAddressKey(entry.address)
    );
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        "scene_visual:scene-001",
        "render",
        "review_readiness",
        "publish_readiness",
      ])
    );
    expect(invalidatedKeys).not.toContain("scene_visual:scene-002");
    expect(invalidatedKeys).not.toContain("visual_plan");
  });

  it("marks review and publish gate evidence stale after upstream brief change", () => {
    const briefPreview = previewProductionUnitInvalidation({
      units: portfolio,
      changes: [
        {
          address: { kind: "brief_script" },
          nextInputFingerprint: fingerprint("brief-input-v2"),
          reason: "metadata_changed",
        },
      ],
      projectedAt,
    });

    expect(briefPreview.staleReviewReadiness).toBe(true);
    expect(briefPreview.stalePublishReadiness).toBe(true);
    const evidence = deriveGateEvidenceUpdates(briefPreview);
    expect(evidence.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(["render_stale", "approval_stale", "evidence_changed"])
    );
  });
});
