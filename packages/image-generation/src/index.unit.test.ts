import { describe, expect, it } from "vitest";
import { renderPromptTemplate, defaultPromptTemplate } from "./index.js";

describe("prompt rendering", () => {
  it("replaces template variables", () => {
    const rendered = renderPromptTemplate(defaultPromptTemplate, {
      GLOBAL_STYLE: "clean editorial",
      ASPECT_RATIO: "16:9",
      SCENE_NUMBER: 1,
      TIMESTAMP_START: "00:00",
      TIMESTAMP_END: "00:04",
      VISUAL_PURPOSE: "introduce the topic",
      SUBJECT: "a person",
      ACTION: "talking",
      SETTING: "studio",
      COMPOSITION: "centered",
      CAMERA: "medium shot",
      LIGHTING: "soft",
      MOOD: "calm",
      CONTINUITY: "none",
      BRAND_GUIDANCE: "none",
      NEGATIVE_PROMPT: "text"
    });
    expect(rendered).toContain("clean editorial");
    expect(rendered).toContain("ASPECT RATIO: 16:9");
  });
});

