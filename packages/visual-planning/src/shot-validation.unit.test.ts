import { describe, expect, it } from "vitest";
import {
  episodeFocalMetadataSchema,
  episodeIdSchema,
  shotPlanSchema,
  visualBudgetSchema,
  visualPacingProfileSchema,
  visualSourceSceneSchema,
  type CameraMotion,
  type FocalRegion,
  type NormalizedCrop,
  type RenderShot,
  type ShotPlan,
  type ShotPlanValidationIssueCode,
  type ShotTreatment,
  type VisualBudget,
  type VisualNarrativePhase,
  type VisualPacingProfile,
  type VisualSourceScene,
} from "@mediaforge/domain";
import {
  shotTreatmentCatalog,
  shotTreatmentCatalogVersion,
} from "@mediaforge/domain/visual-retention/treatment-catalog.js";
import {
  calculateEffectiveCropResolution,
  cropContainsRectangleWithMargin,
  normalizedCropIou,
  rectangleIntersectionArea,
  rectanglesOverlap,
} from "./crop-overlap.js";
import {
  classifyMeaningfulVisualChange,
  validateShotPlan,
  type CaptionPlan,
  type EvidenceInsert,
} from "./shot-validation.js";

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

function atmosphericProfile(): VisualPacingProfile {
  return visualPacingProfileSchema.parse({
    id: "atmospheric",
    shotDurationMs: { minMs: 2000, maxMs: 12000 },
    staticShotDurationMs: { minMs: 2000, maxMs: 5000 },
    movingShotDurationMs: { minMs: 2000, maxMs: 12000 },
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
      { effect: "parallax", maxCount: 1, scope: "video" },
      { effect: "fast-zoom", maxCount: 3, scope: "video" },
    ],
    ...overrides,
  });
}

function fullBudget(overrides: Partial<VisualBudget> = {}): VisualBudget {
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
    effectCaps: [
      { effect: "blurred-fill", maxShare: 0.15, scope: "video" },
      {
        effect: "surveillance-glitch-static-combined",
        maxShare: 0.1,
        scope: "video",
      },
      { effect: "parallax", maxCount: 3, scope: "video" },
    ],
    ...overrides,
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
  readonly imageNumber?: number;
  readonly focalRegions?: readonly FocalRegion[];
}): VisualSourceScene {
  const sceneId = `scene-${String(args.sceneNumber).padStart(3, "0")}`;
  const imageNumber = args.imageNumber ?? args.sceneNumber;
  return visualSourceSceneSchema.parse({
    sourceSceneId: `source-scene-${String(args.sceneNumber).padStart(3, "0")}`,
    sceneId,
    narrationStartMs: args.startMs,
    narrationEndMs: args.endMs,
    sourceImageId: `source-image-${String(imageNumber).padStart(3, "0")}`,
    sourceImagePath: `episodes/demo/images/${sceneId}.png`,
    sourceImageSha256: String(imageNumber).repeat(64).slice(0, 64),
    importance: args.phase,
    focalRegions: args.focalRegions ?? [],
  });
}

function treatment(treatmentId: string): ShotTreatment {
  if (treatmentId === "blurred-fill") {
    return {
      family: "adaptation",
      catalogVersion: shotTreatmentCatalogVersion,
      treatmentId,
      variant: "blurred-fill",
      fallbackBehavior: "blurred-fill",
    };
  }
  if (treatmentId === "layered-pseudo-parallax") {
    return {
      family: "depth",
      catalogVersion: shotTreatmentCatalogVersion,
      treatmentId,
      variant: "parallax",
      cacheRequired: true,
    };
  }
  if (
    [
      "security-camera-overlay",
      "static-burst",
      "analogue-noise",
      "short-blackout",
      "exposure-flash",
    ].includes(treatmentId)
  ) {
    return {
      family: "style",
      catalogVersion: shotTreatmentCatalogVersion,
      treatmentId,
      variant:
        treatmentId === "short-blackout"
          ? "blackout"
          : treatmentId === "exposure-flash"
            ? "exposure-flash"
            : treatmentId === "security-camera-overlay"
              ? "surveillance"
              : "standard",
    };
  }
  return {
    family: "framing",
    catalogVersion: shotTreatmentCatalogVersion,
    treatmentId,
    variant:
      treatmentId === "face-close-up"
        ? "face-close-up"
        : treatmentId === "object-detail-crop"
          ? "object-detail-crop"
          : treatmentId === "establishing-wide-crop"
            ? "establishing-wide-crop"
            : "medium-crop",
  };
}

