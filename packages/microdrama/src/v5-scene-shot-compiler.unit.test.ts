import path from "node:path";
import { describe, expect, it } from "vitest";

import { BEAT_CATEGORIES } from "@mediaforge/narrative-core";
import { semanticIdContainsEnglishSentenceIdentity } from "@mediaforge/scene-planning";
import {
  CANARY_EDITORIAL_CUT_RANGE,
  CANARY_SOURCE_PLATE_RANGE,
} from "@mediaforge/visual-planning";

import {
  compileSceneShotPlanFromProductionRecord,
  compileV5CanonAdmission,
  compileV5EpisodeProduction,
  compileV5SceneShotPlans,
  projectLocaleTimingOverSemanticPlan,
  validateV5SceneShotPlanBundle,
} from "./index.js";

const V5_PACK_ROOT = path.resolve(
  import.meta.dirname,
  "../../../content-packs/seven-minutes-ahead-content-pack-v5-remediated"
);
const ADMITTED_AT = "2026-08-12T03:45:00.000Z";

function collectSemanticIds(record: ReturnType<typeof compileSceneShotPlanFromProductionRecord>) {
  return [
    ...record.beats.map((beat) => beat.beatSemanticId),
    ...record.scenes.map((scene) => scene.sceneSemanticId),
    ...record.scenes.flatMap((scene) => scene.continuitySceneSemanticIds),
    ...record.scenes.map((scene) => scene.sourcePlateSemanticId),
    ...record.shots.map((shot) => shot.shotSemanticId),
  ];
}

describe("V5 language-neutral scene and shot compiler", () => {
  it("compiles deterministic semantic plans for E001-E003 without English-sentence IDs", () => {
    const admission = compileV5CanonAdmission(V5_PACK_ROOT, ADMITTED_AT);
    expect(admission.ok).toBe(true);
    if (!admission.ok) {
      throw new Error(admission.issues.map((issue) => issue.message).join("\n"));
    }

    const production = compileV5EpisodeProduction(admission.bundle, ADMITTED_AT);
    expect(production.ok).toBe(true);
    if (!production.ok) {
      throw new Error(production.issues.map((issue) => issue.message).join("\n"));
    }

    const compiled = compileV5SceneShotPlans(production.bundle, ADMITTED_AT);
    if (!compiled.ok) {
      throw new Error(compiled.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
    }
    expect(compiled.ok).toBe(true);

    const bundle = validateV5SceneShotPlanBundle(compiled.bundle);
    expect(bundle.records).toHaveLength(100);

    for (const episodeId of ["E001", "E002", "E003"] as const) {
      const record = bundle.records.find((entry) => entry.episodeId === episodeId);
      expect(record).toBeTruthy();
      if (!record) {
        continue;
      }

      expect(record.beats).toHaveLength(BEAT_CATEGORIES.length);
      expect(record.scenes).toHaveLength(BEAT_CATEGORIES.length);
      expect(record.beats[0]?.beatSemanticId).toBe(`beat.sem.${episodeId.toLowerCase()}.hook`);
      expect(record.scenes[0]?.sceneSemanticId).toBe(`scene.sem.${episodeId.toLowerCase()}.001`);
      expect(record.shots[0]?.shotSemanticId).toBe(
        `shot.sem.${episodeId.toLowerCase()}.001.001`
      );

      for (const semanticId of collectSemanticIds(record)) {
        expect(semanticIdContainsEnglishSentenceIdentity(semanticId)).toBe(false);
      }

      expect(record.assetDensityPolicy.scope).toBe("canary");
      expect(record.assetDensityPolicy.sourcePlateTarget).toBeGreaterThanOrEqual(
        CANARY_SOURCE_PLATE_RANGE.min
      );
      expect(record.assetDensityPolicy.sourcePlateTarget).toBeLessThanOrEqual(
        CANARY_SOURCE_PLATE_RANGE.max
      );
      expect(record.shots.length).toBeGreaterThanOrEqual(
        CANARY_EDITORIAL_CUT_RANGE.min
      );
      expect(record.shots.length).toBeLessThanOrEqual(CANARY_EDITORIAL_CUT_RANGE.max);

      const uniquePlates = new Set(record.scenes.map((scene) => scene.sourcePlateSemanticId));
      expect(uniquePlates.size).toBe(record.assetDensityPolicy.sourcePlateTarget);

      expect(record.scenes[1]?.continuitySceneSemanticIds).toEqual([
        `scene.sem.${episodeId.toLowerCase()}.001`,
      ]);
      expect(record.scenes[0]?.registryReferences.length).toBeGreaterThan(0);
      expect(record.scenes[0]?.registryReferences.every((ref) => ref.revisionId.startsWith("rev.registry.seed."))).toBe(true);
    }
  });

  it("projects locale timing over the same ordered shot semantics", () => {
    const admission = compileV5CanonAdmission(V5_PACK_ROOT, ADMITTED_AT);
    if (!admission.ok) {
      throw new Error("expected successful admission");
    }
    const production = compileV5EpisodeProduction(admission.bundle, ADMITTED_AT);
    if (!production.ok) {
      throw new Error("expected successful production compile");
    }

    const e001Production = production.bundle.records.find((record) => record.episodeId === "E001");
    expect(e001Production).toBeTruthy();
    if (!e001Production) {
      throw new Error("missing E001 production record");
    }

    const plan = compileSceneShotPlanFromProductionRecord(e001Production);
    const measuredDurationMs = 59_500;
    const enProjection = projectLocaleTimingOverSemanticPlan({
      plan,
      measuredDurationMs,
    });
    const deProjection = projectLocaleTimingOverSemanticPlan({
      plan,
      measuredDurationMs: 58_900,
    });

    expect(enProjection).toHaveLength(plan.shots.length);
    expect(deProjection).toHaveLength(plan.shots.length);
    expect(enProjection.map((entry) => entry.shotSemanticId)).toEqual(
      plan.shots.map((shot) => shot.shotSemanticId)
    );
    expect(deProjection.map((entry) => entry.shotSemanticId)).toEqual(
      plan.shots.map((shot) => shot.shotSemanticId)
    );
    expect(enProjection.at(-1)?.endMs).toBe(measuredDurationMs);
    expect(deProjection.at(-1)?.endMs).toBe(58_900);
    expect(enProjection.every((entry) => entry.endMs > entry.startMs)).toBe(true);
  });
});
