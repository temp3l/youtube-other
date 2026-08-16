import { z } from "zod";

import {
  microdramaPublicationIntentBindingSchema,
  providerCorrelationSchema,
} from "./microdrama-publication-contracts.js";
import { tikTokTransferModeSchema } from "./tiktok-transfer-contracts.js";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const sha256Schema = z.string().regex(sha256Pattern);

export const TIKTOK_DIRECT_POST_SCHEMA_VERSION =
  "mediaforge.tiktok-direct-post.v1" as const;

export const TIKTOK_DIRECT_POST_EFFECT_STATES = [
  "prepared",
  "init_dispatched",
  "throttled",
  "init_failed",
] as const;
export const tikTokDirectPostEffectStateSchema = z.enum(
  TIKTOK_DIRECT_POST_EFFECT_STATES
);
export type TikTokDirectPostEffectState = z.infer<
  typeof tikTokDirectPostEffectStateSchema
>;

export const TIKTOK_DIRECT_POST_DISPATCH_BLOCK_REASONS = [
  "capability_disabled",
  "target_profile_missing",
  "target_profile_disabled",
  "account_mismatch",
  "approval_not_bound",
  "consent_missing",
  "consent_stale",
  "export_approval_missing",
  "export_approval_stale",
  "idempotency_conflict",
  "intent_state_invalid",
  "manual_dispatch_required",
  "scheduled_consent_missing",
  "app_audit_blocked",
  "creator_capability_blocked",
  "metadata_mismatch",
  "transfer_mismatch",
  "account_binding_changed",
  "rate_limited",
  "effect_already_committed",
] as const;
export const tikTokDirectPostDispatchBlockReasonSchema = z.enum(
  TIKTOK_DIRECT_POST_DISPATCH_BLOCK_REASONS
);
export type TikTokDirectPostDispatchBlockReason = z.infer<
  typeof tikTokDirectPostDispatchBlockReasonSchema
>;

export const tikTokDirectPostInitRequestSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_DIRECT_POST_SCHEMA_VERSION),
    initRequestId: identifierSchema,
    attemptId: identifierSchema,
    intentId: identifierSchema,
    idempotencyKey: identifierSchema,
    attemptFence: z.number().int().positive(),
    binding: microdramaPublicationIntentBindingSchema,
    transferPlanId: identifierSchema,
    transferMode: tikTokTransferModeSchema,
    contentHash: sha256Schema,
    metadataRevisionId: identifierSchema,
    metadataContentHash: sha256Schema,
    providerAccountId: identifierSchema,
    credentialVersion: identifierSchema,
    accountFence: identifierSchema,
    preparedAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokDirectPostInitRequest = z.infer<
  typeof tikTokDirectPostInitRequestSchema
>;

export const tikTokDirectPostInitResponseSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_DIRECT_POST_SCHEMA_VERSION),
    initRequestId: identifierSchema,
    publishId: identifierSchema,
    providerCorrelation: providerCorrelationSchema,
    receivedAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokDirectPostInitResponse = z.infer<
  typeof tikTokDirectPostInitResponseSchema
>;

export const tikTokDirectPostThrottleEvidenceSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_DIRECT_POST_SCHEMA_VERSION),
    retryAfterSeconds: z.number().int().positive(),
    retryAfter: isoDateTimeSchema,
    nextEligibleAt: isoDateTimeSchema,
    providerCorrelation: providerCorrelationSchema,
    recordedAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokDirectPostThrottleEvidence = z.infer<
  typeof tikTokDirectPostThrottleEvidenceSchema
>;

export const tikTokDirectPostEffectRecordSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_DIRECT_POST_SCHEMA_VERSION),
    effectId: identifierSchema,
    attemptId: identifierSchema,
    intentId: identifierSchema,
    idempotencyKey: identifierSchema,
    state: tikTokDirectPostEffectStateSchema,
    initRequest: tikTokDirectPostInitRequestSchema,
    initResponse: tikTokDirectPostInitResponseSchema.optional(),
    throttleEvidence: tikTokDirectPostThrottleEvidenceSchema.optional(),
    providerCorrelation: providerCorrelationSchema,
    rateLimitState: z.enum(["none", "throttled", "paused"]).default("none"),
    retryAfter: isoDateTimeSchema.optional(),
    nextEligibleAt: isoDateTimeSchema.optional(),
    recordedAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokDirectPostEffectRecord = z.infer<
  typeof tikTokDirectPostEffectRecordSchema
>;

export const tikTokDirectPostDispatchAdmissionSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_DIRECT_POST_SCHEMA_VERSION),
    allowed: z.boolean(),
    blockReason: tikTokDirectPostDispatchBlockReasonSchema.optional(),
    message: z.string().min(1).max(500).optional(),
    correlationId: identifierSchema,
    evaluatedAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokDirectPostDispatchAdmission = z.infer<
  typeof tikTokDirectPostDispatchAdmissionSchema
>;

export function validateTikTokDirectPostInitRequest(
  value: unknown
): TikTokDirectPostInitRequest {
  return tikTokDirectPostInitRequestSchema.parse(value);
}

export function validateTikTokDirectPostInitResponse(
  value: unknown
): TikTokDirectPostInitResponse {
  return tikTokDirectPostInitResponseSchema.parse(value);
}

export function validateTikTokDirectPostEffectRecord(
  value: unknown
): TikTokDirectPostEffectRecord {
  return tikTokDirectPostEffectRecordSchema.parse(value);
}

export const TIKTOK_DIRECT_POST_DISPATCH_OUTCOMES = [
  "succeeded",
  "failed_known",
  "outcome_uncertain",
] as const;
export const tikTokDirectPostDispatchOutcomeSchema = z.enum(
  TIKTOK_DIRECT_POST_DISPATCH_OUTCOMES
);
export type TikTokDirectPostDispatchOutcome = z.infer<
  typeof tikTokDirectPostDispatchOutcomeSchema
>;

export const tikTokDirectPostEffectReferenceSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_DIRECT_POST_SCHEMA_VERSION),
    effectId: identifierSchema,
    attemptId: identifierSchema,
    intentId: identifierSchema,
    idempotencyKey: identifierSchema,
    attemptFence: z.number().int().positive(),
    publishId: identifierSchema,
    binding: microdramaPublicationIntentBindingSchema,
    providerCorrelation: providerCorrelationSchema,
    dispatchOutcome: tikTokDirectPostDispatchOutcomeSchema,
    recoveryIdentity: identifierSchema,
    recordedAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokDirectPostEffectReference = z.infer<
  typeof tikTokDirectPostEffectReferenceSchema
>;

export function validateTikTokDirectPostEffectReference(
  value: unknown
): TikTokDirectPostEffectReference {
  return tikTokDirectPostEffectReferenceSchema.parse(value);
}
