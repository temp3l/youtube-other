import { createHash } from "node:crypto";

import {
  type CreatorContentConsentRevision,
  type MicrodramaDispatchMode,
  type MicrodramaIdempotencyState,
  type MicrodramaPublicationAttempt,
  type MicrodramaPublicationAttemptState,
  type MicrodramaPublicationCapabilityState,
  type MicrodramaPublicationDispatchAdmission,
  type MicrodramaPublicationDispatchBlockReason,
  type MicrodramaPublicationEffectEvidence,
  type MicrodramaPublicationIdempotencyRecord,
  type MicrodramaPublicationIntent,
  type MicrodramaPublicationIntentBinding,
  type MicrodramaPublicationIntentState,
  type MicrodramaPublicationOutcomeState,
  type MicrodramaPublicationTargetProfile,
  type ProviderCorrelation,
  type TikTokPostExportApprovalRevision,
  microdramaPublicationAttemptSchema,
  microdramaPublicationDispatchAdmissionSchema,
  microdramaPublicationEffectEvidenceSchema,
  microdramaPublicationIdempotencyRecordSchema,
  microdramaPublicationIntentSchema,
} from "./microdrama-publication-contracts.js";

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Publication domain cannot contain a non-finite number.");
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
  throw new Error("Publication domain contains an unsupported value.");
}

export function computePublicationIntentFingerprint(input: {
  readonly targetProfileId: string;
  readonly binding: MicrodramaPublicationIntentBinding;
  readonly dispatchMode: MicrodramaDispatchMode;
  readonly scheduledAt: string | null;
  readonly idempotencyKey: string;
}): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        targetProfileId: input.targetProfileId,
        binding: input.binding,
        dispatchMode: input.dispatchMode,
        scheduledAt: input.scheduledAt,
        idempotencyKey: input.idempotencyKey,
      })
    )
    .digest("hex");
}

export function resolvePublicationCapability(input?: {
  readonly state?: MicrodramaPublicationCapabilityState;
}): MicrodramaPublicationCapabilityState {
  return input?.state ?? "disabled";
}

export function publicationCapabilityAllowsDispatch(
  state: MicrodramaPublicationCapabilityState
): boolean {
  return state !== "disabled";
}

export function evaluateConsentRevisionAdmission(input: {
  readonly consent: CreatorContentConsentRevision;
  readonly provider: MicrodramaPublicationIntentBinding["provider"];
  readonly locale: string;
  readonly now: string;
}): { readonly allowed: boolean; readonly reason?: MicrodramaPublicationDispatchBlockReason } {
  if (input.consent.state !== "active") {
    return { allowed: false, reason: "consent_stale" };
  }
  if (input.consent.permittedProvider !== input.provider) {
    return { allowed: false, reason: "consent_stale" };
  }
  if (input.consent.permittedLocale.toLowerCase() !== input.locale.toLowerCase()) {
    return { allowed: false, reason: "consent_stale" };
  }
  const nowMs = Date.parse(input.now);
  if (Date.parse(input.consent.effectiveAt) > nowMs) {
    return { allowed: false, reason: "consent_stale" };
  }
  if (
    input.consent.expiresAt !== undefined &&
    Date.parse(input.consent.expiresAt) <= nowMs
  ) {
    return { allowed: false, reason: "consent_stale" };
  }
  if (input.consent.revokedAt !== undefined) {
    return { allowed: false, reason: "consent_stale" };
  }
  return { allowed: true };
}

