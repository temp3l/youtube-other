import crypto from "node:crypto";

import {
  ApplicationError,
  type AuthenticatedPrincipal,
} from "@mediaforge/application";
import {
  assertWorkspaceAdminAccess,
  approvalChallengeSubmitInputSchema,
  evaluateApprovalValidity,
  evaluateChallengeActionability,
  evaluateDecisionRationale,
  evaluateOverrideAdmission,
  evaluateReviewRequired,
  evaluateReviewerSeparation,
  isActionableQueueItem,
  projectApprovalHistoryEntry,
  projectReviewQueueItem,
  reviewValidityRecordSchema,
} from "@mediaforge/domain";
import {
  PostgresReviewRepository,
  PostgresWorkflowRepository,
  WorkflowStateTransitionError,
  type PostgresPool,
} from "@mediaforge/persistence";

import {
  type ApprovalInput,
  type ApprovalRevocationInput,
} from "./contract.js";
import type { ApiRequestContext } from "./http-server.js";

function digest(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parseEtag(value: string | undefined): number {
  const match = value?.match(/^W\/"(\d+)"$/u) ?? value?.match(/^"(\d+)"$/u);
  if (!match) throw new ApplicationError("precondition_required", "If-Match is required.", false);
  const revision = Number(match[1]);
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw new ApplicationError("precondition_failed", "If-Match revision is invalid.", false);
  return revision;
}

function assertDecide(principal: AuthenticatedPrincipal): void {
  if (!principal.permissions.includes("approval.decide"))
    throw new ApplicationError(
      "authorization_denied",
      "Approval decisions require approval.decide.",
      false
    );
}

function assertWrite(principal: AuthenticatedPrincipal): void {
  if (!principal.permissions.includes("content.write"))
    throw new ApplicationError(
      "authorization_denied",
      "Review submission requires content.write.",
      false
    );
}

function assertAdmin(principal: AuthenticatedPrincipal): boolean {
  try {
    assertWorkspaceAdminAccess(principal.permissions);
    return true;
  } catch {
    return false;
  }
}

function timestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function createApiReviewUseCases(input: {
  readonly pool: PostgresPool;
  readonly now?: () => Date;
  readonly createId?: (prefix: string) => string;
}) {
  const review = new PostgresReviewRepository(input.pool);
  const workflow = new PostgresWorkflowRepository(input.pool);
  const now = input.now ?? (() => new Date());
  const createId =
    input.createId ??
    ((prefix: string) => `${prefix}-${crypto.randomUUID().replace(/-/gu, "")}`);

  async function ensureSchema(): Promise<void> {
    await review.ensureSchema();
  }

  return {
    listReviewQueue: async (
      context: Required<
        Pick<ApiRequestContext, "workspaceId" | "projectId" | "principal" | "requestId">
      >
    ) => {
      assertDecide(context.principal);
      await ensureSchema();
      const evaluatedAt = now().toISOString();
      const rows = await review.listReviewQueue({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        now: evaluatedAt,
      });
      const items = rows
        .map((row) =>
          projectReviewQueueItem({
            workspaceId: row.workspace_id,
            projectId: row.project_id,
            episodeId: row.episode_id,
            challengeId: row.challenge_id,
            subjectId: row.subject_id,
            subjectRevision: Number(row.subject_revision),
            artifactHash: row.artifact_hash,
            expiresAt: timestamp(row.expires_at),
            consumedAt: row.consumed_at ? timestamp(row.consumed_at) : null,
            ...(row.claimed_by_principal_id
              ? { claimedByPrincipalId: row.claimed_by_principal_id }
              : {}),
            createdAt: timestamp(row.created_at),
            now: evaluatedAt,
          })
        )
        .filter((item) => isActionableQueueItem(item.validity));
      return { items };
    },

    submitApprovalChallenge: async (
      body: unknown,
      context: Required<
        Pick<
          ApiRequestContext,
          "workspaceId" | "projectId" | "principal" | "requestId" | "idempotencyKey"
        >
      >
    ) => {
      assertWrite(context.principal);
      await ensureSchema();
      const parsed = approvalChallengeSubmitInputSchema.parse(body);
      const approvalMode = await review.getProjectApprovalMode({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
      });
      const reviewRequired = evaluateReviewRequired({ approvalMode });
      if (!reviewRequired.allowed)
        throw new ApplicationError(
          "precondition_failed",
          reviewRequired.message ?? "Review is not required for this profile.",
          false
        );
      const evaluatedAt = now().toISOString();
      const challengeId = createId("approval-challenge");
      const record = await workflow.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) =>
          transaction.createApprovalChallenge({
            workspaceId: context.workspaceId,
            projectId: context.projectId,
            challengeId,
            runId: parsed.runId,
            expectedRevision: parsed.expectedRevision,
            artifactHash: parsed.artifactHash,
            expiresAt: parsed.expiresAt,
            now: evaluatedAt,
          })
      );
      await review.insertChallengeMetadata({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        challengeId: record.challengeId,
        submittedByPrincipalId: context.principal.principalId,
        now: evaluatedAt,
      });
      return {
        id: record.challengeId,
        subjectId: record.subjectId,
        subjectRevision: record.subjectRevision,
        artifactHash: record.artifactHash,
        expiresAt: record.expiresAt,
        consumedAt: record.consumedAt,
      };
    },

    claimApprovalChallenge: async (
      challengeId: string,
      context: Required<
        Pick<ApiRequestContext, "workspaceId" | "projectId" | "principal" | "requestId">
      >
    ) => {
      assertDecide(context.principal);
      await ensureSchema();
      const evaluatedAt = now().toISOString();
      const metadata = await review.getChallengeMetadata({
        workspaceId: context.workspaceId,
        challengeId,
      });
      if (!metadata)
        throw new ApplicationError("not_found", "Approval challenge not found.", false);
      const separation = evaluateReviewerSeparation({
        producerPrincipalId: metadata.submittedByPrincipalId,
        reviewerPrincipalId: context.principal.principalId,
        requireSeparation: true,
      });
      if (!separation.allowed)
        throw new ApplicationError(
          "authorization_denied",
          separation.message ?? "Reviewer separation is required.",
          false
        );
      const row = await review.claimChallenge({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        challengeId,
        principalId: context.principal.principalId,
        now: evaluatedAt,
      });
      if (!row)
        throw new ApplicationError(
          "conflict",
          "Approval challenge is expired, consumed, or claimed by another reviewer.",
          false
        );
      return projectReviewQueueItem({
        workspaceId: row.workspace_id,
        projectId: row.project_id,
        episodeId: row.episode_id,
        challengeId: row.challenge_id,
        subjectId: row.subject_id,
        subjectRevision: Number(row.subject_revision),
        artifactHash: row.artifact_hash,
        expiresAt: timestamp(row.expires_at),
        consumedAt: row.consumed_at ? timestamp(row.consumed_at) : null,
        claimedByPrincipalId: row.claimed_by_principal_id ?? context.principal.principalId,
        createdAt: timestamp(row.created_at),
        now: evaluatedAt,
      });
    },

    listApprovalHistory: async (
      runId: string | undefined,
      context: Required<
        Pick<ApiRequestContext, "workspaceId" | "projectId" | "principal" | "requestId">
      >
    ) => {
      assertDecide(context.principal);
      await ensureSchema();
      const evaluatedAt = now().toISOString();
      const rows = await review.listApprovalHistory({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        ...(runId ? { runId } : {}),
      });
      const items = rows.map((row) => {
        const currentRevision = row.current_run_revision
          ? Number(row.current_run_revision)
          : Number(row.subject_revision);
        const currentHash =
          currentRevision > Number(row.subject_revision)
            ? row.current_artifact_hash ?? row.artifact_hash
            : row.artifact_hash;
        const validity = evaluateApprovalValidity({
          boundArtifactHash: row.artifact_hash,
          currentArtifactHash: currentHash,
          revokedAt: row.revoked_at ? timestamp(row.revoked_at) : null,
          now: evaluatedAt,
        });
        return projectApprovalHistoryEntry({
          approvalId: row.approval_id,
          runId: row.run_id,
          ...(row.episode_id ? { episodeId: row.episode_id } : {}),
          decision: row.decision as ApprovalInput["decision"],
          state: row.state as "active" | "rejected" | "revoked",
          artifactHash: row.artifact_hash,
          subjectRevision: Number(row.subject_revision),
          ...(row.decision_reason ? { reason: row.decision_reason } : {}),
          revokedAt: row.revoked_at ? timestamp(row.revoked_at) : null,
          createdAt: timestamp(row.created_at),
          currentValidity: validity.status,
        });
      });
      return { items };
    },

    getApprovalValidity: async (
      approvalId: string,
      context: Required<
        Pick<ApiRequestContext, "workspaceId" | "projectId" | "principal" | "requestId">
      >
    ) => {
      assertDecide(context.principal);
      await ensureSchema();
      const evaluatedAt = now().toISOString();
      const row = await review.getApprovalValidityContext({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        approvalId,
      });
      if (!row)
        throw new ApplicationError("not_found", "Approval not found.", false);
      const currentRevision = row.current_run_revision
        ? Number(row.current_run_revision)
        : Number(row.subject_revision);
      const currentHash =
        currentRevision > Number(row.subject_revision)
          ? row.current_artifact_hash ?? undefined
          : row.artifact_hash;
      const validity = evaluateApprovalValidity({
        boundArtifactHash: row.artifact_hash,
        ...(currentHash ? { currentArtifactHash: currentHash } : {}),
        revokedAt: row.revoked_at ? timestamp(row.revoked_at) : null,
        now: evaluatedAt,
      });
      return reviewValidityRecordSchema.parse(validity);
    },

    recordApproval: async (
      approval: ApprovalInput,
      context: Required<
        Pick<
          ApiRequestContext,
          | "workspaceId"
          | "projectId"
          | "principal"
          | "requestId"
          | "idempotencyKey"
          | "ifMatch"
        >
      >
    ) => {
      assertDecide(context.principal);
      const isOverride = approval.override === true && assertAdmin(context.principal);
      const rationale = evaluateDecisionRationale({
        decision: approval.decision,
        ...(approval.reason !== undefined ? { reason: approval.reason } : {}),
        ...(isOverride ? { isOverride: true } : {}),
      });
      if (!rationale.allowed)
        throw new ApplicationError(
          "invalid_request",
          rationale.message ?? "Decision rationale is required.",
          false
        );
      await ensureSchema();
      const metadata = await review.getChallengeMetadata({
        workspaceId: context.workspaceId,
        challengeId: approval.challengeId,
      });
      if (metadata) {
        const separation = evaluateReviewerSeparation({
          producerPrincipalId: metadata.submittedByPrincipalId,
          reviewerPrincipalId: context.principal.principalId,
          requireSeparation: !isOverride,
        });
        if (!separation.allowed)
          throw new ApplicationError(
            "authorization_denied",
            separation.message ?? "Reviewer separation is required.",
            false
          );
      }
      const challenge = await workflow.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) =>
          transaction.getApprovalChallenge({
            workspaceId: context.workspaceId,
            projectId: context.projectId,
            challengeId: approval.challengeId,
          })
      );
      if (!challenge)
        throw new ApplicationError("not_found", "Approval challenge not found.", false);
      const evaluatedAt = now().toISOString();
      const actionability = evaluateChallengeActionability({
        consumedAt: challenge.consumedAt,
        expiresAt: challenge.expiresAt,
        now: evaluatedAt,
      });
      if (!isActionableQueueItem(actionability))
        throw new ApplicationError(
          "precondition_failed",
          "Approval challenge is expired or already consumed.",
          false
        );
      const overrideAdmission = evaluateOverrideAdmission({
        isOverride,
        highRisk: false,
      });
      if (!overrideAdmission.allowed)
        throw new ApplicationError(
          "precondition_failed",
          overrideAdmission.message ?? "Override is not allowed.",
          false
        );

      const headerRevision = parseEtag(context.ifMatch);
      if (headerRevision !== approval.expectedRevision)
        throw new ApplicationError(
          "precondition_failed",
          "If-Match does not match expectedRevision.",
          false
        );
      const approvalId = createId("approval");
      const jobId = createId("job");
      const reason =
        approval.reason?.trim() ||
        (approval.decision === "approved" ? "approved" : "");
      try {
        const result = await workflow.withWorkspaceTransaction(
          context.workspaceId,
          (transaction) =>
            transaction.recordApproval({
              workspaceId: context.workspaceId,
              projectId: context.projectId,
              challengeId: approval.challengeId,
              subjectId: approval.subjectId,
              expectedRevision: approval.expectedRevision,
              decision: approval.decision,
              reason,
              approvalId,
              jobId,
              commandId: createId("command"),
              outboxId: createId("outbox"),
              idempotencyKey: `v1:${digest({
                principalId: context.principal.principalId,
                method: "POST",
                route: `/v1/workspaces/${context.workspaceId}/projects/${context.projectId}/approvals`,
                key: context.idempotencyKey,
              })}`,
              requestFingerprint: digest({ projectId: context.projectId, approval }),
              now: evaluatedAt,
            })
        );
        const response = result.response as {
          readonly id?: unknown;
          readonly jobId?: unknown;
          readonly revision?: unknown;
        };
        if (
          typeof response.id !== "string" ||
          typeof response.jobId !== "string" ||
          typeof response.revision !== "number"
        )
          throw new ApplicationError(
            "upstream_unavailable",
            "Stored approval response is invalid.",
            false
          );
        return { id: response.id, jobId: response.jobId, revision: response.revision };
      } catch (error) {
        if (error instanceof WorkflowStateTransitionError)
          throw new ApplicationError("precondition_failed", error.message, false);
        throw error;
      }
    },

    revokeApproval: async (
      approvalId: string,
      revocation: ApprovalRevocationInput,
      context: Required<
        Pick<
          ApiRequestContext,
          | "workspaceId"
          | "projectId"
          | "principal"
          | "requestId"
          | "idempotencyKey"
          | "ifMatch"
        >
      >
    ) => {
      assertDecide(context.principal);
      const expectedRevision = parseEtag(context.ifMatch);
      const evaluatedAt = now().toISOString();
      try {
        const result = await workflow.withWorkspaceTransaction(
          context.workspaceId,
          (transaction) =>
            transaction.revokeApproval({
              workspaceId: context.workspaceId,
              projectId: context.projectId,
              approvalId,
              expectedRevision,
              actorPrincipalId: context.principal.principalId,
              reason: revocation.reason,
              eventId: createId("event"),
              commandId: createId("command"),
              idempotencyKey: `v1:${digest({
                principalId: context.principal.principalId,
                method: "POST",
                route: `/v1/workspaces/${context.workspaceId}/projects/${context.projectId}/approvals/${approvalId}:revoke`,
                key: context.idempotencyKey,
              })}`,
              requestFingerprint: digest({
                contractVersion: "v1",
                projectId: context.projectId,
                approvalId,
                expectedRevision,
                revocation,
              }),
              now: evaluatedAt,
            })
        );
        const response = result.response as {
          readonly id?: unknown;
          readonly revision?: unknown;
          readonly state?: unknown;
          readonly revokedAt?: unknown;
        };
        if (
          typeof response.id !== "string" ||
          typeof response.revision !== "number" ||
          response.state !== "revoked" ||
          typeof response.revokedAt !== "string" ||
          !Number.isFinite(Date.parse(response.revokedAt))
        )
          throw new ApplicationError(
            "upstream_unavailable",
            "Stored approval revocation response is invalid.",
            false
          );
        return {
          id: response.id,
          revision: response.revision,
          state: "revoked" as const,
          revokedAt: response.revokedAt,
          replayed: result.kind === "replayed",
        };
      } catch (error) {
        if (error instanceof WorkflowStateTransitionError) {
          if (error.message.includes("Idempotency key"))
            throw new ApplicationError(
              "idempotency_key_conflict",
              "Idempotency key is already associated with a different request.",
              false
            );
          throw new ApplicationError(
            "precondition_failed",
            "Approval is missing, stale, rejected, already revoked, or outside the project.",
            false
          );
        }
        throw error;
      }
    },
  };
}
