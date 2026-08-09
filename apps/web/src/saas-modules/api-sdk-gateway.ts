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
    async getEpisodeProductionState(identity, projectId, episodeId) {
      return (
        await client(identity).getEpisodeProductionState(
          workspace(identity),
          projectId,
          episodeId
        )
      ).data;
    },
    async getWorkspaceCapabilities(identity) {
      return (await client(identity).getWorkspaceCapabilities(workspace(identity))).data;
    },
    async compareProductionUnitSnapshots(identity, projectId, episodeId) {
      return (await client(identity).compareProductionUnitSnapshots(workspace(identity), projectId, episodeId)).data;
    },
    async previewArtifactInvalidation(identity, projectId, episodeId, value) {
      return (await client(identity).previewArtifactInvalidation(workspace(identity), projectId, episodeId, value)).data;
    },
    async regenerateProductionUnits(identity, projectId, episodeId, value, idempotencyKey) {
      return (await client(identity).regenerateProductionUnits(workspace(identity), projectId, episodeId, value, { idempotencyKey })).data;
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
    async listReviewQueue(identity, projectId) {
      return (await client(identity).listReviewQueue(workspace(identity), projectId)).data;
    },
    async listApprovalHistory(identity, projectId) {
      return (await client(identity).listApprovalHistory(workspace(identity), projectId)).data;
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
    publishing: {
      async listChannels(identity) {
        return (await client(identity).listPublishingChannels(workspace(identity))).data;
      },
      async beginChannelConnect(identity) {
        const result = (await client(identity).beginPublishingChannelConnect(workspace(identity))).data;
        return { authorizationUrl: result.authorizationUrl, expiresAt: result.expiresAt };
      },
      async disconnectChannel(identity, channelId, ifMatch) {
        return (await client(identity).disconnectPublishingChannel(
          workspace(identity), channelId, { ifMatch }
        )).data;
      },
      async preflight(identity, projectId, episodeId, value) {
        return (await client(identity).evaluatePublicationPreflight(
          workspace(identity), projectId, episodeId, value
        )).data;
      },
      async prepare(identity, projectId, episodeId, value, idempotencyKey) {
        return (await client(identity).preparePublicationIntent(
          workspace(identity), projectId, episodeId, value, { idempotencyKey }
        )).data;
      },
      async getPublication(identity, projectId, publicationId) {
        return (await client(identity).getPublication(
          workspace(identity), projectId, publicationId
        )).data;
      },
      async cancelPublication(identity, projectId, publicationId, ifMatch) {
        return (await client(identity).cancelPublicationIntent(
          workspace(identity), projectId, publicationId, { ifMatch }
        )).data;
      },
      async updateSchedule(identity, projectId, publicationId, value, ifMatch) {
        return (await client(identity).updatePublicationSchedule(
          workspace(identity), projectId, publicationId, value, { ifMatch }
        )).data;
      },
    },
  };
}
