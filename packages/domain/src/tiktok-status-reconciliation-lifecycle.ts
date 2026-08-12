import { type TikTokDirectPostEffectReference } from "./tiktok-direct-post-contracts.js";
import {
  TIKTOK_STATUS_RECONCILIATION_SCHEMA_VERSION,
  type TikTokPublicationReceipt,
  type TikTokPublishProviderStatus,
  type TikTokStatusQueryResponse,
  type TikTokStatusRateLimitEvidence,
  type TikTokStatusReconciliationEvidence,
  type TikTokStatusReconciliationOutcome,
  tikTokPublicationReceiptSchema,
  tikTokStatusRateLimitEvidenceSchema,
  tikTokStatusReconciliationEvidenceSchema,
} from "./tiktok-status-reconciliation-contracts.js";
import { assertDirectPostEffectEligibleForReconciliation } from "./tiktok-direct-post-lifecycle.js";

export type TikTokStatusReconciliationDecision =
  | {
      readonly kind: "published";
      readonly receipt: TikTokPublicationReceipt;
      readonly evidence: TikTokStatusReconciliationEvidence;
    }
  | {
      readonly kind: "failed_known";
      readonly evidence: TikTokStatusReconciliationEvidence;
      readonly failReason: string;
    }
  | {
      readonly kind: "still_uncertain";
      readonly evidence: TikTokStatusReconciliationEvidence;
      readonly nextPollEligibleAt?: string;
    }
  | {
      readonly kind: "throttled";
      readonly evidence: TikTokStatusReconciliationEvidence;
      readonly nextEligibleAt: string;
    };

export type TikTokBoundedPollPlan = {
  readonly eligible: boolean;
  readonly pollAttempt: number;
  readonly attemptsRemaining: number;
  readonly nextPollEligibleAt?: string;
  readonly reason?: "rate_limited" | "poll_budget_exhausted" | "not_yet_due";
};

const TERMINAL_PROVIDER_STATUSES = new Set<TikTokPublishProviderStatus>([
  "PUBLISH_COMPLETE",
  "FAILED",
  "NOT_FOUND",
]);

const PROCESSING_PROVIDER_STATUSES = new Set<TikTokPublishProviderStatus>([
  "PROCESSING_UPLOAD",
  "PROCESSING_DOWNLOAD",
  "SEND_TO_USER_INBOX",
]);

export function parseRetryAfterHeader(input: {
  readonly retryAfter: string;
  readonly queriedAt: string;
}): { readonly retryAfterSeconds: number; readonly nextEligibleAt: string } {
  const queriedAtMs = Date.parse(input.queriedAt);
  if (!Number.isFinite(queriedAtMs)) {
    throw new Error("TIKTOK_RETRY_AFTER_INVALID_QUERY_TIME");
  }
  let retryAfterSeconds: number;
  if (/^[0-9]+$/u.test(input.retryAfter)) {
    retryAfterSeconds = Number(input.retryAfter);
  } else {
    const retryAtMs = Date.parse(input.retryAfter);
    if (!Number.isFinite(retryAtMs)) {
      throw new Error("TIKTOK_RETRY_AFTER_UNPARSEABLE");
    }
    retryAfterSeconds = Math.max(0, Math.ceil((retryAtMs - queriedAtMs) / 1_000));
  }
  return {
    retryAfterSeconds,
    nextEligibleAt: new Date(queriedAtMs + retryAfterSeconds * 1_000).toISOString(),
  };
}

export function buildStatusRateLimitEvidence(input: {
  readonly retryAfter?: string;
  readonly retryAfterSeconds?: number;
  readonly queriedAt: string;
}): TikTokStatusRateLimitEvidence {
  if (input.retryAfter !== undefined) {
    const parsed = parseRetryAfterHeader({
      retryAfter: input.retryAfter,
      queriedAt: input.queriedAt,
    });
    return tikTokStatusRateLimitEvidenceSchema.parse({
      schemaVersion: TIKTOK_STATUS_RECONCILIATION_SCHEMA_VERSION,
      rateLimitState: "throttled",
      retryAfterSeconds: parsed.retryAfterSeconds,
      retryAfter: parsed.nextEligibleAt,
      nextEligibleAt: parsed.nextEligibleAt,
      recordedAt: input.queriedAt,
    });
  }
  const retryAfterSeconds = input.retryAfterSeconds ?? 0;
  const queriedAtMs = Date.parse(input.queriedAt);
  const nextEligibleAt = new Date(
    queriedAtMs + retryAfterSeconds * 1_000
  ).toISOString();
  return tikTokStatusRateLimitEvidenceSchema.parse({
    schemaVersion: TIKTOK_STATUS_RECONCILIATION_SCHEMA_VERSION,
    rateLimitState: retryAfterSeconds > 0 ? "throttled" : "none",
    retryAfterSeconds,
    ...(retryAfterSeconds > 0
      ? { retryAfter: nextEligibleAt, nextEligibleAt }
      : {}),
    recordedAt: input.queriedAt,
  });
}

