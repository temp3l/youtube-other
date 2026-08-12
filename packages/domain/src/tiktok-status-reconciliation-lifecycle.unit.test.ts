import { describe, expect, it } from "vitest";

import {
  buildTikTokDirectPostEffectReference,
  computeTikTokDirectPostRecoveryIdentity,
} from "./tiktok-direct-post-lifecycle.js";
import type { TikTokDirectPostInitRequest } from "./tiktok-direct-post-contracts.js";
import {
  buildStatusRateLimitEvidence,
  isStatusQueryEligible,
  mapProviderPublishStatus,
  mergeReconciliationEvidence,
  parseRetryAfterHeader,
  planBoundedStatusPoll,
  reconcileTikTokAmbiguousEffect,
} from "./tiktok-status-reconciliation-lifecycle.js";

const QUERIED_AT = "2026-08-12T10:00:00.000Z";

const binding = {
  provider: "tiktok" as const,
  providerAccountId: "tiktok.account.en-us",
  credentialVersion: "cred.v1",
  episodeId: "episode.e001",
  episodeRevisionId: "episode.e001.rev1",
  locale: "en-US",
  renderHash: "a".repeat(64),
  metadataRevisionId: "metadata.rev1",
  consentRevisionId: "consent.rev1",
  exportApprovalRevisionId: "export.rev1",
  privacy: "private" as const,
  interactionSettings: {
    allowComments: false,
    allowDuet: false,
    allowStitch: false,
  },
  aiContentDeclared: true,
  commercialContentDeclared: false,
};

const initRequest: TikTokDirectPostInitRequest = {
  schemaVersion: "mediaforge.tiktok-direct-post.v1",
  attemptId: "attempt.001",
  intentId: "intent.001",
  idempotencyKey: "idempotency.001",
  attemptFence: 1,
  binding,
  metadataRevisionId: "metadata.rev1",
  requestedAt: QUERIED_AT,
};

function uncertainEffect() {
  return buildTikTokDirectPostEffectReference({
    effectId: "effect.001",
    initRequest,
    initResponse: {
      schemaVersion: "mediaforge.tiktok-direct-post.v1",
      publishId: "publish.001",
      providerCorrelation: {
        requestId: "provider.request.001",
        correlationId: "provider.correlation.001",
      },
      initializedAt: QUERIED_AT,
    },
    dispatchOutcome: "outcome_uncertain",
    recordedAt: QUERIED_AT,
  });
}

describe("tiktok direct post lifecycle", () => {
  it("computes stable recovery identities for reconciliation", () => {
    const identity = computeTikTokDirectPostRecoveryIdentity({
      intentId: "intent.001",
      attemptId: "attempt.001",
      idempotencyKey: "idempotency.001",
    });
    expect(identity).toHaveLength(32);
    expect(identity).toMatch(/^[a-f0-9]{32}$/u);
  });
});

