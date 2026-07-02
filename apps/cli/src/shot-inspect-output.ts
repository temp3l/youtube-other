import type {
  RenderShot,
  ShotPlan,
  ShotPlanValidationIssue,
} from "@mediaforge/domain";
import {
  buildVisualRetentionMetrics,
  summarizeValidationIssues,
} from "@mediaforge/observability";
import {
  classifyMeaningfulVisualChange,
  type ShotPlanValidationMetrics,
} from "@mediaforge/visual-planning";

export type ShotInspectFormat = "json" | "text";

export interface ShotInspectCacheSummary {
  readonly available: boolean;
  readonly hits?: number;
  readonly misses?: number;
  readonly writes?: number;
  readonly invalidEntries?: number;
}

export interface ShotInspectEstimatedSavings {
  readonly estimated: true;
  readonly avoidedImageGenerationCalls: number;
  readonly pricingVersion?: string;
  readonly estimatedCostMicros: number | null;
  readonly currency: "USD" | null;
  readonly costBasis: string;
}

export interface ShotInspectValidationSummary {
  readonly status: "pass" | "warn" | "fail";
  readonly warningCount: number;
  readonly errorCount: number;
}

export interface ShotInspectDurationSummary {
  readonly averageMs: number;
  readonly medianMs: number;
  readonly longest: {
    readonly shotId: string;
    readonly durationMs: number;
  } | null;
  readonly longestStaticIntervalMs: number;
}

export interface ShotInspectReport {
  readonly episodeId: string;
  readonly locale: string;
  readonly variant: ShotPlan["variant"];
  readonly generatedSourceImageCount: number;
  readonly totalRenderedShotCount: number;
  readonly durations: ShotInspectDurationSummary;
  readonly meaningfulVisualChangesFirstEightSeconds: number;
  readonly openingChangeIntervalsMs: readonly number[];
  readonly climaxAverageShotDurationMs: number | null;
  readonly climaxChangeIntervalsMs: readonly number[];
  readonly averageShotsPerSourceImage: number;
  readonly maximumConsecutiveSourceImageReuse: number;
  readonly maximumTotalUsesForOneSourceImage: number;
  readonly treatmentDistribution: readonly {
    readonly treatmentId: string;
    readonly count: number;
  }[];
  readonly transitionDistribution: readonly {
    readonly transition: string;
    readonly count: number;
  }[];
  readonly sourceImageUsageDistribution: readonly {
    readonly sourceImageId: string;
    readonly count: number;
  }[];
  readonly validation: ShotInspectValidationSummary;
  readonly estimatedSavings: ShotInspectEstimatedSavings;
  readonly estimatedLocalRenderClipCount: number;
  readonly derivedClipCache: ShotInspectCacheSummary;
}

