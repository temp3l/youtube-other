import { describe, expect, it } from "vitest";

import { buildMicrodramaSourcePlatePrompt } from "@mediaforge/visual-planning";

import { buildMicrodramaVisualGenerationPlan } from "./v5-visual-generation.js";
import type { V5SceneShotPlanRecord } from "./v5-scene-shot-compiler-contracts.js";

function minimalPlan(): V5SceneShotPlanRecord {
  const beat = {
    beatSemanticId: "beat.sem.e001.hook" as const,
    beatPlanBeatId: "beat.hook",
    category: "hook",
    order: 0,
    timing: { startRatio: 0, endRatio: 0.1, targetSeconds: 6 },
    requiredReactions: [] as const,
  };
  const scene = {
    sceneSemanticId: "scene.sem.e001.001" as const,
    beatSemanticId: "beat.sem.e001.hook" as const,
    order: 1,
    sourcePlateSemanticId: "plate.sem.e001.001" as const,
    timing: { startRatio: 0, endRatio: 0.2, targetSeconds: 12 },
    registryReferences: [
      {
        entryId: "char.mira-chen",
        entryKind: "character" as const,
        revisionId: "var.char.mira-chen.rev.1",
      },
    ],
    continuitySceneSemanticIds: [] as const,
    blockingKind: "establishing" as const,
  };
  const shot = {
    shotSemanticId: "shot.sem.e001.001.001" as const,
    sceneSemanticId: "scene.sem.e001.001" as const,
    beatSemanticId: "beat.sem.e001.hook" as const,
    order: 1,
    sceneOrder: 1,
    shotOrderInScene: 1,
    sourcePlateSemanticId: "plate.sem.e001.001" as const,
    timing: { startRatio: 0, endRatio: 0.2, targetSeconds: 12 },
    blockingKind: "establishing" as const,
    reactions: [] as const,
    registryReferences: scene.registryReferences,
    continuitySceneSemanticIds: [] as const,
  };

  return {
    episodeId: "E001",
    episodeNumber: 1,
    episodeSpecRevisionId: "rev.spec.e001",
    beatPlanRevisionId: "rev.beat.e001",
    scenePlanRevisionId: "rev.scene.e001",
    shotPlanRevisionId: "rev.scene-shot.e001.v1",
    beats: Array.from({ length: 9 }, (_, index) => ({
      ...beat,
      order: index,
      beatSemanticId: `beat.sem.e001.cat${index}` as typeof beat.beatSemanticId,
    })),
    scenes: Array.from({ length: 9 }, (_, index) => ({
      ...scene,
      order: index + 1,
      sceneSemanticId: `scene.sem.e001.${String(index + 1).padStart(3, "0")}` as typeof scene.sceneSemanticId,
      sourcePlateSemanticId: `plate.sem.e001.${String((index % 2) + 1).padStart(3, "0")}` as typeof scene.sourcePlateSemanticId,
    })),
    shots: [shot],
    assetDensityPolicy: {
      scope: "canary",
      sourcePlateTarget: 2,
      editorialCutTarget: 8,
      sourcePlateMin: 5,
      sourcePlateMax: 7,
      editorialCutMin: 8,
      editorialCutMax: 12,
    },
  };
}

describe("microdrama visual generation plan binding", () => {
  it("binds approved semantic shots and reusable plate keys", () => {
    const plan = buildMicrodramaVisualGenerationPlan({
      seriesId: "series.seven-minutes-ahead",
      plan: minimalPlan(),
      registryRevisionFingerprints: ["f".repeat(64)],
    });

    expect(plan).toHaveLength(1);
    expect(plan.map((item) => item.request.sourcePlateSemanticId)).toEqual([
      "plate.sem.e001.001",
    ]);
    expect(plan[0]?.request.shotSemanticId).toBe("shot.sem.e001.001.001");
    expect(() =>
      buildMicrodramaSourcePlatePrompt({
        ...plan[0]!.promptInput,
        registryRevisionFingerprints: ["f".repeat(64)],
      })
    ).not.toThrow();
  });
});
