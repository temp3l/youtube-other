import { z } from "zod";

export const MICRODRAMA_PUBLICATION_SCHEMA_VERSION =
  "mediaforge.microdrama-publication.v1" as const;

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const sha256Schema = z.string().regex(sha256Pattern);
const nonEmptyStringSchema = z.string().trim().min(1);

export const MICRODRAMA_PUBLICATION_PROVIDERS = ["tiktok", "youtube"] as const;
export const microdramaPublicationProviderSchema = z.enum(
  MICRODRAMA_PUBLICATION_PROVIDERS
);
export type MicrodramaPublicationProvider = z.infer<
  typeof microdramaPublicationProviderSchema
>;

export const MICRODRAMA_DISPATCH_MODES = ["manual", "preapproved_scheduled"] as const;
export const microdramaDispatchModeSchema = z.enum(MICRODRAMA_DISPATCH_MODES);
export type MicrodramaDispatchMode = z.infer<typeof microdramaDispatchModeSchema>;

export const MICRODRAMA_PUBLICATION_CAPABILITY_STATES = [
  "disabled",
  "private_canary",
  "public_canary",
  "enabled",
] as const;
export const microdramaPublicationCapabilityStateSchema = z.enum(
  MICRODRAMA_PUBLICATION_CAPABILITY_STATES
);
export type MicrodramaPublicationCapabilityState = z.infer<
  typeof microdramaPublicationCapabilityStateSchema
>;

export const MICRODRAMA_CONSENT_REVISION_STATES = [
  "active",
  "expired",
  "revoked",
] as const;
export const microdramaConsentRevisionStateSchema = z.enum(
  MICRODRAMA_CONSENT_REVISION_STATES
);
export type MicrodramaConsentRevisionState = z.infer<
  typeof microdramaConsentRevisionStateSchema
>;

export const MICRODRAMA_EXPORT_APPROVAL_STATES = [
  "active",
  "expired",
  "revoked",
] as const;
export const microdramaExportApprovalStateSchema = z.enum(
  MICRODRAMA_EXPORT_APPROVAL_STATES
);
export type MicrodramaExportApprovalState = z.infer<
  typeof microdramaExportApprovalStateSchema
>;

export const MICRODRAMA_PUBLICATION_INTENT_STATES = [
  "draft",
  "approved",
  "prepared",
  "in_flight",
  "published",
  "failed_known",
  "outcome_uncertain",
  "reconciled",
  "cancelled",
] as const;
export const microdramaPublicationIntentStateSchema = z.enum(
  MICRODRAMA_PUBLICATION_INTENT_STATES
);
export type MicrodramaPublicationIntentState = z.infer<
  typeof microdramaPublicationIntentStateSchema
>;

export const MICRODRAMA_PUBLICATION_APPROVAL_STATES = [
  "pending",
  "publication_approved",
  "rejected",
  "revoked",
] as const;
export const microdramaPublicationApprovalStateSchema = z.enum(
  MICRODRAMA_PUBLICATION_APPROVAL_STATES
);
export type MicrodramaPublicationApprovalState = z.infer<
  typeof microdramaPublicationApprovalStateSchema
>;

export const MICRODRAMA_IDEMPOTENCY_STATES = [
  "fresh",
  "reserved",
  "committed",
  "conflict",
] as const;
export const microdramaIdempotencyStateSchema = z.enum(MICRODRAMA_IDEMPOTENCY_STATES);
export type MicrodramaIdempotencyState = z.infer<
  typeof microdramaIdempotencyStateSchema
>;

export const MICRODRAMA_PUBLICATION_ATTEMPT_STATES = [
  "prepared",
  "in_flight",
  "succeeded",
  "failed_known",
  "outcome_uncertain",
] as const;
export const microdramaPublicationAttemptStateSchema = z.enum(
  MICRODRAMA_PUBLICATION_ATTEMPT_STATES
);
export type MicrodramaPublicationAttemptState = z.infer<
  typeof microdramaPublicationAttemptStateSchema
>;

export const MICRODRAMA_PUBLICATION_OUTCOME_STATES = [
  "pending",
  "succeeded",
  "failed_known",
  "outcome_uncertain",
  "reconciled",
] as const;
export const microdramaPublicationOutcomeStateSchema = z.enum(
  MICRODRAMA_PUBLICATION_OUTCOME_STATES
);
export type MicrodramaPublicationOutcomeState = z.infer<
  typeof microdramaPublicationOutcomeStateSchema
>;

