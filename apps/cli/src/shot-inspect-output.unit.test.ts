import { describe, expect, it } from "vitest";
import {
  shotPlanSchema,
  type ShotPlanValidationIssue,
} from "@mediaforge/domain";
import {
  buildShotInspectReport,
  formatShotInspectReport,
} from "./shot-inspect-output.js";

function makePlan() {
  return shotPlanSchema.parse({
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
  });
}

describe("shot inspect output", () => {
  it("builds stable duration, distribution, and savings fields", () => {
    const issues: readonly ShotPlanValidationIssue[] = [
      {
        code: "SOURCE_IMAGE_OVERUSED",
        severity: "warning",
        message: "warning",
        shotId: "scene-001-shot-002",
      },
    ];
    const report = buildShotInspectReport({
      shotPlan: makePlan(),
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
        treatmentCounts: {
          "face-close-up": 1,
          "medium-crop": 1,
          "security-camera-overlay": 1,
        },
        transitionCounts: {
          "hard-cut": 2,
          dissolve: 1,
        },
      },
      estimatedCostMicros: 250000,
      pricingVersion: "configured",
      derivedClipCache: {
        available: true,
        hits: 2,
        misses: 1,
        writes: 2,
        invalidEntries: 0,
      },
    });

    expect(report.totalRenderedShotCount).toBe(3);
    expect(report.generatedSourceImageCount).toBe(2);
    expect(report.maximumTotalUsesForOneSourceImage).toBe(2);
    expect(report.estimatedSavings.avoidedImageGenerationCalls).toBe(1);
    expect(report.transitionDistribution).toEqual([
      { transition: "hard-cut", count: 2 },
      { transition: "dissolve", count: 1 },
    ]);
  });

  it("formats concise text output without narration details", () => {
    const text = formatShotInspectReport(
      buildShotInspectReport({
        shotPlan: makePlan(),
        validationIssues: [],
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
        estimatedCostMicros: null,
        pricingVersion: "unconfigured",
      })
    );

    expect(text).toContain("Shot inspection for episode-fixture");
    expect(text).toContain("Estimated avoided image calls: 1");
    expect(text).not.toContain("canonicalNarration");
  });
});
