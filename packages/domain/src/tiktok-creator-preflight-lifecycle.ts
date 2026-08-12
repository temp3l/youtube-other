import type { MicrodramaPublicationTargetProfile } from "./microdrama-publication-contracts.js";
import {
  type TikTokCreatorInfoCacheRecord,
  type TikTokCreatorInfoSnapshot,
  type TikTokLocaleTargetResolution,
  tikTokCreatorInfoCacheRecordSchema,
  tikTokLocaleTargetResolutionSchema,
} from "./tiktok-creator-preflight-contracts.js";

export function buildTikTokAccountFence(
  targetProfile: MicrodramaPublicationTargetProfile
): string {
  return `fence.tiktok.${targetProfile.providerAccountId}.${targetProfile.credentialVersion}`;
}

export function resolveTikTokLocaleTarget(input: {
  readonly seriesId: string;
  readonly locale: string;
  readonly targetProfile: MicrodramaPublicationTargetProfile;
  readonly resolvedAt: string;
}): TikTokLocaleTargetResolution {
  if (!input.targetProfile.enabled) {
    throw new Error(`Publication target profile ${input.targetProfile.profileId} is disabled.`);
  }
  if (input.targetProfile.provider !== "tiktok") {
    throw new Error("TikTok preflight requires a TikTok publication target profile.");
  }
  if (input.targetProfile.locale !== input.locale) {
    throw new Error("Locale does not match publication target profile.");
  }
  if (input.targetProfile.seriesId !== input.seriesId) {
    throw new Error("Series does not match publication target profile.");
  }

  return tikTokLocaleTargetResolutionSchema.parse({
    schemaVersion: "mediaforge.tiktok-creator-preflight.v1",
    seriesId: input.seriesId,
    locale: input.locale,
    targetProfile: input.targetProfile,
    accountFence: buildTikTokAccountFence(input.targetProfile),
    resolvedAt: input.resolvedAt,
  });
}

export function creatorInfoCacheKey(input: {
  readonly providerAccountId: string;
  readonly credentialVersion: string;
}): string {
  return `creator-info.${input.providerAccountId}.${input.credentialVersion}`;
}

export function isCreatorInfoCacheFresh(
  cache: TikTokCreatorInfoCacheRecord,
  checkedAt: string
): boolean {
  return cache.expiresAt > checkedAt;
}

export function buildCreatorInfoCacheRecord(input: {
  readonly providerAccountId: string;
  readonly credentialVersion: string;
  readonly snapshot: TikTokCreatorInfoSnapshot;
  readonly ttlSeconds: number;
  readonly recordedAt: string;
}): TikTokCreatorInfoCacheRecord {
  const expiresAt = new Date(
    Date.parse(input.recordedAt) + input.ttlSeconds * 1000
  ).toISOString();
  return tikTokCreatorInfoCacheRecordSchema.parse({
    schemaVersion: "mediaforge.tiktok-creator-preflight.v1",
    cacheKey: creatorInfoCacheKey({
      providerAccountId: input.providerAccountId,
      credentialVersion: input.credentialVersion,
    }),
    providerAccountId: input.providerAccountId,
    credentialVersion: input.credentialVersion,
    snapshot: input.snapshot,
    expiresAt,
    recordedAt: input.recordedAt,
  });
}

export function assertCreatorCapabilityAllowsDirectPost(
  snapshot: TikTokCreatorInfoSnapshot
): void {
  if (snapshot.postingCapability === "unavailable") {
    throw new Error("Creator posting capability is unavailable.");
  }
  if (!snapshot.directPostEnabled) {
    throw new Error("Direct Post is not enabled for this creator account.");
  }
}
