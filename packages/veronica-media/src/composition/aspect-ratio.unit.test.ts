import { describe, expect, it } from "vitest";
import {
  VERONICA_DEFAULT_LANDSCAPE_PROFILE,
  VERONICA_DEFAULT_PORTRAIT_PROFILE,
} from "../contracts/media-plan.v1.js";
import {
  SCENE_COMPOSITION_BLIND_CROP,
  SCENE_COMPOSITION_SAFE_AREA_VIOLATION,
  SCENE_COMPOSITION_TEXT_TOO_SMALL,
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
