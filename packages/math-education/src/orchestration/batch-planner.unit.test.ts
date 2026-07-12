import { describe, expect, it } from "vitest";
import { loadCurriculumRelease } from "../curriculum/release.js";
import { planMathBatchItems } from "./batch-planner.js";

describe("math batch capability planner", () => {
  it("excludes unsupported skills before execution", async () => {
    const release = await loadCurriculumRelease(
      "packages/math-education/data/curriculum/v1"
    );
    const gradeFive = release.skills.filter(
      (skill) => skill.canonicalGrade === 5
    );
    const plan = planMathBatchItems({
      skills: gradeFive,
      variant: "standard",
      language: "de",
    });
    expect(plan.items.map((item) => item.skillId)).toEqual([
      "M5-ZO-001",
      "M5-GM-002",
      "M5-DZ-001",
    ]);
    expect(plan.excluded).toHaveLength(34);
    expect(
      plan.excluded.every((item) => item.reason === "unsupported-skill")
    ).toBe(true);
  });
});
