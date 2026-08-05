import { describe, expect, it } from "vitest";
import {
  buildLessonVariant,
  createTimingManifest,
  loadCurriculumRelease,
  localizeNarration,
  mathVisualPlanSchema,
} from "@mediaforge/math-education";

import { validateMathSceneSemanticSync } from "./scene-semantic-sync.js";

async function fixture() {
  const release = await loadCurriculumRelease("packages/math-education/data/curriculum/v1");
  const skill = release.skills.find((entry) => entry.skillId === "M5-DZ-001");
  if (!skill) throw new Error("Missing M5-DZ-001 fixture.");
  const lesson = buildLessonVariant(skill, "standard");
  const narration = localizeNarration(lesson, "de");
  const visualPlan = mathVisualPlanSchema.parse({
    artifactVersion: "math-visual-plan.v1",
    profile: "grades-5-7-v1",
    scenes: lesson.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      component: scene.visualComponent,
      factIds: scene.factIds,
      teacherAssetVersion: "alex.v1-placeholder",
    })),
  });
  return { lesson, narration, visualPlan, timing: createTimingManifest(lesson, narration) };
}

describe("math scene semantic synchronization", () => {
  it("accepts the M5-DZ-001 Urliste/Strichliste scene mapping", async () => {
    const input = await fixture();
    expect(validateMathSceneSemanticSync(input)).toMatchObject({ valid: true, issues: [] });
  });

  it("rejects an orphan category fact in the visual plan", async () => {
    const input = await fixture();
    const visualPlan = structuredClone(input.visualPlan);
    visualPlan.scenes[2]!.factIds = ["orphan-category"];
    const report = validateMathSceneSemanticSync({ ...input, visualPlan });
    expect(report.issues.map((entry) => entry.code)).toContain("UNKNOWN_FACT");
  });

  it("rejects a previous-scene fact transplant in narration", async () => {
    const input = await fixture();
    const narration = structuredClone(input.narration);
    const prior = narration.segments[2]!;
    narration.segments[3] = {
      ...narration.segments[3]!,
      tokenizedText: prior.tokenizedText,
      displayText: prior.displayText,
      spokenText: prior.spokenText,
      factIds: [...prior.factIds],
    };
    const report = validateMathSceneSemanticSync({ ...input, narration });
    expect(report.issues.map((entry) => entry.code)).toContain("NARRATION_FACT_ORDER_MISMATCH");
  });

  it("rejects a solution that no longer answers its challenge", async () => {
    const input = await fixture();
    const lesson = structuredClone(input.lesson);
    lesson.challenge.solutionFactId = lesson.challenge.steps[0]!.factId;
    const report = validateMathSceneSemanticSync({ ...input, lesson });
    expect(report.issues.map((entry) => entry.code)).toContain("TASK_SOLUTION_MISMATCH");
  });

  it("rejects timing cues that do not match scene bindings", async () => {
    const input = await fixture();
    const timing = structuredClone(input.timing);
    timing.scenes[2]!.cueFrames = [];
    const report = validateMathSceneSemanticSync({ ...input, timing });
    expect(report.issues.map((entry) => entry.code)).toContain("TIMING_CUE_COUNT_MISMATCH");
  });
});
