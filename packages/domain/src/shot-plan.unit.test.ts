import { describe, expect, it } from "vitest";
import {
  cameraMotionSchema,
  focalRegionSchema,
  normalizedCropSchema,
  renderShotSchema,
  sceneIdSchema,
  scenePlanSchema,
  sceneSchema,
  shotIdSchema,
  shotPlanSchema,
  shotPlanValidationIssueSchema,
  visualBudgetSchema,
  visualPacingProfileSchema,
  visualSourceSceneSchema,
} from "./index.js";

function makeScene(overrides: Record<string, unknown> = {}) {
  return {
    id: "scene-001",
    sequenceNumber: 1,
    canonicalNarration: "A door opens into an empty hallway.",
    sourceSegmentIds: ["segment-001"],
    estimatedDurationSeconds: 4,
    timing: { startSeconds: 0, endSeconds: 4 },
    visualPurpose: "establish",
    subject: "hallway",
    action: "door opens",
    setting: "old building",
    composition: "centered",
    cameraFraming: "medium shot",
    mood: "uneasy",
    continuityReferences: [],
    onScreenText: "",
    negativeConstraints: [],
    aspectRatios: ["16:9"],
    imagePrompt: "empty hallway, open door",
    expectedImageFilenames: ["scene-001__000000-000004__16x9.png"],
    qualityStatus: "draft",
    ...overrides,
  };
}

function makeSourceScene(overrides: Record<string, unknown> = {}) {
  return {
    sourceSceneId: "source-scene-001",
    sceneId: "scene-001",
    narrationStartMs: 0,
    narrationEndMs: 4000,
    sourceImageId: "source-image-001",
    sourceImagePath: "episodes/demo/images/scene-001.png",
    sourceImageSha256: "a".repeat(64),
    importance: "hook",
    focalRegions: [],
    ...overrides,
  };
}

function makeShot(overrides: Record<string, unknown> = {}) {
  return {
    shotId: "scene-001-shot-001",
    sourceSceneId: "source-scene-001",
    sceneId: "scene-001",
    sourceImageId: "source-image-001",
    startMs: 0,
    endMs: 1500,
    treatment: {
      family: "framing",
      catalogVersion: "1.0.0",
      treatmentId: "medium-crop",
      variant: "medium-crop",
    },
    overlays: [],
    ...overrides,
  };
}

function makeShotPlan(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    sourceId: "episode-demo",
    locale: "en-US",
    variant: "short",
    aspectRatio: "9:16",
    sourceScenes: [
      makeSourceScene(),
      makeSourceScene({
        sourceSceneId: "source-scene-002",
        sceneId: "scene-002",
        narrationStartMs: 4000,
        narrationEndMs: 8000,
        sourceImageId: "source-image-002",
        sourceImagePath: "episodes/demo/images/scene-002.png",
        sourceImageSha256: "b".repeat(64),
        importance: "climax",
      }),
    ],
    shots: [
      makeShot(),
      makeShot({
        shotId: "scene-001-shot-002",
        startMs: 1500,
        endMs: 3000,
        motion: {
          kind: "push-in",
          startScale: 1,
          endScale: 1.1,
        },
      }),
      makeShot({
        shotId: "scene-002-shot-001",
        sourceSceneId: "source-scene-002",
        sceneId: "scene-002",
        sourceImageId: "source-image-002",
        startMs: 3000,
        endMs: 4500,
      }),
    ],
    pacingProfile: {
      mode: "inline",
      profile: {
        id: "shorts-aggressive",
        shotDurationMs: { minMs: 1000, maxMs: 3500 },
        staticShotDurationMs: { minMs: 1000, maxMs: 3000 },
        movingShotDurationMs: { minMs: 1000, maxMs: 6000 },
        openingCadenceMs: { minMs: 1500, maxMs: 2500 },
        climaxCadenceMs: { minMs: 1000, maxMs: 3000 },
      },
    },
    visualBudget: {
      sourceImageCount: { min: 2, max: 5 },
      shotCount: { min: 3, max: 8 },
      shotsPerImage: { min: 1, max: 4 },
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
      effectCaps: [{ effect: "blurred-fill", maxShare: 0.2, scope: "video" }],
    },
    planningSeed: "seed-001",
    ...overrides,
  };
}

