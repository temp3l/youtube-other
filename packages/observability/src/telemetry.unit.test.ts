import { describe, expect, it } from "vitest";
import {
  buildDerivedShotCacheMetrics,
  buildEstimatedImageSavings,
  buildVisualRetentionMetrics,
  visualRetentionMetricDefinitions,
} from "./visual-retention.js";

function shotPlan() {
  return {
    schemaVersion: 1,
    sourceId: "episode-fixture",
    locale: "en",
    variant: "short",
    aspectRatio: "9:16",
    sourceScenes: [
      {
        sourceSceneId: "source-scene-001",
        sceneId: "scene-001",
        narrationStartMs: 0,
        narrationEndMs: 2000,
        sourceImageId: "image-001",
        sourceImagePath: "shared/images/generated/scene-001.png",
        sourceImageSha256: "a".repeat(64),
        importance: "hook",
        focalRegions: [],
      },
      {
        sourceSceneId: "source-scene-002",
        sceneId: "scene-002",
        narrationStartMs: 2000,
        narrationEndMs: 4000,
        sourceImageId: "image-002",
        sourceImagePath: "shared/images/generated/scene-002.png",
        sourceImageSha256: "b".repeat(64),
        importance: "climax",
        focalRegions: [],
      },
    ],
    shots: [
      {
        shotId: "scene-001-shot-001",
        sourceSceneId: "source-scene-001",
        sceneId: "scene-001",
        sourceImageId: "image-001",
        startMs: 0,
        endMs: 1000,
        treatment: {
          family: "framing",
          catalogVersion: "shot-treatment-catalog-v1",
          treatmentId: "medium-crop",
          variant: "medium-crop",
        },
        overlays: [],
        transition: { kind: "hard-cut", durationMs: 0 },
      },
      {
        shotId: "scene-001-shot-002",
        sourceSceneId: "source-scene-001",
        sceneId: "scene-001",
        sourceImageId: "image-001",
        startMs: 1000,
        endMs: 2000,
        treatment: {
          family: "framing",
          catalogVersion: "shot-treatment-catalog-v1",
          treatmentId: "face-close-up",
          variant: "face-close-up",
        },
        overlays: [],
        transition: { kind: "hard-cut", durationMs: 0 },
      },
      {
        shotId: "scene-002-shot-001",
        sourceSceneId: "source-scene-002",
        sceneId: "scene-002",
        sourceImageId: "image-002",
        startMs: 2000,
        endMs: 3000,
        treatment: {
          family: "style",
          catalogVersion: "shot-treatment-catalog-v1",
          treatmentId: "security-camera-overlay",
          variant: "surveillance",
        },
        overlays: [],
        transition: { kind: "dissolve", durationMs: 120 },
      },
    ],
    pacingProfile: {
      mode: "inline",
      profile: {
        id: "shorts-aggressive",
        shotDurationMs: { minMs: 1000, maxMs: 3000 },
        staticShotDurationMs: { minMs: 1000, maxMs: 3000 },
        movingShotDurationMs: { minMs: 1000, maxMs: 3000 },
        openingCadenceMs: { minMs: 1000, maxMs: 3000 },
        climaxCadenceMs: { minMs: 1000, maxMs: 2000 },
      },
    },
    visualBudget: {
      sourceImageCount: { min: 2, max: 5 },
      shotCount: { min: 3, max: 6 },
      shotsPerImage: { min: 1, max: 3 },
      maxConsecutiveSourceImageUses: 2,
      maxTotalSourceImageUses: 3,
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
      effectCaps: [],
    },
    planningSeed: "seed",
  };
}

