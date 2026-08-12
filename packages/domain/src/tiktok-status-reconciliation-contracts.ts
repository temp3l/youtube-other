import { z } from "zod";

import { providerCorrelationSchema } from "./microdrama-publication-contracts.js";
import { tikTokDirectPostEffectReferenceSchema } from "./tiktok-direct-post-contracts.js";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);

export const TIKTOK_STATUS_RECONCILIATION_SCHEMA_VERSION =
  "mediaforge.tiktok-status-reconciliation.v1" as const;

export const TIKTOK_PUBLISH_PROVIDER_STATUSES = [
  "PROCESSING_UPLOAD",
  "PROCESSING_DOWNLOAD",
  "SEND_TO_USER_INBOX",
  "PUBLISH_COMPLETE",
  "FAILED",
  "NOT_FOUND",
] as const;
export const tikTokPublishProviderStatusSchema = z.enum(
  TIKTOK_PUBLISH_PROVIDER_STATUSES
);
export type TikTokPublishProviderStatus = z.infer<
  typeof tikTokPublishProviderStatusSchema
>;

export const tikTokStatusQueryRequestSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_STATUS_RECONCILIATION_SCHEMA_VERSION),
    publishId: identifierSchema,
    providerAccountId: identifierSchema,
    credentialVersion: identifierSchema,
    recoveryIdentity: identifierSchema,
    queriedAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokStatusQueryRequest = z.infer<
  typeof tikTokStatusQueryRequestSchema
>;

export const tikTokStatusRateLimitEvidenceSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_STATUS_RECONCILIATION_SCHEMA_VERSION),
    rateLimitState: z.enum(["none", "throttled", "paused"]),
    retryAfterSeconds: z.number().int().nonnegative().optional(),
    retryAfter: isoDateTimeSchema.optional(),
    nextEligibleAt: isoDateTimeSchema.optional(),
    recordedAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokStatusRateLimitEvidence = z.infer<
  typeof tikTokStatusRateLimitEvidenceSchema
>;

export const tikTokStatusQueryResponseSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_STATUS_RECONCILIATION_SCHEMA_VERSION),
    publishId: identifierSchema,
    providerStatus: tikTokPublishProviderStatusSchema,
    providerCorrelation: providerCorrelationSchema,
    publicVideoId: identifierSchema.optional(),
    failReason: z.string().min(1).max(500).optional(),
    rateLimit: tikTokStatusRateLimitEvidenceSchema.optional(),
    queriedAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokStatusQueryResponse = z.infer<
  typeof tikTokStatusQueryResponseSchema
>;

export const TIKTOK_STATUS_RECONCILIATION_OUTCOMES = [
  "pending",
  "matched",
  "no_match",
  "multiple_matches",
  "provider_unavailable",
] as const;
export const tikTokStatusReconciliationOutcomeSchema = z.enum(
  TIKTOK_STATUS_RECONCILIATION_OUTCOMES
);
export type TikTokStatusReconciliationOutcome = z.infer<
  typeof tikTokStatusReconciliationOutcomeSchema
>;

export const tikTokPublicationReceiptSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_STATUS_RECONCILIATION_SCHEMA_VERSION),
    publishId: identifierSchema,
    publicVideoId: identifierSchema,
    providerAccountId: identifierSchema,
    recoveryIdentity: identifierSchema,
    renderHash: sha256Schema,
    metadataRevisionId: identifierSchema,
    providerCorrelation: providerCorrelationSchema,
    reconciledAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokPublicationReceipt = z.infer<
  typeof tikTokPublicationReceiptSchema
>;

export const tikTokStatusReconciliationEvidenceSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_STATUS_RECONCILIATION_SCHEMA_VERSION),
    effectReference: tikTokDirectPostEffectReferenceSchema,
    reconciliationOutcome: tikTokStatusReconciliationOutcomeSchema,
    providerStatus: tikTokPublishProviderStatusSchema.optional(),
    rateLimit: tikTokStatusRateLimitEvidenceSchema.optional(),
    receipt: tikTokPublicationReceiptSchema.optional(),
    pollAttempt: z.number().int().nonnegative(),
    nextPollEligibleAt: isoDateTimeSchema.optional(),
    recordedAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokStatusReconciliationEvidence = z.infer<
  typeof tikTokStatusReconciliationEvidenceSchema
>;

export function validateTikTokStatusQueryRequest(
  value: unknown
): TikTokStatusQueryRequest {
  return tikTokStatusQueryRequestSchema.parse(value);
}

export function validateTikTokStatusQueryResponse(
  value: unknown
): TikTokStatusQueryResponse {
  return tikTokStatusQueryResponseSchema.parse(value);
}

export function validateTikTokPublicationReceipt(
  value: unknown
): TikTokPublicationReceipt {
  return tikTokPublicationReceiptSchema.parse(value);
}

export function validateTikTokStatusReconciliationEvidence(
  value: unknown
): TikTokStatusReconciliationEvidence {
  return tikTokStatusReconciliationEvidenceSchema.parse(value);
}
