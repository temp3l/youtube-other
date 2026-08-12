import { z } from "zod";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const sha256Schema = z.string().regex(sha256Pattern);

export const TIKTOK_TRANSFER_SCHEMA_VERSION =
  "mediaforge.tiktok-transfer.v1" as const;

export const TIKTOK_TRANSFER_MODES = ["FILE_UPLOAD", "PULL_FROM_URL"] as const;
export const tikTokTransferModeSchema = z.enum(TIKTOK_TRANSFER_MODES);
export type TikTokTransferMode = z.infer<typeof tikTokTransferModeSchema>;

export const tikTokTransferChunkConstraintsSchema = z
  .object({
    minChunkBytes: z.number().int().positive(),
    maxChunkBytes: z.number().int().positive(),
    preferredChunkBytes: z.number().int().positive(),
  })
  .strict();
export type TikTokTransferChunkConstraints = z.infer<
  typeof tikTokTransferChunkConstraintsSchema
>;

export const tikTokLocalRenderArtifactSchema = z
  .object({
    relativePath: z.string().min(1).max(500),
    mimeType: z.string().min(1).max(120),
    byteLength: z.number().int().nonnegative(),
    contentHash: sha256Schema,
  })
  .strict();
export type TikTokLocalRenderArtifact = z.infer<
  typeof tikTokLocalRenderArtifactSchema
>;

export const tikTokVerifiedPullDomainConfigurationSchema = z
  .object({
    configurationId: identifierSchema,
    verifiedDomain: z.string().min(1).max(253),
    operatorOwned: z.literal(true),
    tiktokVerified: z.literal(true),
    httpsOnly: z.literal(true),
    active: z.boolean(),
    recordedAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokVerifiedPullDomainConfiguration = z.infer<
  typeof tikTokVerifiedPullDomainConfigurationSchema
>;

export const tikTokTransferChunkRangeSchema = z
  .object({
    chunkIndex: z.number().int().nonnegative(),
    byteStart: z.number().int().nonnegative(),
    byteEndExclusive: z.number().int().positive(),
    byteLength: z.number().int().positive(),
  })
  .strict();
export type TikTokTransferChunkRange = z.infer<
  typeof tikTokTransferChunkRangeSchema
>;

export const tikTokTransferPullFromUrlBindingSchema = z
  .object({
    sourceUrl: z.string().url(),
    verifiedDomainConfigurationId: identifierSchema,
  })
  .strict();
export type TikTokTransferPullFromUrlBinding = z.infer<
  typeof tikTokTransferPullFromUrlBindingSchema
>;

export const tikTokTransferPlanSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_TRANSFER_SCHEMA_VERSION),
    transferPlanId: identifierSchema,
    mode: tikTokTransferModeSchema,
    source: tikTokLocalRenderArtifactSchema,
    totalBytes: z.number().int().nonnegative(),
    contentHash: sha256Schema,
    chunkConstraints: tikTokTransferChunkConstraintsSchema,
    chunks: z.array(tikTokTransferChunkRangeSchema).min(1),
    pullFromUrl: tikTokTransferPullFromUrlBindingSchema.optional(),
    plannedAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokTransferPlan = z.infer<typeof tikTokTransferPlanSchema>;

export const tikTokTransferChunkByteEvidenceSchema = z
  .object({
    chunkIndex: z.number().int().nonnegative(),
    byteLength: z.number().int().positive(),
    chunkHash: sha256Schema,
    streamedAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokTransferChunkByteEvidence = z.infer<
  typeof tikTokTransferChunkByteEvidenceSchema
>;

export const tikTokTransferByteEvidenceSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_TRANSFER_SCHEMA_VERSION),
    transferPlanId: identifierSchema,
    mode: tikTokTransferModeSchema,
    totalBytes: z.number().int().nonnegative(),
    contentHash: sha256Schema,
    streamedBytes: z.number().int().nonnegative(),
    chunkEvidence: z.array(tikTokTransferChunkByteEvidenceSchema).min(1),
    completedAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokTransferByteEvidence = z.infer<
  typeof tikTokTransferByteEvidenceSchema
>;

export const tikTokPullFromUrlEligibilitySchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_TRANSFER_SCHEMA_VERSION),
    eligible: z.boolean(),
    reasonCode: z.string().min(1).max(120).optional(),
    verifiedDomainConfigurationId: identifierSchema.optional(),
    evaluatedAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokPullFromUrlEligibility = z.infer<
  typeof tikTokPullFromUrlEligibilitySchema
>;

export function validateTikTokTransferPlan(value: unknown): TikTokTransferPlan {
  return tikTokTransferPlanSchema.parse(value);
}

export function validateTikTokTransferByteEvidence(
  value: unknown
): TikTokTransferByteEvidence {
  return tikTokTransferByteEvidenceSchema.parse(value);
}

export function validateTikTokPullFromUrlEligibility(
  value: unknown
): TikTokPullFromUrlEligibility {
  return tikTokPullFromUrlEligibilitySchema.parse(value);
}
