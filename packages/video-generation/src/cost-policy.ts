import {
  MICRODRAMA_BUDGET_SCHEMA_VERSION,
  type MicrodramaBudgetPreflight,
  type MicrodramaCostAttribution,
  type MicrodramaPreflightWorkItem,
} from "@mediaforge/domain";

import {
  VIDEO_GENERATION_ASSET_TYPE,
  type VideoGenerationCostEstimate,
  type VideoGenerationRequest,
  type VideoGenerationResult,
} from "./contracts.js";

export type VideoGenerationBudgetPort = {
  runBudgetPreflight(input: {
    readonly correlationId: string;
    readonly workItems: readonly MicrodramaPreflightWorkItem[];
    readonly evaluatedAt: string;
  }): MicrodramaBudgetPreflight;
  recordCostAttribution(input: {
    readonly attribution: MicrodramaCostAttribution;
    readonly evidence: unknown;
  }): MicrodramaCostAttribution | null;
};

export class VideoGenerationBudgetBlockedError extends Error {
  public constructor(public readonly preflight: MicrodramaBudgetPreflight) {
    super(preflight.message ?? "Video generation budget preflight blocked.");
    this.name = "VideoGenerationBudgetBlockedError";
  }
}

export function buildVideoPreflightWorkItem(input: {
  readonly request: VideoGenerationRequest;
  readonly estimate: VideoGenerationCostEstimate;
  readonly provider: string;
  readonly taskId: string;
}): MicrodramaPreflightWorkItem {
  return {
    taskId: input.taskId,
    episodeId: input.request.episodeId,
    provider: input.provider,
    assetType: VIDEO_GENERATION_ASSET_TYPE,
    assetCostScope: "shared_visual",
    revisionId: input.request.shotPlanRevisionId,
    estimatedCostMinor: input.estimate.estimatedCostMinor,
  };
}

export function assertVideoGenerationBudget(input: {
  readonly port: VideoGenerationBudgetPort;
  readonly correlationId: string;
  readonly evaluatedAt: string;
  readonly workItem: MicrodramaPreflightWorkItem;
}): MicrodramaBudgetPreflight {
  const preflight = input.port.runBudgetPreflight({
    correlationId: input.correlationId,
    workItems: [input.workItem],
    evaluatedAt: input.evaluatedAt,
  });
  if (!preflight.allowed) {
    throw new VideoGenerationBudgetBlockedError(preflight);
  }
  return preflight;
}

export function recordVideoGenerationCost(input: {
  readonly port: VideoGenerationBudgetPort;
  readonly request: VideoGenerationRequest;
  readonly result: VideoGenerationResult;
  readonly provider: string;
  readonly taskId: string;
  readonly correlationId: string;
  readonly reservationId: string;
  readonly recordedAt: string;
}): MicrodramaCostAttribution | null {
  return input.port.recordCostAttribution({
    attribution: {
      schemaVersion: MICRODRAMA_BUDGET_SCHEMA_VERSION,
      attributionId: `video.${input.request.generationId}`,
      episodeId: input.request.episodeId,
      provider: input.provider,
      assetType: VIDEO_GENERATION_ASSET_TYPE,
      assetCostScope: "shared_visual",
      revisionId: input.request.shotPlanRevisionId,
      reservationId: input.reservationId,
      costMinor: input.result.actualCostMinor,
      cacheStatus: input.result.cacheStatus,
      retryCount: 0,
      correlationId: input.correlationId,
      requestId: input.request.generationId,
      recordedAt: input.recordedAt,
    },
    evidence: {
      cacheKey: input.result.cacheKey,
      artifactHash: input.result.artifactHash,
      providerRequestId: input.result.providerRequestId,
    },
  });
}
