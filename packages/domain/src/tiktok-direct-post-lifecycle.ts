import { createHash } from "node:crypto";

import {
  type CreatorContentConsentRevision,
  type MicrodramaPublicationAttempt,
  type MicrodramaPublicationCapabilityState,
  type MicrodramaPublicationDispatchAdmission,
  type MicrodramaPublicationIdempotencyRecord,
  type MicrodramaPublicationIntent,
  type MicrodramaPublicationTargetProfile,
  type ProviderCorrelation,
  type TikTokPostExportApprovalRevision,
} from "./microdrama-publication-contracts.js";
import {
  evaluateIdempotencyAdmission,
  evaluatePublicationDispatchAdmission,
  publicationCapabilityAllowsDispatch,
} from "./microdrama-publication-lifecycle.js";
import { type TikTokAppAuditReadinessProjection } from "./tiktok-app-audit-contracts.js";
import { type TikTokCreatorPreflightResult } from "./tiktok-creator-preflight-contracts.js";
import { type TikTokMetadataRevision } from "./tiktok-metadata-contracts.js";
import {
  type TikTokDirectPostDispatchAdmission,
  type TikTokDirectPostDispatchBlockReason,
  type TikTokDirectPostDispatchOutcome,
  type TikTokDirectPostEffectRecord,
  type TikTokDirectPostEffectReference,
  type TikTokDirectPostInitRequest,
  type TikTokDirectPostInitResponse,
  type TikTokDirectPostThrottleEvidence,
  TIKTOK_DIRECT_POST_SCHEMA_VERSION,
  tikTokDirectPostDispatchAdmissionSchema,
  tikTokDirectPostEffectRecordSchema,
  tikTokDirectPostEffectReferenceSchema,
  tikTokDirectPostInitRequestSchema,
} from "./tiktok-direct-post-contracts.js";
import { type TikTokTransferPlan } from "./tiktok-transfer-contracts.js";
import { evaluateTikTokAppAuditOperationAdmission } from "./tiktok-app-audit-lifecycle.js";
import { evaluateTikTokAttemptAccountBindingImmutability } from "./tiktok-account-lifecycle.js";
import { assertCreatorCapabilityAllowsDirectPost } from "./tiktok-creator-preflight-lifecycle.js";

export function assertTikTokMetadataRevisionMatchesBinding(input: {
  readonly metadata: TikTokMetadataRevision;
  readonly binding: MicrodramaPublicationIntent["binding"];
}): void {
  if (input.metadata.metadataRevisionId !== input.binding.metadataRevisionId) {
    throw new Error("TIKTOK_METADATA_REVISION_MISMATCH");
  }
  if (input.metadata.providerPolicy.privacy !== input.binding.privacy) {
    throw new Error("TIKTOK_METADATA_POLICY_MISMATCH");
  }
  if (
    input.metadata.providerPolicy.interactionSettings.allowComments !==
    input.binding.interactionSettings.allowComments ||
    input.metadata.providerPolicy.interactionSettings.allowDuet !==
    input.binding.interactionSettings.allowDuet ||
    input.metadata.providerPolicy.interactionSettings.allowStitch !==
    input.binding.interactionSettings.allowStitch
  ) {
    throw new Error("TIKTOK_METADATA_INTERACTION_MISMATCH");
  }
  if (input.metadata.disclosure.aiContentDeclared !== input.binding.aiContentDeclared) {
    throw new Error("TIKTOK_METADATA_DECLARATION_MISMATCH");
  }
  if (
    input.metadata.disclosure.commercialContentDeclared !==
    input.binding.commercialContentDeclared
  ) {
    throw new Error("TIKTOK_METADATA_DECLARATION_MISMATCH");
  }
}

export function assertTikTokTransferPlanMatchesBinding(input: {
  readonly transferPlan: TikTokTransferPlan;
  readonly binding: MicrodramaPublicationIntent["binding"];
}): void {
  if (input.transferPlan.contentHash !== input.binding.renderHash) {
    throw new Error("TIKTOK_TRANSFER_RENDER_MISMATCH");
  }
}

