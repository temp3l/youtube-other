import { describe, expect, it } from "vitest";
import {
  episodeIdSchema,
  visualBudgetSchema,
  visualPacingProfileSchema,
  visualSourceSceneSchema,
  type FocalRegion,
  type RenderShot,
  type ShotPlan,
  type VisualBudget,
  type VisualNarrativePhase,
  type VisualPacingProfile,
  type VisualSourceScene,
} from "@mediaforge/domain";
import {
  getTreatment,
  isTreatmentSupported,
  shotTreatmentCatalogVersion,
} from "@mediaforge/domain/visual-retention/treatment-catalog.js";
import {
  DeterministicShotPlanner,
  ShotPlanningError,
  serializeShotPlan,
  type PlanShotsInput,
} from "./shot-planner.js";

const planner = new DeterministicShotPlanner();

function shortProfile(): VisualPacingProfile {
  return visualPacingProfileSchema.parse({
    id: "shorts-aggressive",
    shotDurationMs: { minMs: 1000, maxMs: 5000 },
    staticShotDurationMs: { minMs: 1000, maxMs: 3000 },
    movingShotDurationMs: { minMs: 1000, maxMs: 6000 },
    openingCadenceMs: { minMs: 1500, maxMs: 3500 },
    climaxCadenceMs: { minMs: 1000, maxMs: 3000 },
  });
}

function balancedProfile(): VisualPacingProfile {
  return visualPacingProfileSchema.parse({
    id: "balanced",
    shotDurationMs: { minMs: 2000, maxMs: 8000 },
    staticShotDurationMs: { minMs: 2000, maxMs: 5000 },
    movingShotDurationMs: { minMs: 2000, maxMs: 10000 },
    openingCadenceMs: { minMs: 3000, maxMs: 6000 },
    climaxCadenceMs: { minMs: 2000, maxMs: 5000 },
  });
}

function shortBudget(overrides: Partial<VisualBudget> = {}): VisualBudget {
  return visualBudgetSchema.parse({
    sourceImageCount: { min: 5, max: 9 },
    shotCount: { min: 15, max: 28 },
    shotsPerImage: { min: 2, max: 4 },
    maxConsecutiveSourceImageUses: 3,
    maxTotalSourceImageUses: 5,
    cropLimits: {
      minCropArea: 0.35,
      minFaceMargin: 0.08,
      maxCropZoom: 2,
      minOutputHeightPx: 1080,
      maxAdjacentSameImageCropIou: 0.82,
    },
    motionLimits: {
      minShotDurationMs: 1000,
      pushInScaleRange: { min: 1.03, max: 1.14 },
      fastPushInScaleRange: { min: 1.08, max: 1.22 },
      panTravelFractionOfImage: { min: 0.03, max: 0.12 },
      rotationDegreesRange: { min: -1, max: 1 },
      dissolveDurationMs: { minMs: 120, maxMs: 250 },
      dipToBlackDurationMs: { minMs: 100, maxMs: 500 },
    },
    effectCaps: [
      { effect: "blurred-fill", maxShare: 0.2, scope: "video" },
      {
        effect: "surveillance-glitch-static-combined",
        maxShare: 0.15,
        scope: "video",
      },
      { effect: "fast-zoom", maxCount: 3, scope: "video" },
    ],
    ...overrides,
  });
}

function fullBudget(): VisualBudget {
  return visualBudgetSchema.parse({
    ...shortBudget(),
    sourceImageCount: { min: 18, max: 35 },
    shotCount: { min: 45, max: 85 },
    shotsPerImage: { min: 2, max: 3 },
    maxTotalSourceImageUses: 6,
    cropLimits: {
      ...shortBudget().cropLimits,
      maxCropZoom: 1.7,
    },
    motionLimits: {
      ...shortBudget().motionLimits,
      minShotDurationMs: 2000,
      pushInScaleRange: { min: 1.02, max: 1.1 },
      fastPushInScaleRange: { min: 1.06, max: 1.16 },
      panTravelFractionOfImage: { min: 0.02, max: 0.08 },
      rotationDegreesRange: { min: -0.5, max: 0.5 },
      dissolveDurationMs: { minMs: 200, maxMs: 500 },
      dipToBlackDurationMs: { minMs: 200, maxMs: 800 },
    },
  });
}

function region(
  sceneNumber: number,
  kind: FocalRegion["kind"],
  bounds: FocalRegion["bounds"],
  confidence = 0.9,
): FocalRegion {
  return {
    id: `scene-${String(sceneNumber).padStart(3, "0")}-${kind}`,
    kind,
    bounds,
    confidence,
  } as FocalRegion;
}

