import type {
  MicrodramaPerformanceBaselineAnnotation,
  MicrodramaPerformanceObservationIdentity,
} from "@mediaforge/domain";

export type FakeTikTokVideoCounters = {
  readonly view_count?: number;
  readonly like_count?: number;
  readonly comment_count?: number;
  readonly share_count?: number;
  readonly watch_time_seconds?: number;
  readonly completion_rate?: number;
  readonly retention_rate?: number;
};

export type FakeYouTubeVideoCounters = {
  readonly views?: number;
  readonly likes?: number;
  readonly comments?: number;
  readonly shares?: number;
  readonly average_view_duration_seconds?: number;
  readonly average_view_percentage?: number;
  readonly retention_rate?: number;
};

export function fakeTikTokVideoCounters(
  input: FakeTikTokVideoCounters
): Record<string, unknown> {
  return { ...input };
}

export function fakeYouTubeVideoCounters(
  input: FakeYouTubeVideoCounters
): Record<string, unknown> {
  return { ...input };
}

export function fakePerformanceObservationIdentity(input?: {
  readonly locale?: string;
  readonly provider?: MicrodramaPerformanceObservationIdentity["provider"];
  readonly publicationRevision?: number;
}): MicrodramaPerformanceObservationIdentity {
  const provider = input?.provider ?? "tiktok";
  return {
    seriesId: "series.001",
    episodeId: "episode.001",
    episodeRevisionId: "episode.rev.001",
    locale: input?.locale ?? "en-US",
    provider,
    providerAccountId:
      provider === "tiktok" ? "tiktok.account.001" : "youtube.channel.001",
    publicationId: "intent.001",
    publicationRevision: input?.publicationRevision ?? 1,
    renderHash: "a".repeat(64),
    metadataRevisionId: "meta.rev.001",
    observationWindow: {
      windowStart: "2026-08-12T00:00:00.000Z",
      windowEnd: "2026-08-12T23:59:59.000Z",
    },
  };
}

export function fakePerformanceBaseline(
  input?: Partial<MicrodramaPerformanceBaselineAnnotation>
): MicrodramaPerformanceBaselineAnnotation {
  const baseline: MicrodramaPerformanceBaselineAnnotation = {};
  if (input?.accountBaselineHash !== undefined) {
    baseline.accountBaselineHash = input.accountBaselineHash;
  }
  if (input?.audienceContextHash !== undefined) {
    baseline.audienceContextHash = input.audienceContextHash;
  }
  if (input?.publishTimeContextHash !== undefined) {
    baseline.publishTimeContextHash = input.publishTimeContextHash;
  }
  if (input?.experimentContextHash !== undefined) {
    baseline.experimentContextHash = input.experimentContextHash;
  }
  return baseline;
}
