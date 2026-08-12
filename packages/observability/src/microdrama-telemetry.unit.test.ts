import { describe, expect, it } from "vitest";

import {
  buildMicrodramaTelemetryRecord,
  MICRODRAMA_BOUNDED_METRIC_NAMES,
  redactMicrodramaTelemetryEvidence,
  toMicrodramaLogFields,
  toMicrodramaTraceAttributes,
} from "./microdrama-telemetry.js";

const recordedAt = "2026-08-12T12:00:00.000Z";

describe("microdrama telemetry", () => {
  it("redacts secrets and bounds evidence size without leaking credentials", () => {
    const redacted = redactMicrodramaTelemetryEvidence({
      cacheKey: "render:de-DE",
      apiKey: "super-secret-key",
      authorization: "Bearer token",
      retryCount: 1,
    });
    expect(redacted.cacheKey).toBe("render:de-DE");
    expect(redacted.apiKey).toBe("[REDACTED]");
    expect(redacted.authorization).toBe("[REDACTED]");
    expect(JSON.stringify(redacted)).not.toContain("super-secret-key");
    expect(JSON.stringify(redacted)).not.toContain("Bearer token");
  });

  it("builds revision-correlated bounded metrics for usage, retry and cache evidence", () => {
    const record = buildMicrodramaTelemetryRecord({
      context: {
        correlationId: "corr.telemetry.1",
        requestId: "req.telemetry.1",
        revisionId: "rev.episode-001.de",
        episodeId: "episode-001",
        locale: "de-DE",
        provider: "elevenlabs",
        assetType: "tts",
        taskId: "task.tts",
      },
      cacheStatus: "hit",
      retryCount: 2,
      durationMs: 840,
      estimatedCostMinor: 120,
      settledCostMinor: 95,
      evidence: {
        cacheKey: "tts:de-DE",
        retryCount: 2,
        secret: "hidden",
      },
      recordedAt,
    });

    expect(record.context.revisionId).toBe("rev.episode-001.de");
    expect(record.retryCount).toBe(2);
    expect(record.metrics.every((metric) =>
      MICRODRAMA_BOUNDED_METRIC_NAMES.includes(metric.name)
    )).toBe(true);
    expect(record.evidence.secret).toBe("[REDACTED]");

    const logFields = toMicrodramaLogFields(record);
    expect(logFields.correlationId).toBe("corr.telemetry.1");
    expect(logFields.revisionId).toBe("rev.episode-001.de");

    const traceAttributes = toMicrodramaTraceAttributes(record);
    expect(traceAttributes["metric.cache_hit_count"]).toBe(1);
    expect(traceAttributes["metric.settled_cost_minor"]).toBe(95);
  });
});
