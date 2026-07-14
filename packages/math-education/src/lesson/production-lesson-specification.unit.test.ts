import { describe, expect, it } from "vitest";
import { loadCurriculumRelease } from "../curriculum/release.js";
import { buildFactLock } from "../localization/fact-lock.js";
import { localizeNarration } from "../localization/localization.js";
import { canonicalHash } from "../verification/canonical-json.js";
import {
  assertProductionLessonCapability,
  productionLessonCapability,
} from "./capabilities.js";
import {
  loadAllNumberOperationsStandardContent,
  loadNumberOperationsStandardContent,
  NUMBER_OPERATIONS_STANDARD_SKILL_IDS,
} from "./number-operations-standard-content.js";
import {
  assertExactLessonContentReview,
  lessonContentSetIdentity,
  productionLessonContentSchema,
} from "./production-content.js";
import { buildLessonVariant } from "./variant-builder.js";

const releaseRoot = "packages/math-education/data/curriculum/v1";

function rehashContent(value: Record<string, unknown>) {
  const { contentHash: _contentHash, ...content } = value;
  return { ...content, contentHash: canonicalHash(content) };
}

function exactTestReviewEvidence() {
  const specifications = loadAllNumberOperationsStandardContent();
  const target = lessonContentSetIdentity(specifications);
  const payload = {
    artifactVersion: "lesson-content-review.v1" as const,
    contractVersion: "lesson-content-contract.v1" as const,
    contentVersion: "class5-number-operations-standard.v1" as const,
    curriculumReleaseId: "de-gems-5-10-v1" as const,
    curriculumVersion: "1.0.0-draft.1",
    curriculumReleaseHash:
      "9afb5e2c0ed7a10628df7f5d1d589739995910900d66b5b479894a3a95360b31",
    ...target,
    decision: "APPROVE_EXACT_TARGET" as const,
    reviewer: {
      stableId: "unit-test-reviewer",
      name: "Unit Test Reviewer",
      role: "test fixture only",
      organization: "local test suite",
    },
    reviewedAt: "2026-07-14T12:00:00+00:00",
    externalEvidenceId: "unit-test-evidence-not-production",
  };
  return { ...payload, evidenceHash: canonicalHash(payload) };
}

describe("Class 5 number and operations production content", () => {
  it("loads, fingerprints, builds, and German-localizes all sixteen standard specifications", async () => {
    const release = await loadCurriculumRelease(releaseRoot);
    const specifications = loadAllNumberOperationsStandardContent();
    expect(specifications).toHaveLength(16);
    expect(specifications.map((item) => item.skillId)).toEqual(
      NUMBER_OPERATIONS_STANDARD_SKILL_IDS
    );
    expect(
      new Set(specifications.map((item) => item.contentHash))
    ).toHaveLength(16);

    for (const specification of specifications) {
      expect(productionLessonContentSchema.parse(specification)).toEqual(
        specification
      );
      expect(specification.reviewStatus).toBe("pending-external-review");
      expect(specification.sourceIdentity.sourceReviewStatus).toBe("pending");
      expect(specification.prerequisiteReviewStatus).toBe(
        "proposed-unreviewed"
      );
      expect(
        specification.scenes.reduce(
          (total, scene) => total + scene.plannedDurationSeconds,
          0
        )
      ).toBe(240);

      const skill = release.skills.find(
        (candidate) => candidate.skillId === specification.skillId
      )!;
      const first = buildLessonVariant(skill, "standard");
      const second = buildLessonVariant(skill, "standard");
      expect(second.contentHash).toBe(first.contentHash);
      expect(first.facts.every((fact) => fact.lineage.sourceContentHash)).toBe(
        true
      );
      const narration = localizeNarration(first, "de");
      expect(narration.factLockHash).toBe(buildFactLock(first).factLockHash);
      expect(narration.resolvedFacts.map((fact) => fact.semanticHash)).toEqual(
        first.facts.map((fact) => canonicalHash(fact.semantic))
      );
    }
  });

  it("keeps production capability closed without exact external review and does not alias variants", async () => {
    const release = await loadCurriculumRelease(releaseRoot);
    const skill = release.skills.find((item) => item.skillId === "M5-ZO-002")!;
    expect(productionLessonCapability(skill.skillId)).toMatchObject({
      status: "implemented-unreviewed",
      variants: ["standard"],
    });
    expect(() =>
      assertProductionLessonCapability(skill.skillId, "standard", null)
    ).toThrow(/unreviewed/u);
    expect(() => buildLessonVariant(skill, "foundation")).toThrow(
      /Unsupported lesson specification/u
    );
    expect(() => buildLessonVariant(skill, "challenge")).toThrow(
      /Unsupported lesson specification/u
    );

    const evidence = exactTestReviewEvidence();
    expect(() =>
      assertExactLessonContentReview(
        loadAllNumberOperationsStandardContent(),
        evidence
      )
    ).not.toThrow();
    expect(() =>
      assertProductionLessonCapability(skill.skillId, "standard", evidence)
    ).toThrow(/not registered for public use/u);
  });

  it("rejects forged hashes, duplicate facts, answer-key transplants, reordered steps, and stale curriculum identity", async () => {
    const specifications = loadAllNumberOperationsStandardContent();
    const first = structuredClone(specifications[0]!);
    const second = specifications[1]!;

    expect(() =>
      productionLessonContentSchema.parse({
        ...first,
        contentHash: "f".repeat(64),
      })
    ).toThrow(/content hash/u);

    const duplicateFact = structuredClone(first) as unknown as Record<
      string,
      unknown
    >;
    (duplicateFact["facts"] as unknown[]).push(
      structuredClone((duplicateFact["facts"] as unknown[])[0])
    );
    expect(() =>
      productionLessonContentSchema.parse(rehashContent(duplicateFact))
    ).toThrow(/Fact IDs must be unique/u);

    const transplanted = structuredClone(first) as unknown as Record<
      string,
      unknown
    >;
    (transplanted["answerKey"] as Array<Record<string, unknown>>)[0]![
      "sourceTaskHash"
    ] = second.answerKey[0]!.sourceTaskHash;
    expect(() =>
      productionLessonContentSchema.parse(rehashContent(transplanted))
    ).toThrow(/Answer-key identity/u);

    const reordered = structuredClone(first) as unknown as Record<
      string,
      unknown
    >;
    const worked = (
      reordered["workedExamples"] as Array<{
        steps: unknown[];
      }>
    )[0]!;
    worked.steps.reverse();
    expect(() =>
      productionLessonContentSchema.parse(rehashContent(reordered))
    ).toThrow(/ordered steps/u);

    const release = await loadCurriculumRelease(releaseRoot);
    const staleSkill = {
      ...release.skills.find((item) => item.skillId === "M5-ZO-001")!,
      learningObjective: "Veraltetes Lernziel",
    };
    expect(() => loadNumberOperationsStandardContent(staleSkill)).toThrow(
      /stale curriculum identity/u
    );

    const forgedEvidence = {
      ...exactTestReviewEvidence(),
      orderedContentHashes: [
        "0".repeat(64),
        ...exactTestReviewEvidence().orderedContentHashes.slice(1),
      ],
    };
    expect(() =>
      assertExactLessonContentReview(specifications, forgedEvidence)
    ).toThrow();
  });
});
