import { describe, expect, it } from "vitest";
import {
  assertIndependentFormatCompositionHandoffs,
  type IndependentFormatCompositionHandoff,
} from "./composition-contract.js";

const hash = "a".repeat(64);

function handoff(aspectRatio: "16:9" | "9:16"): IndependentFormatCompositionHandoff {
  const suffix = aspectRatio === "16:9" ? "landscape" : "portrait";
  return {
    schemaVersion: "veronica-format-composition.v1",
    contentProfileId: "veronicabenini",
    sceneId: "scene-1",
    narrationRevisionId: "narration-r2",
    visualSemanticRevisionId: "visual-r3",
    sharedImageIdentity: hash,
    compositionId: `composition-${aspectRatio === "16:9" ? "1" : "2"}`.padEnd(28, "a"),
    compositionRevision: `${suffix}-r1`,
    aspectRatio,
    sourceTreatment: "redesign",
    sourceSlideRedesignId: `slide-${suffix}`,
    cropLayoutRevision: `crop-${suffix}`,
    textLayoutRevision: `text-${suffix}`,
    safeAreaRevision: `safe-${suffix}`,
    effectiveConfigurationHash: hash,
    dependencyIdentity: { visual: hash },
    approval: { state: "approved", approvalId: "approval-1" },
    provenance: { sourceAssetId: "source-1", sourceChecksum: hash, sourceRevisionId: "source-r1" },
    reuseRationale: "language-independent-visual",
    regenerationRationale: "new-composition",
    fingerprint: hash,
  };
}

describe("independent format composition render handoff", () => {
  it("accepts shared semantic imagery only with distinct composition and source-slide identities", () => {
    const result = assertIndependentFormatCompositionHandoffs([handoff("9:16"), handoff("16:9")]);
    expect(result.map((entry) => entry.aspectRatio)).toEqual(["16:9", "9:16"]);
    expect(result[0].sharedImageIdentity).toBe(result[1].sharedImageIdentity);
  });

  it("rejects shared composition identifiers before rendering", () => {
    const landscape = handoff("16:9");
    const portrait = { ...handoff("9:16"), compositionId: landscape.compositionId };
    expect(() => assertIndependentFormatCompositionHandoffs([landscape, portrait]))
      .toThrow("FORMAT_COMPOSITION_SHARED_ID");
  });
});
