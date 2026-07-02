import { describe, expect, it } from "vitest";
import { buildImageStatusOutput } from "./images-status-output.js";

describe("image status output", () => {
  it("groups merge and reuse counters with the readiness summary", () => {
    expect(
      buildImageStatusOutput({
        totalBatches: 3,
        pendingBatches: 1,
        requiresImportBatches: 1,
        importedBatches: 1,
        failedBatches: 0,
        mergedWithPreviousScenes: 2,
        mergedWithNextScenes: 1,
        reusedScenes: 3,
        readyForRender: false,
        retryableFailedScenes: 2,
        failureCategories: {
          "provider-transient-error": 2,
          "prompt-validation-error": 1,
        },
        episodeNumbers: ["001", "002"],
        sceneCount: 12,
        visualRetention: {
          rolloutMode: "enabled",
          fallbackReason: null,
          generatedSourceImageCount: 5,
          reusedSourceImageCount: 2,
          uniqueSourceImageCount: 5,
          renderedShotCount: 12,
          averageShotsPerSourceImage: 2.4,
          totalUsesPerSourceImage: [],
          maximumConsecutiveSourceImageReuse: 2,
          avoidedImageGenerationCalls: 7,
          estimatedImageSavings: {
            estimated: true,
            baseline: "one-image-per-rendered-shot",
            avoidedCalls: 7,
            unitCostMicros: 250000,
            currency: "USD",
            estimatedSavingsMicros: 1750000,
            costBasis: "manifest metadata",
          },
          localShotRenderDurationMs: 2000,
          finalCompositionRenderDurationMs: 3000,
          derivedShotCache: {
            hits: 4,
            misses: 1,
            writes: 1,
            invalidEntries: 0,
            hitRatio: 0.8,
          },
          shotPlanRegenerationCount: 1,
          sourceImageRegenerationCount: 0,
          validationWarningCount: 1,
          validationErrorCount: 0,
          validationStatus: "warn",
          meaningfulVisualChangesFirstEightSeconds: 3,
          longestStaticIntervalMs: 2500,
          averageShotDurationMs: 1500,
          climaxAverageShotDurationMs: 1200,
          finalVisualChangeFrequencyPerSecond: 0.9,
        },
      })
    ).toEqual({
      readyForRender: false,
      episodeNumbers: ["001", "002"],
      batchCounts: {
        totalBatches: 3,
        pendingBatches: 1,
        requiresImportBatches: 1,
        importedBatches: 1,
        failedBatches: 0,
      },
      sceneCount: 12,
      retryableFailedScenes: 2,
      failureCategories: {
        "provider-transient-error": 2,
        "prompt-validation-error": 1,
      },
      mergeCounts: {
        mergedWithPreviousScenes: 2,
        mergedWithNextScenes: 1,
        reusedScenes: 3,
      },
      visualRetention: {
        rolloutMode: "enabled",
        fallbackReason: null,
        validation: "WARN",
        sourceImages: 5,
        renderedShots: 12,
        shotsPerImage: 2.4,
        openingChangesFirstEightSeconds: 3,
        longestStaticIntervalSeconds: 2.5,
        derivedClipCache: {
          hits: 4,
          misses: 1,
          hitRatio: 0.8,
        },
        avoidedImageGenerationCalls: 7,
        estimatedImageSavings: {
          estimated: true,
          baseline: "one-image-per-rendered-shot",
          avoidedCalls: 7,
          unitCostMicros: 250000,
          currency: "USD",
          estimatedSavingsMicros: 1750000,
          costBasis: "manifest metadata",
        },
      },
    });
  });
});
