import {
  type Episode,
  type EpisodeInput,
  type EpisodePage,
  type AssetPage,
  type ApprovalAccepted,
  type ApprovalChallenge,
  type ApprovalRevoked,
  type Job,
  type MediaforgeApiClient,
  type Project,
  type ProjectInput,
  type ProjectPage,
  type ValidationPage,
  type UsageRecordPage,
  type AuditEventPage,
  type WorkspaceQuotaStatus,
  type WorkflowAdmission,
  type WorkflowCommandAccepted,
  type WorkflowRun,
  type WorkflowStepPage,
} from "@mediaforge/api-sdk";

import type { SaasIdentity } from "./saas-runtime.js";

/**
 * Server-side gateway used by the web BFF. It deliberately receives a server
 * identity, never a browser-supplied bearer token.
 */
export interface SaasJourneyGateway {
  listProjects(identity: SaasIdentity): Promise<ProjectPage>;
  createProject(identity: SaasIdentity, input: ProjectInput, idempotencyKey: string): Promise<Project>;
  listEpisodes(identity: SaasIdentity, projectId: string): Promise<EpisodePage>;
  getEpisode(identity: SaasIdentity, projectId: string, episodeId: string): Promise<Episode>;
  createEpisode(identity: SaasIdentity, projectId: string, input: EpisodeInput, idempotencyKey: string): Promise<{ readonly id: string; readonly revision: number }>;
  replaceEpisode(identity: SaasIdentity, projectId: string, episodeId: string, input: EpisodeInput, ifMatch: string): Promise<Episode>;
  startWorkflow(identity: SaasIdentity, projectId: string, episodeId: string, input: WorkflowAdmission, idempotencyKey: string): Promise<WorkflowCommandAccepted>;
  getWorkflow(identity: SaasIdentity, projectId: string, workflowRunId: string): Promise<WorkflowRun>;
  getWorkflowSteps(identity: SaasIdentity, projectId: string, workflowRunId: string): Promise<WorkflowStepPage>;
  getJob(identity: SaasIdentity, projectId: string, jobId: string): Promise<Job>;
  cancelWorkflow(identity: SaasIdentity, projectId: string, workflowRunId: string, ifMatch: string): Promise<WorkflowCommandAccepted>;
  resumeWorkflow(identity: SaasIdentity, projectId: string, workflowRunId: string, ifMatch: string, idempotencyKey: string): Promise<WorkflowCommandAccepted>;
  listAssets(identity: SaasIdentity, projectId: string): Promise<AssetPage>;
  listValidations(identity: SaasIdentity, projectId: string): Promise<ValidationPage>;
  getApprovalChallenge(identity: SaasIdentity, projectId: string, challengeId: string): Promise<ApprovalChallenge>;
  recordApproval(identity: SaasIdentity, projectId: string, input: { readonly challengeId: string; readonly subjectId: string; readonly expectedRevision: number; readonly decision: "approved" | "rejected"; readonly reason: string }, ifMatch: string, idempotencyKey: string): Promise<ApprovalAccepted>;
  revokeApproval(identity: SaasIdentity, projectId: string, approvalId: string, reason: string, ifMatch: string, idempotencyKey: string): Promise<ApprovalRevoked>;
  getQuota(identity: SaasIdentity): Promise<WorkspaceQuotaStatus>;
  listUsage(identity: SaasIdentity): Promise<UsageRecordPage>;
  listAudit(identity: SaasIdentity): Promise<AuditEventPage>;
}

export function createApiSdkSaasJourneyGateway(input: {
  readonly clientFor: (identity: SaasIdentity) => MediaforgeApiClient;
}): SaasJourneyGateway {
  const client = (identity: SaasIdentity) => input.clientFor(identity);
  const workspace = (identity: SaasIdentity) => identity.session.workspaceId;
  return {
    async listProjects(identity) { return (await client(identity).listProjects(workspace(identity), { size: 50 })).data; },
    async createProject(identity, value, _idempotencyKey) { return (await client(identity).createProject(workspace(identity), value)).data; },
    async listEpisodes(identity, projectId) { return (await client(identity).listEpisodes(workspace(identity), projectId, { size: 50 })).data; },
    async getEpisode(identity, projectId, episodeId) { return (await client(identity).getEpisode(workspace(identity), projectId, episodeId)).data; },
    async createEpisode(identity, projectId, value, _idempotencyKey) { return (await client(identity).createEpisode(workspace(identity), projectId, value)).data; },
    async replaceEpisode(identity, projectId, episodeId, value, ifMatch) { return (await client(identity).replaceEpisodeContent(workspace(identity), projectId, episodeId, value, { ifMatch })).data; },
    async startWorkflow(identity, projectId, episodeId, value, idempotencyKey) { return (await client(identity).admitWorkflow(workspace(identity), projectId, episodeId, value, { idempotencyKey })).data; },
    async getWorkflow(identity, projectId, workflowRunId) { return (await client(identity).getWorkflow(workspace(identity), projectId, workflowRunId)).data; },
    async getWorkflowSteps(identity, projectId, workflowRunId) { return (await client(identity).listWorkflowSteps(workspace(identity), projectId, workflowRunId)).data; },
    async getJob(identity, projectId, jobId) { return (await client(identity).getJob(workspace(identity), projectId, jobId)).data; },
    async cancelWorkflow(identity, projectId, workflowRunId, ifMatch) { return (await client(identity).cancelWorkflow(workspace(identity), projectId, workflowRunId, { ifMatch })).data; },
    async resumeWorkflow(identity, projectId, workflowRunId, ifMatch, idempotencyKey) { return (await client(identity).resumeWorkflow(workspace(identity), projectId, workflowRunId, { ifMatch, idempotencyKey })).data; },
    async listAssets(identity, projectId) { return (await client(identity).listAssets(workspace(identity), projectId, { size: 50 })).data; },
    async listValidations(identity, projectId) { return (await client(identity).listValidations(workspace(identity), projectId, { size: 50 })).data; },
    async getApprovalChallenge(identity, projectId, challengeId) { return (await client(identity).getApprovalChallenge(workspace(identity), projectId, challengeId)).data; },
    async recordApproval(identity, projectId, value, ifMatch, idempotencyKey) { return (await client(identity).recordApproval(workspace(identity), projectId, value, { ifMatch, idempotencyKey })).data; },
    async revokeApproval(identity, projectId, approvalId, reason, ifMatch, idempotencyKey) { return (await client(identity).revokeApproval(workspace(identity), projectId, approvalId, { reason }, { ifMatch, idempotencyKey })).data; },
    async getQuota(identity) { return (await client(identity).getQuota(workspace(identity))).data; },
    async listUsage(identity) { return (await client(identity).listUsageRecords(workspace(identity), { size: 50 })).data; },
    async listAudit(identity) { return (await client(identity).listAuditEvents(workspace(identity), { size: 50 })).data; },
  };
}
