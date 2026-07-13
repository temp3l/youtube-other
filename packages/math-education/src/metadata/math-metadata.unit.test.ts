import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadCurriculumRelease } from "../curriculum/release.js";
import { MATH_LANGUAGES } from "../domain/index.js";
import { buildLessonVariant } from "../lesson/variant-builder.js";
import { createMetadataTimingEvidence, createTimingManifest } from "../lesson/timing.js";
import { localizeNarration } from "../localization/localization.js";
import { createReviewedCurriculumFixture } from "../testing/reviewed-curriculum-fixture.js";
import {
  createMathMetadataEvidence,
  createMetadataWorkflowEvidence,
  createReviewedMetadataContext,
  generateMathMetadata,
  mathPlaylistCatalog,
} from "./math-metadata.js";

async function fixture(language: (typeof MATH_LANGUAGES)[number] = "de") {
  const curriculum = await createReviewedCurriculumFixture(
    await fs.mkdtemp(path.join(os.tmpdir(), "math-reviewed-release-"))
  );
  const skill = curriculum.skills.find((item) => item.skillId === "M5-ZO-001")!;
  const lesson = buildLessonVariant(skill, "standard");
  const localization = localizeNarration(lesson, language);
  const timing = createTimingManifest(lesson, localization);
  const timingEvidence = createMetadataTimingEvidence(lesson, localization, timing);
  const input = {
    reviewedContext: createReviewedMetadataContext(curriculum, skill.skillId),
    skill,
    lesson,
    localization,
    timingEvidence,
    workflowEvidence: createMetadataWorkflowEvidence({
      lesson,
      localization,
      timingEvidence,
      parentFingerprints: {
        lesson: ["1".repeat(64)],
        localization: ["2".repeat(64)],
        timing: ["3".repeat(64)],
        output: ["4".repeat(64)],
      },
    }),
    evidence: createMathMetadataEvidence(skill, lesson, localization),
    catalog: mathPlaylistCatalog,
  };
  return { input, metadata: generateMathMetadata(input) };
}

describe("production math metadata", () => {
  it("rejects the current draft release instead of inventing editorial review", async () => {
    const curriculum = await loadCurriculumRelease(
      path.resolve("packages/math-education/data/curriculum/v1")
    );
    expect(() =>
      createReviewedMetadataContext(curriculum, "M5-ZO-001")
    ).toThrow(/not reviewed/u);
  });
  it.each(MATH_LANGUAGES)("binds complete localized %s metadata to evidence and timing", async (language) => {
    const { input, metadata } = await fixture(language);
    expect(metadata.identity).toMatchObject({
      lessonId: input.lesson.lessonId,
      skillId: input.skill.skillId,
      language,
      variant: "standard",
    });
    expect(metadata.title.length).toBeLessThanOrEqual(100);
    expect(metadata.description.length).toBeLessThanOrEqual(5000);
    expect(metadata.chapters.map((chapter) => chapter.beat)).toEqual(["opening", "example", "challenge", "solution"]);
    expect(metadata.chapters.every((chapter) => chapter.seconds < input.timingEvidence.durationSeconds)).toBe(true);
    expect(metadata.tags.length).toBeGreaterThanOrEqual(3);
    expect(metadata.hashtags).toHaveLength(2);
    expect(metadata.playlists.map((playlist) => playlist.kind)).toEqual(["grade", "topic", "variant"]);
    if (language !== "de")
      expect(JSON.stringify(metadata)).not.toMatch(/\b(?:und|Klasse|Beispiel|Denkaufgabe|Mathematik)\b/u);
  });

  it("uses only the complete release-derived order and real boundaries", async () => {
    const { input } = await fixture();
    const metadata = generateMathMetadata(input);
    const index = input.reviewedContext.stableTopologicalOrder.indexOf(input.skill.skillId);
    expect(metadata.dagNeighbors).toEqual({
      previousSkillId: input.reviewedContext.stableTopologicalOrder[index - 1] ?? null,
      nextSkillId: input.reviewedContext.stableTopologicalOrder[index + 1] ?? null,
      orderHash: input.reviewedContext.stableTopologicalOrderHash,
    });
    for (const forged of [
      [],
      input.reviewedContext.stableTopologicalOrder.slice(1),
      [...input.reviewedContext.stableTopologicalOrder, "M5-ZO-999"],
      [...input.reviewedContext.stableTopologicalOrder].reverse(),
    ]) expect(() => generateMathMetadata({ ...input, reviewedContext: { ...input.reviewedContext, stableTopologicalOrder: forged } })).toThrow();
    expect(() => generateMathMetadata({ ...input, reviewedContext: { ...input.reviewedContext, stableTopologicalOrderHash: "0".repeat(64) } })).toThrow();
  });

  it("fails closed on identity, objective, timing, unsupported catalog, and unknown fields", async () => {
    const { input } = await fixture("en");
    expect(() => generateMathMetadata({ ...input, evidence: { ...input.evidence, lessonId: "wrong" } })).toThrow(/identity/u);
    expect(() => generateMathMetadata({ ...input, evidence: { ...input.evidence, objectiveHash: "0".repeat(64) } })).toThrow(/identity|objective/u);
    expect(() => generateMathMetadata({ ...input, timingEvidence: { ...input.timingEvidence, lessonId: "foreign" } })).toThrow(/identity/u);
    expect(() => generateMathMetadata({ ...input, timingEvidence: { ...input.timingEvidence, language: "de" } })).toThrow(/identity/u);
    expect(() => generateMathMetadata({ ...input, lesson: { ...input.lesson, contentHash: "0".repeat(64) } })).toThrow(/identity|stale/u);
    expect(() => generateMathMetadata({ ...input, reviewedContext: { ...input.reviewedContext, targetSkillHash: "0".repeat(64) } })).toThrow(/identity|authoritative/u);
    expect(() => generateMathMetadata({
      ...input,
      workflowEvidence: {
        ...input.workflowEvidence,
        sources: {
          ...input.workflowEvidence.sources,
          timing: {
            ...input.workflowEvidence.sources.timing,
            parentFingerprints: ["9".repeat(64)],
          },
        },
      },
    })).toThrow(/authoritative|workflow/u);
    expect(() => generateMathMetadata({ ...input, catalog: { ...mathPlaylistCatalog, entries: mathPlaylistCatalog.entries.filter((entry) => entry.key !== "topic-zo") } })).toThrow(/Missing required playlist key|every supported key/u);
    expect(() => generateMathMetadata({ ...input, catalog: { ...mathPlaylistCatalog, entries: mathPlaylistCatalog.entries.filter((entry) => entry.key !== "grade-10") } })).toThrow(/Missing required playlist key|every supported key/u);
    expect(() => generateMathMetadata({ ...input, catalog: { ...mathPlaylistCatalog, entries: [...mathPlaylistCatalog.entries, mathPlaylistCatalog.entries[0]!] } })).toThrow(/Duplicate playlist/u);
    expect(() => generateMathMetadata({ ...input, catalog: { ...mathPlaylistCatalog, entries: [...mathPlaylistCatalog.entries, { ...mathPlaylistCatalog.entries[0]!, key: "unknown-key" as never }] } })).toThrow();
    expect(() => generateMathMetadata({ ...input, catalog: { ...mathPlaylistCatalog, entries: mathPlaylistCatalog.entries.map((entry) => entry.key === "topic-zo" ? { ...entry, kind: "grade" as const } : entry) } })).toThrow(/wrong kind/u);
    expect(() => generateMathMetadata({ ...input, evidence: { ...input.evidence, unsupported: true } as never })).toThrow();
  });
});
