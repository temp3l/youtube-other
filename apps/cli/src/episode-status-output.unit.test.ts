import { describe, expect, it } from "vitest";
import { buildEpisodeStatusOutput } from "./episode-status-output.js";

describe("episode status output", () => {
  it("includes image generation readiness alongside episode metadata", () => {
    expect(
      buildEpisodeStatusOutput({
        episodeId: "001-demo",
        slug: "demo-episode",
        pipelineRuns: 2,
        imageGeneration: {
          totalBatches: 3,
          pendingBatches: 1,
          requiresImportBatches: 1,
          importedBatches: 1,
          failedBatches: 0,
          mergedWithPreviousScenes: 2,
          mergedWithNextScenes: 1,
          reusedScenes: 3,
          readyForRender: false,
          episodeNumbers: ["001"],
          sceneCount: 12,
          visualRetention: {
            rolloutMode: "preview",
            fallbackReason: "VISUAL_RETENTION_PREVIEW_MODE",
            generatedSourceImageCount: 5,
            reusedSourceImageCount: 1,
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
              unitCostMicros: null,
              currency: null,
              estimatedSavingsMicros: null,
              costBasis: "manifest metadata unavailable",
            },
            localShotRenderDurationMs: null,
            finalCompositionRenderDurationMs: null,
            derivedShotCache: {
              hits: 0,
              misses: 0,
              writes: 0,
              invalidEntries: 0,
              hitRatio: null,
            },
            shotPlanRegenerationCount: 1,
            sourceImageRegenerationCount: 0,
            validationWarningCount: 0,
            validationErrorCount: 0,
            validationStatus: "pass",
            meaningfulVisualChangesFirstEightSeconds: 3,
            longestStaticIntervalMs: 2000,
            averageShotDurationMs: 1500,
            climaxAverageShotDurationMs: 1200,
            finalVisualChangeFrequencyPerSecond: 0.9,
          },
        },
      })
    ).toEqual({
      episodeId: "001-demo",
      slug: "demo-episode",
      pipelineRuns: 2,
      imageGeneration: {
        readyForRender: false,
        episodeNumbers: ["001"],
        batchCounts: {
          totalBatches: 3,
          pendingBatches: 1,
          requiresImportBatches: 1,
          importedBatches: 1,
          failedBatches: 0,
        },
        sceneCount: 12,
        mergeCounts: {
          mergedWithPreviousScenes: 2,
          mergedWithNextScenes: 1,
          reusedScenes: 3,
        },
      },
      visualRetention: {
        rolloutMode: "preview",
        fallbackReason: "VISUAL_RETENTION_PREVIEW_MODE",
        validation: "PASS",
        sourceImages: 5,
        renderedShots: 12,
        shotsPerImage: 2.4,
        openingChangesFirstEightSeconds: 3,
        longestStaticIntervalSeconds: 2,
        derivedClipCache: {
          hits: 0,
          misses: 0,
          hitRatio: null,
        },
        avoidedImageGenerationCalls: 7,
        estimatedImageSavings: {
          estimated: true,
          baseline: "one-image-per-rendered-shot",
          avoidedCalls: 7,
          unitCostMicros: null,
          currency: null,
          estimatedSavingsMicros: null,
          costBasis: "manifest metadata unavailable",
        },
      },
    });
  });
});