export function evaluateExportApprovalAdmission(input: {
  readonly exportApproval: TikTokPostExportApprovalRevision;
  readonly consentRevisionId: string;
  readonly binding: MicrodramaPublicationIntentBinding;
  readonly now: string;
}): { readonly allowed: boolean; readonly reason?: MicrodramaPublicationDispatchBlockReason } {
  if (input.exportApproval.state !== "active") {
    return { allowed: false, reason: "export_approval_stale" };
  }
  if (input.exportApproval.consentRevisionId !== input.consentRevisionId) {
    return { allowed: false, reason: "export_approval_stale" };
  }
  if (input.exportApproval.providerAccountId !== input.binding.providerAccountId) {
    return { allowed: false, reason: "export_approval_stale" };
  }
  if (input.exportApproval.renderHash !== input.binding.renderHash) {
    return { allowed: false, reason: "export_approval_stale" };
  }
  if (input.exportApproval.metadataRevisionId !== input.binding.metadataRevisionId) {
    return { allowed: false, reason: "export_approval_stale" };
  }
  if (Date.parse(input.exportApproval.approvedAt) > Date.parse(input.now)) {
    return { allowed: false, reason: "export_approval_stale" };
  }
  return { allowed: true };
}

export function planPublicationIntent(input: {
  readonly intentId: string;
  readonly targetProfile: MicrodramaPublicationTargetProfile;
  readonly binding: MicrodramaPublicationIntentBinding;
  readonly dispatchMode: MicrodramaDispatchMode;
  readonly scheduledAt?: string | null;
  readonly idempotencyKey: string;
  readonly createdAt: string;
}): MicrodramaPublicationIntent {
  if (input.binding.providerAccountId !== input.targetProfile.providerAccountId) {
    throw new Error("PUBLICATION_ACCOUNT_MISMATCH");
  }
  if (input.binding.provider !== input.targetProfile.provider) {
    throw new Error("PUBLICATION_PROVIDER_MISMATCH");
  }
  const scheduledAt = input.scheduledAt ?? null;
  const fingerprint = computePublicationIntentFingerprint({
    targetProfileId: input.targetProfile.profileId,
    binding: input.binding,
    dispatchMode: input.dispatchMode,
    scheduledAt,
    idempotencyKey: input.idempotencyKey,
  });
  return microdramaPublicationIntentSchema.parse({
    schemaVersion: "mediaforge.microdrama-publication.v1",
    intentId: input.intentId,
    targetProfileId: input.targetProfile.profileId,
    binding: input.binding,
    dispatchMode: input.dispatchMode,
    scheduledAt,
    idempotencyKey: input.idempotencyKey,
    fingerprint,
    approvalState: "pending",
    state: "draft",
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });
}

export function approvePublicationIntent(input: {
  readonly intent: MicrodramaPublicationIntent;
  readonly exportApproval: TikTokPostExportApprovalRevision;
  readonly consent: CreatorContentConsentRevision;
  readonly now: string;
}): MicrodramaPublicationIntent {
  if (input.intent.approvalState === "revoked") {
    throw new Error("PUBLICATION_APPROVAL_REVOKED");
  }
  const consentAdmission = evaluateConsentRevisionAdmission({
    consent: input.consent,
    provider: input.intent.binding.provider,
    locale: input.intent.binding.locale,
    now: input.now,
  });
  if (!consentAdmission.allowed) {
    throw new Error("PUBLICATION_CONSENT_STALE");
  }
  const exportAdmission = evaluateExportApprovalAdmission({
    exportApproval: input.exportApproval,
    consentRevisionId: input.intent.binding.consentRevisionId,
    binding: input.intent.binding,
    now: input.now,
  });
  if (!exportAdmission.allowed) {
    throw new Error("PUBLICATION_EXPORT_APPROVAL_STALE");
  }
  if (
    input.exportApproval.exportApprovalRevisionId !==
    input.intent.binding.exportApprovalRevisionId
  ) {
    throw new Error("PUBLICATION_EXPORT_APPROVAL_MISMATCH");
  }
  return microdramaPublicationIntentSchema.parse({
    ...input.intent,
    approvalState: "publication_approved",
    boundExportApprovalRevisionId:
      input.exportApproval.exportApprovalRevisionId,
    state: "approved",
    updatedAt: input.now,
  });
}

const INTENT_TRANSITIONS: Readonly<
  Record<
    MicrodramaPublicationIntentState,
    readonly MicrodramaPublicationIntentState[]
  >
