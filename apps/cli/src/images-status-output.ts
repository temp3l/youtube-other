import type { VisualRetentionMetrics } from "@mediaforge/observability";

export interface ImageStatusReport {
  readonly totalBatches: number;
  readonly pendingBatches: number;
  readonly requiresImportBatches: number;
  readonly importedBatches: number;
  readonly failedBatches: number;
  readonly mergedWithPreviousScenes: number;
  readonly mergedWithNextScenes: number;
  readonly reusedScenes: number;
  readonly readyForRender: boolean;
  readonly retryableFailedScenes?: number;
  readonly failureCategories?: Record<string, number>;
  readonly episodeNumbers: readonly string[];
  readonly sceneCount: number;
  readonly visualRetention?: VisualRetentionMetrics;
}

export function buildImageStatusOutput(report: ImageStatusReport): Record<string, unknown> {
  return {
    readyForRender: report.readyForRender,
    episodeNumbers: report.episodeNumbers,
    batchCounts: {
      totalBatches: report.totalBatches,
      pendingBatches: report.pendingBatches,
      requiresImportBatches: report.requiresImportBatches,
      importedBatches: report.importedBatches,
      failedBatches: report.failedBatches,
    },
    sceneCount: report.sceneCount,
    retryableFailedScenes: report.retryableFailedScenes ?? 0,
    failureCategories: report.failureCategories ?? {},
    mergeCounts: {
      mergedWithPreviousScenes: report.mergedWithPreviousScenes,
      mergedWithNextScenes: report.mergedWithNextScenes,
      reusedScenes: report.reusedScenes,
    },
    ...(report.visualRetention
      ? {
          visualRetention: {
            rolloutMode: report.visualRetention.rolloutMode,
            fallbackReason: report.visualRetention.fallbackReason,
            validation: report.visualRetention.validationStatus.toUpperCase(),
            sourceImages: report.visualRetention.generatedSourceImageCount,
            renderedShots: report.visualRetention.renderedShotCount,
            shotsPerImage: report.visualRetention.averageShotsPerSourceImage,
            openingChangesFirstEightSeconds:
              report.visualRetention.meaningfulVisualChangesFirstEightSeconds,
            longestStaticIntervalSeconds:
              report.visualRetention.longestStaticIntervalMs / 1000,
            derivedClipCache: {
              hits: report.visualRetention.derivedShotCache.hits,
              misses: report.visualRetention.derivedShotCache.misses,
              hitRatio: report.visualRetention.derivedShotCache.hitRatio,
            },
            avoidedImageGenerationCalls:
              report.visualRetention.avoidedImageGenerationCalls,
            estimatedImageSavings: report.visualRetention.estimatedImageSavings,
          },
        }
      : {}),
  };
}
