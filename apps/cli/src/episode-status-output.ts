import type { ImageStatusReport } from "./images-status-output.js";

export interface EpisodeStatusOutput {
  readonly episodeId: string;
  readonly slug: string;
  readonly pipelineRuns: number;
  readonly imageGeneration: ReturnType<typeof buildEpisodeImageGenerationOutput>;
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
  };
}
