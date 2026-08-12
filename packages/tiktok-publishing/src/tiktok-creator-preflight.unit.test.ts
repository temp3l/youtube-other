import { describe, expect, it } from "vitest";

import type { MicrodramaPublicationTargetProfile } from "@mediaforge/domain";

import {
  FixtureTikTokCreatorInfoAdapter,
  InMemoryTikTokCreatorInfoCache,
  TikTokCreatorPreflightService,
} from "./tiktok-creator-preflight-service.js";

const CHECKED_AT = "2026-08-12T05:10:00.000Z";

function targetProfile(
  overrides: Partial<MicrodramaPublicationTargetProfile> = {}
): MicrodramaPublicationTargetProfile {
  return {
    schemaVersion: "mediaforge.microdrama-publication.v1",
    profileId: "target.en-us.tiktok",
    seriesId: "seven-minutes-ahead",
    locale: "en-US",
    provider: "tiktok",
    providerAccountId: "acct.en-us.primary",
    credentialVersion: "cred.v1",
    metadataProfileId: "meta.en-us.v1",
    scheduleProfileId: "schedule.en-us.v1",
    enabled: true,
    registeredAt: CHECKED_AT,
    ...overrides,
  };
}

function creatorSnapshot() {
  return {
    schemaVersion: "mediaforge.tiktok-creator-preflight.v1" as const,
    providerAccountId: "acct.en-us.primary",
    creatorOpenId: "creator.open.001",
    displayName: "Seven Minutes Ahead",
    postingCapability: "available" as const,
    directPostEnabled: true,
    maxVideoDurationSeconds: 180,
    privacyLevelOptions: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS"],
    fetchedAt: CHECKED_AT,
    responseHash: "b".repeat(64),
  };
}

describe("TikTok creator-info preflight", () => {
  it("resolves locale target and caches creator capability", async () => {
    const cache = new InMemoryTikTokCreatorInfoCache();
    const service = new TikTokCreatorPreflightService({
      cache,
      adapter: new FixtureTikTokCreatorInfoAdapter(creatorSnapshot()),
      cacheTtlSeconds: 600,
    });

    const first = await service.runPreflight({
      seriesId: "seven-minutes-ahead",
      locale: "en-US",
      targetProfile: targetProfile(),
      checkedAt: CHECKED_AT,
    });
    expect(first.cacheHit).toBe(false);
    expect(first.resolution.accountFence).toBe("fence.tiktok.acct.en-us.primary.cred.v1");

    const second = await service.runPreflight({
      seriesId: "seven-minutes-ahead",
      locale: "en-US",
      targetProfile: targetProfile(),
      checkedAt: CHECKED_AT,
    });
    expect(second.cacheHit).toBe(true);
  });

  it("fails closed when locale target is disabled or mismatched", async () => {
    const service = new TikTokCreatorPreflightService({
      cache: new InMemoryTikTokCreatorInfoCache(),
      adapter: new FixtureTikTokCreatorInfoAdapter(creatorSnapshot()),
    });

    await expect(
      service.runPreflight({
        seriesId: "seven-minutes-ahead",
        locale: "en-US",
        targetProfile: targetProfile({ enabled: false }),
        checkedAt: CHECKED_AT,
      })
    ).rejects.toThrow(/disabled/u);

    await expect(
      service.runPreflight({
        seriesId: "seven-minutes-ahead",
        locale: "de-DE",
        targetProfile: targetProfile({ locale: "en-US" }),
        checkedAt: CHECKED_AT,
      })
    ).rejects.toThrow(/Locale does not match/u);
  });

  it("rejects expired creator capability cache", async () => {
    const cache = new InMemoryTikTokCreatorInfoCache();
    const service = new TikTokCreatorPreflightService({
      cache,
      adapter: new FixtureTikTokCreatorInfoAdapter(creatorSnapshot()),
      cacheTtlSeconds: 1,
    });

    await service.runPreflight({
      seriesId: "seven-minutes-ahead",
      locale: "en-US",
      targetProfile: targetProfile(),
      checkedAt: CHECKED_AT,
    });

    const refreshed = await service.runPreflight({
      seriesId: "seven-minutes-ahead",
      locale: "en-US",
      targetProfile: targetProfile(),
      checkedAt: "2026-08-12T05:20:00.000Z",
    });
    expect(refreshed.cacheHit).toBe(false);
  });
});
