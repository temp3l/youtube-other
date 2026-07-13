import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildLessonVariant } from "../lesson/variant-builder.js";
import {
  createMetadataTimingEvidence,
  createTimingManifest,
} from "../lesson/timing.js";
import {
  formatExactInteger,
  localizeNarration,
} from "../localization/localization.js";
import {
  createMathMetadataEvidence,
  createMetadataWorkflowEvidence,
  createReviewedMetadataContext,
  generateMathMetadata,
} from "../metadata/math-metadata.js";
import { MATH_LANGUAGES } from "../domain/index.js";
import { runMathBatch } from "./batch.js";
import { createReviewedCurriculumFixture } from "../testing/reviewed-curriculum-fixture.js";

async function pilot() {
  const curriculum = await createReviewedCurriculumFixture(
    await fs.mkdtemp(path.join(os.tmpdir(), "math-pipeline-release-"))
  );
  const skill = curriculum.skills.find((item) => item.skillId === "M5-ZO-001");
  if (!skill) throw new Error("Pilot skill missing.");
  return { curriculum, skill, lesson: buildLessonVariant(skill, "standard") };
}

describe("localized math pipeline", () => {
  it("locks facts and creates a 240 second timeline for every locale", async () => {
    const { lesson } = await pilot();
    const localized = MATH_LANGUAGES.map((language) =>
      localizeNarration(lesson, language)
    );
    expect(new Set(localized.map((item) => item.factLockHash))).toHaveLength(1);
    for (const narration of localized)
      expect(createTimingManifest(lesson, narration).durationSeconds).toBe(240);
    expect(formatExactInteger("730405", "de")).toBe("730.405");
    expect(formatExactInteger("730405", "en")).toBe("730,405");
  });

  it("creates locale-matched metadata with three stable playlist dimensions", async () => {
    const { curriculum, skill, lesson } = await pilot();
    const metadata = MATH_LANGUAGES.map((language) => {
      const narration = localizeNarration(lesson, language);
      const timing = createTimingManifest(lesson, narration);
      const timingEvidence = createMetadataTimingEvidence(lesson, narration, timing);
      return generateMathMetadata({
        reviewedContext: createReviewedMetadataContext(curriculum, skill.skillId),
        skill,
        lesson,
        localization: narration,
        timingEvidence,
        workflowEvidence: createMetadataWorkflowEvidence({
          lesson,
          localization: narration,
          timingEvidence,
          parentFingerprints: {
            lesson: ["1".repeat(64)],
            localization: ["2".repeat(64)],
            timing: ["3".repeat(64)],
            output: ["4".repeat(64)],
          },
        }),
        evidence: createMathMetadataEvidence(skill, lesson, narration),
      });
    });
    for (const item of metadata) {
      expect(item.playlists.map((playlist) => playlist.kind)).toEqual([
        "grade",
        "topic",
        "variant",
      ]);
      expect(item.thumbnail.text.split(/\s+/u).length).toBeGreaterThanOrEqual(
        2
      );
    }
    expect(
      metadata.find((item) => item.identity.language === "en")?.description
    ).not.toMatch(/Lernziel|Denkaufgabe/u);
    expect(
      metadata.find((item) => item.identity.language === "es")?.chapters[1]?.title
    ).toBe("Ejemplo");
    expect(
      metadata.find((item) => item.identity.language === "fr")?.playlists[0]
        ?.localizedName
    ).toBe("Classe 5");
    expect(metadata.find((item) => item.identity.language === "pt")?.tags[0]).toBe(
      "Matemática"
    );
  });

  it("continues a batch after an isolated item failure", async () => {
    const item = (skillId: string) => ({
      skillId,
      variant: "standard" as const,
      language: "de" as const,
      status: "planned" as const,
      attempts: 0,
    });
    const report = await runMathBatch(
      "batch-1",
      [item("M5-ZO-001"), item("M5-ZO-002")],
      async (candidate) => {
        if (candidate.skillId.endsWith("002"))
          throw new Error("fixture failure");
      },
      0
    );
    expect(report.status).toBe("partial");
    expect(report.exitCode).toBe(2);
    expect(report.items[0]?.status).toBe("succeeded");
  });
});
