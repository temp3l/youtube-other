import { describe, expect, it } from "vitest";

import {
  affectedMathSemanticStages,
  createMathSemanticCacheKey,
} from "./semantic-cache.js";

const vector = {
  profile: "mathematics-education" as const,
  lessonSchemaVersion: "lesson.v2",
  canonicalMathModelVersion: "canonical.v2",
  gradeProfileVersion: "grade.v1",
  narrationCompilerVersion: "narration.v2",
  numberVerbalizerVersion: "numbers.v2",
  locale: "de-DE",
  voicePresetVersion: "teacher.v1",
  rendererVersion: "renderer.v2",
  promptVersion: "prompt.v2",
};

describe("math semantic cache", () => {
  it("has a stable, math-only fingerprint", () => {
    expect(createMathSemanticCacheKey({ lessonId: "m5-dz-001", versionVector: vector }))
      .toEqual(createMathSemanticCacheKey({ lessonId: "m5-dz-001", versionVector: vector }));
    expect(() => createMathSemanticCacheKey({
      lessonId: "episode-001",
      versionVector: { ...vector, profile: "dark-truth" },
    })).toThrow();
  });

  it("invalidates only narration downstream artefacts when narration semantics change", () => {
    expect(affectedMathSemanticStages({
      previous: vector,
      current: { ...vector, narrationCompilerVersion: "narration.v3" },
    })).toEqual(["canonical-narration", "subtitles", "tts", "timing", "render", "metadata", "quality-report"]);
  });

  it("keeps speech artefacts when only visual semantics change", () => {
    expect(affectedMathSemanticStages({
      previous: vector,
      current: { ...vector, rendererVersion: "renderer.v3" },
    })).toEqual(["scene-plan", "timing", "render", "metadata", "quality-report"]);
  });
});