export const MICRODRAMA_PUBLICATION_DISPATCH_BLOCK_REASONS = [
  "capability_disabled",
  "target_profile_missing",
  "target_profile_disabled",
  "account_mismatch",
  "consent_missing",
  "consent_stale",
  "export_approval_missing",
  "export_approval_stale",
  "approval_not_bound",
  "approval_revoked",
  "idempotency_conflict",
  "intent_state_invalid",
  "manual_dispatch_required",
  "scheduled_consent_missing",
  "ambiguous_outcome_retry_blocked",
  "bypass_rejected",
] as const;
export const microdramaPublicationDispatchBlockReasonSchema = z.enum(
  MICRODRAMA_PUBLICATION_DISPATCH_BLOCK_REASONS
);
export type MicrodramaPublicationDispatchBlockReason = z.infer<
  typeof microdramaPublicationDispatchBlockReasonSchema
>;

export const microdramaInteractionSettingsSchema = z
  .object({
    allowComments: z.boolean(),
    allowDuet: z.boolean(),
    allowStitch: z.boolean(),
  })
  .strict();
export type MicrodramaInteractionSettings = z.infer<
  typeof microdramaInteractionSettingsSchema
>;

export const microdramaPublicationTargetProfileSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PUBLICATION_SCHEMA_VERSION),
    profileId: identifierSchema,
    seriesId: identifierSchema,
    locale: nonEmptyStringSchema,
    provider: microdramaPublicationProviderSchema,
    providerAccountId: identifierSchema,
    credentialVersion: identifierSchema,
    metadataProfileId: identifierSchema,
    scheduleProfileId: identifierSchema,
    enabled: z.boolean(),
    registeredAt: isoDateTimeSchema,
  })
  .strict();
export type MicrodramaPublicationTargetProfile = z.infer<
  typeof microdramaPublicationTargetProfileSchema
>;

export const creatorContentConsentRevisionSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PUBLICATION_SCHEMA_VERSION),
    consentRevisionId: identifierSchema,
    subjectId: identifierSchema,
    rightsholderId: identifierSchema,
    evidenceHash: sha256Schema,
    evidenceSource: nonEmptyStringSchema,
    permittedMedia: z.array(nonEmptyStringSchema).min(1),
    permittedUse: z.array(nonEmptyStringSchema).min(1),
    permittedLocale: nonEmptyStringSchema,
    permittedProvider: microdramaPublicationProviderSchema,
    permittedTerritory: nonEmptyStringSchema,
    effectiveAt: isoDateTimeSchema,
    expiresAt: isoDateTimeSchema.optional(),
    revokedAt: isoDateTimeSchema.optional(),
    state: microdramaConsentRevisionStateSchema,
    recordedAt: isoDateTimeSchema,
  })
  .strict();
export type CreatorContentConsentRevision = z.infer<
  typeof creatorContentConsentRevisionSchema
>;

export const tikTokPostExportApprovalRevisionSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PUBLICATION_SCHEMA_VERSION),
    exportApprovalRevisionId: identifierSchema,
    consentRevisionId: identifierSchema,
    creatorCapabilityEvidenceHash: sha256Schema,
    providerAccountId: identifierSchema,
    renderHash: sha256Schema,
    artifactManifestHash: sha256Schema,
    metadataRevisionId: identifierSchema,
    privacy: z.enum(["public", "friends", "private"]),
    interactionSettings: microdramaInteractionSettingsSchema,
    aiContentDeclared: z.boolean(),
    commercialContentDeclared: z.boolean(),
    operatorId: identifierSchema,
    approvedAt: isoDateTimeSchema,
    state: microdramaExportApprovalStateSchema,
  })
  .strict();
export type TikTokPostExportApprovalRevision = z.infer<
  typeof tikTokPostExportApprovalRevisionSchema
>;

export const microdramaPublicationIntentBindingSchema = z
  .object({
    provider: microdramaPublicationProviderSchema,
    providerAccountId: identifierSchema,
    credentialVersion: identifierSchema,
    episodeId: identifierSchema,
    episodeRevisionId: identifierSchema,
    locale: nonEmptyStringSchema,
    renderHash: sha256Schema,
    metadataRevisionId: identifierSchema,
    consentRevisionId: identifierSchema,
    exportApprovalRevisionId: identifierSchema,
    privacy: z.enum(["public", "friends", "private"]),
    interactionSettings: microdramaInteractionSettingsSchema,
    aiContentDeclared: z.boolean(),
    commercialContentDeclared: z.boolean(),
  })
  .strict();
