import {
  REVIEW_LIFECYCLE_SCHEMA_VERSION,
  approvalDecisionSchema,
  approvalHistoryEntrySchema,
  reviewQueueItemSchema,
  reviewValidityRecordSchema,
  reviewValidityStatusSchema,
  type ApprovalDecision,
  type ReviewValidityStatus,
} from "./review-lifecycle-contracts.js";

export function evaluateDecisionRationale(input: {
  readonly decision: ApprovalDecision;
  readonly reason?: string | undefined;
  readonly isOverride?: boolean | undefined;
}): { readonly allowed: boolean; readonly code?: string; readonly message?: string } {
  const parsed = approvalDecisionSchema.parse(input.decision);
  if (parsed === "approved" && !input.isOverride) return { allowed: true };
  if (!input.reason || input.reason.trim().length === 0)
    return {
      allowed: false,
      code: "rationale_required",
      message: "Reject, request-changes, and override decisions require rationale.",
    };
  return { allowed: true };
}

export const NON_OVERRIDABLE_APPROVAL_GATES = ["publish"] as const;

export function evaluateReviewRequired(input: {
  readonly approvalMode: "required" | "automatic";
}): { readonly allowed: boolean; readonly code?: string; readonly message?: string } {
  if (input.approvalMode === "automatic")
    return {
      allowed: false,
      code: "review_not_required",
      message: "This profile does not require manual review submission.",
    };
  return { allowed: true };
}

export function evaluateOverrideAdmission(input: {
  readonly isOverride: boolean;
  readonly highRisk?: boolean;
  readonly gate?: string;
}): { readonly allowed: boolean; readonly code?: string; readonly message?: string } {
  if (!input.isOverride) return { allowed: true };
  if (input.highRisk)
    return {
      allowed: false,
      code: "high_risk_non_overridable",
      message: "High-risk approvals cannot be overridden.",
    };
  if (
    input.gate &&
    NON_OVERRIDABLE_APPROVAL_GATES.includes(
      input.gate as (typeof NON_OVERRIDABLE_APPROVAL_GATES)[number]
    )
  )
    return {
      allowed: false,
      code: "gate_non_overridable",
      message: "Publish safety gates cannot be overridden.",
    };
  return { allowed: true };
}

export function evaluateReviewerSeparation(input: {
  readonly producerPrincipalId: string;
  readonly reviewerPrincipalId: string;
  readonly requireSeparation: boolean;
}): { readonly allowed: boolean; readonly code?: string; readonly message?: string } {
  if (
    input.requireSeparation &&
    input.producerPrincipalId === input.reviewerPrincipalId
  )
    return {
      allowed: false,
      code: "reviewer_separation_required",
      message: "Producers cannot review their own submission for this profile.",
    };
  return { allowed: true };
}

export function evaluateChallengeActionability(input: {
  readonly consumedAt: string | null;
  readonly expiresAt: string;
  readonly now: string;
}): ReviewValidityStatus {
  if (input.consumedAt) return "consumed";
  if (Date.parse(input.expiresAt) <= Date.parse(input.now)) return "expired";
  return "actionable";
}

export function evaluateApprovalValidity(input: {
  readonly boundArtifactHash: string;
  readonly currentArtifactHash?: string;
  readonly revokedAt?: string | null;
  readonly expiresAt?: string | null;
  readonly now: string;
}): ReturnType<typeof reviewValidityRecordSchema.parse> {
  if (input.revokedAt)
    return reviewValidityRecordSchema.parse({
      status: "historical",
      reason: "approval_revoked",
    });
  if (
    input.expiresAt &&
    Number.isFinite(Date.parse(input.expiresAt)) &&
    Date.parse(input.expiresAt) <= Date.parse(input.now)
  )
    return reviewValidityRecordSchema.parse({
      status: "expired",
      reason: "approval_expired",
      boundArtifactHash: input.boundArtifactHash,
    });
  if (
    input.currentArtifactHash &&
    input.currentArtifactHash !== input.boundArtifactHash
  )
    return reviewValidityRecordSchema.parse({
      status: "stale",
      reason: "artifact_hash_changed",
      boundArtifactHash: input.boundArtifactHash,
      currentArtifactHash: input.currentArtifactHash,
    });
  return reviewValidityRecordSchema.parse({
    status: "actionable",
    boundArtifactHash: input.boundArtifactHash,
    ...(input.currentArtifactHash
      ? { currentArtifactHash: input.currentArtifactHash }
      : {}),
  });
}

export function projectReviewQueueItem(input: {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly challengeId: string;
  readonly subjectId: string;
  readonly subjectRevision: number;
  readonly artifactHash: string;
  readonly expiresAt: string;
  readonly consumedAt: string | null;
  readonly claimedByPrincipalId?: string;
  readonly createdAt: string;
  readonly now: string;
}): ReturnType<typeof reviewQueueItemSchema.parse> {
  const validity = evaluateChallengeActionability({
    consumedAt: input.consumedAt,
    expiresAt: input.expiresAt,
    now: input.now,
  });
  return reviewQueueItemSchema.parse({
    schemaVersion: REVIEW_LIFECYCLE_SCHEMA_VERSION,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    episodeId: input.episodeId,
    challengeId: input.challengeId,
    subjectId: input.subjectId,
    subjectRevision: input.subjectRevision,
    artifactHash: input.artifactHash,
    expiresAt: input.expiresAt,
    validity,
    ...(input.claimedByPrincipalId
      ? { claimedByPrincipalId: input.claimedByPrincipalId }
      : {}),
    createdAt: input.createdAt,
  });
}

export function projectApprovalHistoryEntry(input: {
  readonly approvalId: string;
  readonly runId: string;
  readonly episodeId?: string;
  readonly decision: ApprovalDecision;
  readonly state: "active" | "rejected" | "revoked";
  readonly artifactHash: string;
  readonly subjectRevision: number;
  readonly reason?: string;
  readonly revokedAt?: string | null;
  readonly createdAt: string;
  readonly currentValidity?: ReviewValidityStatus;
}): ReturnType<typeof approvalHistoryEntrySchema.parse> {
  return approvalHistoryEntrySchema.parse({
    schemaVersion: REVIEW_LIFECYCLE_SCHEMA_VERSION,
    approvalId: input.approvalId,
    runId: input.runId,
    ...(input.episodeId ? { episodeId: input.episodeId } : {}),
    decision: input.decision,
    state: input.state,
    artifactHash: input.artifactHash,
    subjectRevision: input.subjectRevision,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.revokedAt ? { revokedAt: input.revokedAt } : {}),
    createdAt: input.createdAt,
    ...(input.currentValidity ? { currentValidity: input.currentValidity } : {}),
  });
}

export function isActionableQueueItem(
  validity: ReviewValidityStatus
): boolean {
  return validity === "actionable";
}
