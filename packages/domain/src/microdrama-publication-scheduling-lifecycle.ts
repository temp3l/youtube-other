import { createHash } from "node:crypto";

import {
  type MicrodramaDispatchMode,
  type MicrodramaPublicationIntent,
  type MicrodramaPublicationIntentBinding,
} from "./microdrama-publication-contracts.js";
import {
  MICRODRAMA_PUBLICATION_SCHEDULING_SCHEMA_VERSION,
  type MicrodramaAudienceTimezoneProfile,
  type MicrodramaPublicationScheduleConsentRecord,
  type MicrodramaPublicationSchedulePolicy,
  type MicrodramaPublicationScheduleRecord,
  type MicrodramaPublicationSchedulingAdmission,
  type MicrodramaPublicationSchedulingBlockReason,
  microdramaPublicationScheduleConsentRecordSchema,
  microdramaPublicationScheduleRecordSchema,
  microdramaPublicationSchedulingAdmissionSchema,
} from "./microdrama-publication-scheduling-contracts.js";
import { type TikTokAppAuditReadinessProjection } from "./tiktok-app-audit-contracts.js";

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Publication scheduling domain cannot contain a non-finite number.");
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("Publication scheduling domain contains an unsupported value.");
}

const LOCAL_SCHEDULE_OFFSET_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/u;

export function assertValidAudienceTimezone(timezone: string): void {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new Error("INVALID_AUDIENCE_TIMEZONE");
  }
}

export function resolveScheduledUtcInstant(input: {
  readonly localScheduledAt: string;
  readonly audienceTimezone: string;
}): string {
  if (!LOCAL_SCHEDULE_OFFSET_PATTERN.test(input.localScheduledAt)) {
    throw new Error("LOCAL_SCHEDULE_MISSING_OFFSET");
  }
  assertValidAudienceTimezone(input.audienceTimezone);
  const parsedMs = Date.parse(input.localScheduledAt);
  if (!Number.isFinite(parsedMs)) {
    throw new Error("INVALID_LOCAL_SCHEDULE_TIME");
  }
  return new Date(parsedMs).toISOString();
}

export function computeScheduleConsentFence(input: {
  readonly binding: MicrodramaPublicationIntentBinding;
  readonly boundExportApprovalRevisionId?: string;
  readonly credentialVersion: string;
}): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        providerAccountId: input.binding.providerAccountId,
        credentialVersion: input.credentialVersion,
        renderHash: input.binding.renderHash,
        metadataRevisionId: input.binding.metadataRevisionId,
        consentRevisionId: input.binding.consentRevisionId,
        exportApprovalRevisionId: input.binding.exportApprovalRevisionId,
        boundExportApprovalRevisionId: input.boundExportApprovalRevisionId ?? null,
        privacy: input.binding.privacy,
        interactionSettings: input.binding.interactionSettings,
        aiContentDeclared: input.binding.aiContentDeclared,
        commercialContentDeclared: input.binding.commercialContentDeclared,
      })
    )
    .digest("hex");
}

export function evaluateScheduleHorizonAdmission(input: {
  readonly scheduledAtUtc: string;
  readonly now: string;
  readonly maxScheduleHorizonHours: number;
}): { readonly allowed: boolean; readonly reason?: MicrodramaPublicationSchedulingBlockReason } {
  const scheduledMs = Date.parse(input.scheduledAtUtc);
  const nowMs = Date.parse(input.now);
  if (scheduledMs <= nowMs) {
    return { allowed: false, reason: "schedule_in_past" };
  }
  const horizonMs = input.maxScheduleHorizonHours * 60 * 60 * 1000;
  if (scheduledMs - nowMs > horizonMs) {
    return { allowed: false, reason: "schedule_horizon_exceeded" };
  }
  return { allowed: true };
}