> = {
  draft: ["approved", "cancelled"],
  approved: ["prepared", "cancelled"],
  prepared: ["in_flight", "cancelled"],
  in_flight: ["published", "failed_known", "outcome_uncertain"],
  published: [],
  failed_known: [],
  outcome_uncertain: ["reconciled"],
  reconciled: [],
  cancelled: [],
};

export function transitionPublicationIntentState(input: {
  readonly intent: MicrodramaPublicationIntent;
  readonly nextState: MicrodramaPublicationIntentState;
  readonly now: string;
}): MicrodramaPublicationIntent {
  if (!INTENT_TRANSITIONS[input.intent.state].includes(input.nextState)) {
    throw new Error("PUBLICATION_INTENT_TRANSITION_REJECTED");
  }
  if (
    input.nextState === "prepared" &&
    input.intent.approvalState !== "publication_approved"
  ) {
    throw new Error("PUBLICATION_APPROVAL_REQUIRED");
  }
  return microdramaPublicationIntentSchema.parse({
    ...input.intent,
    state: input.nextState,
    updatedAt: input.now,
  });
}

export function evaluateIdempotencyAdmission(input: {
  readonly idempotencyKey: string;
  readonly fingerprint: string;
  readonly existing?: MicrodramaPublicationIdempotencyRecord;
}): {
  readonly allowed: boolean;
  readonly nextState: MicrodramaIdempotencyState;
  readonly reason?: MicrodramaPublicationDispatchBlockReason;
} {
  if (!input.existing) {
    return { allowed: true, nextState: "fresh" };
  }
  if (
    input.existing.idempotencyKey === input.idempotencyKey &&
    input.existing.fingerprint !== input.fingerprint
  ) {
    return { allowed: false, nextState: "conflict", reason: "idempotency_conflict" };
  }
  if (input.existing.state === "committed") {
    return { allowed: false, nextState: "committed", reason: "idempotency_conflict" };
  }
  if (input.existing.state === "conflict") {
    return { allowed: false, nextState: "conflict", reason: "idempotency_conflict" };
  }
  return { allowed: true, nextState: input.existing.state };
}

export function reservePublicationIdempotency(input: {
  readonly idempotencyKey: string;
  readonly fingerprint: string;
  readonly intentId: string;
  readonly reservedAt: string;
}): MicrodramaPublicationIdempotencyRecord {
  return microdramaPublicationIdempotencyRecordSchema.parse({
    schemaVersion: "mediaforge.microdrama-publication.v1",
    idempotencyKey: input.idempotencyKey,
    fingerprint: input.fingerprint,
    intentId: input.intentId,
    state: "reserved",
    reservedAt: input.reservedAt,
  });
}

export function commitPublicationIdempotency(input: {
  readonly record: MicrodramaPublicationIdempotencyRecord;
  readonly committedAt: string;
}): MicrodramaPublicationIdempotencyRecord {
  if (input.record.state !== "reserved") {
    throw new Error("PUBLICATION_IDEMPOTENCY_NOT_RESERVED");
  }
  return microdramaPublicationIdempotencyRecordSchema.parse({
    ...input.record,
    state: "committed",
    committedAt: input.committedAt,
  });
}

export function rejectPublicationBypassCommand(input: {
  readonly command: "force" | "retry" | "resume";
  readonly intent: MicrodramaPublicationIntent;
}): { readonly allowed: boolean; readonly reason: MicrodramaPublicationDispatchBlockReason } {
  if (input.intent.approvalState !== "publication_approved") {
    return { allowed: false, reason: "bypass_rejected" };
  }
  if (
    input.command === "retry" &&
    (input.intent.state === "outcome_uncertain" ||
      input.intent.state === "in_flight")
  ) {
    return { allowed: false, reason: "ambiguous_outcome_retry_blocked" };
  }
  if (input.command === "force") {
    return { allowed: false, reason: "bypass_rejected" };
  }
  if (
    input.command === "resume" &&
    input.intent.state === "outcome_uncertain"
  ) {
    return { allowed: false, reason: "ambiguous_outcome_retry_blocked" };
  }
  return { allowed: true, reason: "bypass_rejected" };
}