function sourceScene(args: {
  readonly sceneNumber: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly phase: VisualNarrativePhase;
  readonly focalRegions?: readonly FocalRegion[];
}): VisualSourceScene {
  const sceneId = `scene-${String(args.sceneNumber).padStart(3, "0")}`;
  return visualSourceSceneSchema.parse({
    sourceSceneId: `source-scene-${String(args.sceneNumber).padStart(3, "0")}`,
    sceneId,
    narrationStartMs: args.startMs,
    narrationEndMs: args.endMs,
    sourceImageId: `source-image-${sceneId}`,
    sourceImagePath: `episodes/demo/images/${sceneId}.png`,
    sourceImageSha256: String(args.sceneNumber).repeat(64).slice(0, 64),
    importance: args.phase,
    focalRegions: args.focalRegions ?? [],
  });
}

function shortInput(
  overrides: Partial<PlanShotsInput> = {},
): PlanShotsInput {
  const scenes = [
    sourceScene({
      sceneNumber: 1,
      startMs: 0,
      endMs: 8000,
      phase: "hook",
      focalRegions: [
        region(1, "safe-crop-region", { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }, 0.25),
        region(1, "face", { x: 0.36, y: 0.18, width: 0.22, height: 0.3 }, 0.95),
      ],
    }),
    sourceScene({
      sceneNumber: 2,
      startMs: 8000,
      endMs: 17000,
      phase: "setup",
      focalRegions: [
        region(2, "primary-subject", { x: 0.25, y: 0.2, width: 0.4, height: 0.5 }),
      ],
    }),
    sourceScene({
      sceneNumber: 3,
      startMs: 17000,
      endMs: 25000,
      phase: "evidence",
      focalRegions: [
        region(3, "evidence-object", { x: 0.48, y: 0.42, width: 0.18, height: 0.18 }),
      ],
    }),
    sourceScene({
      sceneNumber: 4,
      startMs: 25000,
      endMs: 34000,
      phase: "escalation",
      focalRegions: [
        region(4, "safe-crop-region", { x: 0.08, y: 0.12, width: 0.84, height: 0.76 }, 0.2),
      ],
    }),
    sourceScene({
      sceneNumber: 5,
      startMs: 34000,
      endMs: 43000,
      phase: "climax",
      focalRegions: [
        region(5, "face", { x: 0.42, y: 0.16, width: 0.18, height: 0.28 }, 0.93),
      ],
    }),
    sourceScene({
      sceneNumber: 6,
      startMs: 43000,
      endMs: 52000,
      phase: "callback",
      focalRegions: [
        region(6, "primary-subject", { x: 0.28, y: 0.2, width: 0.4, height: 0.5 }),
      ],
    }),
  ];

  return {
    sourceId: episodeIdSchema.parse("episode-fixture"),
    platform: "short",
    aspectRatio: "9:16",
    sourceScenes: scenes,
    pacingProfile: shortProfile(),
    visualBudget: shortBudget(),
    treatmentCatalogVersion: shotTreatmentCatalogVersion,
    seed: "episode-fixture-seed",
    ...overrides,
  };
}

function shotsForScene(plan: ShotPlan, sceneId: string): RenderShot[] {
  return plan.shots.filter((shot) => shot.sceneId === sceneId);
}

function averageDuration(shots: readonly RenderShot[]): number {
  return (
    shots.reduce((sum, shot) => sum + shot.endMs - shot.startMs, 0) /
    shots.length
  );
}

function assertSceneCoverage(plan: ShotPlan): void {
  for (const source of plan.sourceScenes) {
    const shots = shotsForScene(plan, source.sceneId);
    expect(shots[0]?.startMs).toBe(source.narrationStartMs);
    expect(shots.at(-1)?.endMs).toBe(source.narrationEndMs);
    for (let index = 1; index < shots.length; index += 1) {
      expect(shots[index]?.startMs).toBe(shots[index - 1]?.endMs);
    }
    for (const shot of shots) {
      expect(shot.endMs).toBeGreaterThan(shot.startMs);
    }
  }
}