export function buildShotInspectReport(args: {
  readonly shotPlan: ShotPlan;
  readonly validationIssues: readonly ShotPlanValidationIssue[];
  readonly validationMetrics: ShotPlanValidationMetrics;
  readonly estimatedCostMicros: number | null;
  readonly pricingVersion: string;
  readonly derivedClipCache?: ShotInspectCacheSummary;
}): ShotInspectReport {
  const shots = orderedShots(args.shotPlan.shots);
  const longestShot = shots.reduce<RenderShot | null>((current, shot) => {
    if (current === null) {
      return shot;
    }
    const currentDuration = current.endMs - current.startMs;
    const nextDuration = shot.endMs - shot.startMs;
    if (nextDuration === currentDuration) {
      return shot.shotId.localeCompare(current.shotId) < 0 ? shot : current;
    }
    return nextDuration > currentDuration ? shot : current;
  }, null);
  const sourceImageUsageDistribution = buildCountDistribution(
    shots.map((shot) => shot.sourceImageId),
    "sourceImageId"
  );
  const avoidedImageGenerationCalls = Math.max(
    0,
    shots.length - args.shotPlan.sourceScenes.length
  );
  const visualMetrics = buildVisualRetentionMetrics({
    rolloutMode: "enabled",
    shotPlan: args.shotPlan,
    validationIssues: args.validationIssues,
    validationMetrics: args.validationMetrics,
    generatedSourceImageCount: args.shotPlan.sourceScenes.length,
    unitCostMicros:
      args.estimatedCostMicros === null || avoidedImageGenerationCalls === 0
        ? null
        : args.estimatedCostMicros / avoidedImageGenerationCalls,
    pricingVersion: args.pricingVersion,
    costBasis: "shot inspect baseline from one image per rendered shot",
    ...(args.derivedClipCache?.available
      ? {
          derivedShotCache: {
            hits: args.derivedClipCache.hits ?? 0,
            misses: args.derivedClipCache.misses ?? 0,
            writes: args.derivedClipCache.writes ?? 0,
            invalidEntries: args.derivedClipCache.invalidEntries ?? 0,
          },
        }
      : {}),
  });
  return {
    episodeId: args.shotPlan.sourceId,
    locale: args.shotPlan.locale ?? "und",
    variant: args.shotPlan.variant,
    generatedSourceImageCount: args.shotPlan.sourceScenes.length,
    totalRenderedShotCount: shots.length,
    durations: {
      averageMs: args.validationMetrics.averageShotDurationMs,
      medianMs: args.validationMetrics.medianShotDurationMs,
      longest:
        longestShot === null
          ? null
          : {
              shotId: longestShot.shotId,
              durationMs: longestShot.endMs - longestShot.startMs,
            },
      longestStaticIntervalMs: args.validationMetrics.longestStaticIntervalMs,
    },
    meaningfulVisualChangesFirstEightSeconds:
      args.validationMetrics.openingMeaningfulChanges,
    openingChangeIntervalsMs: meaningfulChangeIntervalsMs(
      shots,
      args.shotPlan,
      {
        startMs: 0,
        endMs: 8_000,
      }
    ),
    climaxAverageShotDurationMs:
      args.validationMetrics.climaxAverageShotDurationMs,
    climaxChangeIntervalsMs: climaxChangeIntervalsMs(shots, args.shotPlan),
    averageShotsPerSourceImage:
      visualMetrics.averageShotsPerSourceImage ?? 0,
    maximumConsecutiveSourceImageReuse:
      args.validationMetrics.maximumConsecutiveSourceImageUses,
    maximumTotalUsesForOneSourceImage:
      sourceImageUsageDistribution[0]?.count ?? 0,
    treatmentDistribution: buildCountDistribution(
      shots.map((shot) => shot.treatment.treatmentId),
      "treatmentId"
    ),
    transitionDistribution: buildCountDistribution(
      shots.map((shot) => shot.transition?.kind ?? "none"),
      "transition"
    ),
    sourceImageUsageDistribution,
    validation: summarizeValidation(args.validationIssues),
    estimatedSavings: {
      estimated: true,
      avoidedImageGenerationCalls,
      ...(visualMetrics.estimatedImageSavings.pricingVersion
        ? { pricingVersion: visualMetrics.estimatedImageSavings.pricingVersion }
        : {}),
      estimatedCostMicros:
        visualMetrics.estimatedImageSavings.estimatedSavingsMicros,
      currency: visualMetrics.estimatedImageSavings.currency,
      costBasis: visualMetrics.estimatedImageSavings.costBasis,
    },
    estimatedLocalRenderClipCount: shots.length,
    derivedClipCache: args.derivedClipCache ?? { available: false },
  };
}