describe("visual retention telemetry", () => {
  it("builds stable measured, derived, and estimated metrics", () => {
    const issues = [
      {
        code: "SOURCE_IMAGE_OVERUSED",
        severity: "warning",
        message: "warning",
      },
    ];
    const metrics = buildVisualRetentionMetrics({
      rolloutMode: "enabled",
      shotPlan: shotPlan(),
      validationIssues: issues,
      validationMetrics: {
        totalShots: 3,
        uniqueSourceImages: 2,
        averageShotDurationMs: 1000,
        medianShotDurationMs: 1000,
        longestShotDurationMs: 1000,
        longestStaticIntervalMs: 1000,
        openingMeaningfulChanges: 2,
        climaxAverageShotDurationMs: 1000,
        averageShotsPerSourceImage: 1.5,
        maximumConsecutiveSourceImageUses: 2,
        treatmentCounts: {},
        transitionCounts: {},
      },
      generatedSourceImageCount: 2,
      reusedSourceImageCount: 1,
      derivedShotCache: { hits: 2, misses: 1, writes: 1, invalidEntries: 0, resumedShots: [], renderedShots: [], missReasons: [] },
      unitCostMicros: 250000,
      pricingVersion: "configured",
      localShotRenderDurationMs: 3210,
      finalCompositionRenderDurationMs: 4560,
    });

    expect(metrics.averageShotsPerSourceImage).toBe(1.5);
    expect(metrics.avoidedImageGenerationCalls).toBe(1);
    expect(metrics.estimatedImageSavings.estimated).toBe(true);
    expect(metrics.estimatedImageSavings.currency).toBe("USD");
    expect(metrics.estimatedImageSavings.estimatedSavingsMicros).toBe(250000);
    expect(metrics.derivedShotCache.hitRatio).toBeCloseTo(2 / 3);
    expect(metrics.meaningfulVisualChangesFirstEightSeconds).toBe(2);
    expect(metrics.longestStaticIntervalMs).toBe(1000);
    expect(metrics.validationStatus).toBe("warn");
    expect(metrics.localShotRenderDurationMs).toBe(3210);
  });

  it("handles zero-image and zero-cache inputs without division errors", () => {
    const metrics = buildVisualRetentionMetrics({
      rolloutMode: "preview",
      shotPlan: {
        ...shotPlan(),
        sourceScenes: [],
        shots: [],
      },
      validationIssues: [],
      validationMetrics: {
        totalShots: 0,
        uniqueSourceImages: 0,
        averageShotDurationMs: 0,
        medianShotDurationMs: 0,
        longestShotDurationMs: 0,
        longestStaticIntervalMs: 0,
        openingMeaningfulChanges: 0,
        climaxAverageShotDurationMs: null,
        averageShotsPerSourceImage: 0,
        maximumConsecutiveSourceImageUses: 0,
        treatmentCounts: {},
        transitionCounts: {},
      },
      generatedSourceImageCount: 0,
    });

    expect(metrics.averageShotsPerSourceImage).toBeNull();
    expect(metrics.avoidedImageGenerationCalls).toBe(0);
    expect(metrics.derivedShotCache.hitRatio).toBeNull();
    expect(metrics.finalVisualChangeFrequencyPerSecond).toBeNull();
    expect(metrics.validationStatus).toBe("pass");
  });

  it("clamps negative avoided calls and preserves unavailable pricing honestly", () => {
    const savings = buildEstimatedImageSavings({
      renderedShotCount: 2,
      generatedSourceImageCount: 4,
      unitCostMicros: null,
      costBasis: "current image manifest metadata",
    });

    expect(savings.avoidedCalls).toBe(0);
    expect(savings.estimatedSavingsMicros).toBeNull();
    expect(savings.currency).toBeNull();
  });

  it("documents metric definitions and stable units", () => {
    expect(visualRetentionMetricDefinitions.averageShotsPerSourceImage).toEqual(
      expect.objectContaining({
        denominator: "uniqueSourceImageCount",
        units: "shots/source-image",
        valueKind: "derived",
      }),
    );
    expect(buildDerivedShotCacheMetrics()).toEqual({
      hits: 0,
      misses: 0,
      writes: 0,
      invalidEntries: 0,
      hitRatio: null,
    });
  });
});
