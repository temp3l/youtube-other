import { describe, expect, it } from "vitest";
import {
  captionPlanSchema,
  evidenceInsertSchema,
  episodeIdSchema,
  shotPlanSchema,
  visualBudgetSchema,
  visualPacingProfileSchema,
  visualSourceSceneSchema,
  type CaptionPlan,
  type EvidenceInsert,
  type FocalRegion,
  type ShotPlan,
} from "@mediaforge/domain";
import {
  captionCollisions,
  resolveCaptionPlacements,
  type CaptionProtectedRegion,
} from "./caption-collision.js";

function focal(
  id: string,
  kind: FocalRegion["kind"],
  bounds: FocalRegion["bounds"],
): FocalRegion {
  return { id, kind, bounds, confidence: 0.95 } as FocalRegion;
}

function shotPlan(regionsByScene: readonly (readonly FocalRegion[])[]): ShotPlan {
  const scenes = regionsByScene.map((regions, index) =>
    visualSourceSceneSchema.parse({
      sourceSceneId: `source-scene-${String(index + 1).padStart(3, "0")}`,
      sceneId: `scene-${String(index + 1).padStart(3, "0")}`,
      narrationStartMs: index * 2000,
      narrationEndMs: (index + 1) * 2000,
      sourceImageId: `source-image-${String(index + 1).padStart(3, "0")}`,
      sourceImagePath: `images/scene-${String(index + 1).padStart(3, "0")}.png`,
      sourceImageSha256: String(index + 1).repeat(64).slice(0, 64),
      importance: "setup",
      focalRegions: regions,
    }),
  );
  return shotPlanSchema.parse({
    schemaVersion: 1,
    sourceId: episodeIdSchema.parse("episode-fixture"),
    locale: "en-US",
    variant: "short",
    aspectRatio: "9:16",
    sourceScenes: scenes,
    shots: scenes.map((scene, index) => ({
      shotId: `${scene.sceneId}-shot-001`,
      sourceSceneId: scene.sourceSceneId,
      sceneId: scene.sceneId,
      sourceImageId: scene.sourceImageId,
      startMs: index * 2000,
      endMs: (index + 1) * 2000,
      treatment: {
        family: "framing",
        catalogVersion: "shot-treatment-catalog-v1",
        treatmentId: "medium-crop",
        variant: "medium-crop",
      },
      crop: { x: 0, y: 0, width: 1, height: 1 },
      motion: { kind: "none" },
      overlays: [],
      transition: { kind: "hard-cut", durationMs: 0 },
    })),
    pacingProfile: {
      mode: "inline",
      profile: visualPacingProfileSchema.parse({
        id: "shorts-aggressive",
        shotDurationMs: { minMs: 1000, maxMs: 5000 },
        staticShotDurationMs: { minMs: 1000, maxMs: 3000 },
        movingShotDurationMs: { minMs: 1000, maxMs: 6000 },
        openingCadenceMs: { minMs: 1500, maxMs: 3500 },
        climaxCadenceMs: { minMs: 1000, maxMs: 3000 },
      }),
    },
    visualBudget: visualBudgetSchema.parse({
      sourceImageCount: { min: 1, max: 9 },
      shotCount: { min: 1, max: 28 },
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
    }),
    planningSeed: "seed-001",
  });
}

function captionPlan(overrides: Partial<CaptionPlan["segments"][number]> = {}): CaptionPlan {
  return captionPlanSchema.parse({
    schemaVersion: 1,
    locale: "en-US",
    variant: "short",
    maxLineCount: 2,
    layoutVersion: "caption-plan-v1",
    segments: [
      {
        id: "caption-001",
        locale: "en-US",
        startMs: 500,
        endMs: 2500,
        text: "Mara found room 237",
        lines: ["Mara found", "room 237"],
        maxLineCount: 2,
        layoutRegion: { x: 0.12, y: 0.68, width: 0.76, height: 0.16 },
        anchor: "lower-middle",
        safeAreaRefs: [],
        shotIds: [],
        source: { kind: "transcript-segment", segmentIndex: 0 },
        ...overrides,
      },
    ],
    brandingSafeAreas: [],
    platformSafeAreas: [],
  });
}

function evidenceInsert(args: {
  readonly startMs: number;
  readonly endMs: number;
  readonly bounds: EvidenceInsert["layout"]["bounds"];
}): EvidenceInsert {
  return evidenceInsertSchema.parse({
    id: "evidence-insert-room",
    kind: "room-number",
    sourceFactId: "fact-room",
    locale: "en-US",
    startMs: args.startMs,
    endMs: args.endMs,
    templateVersion: "evidence-template-v1",
    dimensions: { widthPx: 360, heightPx: 180, aspectRatio: "16:9" },
    layout: {
      bounds: args.bounds,
      preferredAnchor: "center",
      captionSafeExclusion: args.bounds,
      textSafePadding: 0.05,
      minReadableHeight: 0.12,
      protectedSubregions: [],
      compatibleAspectRatios: ["9:16"],
    },
    content: { roomNumber: "237", label: "room" },
  });
}