export function evaluatePreapprovedScheduledEnablement(input: {
  readonly policy: MicrodramaPublicationSchedulePolicy;
  readonly auditReadiness?: TikTokAppAuditReadinessProjection | null;
  readonly now: string;
}): { readonly allowed: boolean; readonly reason?: MicrodramaPublicationSchedulingBlockReason } {
  if (!input.policy.preapprovedScheduledEnabled) {
    return { allowed: false, reason: "preapproved_scheduled_disabled" };
  }
  if (!input.policy.tiktokAuditReadinessProjectionId) {
    return { allowed: false, reason: "tiktok_audit_evidence_missing" };
  }
  if (!input.auditReadiness) {
    return { allowed: false, reason: "tiktok_audit_evidence_missing" };
  }
  if (
    input.auditReadiness.readinessProjectionId !==
    input.policy.tiktokAuditReadinessProjectionId
  ) {
    return { allowed: false, reason: "tiktok_audit_evidence_missing" };
  }
  if (input.auditReadiness.state !== "active") {
    return { allowed: false, reason: "tiktok_audit_not_ready" };
  }
  const nowMs = Date.parse(input.now);
  if (Date.parse(input.auditReadiness.effectiveAt) > nowMs) {
    return { allowed: false, reason: "tiktok_audit_not_ready" };
  }
  if (
    input.auditReadiness.expiresAt !== undefined &&
    Date.parse(input.auditReadiness.expiresAt) <= nowMs
  ) {
    return { allowed: false, reason: "tiktok_audit_not_ready" };
  }
  if (input.auditReadiness.revokedAt !== undefined) {
    return { allowed: false, reason: "tiktok_audit_not_ready" };
  }
  return { allowed: true };
}

export function planPublicationScheduleRecord(input: {
  readonly scheduleId: string;
  readonly intent: MicrodramaPublicationIntent;
  readonly audienceProfile: MicrodramaAudienceTimezoneProfile;
  readonly localScheduledAt: string;
  readonly now: string;
  readonly maxScheduleHorizonHours: number;
}): MicrodramaPublicationScheduleRecord {
  if (input.intent.dispatchMode !== "preapproved_scheduled") {
    throw new Error("SCHEDULE_REQUIRES_PREAPPROVED_MODE");
  }
  if (!input.intent.scheduledAt) {
    throw new Error("SCHEDULE_REQUIRES_INTENT_SCHEDULED_AT");
  }
  const scheduledAtUtc = resolveScheduledUtcInstant({
    localScheduledAt: input.localScheduledAt,
    audienceTimezone: input.audienceProfile.audienceTimezone,
  });
  if (scheduledAtUtc !== input.intent.scheduledAt) {
    throw new Error("SCHEDULE_UTC_MISMATCH");
  }
  const horizon = evaluateScheduleHorizonAdmission({
    scheduledAtUtc,
    now: input.now,
    maxScheduleHorizonHours: input.maxScheduleHorizonHours,
  });
  if (!horizon.allowed) {
    throw new Error(horizon.reason ?? "SCHEDULE_HORIZON_REJECTED");
  }
  const consentFenceHash = computeScheduleConsentFence({
    binding: input.intent.binding,
    boundExportApprovalRevisionId: input.intent.boundExportApprovalRevisionId,
    credentialVersion: input.intent.binding.credentialVersion,
  });
  return microdramaPublicationScheduleRecordSchema.parse({
    schemaVersion: "mediaforge.microdrama-publication-scheduling.v1",
    scheduleId: input.scheduleId,
    intentId: input.intent.intentId,
    dispatchMode: input.intent.dispatchMode,
    audienceTimezoneProfileId: input.audienceProfile.profileId,
    audienceTimezone: input.audienceProfile.audienceTimezone,
    localScheduledAt: input.localScheduledAt,
    scheduledAtUtc,
    intentFingerprint: input.intent.fingerprint,
    consentFenceHash,
    state: "pending",
    createdAt: input.now,
    updatedAt: input.now,
  });
}

