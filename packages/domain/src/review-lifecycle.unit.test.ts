import { describe, expect, it } from "vitest";

import {
  evaluateApprovalValidity,
  evaluateChallengeActionability,
  evaluateDecisionRationale,
  evaluateOverrideAdmission,
  evaluateReviewRequired,
  evaluateReviewerSeparation,
  isActionableQueueItem,
} from "./review-lifecycle.js";

const now = "2026-08-09T12:00:00.000Z";
const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

describe("review lifecycle", () => {
  it("allows approve without rationale and requires it for reject and request-changes", () => {
    expect(
      evaluateDecisionRationale({ decision: "approved", reason: undefined })
    ).toEqual({ allowed: true });
    expect(
      evaluateDecisionRationale({
        decision: "rejected",
        reason: undefined,
      }).allowed
    ).toBe(false);
    expect(
      evaluateDecisionRationale({
        decision: "request_changes",
        reason: "needs edits",
      }).allowed
    ).toBe(true);
  });

  it("blocks producer self-review when separation is required", () => {
    expect(
      evaluateReviewerSeparation({
        producerPrincipalId: "producer-1",
        reviewerPrincipalId: "producer-1",
        requireSeparation: true,
      }).code
    ).toBe("reviewer_separation_required");
    expect(
      evaluateReviewerSeparation({
        producerPrincipalId: "producer-1",
        reviewerPrincipalId: "reviewer-1",
        requireSeparation: true,
      }).allowed
    ).toBe(true);
  });

  it("classifies expired and consumed challenges", () => {
    expect(
      evaluateChallengeActionability({
        consumedAt: null,
        expiresAt: "2026-08-09T13:00:00.000Z",
        now,
      })
    ).toBe("actionable");
    expect(
      evaluateChallengeActionability({
        consumedAt: null,
        expiresAt: "2026-08-09T11:00:00.000Z",
        now,
      })
    ).toBe("expired");
    expect(
      evaluateChallengeActionability({
        consumedAt: now,
        expiresAt: "2026-08-09T13:00:00.000Z",
        now,
      })
    ).toBe("consumed");
  });

  it("projects stale approval validity when artifact hash changes", () => {
    const validity = evaluateApprovalValidity({
      boundArtifactHash: hashA,
      currentArtifactHash: hashB,
      now,
    });
    expect(validity.status).toBe("stale");
    expect(validity.reason).toBe("artifact_hash_changed");
  });

  it("blocks override for high-risk and publish gates", () => {
    expect(
      evaluateOverrideAdmission({
        isOverride: true,
        highRisk: true,
      }).code
    ).toBe("high_risk_non_overridable");
    expect(
      evaluateOverrideAdmission({
        isOverride: true,
        gate: "publish",
      }).code
    ).toBe("gate_non_overridable");
  });

  it("requires manual review profiles for submission", () => {
    expect(evaluateReviewRequired({ approvalMode: "automatic" }).allowed).toBe(
      false
    );
    expect(evaluateReviewRequired({ approvalMode: "required" }).allowed).toBe(
      true
    );
  });

  it("filters queue items to actionable validity only", () => {
    expect(isActionableQueueItem("actionable")).toBe(true);
    expect(isActionableQueueItem("expired")).toBe(false);
  });
});
