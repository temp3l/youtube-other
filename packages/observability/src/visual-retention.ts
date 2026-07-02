export interface VisualRetentionShotPlan {
  readonly shots: ReadonlyArray<{
    readonly shotId: string;
    readonly sourceImageId: string;
    readonly startMs: number;
    readonly endMs: number;
  }>;
  readonly sourceScenes: ReadonlyArray<{
    readonly sceneId: string;
  }>;
}

export interface VisualRetentionValidationIssue {
  readonly severity: "warning" | "error";
}

export interface VisualRetentionDerivedShotCacheSummary {
  readonly hits: number;
  readonly misses: number;
  readonly writes: number;
  readonly invalidEntries: number;
}

export interface VisualRetentionValidationMetrics {
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
}

export type VisualRetentionRolloutMode =
  | "disabled"
  | "preview"
  | "enabled";

export type VisualRetentionFallbackReasonCode =
  | "VISUAL_RETENTION_DISABLED"
  | "VISUAL_RETENTION_PREVIEW_MODE"
  | "SHOT_PLAN_MISSING"
  | "SHOT_PLAN_INVALID"
  | "SHOT_VALIDATION_FAILED"
  | "SHOT_RENDER_UNSUPPORTED"
  | "SHOT_RENDER_FAILED"
  | "LEGACY_EPISODE_NOT_MIGRATED"
  | "EXPLICIT_LEGACY_OVERRIDE";

export type VisualRetentionValidationStatus = "pass" | "warn" | "error";
export type VisualRetentionMetricValueKind =
  | "measured"
  | "derived"
  | "estimated";

export interface VisualRetentionMetricDefinition {
  readonly numerator: string;
  readonly denominator: string | null;
  readonly emptyInputBehavior: string;
  readonly units: string;
  readonly valueKind: VisualRetentionMetricValueKind;
}

export interface VisualRetentionSavingsEstimate {
  readonly estimated: true;
  readonly baseline: "one-image-per-rendered-shot";
  readonly avoidedCalls: number;
  readonly unitCostMicros: number | null;
  readonly currency: "USD" | null;
  readonly estimatedSavingsMicros: number | null;
  readonly pricingVersion?: string;
  readonly costBasis: string;
}

export interface VisualRetentionDerivedCacheMetrics {
  readonly hits: number;
  readonly misses: number;
  readonly writes: number;
  readonly invalidEntries: number;
  readonly hitRatio: number | null;
}

export interface VisualRetentionMetrics {
  readonly rolloutMode: VisualRetentionRolloutMode;
  readonly fallbackReason: VisualRetentionFallbackReasonCode | null;
  readonly generatedSourceImageCount: number;
  readonly reusedSourceImageCount: number | null;
  readonly uniqueSourceImageCount: number;
  readonly renderedShotCount: number;
  readonly averageShotsPerSourceImage: number | null;
  readonly totalUsesPerSourceImage: ReadonlyArray<{
    readonly sourceImageId: string;
    readonly uses: number;
  }>;
  readonly maximumConsecutiveSourceImageReuse: number;
  readonly avoidedImageGenerationCalls: number;
  readonly estimatedImageSavings: VisualRetentionSavingsEstimate;
  readonly localShotRenderDurationMs: number | null;
  readonly finalCompositionRenderDurationMs: number | null;
  readonly derivedShotCache: VisualRetentionDerivedCacheMetrics;
  readonly shotPlanRegenerationCount: number;
  readonly sourceImageRegenerationCount: number;
  readonly validationWarningCount: number;
  readonly validationErrorCount: number;
  readonly validationStatus: VisualRetentionValidationStatus;
  readonly meaningfulVisualChangesFirstEightSeconds: number;
  readonly longestStaticIntervalMs: number;
  readonly averageShotDurationMs: number | null;
  readonly climaxAverageShotDurationMs: number | null;
  readonly finalVisualChangeFrequencyPerSecond: number | null;
}

export const visualRetentionMetricDefinitions: Readonly<
  Record<string, VisualRetentionMetricDefinition>