function pushIn(): CameraMotion {
  return { kind: "push-in", startScale: 1, endScale: 1.06 };
}

function panRight(): CameraMotion {
  return {
    kind: "pan",
    startCenter: { x: 0.45, y: 0.5 },
    endCenter: { x: 0.55, y: 0.5 },
  };
}

function defaultMotion(index: number): CameraMotion {
  const motions: readonly CameraMotion[] = [
    pushIn(),
    {
      kind: "pan",
      startCenter: { x: 0.55, y: 0.5 },
      endCenter: { x: 0.45, y: 0.5 },
    },
    {
      kind: "pull-out",
      startScale: 1.06,
      endScale: 1,
    },
    panRight(),
  ];
  return motions[index % motions.length] ?? pushIn();
}

function makePlan(args: {
  readonly variant?: ShotPlan["variant"];
  readonly aspectRatio?: ShotPlan["aspectRatio"];
  readonly sourceScenes: readonly VisualSourceScene[];
  readonly shotCountsByScene: readonly number[];
  readonly pacingProfile: VisualPacingProfile;
  readonly visualBudget: VisualBudget;
  readonly treatments?: readonly string[];
  readonly crops?: readonly NormalizedCrop[];
  readonly motions?: readonly (CameraMotion | undefined)[];
}): ShotPlan {
  const shots: RenderShot[] = [];
  let globalShot = 0;
  for (const [sceneIndex, scene] of args.sourceScenes.entries()) {
    const count = args.shotCountsByScene[sceneIndex] ?? 1;
    const duration = scene.narrationEndMs - scene.narrationStartMs;
    let cursor = scene.narrationStartMs;
    for (let index = 0; index < count; index += 1) {
      const endMs =
        index === count - 1
          ? scene.narrationEndMs
          : cursor + Math.floor(duration / count);
      const shotIndex = globalShot;
      globalShot += 1;
      shots.push({
        shotId: `${scene.sceneId}-shot-${String(index + 1).padStart(3, "0")}`,
        sourceSceneId: scene.sourceSceneId,
        sceneId: scene.sceneId,
        sourceImageId: scene.sourceImageId,
        startMs: cursor,
        endMs,
        treatment: treatment(args.treatments?.[shotIndex] ?? "medium-crop"),
        crop: args.crops?.[shotIndex] ?? alternatingCrop(shotIndex),
        motion: args.motions?.[shotIndex] ?? defaultMotion(shotIndex),
        overlays: [],
        transition: { kind: "hard-cut", durationMs: 0 },
      });
      cursor = endMs;
    }
  }

  return shotPlanSchema.parse({
    schemaVersion: 1,
    sourceId: episodeIdSchema.parse("episode-fixture"),
    locale: "en-US",
    variant: args.variant ?? "short",
    aspectRatio: args.aspectRatio ?? "9:16",
    sourceScenes: args.sourceScenes,
    shots,
    pacingProfile: { mode: "inline", profile: args.pacingProfile },
    visualBudget: args.visualBudget,
    planningSeed: "seed-001",
  });
}

function alternatingCrop(index: number): NormalizedCrop {
  const crops: readonly NormalizedCrop[] = [
    { x: 0, y: 0, width: 0.62, height: 0.72 },
    { x: 0.28, y: 0.08, width: 0.62, height: 0.72 },
    { x: 0.12, y: 0.24, width: 0.62, height: 0.72 },
  ];
  return crops[index % crops.length] ?? crops[0];
}