export function recordPublicationScheduleConsent(input: {
  readonly consentRecordId: string;
  readonly schedule: MicrodramaPublicationScheduleRecord;
  readonly intent: MicrodramaPublicationIntent;
  readonly operatorId: string;
  readonly consentedAt: string;
}): MicrodramaPublicationScheduleConsentRecord {
  if (input.schedule.state !== "pending") {
    throw new Error("SCHEDULE_NOT_PENDING");
  }
  if (input.schedule.intentId !== input.intent.intentId) {
    throw new Error("SCHEDULE_INTENT_MISMATCH");
  }
  if (input.schedule.intentFingerprint !== input.intent.fingerprint) {
    throw new Error("SCHEDULE_FENCE_CHANGED");
  }
  const consentFenceHash = computeScheduleConsentFence({
    binding: input.intent.binding,
    boundExportApprovalRevisionId: input.intent.boundExportApprovalRevisionId,
    credentialVersion: input.intent.binding.credentialVersion,
  });
  if (input.schedule.consentFenceHash !== consentFenceHash) {
    throw new Error("SCHEDULE_FENCE_CHANGED");
  }
  return microdramaPublicationScheduleConsentRecordSchema.parse({
    schemaVersion: "mediaforge.microdrama-publication-scheduling.v1",
    consentRecordId: input.consentRecordId,
    scheduleId: input.schedule.scheduleId,
    intentId: input.intent.intentId,
    operatorId: input.operatorId,
    intentFingerprint: input.intent.fingerprint,
    consentFenceHash,
    dispatchMode: input.schedule.dispatchMode,
    consentedAt: input.consentedAt,
  });
}

export function evaluateScheduleFenceRevalidation(input: {
  readonly schedule: MicrodramaPublicationScheduleRecord;
  readonly consent?: MicrodramaPublicationScheduleConsentRecord;
  readonly intent: MicrodramaPublicationIntent;
}): { readonly allowed: boolean; readonly reason?: MicrodramaPublicationSchedulingBlockReason } {
  if (input.schedule.state === "cancelled") {
    return { allowed: false, reason: "schedule_cancelled" };
  }
  if (input.schedule.state !== "pending") {
    return { allowed: false, reason: "schedule_not_pending" };
  }
  if (input.schedule.intentId !== input.intent.intentId) {
    return { allowed: false, reason: "schedule_fence_changed" };
  }
  if (input.schedule.dispatchMode !== input.intent.dispatchMode) {
    return { allowed: false, reason: "dispatch_mode_mismatch" };
  }
  const currentFence = computeScheduleConsentFence({
    binding: input.intent.binding,
    boundExportApprovalRevisionId: input.intent.boundExportApprovalRevisionId,
    credentialVersion: input.intent.binding.credentialVersion,
  });
  if (
    input.schedule.intentFingerprint !== input.intent.fingerprint ||
    input.schedule.consentFenceHash !== currentFence
  ) {
    return { allowed: false, reason: "schedule_fence_changed" };
  }
  if (input.consent) {
    if (
      input.consent.intentFingerprint !== input.intent.fingerprint ||
      input.consent.consentFenceHash !== currentFence
    ) {
      return { allowed: false, reason: "schedule_fence_changed" };
    }
  }
  return { allowed: true };
}

export function cancelPublicationSchedule(input: {
  readonly schedule: MicrodramaPublicationScheduleRecord;
  readonly now: string;
}): MicrodramaPublicationScheduleRecord {
  if (input.schedule.state !== "pending") {
    throw new Error("SCHEDULE_NOT_CANCELLABLE");
  }
  return microdramaPublicationScheduleRecordSchema.parse({
    ...input.schedule,
    state: "cancelled",
    cancelledAt: input.now,
    updatedAt: input.now,
  });
}

