import { describe, expect, it } from "vitest";
import { sceneSchema } from "@mediaforge/domain";
import {
  createImagePrompt,
  renderPromptTemplate,
  defaultPromptTemplate,
} from "./index.js";

describe("prompt rendering", () => {
  it("replaces template variables", () => {
    const rendered = renderPromptTemplate(defaultPromptTemplate, {
      GLOBAL_STYLE: "clean editorial",
      ASPECT_RATIO: "16:9",
      SCENE_NUMBER: 1,
      TIMESTAMP_START: "00:00",
      TIMESTAMP_END: "00:04",
      VISUAL_PURPOSE: "introduce the topic",
      DISTINCTIVE_ANCHOR: "a person | talking | studio",
      SUBJECT: "a person",
      ACTION: "talking",
      SETTING: "studio",
      COMPOSITION: "centered",
      CAMERA: "medium shot",
      LIGHTING: "soft",
      MOOD: "calm",
      CONTINUITY: "none",
      SOURCE_NARRATION: "narration text",
      SCENE_PROMPT: "scene prompt text",
      BRAND_GUIDANCE: "none",
      NEGATIVE_PROMPT: "text"
    });
    expect(rendered).toContain("clean editorial");
    expect(rendered).toContain("ASPECT RATIO: 16:9");
  });

  it("builds a scene prompt with conditional text policy", () => {
    const scene = sceneSchema.parse({
      id: "scene-001",
      sequenceNumber: 1,
      canonicalNarration: "A plaque reads ROOM 237.",
      sourceSegmentIds: ["segment-001"],
      estimatedDurationSeconds: 4,
      timing: { startSeconds: 0, endSeconds: 4 },
      visualPurpose: "reveal",
      subject: "hotel plaque",
      action: "shows the room number",
      setting: "dim hallway",
      composition: "centered",
      cameraFraming: "medium shot",
      mood: "uneasy",
      continuityReferences: [],
      onScreenText: "",
      negativeConstraints: [],
      aspectRatios: ["16:9"],
      imagePrompt: "hotel plaque with the number",
      expectedImageFilenames: ["scene-001__000000-000004__16x9.png"],
      qualityStatus: "draft",
      textRequirement: {
        required: true,
        text: "ROOM 237",
        placement: "on the worn brass plaque",
        reason: "The room number is essential to the narrated reveal.",
      },
    });
    const prompt = createImagePrompt(scene, "16:9", "clean editorial", "none");

    expect(prompt.prompt).toContain('Render exactly: "ROOM 237".');
    expect(prompt.prompt).toContain("Placement: on the worn brass plaque.");
    expect(prompt.prompt).not.toContain("Do not include captions, subtitles, labels, logos, watermarks, or readable text.");
    expect(prompt.negativePrompt).not.toContain("no readable text");
  });
});
