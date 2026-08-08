import {
  type MediaforgeApiClient,
} from "@mediaforge/api-sdk";

import type { SaasIdentity } from "../saas-runtime.js";
import type { SaasJourneyGateway } from "../saas-api-bff.js";

/** Registered gateway adapter factory; later tasks extend assigned modules only. */
export function createApiSdkSaasJourneyGateway(input: {
  readonly clientFor: (identity: SaasIdentity) => MediaforgeApiClient;
}): SaasJourneyGateway {
  const client = (identity: SaasIdentity) => input.clientFor(identity);
  const workspace = (identity: SaasIdentity) => identity.session.workspaceId;
  return {
    async listProjects(identity) {
      return (await client(identity).listProjects(workspace(identity), { size: 50 }))
        .data;
    },
    async createProject(identity, value, _idempotencyKey) {
      return (await client(identity).createProject(workspace(identity), value))
        .data;
    },
    async listEpisodes(identity, projectId) {
      return (
        await client(identity).listEpisodes(workspace(identity), projectId, {
          size: 50,
        })
      ).data;
    },
    async getEpisode(identity, projectId, episodeId) {
      return (
        await client(identity).getEpisode(
          workspace(identity),
          projectId,
          episodeId
        )
      ).data;
    },
    async createEpisode(identity, projectId, value, _idempotencyKey) {
      return (
        await client(identity).createEpisode(
          workspace(identity),
          projectId,
          value
        )
      ).data;
    },
    async replaceEpisode(identity, projectId, episodeId, value, ifMatch) {
      return (
        await client(identity).replaceEpisodeContent(
          workspace(identity),
          projectId,
          episodeId,
          value,
          { ifMatch }
        )
      ).data;
    },
    async startWorkflow(
      identity,
      projectId,
      episodeId,
      value,
      idempotencyKey
    ) {
      return (
        await client(identity).admitWorkflow(
          workspace(identity),
          projectId,
          episodeId,
          value,
          { idempotencyKey }
        )
      ).data;
    },
    async getWorkflow(identity, projectId, workflowRunId) {
      return (
        await client(identity).getWorkflow(
          workspace(identity),
          projectId,
          workflowRunId
        )
      ).data;
    },
    async getWorkflowSteps(identity, projectId, workflowRunId) {
      return (
        await client(identity).listWorkflowSteps(
          workspace(identity),
          projectId,
          workflowRunId
        )
      ).data;
    },
    async getJob(identity, projectId, jobId) {
      return (
        await client(identity).getJob(workspace(identity), projectId, jobId)
      ).data;
    },
    async cancelWorkflow(identity, projectId, workflowRunId, ifMatch) {
      return (
        await client(identity).cancelWorkflow(
          workspace(identity),
          projectId,
          workflowRunId,
          { ifMatch }
        )
      ).data;
    },
    async resumeWorkflow(
      identity,
      projectId,
      workflowRunId,
      ifMatch,
      idempotencyKey
    ) {
      return (
        await client(identity).resumeWorkflow(
          workspace(identity),
          projectId,
          workflowRunId,
          { ifMatch, idempotencyKey }
        )
      ).data;
    },
    async listAssets(identity, projectId) {
      return (
        await client(identity).listAssets(workspace(identity), projectId, {
          size: 50,
        })
      ).data;
    },
    async listValidations(identity, projectId) {
      return (
        await client(identity).listValidations(workspace(identity), projectId, {
          size: 50,
        })
      ).data;
    },
    async getApprovalChallenge(identity, projectId, challengeId) {
      return (
        await client(identity).getApprovalChallenge(
          workspace(identity),
          projectId,
          challengeId
        )
      ).data;
    },
    async recordApproval(
      identity,
      projectId,
      value,
      ifMatch,
      idempotencyKey
    ) {
      return (
        await client(identity).recordApproval(
          workspace(identity),
          projectId,
          value,
          { ifMatch, idempotencyKey }
        )
      ).data;
    },
    async revokeApproval(
      identity,
      projectId,
      approvalId,
      reason,
      ifMatch,
      idempotencyKey
    ) {
      return (
        await client(identity).revokeApproval(
          workspace(identity),
          projectId,
          approvalId,
          { reason },
          { ifMatch, idempotencyKey }
        )
      ).data;
    },
    async getQuota(identity) {
      return (await client(identity).getQuota(workspace(identity))).data;
    },
    async listUsage(identity) {
      return (
        await client(identity).listUsageRecords(workspace(identity), {
          size: 50,
        })
      ).data;
    },
    async listAudit(identity) {
      return (
        await client(identity).listAuditEvents(workspace(identity), {
          size: 50,
        })
      ).data;
    },
  };
}