export function buildTikTokDirectPostInitRequest(input: {
  readonly initRequestId: string;
  readonly attempt: MicrodramaPublicationAttempt;
  readonly transferPlan: TikTokTransferPlan;
  readonly metadata: TikTokMetadataRevision;
  readonly accountFence: string;
  readonly preparedAt: string;
}): TikTokDirectPostInitRequest {
  assertTikTokMetadataRevisionMatchesBinding({
    metadata: input.metadata,
    binding: input.attempt.binding,
  });
  assertTikTokTransferPlanMatchesBinding({
    transferPlan: input.transferPlan,
    binding: input.attempt.binding,
  });
  return tikTokDirectPostInitRequestSchema.parse({
    schemaVersion: TIKTOK_DIRECT_POST_SCHEMA_VERSION,
    initRequestId: input.initRequestId,
    attemptId: input.attempt.attemptId,
    intentId: input.attempt.intentId,
    idempotencyKey: input.attempt.idempotencyKey,
    attemptFence: input.attempt.attemptFence,
    binding: input.attempt.binding,
    transferPlanId: input.transferPlan.transferPlanId,
    transferMode: input.transferPlan.mode,
    contentHash: input.transferPlan.contentHash,
    metadataRevisionId: input.metadata.metadataRevisionId,
    metadataContentHash: input.metadata.contentHash,
    providerAccountId: input.attempt.binding.providerAccountId,
    credentialVersion: input.attempt.binding.credentialVersion,
    accountFence: input.accountFence,
    preparedAt: input.preparedAt,
  });
}

export function evaluateTikTokDirectPostRateLimitAdmission(input: {
  readonly effect?: TikTokDirectPostEffectRecord;
  readonly now: string;
}): { readonly allowed: boolean; readonly reason?: TikTokDirectPostDispatchBlockReason } {
  if (!input.effect || input.effect.rateLimitState === "none") {
    return { allowed: true };
  }
  if (
    input.effect.nextEligibleAt !== undefined &&
    Date.parse(input.now) < Date.parse(input.effect.nextEligibleAt)
  ) {
    return { allowed: false, reason: "rate_limited" };
  }
  return { allowed: true };
}

function mapPublicationBlockReason(
  reason: MicrodramaPublicationDispatchAdmission["blockReason"]
): TikTokDirectPostDispatchBlockReason | undefined {
  if (!reason) {
    return undefined;
  }
  if (
    reason === "approval_revoked" ||
    reason === "ambiguous_outcome_retry_blocked" ||
    reason === "bypass_rejected"
  ) {
    return "approval_not_bound";
  }
  return reason as TikTokDirectPostDispatchBlockReason;
}