> = {
  averageShotsPerSourceImage: {
    numerator: "renderedShotCount",
    denominator: "uniqueSourceImageCount",
    emptyInputBehavior: "null when uniqueSourceImageCount is 0",
    units: "shots/source-image",
    valueKind: "derived",
  },
  derivedClipCacheHitRatio: {
    numerator: "derivedShotCacheHits",
    denominator: "derivedShotCacheHits + derivedShotCacheMisses",
    emptyInputBehavior: "null when there are no cache hits or misses",
    units: "ratio",
    valueKind: "derived",
  },
  avoidedImageGenerationCalls: {
    numerator: "max(0, renderedShotCount - generatedSourceImageCount)",
    denominator: null,
    emptyInputBehavior: "0 when renderedShotCount is 0",
    units: "calls",
    valueKind: "derived",
  },
  finalVisualChangeFrequencyPerSecond: {
    numerator: "max(0, renderedShotCount - 1)",
    denominator: "plannedDurationSeconds",
    emptyInputBehavior: "null when plannedDurationSeconds is 0",
    units: "changes/second",
    valueKind: "derived",
  },
  estimatedImageSavingsMicros: {
    numerator: "avoidedImageGenerationCalls * unitCostMicros",
    denominator: null,
    emptyInputBehavior: "null when unitCostMicros is unavailable",
    units: "USD micros",
    valueKind: "estimated",
  },
};

export function summarizeValidationIssues(
  issues: readonly VisualRetentionValidationIssue[],
): {
  readonly warningCount: number;
  readonly errorCount: number;
  readonly status: VisualRetentionValidationStatus;
} {
  let warningCount = 0;
  let errorCount = 0;
  for (const issue of issues) {
    if (issue.severity === "error") {
      errorCount += 1;
    } else {
      warningCount += 1;
    }
  }
  return {
    warningCount,
    errorCount,
    status: errorCount > 0 ? "error" : warningCount > 0 ? "warn" : "pass",
  };
}

