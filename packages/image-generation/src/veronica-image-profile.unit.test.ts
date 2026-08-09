import { describe, expect, it } from "vitest";
import {
  buildPromptFromSpec,
  type SceneVisualSpec,
} from "./episode-image-pipeline.js";

const spec: SceneVisualSpec = {
  sceneId: "scene-001",
  sequenceNumber: 1,
  narrativePurpose: "reveal",
  focalSubject: "a client choosing between hidden skill and visible proof",
  visibleAction: "the client selects the portfolio with visible evidence",
  environment: "a contemporary European consultation table",
  foreground: "two portfolios",
  background: "a restrained editorial studio",
  shotSize: "medium",
  cameraAngle: "point-of-view",
  sourceNarration: "Being good is not enough when nobody can see the proof.",
  textRequirement: { required: false },
  composition: "vertical decision split with a clear focal hierarchy",
  lighting: "clean directional daylight",
  timeOfDay: "day",
  mood: "direct and practical",
  distinctiveAnchor: "the visible proof portfolio",
  continuityElements: [],
  characters: [],
  prohibitedElements: [],
};

describe("Veronica image prompt profile", () => {
  it("keeps the approved prompt while enforcing editorial and creator-likeness boundaries", () => {
    const prompt = buildPromptFromSpec(spec, undefined, undefined, "9:16", {
      profile: "strategic-reinvention-editorial",
      authoritativeImagePrompt: "Text-free 9:16 client-decision image with a visible evidence trail.",
    });
    expect(prompt).toContain("visible evidence trail");
    expect(prompt).toContain("European editorial-documentary realism");
    expect(prompt).toContain("Do not depict, imitate, or create a synthetic likeness of Veronica Benini");
    expect(prompt).not.toContain("horror documentary");
  });
});