export function evaluateRetryAdmission(input: {
  readonly intentState: MicrodramaPublicationIntentState;
  readonly attemptState?: MicrodramaPublicationAttemptState;
  readonly outcomeState?: MicrodramaPublicationOutcomeState;
}): { readonly allowed: boolean; readonly reason?: MicrodramaPublicationDispatchBlockReason } {
  if (
    input.intentState === "outcome_uncertain" ||
    input.attemptState === "outcome_uncertain" ||
    input.outcomeState === "outcome_uncertain"
  ) {
    return { allowed: false, reason: "ambiguous_outcome_retry_blocked" };
  }
  if (input.intentState === "in_flight" || input.attemptState === "in_flight") {
    return { allowed: false, reason: "ambiguous_outcome_retry_blocked" };
  }
  return { allowed: true };
}

export function preparePublicationAttempt(input: {
  readonly attemptId: string;
  readonly intent: MicrodramaPublicationIntent;
  readonly attemptFence: number;
  readonly providerCorrelation?: ProviderCorrelation;
  readonly createdAt: string;
}): MicrodramaPublicationAttempt {
  if (input.intent.approvalState !== "publication_approved") {
    throw new Error("PUBLICATION_APPROVAL_REQUIRED");
  }
  if (input.intent.state !== "approved" && input.intent.state !== "prepared") {
    throw new Error("PUBLICATION_INTENT_NOT_APPROVED");
  }
  return microdramaPublicationAttemptSchema.parse({
    schemaVersion: "mediaforge.microdrama-publication.v1",
    attemptId: input.attemptId,
    intentId: input.intent.intentId,
    attemptFence: input.attemptFence,
    idempotencyKey: input.intent.idempotencyKey,
    binding: input.intent.binding,
    state: "prepared",
    providerCorrelation: input.providerCorrelation ?? {},
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });
}

export function recordPublicationEffectEvidence(input: {
  readonly effectId: string;
  readonly attempt: MicrodramaPublicationAttempt;
  readonly outcomeState: MicrodramaPublicationOutcomeState;
  readonly providerCorrelation?: ProviderCorrelation;
  readonly rateLimitState?: MicrodramaPublicationEffectEvidence["rateLimitState"];
  readonly retryAfter?: string;
  readonly nextEligibleAt?: string;
  readonly reconciliationOutcome?: MicrodramaPublicationEffectEvidence["reconciliationOutcome"];
  readonly recordedAt: string;
}): MicrodramaPublicationEffectEvidence {
  return microdramaPublicationEffectEvidenceSchema.parse({
    schemaVersion: "mediaforge.microdrama-publication.v1",
    effectId: input.effectId,
    attemptId: input.attempt.attemptId,
    intentId: input.attempt.intentId,
    outcomeState: input.outcomeState,
    providerCorrelation: input.providerCorrelation ?? input.attempt.providerCorrelation,
    rateLimitState: input.rateLimitState ?? "none",
    ...(input.retryAfter !== undefined ? { retryAfter: input.retryAfter } : {}),
    ...(input.nextEligibleAt !== undefined
      ? { nextEligibleAt: input.nextEligibleAt }
      : {}),
    ...(input.reconciliationOutcome !== undefined
      ? { reconciliationOutcome: input.reconciliationOutcome }
      : {}),
    recordedAt: input.recordedAt,
  });
}

