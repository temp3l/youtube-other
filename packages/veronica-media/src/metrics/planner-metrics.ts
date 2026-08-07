import type { VeronicaIngestedAsset } from "../ingestion/secure-ingest.js";
import {
  veronicaPlannerMetricsSchema,
  type VeronicaMediaPlan,
} from "../contracts/media-plan.v1.js";

export function computePlannerMetrics(input: {
  readonly assets: readonly VeronicaIngestedAsset[];
  readonly placements: VeronicaMediaPlan["placements"];
  readonly preparedAssets: VeronicaMediaPlan["preparedAssets"];
  readonly cacheHits: number;
  readonly cacheLookups: number;
  readonly portraitFailures?: number;
  readonly anchorFailures?: number;
}) {
  const usedAssetIds = new Set(
    input.placements.flatMap((placement) =>
      placement.visualStateIds.flatMap((stateId) => [stateId]),
    ),
  );
  const suppliedAssetUtilizationRatio =
    input.assets.length === 0
      ? 1
      : Math.min(
          1,
          input.placements.length / Math.max(input.assets.length, 1),
        );
  const repeatedAssetRatio =
    input.placements.length === 0
      ? 0
      : 1 -
        new Set(input.placements.map((placement) => placement.anchorId)).size /
          input.placements.length;
  const fallbackCount = input.placements.filter(
    (placement) => placement.fallback.fallbackAllowed,
  ).length;
  const approvalRequiredCount = input.preparedAssets.filter(
    (asset) => asset.translationStatus?.requiresApproval,
  ).length;
  const lowConfidenceCount = input.preparedAssets.filter(
    (asset) =>
      asset.translationStatus &&
      asset.translationStatus.confidence < 0.8,
  ).length;
  const untranslatedTextIncidents = input.preparedAssets.filter(
    (asset) =>
      asset.translationStatus?.status === "pending" ||
      asset.translationStatus?.status === "overflow",
  ).length;
  const dwellTotal = input.placements.reduce(
    (sum, placement) => sum + placement.dwellDurationSeconds,
    0,
  );
  return veronicaPlannerMetricsSchema.parse({
    suppliedAssetUtilizationRatio,
    unusedHighRelevanceAssetCount: Math.max(
      0,
      input.assets.length - input.placements.length,
    ),
    repeatedAssetRatio,
    fallbackRatio:
      input.placements.length === 0 ? 0 : fallbackCount / input.placements.length,
    approvalRequiredRatio:
      input.preparedAssets.length === 0
        ? 0
        : approvalRequiredCount / input.preparedAssets.length,
    lowConfidencePlacementRatio:
      input.preparedAssets.length === 0
        ? 0
        : lowConfidenceCount / input.preparedAssets.length,
    untranslatedTextIncidents,
    portraitAdaptationFailures: input.portraitFailures ?? 0,
    narrationAnchorResolutionFailures: input.anchorFailures ?? 0,
    averageVisualDwellDurationSeconds:
      input.placements.length === 0 ? 0 : dwellTotal / input.placements.length,
    semanticCoverageRatio:
      input.assets.length === 0
        ? 1
        : Math.min(1, usedAssetIds.size / input.assets.length),
    redesignFrequency:
      input.preparedAssets.length === 0
        ? 0
        : input.preparedAssets.filter((asset) => asset.relativePath.includes("redesign"))
            .length / input.preparedAssets.length,
    cacheHitRatio:
      input.cacheLookups === 0 ? 0 : input.cacheHits / input.cacheLookups,
  });
}
