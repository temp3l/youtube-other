import { describe, expect, it } from "vitest";

import { revalidateMathLessonDryRun } from "./lesson-revalidation.js";

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

describe("math lesson dry-run revalidation", () => {
  it("preserves current artefacts and schedules no work", () => {
    expect(revalidateMathLessonDryRun({
      profile: "mathematics-education",
      lessonId: "m5-dz-001-standard",
      existing: vector,
      current: vector,
    })).toMatchObject({
      disposition: "compliant",
      mutatesArtifacts: false,
      automaticRegeneration: false,
      nextCommand: "mediaforge math lesson validate --lesson m5-dz-001-standard",
    });
  });

  it("classifies semantic changes at the smallest safe regeneration boundary", () => {
    expect(revalidateMathLessonDryRun({
      profile: "mathematics-education",
      lessonId: "m5-dz-001-standard",
      existing: vector,
      current: { ...vector, numberVerbalizerVersion: "numbers.v3" },
    })).toMatchObject({ disposition: "narration-regeneration" });
    expect(revalidateMathLessonDryRun({
      profile: "mathematics-education",
      lessonId: "m5-dz-001-standard",
      existing: vector,
      current: { ...vector, rendererVersion: "renderer.v3" },
    })).toMatchObject({ disposition: "scene-plan-regeneration" });
    expect(revalidateMathLessonDryRun({
      profile: "mathematics-education",
      lessonId: "m5-dz-001-standard",
      existing: vector,
      current: { ...vector, canonicalMathModelVersion: "canonical.v3" },
    })).toMatchObject({ disposition: "full-regeneration" });
  });

  it("does not represent non-math inputs", () => {
    expect(() => revalidateMathLessonDryRun({
      profile: "dark-truth",
      lessonId: "episode-001",
      existing: vector,
      current: vector,
    })).toThrow();
  });
});