export function formatShotInspectReport(report: ShotInspectReport): string {
  const savings =
    report.estimatedSavings.estimatedCostMicros === null
      ? "estimated savings unavailable"
      : `estimated savings ${formatUsd(report.estimatedSavings.estimatedCostMicros)}`;
  const cache = report.derivedClipCache.available
    ? `hits ${report.derivedClipCache.hits ?? 0}, misses ${report.derivedClipCache.misses ?? 0}`
    : "no cache report";
  return [
    `Shot inspection for ${report.episodeId} (${report.variant}/${report.locale})`,
    `Source images: ${report.generatedSourceImageCount}`,
    `Rendered shots: ${report.totalRenderedShotCount}`,
    `Average shot duration: ${formatSeconds(report.durations.averageMs)}`,
    `Median shot duration: ${formatSeconds(report.durations.medianMs)}`,
    `Longest shot: ${report.durations.longest === null ? "n/a" : `${report.durations.longest.shotId} (${formatSeconds(report.durations.longest.durationMs)})`}`,
    `Longest static interval: ${formatSeconds(report.durations.longestStaticIntervalMs)}`,
    `Opening meaningful changes (first 8s): ${report.meaningfulVisualChangesFirstEightSeconds}`,
    `Opening change intervals: ${formatIntervals(report.openingChangeIntervalsMs)}`,
    `Climax average shot duration: ${formatOptionalSeconds(report.climaxAverageShotDurationMs)}`,
    `Climax change intervals: ${formatIntervals(report.climaxChangeIntervalsMs)}`,
    `Average shots per source image: ${report.averageShotsPerSourceImage.toFixed(2)}`,
    `Max consecutive source-image reuse: ${report.maximumConsecutiveSourceImageReuse}`,
    `Max total uses for one source image: ${report.maximumTotalUsesForOneSourceImage}`,
    `Validation: ${report.validation.status} (${report.validation.errorCount} errors, ${report.validation.warningCount} warnings)`,
    `Estimated avoided image calls: ${report.estimatedSavings.avoidedImageGenerationCalls} (${savings})`,
    `Estimated local render clips: ${report.estimatedLocalRenderClipCount}`,
    `Derived clip cache: ${cache}`,
    `Treatment distribution: ${formatDistribution(report.treatmentDistribution, "treatmentId")}`,
    `Transition distribution: ${formatDistribution(report.transitionDistribution, "transition")}`,
    `Source-image usage: ${formatDistribution(report.sourceImageUsageDistribution, "sourceImageId")}`,
  ].join("\n");
}

function orderedShots(shots: readonly RenderShot[]): readonly RenderShot[] {
  return [...shots].sort((left, right) => {
    if (left.startMs !== right.startMs) {
      return left.startMs - right.startMs;
    }
    return left.shotId.localeCompare(right.shotId);
  });
}

function buildCountDistribution<TKey extends string>(
  values: readonly string[],
  key: TKey
): ReadonlyArray<Record<TKey, string> & { readonly count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    })
    .map(([value, count]) => ({ [key]: value, count })) as ReadonlyArray<
    Record<TKey, string> & { readonly count: number }
  >;
}

function summarizeValidation(
  issues: readonly ShotPlanValidationIssue[]
): ShotInspectValidationSummary {
  const summary = summarizeValidationIssues(issues);
  return {
    status:
      summary.status === "error"
        ? "fail"
        : summary.status,
    warningCount: summary.warningCount,
    errorCount: summary.errorCount,
  };
}

function meaningfulChangeIntervalsMs(
  shots: readonly RenderShot[],
  shotPlan: ShotPlan,
  window: { readonly startMs: number; readonly endMs: number }
): readonly number[] {
  const boundaries: number[] = [];
  for (let index = 1; index < shots.length; index += 1) {
    const previous = shots[index - 1];
    const next = shots[index];
    if (!previous || !next) {
      continue;
    }
    if (next.startMs < window.startMs || next.startMs > window.endMs) {
      continue;
    }
    const change = classifyMeaningfulVisualChange({
      previous,
      next,
      visualBudget: shotPlan.visualBudget,
    });
    if (change.meaningful) {
      boundaries.push(next.startMs);
    }
  }
  const points = [window.startMs, ...boundaries];
  const intervals: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[index - 1];
    if (current !== undefined && previous !== undefined) {
      intervals.push(current - previous);
    }
  }
  return intervals;
}

function climaxChangeIntervalsMs(
  shots: readonly RenderShot[],
  shotPlan: ShotPlan
): readonly number[] {
  const totalDurationMs = shots.at(-1)?.endMs ?? 0;
  const climaxStartMs = Math.floor(totalDurationMs * (2 / 3));
  return meaningfulChangeIntervalsMs(shots, shotPlan, {
    startMs: climaxStartMs,
    endMs: totalDurationMs,
  });
}

function formatDistribution<TKey extends string>(
  values: ReadonlyArray<Record<TKey, string> & { readonly count: number }>,
  key: TKey
): string {
  if (values.length === 0) {
    return "none";
  }
  return values.map((value) => `${value[key]}=${value.count}`).join(", ");
}

function formatIntervals(intervalsMs: readonly number[]): string {
  if (intervalsMs.length === 0) {
    return "none";
  }
  return intervalsMs.map((value) => formatSeconds(value)).join(", ");
}

function formatSeconds(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(2)}s`;
}

function formatOptionalSeconds(milliseconds: number | null): string {
  return milliseconds === null ? "n/a" : formatSeconds(milliseconds);
}

function formatUsd(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(4)}`;
}
