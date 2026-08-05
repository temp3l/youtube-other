import { describe, expect, it } from "vitest";

import { loadCurriculumRelease } from "../curriculum/release.js";
import { localizeNarration } from "../localization/localization.js";
import {
  assertEducationalQuality,
  assessEducationalQuality,
} from "./educational-quality.js";
import { buildLessonVariant } from "./variant-builder.js";

async function tallyLesson() {
  const release = await loadCurriculumRelease(
    "packages/math-education/data/curriculum/v1"
  );
  const skill = release.skills.find((candidate) => candidate.skillId === "M5-DZ-001");
  if (!skill) throw new Error("Missing M5-DZ-001 fixture.");
  const lesson = buildLessonVariant(skill, "standard");
  return { lesson, narration: localizeNarration(lesson, "de") };
}

describe("educational semantic quality", () => {
  it("accepts the learner-safe Urliste/Strichliste lesson with structured scores", async () => {
    const input = await tallyLesson();
    const report = assessEducationalQuality(input);

    expect(report.passed).toBe(true);
    expect(report.blockingIssues).toEqual([]);
    expect(report.gradeBand).toBe("grades-5-6");
    expect(report.objectiveAlignment).toBe(100);
    expect(report.taskClarity).toBe(100);
    expect(report.visualNarrationAlignment).toBe(100);
    expect(report.overall).toBeGreaterThanOrEqual(80);
    expect(() => assertEducationalQuality(report)).not.toThrow();
  });

  it("blocks internal language, unbound scene data, and missing objective coverage", async () => {
    const input = await tallyLesson();
    const narration = structuredClone(input.narration);
    narration.segments[0]!.spokenText += " Wir zeigen ein geprüftes Modell.";
    narration.segments[2]!.factIds = ["unknown-value"];
    narration.segments[3]!.spokenText = "Wir zählen jetzt.";

    const report = assessEducationalQuality({ lesson: input.lesson, narration });
    const codes = report.blockingIssues.map((candidate) => candidate.code);
    expect(codes).toContain("MATH_INTERNAL_LANGUAGE_LEAK");
    expect(codes).toContain("MATH_SCENE_SYNC_MISMATCH");
    expect(codes).toContain("MATH_NARRATED_VALUE_UNBOUND");
    expect(codes).toContain("MATH_OBJECTIVE_COVERAGE_MISSING");
    expect(() => assertEducationalQuality(report)).toThrow(
      /Educational quality blocked/u
    );
  });

  it("blocks raw frequency tuples in tally-list display content", async () => {
    const input = await tallyLesson();
    const narration = structuredClone(input.narration);
    narration.segments[2]!.displayText += " (4, 3, 5)";

    const report = assessEducationalQuality({ lesson: input.lesson, narration });
    expect(report.blockingIssues.map((candidate) => candidate.code)).toContain(
      "MATH_NARRATED_VALUE_UNBOUND"
    );
  });
});
