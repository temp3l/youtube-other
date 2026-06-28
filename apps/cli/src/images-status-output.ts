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
  readonly episodeNumbers: readonly string[];
  readonly sceneCount: number;
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
    mergeCounts: {
      mergedWithPreviousScenes: report.mergedWithPreviousScenes,
      mergedWithNextScenes: report.mergedWithNextScenes,
      reusedScenes: report.reusedScenes,
    },
  };
}