export function evaluateTikTokDirectPostDispatchAdmission(input: {
  readonly correlationId: string;
  readonly evaluatedAt: string;
  readonly capabilityState: MicrodramaPublicationCapabilityState;
  readonly targetProfile?: MicrodramaPublicationTargetProfile;
  readonly intent: MicrodramaPublicationIntent;
  readonly attempt: MicrodramaPublicationAttempt;
  readonly consent?: CreatorContentConsentRevision;
  readonly exportApproval?: TikTokPostExportApprovalRevision;
  readonly metadata: TikTokMetadataRevision;
  readonly transferPlan: TikTokTransferPlan;
  readonly idempotency?: MicrodramaPublicationIdempotencyRecord;
  readonly appAuditReadiness?: TikTokAppAuditReadinessProjection | null;
  readonly creatorPreflight: TikTokCreatorPreflightResult;
  readonly observedAccountBinding: {
    readonly providerAccountId: string;
    readonly credentialVersion: string;
  };
  readonly existingEffect?: TikTokDirectPostEffectRecord;
  readonly operatorDispatchConfirmed?: boolean;
  readonly scheduleConsentRecorded?: boolean;
}): TikTokDirectPostDispatchAdmission {
  let blockReason: TikTokDirectPostDispatchBlockReason | undefined;
  let message: string | undefined;

  if (
    input.existingEffect?.state === "init_dispatched" &&
    input.idempotency?.state === "committed"
  ) {
    blockReason = "effect_already_committed";
    message = "Direct Post init already committed for this idempotency key.";
  }

  const rateLimitAdmission = evaluateTikTokDirectPostRateLimitAdmission({
    effect: input.existingEffect,
    now: input.evaluatedAt,
  });
  if (!blockReason && !rateLimitAdmission.allowed) {
    blockReason = rateLimitAdmission.reason ?? "rate_limited";
    message = "Direct Post dispatch paused by provider rate limit.";
  }

  if (!blockReason) {
    const publicationAdmission = evaluatePublicationDispatchAdmission({
      correlationId: input.correlationId,
      evaluatedAt: input.evaluatedAt,
      capabilityState: input.capabilityState,
      targetProfile: input.targetProfile,
      intent: input.intent,
      consent: input.consent,
      exportApproval: input.exportApproval,
      idempotency: input.idempotency,
      operatorDispatchConfirmed: input.operatorDispatchConfirmed,
      scheduleConsentRecorded: input.scheduleConsentRecorded,
    });
    if (!publicationAdmission.allowed) {
      blockReason = mapPublicationBlockReason(publicationAdmission.blockReason);
      message = publicationAdmission.message;
    }
  }

  if (!blockReason) {
    const accountAdmission = evaluateTikTokAttemptAccountBindingImmutability({
      preparedBinding: {
        providerAccountId: input.attempt.binding.providerAccountId,
        credentialVersion: input.attempt.binding.credentialVersion,
      },
      observedBinding: input.observedAccountBinding,
    });
    if (!accountAdmission.allowed) {
      blockReason = "account_binding_changed";
      message = accountAdmission.message;
    }
  }

  if (!blockReason) {
    const auditAdmission = evaluateTikTokAppAuditOperationAdmission({
      operation: "direct_post",
      readiness: input.appAuditReadiness ?? null,
      now: input.evaluatedAt,
    });
    if (!auditAdmission.allowed) {
      blockReason = "app_audit_blocked";
      message = "TikTok app audit readiness blocks Direct Post.";
    }
  }

  if (!blockReason) {
    try {
      assertCreatorCapabilityAllowsDirectPost(input.creatorPreflight.creatorInfo);
    } catch (error) {
      blockReason = "creator_capability_blocked";
      message =
        error instanceof Error
          ? error.message
          : "Creator capability blocks Direct Post.";
    }
  }

  if (!blockReason) {
    try {
      assertTikTokMetadataRevisionMatchesBinding({
        metadata: input.metadata,
        binding: input.intent.binding,
      });
    } catch {
      blockReason = "metadata_mismatch";
      message = "Metadata revision does not match publication binding.";
    }
  }

  if (!blockReason) {
    try {
      assertTikTokTransferPlanMatchesBinding({
        transferPlan: input.transferPlan,
        binding: input.intent.binding,
      });
    } catch {
      blockReason = "transfer_mismatch";
      message = "Transfer plan does not match publication render hash.";
    }
  }

  if (!blockReason && input.idempotency) {
    const idempotencyAdmission = evaluateIdempotencyAdmission({
      idempotencyKey: input.intent.idempotencyKey,
      fingerprint: input.intent.fingerprint,
      existing: input.idempotency,
    });
    if (!idempotencyAdmission.allowed) {
      blockReason = "idempotency_conflict";
      message = "Idempotency key conflicts with an existing publication intent.";
    }
  }

  return tikTokDirectPostDispatchAdmissionSchema.parse({
    schemaVersion: TIKTOK_DIRECT_POST_SCHEMA_VERSION,
    allowed: blockReason === undefined,
    ...(blockReason !== undefined ? { blockReason, message } : {}),
    correlationId: input.correlationId,
    evaluatedAt: input.evaluatedAt,
  });
}

export function planTikTokDirectPostPreparedEffect(input: {
  readonly effectId: string;
  readonly initRequest: TikTokDirectPostInitRequest;
  readonly providerCorrelation?: ProviderCorrelation;
  readonly recordedAt: string;
}): TikTokDirectPostEffectRecord {
  return tikTokDirectPostEffectRecordSchema.parse({
    schemaVersion: TIKTOK_DIRECT_POST_SCHEMA_VERSION,
    effectId: input.effectId,
    attemptId: input.initRequest.attemptId,
    intentId: input.initRequest.intentId,
    idempotencyKey: input.initRequest.idempotencyKey,
    state: "prepared",
    initRequest: input.initRequest,
    providerCorrelation: input.providerCorrelation ?? {},
    rateLimitState: "none",
    recordedAt: input.recordedAt,
    updatedAt: input.recordedAt,
  });
}