function validate(
  shotPlan: ShotPlan,
  overrides: {
    readonly pacingProfile?: VisualPacingProfile;
    readonly visualBudget?: VisualBudget;
    readonly captionPlan?: CaptionPlan;
    readonly evidenceInserts?: readonly EvidenceInsert[];
    readonly focalMetadata?: Parameters<typeof validateShotPlan>[0]["focalMetadata"];
  } = {},
) {
  return validateShotPlan({
    shotPlan,
    pacingProfile: overrides.pacingProfile ?? inlineProfile(shotPlan),
    visualBudget: overrides.visualBudget ?? shotPlan.visualBudget,
    treatmentCatalog: shotTreatmentCatalog,
    ...(overrides.captionPlan === undefined ? {} : { captionPlan: overrides.captionPlan }),
    ...(overrides.evidenceInserts === undefined
      ? {}
      : { evidenceInserts: overrides.evidenceInserts }),
    ...(overrides.focalMetadata === undefined
      ? {}
      : { focalMetadata: overrides.focalMetadata }),
  });
}

function inlineProfile(plan: ShotPlan): VisualPacingProfile {
  if (plan.pacingProfile.mode === "inline") {
    return plan.pacingProfile.profile;
  }
  return shortProfile();
}

function issueCodes(plan: ShotPlan, overrides = {}): readonly ShotPlanValidationIssueCode[] {
  return validate(plan, overrides).issues.map((issue) => issue.code);
}

function compliantShort(durationMs: number, budget: VisualBudget): ShotPlan {
  const scaled = (value: number) => Math.round((value / 52_000) * durationMs);
  const scenes = [
    sourceScene({ sceneNumber: 1, startMs: 0, endMs: scaled(4000), phase: "hook" }),
    sourceScene({ sceneNumber: 2, startMs: scaled(4000), endMs: scaled(8000), phase: "hook" }),
    sourceScene({ sceneNumber: 3, startMs: scaled(8000), endMs: scaled(20000), phase: "setup" }),
    sourceScene({ sceneNumber: 4, startMs: scaled(20000), endMs: scaled(32000), phase: "evidence" }),
    sourceScene({ sceneNumber: 5, startMs: scaled(32000), endMs: scaled(40000), phase: "escalation" }),
    sourceScene({ sceneNumber: 6, startMs: scaled(40000), endMs: scaled(46000), phase: "climax" }),
    sourceScene({ sceneNumber: 7, startMs: scaled(46000), endMs: durationMs, phase: "callback" }),
  ];
  return makePlan({
    sourceScenes: scenes,
    shotCountsByScene: [2, 2, 3, 3, 3, 3, 2],
    pacingProfile: shortProfile(),
    visualBudget: budget,
  });
}

