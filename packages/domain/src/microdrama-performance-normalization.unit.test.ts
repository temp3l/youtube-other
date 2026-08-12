import { describe, expect, it } from "vitest";

import {
  buildPerformanceRawObservation,
  normalizeProviderPerformanceCounters,
} from "./microdrama-performance-normalization.js";
import { planPerformanceObservation } from "./microdrama-performance-lifecycle.js";

const identity = {
  seriesId: "series.001",
  episodeId: "episode.001",
  episodeRevisionId: "episode.rev.001",
  locale: "en-US",
  provider: "tiktok" as const,
  providerAccountId: "tiktok.account.001",
  publicationId: "intent.001",
  publicationRevision: 1,
  renderHash: "a".repeat(64),
  metadataRevisionId: "meta.rev.001",
  observationWindow: {
    windowStart: "2026-08-12T00:00:00.000Z",
    windowEnd: "2026-08-12T23:59:59.000Z",
  },
};

describe("microdrama performance normalization", () => {
  it("keeps missing metrics unavailable instead of zero", () => {
    const normalized = normalizeProviderPerformanceCounters({
      counters: {
        view_count: 120,
        like_count: 8,
      },
    });

    expect(normalized.metrics.views).toEqual({ status: "available", value: 120 });
    expect(normalized.metrics.likes).toEqual({ status: "available", value: 8 });
    expect(normalized.metrics.comments).toEqual({ status: "unavailable" });
    expect(normalized.metrics.completion_rate).toEqual({ status: "unavailable" });
    expect(normalized.metrics.retention_rate).toEqual({ status: "unavailable" });
  });

  it("does not infer retention or completion from basic counters", () => {
    const normalized = normalizeProviderPerformanceCounters({
      counters: {
        view_count: 500,
        like_count: 20,
        comment_count: 3,
        share_count: 1,
      },
    });

    expect(normalized.metrics.views).toEqual({ status: "available", value: 500 });
    expect(normalized.metrics.completion_rate).toEqual({ status: "unavailable" });
    expect(normalized.metrics.retention_rate).toEqual({ status: "unavailable" });
  });

  it("accepts explicit completion and retention rates from authorized fields", () => {
    const normalized = normalizeProviderPerformanceCounters({
      counters: {
        view_count: 900,
        completion_rate: 0.42,
        retention_rate: 0.31,
      },
    });

    expect(normalized.metrics.completion_rate).toEqual({
      status: "available",
      value: 0.42,
    });
    expect(normalized.metrics.retention_rate).toEqual({
      status: "available",
      value: 0.31,
    });
  });

  it("plans revision-linked observations with locale and publication identity", () => {
    const raw = buildPerformanceRawObservation({
      provider: "youtube",
      providerAccountId: "youtube.channel.001",
      providerVideoId: "video.001",
      fetchedAt: "2026-08-12T12:00:00.000Z",
      counters: {
        views: 44,
        comments: 2,
      },
    });

    const observation = planPerformanceObservation({
      identity: {
        ...identity,
        provider: "youtube",
        providerAccountId: "youtube.channel.001",
        locale: "de-DE",
      },
      raw,
      baseline: {
        accountBaselineHash: "b".repeat(64),
        audienceContextHash: "c".repeat(64),
      },
      observedAt: "2026-08-12T12:00:00.000Z",
      idempotencyKey: "perf.ingest.001",
    });

    expect(observation.identity.locale).toBe("de-DE");
    expect(observation.identity.publicationRevision).toBe(1);
    expect(observation.providerDispatchEnabled).toBe(false);
    expect(observation.normalized.metrics.views).toEqual({
      status: "available",
      value: 44,
    });
    expect(observation.normalized.metrics.shares).toEqual({ status: "unavailable" });
  });
});