export function isStatusQueryEligible(input: {
  readonly now: string;
  readonly nextEligibleAt?: string;
}): boolean {
  if (!input.nextEligibleAt) {
    return true;
  }
  return Date.parse(input.now) >= Date.parse(input.nextEligibleAt);
}

export function mapProviderPublishStatus(
  status: TikTokPublishProviderStatus
): "pending" | "succeeded" | "failed_known" | "outcome_uncertain" {
  if (status === "PUBLISH_COMPLETE") {
    return "succeeded";
  }
  if (status === "FAILED" || status === "NOT_FOUND") {
    return "failed_known";
  }
  if (PROCESSING_PROVIDER_STATUSES.has(status)) {
    return "pending";
  }
  return "outcome_uncertain";
}

export function validateReceiptBinding(input: {
  readonly effect: TikTokDirectPostEffectReference;
  readonly response: TikTokStatusQueryResponse;
}): TikTokStatusReconciliationOutcome {
  if (input.response.publishId !== input.effect.publishId) {
    return "no_match";
  }
  if (
    input.response.providerCorrelation.correlationId &&
    input.effect.providerCorrelation.correlationId &&
    input.response.providerCorrelation.correlationId !==
      input.effect.providerCorrelation.correlationId
  ) {
    return "no_match";
  }
  if (TERMINAL_PROVIDER_STATUSES.has(input.response.providerStatus)) {
    return "matched";
  }
  return "pending";
}

export function buildPublicationReceipt(input: {
  readonly effect: TikTokDirectPostEffectReference;
  readonly response: TikTokStatusQueryResponse;
  readonly reconciledAt: string;
}): TikTokPublicationReceipt | null {
  if (
    input.response.providerStatus !== "PUBLISH_COMPLETE" ||
    !input.response.publicVideoId
  ) {
    return null;
  }
  const bindingOutcome = validateReceiptBinding({
    effect: input.effect,
    response: input.response,
  });
  if (bindingOutcome !== "matched") {
    return null;
  }
  return tikTokPublicationReceiptSchema.parse({
    schemaVersion: TIKTOK_STATUS_RECONCILIATION_SCHEMA_VERSION,
    publishId: input.effect.publishId,
    publicVideoId: input.response.publicVideoId,
    providerAccountId: input.effect.binding.providerAccountId,
    recoveryIdentity: input.effect.recoveryIdentity,
    renderHash: input.effect.binding.renderHash,
    metadataRevisionId: input.effect.binding.metadataRevisionId,
    providerCorrelation: {
      ...input.effect.providerCorrelation,
      ...input.response.providerCorrelation,
    },
    reconciledAt: input.reconciledAt,
  });
}

export function planBoundedStatusPoll(input: {
  readonly now: string;
  readonly pollAttempt: number;
  readonly maxPollAttempts: number;
  readonly nextEligibleAt?: string;
  readonly pollIntervalSeconds?: number;
}): TikTokBoundedPollPlan {
  const pollIntervalSeconds = input.pollIntervalSeconds ?? 30;
  if (input.pollAttempt >= input.maxPollAttempts) {
    return {
      eligible: false,
      pollAttempt: input.pollAttempt,
      attemptsRemaining: 0,
      reason: "poll_budget_exhausted",
    };
  }
  if (!isStatusQueryEligible({ now: input.now, nextEligibleAt: input.nextEligibleAt })) {
    return {
      eligible: false,
      pollAttempt: input.pollAttempt,
      attemptsRemaining: input.maxPollAttempts - input.pollAttempt,
      nextPollEligibleAt: input.nextEligibleAt,
      reason: "rate_limited",
    };
  }
  const nextPollEligibleAt = new Date(
    Date.parse(input.now) + pollIntervalSeconds * 1_000
  ).toISOString();
  return {
    eligible: true,
    pollAttempt: input.pollAttempt,
    attemptsRemaining: input.maxPollAttempts - input.pollAttempt - 1,
    nextPollEligibleAt,
  };
}