export function evaluatePublicationDispatchAdmission(input: {
  readonly correlationId: string;
  readonly evaluatedAt: string;
  readonly capabilityState: MicrodramaPublicationCapabilityState;
  readonly targetProfile?: MicrodramaPublicationTargetProfile;
  readonly intent: MicrodramaPublicationIntent;
  readonly consent?: CreatorContentConsentRevision;
  readonly exportApproval?: TikTokPostExportApprovalRevision;
  readonly idempotency?: MicrodramaPublicationIdempotencyRecord;
  readonly operatorDispatchConfirmed?: boolean;
  readonly scheduleConsentRecorded?: boolean;
}): MicrodramaPublicationDispatchAdmission {
  let blockReason: MicrodramaPublicationDispatchBlockReason | undefined;
  let message: string | undefined;

  if (!publicationCapabilityAllowsDispatch(input.capabilityState)) {
    blockReason = "capability_disabled";
    message = "Publication capability defaults off.";
  } else if (!input.targetProfile) {
    blockReason = "target_profile_missing";
    message = "Publication target profile is missing.";
  } else if (!input.targetProfile.enabled) {
    blockReason = "target_profile_disabled";
    message = "Publication target profile is disabled.";
  } else if (
    input.targetProfile.providerAccountId !== input.intent.binding.providerAccountId
  ) {
    blockReason = "account_mismatch";
    message = "Intent account does not match target profile.";
  } else if (input.intent.approvalState !== "publication_approved") {
    blockReason = "approval_not_bound";
    message = "PUBLICATION_APPROVED must bind the exact export approval.";
  } else if (
    input.intent.boundExportApprovalRevisionId !==
    input.intent.binding.exportApprovalRevisionId
  ) {
    blockReason = "approval_not_bound";
    message = "Bound export approval revision mismatch.";
  } else if (!input.consent) {
    blockReason = "consent_missing";
    message = "Creator consent revision is missing.";
  } else if (!input.exportApproval) {
    blockReason = "export_approval_missing";
    message = "Export approval revision is missing.";
  } else {
    const consentAdmission = evaluateConsentRevisionAdmission({
      consent: input.consent,
      provider: input.intent.binding.provider,
      locale: input.intent.binding.locale,
      now: input.evaluatedAt,
    });
    if (!consentAdmission.allowed) {
      blockReason = consentAdmission.reason ?? "consent_stale";
      message = "Creator consent revision is stale or incompatible.";
    } else {
      const exportAdmission = evaluateExportApprovalAdmission({
        exportApproval: input.exportApproval,
        consentRevisionId: input.intent.binding.consentRevisionId,
        binding: input.intent.binding,
        now: input.evaluatedAt,
      });
      if (!exportAdmission.allowed) {
        blockReason = exportAdmission.reason ?? "export_approval_stale";
        message = "Export approval revision is stale or incompatible.";
      }
    }
  }

  if (!blockReason && input.idempotency) {
    const idempotencyAdmission = evaluateIdempotencyAdmission({
      idempotencyKey: input.intent.idempotencyKey,
      fingerprint: input.intent.fingerprint,
      existing: input.idempotency,
    });
    if (!idempotencyAdmission.allowed) {
      blockReason = idempotencyAdmission.reason ?? "idempotency_conflict";
      message = "Idempotency key conflicts with an existing publication intent.";
    }
  }

  if (!blockReason && input.intent.dispatchMode === "manual") {
    if (input.operatorDispatchConfirmed !== true) {
      blockReason = "manual_dispatch_required";
      message = "MANUAL dispatch requires an operator action.";
    }
  }

  if (
    !blockReason &&
    input.intent.dispatchMode === "preapproved_scheduled" &&
    input.scheduleConsentRecorded !== true
  ) {
    blockReason = "scheduled_consent_missing";
    message = "PREAPPROVED_SCHEDULED requires schedule-time consent evidence.";
  }

  if (
    !blockReason &&
    !["approved", "prepared"].includes(input.intent.state)
  ) {
    blockReason = "intent_state_invalid";
    message = `Intent state ${input.intent.state} cannot dispatch.`;
  }

  return microdramaPublicationDispatchAdmissionSchema.parse({
    schemaVersion: "mediaforge.microdrama-publication.v1",
    allowed: blockReason === undefined,
    ...(blockReason !== undefined ? { blockReason, message } : {}),
    correlationId: input.correlationId,
    evaluatedAt: input.evaluatedAt,
  });
}
