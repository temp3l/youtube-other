import { describe, expect, it } from "vitest";

import {
  MicrodramaBudgetPreflightBlockedError,
  runMicrodramaBudgetPreflight,
  settleMicrodramaCostAttribution,
  type MicrodramaBudgetPreflightPort,
} from "./microdrama-budget-preflight.js";

const evaluatedAt = "2026-08-12T12:00:00.000Z";

function createPort(
  overrides: Partial<MicrodramaBudgetPreflightPort> = {}
): MicrodramaBudgetPreflightPort {
  const reservations: Array<unknown> = [];
  const attributions: Array<unknown> = [];
  return {
    runBudgetPreflight: () => ({
      schemaVersion: "mediaforge.microdrama-budget.v1",
      correlationId: "corr.workflow.1",
      allowed: true,
      reservations: [
        {
          schemaVersion: "mediaforge.microdrama-budget.v1",
          reservationId: "reservation.workflow.1",
          profileId: "profile.episode.episode-001",
          revisionId: "rev.episode-001.en",
          episodeId: "episode-001",
          locale: "en-US",
          provider: "elevenlabs",
          taskId: "task.tts",
          reservedMinor: 120,
          state: "reserved",
          correlationId: "corr.workflow.1",
          createdAt: evaluatedAt,
          updatedAt: evaluatedAt,
        },
      ],
      evaluatedAt,
    }),
    recordPreflightReservations: (preflight) => {
      reservations.push(...preflight.reservations);
      return preflight.reservations;
    },
    recordCostAttribution: ({ attribution }) => {
      attributions.push(attribution);
      return attribution;
    },
    upsertBudgetProfile: ({ profile }) => profile,
    ...overrides,
  };
}

describe("microdrama budget preflight workflow", () => {
  it("blocks provider work when preflight fails closed", () => {
    const port = createPort({
      runBudgetPreflight: () => ({
        schemaVersion: "mediaforge.microdrama-budget.v1",
        correlationId: "corr.workflow.blocked",
        allowed: false,
        blockReason: "budget_profile_missing",
        message: "Missing budget profile for task:task.tts",
        reservations: [],
        evaluatedAt,
      }),
    });

    expect(() =>
      runMicrodramaBudgetPreflight({
        port,
        correlationId: "corr.workflow.blocked",
        requestId: "req.workflow.blocked",
        workItems: [
          {
            taskId: "task.tts",
            episodeId: "episode-001",
            locale: "en-US",
            provider: "elevenlabs",
            assetType: "tts",
            assetCostScope: "locale_tts",
            revisionId: "rev.episode-001.en",
            estimatedCostMinor: 120,
          },
        ],
        evaluatedAt,
      })
    ).toThrow(MicrodramaBudgetPreflightBlockedError);
  });

  it("persists reservations and emits revision-correlated telemetry on success", () => {
    const result = runMicrodramaBudgetPreflight({
      port: createPort(),
      correlationId: "corr.workflow.1",
      requestId: "req.workflow.1",
      workItems: [
        {
          taskId: "task.tts",
          episodeId: "episode-001",
          locale: "en-US",
          provider: "elevenlabs",
          assetType: "tts",
          assetCostScope: "locale_tts",
          revisionId: "rev.episode-001.en",
          estimatedCostMinor: 120,
        },
      ],
      evaluatedAt,
    });

    expect(result.reservations).toHaveLength(1);
    expect(result.telemetry?.context.revisionId).toBe("rev.episode-001.en");
    expect(result.telemetry?.context.correlationId).toBe("corr.workflow.1");
  });

  it("records settled attribution telemetry with retry and cache evidence", () => {
    const settled = settleMicrodramaCostAttribution({
      port: createPort(),
      attribution: {
        schemaVersion: "mediaforge.microdrama-budget.v1",
        attributionId: "attr.workflow.1",
        episodeId: "episode-001",
        locale: "en-US",
        provider: "elevenlabs",
        assetType: "tts",
        assetCostScope: "locale_tts",
        revisionId: "rev.episode-001.en",
        reservationId: "reservation.workflow.1",
        costMinor: 120,
        cacheStatus: "hit",
        retryCount: 1,
        correlationId: "corr.workflow.1",
        requestId: "req.workflow.1",
        recordedAt: evaluatedAt,
      },
      evidence: { cacheKey: "tts:en-US", retryCount: 1 },
      durationMs: 640,
    });

    expect(settled.attribution?.costMinor).toBe(120);
    expect(settled.telemetry.retryCount).toBe(1);
    expect(settled.telemetry.cacheStatus).toBe("hit");
  });
});
