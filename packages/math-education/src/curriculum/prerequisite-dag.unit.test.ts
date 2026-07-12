import { describe, expect, it } from "vitest";
import { curriculumSkillSchema } from "../domain/index.js";
import { analyzePrerequisiteDag, validatePrerequisiteDag } from "./dag.js";

const skill = (skillId: string, seedOrder: number) =>
  curriculumSkillSchema.parse({
    skillId,
    canonicalGrade: 5,
    domain: "Zahl",
    topic: "Test",
    learningObjective: "Testziel",
    placementConfidence: "high",
    processCompetencies: ["REP"],
    sourceMappings: [
      {
        sourceId: "kmk",
        section: "x",
        coverage: "direct",
        reviewStatus: "reviewed",
      },
    ],
    durationSeconds: 240,
    allowedVariants: ["foundation", "standard", "challenge"],
    editorialStatus: "draft",
    prerequisiteIds: [],
    seedOrder,
  });

describe("prerequisite DAG", () => {
  const skills = [
    skill("M5-ZO-001", 0),
    skill("M5-ZO-002", 1),
    skill("M5-ZO-003", 2),
  ];
  const edge = (from: string, to: string, kind = "required") => ({
    from,
    to,
    kind,
    rationale: "x",
    provenance: "editor",
    reviewStatus: "reviewed",
  });
  it("returns a stable topological order", () => {
    expect(
      validatePrerequisiteDag(skills, [
        {
          from: "M5-ZO-001",
          to: "M5-ZO-003",
          kind: "required",
          rationale: "builds on",
          provenance: "editor",
          reviewStatus: "reviewed",
        },
      ])
    ).toEqual(["M5-ZO-001", "M5-ZO-002", "M5-ZO-003"]);
  });
  it("reports a useful cycle path", () => {
    expect(() =>
      validatePrerequisiteDag(skills, [
        edge("M5-ZO-001", "M5-ZO-002"),
        edge("M5-ZO-002", "M5-ZO-001"),
      ])
    ).toThrow(/M5-ZO-001 -> M5-ZO-002 -> M5-ZO-001/u);
  });

  it("blocks parallel edges even when their kinds differ", () => {
    expect(() =>
      validatePrerequisiteDag(skills, [
        edge("M5-ZO-001", "M5-ZO-002"),
        edge("M5-ZO-001", "M5-ZO-002", "recommended"),
      ])
    ).toThrow(/Parallel prerequisite edge/u);
  });

  it("reports disconnected nodes in stable order", () => {
    expect(
      analyzePrerequisiteDag(skills, [edge("M5-ZO-001", "M5-ZO-003")])
        .disconnectedSkillIds
    ).toEqual(["M5-ZO-002"]);
  });
});
