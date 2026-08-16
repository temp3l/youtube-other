import { createHash } from "node:crypto";

import { TIKTOK_OFFICIAL_VIDEO_QUERY_ENDPOINT } from "@mediaforge/domain";

export type TikTokVideoQueryRequest = {
  readonly providerAccountId: string;
  readonly providerVideoId: string;
  readonly fields: readonly string[];
  readonly requestedAt: string;
};

export type TikTokVideoQueryRateLimitEvidence = {
  readonly remaining?: number;
  readonly resetAt?: string;
  readonly retryAfterSeconds?: number;
};

export type TikTokVideoQueryCursorEvidence = {
  readonly hasMore: boolean;
  readonly cursor?: string;
};

export type TikTokVideoQueryResponse = {
  readonly providerVideoId: string;
  readonly counters: Readonly<Record<string, unknown>>;
  readonly privacyLevel: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
  readonly responseHash: string;
  readonly fetchedAt: string;
  readonly endpointUrl: typeof TIKTOK_OFFICIAL_VIDEO_QUERY_ENDPOINT;
  readonly rateLimit: TikTokVideoQueryRateLimitEvidence;
  readonly cursor: TikTokVideoQueryCursorEvidence;
};

export type TikTokVideoQueryAdapter = {
  queryVideo(input: TikTokVideoQueryRequest): Promise<TikTokVideoQueryResponse>;
};

function hashCounters(counters: Readonly<Record<string, unknown>>): string {
  return createHash("sha256")
    .update(JSON.stringify(counters), "utf8")
    .digest("hex");
}

/**
 * Fixture adapter for MICRO-042 read-only video query canary.
 * Returns basic official counters only; retention fields are omitted (unavailable).
 */
export class FixtureTikTokVideoQueryAdapter implements TikTokVideoQueryAdapter {
  public readonly calls: TikTokVideoQueryRequest[] = [];

  public constructor(
    private readonly fixtures: ReadonlyMap<
      string,
      {
        readonly counters: Readonly<Record<string, unknown>>;
        readonly privacyLevel?: TikTokVideoQueryResponse["privacyLevel"];
      }
    >
  ) {}

  public async queryVideo(
    input: TikTokVideoQueryRequest
  ): Promise<TikTokVideoQueryResponse> {
    this.calls.push(input);
    const fixture = this.fixtures.get(input.providerVideoId);
    if (!fixture) {
      throw new Error(`Fixture TikTok video query missing for ${input.providerVideoId}`);
    }
    const counters = { ...fixture.counters };
    return {
      providerVideoId: input.providerVideoId,
      counters,
      privacyLevel: fixture.privacyLevel ?? "PUBLIC_TO_EVERYONE",
      responseHash: hashCounters(counters),
      fetchedAt: input.requestedAt,
      endpointUrl: TIKTOK_OFFICIAL_VIDEO_QUERY_ENDPOINT,
      rateLimit: {
        remaining: 99,
        resetAt: input.requestedAt,
      },
      cursor: {
        hasMore: false,
      },
    };
  }
}