describe("shot validation geometry", () => {
  it("calculates crop IoU and rectangle geometry deterministically", () => {
    expect(
      normalizedCropIou(
        { x: 0, y: 0, width: 0.5, height: 0.5 },
        { x: 0, y: 0, width: 0.5, height: 0.5 },
      ),
    ).toBe(1);
    expect(
      normalizedCropIou(
        { x: 0, y: 0, width: 0.25, height: 0.25 },
        { x: 0.75, y: 0.75, width: 0.25, height: 0.25 },
      ),
    ).toBe(0);
    expect(
      normalizedCropIou(
        { x: 0, y: 0, width: 0.5, height: 0.5 },
        { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      ),
    ).toBeCloseTo(1 / 7);
    expect(
      normalizedCropIou(
        { x: 0, y: 0, width: 0.5, height: 0.5 },
        { x: 0.5, y: 0, width: 0.5, height: 0.5 },
      ),
    ).toBe(0);
    expect(
      rectanglesOverlap(
        { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
        { x: 0.3, y: 0.3, width: 0.2, height: 0.2 },
      ),
    ).toBe(true);
    expect(
      rectangleIntersectionArea(
        { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
        { x: 0.3, y: 0.3, width: 0.2, height: 0.2 },
      ),
    ).toBeCloseTo(0.04);
    expect(
      cropContainsRectangleWithMargin({
        crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        rectangle: { x: 0.3, y: 0.3, width: 0.2, height: 0.2 },
        margin: 0.08,
      }),
    ).toBe(true);
    expect(
      calculateEffectiveCropResolution({
        sourceWidthPx: 1920,
        sourceHeightPx: 1080,
        crop: { x: 0, y: 0, width: 0.5, height: 0.5 },
      }),
    ).toEqual({
      cropWidthPx: 960,
      cropHeightPx: 540,
      outputEquivalentHeightPx: 540,
    });
  });
});

describe("shot validation passing fixtures", () => {
  it("accepts compliant Shorts, full plans, atmospheric moving holds, and optional-free data", () => {
    const short52 = compliantShort(52_000, shortBudget());
    const short68 = compliantShort(
      68_000,
      shortBudget({
        sourceImageCount: { min: 7, max: 12 },
        shotCount: { min: 20, max: 35 },
      }),
    );
    const full = makePlan({
      variant: "full",
      aspectRatio: "16:9",
      sourceScenes: [
        sourceScene({ sceneNumber: 1, startMs: 0, endMs: 18000, phase: "setup" }),
        sourceScene({ sceneNumber: 2, startMs: 18000, endMs: 36000, phase: "evidence" }),
        sourceScene({ sceneNumber: 3, startMs: 36000, endMs: 45000, phase: "climax" }),
        sourceScene({ sceneNumber: 4, startMs: 45000, endMs: 54000, phase: "callback" }),
      ],
      shotCountsByScene: [3, 3, 3, 2],
      pacingProfile: balancedProfile(),
      visualBudget: fullBudget(),
    });
    const atmospheric = makePlan({
      variant: "full",
      aspectRatio: "16:9",
      sourceScenes: [
        sourceScene({ sceneNumber: 1, startMs: 0, endMs: 12000, phase: "setup" }),
      ],
      shotCountsByScene: [1],
      pacingProfile: atmosphericProfile(),
      visualBudget: fullBudget(),
      motions: [pushIn()],
    });
    const repeatedImage = makePlan({
      variant: "full",
      aspectRatio: "16:9",
      sourceScenes: [
        sourceScene({ sceneNumber: 1, startMs: 0, endMs: 6000, phase: "hook" }),
        sourceScene({ sceneNumber: 2, startMs: 6000, endMs: 12000, phase: "setup", imageNumber: 1 }),
      ],
      shotCountsByScene: [2, 1],
      pacingProfile: balancedProfile(),
      visualBudget: fullBudget({ sourceImageCount: { min: 1, max: 35 }, shotCount: { min: 1, max: 85 } }),
    });

    for (const plan of [short52, short68, full, atmospheric, repeatedImage]) {
      const result = validate(plan);
      expect(result.issues).toEqual([]);
      expect(result.valid).toBe(true);
    }
    expect(validate(short52).metrics).toMatchObject({
      totalShots: 18,
      uniqueSourceImages: 7,
      openingMeaningfulChanges: 4,
      maximumConsecutiveSourceImageUses: 3,
    });
  });

  it("is pure and byte-stable for equivalent input", () => {
    const plan = compliantShort(52_000, shortBudget());
    const before = JSON.stringify(plan);
    const first = validate(plan);
    const second = validate(plan);

    expect(JSON.stringify(plan)).toBe(before);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe("shot validation failing fixtures", () => {
  it("detects static duration, unchanged intervals, weak opening variety, and crop repetition", () => {
    const scenes = [
      sourceScene({ sceneNumber: 1, startMs: 0, endMs: 20_000, phase: "hook" }),
    ];
    const plan = makePlan({
      sourceScenes: scenes,
      shotCountsByScene: [3],
      pacingProfile: shortProfile(),
      visualBudget: shortBudget({ sourceImageCount: { min: 1, max: 9 }, shotCount: { min: 1, max: 28 } }),
      crops: [
        { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        { x: 0.12, y: 0.1, width: 0.8, height: 0.8 },
        { x: 0.14, y: 0.1, width: 0.8, height: 0.8 },
      ],
      motions: [{ kind: "none" }, { kind: "none" }, { kind: "none" }],
    });

    const result = validate(plan);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "STATIC_SHOT_TOO_LONG", severity: "error" }),
        expect.objectContaining({ code: "VISUAL_CHANGE_RATE_TOO_LOW", severity: "error" }),
        expect.objectContaining({ code: "OPENING_VISUAL_VARIETY_TOO_LOW", severity: "error" }),
        expect.objectContaining({ code: "CONSECUTIVE_CROP_TOO_SIMILAR", severity: "warning" }),
      ]),
    );
    expect(result.metrics.longestStaticIntervalMs).toBe(20_000);
  });

  it("detects source reuse, repeated motion, slow climax, budgets, callback, and effect caps", () => {
    const scenes = [
      sourceScene({ sceneNumber: 1, startMs: 0, endMs: 8000, phase: "hook" }),
      sourceScene({ sceneNumber: 2, startMs: 8000, endMs: 20000, phase: "setup", imageNumber: 1 }),
      sourceScene({ sceneNumber: 3, startMs: 20000, endMs: 26000, phase: "callback", imageNumber: 1 }),
      sourceScene({ sceneNumber: 4, startMs: 26000, endMs: 44000, phase: "climax", imageNumber: 1 }),
    ];
    const treatments = [
      "blurred-fill",
      "blurred-fill",
      "blurred-fill",
      "security-camera-overlay",
      "static-burst",
      "analogue-noise",
      "layered-pseudo-parallax",
      "layered-pseudo-parallax",
      "medium-crop",
      "medium-crop",
      "medium-crop",
      "medium-crop",
      "medium-crop",
      "medium-crop",
      "medium-crop",
      "medium-crop",
    ];
    const motions = new Array<CameraMotion | undefined>(16).fill(undefined).map(() => panRight());
    const plan = makePlan({
      sourceScenes: scenes,
      shotCountsByScene: [4, 4, 2, 6],
      pacingProfile: shortProfile(),
      visualBudget: shortBudget({
        sourceImageCount: { min: 1, max: 2 },
        shotCount: { min: 1, max: 10 },
        maxTotalSourceImageUses: 5,
        effectCaps: [
          { effect: "blurred-fill", maxShare: 0.1, scope: "video" },
          { effect: "surveillance-glitch-static-combined", maxShare: 0.1, scope: "video" },
          { effect: "parallax", maxCount: 1, scope: "video" },
        ],
      }),
      treatments,
      motions,
    });
    const codes = issueCodes(plan);

    expect(codes).toEqual(
      expect.arrayContaining([
        "SOURCE_IMAGE_OVERUSED",
        "CONSECUTIVE_SOURCE_IMAGE_REUSE_TOO_HIGH",
        "REPEATED_MOTION_PATTERN",
        "CLIMAX_PACING_TOO_SLOW",
        "SHOT_BUDGET_EXCEEDED",
        "FINAL_CALLBACK_SHOT_MISSING",
        "BLURRED_FILL_OVERUSED",
        "SURVEILLANCE_EFFECT_OVERUSED",
        "PARALLAX_EFFECT_OVERUSED",
      ]),
    );
  });

  it("detects source-image budget excess", () => {
    const scenes = [...Array(4).keys()].map((index) =>
      sourceScene({
        sceneNumber: index + 1,
        startMs: index * 2000,
        endMs: (index + 1) * 2000,
        phase: index === 3 ? "callback" : "setup",
      }),
    );
    const plan = makePlan({
      variant: "full",
      aspectRatio: "16:9",
      sourceScenes: scenes,
      shotCountsByScene: [1, 1, 1, 1],
      pacingProfile: balancedProfile(),
      visualBudget: fullBudget({ sourceImageCount: { min: 1, max: 3 } }),
    });
    expect(issueCodes(plan)).toContain("SOURCE_IMAGE_BUDGET_EXCEEDED");
  });

  it("validates optional caption, evidence, resolution, and face safety artifacts", () => {
    const face = region(1, "face", { x: 0.12, y: 0.12, width: 0.2, height: 0.2 });
    const evidence = region(1, "evidence-object", { x: 0.58, y: 0.58, width: 0.16, height: 0.16 });
    const plan = makePlan({
      sourceScenes: [
        sourceScene({
          sceneNumber: 1,
          startMs: 0,
          endMs: 4000,
          phase: "hook",
          focalRegions: [face, evidence],
        }),
      ],
      shotCountsByScene: [1],
      pacingProfile: shortProfile(),
      visualBudget: shortBudget({ sourceImageCount: { min: 1, max: 9 }, shotCount: { min: 1, max: 28 } }),
      crops: [{ x: 0.2, y: 0.2, width: 0.3, height: 0.3 }],
      motions: [pushIn()],
    });
    const captionPlan: CaptionPlan = {
      regions: [
        { id: "caption-face", shotId: plan.shots[0]?.shotId, bounds: face.bounds },
        { id: "caption-evidence", shotId: plan.shots[0]?.shotId, bounds: evidence.bounds },
      ],
    };
    const evidenceInserts: readonly EvidenceInsert[] = [
      {
        id: "evidence-insert-001",
        shotId: plan.shots[0]?.shotId,
        bounds: { x: 0.6, y: 0.6, width: 0.2, height: 0.2 },
      },
    ];
    const focalMetadata = episodeFocalMetadataSchema.parse({
      schemaVersion: 1,
      analysisVersion: "unit-test",
      images: [
        {
          schemaVersion: 1,
          analysisVersion: "unit-test",
          sourceImageId: "source-image-001",
          sourceImagePath: "episodes/demo/images/scene-001.png",
          imageWidth: 900,
          imageHeight: 900,
          origin: "planner-provided",
          focalRegions: [face, evidence],
          warnings: [],
          limitations: [],
        },
      ],
    });

    const result = validate(plan, { captionPlan, evidenceInserts, focalMetadata });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "CAPTION_VISUAL_COLLISION", severity: "error" }),
        expect.objectContaining({ code: "EVIDENCE_PROVENANCE_MISSING", severity: "error" }),
        expect.objectContaining({ code: "LOW_RESOLUTION_CROP_RISK", severity: "warning" }),
        expect.objectContaining({ code: "FACE_CLIPPING_RISK", severity: "error" }),
      ]),
    );
  });

  it("classifies meaningful visual changes without counting caption-only changes", () => {
    const plan = compliantShort(52_000, shortBudget());
    const [first, second] = plan.shots;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first === undefined || second === undefined) {
      return;
    }
    const identicalSecond: RenderShot = {
      ...second,
      sourceImageId: first.sourceImageId,
      sourceSceneId: first.sourceSceneId,
      sceneId: first.sceneId,
      crop: first.crop,
      motion: first.motion,
      treatment: first.treatment,
    };

    expect(
      classifyMeaningfulVisualChange({
        previous: first,
        next: identicalSecond,
        visualBudget: shortBudget(),
      }).meaningful,
    ).toBe(false);
    expect(
      classifyMeaningfulVisualChange({
        previous: first,
        next: second,
        visualBudget: shortBudget(),
      }).meaningful,
    ).toBe(true);
  });
});