describe("caption collision and placement", () => {
  it("keeps the default lower placement when no protected region overlaps", () => {
    const result = resolveCaptionPlacements({
      captionPlan: captionPlan(),
      shotPlan: shotPlan([[]]),
    });

    expect(result.issues).toEqual([]);
    expect(result.captionPlan.segments[0]?.anchor).toBe("lower-middle");
  });

  it("moves away from lower face and evidence insert regions", () => {
    const result = resolveCaptionPlacements({
      captionPlan: captionPlan(),
      shotPlan: shotPlan([
        [focal("face-lower", "face", { x: 0.2, y: 0.66, width: 0.4, height: 0.18 })],
      ]),
      evidenceInserts: [
        evidenceInsert({
          startMs: 500,
          endMs: 2500,
          bounds: { x: 0.1, y: 0.52, width: 0.8, height: 0.18 },
        }),
      ],
    });

    expect(result.issues).toEqual([]);
    expect(result.captionPlan.segments[0]?.anchor).toBe("upper-middle");
  });

  it("ignores inactive evidence inserts and respects branding exclusions", () => {
    const inactiveEvidence = resolveCaptionPlacements({
      captionPlan: captionPlan(),
      shotPlan: shotPlan([[]]),
      evidenceInserts: [
        evidenceInsert({
          startMs: 3000,
          endMs: 4000,
          bounds: { x: 0.12, y: 0.68, width: 0.76, height: 0.16 },
        }),
      ],
    });
    const branded = resolveCaptionPlacements({
      captionPlan: captionPlan(),
      shotPlan: shotPlan([[]]),
      brandingSafeAreas: [{ x: 0.1, y: 0.66, width: 0.82, height: 0.2 }],
    });

    expect(inactiveEvidence.captionPlan.segments[0]?.anchor).toBe("lower-middle");
    expect(branded.captionPlan.segments[0]?.anchor).not.toBe("lower-middle");
  });

  it("uses a shared safe placement across captions spanning multiple shots", () => {
    const result = resolveCaptionPlacements({
      captionPlan: captionPlan(),
      shotPlan: shotPlan([
        [focal("face-lower", "face", { x: 0.2, y: 0.66, width: 0.4, height: 0.18 })],
        [focal("evidence-mid", "evidence-object", { x: 0.12, y: 0.52, width: 0.76, height: 0.18 })],
      ]),
    });

    expect(result.issues).toEqual([]);
    expect(result.captionPlan.segments[0]?.shotIds).toEqual([
      "scene-001-shot-001",
      "scene-002-shot-001",
    ]);
    expect(result.captionPlan.segments[0]?.anchor).toBe("upper-middle");
  });

  it("emits structured collision issues when no safe placement exists", () => {
    const blockers: CaptionProtectedRegion[] = [
      { id: "lower", kind: "platform-ui", bounds: { x: 0, y: 0.64, width: 1, height: 0.24 } },
      { id: "middle", kind: "platform-ui", bounds: { x: 0, y: 0.38, width: 1, height: 0.34 } },
      { id: "upper", kind: "platform-ui", bounds: { x: 0, y: 0.08, width: 1, height: 0.24 } },
    ];
    const result = resolveCaptionPlacements({
      captionPlan: captionPlan(),
      platformSafeAreas: blockers.map((blocker) => blocker.bounds),
    });

    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "CAPTION_VISUAL_COLLISION",
        severity: "error",
        captionId: "caption-001",
      }),
    ]);
  });

  it("reports normalized collision geometry with padding and edge-touching behavior", () => {
    const noOverlap = captionCollisions({
      captionId: "caption-001",
      captionBounds: { x: 0, y: 0, width: 0.2, height: 0.2 },
      protectedRegions: [
        { id: "edge", kind: "face", bounds: { x: 0.2, y: 0, width: 0.2, height: 0.2 } },
      ],
      safetyPadding: 0,
    });
    const padded = captionCollisions({
      captionId: "caption-001",
      captionBounds: { x: 0, y: 0, width: 0.2, height: 0.2 },
      protectedRegions: [
        { id: "partial", kind: "face", bounds: { x: 0.18, y: 0, width: 0.2, height: 0.2 } },
      ],
      safetyPadding: 0.02,
    });

    expect(noOverlap).toEqual([]);
    expect(padded[0]).toMatchObject({
      protectedRegionId: "partial",
      protectedRegionKind: "face",
    });
    expect(padded[0]?.intersectionOverCaptionArea).toBeGreaterThan(0);
  });
});
