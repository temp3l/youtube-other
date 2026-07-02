export interface ShotPlanValidationMetrics {
  readonly totalShots: number;
  readonly uniqueSourceImages: number;
  readonly averageShotDurationMs: number;
  readonly medianShotDurationMs: number;
  readonly longestShotDurationMs: number;
  readonly longestStaticIntervalMs: number;
  readonly openingMeaningfulChanges: number;
  readonly climaxAverageShotDurationMs: number | null;
  readonly averageShotsPerSourceImage: number;
  readonly maximumConsecutiveSourceImageUses: number;
  readonly treatmentCounts: Readonly<Record<string, number>>;
  readonly transitionCounts: Readonly<Record<string, number>>;
}

export function emptyShotPlanValidationMetrics(): ShotPlanValidationMetrics {
  return {
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
  };
}
