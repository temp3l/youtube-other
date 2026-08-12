import { describe, expect, it } from "vitest";

import { ingestPerformanceObservation } from "./performance-ingestion.js";
import {
  fakePerformanceBaseline,
  fakePerformanceObservationIdentity,
  fakeTikTokVideoCounters,
  fakeYouTubeVideoCounters,
} from "./provider-fixtures.js";

describe("performance ingestion", () => {
  it("normalizes fake TikTok counters without inventing retention metrics", () => {
    const observation = ingestPerformanceObservation({
      identity: fakePerformanceObservationIdentity({ locale: "en-US" }),
      providerVideoId: "tiktok.video.001",
      counters: fakeTikTokVideoCounters({
        view_count: 250,
        like_count: 12,
        comment_count: 4,
      }),
      baseline: fakePerformanceBaseline({
        accountBaselineHash: "d".repeat(64),
        publishTimeContextHash: "e".repeat(64),
      }),
      observedAt: "2026-08-12T12:00:00.000Z",
      fetchedAt: "2026-08-12T12:00:00.000Z",
      idempotencyKey: "perf.tiktok.001",
    });

    expect(observation.normalized.metrics.views).toEqual({
      status: "available",
      value: 250,
    });
    expect(observation.normalized.metrics.retention_rate).toEqual({
      status: "unavailable",
    });
    expect(observation.baseline.publishTimeContextHash).toBe("e".repeat(64));
  });

  it("retains cross-locale identity for fake YouTube fixtures", () => {
    const observation = ingestPerformanceObservation({
      identity: fakePerformanceObservationIdentity({
        locale: "fr-FR",
        provider: "youtube",
        publicationRevision: 2,
      }),
      providerVideoId: "youtube.video.001",
      counters: fakeYouTubeVideoCounters({
        views: 88,
        average_view_percentage: 61,
      }),
      baseline: fakePerformanceBaseline({
        audienceContextHash: "f".repeat(64),
      }),
      observedAt: "2026-08-12T15:00:00.000Z",
      fetchedAt: "2026-08-12T15:00:00.000Z",
      idempotencyKey: "perf.youtube.fr.001",
    });

    expect(observation.identity.locale).toBe("fr-FR");
    expect(observation.identity.publicationRevision).toBe(2);
    expect(observation.normalized.metrics.completion_rate).toEqual({
      status: "available",
      value: 0.61,
    });
    expect(observation.normalized.metrics.shares).toEqual({
      status: "unavailable",
    });
  });
});
