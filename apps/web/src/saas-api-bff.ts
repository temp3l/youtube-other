import type {
  ApprovalAccepted,
  ApprovalChallenge,
  ApprovalRevoked,
  AssetPage,
  AuditEventPage,
  Episode,
  EpisodeInput,
  EpisodePage,
  Job,
  Project,
  ProjectInput,
  ProjectPage,
  UsageRecordPage,
  ValidationPage,
  WorkspaceQuotaStatus,
  WorkflowAdmission,
  WorkflowCommandAccepted,
  WorkflowRun,
  WorkflowStepPage,
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

export { createApiSdkSaasJourneyGateway } from "./saas-modules/api-sdk-gateway.js";
