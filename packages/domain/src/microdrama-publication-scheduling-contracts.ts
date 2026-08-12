import { z } from "zod";

import {
  MICRODRAMA_PUBLICATION_SCHEMA_VERSION,
  microdramaDispatchModeSchema,
  microdramaPublicationProviderSchema,
} from "./microdrama-publication-contracts.js";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const sha256Schema = z.string().regex(sha256Pattern);
const nonEmptyStringSchema = z.string().trim().min(1);
const ianaTimezoneSchema = nonEmptyStringSchema.max(80);

export const MICRODRAMA_PUBLICATION_SCHEDULING_SCHEMA_VERSION =
  "mediaforge.microdrama-publication-scheduling.v1" as const;

export const MICRODRAMA_PUBLICATION_SCHEDULE_STATES = [
  "pending",
  "cancelled",
  "dispatched",
  "superseded",
] as const;
export const microdramaPublicationScheduleStateSchema = z.enum(
  MICRODRAMA_PUBLICATION_SCHEDULE_STATES
);
export type MicrodramaPublicationScheduleState = z.infer<
  typeof microdramaPublicationScheduleStateSchema
>;

export const MICRODRAMA_PUBLICATION_SCHEDULING_BLOCK_REASONS = [
  "audience_timezone_missing",
  "audience_timezone_invalid",
  "local_schedule_missing_offset",
  "schedule_in_past",
  "schedule_horizon_exceeded",
  "preapproved_scheduled_disabled",
  "tiktok_audit_evidence_missing",
  "tiktok_audit_not_ready",
  "schedule_consent_missing",
  "manual_dispatch_required",
  "schedule_fence_changed",
  "schedule_cancelled",
  "schedule_not_pending",
  "dispatch_mode_mismatch",
] as const;
export const microdramaPublicationSchedulingBlockReasonSchema = z.enum(
  MICRODRAMA_PUBLICATION_SCHEDULING_BLOCK_REASONS
);
export type MicrodramaPublicationSchedulingBlockReason = z.infer<
  typeof microdramaPublicationSchedulingBlockReasonSchema
>;

export const microdramaAudienceTimezoneProfileSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PUBLICATION_SCHEDULING_SCHEMA_VERSION),
    profileId: identifierSchema,
    seriesId: identifierSchema,
    locale: nonEmptyStringSchema,
    audienceTimezone: ianaTimezoneSchema,
    registeredAt: isoDateTimeSchema,
  })
  .strict();
export type MicrodramaAudienceTimezoneProfile = z.infer<
  typeof microdramaAudienceTimezoneProfileSchema
>;

export const microdramaPublicationSchedulePolicySchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PUBLICATION_SCHEDULING_SCHEMA_VERSION),
    policyId: identifierSchema,
    seriesId: identifierSchema,
    provider: microdramaPublicationProviderSchema,
    locale: nonEmptyStringSchema,
    providerAccountId: identifierSchema,
    manualDispatchEnabled: z.boolean(),
    preapprovedScheduledEnabled: z.boolean(),
    tiktokAuditReadinessProjectionId: identifierSchema.optional(),
    maxScheduleHorizonHours: z.number().int().positive(),
    registeredAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();
export type MicrodramaPublicationSchedulePolicy = z.infer<
  typeof microdramaPublicationSchedulePolicySchema
>;

export const microdramaPublicationScheduleRecordSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PUBLICATION_SCHEDULING_SCHEMA_VERSION),
    scheduleId: identifierSchema,
    intentId: identifierSchema,
    dispatchMode: microdramaDispatchModeSchema,
    audienceTimezoneProfileId: identifierSchema,
    audienceTimezone: ianaTimezoneSchema,
    localScheduledAt: isoDateTimeSchema,
    scheduledAtUtc: isoDateTimeSchema,
    intentFingerprint: sha256Schema,
    consentFenceHash: sha256Schema,
    state: microdramaPublicationScheduleStateSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    cancelledAt: isoDateTimeSchema.optional(),
    dispatchedAt: isoDateTimeSchema.optional(),
  })
  .strict();
export type MicrodramaPublicationScheduleRecord = z.infer<
  typeof microdramaPublicationScheduleRecordSchema
>;

export const microdramaPublicationScheduleConsentRecordSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PUBLICATION_SCHEDULING_SCHEMA_VERSION),
    consentRecordId: identifierSchema,
    scheduleId: identifierSchema,
    intentId: identifierSchema,
    operatorId: identifierSchema,
    intentFingerprint: sha256Schema,
    consentFenceHash: sha256Schema,
    dispatchMode: microdramaDispatchModeSchema,
    consentedAt: isoDateTimeSchema,
  })
  .strict();
export type MicrodramaPublicationScheduleConsentRecord = z.infer<
  typeof microdramaPublicationScheduleConsentRecordSchema
>;

export const microdramaPublicationSchedulingAdmissionSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PUBLICATION_SCHEDULING_SCHEMA_VERSION),
    allowed: z.boolean(),
    blockReason: microdramaPublicationSchedulingBlockReasonSchema.optional(),
    message: nonEmptyStringSchema.optional(),
    correlationId: identifierSchema,
    evaluatedAt: isoDateTimeSchema,
  })
  .strict();
export type MicrodramaPublicationSchedulingAdmission = z.infer<
  typeof microdramaPublicationSchedulingAdmissionSchema
>;

export function validateMicrodramaAudienceTimezoneProfile(
  value: unknown
): MicrodramaAudienceTimezoneProfile {
  return microdramaAudienceTimezoneProfileSchema.parse(value);
}

export function validateMicrodramaPublicationSchedulePolicy(
  value: unknown
): MicrodramaPublicationSchedulePolicy {
  return microdramaPublicationSchedulePolicySchema.parse(value);
}

export function validateMicrodramaPublicationScheduleRecord(
  value: unknown
): MicrodramaPublicationScheduleRecord {
  return microdramaPublicationScheduleRecordSchema.parse(value);
}

export function validateMicrodramaPublicationScheduleConsentRecord(
  value: unknown
): MicrodramaPublicationScheduleConsentRecord {
  return microdramaPublicationScheduleConsentRecordSchema.parse(value);
}
