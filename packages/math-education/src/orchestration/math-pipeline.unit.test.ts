import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { importCurriculumSeed } from "../curriculum/importer.js";
import { buildLessonVariant } from "../lesson/variant-builder.js";
import { createTimingManifest } from "../lesson/timing.js";
import {
  formatExactInteger,
  localizeNarration,
} from "../localization/localization.js";
import { generateMathMetadata } from "../metadata/math-metadata.js";
import { MATH_LANGUAGES } from "../domain/index.js";
import { deriveMathQuality, assertRenderAllowed } from "./quality-gate.js";
import { runMathBatch } from "./batch.js";

async function pilot() {
  const curriculum = importCurriculumSeed(
    await fs.readFile(
      "docs/mathe/curriculum/03-machine-readable-seed.md",
      "utf8"
    )
  );
  const skill = curriculum.skills.find((item) => item.skillId === "M5-ZO-001");
  if (!skill) throw new Error("Pilot skill missing.");
  return { skill, lesson: buildLessonVariant(skill, "standard") };
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

  it("creates localized metadata with three stable playlist dimensions", async () => {
    const { skill, lesson } = await pilot();
    const metadata = generateMathMetadata(skill, lesson, "de");
    expect(metadata.playlists.map((playlist) => playlist.kind)).toEqual([
      "grade",
      "topic",
      "variant",
    ]);
    expect(metadata.thumbnail.text.split(/\s+/u).length).toBeGreaterThanOrEqual(
      2
    );
  });

  it("never permits a mathematical error to render", () => {
    const report = deriveMathQuality([
      {
        checkId: "math",
        status: "MATHEMATICAL_ERROR",
        passed: false,
        message: "bad result",
      },
    ]);
    expect(report.status).toBe("MATHEMATICAL_ERROR");
    expect(() => assertRenderAllowed(report)).toThrow(/MATHEMATICAL_ERROR/u);
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
