import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadCurriculumRelease } from "../curriculum/release.js";
import { canonicalHash } from "../verification/canonical-json.js";
import { buildAllLessonVariants } from "./variant-builder.js";
import {
  assertNotNearDuplicateLessons,
  validateRequiredEducationalPractice,
  validateVariantDifferentiation,
} from "./lesson-validator.js";

const releaseRoot = "packages/math-education/data/curriculum/v1";

describe("lesson variants", () => {
  it("builds genuine number, geometry, and data variants", async () => {
    const release = await loadCurriculumRelease(releaseRoot);
    for (const skillId of ["M5-ZO-001", "M5-GM-002", "M5-DZ-001"]) {
      const skill = release.skills.find((item) => item.skillId === skillId);
      expect(skill).toBeDefined();
      if (!skill) continue;
      const variants = buildAllLessonVariants(skill);
      expect(() => validateVariantDifferentiation(variants)).not.toThrow();
      expect(new Set(variants.map((item) => item.contentHash))).toHaveLength(3);
      for (const variant of variants) {
        expect(variant.targetDurationSeconds).toBe(300);
        const facts = new Map(
          variant.facts.map((fact) => [fact.factId, fact.semantic])
        );
        expect(
          canonicalHash(facts.get(variant.challenge.solutionFactId))
        ).not.toBe(
          canonicalHash(facts.get(variant.workedExamples[0]!.solutionFactId))
        );
        expect(() =>
          validateRequiredEducationalPractice(variant)
        ).not.toThrow();
        expect(variant.scenes[4]!.factIds).toContain(
          variant.commonMistake.correctionFactId
        );
        expect(variant.scenes[6]!.factIds).not.toContain(
          variant.challenge.solutionFactId
        );
        expect(variant.scenes[7]!.factIds).toContain(
          variant.challenge.solutionFactId
        );
        expect(variant.scenes[8]!.factIds).toEqual([]);
      }
    }
  });

  it("rejects retrieval guidance and a repeated place-value zero pattern", async () => {
    const release = await loadCurriculumRelease(releaseRoot);
    const skill = release.skills.find((item) => item.skillId === "M5-ZO-001")!;
    const lesson = buildAllLessonVariants(skill).find(
      (variant) => variant.variant === "standard"
    )!;

    const guidedRetrieval = structuredClone(lesson);
    guidedRetrieval.scenes[8]!.factIds = [
      guidedRetrieval.challenge.solutionFactId,
    ];
    expect(() => validateRequiredEducationalPractice(guidedRetrieval)).toThrow(
      /retrieval question/u
    );

    const repeatedPattern = structuredClone(lesson);
    const challengeSolution = repeatedPattern.facts.find(
      (fact) => fact.factId === repeatedPattern.challenge.solutionFactId
    )!;
    challengeSolution.displayLatex = "640708";
    expect(() => validateRequiredEducationalPractice(repeatedPattern)).toThrow(
      /different zero pattern/u
    );
  });

  it("detects a pure prose and number-material near duplicate", async () => {
    const release = await loadCurriculumRelease(releaseRoot);
    const skill = release.skills.find((item) => item.skillId === "M5-ZO-001")!;
    const standard = buildAllLessonVariants(skill).find(
      (variant) => variant.variant === "standard"
    )!;
    const superficialCopy = {
      ...standard,
      promise: "Andere Worte",
      facts: standard.facts.map((fact) => ({
        ...fact,
        displayLatex: `9${fact.displayLatex}`,
      })),
      contentHash: "f".repeat(64),
    };
    expect(() =>
      assertNotNearDuplicateLessons(standard, superficialCopy)
    ).toThrow(/Near-duplicate/u);
  });

  it("fails closed for skills without an approved fixture", async () => {
    const release = await loadCurriculumRelease(releaseRoot);
    const skill = release.skills.find((item) => item.skillId === "M5-ZO-002")!;
    expect(() => buildAllLessonVariants(skill)).toThrow(
      /Unsupported lesson specification/u
    );
  });

  it("does not mutate the curriculum seed", async () => {
    const seedPath = "docs/mathe/curriculum/03-machine-readable-seed.md";
    const before = await fs.readFile(seedPath, "utf8");
    const release = await loadCurriculumRelease(releaseRoot);
    buildAllLessonVariants(
      release.skills.find((item) => item.skillId === "M5-ZO-001")!
    );
    expect(await fs.readFile(seedPath, "utf8")).toBe(before);
  });
});