describe("visual shot planning schemas", () => {
  it("accepts valid deterministic shot ids and rejects malformed or unsafe ones", () => {
    expect(shotIdSchema.parse("scene-001-shot-001")).toBe("scene-001-shot-001");

    for (const value of [
      "scene-1-shot-001",
      "scene-001-shot-1",
      "scene-001/shot-001",
      "../scene-001-shot-001",
      "scene-001-shot-001 ",
      "scene-001-shot-001.png",
    ]) {
      expect(shotIdSchema.safeParse(value).success).toBe(false);
    }
  });

  it("keeps existing scene ids and scene plans parseable", () => {
    expect(sceneIdSchema.parse("scene-001")).toBe("scene-001");
    expect(sceneIdSchema.safeParse("scene-001-shot-001").success).toBe(false);

    const scene = sceneSchema.parse(makeScene());
    const plan = scenePlanSchema.parse({
      sourceId: "episode-demo",
      scenes: [
        scene,
        sceneSchema.parse(
          makeScene({
            id: "scene-002",
            sequenceNumber: 2,
            sourceSegmentIds: ["segment-002"],
            timing: { startSeconds: 4, endSeconds: 8 },
            expectedImageFilenames: ["scene-002__000004-000008__16x9.png"],
          }),
        ),
      ],
    });

    expect(plan.scenes).toHaveLength(2);
  });

  it("validates normalized crops at boundaries and rejects invalid bounds", () => {
    expect(
      normalizedCropSchema.safeParse({
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      }).success,
    ).toBe(true);

    expect(
      normalizedCropSchema.safeParse({
        x: 0.2,
        y: 0.4,
        width: 0.8,
        height: 0.6,
      }).success,
    ).toBe(true);

    for (const value of [
      { x: -0.1, y: 0, width: 0.5, height: 0.5 },
      { x: 0, y: 1.1, width: 0.5, height: 0.5 },
      { x: 0, y: 0, width: 0, height: 0.5 },
      { x: 0, y: 0, width: 0.5, height: 0 },
      { x: 0.7, y: 0, width: 0.4, height: 0.5 },
      { x: 0, y: 0.7, width: 0.5, height: 0.4 },
    ]) {
      expect(normalizedCropSchema.safeParse(value).success).toBe(false);
    }
  });

  it("accepts minimal focal regions and rejects invalid confidence", () => {
    expect(
      focalRegionSchema.safeParse({
        id: "region-001",
        kind: "face",
        bounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.3 },
      }).success,
    ).toBe(true);

    expect(
      focalRegionSchema.safeParse({
        id: "region-001",
        kind: "face",
        bounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.3 },
        confidence: 1.5,
      }).success,
    ).toBe(false);
  });

  it("accepts each camera motion discriminator and rejects unknown values", () => {
    const motions = [
      { kind: "none" },
      { kind: "push-in", startScale: 1, endScale: 1.08 },
      { kind: "pull-out", startScale: 1.1, endScale: 1 },
      {
        kind: "pan",
        startCenter: { x: 0.4, y: 0.5 },
        endCenter: { x: 0.6, y: 0.5 },
      },
      {
        kind: "pan-and-zoom",
        startCenter: { x: 0.45, y: 0.45 },
        endCenter: { x: 0.55, y: 0.55 },
        startScale: 1,
        endScale: 1.06,
      },
      { kind: "drift", deltaX: 0.03, deltaY: -0.02, rotationDegrees: 0.5 },
    ] as const;

    for (const motion of motions) {
      expect(cameraMotionSchema.safeParse(motion).success).toBe(true);
    }

    expect(
      cameraMotionSchema.safeParse({
        kind: "spin",
      }).success,
    ).toBe(false);
  });

  it("accepts minimal visual source scenes and rejects invalid timing or sha256", () => {
    expect(visualSourceSceneSchema.safeParse(makeSourceScene()).success).toBe(
      true,
    );

    expect(
      visualSourceSceneSchema.safeParse(
        makeSourceScene({ narrationEndMs: 0 }),
      ).success,
    ).toBe(false);
    expect(
      visualSourceSceneSchema.safeParse(
        makeSourceScene({ sourceImageSha256: "not-a-hash" }),
      ).success,
    ).toBe(false);
  });

  it("accepts valid render shots and rejects negative or zero-duration timing", () => {
    expect(renderShotSchema.safeParse(makeShot()).success).toBe(true);
    expect(renderShotSchema.safeParse(makeShot({ startMs: -1 })).success).toBe(
      false,
    );
    expect(renderShotSchema.safeParse(makeShot({ endMs: 0 })).success).toBe(
      false,
    );
  });

  it("accepts valid multi-scene shot plans with multiple shots per source scene", () => {
    const result = shotPlanSchema.safeParse(makeShotPlan());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sourceScenes).toHaveLength(2);
      expect(result.data.shots).toHaveLength(3);
    }
  });

  it("rejects duplicate shot ids, duplicate source scenes, and broken source-scene references", () => {
    expect(
      shotPlanSchema.safeParse(
        makeShotPlan({
          shots: [
            makeShot(),
            makeShot({ shotId: "scene-001-shot-001", startMs: 1500, endMs: 3000 }),
          ],
        }),
      ).success,
    ).toBe(false);

    expect(
      shotPlanSchema.safeParse(
        makeShotPlan({
          sourceScenes: [makeSourceScene(), makeSourceScene()],
        }),
      ).success,
    ).toBe(false);

    expect(
      shotPlanSchema.safeParse(
        makeShotPlan({
          shots: [makeShot({ sourceSceneId: "source-scene-missing" })],
        }),
      ).success,
    ).toBe(false);
  });

  it("rejects shot and source-image mismatches, invalid ordering, and unsupported overlap", () => {
    expect(
      shotPlanSchema.safeParse(
        makeShotPlan({
          shots: [makeShot({ sourceImageId: "source-image-999" })],
        }),
      ).success,
    ).toBe(false);

    expect(
      shotPlanSchema.safeParse(
        makeShotPlan({
          shots: [
            makeShot({ startMs: 1500, endMs: 3000 }),
            makeShot({
              shotId: "scene-001-shot-002",
              startMs: 0,
              endMs: 1500,
            }),
          ],
        }),
      ).success,
    ).toBe(false);

    expect(
      shotPlanSchema.safeParse(
        makeShotPlan({
          shots: [
            makeShot({ endMs: 1500 }),
            makeShot({
              shotId: "scene-001-shot-002",
              startMs: 1400,
              endMs: 2200,
            }),
          ],
        }),
      ).success,
    ).toBe(false);
  });

  it("rejects invalid budget ranges and unknown validation issue codes", () => {
    expect(
      visualBudgetSchema.safeParse({
        sourceImageCount: { min: 3, max: 2 },
        shotCount: { min: 1, max: 4 },
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
        effectCaps: [{ effect: "blurred-fill", maxCount: 1, scope: "video" }],
      }).success,
    ).toBe(false);

    expect(
      shotPlanValidationIssueSchema.safeParse({
        code: "NOT_A_REAL_CODE",
        severity: "warning",
        message: "bad code",
      }).success,
    ).toBe(false);
  });

  it("accepts known pacing profile ids and rejects malformed pacing or budget constraints", () => {
    expect(
      visualPacingProfileSchema.safeParse({
        id: "balanced",
        shotDurationMs: { minMs: 2000, maxMs: 8000 },
        staticShotDurationMs: { minMs: 2000, maxMs: 5000 },
        movingShotDurationMs: { minMs: 2000, maxMs: 10000 },
        openingCadenceMs: { minMs: 3000, maxMs: 6000 },
        climaxCadenceMs: { minMs: 2000, maxMs: 5000 },
      }).success,
    ).toBe(true);

    expect(
      visualPacingProfileSchema.safeParse({
        id: "custom-profile",
        shotDurationMs: { minMs: 2000, maxMs: 8000 },
        staticShotDurationMs: { minMs: 2000, maxMs: 5000 },
        movingShotDurationMs: { minMs: 2000, maxMs: 10000 },
        openingCadenceMs: { minMs: 3000, maxMs: 6000 },
        climaxCadenceMs: { minMs: 2000, maxMs: 5000 },
      }).success,
    ).toBe(false);

    expect(
      visualBudgetSchema.safeParse({
        sourceImageCount: { min: 2, max: 5 },
        shotCount: { min: 3, max: 8 },
        shotsPerImage: { min: 1, max: 4 },
        maxConsecutiveSourceImageUses: 6,
        maxTotalSourceImageUses: 5,
        cropLimits: {
          minCropArea: 1.2,
          minFaceMargin: 0.08,
          maxCropZoom: 2,
          minOutputHeightPx: 1080,
          maxAdjacentSameImageCropIou: 0.82,
        },
        motionLimits: {
          minShotDurationMs: 1000,
          pushInScaleRange: { min: 1.14, max: 1.03 },
          fastPushInScaleRange: { min: 1.08, max: 1.22 },
          panTravelFractionOfImage: { min: 0.03, max: 0.12 },
          rotationDegreesRange: { min: 1, max: -1 },
          dissolveDurationMs: { minMs: 250, maxMs: 120 },
          dipToBlackDurationMs: { minMs: 100, maxMs: 500 },
        },
        effectCaps: [
          {
            effect: "fast-zoom",
            maxShare: 0.25,
            scope: "rolling-duration",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts warning and error shot-plan validation issues", () => {
    expect(
      shotPlanValidationIssueSchema.safeParse({
        code: "SOURCE_IMAGE_OVERUSED",
        severity: "warning",
        message: "Source image reuse exceeded the preferred limit.",
        sceneId: "scene-001",
        details: { uses: 6, budget: 5 },
      }).success,
    ).toBe(true);

    expect(
      shotPlanValidationIssueSchema.safeParse({
        code: "CAPTION_VISUAL_COLLISION",
        severity: "error",
        message: "Caption overlaps a protected focal region.",
        shotId: "scene-001-shot-001",
        sceneId: "scene-001",
        details: { regionId: "region-001", collisionScore: 0.93 },
      }).success,
    ).toBe(true);
  });
});
