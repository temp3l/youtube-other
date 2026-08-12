import { z } from "zod";

import { microdramaPublicationTargetProfileSchema } from "./microdrama-publication-contracts.js";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const TIKTOK_CREATOR_PREFLIGHT_SCHEMA_VERSION =
  "mediaforge.tiktok-creator-preflight.v1" as const;

export const TIKTOK_CREATOR_CAPABILITY_STATES = [
  "available",
  "restricted",
  "unavailable",
] as const;
export const tikTokCreatorCapabilityStateSchema = z.enum(
  TIKTOK_CREATOR_CAPABILITY_STATES
);
export type TikTokCreatorCapabilityState = z.infer<
  typeof tikTokCreatorCapabilityStateSchema
>;

export const tikTokCreatorInfoSnapshotSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_CREATOR_PREFLIGHT_SCHEMA_VERSION),
    providerAccountId: identifierSchema,
    creatorOpenId: identifierSchema,
    displayName: z.string().min(1).max(200),
    postingCapability: tikTokCreatorCapabilityStateSchema,
    directPostEnabled: z.boolean(),
    maxVideoDurationSeconds: z.number().int().positive(),
    privacyLevelOptions: z.array(z.string().min(1).max(80)).min(1),
    fetchedAt: isoDateTimeSchema,
    responseHash: sha256Schema,
  })
  .strict();
export type TikTokCreatorInfoSnapshot = z.infer<
  typeof tikTokCreatorInfoSnapshotSchema
>;

export const tikTokCreatorInfoCacheRecordSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_CREATOR_PREFLIGHT_SCHEMA_VERSION),
    cacheKey: identifierSchema,
    providerAccountId: identifierSchema,
    credentialVersion: identifierSchema,
    snapshot: tikTokCreatorInfoSnapshotSchema,
    expiresAt: isoDateTimeSchema,
    recordedAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokCreatorInfoCacheRecord = z.infer<
  typeof tikTokCreatorInfoCacheRecordSchema
>;

export const tikTokLocaleTargetResolutionSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_CREATOR_PREFLIGHT_SCHEMA_VERSION),
    seriesId: identifierSchema,
    locale: z.string().min(2).max(16),
    targetProfile: microdramaPublicationTargetProfileSchema,
    accountFence: identifierSchema,
    resolvedAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokLocaleTargetResolution = z.infer<
  typeof tikTokLocaleTargetResolutionSchema
>;

export const tikTokCreatorPreflightResultSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_CREATOR_PREFLIGHT_SCHEMA_VERSION),
    resolution: tikTokLocaleTargetResolutionSchema,
    creatorInfo: tikTokCreatorInfoSnapshotSchema,
    cacheHit: z.boolean(),
    checkedAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokCreatorPreflightResult = z.infer<
  typeof tikTokCreatorPreflightResultSchema
>;

export function validateTikTokCreatorInfoSnapshot(
  value: unknown
): TikTokCreatorInfoSnapshot {
  return tikTokCreatorInfoSnapshotSchema.parse(value);
}

export function validateTikTokCreatorPreflightResult(
  value: unknown
): TikTokCreatorPreflightResult {
  return tikTokCreatorPreflightResultSchema.parse(value);
}
