import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { curriculumSourceSchema } from "../domain/index.js";
import {
  stateOverridesFileSchema,
  validateProvenance,
} from "./source-registry.js";
import {
  assertPublishedReleaseImmutable,
  assertWritableSkillId,
  curriculumMigrationsFileSchema,
  loadCurriculumRelease,
  validateCurriculumMigrations,
} from "./release.js";

const releaseRoot = "packages/math-education/data/curriculum/v1";

describe("curriculum release", () => {
  it("loads the real hash-bound draft and reports incomplete review truthfully", async () => {
    const release = await loadCurriculumRelease(releaseRoot);
    expect(release.skills).toHaveLength(206);
    expect(
      release.registry.sources.map((source) => source.jurisdiction)
    ).toEqual(
      expect.arrayContaining([
        "DE",
        "DE-BW",
        "DE-BB",
        "DE-BE",
        "DE-NI",
        "DE-NW",
        "DE-SH",
        "DE-SL",
      ])
    );
    expect(release.provenance.complete).toBe(false);
    expect(release.provenance.incompleteSkillIds).toHaveLength(206);
    expect(release.prerequisites.edges.length).toBeGreaterThan(0);
    expect(release.graph.order).toHaveLength(206);
    expect(release.graph.disconnectedSkillIds.length).toBeGreaterThan(0);
    expect(release.readyForProduction).toBe(false);
  });

  it("rejects mutation of a published release", async () => {
    const release = JSON.parse(
      await fs.readFile(`${releaseRoot}/release.json`, "utf8")
    ) as Record<string, unknown>;
    const published = { ...release, status: "published" };
    expect(() =>
      assertPublishedReleaseImmutable(published, {
        ...published,
        notes: "mutated",
      })
    ).toThrow(/immutable/u);
    expect(() =>
      assertPublishedReleaseImmutable(published, published)
    ).not.toThrow();
  });

  it("enforces phased-source cohorts and override periods", () => {
    expect(() =>
      curriculumSourceSchema.parse({
        id: "test-source",
        jurisdiction: "DE-XX",
        schoolType: "Sekundarstufe I",
        title: "Test curriculum",
        documentVersion: "1",
        effectiveFrom: "2026-01-01",
        status: "phasing_in",
        officialUrls: ["https://example.invalid/curriculum"],
        retrievedAt: "2026-07-12",
        notes: "test",
      })
    ).toThrow(/cohort/u);
    expect(() =>
      stateOverridesFileSchema.parse({
        schemaVersion: 1,
        reviewStatus: "reviewed",
        overrides: [
          {
            overrideId: "test-override",
            skillId: "M5-ZO-001",
            sourceMapping: {
              sourceId: "test-source",
              section: "1",
              coverage: "direct",
              reviewStatus: "reviewed",
            },
            jurisdiction: "DE-XX",
            grade: 5,
            binding: "binding",
            effectiveFrom: "2026-12-01",
            effectiveTo: "2026-01-01",
            comment: "test",
          },
        ],
      })
    ).toThrow(/effectiveTo/u);
  });

  it("blocks binding claims backed by pending provenance", async () => {
    const release = await loadCurriculumRelease(releaseRoot);
    expect(() =>
      validateProvenance(release.skills, release.registry, {
        schemaVersion: 1,
        reviewStatus: "reviewed",
        overrides: [
          {
            overrideId: "pending-binding",
            skillId: "M5-ZO-001",
            sourceMapping: {
              sourceId: "kmk-2022-math",
              section: "pending",
              coverage: "direct",
              reviewStatus: "pending",
            },
            jurisdiction: "DE",
            grade: 5,
            binding: "binding",
            comment: "must block",
          },
        ],
      })
    ).toThrow(/lacks reviewed provenance/u);
  });

  it("keeps migrations append-only and aliases read-only", () => {
    const migrations = curriculumMigrationsFileSchema.parse({
      schemaVersion: 1,
      policy: "append-only",
      migrations: [],
      aliases: [
        {
          aliasSkillId: "M5-ZO-999",
          targetSkillId: "M5-ZO-001",
          readOnly: true,
        },
      ],
    });
    const active = new Set(["M5-ZO-001"]);
    expect(() =>
      validateCurriculumMigrations(migrations, active)
    ).not.toThrow();
    expect(() => assertWritableSkillId("M5-ZO-999", migrations)).toThrow(
      /Read-only skill alias/u
    );
    expect(() =>
      validateCurriculumMigrations(
        {
          ...migrations,
          aliases: [{ ...migrations.aliases[0]!, targetSkillId: "M5-ZO-002" }],
        },
        active
      )
    ).toThrow(/Unknown skill alias target/u);
  });
});