export function reconcileTikTokAmbiguousEffect(input: {
  readonly effect: TikTokDirectPostEffectReference;
  readonly response: TikTokStatusQueryResponse;
  readonly pollAttempt: number;
  readonly maxPollAttempts: number;
  readonly reconciledAt: string;
  readonly pollIntervalSeconds?: number;
}): TikTokStatusReconciliationDecision {
  assertDirectPostEffectEligibleForReconciliation(input.effect);

  const rateLimit = input.response.rateLimit;
  if (
    rateLimit &&
    rateLimit.rateLimitState !== "none" &&
    rateLimit.nextEligibleAt &&
    !isStatusQueryEligible({
      now: input.reconciledAt,
      nextEligibleAt: rateLimit.nextEligibleAt,
    })
  ) {
    const evidence = tikTokStatusReconciliationEvidenceSchema.parse({
      schemaVersion: TIKTOK_STATUS_RECONCILIATION_SCHEMA_VERSION,
      effectReference: input.effect,
      reconciliationOutcome: "provider_unavailable",
      providerStatus: input.response.providerStatus,
      rateLimit,
      pollAttempt: input.pollAttempt,
      nextPollEligibleAt: rateLimit.nextEligibleAt,
      recordedAt: input.reconciledAt,
    });
    return {
      kind: "throttled",
      evidence,
      nextEligibleAt: rateLimit.nextEligibleAt,
    };
  }

  const mapped = mapProviderPublishStatus(input.response.providerStatus);
  const bindingOutcome = validateReceiptBinding({
    effect: input.effect,
    response: input.response,
  });

  if (mapped === "succeeded") {
    const receipt = buildPublicationReceipt({
      effect: input.effect,
      response: input.response,
      reconciledAt: input.reconciledAt,
    });
    const evidence = tikTokStatusReconciliationEvidenceSchema.parse({
      schemaVersion: TIKTOK_STATUS_RECONCILIATION_SCHEMA_VERSION,
      effectReference: input.effect,
      reconciliationOutcome: receipt ? "matched" : bindingOutcome,
      providerStatus: input.response.providerStatus,
      rateLimit,
      receipt: receipt ?? undefined,
      pollAttempt: input.pollAttempt,
      recordedAt: input.reconciledAt,
    });
    if (receipt) {
      return { kind: "published", receipt, evidence };
    }
    return {
      kind: "still_uncertain",
      evidence,
    };
  }

  if (mapped === "failed_known") {
    const evidence = tikTokStatusReconciliationEvidenceSchema.parse({
      schemaVersion: TIKTOK_STATUS_RECONCILIATION_SCHEMA_VERSION,
      effectReference: input.effect,
      reconciliationOutcome:
        bindingOutcome === "matched" ? "matched" : "no_match",
      providerStatus: input.response.providerStatus,
      rateLimit,
      pollAttempt: input.pollAttempt,
      recordedAt: input.reconciledAt,
    });
    return {
      kind: "failed_known",
      evidence,
      failReason: input.response.failReason ?? input.response.providerStatus,
    };
  }

  const pollPlan = planBoundedStatusPoll({
    now: input.reconciledAt,
    pollAttempt: input.pollAttempt,
    maxPollAttempts: input.maxPollAttempts,
    nextEligibleAt: rateLimit?.nextEligibleAt,
    pollIntervalSeconds: input.pollIntervalSeconds,
  });

  const evidence = tikTokStatusReconciliationEvidenceSchema.parse({
    schemaVersion: TIKTOK_STATUS_RECONCILIATION_SCHEMA_VERSION,
    effectReference: input.effect,
    reconciliationOutcome: "pending",
    providerStatus: input.response.providerStatus,
    rateLimit,
    pollAttempt: input.pollAttempt,
    nextPollEligibleAt: pollPlan.nextPollEligibleAt,
    recordedAt: input.reconciledAt,
  });

  return {
    kind: "still_uncertain",
    evidence,
    nextPollEligibleAt: pollPlan.nextPollEligibleAt,
  };
}

export function assertReconciliationDoesNotCreateNewAttempt(input: {
  readonly existingEffect: TikTokDirectPostEffectReference;
  readonly reconciledEffect: TikTokDirectPostEffectReference;
}): void {
  if (
    input.existingEffect.attemptId !== input.reconciledEffect.attemptId ||
    input.existingEffect.idempotencyKey !== input.reconciledEffect.idempotencyKey ||
    input.existingEffect.attemptFence !== input.reconciledEffect.attemptFence
  ) {
    throw new Error("TIKTOK_RECONCILIATION_ATTEMPT_IDENTITY_CHANGED");
  }
}

export function mergeReconciliationEvidence(
  previous: TikTokStatusReconciliationEvidence | null,
  next: TikTokStatusReconciliationEvidence
): TikTokStatusReconciliationEvidence {
  if (!previous) {
    return next;
  }
  if (
    previous.effectReference.effectId !== next.effectReference.effectId ||
    previous.effectReference.recoveryIdentity !==
      next.effectReference.recoveryIdentity
  ) {
    throw new Error("TIKTOK_RECONCILIATION_EVIDENCE_MISMATCH");
  }
  return tikTokStatusReconciliationEvidenceSchema.parse({
    ...next,
    pollAttempt: Math.max(previous.pollAttempt, next.pollAttempt),
  });
}