describe("tiktok status reconciliation lifecycle", () => {
  it("parses Retry-After seconds and http-date values into next-eligible instants", () => {
    expect(
      parseRetryAfterHeader({
        retryAfter: "30",
        queriedAt: QUERIED_AT,
      })
    ).toEqual({
      retryAfterSeconds: 30,
      nextEligibleAt: "2026-08-12T10:00:30.000Z",
    });

    expect(
      parseRetryAfterHeader({
        retryAfter: "2026-08-12T10:02:00.000Z",
        queriedAt: QUERIED_AT,
      })
    ).toEqual({
      retryAfterSeconds: 120,
      nextEligibleAt: "2026-08-12T10:02:00.000Z",
    });
  });

  it("maps provider statuses without treating ambiguity as a new attempt", () => {
    expect(mapProviderPublishStatus("PROCESSING_UPLOAD")).toBe("pending");
    expect(mapProviderPublishStatus("PUBLISH_COMPLETE")).toBe("succeeded");
    expect(mapProviderPublishStatus("FAILED")).toBe("failed_known");
  });

  it("schedules bounded read-only recovery when rate limited", () => {
    const rateLimit = buildStatusRateLimitEvidence({
      retryAfter: "45",
      queriedAt: QUERIED_AT,
    });
    expect(rateLimit.nextEligibleAt).toBe("2026-08-12T10:00:45.000Z");
    expect(
      isStatusQueryEligible({
        now: "2026-08-12T10:00:30.000Z",
        nextEligibleAt: rateLimit.nextEligibleAt,
      })
    ).toBe(false);
    expect(
      planBoundedStatusPoll({
        now: "2026-08-12T10:00:30.000Z",
        pollAttempt: 1,
        maxPollAttempts: 5,
        nextEligibleAt: rateLimit.nextEligibleAt,
      })
    ).toMatchObject({
      eligible: false,
      reason: "rate_limited",
    });
  });

  it("reconciles publish-complete receipts idempotently with full binding evidence", () => {
    const effect = uncertainEffect();
    const decision = reconcileTikTokAmbiguousEffect({
      effect,
      response: {
        schemaVersion: "mediaforge.tiktok-status-reconciliation.v1",
        publishId: "publish.001",
        providerStatus: "PUBLISH_COMPLETE",
        providerCorrelation: {
          responseId: "provider.response.001",
        },
        publicVideoId: "video.001",
        queriedAt: QUERIED_AT,
      },
      pollAttempt: 1,
      maxPollAttempts: 5,
      reconciledAt: QUERIED_AT,
    });

    expect(decision.kind).toBe("published");
    if (decision.kind !== "published") {
      throw new Error("expected published decision");
    }
    expect(decision.receipt).toMatchObject({
      publishId: "publish.001",
      publicVideoId: "video.001",
      providerAccountId: binding.providerAccountId,
      recoveryIdentity: effect.recoveryIdentity,
      renderHash: binding.renderHash,
      metadataRevisionId: binding.metadataRevisionId,
    });
    expect(decision.evidence.reconciliationOutcome).toBe("matched");
  });

  it("keeps ambiguous outcomes read-only while provider processing continues", () => {
    const effect = uncertainEffect();
    const decision = reconcileTikTokAmbiguousEffect({
      effect,
      response: {
        schemaVersion: "mediaforge.tiktok-status-reconciliation.v1",
        publishId: "publish.001",
        providerStatus: "PROCESSING_UPLOAD",
        providerCorrelation: {},
        queriedAt: QUERIED_AT,
      },
      pollAttempt: 2,
      maxPollAttempts: 5,
      reconciledAt: QUERIED_AT,
    });

    expect(decision.kind).toBe("still_uncertain");
    if (decision.kind !== "still_uncertain") {
      throw new Error("expected still_uncertain decision");
    }
    expect(decision.evidence.reconciliationOutcome).toBe("pending");
    expect(decision.nextPollEligibleAt).toBe("2026-08-12T10:00:30.000Z");
  });

  it("merges reconciliation evidence without changing attempt identity", () => {
    const effect = uncertainEffect();
    const first = reconcileTikTokAmbiguousEffect({
      effect,
      response: {
        schemaVersion: "mediaforge.tiktok-status-reconciliation.v1",
        publishId: "publish.001",
        providerStatus: "PROCESSING_UPLOAD",
        providerCorrelation: {},
        queriedAt: QUERIED_AT,
      },
      pollAttempt: 1,
      maxPollAttempts: 5,
      reconciledAt: QUERIED_AT,
    });
    const second = reconcileTikTokAmbiguousEffect({
      effect,
      response: {
        schemaVersion: "mediaforge.tiktok-status-reconciliation.v1",
        publishId: "publish.001",
        providerStatus: "PUBLISH_COMPLETE",
        providerCorrelation: { responseId: "provider.response.002" },
        publicVideoId: "video.001",
        queriedAt: "2026-08-12T10:01:00.000Z",
      },
      pollAttempt: 2,
      maxPollAttempts: 5,
      reconciledAt: "2026-08-12T10:01:00.000Z",
    });
    const merged = mergeReconciliationEvidence(
      first.kind === "still_uncertain" ? first.evidence : null,
      second.kind === "published" ? second.evidence : second.evidence
    );
    expect(merged.pollAttempt).toBe(2);
    expect(merged.effectReference.attemptId).toBe(effect.attemptId);
  });
});