export function markPublicationScheduleDispatched(input: {
  readonly schedule: MicrodramaPublicationScheduleRecord;
  readonly now: string;
}): MicrodramaPublicationScheduleRecord {
  if (input.schedule.state !== "pending") {
    throw new Error("SCHEDULE_NOT_DISPATCHABLE");
  }
  return microdramaPublicationScheduleRecordSchema.parse({
    ...input.schedule,
    state: "dispatched",
    dispatchedAt: input.now,
    updatedAt: input.now,
  });
}

export function evaluateScheduledDispatchAdmission(input: {
  readonly correlationId: string;
  readonly evaluatedAt: string;
  readonly dispatchMode: MicrodramaDispatchMode;
  readonly schedule?: MicrodramaPublicationScheduleRecord;
  readonly consent?: MicrodramaPublicationScheduleConsentRecord;
  readonly intent: MicrodramaPublicationIntent;
  readonly policy?: MicrodramaPublicationSchedulePolicy;
  readonly auditReadiness?: TikTokAppAuditReadinessProjection | null;
  readonly operatorDispatchConfirmed?: boolean;
}): MicrodramaPublicationSchedulingAdmission {
  let blockReason: MicrodramaPublicationSchedulingBlockReason | undefined;
  let message: string | undefined;

  if (input.dispatchMode === "manual") {
    if (input.operatorDispatchConfirmed !== true) {
      blockReason = "manual_dispatch_required";
      message = "MANUAL dispatch requires a dispatch-time operator action.";
    }
  } else if (input.dispatchMode === "preapproved_scheduled") {
    if (!input.policy) {
      blockReason = "preapproved_scheduled_disabled";
      message = "Publication schedule policy is missing.";
    } else {
      const enablement = evaluatePreapprovedScheduledEnablement({
        policy: input.policy,
        auditReadiness: input.auditReadiness,
        now: input.evaluatedAt,
      });
      if (!enablement.allowed) {
        blockReason = enablement.reason ?? "preapproved_scheduled_disabled";
        message =
          "PREAPPROVED_SCHEDULED remains disabled until audit evidence and explicit enablement exist.";
      }
    }
    if (!blockReason && !input.schedule) {
      blockReason = "schedule_consent_missing";
      message = "PREAPPROVED_SCHEDULED requires a persisted schedule record.";
    }
    if (!blockReason && !input.consent) {
      blockReason = "schedule_consent_missing";
      message = "PREAPPROVED_SCHEDULED requires schedule-time consent evidence.";
    }
    if (!blockReason && input.schedule && input.consent) {
      const fence = evaluateScheduleFenceRevalidation({
        schedule: input.schedule,
        consent: input.consent,
        intent: input.intent,
      });
      if (!fence.allowed) {
        blockReason = fence.reason ?? "schedule_fence_changed";
        message =
          "Scheduled dispatch blocked because account, OAuth, capability, hash, privacy, interaction, declaration, approval or consent fence changed.";
      }
    }
  }

  return microdramaPublicationSchedulingAdmissionSchema.parse({
    schemaVersion: "mediaforge.microdrama-publication-scheduling.v1",
    allowed: blockReason === undefined,
    ...(blockReason !== undefined ? { blockReason, message } : {}),
    correlationId: input.correlationId,
    evaluatedAt: input.evaluatedAt,
  });
}

export function defaultPublicationSchedulePolicy(input: {
  readonly policyId: string;
  readonly seriesId: string;
  readonly provider: MicrodramaPublicationSchedulePolicy["provider"];
  readonly locale: string;
  readonly providerAccountId: string;
  readonly registeredAt: string;
}): MicrodramaPublicationSchedulePolicy {
  return {
    schemaVersion: MICRODRAMA_PUBLICATION_SCHEDULING_SCHEMA_VERSION,
    policyId: input.policyId,
    seriesId: input.seriesId,
    provider: input.provider,
    locale: input.locale,
    providerAccountId: input.providerAccountId,
    manualDispatchEnabled: true,
    preapprovedScheduledEnabled: false,
    maxScheduleHorizonHours: 168,
    registeredAt: input.registeredAt,
    updatedAt: input.registeredAt,
  };
}