export function applyTikTokDirectPostInitResponse(input: {
  readonly effect: TikTokDirectPostEffectRecord;
  readonly initResponse: TikTokDirectPostInitResponse;
  readonly updatedAt: string;
}): TikTokDirectPostEffectRecord {
  if (input.effect.state !== "prepared" && input.effect.state !== "throttled") {
    throw new Error("TIKTOK_DIRECT_POST_EFFECT_NOT_PREPARED");
  }
  return tikTokDirectPostEffectRecordSchema.parse({
    ...input.effect,
    state: "init_dispatched",
    initResponse: input.initResponse,
    providerCorrelation: {
      ...input.effect.providerCorrelation,
      ...input.initResponse.providerCorrelation,
    },
    rateLimitState: "none",
    retryAfter: undefined,
    nextEligibleAt: undefined,
    updatedAt: input.updatedAt,
  });
}

export function applyTikTokDirectPostThrottle(input: {
  readonly effect: TikTokDirectPostEffectRecord;
  readonly throttleEvidence: TikTokDirectPostThrottleEvidence;
}): TikTokDirectPostEffectRecord {
  if (input.effect.state !== "prepared") {
    throw new Error("TIKTOK_DIRECT_POST_EFFECT_NOT_PREPARED");
  }
  return tikTokDirectPostEffectRecordSchema.parse({
    ...input.effect,
    state: "throttled",
    throttleEvidence: input.throttleEvidence,
    providerCorrelation: {
      ...input.effect.providerCorrelation,
      ...input.throttleEvidence.providerCorrelation,
    },
    rateLimitState: "throttled",
    retryAfter: input.throttleEvidence.retryAfter,
    nextEligibleAt: input.throttleEvidence.nextEligibleAt,
    updatedAt: input.throttleEvidence.recordedAt,
  });
}

export function tikTokDirectPostCapabilityAllowsDispatch(
  state: MicrodramaPublicationCapabilityState
): boolean {
  return publicationCapabilityAllowsDispatch(state);
}

export function computeTikTokDirectPostRecoveryIdentity(input: {
  readonly intentId: string;
  readonly attemptId: string;
  readonly idempotencyKey: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        intentId: input.intentId,
        attemptId: input.attemptId,
        idempotencyKey: input.idempotencyKey,
      }),
      "utf8"
    )
    .digest("hex")
    .slice(0, 32);
}

export function buildTikTokDirectPostEffectReferenceFromRecord(input: {
  readonly effect: TikTokDirectPostEffectRecord;
  readonly dispatchOutcome: TikTokDirectPostDispatchOutcome;
  readonly recordedAt: string;
}): TikTokDirectPostEffectReference {
  const initResponse = input.effect.initResponse;
  if (!initResponse) {
    throw new Error("TIKTOK_DIRECT_POST_EFFECT_MISSING_INIT_RESPONSE");
  }
  return tikTokDirectPostEffectReferenceSchema.parse({
    schemaVersion: TIKTOK_DIRECT_POST_SCHEMA_VERSION,
    effectId: input.effect.effectId,
    attemptId: input.effect.attemptId,
    intentId: input.effect.intentId,
    idempotencyKey: input.effect.idempotencyKey,
    attemptFence: input.effect.initRequest.attemptFence,
    publishId: initResponse.publishId,
    binding: input.effect.initRequest.binding,
    providerCorrelation: initResponse.providerCorrelation,
    dispatchOutcome: input.dispatchOutcome,
    recoveryIdentity: computeTikTokDirectPostRecoveryIdentity({
      intentId: input.effect.intentId,
      attemptId: input.effect.attemptId,
      idempotencyKey: input.effect.idempotencyKey,
    }),
    recordedAt: input.recordedAt,
  });
}

export function assertDirectPostEffectEligibleForReconciliation(
  effect: TikTokDirectPostEffectReference
): void {
  if (effect.dispatchOutcome !== "outcome_uncertain") {
    throw new Error("TIKTOK_DIRECT_POST_EFFECT_NOT_UNCERTAIN");
  }
}
