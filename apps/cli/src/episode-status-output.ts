import type { ImageStatusReport } from "./images-status-output.js";

export interface EpisodeStatusOutput {
  readonly episodeId: string;
  readonly slug: string;
  readonly pipelineRuns: number;
  readonly imageGeneration: ReturnType<typeof buildEpisodeImageGenerationOutput>;
  readonly visualRetention?: ReturnType<typeof buildEpisodeVisualRetentionOutput>;
}

export function buildEpisodeImageGenerationOutput(
  report: ImageStatusReport
): Record<string, unknown> {
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
    mergeCounts: {
      mergedWithPreviousScenes: report.mergedWithPreviousScenes,
      mergedWithNextScenes: report.mergedWithNextScenes,
      reusedScenes: report.reusedScenes,
    },
  };
}

export function buildEpisodeVisualRetentionOutput(
  report: ImageStatusReport,
): Record<string, unknown> | undefined {
  if (!report.visualRetention) {
    return undefined;
  }
  return {
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
  };
}

export function buildEpisodeStatusOutput(args: {
  readonly episodeId: string;
  readonly slug: string;
  readonly pipelineRuns: number;
  readonly imageGeneration: ImageStatusReport;
}): EpisodeStatusOutput {
  return {
    episodeId: args.episodeId,
    slug: args.slug,
    pipelineRuns: args.pipelineRuns,
    imageGeneration: buildEpisodeImageGenerationOutput(args.imageGeneration),
    ...(buildEpisodeVisualRetentionOutput(args.imageGeneration)
      ? { visualRetention: buildEpisodeVisualRetentionOutput(args.imageGeneration) }
      : {}),
  };
}
