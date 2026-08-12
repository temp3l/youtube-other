import {
  type MicrodramaBudgetPreflight,
  type MicrodramaBudgetProfile,
  type MicrodramaCostAttribution,
  type MicrodramaPreflightWorkItem,
} from "@mediaforge/domain";
import {
  buildMicrodramaTelemetryRecord,
  type MicrodramaTelemetryRecord,
} from "@mediaforge/observability";

export type MicrodramaBudgetPreflightPort = {
  runBudgetPreflight(input: {
    readonly correlationId: string;
    readonly workItems: readonly MicrodramaPreflightWorkItem[];
    readonly evaluatedAt: string;
  }): MicrodramaBudgetPreflight;
  recordPreflightReservations(
    preflight: MicrodramaBudgetPreflight
  ): readonly MicrodramaBudgetPreflight["reservations"];
  recordCostAttribution(input: {
    readonly attribution: MicrodramaCostAttribution;
    readonly evidence: unknown;
  }): MicrodramaCostAttribution | null;
  upsertBudgetProfile(input: {
    readonly profile: MicrodramaBudgetProfile;
  }): MicrodramaBudgetProfile;
};

export type MicrodramaBudgetPreflightResult = {
  readonly preflight: MicrodramaBudgetPreflight;
  readonly reservations: readonly MicrodramaBudgetPreflight["reservations"];
  readonly telemetry: MicrodramaTelemetryRecord | null;
};

export class MicrodramaBudgetPreflightBlockedError extends Error {
  public constructor(
    public readonly preflight: MicrodramaBudgetPreflight
  ) {
    super(preflight.message ?? "Microdrama budget preflight blocked.");
    this.name = "MicrodramaBudgetPreflightBlockedError";
  }
}

export function runMicrodramaBudgetPreflight(input: {
  readonly port: MicrodramaBudgetPreflightPort;
  readonly correlationId: string;
  readonly requestId: string;
  readonly workItems: readonly MicrodramaPreflightWorkItem[];
  readonly evaluatedAt: string;
}): MicrodramaBudgetPreflightResult {
  const preflight = input.port.runBudgetPreflight({
    correlationId: input.correlationId,
    workItems: input.workItems,
    evaluatedAt: input.evaluatedAt,
  });
  if (!preflight.allowed) {
    throw new MicrodramaBudgetPreflightBlockedError(preflight);
  }

  const reservations = input.port.recordPreflightReservations(preflight);
  const firstItem = input.workItems[0];
  const telemetry =
    firstItem === undefined
      ? null
      : buildMicrodramaTelemetryRecord({
          context: {
            correlationId: input.correlationId,
            requestId: input.requestId,
            revisionId: firstItem.revisionId,
            episodeId: firstItem.episodeId,
            locale: firstItem.locale,
            provider: firstItem.provider,
            assetType: firstItem.assetType,
            taskId: firstItem.taskId,
          },
          cacheStatus: "disabled",
          retryCount: 0,
          durationMs: 0,
          estimatedCostMinor: firstItem.estimatedCostMinor,
          evidence: {
            reservationCount: reservations.length,
            workItemCount: input.workItems.length,
          },
          recordedAt: input.evaluatedAt,
        });

  return { preflight, reservations, telemetry };
}

export function settleMicrodramaCostAttribution(input: {
  readonly port: MicrodramaBudgetPreflightPort;
  readonly attribution: MicrodramaCostAttribution;
  readonly evidence: unknown;
  readonly durationMs: number;
}): {
  readonly attribution: MicrodramaCostAttribution | null;
  readonly telemetry: MicrodramaTelemetryRecord;
} {
  const recorded = input.port.recordCostAttribution({
    attribution: input.attribution,
    evidence: input.evidence,
  });
  const telemetry = buildMicrodramaTelemetryRecord({
    context: {
      correlationId: input.attribution.correlationId,
      requestId: input.attribution.requestId,
      revisionId: input.attribution.revisionId,
      episodeId: input.attribution.episodeId,
      locale: input.attribution.locale,
      provider: input.attribution.provider,
      assetType: input.attribution.assetType,
    },
    cacheStatus: input.attribution.cacheStatus,
    retryCount: input.attribution.retryCount,
    durationMs: input.durationMs,
    estimatedCostMinor: input.attribution.costMinor,
    settledCostMinor: recorded?.costMinor,
    evidence: input.evidence,
    recordedAt: input.attribution.recordedAt,
  });
  return { attribution: recorded, telemetry };
}