function sortedUsageCounts(
  shotPlan: VisualRetentionShotPlan,
): ReadonlyArray<{ readonly sourceImageId: string; readonly uses: number }> {
  const counts = new Map<string, number>();
  for (const shot of shotPlan.shots) {
    counts.set(shot.sourceImageId, (counts.get(shot.sourceImageId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    })
    .map(([sourceImageId, uses]) => ({ sourceImageId, uses }));
}

function plannedDurationSeconds(shotPlan: VisualRetentionShotPlan): number {
  const firstShot = shotPlan.shots.at(0);
  const lastShot = shotPlan.shots.at(-1);
  if (!firstShot || !lastShot) {
    return 0;
  }
  return Math.max(0, lastShot.endMs - firstShot.startMs) / 1000;
}

export function buildDerivedShotCacheMetrics(
  cache?: VisualRetentionDerivedShotCacheSummary,
): VisualRetentionDerivedCacheMetrics {
  const hits = cache?.hits ?? 0;
  const misses = cache?.misses ?? 0;
  const denominator = hits + misses;
  return {
    hits,
    misses,
    writes: cache?.writes ?? 0,
    invalidEntries: cache?.invalidEntries ?? 0,
    hitRatio: denominator === 0 ? null : hits / denominator,
  };
}

export function buildEstimatedImageSavings(args: {
  readonly renderedShotCount: number;
  readonly generatedSourceImageCount: number;
  readonly unitCostMicros?: number | null;
  readonly pricingVersion?: string;
  readonly costBasis: string;
}): VisualRetentionSavingsEstimate {
  const avoidedCalls = Math.max(
    0,
    args.renderedShotCount - args.generatedSourceImageCount,
  );
  return {
    estimated: true,
    baseline: "one-image-per-rendered-shot",
    avoidedCalls,
    unitCostMicros: args.unitCostMicros ?? null,
    currency: args.unitCostMicros === undefined || args.unitCostMicros === null ? null : "USD",
    estimatedSavingsMicros:
      args.unitCostMicros === undefined || args.unitCostMicros === null
        ? null
        : avoidedCalls * args.unitCostMicros,
    ...(args.pricingVersion ? { pricingVersion: args.pricingVersion } : {}),
    costBasis: args.costBasis,
  };
}

export function buildVisualRetentionMetrics(args: {
  readonly rolloutMode: VisualRetentionRolloutMode;
  readonly shotPlan: VisualRetentionShotPlan;
  readonly validationIssues: readonly VisualRetentionValidationIssue[];
  readonly validationMetrics: VisualRetentionValidationMetrics;
  readonly generatedSourceImageCount?: number;
  readonly reusedSourceImageCount?: number | null;
  readonly derivedShotCache?: VisualRetentionDerivedShotCacheSummary;
  readonly unitCostMicros?: number | null;
  readonly pricingVersion?: string;
  readonly costBasis?: string;
  readonly fallbackReason?: VisualRetentionFallbackReasonCode | null;
  readonly localShotRenderDurationMs?: number | null;
  readonly finalCompositionRenderDurationMs?: number | null;
  readonly shotPlanRegenerationCount?: number;
  readonly sourceImageRegenerationCount?: number;
}): VisualRetentionMetrics {
  const usage = sortedUsageCounts(args.shotPlan);
  const validation = summarizeValidationIssues(args.validationIssues);
  const uniqueSourceImageCount =
    args.validationMetrics.uniqueSourceImages > 0
      ? args.validationMetrics.uniqueSourceImages
      : usage.length;
  const generatedSourceImageCount =
    args.generatedSourceImageCount ?? uniqueSourceImageCount;
  const savings = buildEstimatedImageSavings({
    renderedShotCount: args.shotPlan.shots.length,
    generatedSourceImageCount,
    unitCostMicros: args.unitCostMicros ?? null,
    costBasis:
      args.costBasis ??
      "one-image-per-rendered-shot baseline using current image manifest metadata",
    ...(args.pricingVersion ? { pricingVersion: args.pricingVersion } : {}),
  });
  return {
    rolloutMode: args.rolloutMode,
    fallbackReason: args.fallbackReason ?? null,
    generatedSourceImageCount,
    reusedSourceImageCount: args.reusedSourceImageCount ?? null,
    uniqueSourceImageCount,
    renderedShotCount: args.shotPlan.shots.length,
    averageShotsPerSourceImage:
      uniqueSourceImageCount === 0
        ? null
        : args.shotPlan.shots.length / uniqueSourceImageCount,
    totalUsesPerSourceImage: usage,
    maximumConsecutiveSourceImageReuse:
      args.validationMetrics.maximumConsecutiveSourceImageUses,
    avoidedImageGenerationCalls: savings.avoidedCalls,
    estimatedImageSavings: savings,
    localShotRenderDurationMs: args.localShotRenderDurationMs ?? null,
    finalCompositionRenderDurationMs:
      args.finalCompositionRenderDurationMs ?? null,
    derivedShotCache: buildDerivedShotCacheMetrics(args.derivedShotCache),
    shotPlanRegenerationCount: args.shotPlanRegenerationCount ?? 0,
    sourceImageRegenerationCount: args.sourceImageRegenerationCount ?? 0,
    validationWarningCount: validation.warningCount,
    validationErrorCount: validation.errorCount,
    validationStatus: validation.status,
    meaningfulVisualChangesFirstEightSeconds:
      args.validationMetrics.openingMeaningfulChanges,
    longestStaticIntervalMs: args.validationMetrics.longestStaticIntervalMs,
    averageShotDurationMs:
      args.validationMetrics.totalShots === 0
        ? null
        : args.validationMetrics.averageShotDurationMs,
    climaxAverageShotDurationMs:
      args.validationMetrics.climaxAverageShotDurationMs,
    finalVisualChangeFrequencyPerSecond:
      plannedDurationSeconds(args.shotPlan) === 0
        ? null
        : Math.max(0, args.shotPlan.shots.length - 1) /
          plannedDurationSeconds(args.shotPlan),
  };
}
