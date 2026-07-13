import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { curriculumSourceSchema } from "../domain/index.js";
import {
  sourceRegistrySchema,
  stateOverridesFileSchema,
  validateProvenance,
} from "./source-registry.js";
import {
  assertPublishedReleaseImmutable,
  assertWritableSkillId,
  curriculumReleaseSchema,
  curriculumMigrationsFileSchema,
  loadCurriculumRelease,
  validateCurriculumMigrations,
  validateUniqueSkillIds,
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
    expect(new Set(release.skills.map((skill) => skill.skillId)).size).toBe(
      release.skills.length
    );
  });

  it("rejects stale input hashes in the real release layout", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "math-release-hash-")
    );
    for (const fileName of [
      "release.json",
      "skills.json",
      "source-registry.json",
      "state-overrides.json",
      "prerequisites.json",
      "migrations.json",
    ]) {
      await fs.copyFile(
        path.join(releaseRoot, fileName),
        path.join(tempRoot, fileName)
      );
    }
    const registryPath = path.join(tempRoot, "source-registry.json");
    const registry = JSON.parse(await fs.readFile(registryPath, "utf8")) as {
      sources: { notes: string }[];
    };
    registry.sources[0]!.notes = "mutated without release hash update";
    await fs.writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    await expect(loadCurriculumRelease(tempRoot)).rejects.toThrow(
      /Curriculum input hash mismatch: sourceRegistry/u
    );
  });

  it("rejects unknown fields, unknown enums, and duplicate ids", async () => {
    const release = curriculumReleaseSchema.parse(
      JSON.parse(await fs.readFile(`${releaseRoot}/release.json`, "utf8"))
    );
    expect(() =>
      curriculumReleaseSchema.parse({ ...release, rolloutStatus: "reviewed" })
    ).toThrow();
    expect(() =>
      curriculumReleaseSchema.parse({ ...release, status: "candidate" })
    ).toThrow();

    const loaded = await loadCurriculumRelease(releaseRoot);
    expect(() =>
      validateUniqueSkillIds([loaded.skills[0]!, loaded.skills[0]!])
    ).toThrow(/Duplicate skill id: M5-ZO-001/u);
    expect(() =>
      sourceRegistrySchema.parse({
        schemaVersion: 1,
        sources: [loaded.registry.sources[0], loaded.registry.sources[0]],
      })
    ).toThrow(/Duplicate source id/u);
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

  it("blocks binding claims with unknown or unverified authority", async () => {
    const release = await loadCurriculumRelease(releaseRoot);
    const reviewedBinding = {
      overrideId: "reviewed-binding",
      skillId: "M5-ZO-001",
      sourceMapping: {
        sourceId: "missing-source",
        section: "reviewed section",
        coverage: "direct" as const,
        reviewStatus: "reviewed" as const,
      },
      jurisdiction: "DE",
      grade: 5 as const,
      binding: "binding" as const,
      comment: "must block",
    };
    expect(() =>
      validateProvenance(release.skills, release.registry, {
        schemaVersion: 1,
        reviewStatus: "reviewed",
        overrides: [reviewedBinding],
      })
    ).toThrow(/Unknown override source/u);
    expect(() =>
      validateProvenance(release.skills, release.registry, {
        schemaVersion: 1,
        reviewStatus: "reviewed",
        overrides: [
          {
            ...reviewedBinding,
            overrideId: "unverified-binding",
            sourceMapping: {
              ...reviewedBinding.sourceMapping,
              sourceId: "sl-2025-math-9-10",
            },
          },
        ],
      })
    ).toThrow(/uses unverified source/u);
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