describe("deterministic shot planner", () => {
  it("produces deeply equal and byte-stable plans for identical normalized input", () => {
    const input = shortInput();
    const first = planner.plan(input);
    const second = planner.plan(input);

    expect(second).toEqual(first);
    expect(serializeShotPlan(second)).toBe(serializeShotPlan(first));

    const reorderedRegionsInput = shortInput({
      sourceScenes: input.sourceScenes.map((scene) =>
        scene.sceneId === "scene-001"
          ? { ...scene, focalRegions: [...scene.focalRegions].reverse() }
          : scene,
      ),
    });
    expect(serializeShotPlan(planner.plan(reorderedRegionsInput))).toBe(
      serializeShotPlan(first),
    );

    expect(serializeShotPlan(planner.plan(shortInput({ seed: "other-seed" })))).not.toBe(
      serializeShotPlan(first),
    );
  });

  it("covers scene timing exactly and satisfies the Shorts opening cadence within budget", () => {
    const plan = planner.plan(shortInput());
    assertSceneCoverage(plan);

    const openingBoundaries = plan.shots
      .slice(1)
      .filter((shot) => shot.startMs > 0 && shot.startMs <= 8000);

    expect(openingBoundaries.length).toBeGreaterThanOrEqual(3);
    expect(plan.shots[1]?.startMs).toBeLessThanOrEqual(2000);
    expect(plan.shots.length).toBeLessThanOrEqual(plan.visualBudget.shotCount.max);
    expect(new Set(plan.sourceScenes.map((scene) => scene.sourceImageId)).size).toBe(
      plan.sourceScenes.length,
    );
    for (const source of plan.sourceScenes) {
      expect(shotsForScene(plan, source.sceneId).length).toBeGreaterThanOrEqual(2);
      expect(shotsForScene(plan, source.sceneId).length).toBeLessThanOrEqual(4);
    }
  });

  it("paces climaxes faster than setup and keeps full-video pacing slower than Shorts", () => {
    const shortPlan = planner.plan(shortInput());
    expect(averageDuration(shotsForScene(shortPlan, "scene-005"))).toBeLessThan(
      averageDuration(shotsForScene(shortPlan, "scene-002")),
    );

    const fullPlan = planner.plan(
      shortInput({
        platform: "full",
        aspectRatio: "16:9",
        pacingProfile: balancedProfile(),
        visualBudget: fullBudget(),
        sourceScenes: [
          sourceScene({ sceneNumber: 1, startMs: 0, endMs: 12000, phase: "setup" }),
          sourceScene({ sceneNumber: 2, startMs: 12000, endMs: 24000, phase: "callback" }),
        ],
      }),
    );
    expect(averageDuration(fullPlan.shots)).toBeGreaterThan(
      averageDuration(shortPlan.shots),
    );
    expect(fullPlan.shots.at(-1)?.sceneId).toBe("scene-002");
    expect(fullPlan.shots.at(-1)?.motion?.kind).toBe("push-in");
  });

  it("selects only catalog-compatible supported treatments by default", () => {
    const plan = planner.plan(shortInput());

    for (const shot of plan.shots) {
      const catalogEntry = getTreatment(shot.treatment.treatmentId);
      expect(catalogEntry).toBeDefined();
      expect(isTreatmentSupported(shot.treatment.treatmentId)).toBe(true);
      expect(catalogEntry?.availableByDefault).toBe(true);
      expect(catalogEntry?.derivedClipCacheRequired).toBe(false);
      expect(catalogEntry?.aspectRatios).toContain(plan.aspectRatio);
      expect(catalogEntry?.phases).toContain(
        plan.sourceScenes.find((scene) => scene.sourceSceneId === shot.sourceSceneId)
          ?.importance,
      );
      expect(shot.endMs - shot.startMs).toBeGreaterThanOrEqual(
        catalogEntry?.durationMs.minMs ?? 0,
      );
      expect(shot.endMs - shot.startMs).toBeLessThanOrEqual(
        catalogEntry?.durationMs.maxMs ?? Number.POSITIVE_INFINITY,
      );
    }

    const treatmentPairs = plan.shots.slice(1).map((shot, index) => [
      plan.shots[index]?.treatment.treatmentId,
      shot.treatment.treatmentId,
    ]);
    expect(treatmentPairs.some(([left, right]) => left !== right)).toBe(true);
    expect(plan.shots.some((shot) => shot.treatment.treatmentId === "blurred-fill")).toBe(false);
  });

  it("uses focal metadata conservatively for face and evidence framing", () => {
    const plan = planner.plan(shortInput());

    expect(
      shotsForScene(plan, "scene-001").some(
        (shot) => shot.treatment.treatmentId === "face-close-up",
      ),
    ).toBe(true);
    expect(
      shotsForScene(plan, "scene-003").some((shot) =>
        ["object-detail-crop", "crop-toward-evidence"].includes(
          shot.treatment.treatmentId,
        ),
      ),
    ).toBe(true);

    const fallbackOnly = planner.plan(
      shortInput({
        sourceScenes: [
          sourceScene({
            sceneNumber: 1,
            startMs: 0,
            endMs: 6000,
            phase: "hook",
            focalRegions: [
              region(1, "safe-crop-region", { x: 0.1, y: 0.08, width: 0.8, height: 0.84 }, 0.25),
            ],
          }),
        ],
        visualBudget: shortBudget({
          sourceImageCount: { min: 1, max: 1 },
          shotCount: { min: 1, max: 4 },
        }),
      }),
    );

    expect(
      fallbackOnly.shots.some((shot) => shot.treatment.treatmentId === "face-close-up"),
    ).toBe(false);
    for (const shot of fallbackOnly.shots) {
      expect(shot.crop?.x).toBeGreaterThanOrEqual(0);
      expect(shot.crop?.y).toBeGreaterThanOrEqual(0);
      expect((shot.crop?.x ?? 0) + (shot.crop?.width ?? 0)).toBeLessThanOrEqual(1);
      expect((shot.crop?.y ?? 0) + (shot.crop?.height ?? 0)).toBeLessThanOrEqual(1);
    }
  });

  it("handles short, long, single-scene, and missing-focal edge cases", () => {
    const shortScenePlan = planner.plan(
      shortInput({
        sourceScenes: [
          sourceScene({ sceneNumber: 1, startMs: 0, endMs: 800, phase: "setup" }),
        ],
        visualBudget: shortBudget({
          sourceImageCount: { min: 1, max: 1 },
          shotCount: { min: 1, max: 4 },
        }),
      }),
    );
    expect(shortScenePlan.shots).toHaveLength(1);
    expect(shortScenePlan.shots[0]?.startMs).toBe(0);
    expect(shortScenePlan.shots[0]?.endMs).toBe(800);

    const longScenePlan = planner.plan(
      shortInput({
        sourceScenes: [
          sourceScene({ sceneNumber: 1, startMs: 0, endMs: 18000, phase: "setup" }),
        ],
        visualBudget: shortBudget({
          sourceImageCount: { min: 1, max: 1 },
          shotCount: { min: 1, max: 6 },
          shotsPerImage: { min: 1, max: 4 },
        }),
      }),
    );
    expect(longScenePlan.shots.length).toBeGreaterThan(1);
    for (const shot of longScenePlan.shots) {
      expect(shot.endMs - shot.startMs).toBeLessThanOrEqual(6000);
      expect(shot.crop).toBeDefined();
    }
  });

  it("reports deterministic limitations for impossible budget tension", () => {
    const result = planner.planWithDiagnostics(
      shortInput({
        sourceScenes: [
          sourceScene({ sceneNumber: 1, startMs: 0, endMs: 14000, phase: "setup" }),
        ],
        visualBudget: shortBudget({
          sourceImageCount: { min: 1, max: 1 },
          shotCount: { min: 1, max: 1 },
          shotsPerImage: { min: 1, max: 1 },
        }),
      }),
    );
    const repeated = planner.planWithDiagnostics(
      shortInput({
        sourceScenes: [
          sourceScene({ sceneNumber: 1, startMs: 0, endMs: 14000, phase: "setup" }),
        ],
        visualBudget: shortBudget({
          sourceImageCount: { min: 1, max: 1 },
          shotCount: { min: 1, max: 1 },
          shotsPerImage: { min: 1, max: 1 },
        }),
      }),
    );

    expect(result.limitations.some((entry) => entry.code === "SHOT_BUDGET_TENSION")).toBe(true);
    expect(serializeShotPlan(repeated.plan)).toBe(serializeShotPlan(result.plan));
    expect(repeated.limitations).toEqual(result.limitations);
  });

  it("throws typed errors for structurally unusable input and no compatible treatment", () => {
    expect(() => planner.plan(shortInput({ sourceScenes: [] }))).toThrow(
      ShotPlanningError,
    );
    expect(() =>
      planner.plan(
        shortInput({
          sourceScenes: [
            sourceScene({ sceneNumber: 1, startMs: 0, endMs: 4000, phase: "setup" }),
            sourceScene({ sceneNumber: 1, startMs: 4000, endMs: 8000, phase: "setup" }),
          ],
        }),
      ),
    ).toThrow(ShotPlanningError);
    expect(() =>
      planner.plan(
        shortInput({
          sourceScenes: [
            sourceScene({ sceneNumber: 1, startMs: 4000, endMs: 3000, phase: "setup" }),
          ],
        }),
      ),
    ).toThrow();
    expect(() =>
      planner.plan(
        shortInput({
          restrictions: { enabledTreatmentIds: ["layered-pseudo-parallax"] },
        }),
      ),
    ).toThrow(ShotPlanningError);
  });
});