export type MicrodramaPublicationIntentBinding = z.infer<
  typeof microdramaPublicationIntentBindingSchema
>;

export const microdramaPublicationIntentSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PUBLICATION_SCHEMA_VERSION),
    intentId: identifierSchema,
    targetProfileId: identifierSchema,
    binding: microdramaPublicationIntentBindingSchema,
    dispatchMode: microdramaDispatchModeSchema,
    scheduledAt: isoDateTimeSchema.nullable(),
    idempotencyKey: identifierSchema,
    fingerprint: sha256Schema,
    approvalState: microdramaPublicationApprovalStateSchema,
    boundExportApprovalRevisionId: identifierSchema.optional(),
    state: microdramaPublicationIntentStateSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();
export type MicrodramaPublicationIntent = z.infer<
  typeof microdramaPublicationIntentSchema
>;

export const providerCorrelationSchema = z
  .object({
    requestId: identifierSchema.optional(),
    correlationId: identifierSchema.optional(),
    responseId: identifierSchema.optional(),
  })
  .strict();
export type ProviderCorrelation = z.infer<typeof providerCorrelationSchema>;

export const microdramaPublicationAttemptSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PUBLICATION_SCHEMA_VERSION),
    attemptId: identifierSchema,
    intentId: identifierSchema,
    attemptFence: z.number().int().positive(),
    idempotencyKey: identifierSchema,
    binding: microdramaPublicationIntentBindingSchema,
    state: microdramaPublicationAttemptStateSchema,
    providerCorrelation: providerCorrelationSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();
export type MicrodramaPublicationAttempt = z.infer<
  typeof microdramaPublicationAttemptSchema
>;

export const microdramaPublicationEffectEvidenceSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PUBLICATION_SCHEMA_VERSION),
    effectId: identifierSchema,
    attemptId: identifierSchema,
    intentId: identifierSchema,
    outcomeState: microdramaPublicationOutcomeStateSchema,
    providerCorrelation: providerCorrelationSchema,
    rateLimitState: z.enum(["none", "throttled", "paused"]).default("none"),
    retryAfter: isoDateTimeSchema.optional(),
    nextEligibleAt: isoDateTimeSchema.optional(),
    reconciliationOutcome: z
      .enum(["pending", "matched", "no_match", "multiple_matches", "provider_unavailable"])
      .optional(),
    recordedAt: isoDateTimeSchema,
  })
  .strict();
export type MicrodramaPublicationEffectEvidence = z.infer<
  typeof microdramaPublicationEffectEvidenceSchema
>;

export const microdramaPublicationIdempotencyRecordSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PUBLICATION_SCHEMA_VERSION),
    idempotencyKey: identifierSchema,
    fingerprint: sha256Schema,
    intentId: identifierSchema,
    state: microdramaIdempotencyStateSchema,
    reservedAt: isoDateTimeSchema,
    committedAt: isoDateTimeSchema.optional(),
  })
  .strict();
export type MicrodramaPublicationIdempotencyRecord = z.infer<
  typeof microdramaPublicationIdempotencyRecordSchema
>;

export const microdramaPublicationDispatchAdmissionSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PUBLICATION_SCHEMA_VERSION),
    allowed: z.boolean(),
    blockReason: microdramaPublicationDispatchBlockReasonSchema.optional(),
    message: nonEmptyStringSchema.optional(),
    correlationId: identifierSchema,
    evaluatedAt: isoDateTimeSchema,
  })
  .strict();
export type MicrodramaPublicationDispatchAdmission = z.infer<
  typeof microdramaPublicationDispatchAdmissionSchema
>;

export function validateMicrodramaPublicationTargetProfile(
  value: unknown
): MicrodramaPublicationTargetProfile {
  return microdramaPublicationTargetProfileSchema.parse(value);
}

export function validateCreatorContentConsentRevision(
  value: unknown
): CreatorContentConsentRevision {
  return creatorContentConsentRevisionSchema.parse(value);
}

export function validateTikTokPostExportApprovalRevision(
  value: unknown
): TikTokPostExportApprovalRevision {
  return tikTokPostExportApprovalRevisionSchema.parse(value);
}

export function validateMicrodramaPublicationIntent(
  value: unknown
): MicrodramaPublicationIntent {
  return microdramaPublicationIntentSchema.parse(value);
}

export function validateMicrodramaPublicationAttempt(
  value: unknown
): MicrodramaPublicationAttempt {
  return microdramaPublicationAttemptSchema.parse(value);
}
