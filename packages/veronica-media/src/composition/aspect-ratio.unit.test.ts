import { describe, expect, it } from "vitest";
import {
  VERONICA_DEFAULT_LANDSCAPE_PROFILE,
  VERONICA_DEFAULT_PORTRAIT_PROFILE,
} from "../contracts/media-plan.v1.js";
import {
  SCENE_COMPOSITION_BLIND_CROP,
  SCENE_COMPOSITION_SAFE_AREA_VIOLATION,
  SCENE_COMPOSITION_TEXT_TOO_SMALL,
  FORMAT_COMPOSITION_BLIND_CROP,
  planIndependentFormatCompositions,
  validateIndependentSceneCompositions,
  validateSceneCompositionReadability,
} from "./aspect-ratio.js";

describe("scene composition readability", () => {
  it("checks each ratio against its own safe area and text scale", () => {
    const issues = validateSceneCompositionReadability({
      sceneId: "scene-1",
      aspectRatio: "9:16",
      profile: VERONICA_DEFAULT_PORTRAIT_PROFILE,
      compositionId: "portrait-scene-1",
      sourceTreatment: "reflow",
      textBlocks: [{ x: 10, y: 10, width: 400, height: 80, fontSize: 20, role: "title" }],
    });
    expect(issues.map((issue) => issue.code)).toEqual([
      SCENE_COMPOSITION_SAFE_AREA_VIOLATION,
      SCENE_COMPOSITION_TEXT_TOO_SMALL,
    ]);
  });

  it("rejects blind crops and shared composition identities across aspect ratios", () => {
    const issues = validateIndependentSceneCompositions([
      {
        sceneId: "scene-1",
        aspectRatio: "16:9",
        profile: VERONICA_DEFAULT_LANDSCAPE_PROFILE,
        compositionId: "shared-source-frame",
        sourceTreatment: "redesign",
        textBlocks: [],
      },
      {
        sceneId: "scene-1",
        aspectRatio: "9:16",
        profile: VERONICA_DEFAULT_PORTRAIT_PROFILE,
        compositionId: "shared-source-frame",
        sourceTreatment: "blind-crop",
        textBlocks: [],
      },
    ]);
    expect(issues.filter((issue) => issue.code === SCENE_COMPOSITION_BLIND_CROP)).toHaveLength(2);
  });
});

describe("independent format composition artifacts", () => {
  const hash = "a".repeat(64);

  it("reuses one semantic image identity while persisting distinct versioned format compositions", () => {
    const artifacts = planIndependentFormatCompositions({
      sceneId: "scene-1",
      narrationRevisionId: "narration-r2",
      visualSemanticRevisionId: "visual-r3",
      sharedImageIdentity: hash,
      source: { sourceAssetId: "source-1", sourceChecksum: hash, sourceRevisionId: "source-r1" },
      effectiveConfiguration: { designSystemRevision: "design-r4" },
      dependencyIdentity: { narration: hash, visual: hash },
      approval: { state: "approved", approvalId: "approval-1" },
      formats: [
        {
          aspectRatio: "16:9",
          compositionRevision: "landscape-r2",
          sourceTreatment: "redesign",
          sourceSlideRedesignId: "slide-16x9-r2",
          cropLayoutRevision: "crop-16x9-r2",
          textLayoutRevision: "text-16x9-r2",
          safeAreaRevision: "safe-16x9-r2",
          regenerationRationale: "new-composition",
        },
        {
          aspectRatio: "9:16",
          compositionRevision: "portrait-r5",
          sourceTreatment: "reflow",
          sourceSlideRedesignId: "slide-9x16-r5",
          cropLayoutRevision: "crop-9x16-r5",
          textLayoutRevision: "text-9x16-r5",
          safeAreaRevision: "safe-9x16-r5",
          regenerationRationale: "format-layout-changed",
        },
      ],
    });

    expect(artifacts.map((artifact) => artifact.contentProfileId)).toEqual([
      "veronicabenini",
      "veronicabenini",
    ]);
    expect(artifacts.map((artifact) => artifact.sharedImageIdentity)).toEqual([hash, hash]);
    expect(artifacts[0]?.compositionId).not.toBe(artifacts[1]?.compositionId);
    expect(artifacts[0]?.sourceSlideRedesignId).not.toBe(artifacts[1]?.sourceSlideRedesignId);
    expect(artifacts[0]?.approval.state).toBe("approved");
    expect(artifacts.map((artifact) => artifact.reuseRationale)).toEqual([
      "language-independent-visual",
      "language-independent-visual",
    ]);
  });

  it("fails closed before work when either derivative is a blind crop", () => {
    expect(() => planIndependentFormatCompositions({
      sceneId: "scene-1",
      narrationRevisionId: "narration-r2",
      visualSemanticRevisionId: "visual-r3",
      sharedImageIdentity: hash,
      source: { sourceAssetId: "source-1", sourceChecksum: hash, sourceRevisionId: "source-r1" },
      effectiveConfiguration: {},
      dependencyIdentity: { visual: hash },
      approval: { state: "review" },
      formats: [
        { aspectRatio: "16:9", compositionRevision: "r1", sourceTreatment: "redesign", sourceSlideRedesignId: "slide-landscape", cropLayoutRevision: "crop-landscape", textLayoutRevision: "text-landscape", safeAreaRevision: "safe-landscape", regenerationRationale: "new-composition" },
        { aspectRatio: "9:16", compositionRevision: "r1", sourceTreatment: "blind-crop", sourceSlideRedesignId: "slide-portrait", cropLayoutRevision: "crop-portrait", textLayoutRevision: "text-portrait", safeAreaRevision: "safe-portrait", regenerationRationale: "new-composition" },
      ],
    })).toThrow(FORMAT_COMPOSITION_BLIND_CROP);
  });
});
