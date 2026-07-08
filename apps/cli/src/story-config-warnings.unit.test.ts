import { describe, expect, it } from "vitest";
import { buildStoryGenerationWarnings } from "./story-config-warnings.js";

describe("story config warnings", () => {
  it("emits warning-only cost guidance", () => {
    const warnings = buildStoryGenerationWarnings({
      storyModel: "gpt-5.4-medium",
      localizationModel: "gpt-5.4-medium",
      shortMaxOutputTokens: 2400,
      validatorMaxOutputTokens: 3500,
      storyMaxOutputTokens: 8000,
      targetWords: 1800,
    });
    expect(warnings).toEqual([
      expect.stringContaining("Short max output tokens"),
      expect.stringContaining("Localization model matches"),
      expect.stringContaining("Story max output tokens"),
      expect.stringContaining("Validator max output tokens"),
    ]);
  });
});
