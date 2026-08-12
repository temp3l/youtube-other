import { describe, expect, it } from "vitest";

import {
  fakePerformanceBaseline,
  fakePerformanceObservationIdentity,
  fakeTikTokVideoCounters,
  ingestPerformanceObservation,
} from "@mediaforge/performance";

import { FakeMicrodramaPerformanceRepository } from "./microdrama-performance-fake-repository.js";
import { MicrodramaPerformanceConflictError } from "./microdrama-performance-port.js";

describe("microdrama performance persistence", () => {
  it("appends observations append-only with idempotent replay", () => {
    const repository = new FakeMicrodramaPerformanceRepository();
    repository.migratePerformance();

    const observation = ingestPerformanceObservation({
      identity: fakePerformanceObservationIdentity({ locale: "en-US" }),
      providerVideoId: "tiktok.video.001",
      counters: fakeTikTokVideoCounters({
        view_count: 100,
        like_count: 5,
      }),
      baseline: fakePerformanceBaseline({
        accountBaselineHash: "a".repeat(64),
      }),
      observedAt: "2026-08-12T12:00:00.000Z",
      fetchedAt: "2026-08-12T12:00:00.000Z",
      idempotencyKey: "perf.persist.001",
    });

    const first = repository.appendObservation({ observation });
    const second = repository.appendObservation({ observation });

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.observation.regenerationRationale).toBe("idempotent-replay");
    expect(repository.listObservationsByEpisode({
      seriesId: observation.identity.seriesId,
      episodeId: observation.identity.episodeId,
      locale: "en-US",
    })).toHaveLength(1);
  });

  it("rejects conflicting idempotency keys", () => {
    const repository = new FakeMicrodramaPerformanceRepository();
    repository.migratePerformance();

    const first = ingestPerformanceObservation({
      identity: fakePerformanceObservationIdentity(),
      providerVideoId: "tiktok.video.001",
      counters: fakeTikTokVideoCounters({ view_count: 10 }),
      observedAt: "2026-08-12T12:00:00.000Z",
      fetchedAt: "2026-08-12T12:00:00.000Z",
      idempotencyKey: "perf.conflict.001",
    });
    const conflicting = ingestPerformanceObservation({
      identity: fakePerformanceObservationIdentity({ publicationRevision: 2 }),
      providerVideoId: "tiktok.video.002",
      counters: fakeTikTokVideoCounters({ view_count: 20 }),
      observedAt: "2026-08-12T13:00:00.000Z",
      fetchedAt: "2026-08-12T13:00:00.000Z",
      idempotencyKey: "perf.conflict.001",
    });

    repository.appendObservation({ observation: first });
    expect(() =>
      repository.appendObservation({ observation: conflicting })
    ).toThrow(MicrodramaPerformanceConflictError);
  });

  it("retains locale-specific observations for cross-locale comparison context", () => {
    const repository = new FakeMicrodramaPerformanceRepository();
    repository.migratePerformance();

    const enObservation = ingestPerformanceObservation({
      identity: fakePerformanceObservationIdentity({ locale: "en-US" }),
      providerVideoId: "tiktok.video.en",
      counters: fakeTikTokVideoCounters({ view_count: 40 }),
      baseline: fakePerformanceBaseline({
        audienceContextHash: "b".repeat(64),
      }),
      observedAt: "2026-08-12T12:00:00.000Z",
      fetchedAt: "2026-08-12T12:00:00.000Z",
      idempotencyKey: "perf.locale.en",
    });
    const deObservation = ingestPerformanceObservation({
      identity: fakePerformanceObservationIdentity({ locale: "de-DE" }),
      providerVideoId: "tiktok.video.de",
      counters: fakeTikTokVideoCounters({ view_count: 55 }),
      baseline: fakePerformanceBaseline({
        audienceContextHash: "c".repeat(64),
      }),
      observedAt: "2026-08-12T12:00:00.000Z",
      fetchedAt: "2026-08-12T12:00:00.000Z",
      idempotencyKey: "perf.locale.de",
    });

    repository.appendObservation({ observation: enObservation });
    repository.appendObservation({ observation: deObservation });

    const all = repository.listObservationsByEpisode({
      seriesId: "series.001",
      episodeId: "episode.001",
    });
    const germanOnly = repository.listObservationsByEpisode({
      seriesId: "series.001",
      episodeId: "episode.001",
      locale: "de-DE",
    });

    expect(all).toHaveLength(2);
    expect(germanOnly).toHaveLength(1);
    expect(germanOnly[0]?.identity.locale).toBe("de-DE");
    expect(germanOnly[0]?.baseline.audienceContextHash).toBe("c".repeat(64));
  });
});
