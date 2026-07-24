import { describe, expect, it } from "vitest";
import { loadCurriculumRelease } from "../curriculum/release.js";
import { planMathBatchItems } from "./batch-planner.js";

describe("math batch capability planner", () => {
  async function gradeFiveRelease() {
    const release = await loadCurriculumRelease(
      "packages/math-education/data/curriculum/v1"
    );
    const byId = new Map(release.skills.map((skill) => [skill.skillId, skill]));
    return release.graph.order
      .filter((skillId) => skillId.startsWith("M5-"))
      .map((skillId) => byId.get(skillId)!);
  }

  it("excludes unsupported skills from the simulation batch", async () => {
    const gradeFive = await gradeFiveRelease();
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

  it("plans every Class 5 standard lesson for private production", async () => {
    const gradeFive = await gradeFiveRelease();
    const plan = planMathBatchItems({
      skills: gradeFive,
      variant: "standard",
      language: "de",
      capabilityMode: "private-production",
    });
    expect(plan.items).toHaveLength(37);
    expect(plan.items.map((item) => item.skillId)).toEqual(
      gradeFive.map((skill) => skill.skillId)
    );
    expect(plan.excluded).toEqual([]);
  });

  it("rejects non-standard private production variants", async () => {
    const gradeFive = await gradeFiveRelease();
    const plan = planMathBatchItems({
      skills: gradeFive,
      variant: "challenge",
      language: "de",
      capabilityMode: "private-production",
    });
    expect(plan.items).toEqual([]);
    expect(plan.excluded).toHaveLength(37);
    expect(
      plan.excluded.every((item) => item.reason === "unsupported-variant")
    ).toBe(true);
  });
});
