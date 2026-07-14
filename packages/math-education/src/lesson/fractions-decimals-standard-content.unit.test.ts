import { describe, expect, it } from "vitest";
import { loadCurriculumRelease } from "../curriculum/release.js";
import { expressionNodeSchema } from "../domain/index.js";
import { localizeNarration } from "../localization/localization.js";
import { canonicalHash } from "../verification/canonical-json.js";
import { buildLessonVariant } from "./variant-builder.js";
import {
  FRACTIONS_DECIMALS_STANDARD_SKILL_IDS,
  loadAllFractionsDecimalsStandardContent,
  loadFractionsDecimalsStandardContent,
} from "./fractions-decimals-standard-content.js";
import {
  assertExactLessonContentReview,
  lessonContentSetIdentity,
  productionLessonContentSchema,
} from "./production-content.js";

const releaseRoot = "packages/math-education/data/curriculum/v1";

function exactTestReviewEvidence() {
  const target = lessonContentSetIdentity(loadAllFractionsDecimalsStandardContent());
  const payload = {
    artifactVersion: "lesson-content-review.v1" as const,
    contractVersion: "lesson-content-contract.v1" as const,
    contentVersion: "class5-fractions-decimals-standard.v1" as const,
    curriculumReleaseId: "de-gems-5-10-v1" as const,
    curriculumVersion: "1.0.0-draft.1",
    curriculumReleaseHash: "9afb5e2c0ed7a10628df7f5d1d589739995910900d66b5b479894a3a95360b31",
    ...target,
    decision: "APPROVE_EXACT_TARGET" as const,
    reviewer: { stableId: "unit-test-reviewer", name: "Unit Test Reviewer", role: "test fixture only", organization: "local test suite" },
    reviewedAt: "2026-07-14T12:00:00+00:00",
    externalEvidenceId: "unit-test-evidence-not-production",
  };
  return { ...payload, evidenceHash: canonicalHash(payload) };
}

describe("Class 5 fractions and decimals production content", () => {
  it("loads, builds, and deterministically German-localizes all eight exact standard lessons", async () => {
    const release = await loadCurriculumRelease(releaseRoot);
    const specifications = loadAllFractionsDecimalsStandardContent();
    expect(specifications).toHaveLength(8);
    expect(specifications.map((item) => item.skillId)).toEqual(FRACTIONS_DECIMALS_STANDARD_SKILL_IDS);
    expect(new Set(specifications.map((item) => item.contentHash))).toHaveLength(8);

    for (const specification of specifications) {
      expect(productionLessonContentSchema.parse(specification)).toEqual(specification);
      expect(specification.reviewStatus).toBe("pending-external-review");
      expect(specification.prerequisiteReviewStatus).toBe("proposed-unreviewed");
      const skill = release.skills.find((candidate) => candidate.skillId === specification.skillId)!;
      const lesson = buildLessonVariant(skill, "standard");
      expect(buildLessonVariant(skill, "standard").contentHash).toBe(lesson.contentHash);
      const first = localizeNarration(lesson, "de");
      const second = localizeNarration(lesson, "de");
      expect(second.contentHash).toBe(first.contentHash);
      expect(first.resolvedFacts.map((fact) => fact.semanticHash)).toEqual(
        lesson.facts.map((fact) => canonicalHash(fact.semantic))
      );
    }

    const decimalLesson = buildLessonVariant(
      release.skills.find((skill) => skill.skillId === "M5-ZO-024")!,
      "standard"
    );
    const narration = localizeNarration(decimalLesson, "de");
    expect(narration.resolvedFacts.some((fact) => fact.display.includes("0,50"))).toBe(true);
    expect(narration.resolvedFacts.some((fact) => fact.spoken.includes("Komma fuenf null"))).toBe(true);
  });

  it("keeps review activation exact and rejects stale or mutated identities", async () => {
    const specifications = loadAllFractionsDecimalsStandardContent();
    expect(() => assertExactLessonContentReview(specifications, null)).toThrow();
    expect(() => assertExactLessonContentReview(specifications, exactTestReviewEvidence())).not.toThrow();

    const changedVisual = structuredClone(specifications[0]!);
    const check = changedVisual.checks[0]!;
    if (check.kind !== "fraction-decimal-domain" || check.evidence.mode !== "fraction-part") throw new Error("test setup");
    check.evidence.visual.shadedParts = 4;
    expect(() => productionLessonContentSchema.parse(changedVisual)).toThrow(/content hash/u);

    const release = await loadCurriculumRelease(releaseRoot);
    const stale = { ...release.skills.find((skill) => skill.skillId === "M5-ZO-017")!, learningObjective: "Veraltet" };
    expect(() => loadFractionsDecimalsStandardContent(stale)).toThrow(/stale curriculum identity/u);
  });

  it("rejects zero and negative denominators and unsupported recurring decimal shapes", () => {
    expect(expressionNodeSchema.safeParse({ kind: "rational", numerator: "1", denominator: "0" }).success).toBe(false);
    expect(expressionNodeSchema.safeParse({ kind: "rational", numerator: "1", denominator: "-3" }).success).toBe(false);
    expect(expressionNodeSchema.safeParse({ kind: "decimal", recurring: "3" }).success).toBe(false);
  });
});
