import type {
  ApprovalAccepted,
  ApprovalChallenge,
  ApprovalHistoryPage,
  ApprovalRevoked,
  AssetPage,
  AuditEventPage,
  Episode,
  EpisodeProductionState,
  EpisodeInput,
  EpisodePage,
  ProductionUnitComparisonPage,
  ArtifactInvalidationPreview,
  ProductionUnitChange,
  ProductionUnitRegenerationAccepted,
  Job,
  Project,
  ProjectInput,
  ProjectPage,
  ReviewQueuePage,
  Publication,
  PublicationPreflightInput,
  PublicationPreflightResult,
  PublicationPrepareInput,
  PublicationPrepareResult,
  PublicationScheduleUpdateInput,
  PublicationScheduleUpdateResult,
  PublishingChannel,
  PublishingChannelPage,
  UsageRecordPage,
  ApiCredentialPage,
  ApiCredentialIssueInput,
  ApiCredentialIssueResult,
  ApiCredentialRecord,
  ApiCredentialRotateInput,
  DeveloperJourneyExamples,
  WebhookDeliveryPage,
  WebhookDeliveryRecord,
  WebhookEndpointCreateInput,
  WebhookEndpointCreateResult,
  WebhookEndpointPage,
  WebhookSecretRotateResult,
  WebhookTestResult,
  ValidationPage,
  WorkspaceQuotaStatus,
  CapabilityRegistry,
  ResolvedProductionConfiguration,
  WorkflowAdmission,
  WorkflowCommandAccepted,
  WorkflowRun,
  WorkflowStepPage,
} from "@mediaforge/api-sdk";

import type { SaasIdentity } from "./saas-runtime.js";

/** Publishing is nested so existing provider-free BFFs retain no mutations. */
export interface PublishingJourneyGateway {
  listChannels(identity: SaasIdentity): Promise<PublishingChannelPage>;
  beginChannelConnect(identity: SaasIdentity): Promise<{ readonly authorizationUrl: string; readonly expiresAt: string }>;
  disconnectChannel(identity: SaasIdentity, channelId: string, ifMatch: string): Promise<PublishingChannel>;
  preflight(identity: SaasIdentity, projectId: string, episodeId: string, input: PublicationPreflightInput): Promise<PublicationPreflightResult>;
  prepare(identity: SaasIdentity, projectId: string, episodeId: string, input: PublicationPrepareInput, idempotencyKey: string): Promise<PublicationPrepareResult>;
  getPublication(identity: SaasIdentity, projectId: string, publicationId: string): Promise<Publication>;
  cancelPublication(identity: SaasIdentity, projectId: string, publicationId: string, ifMatch: string): Promise<Publication>;
  updateSchedule(identity: SaasIdentity, projectId: string, publicationId: string, input: PublicationScheduleUpdateInput, ifMatch: string): Promise<PublicationScheduleUpdateResult>;
}

/** Integration secrets are returned only by the action response, never by a read model. */
export interface IntegrationsJourneyGateway {
  listApiCredentials(identity: SaasIdentity): Promise<ApiCredentialPage>;
  issueApiCredential(identity: SaasIdentity, input: ApiCredentialIssueInput, idempotencyKey: string): Promise<ApiCredentialIssueResult>;
  rotateApiCredential(identity: SaasIdentity, keyId: string, input: ApiCredentialRotateInput, ifMatch: string, idempotencyKey: string): Promise<ApiCredentialIssueResult>;
  revokeApiCredential(identity: SaasIdentity, keyId: string, reason: string, ifMatch: string): Promise<ApiCredentialRecord>;
  listWebhookEndpoints(identity: SaasIdentity): Promise<WebhookEndpointPage>;
  createWebhookEndpoint(identity: SaasIdentity, input: WebhookEndpointCreateInput): Promise<WebhookEndpointCreateResult>;
  rotateWebhookEndpointSecret(identity: SaasIdentity, endpointId: string, overlapMs: number | undefined, ifMatch: string): Promise<WebhookSecretRotateResult>;
  testWebhookEndpoint(identity: SaasIdentity, endpointId: string): Promise<WebhookTestResult>;
  listWebhookDeliveries(identity: SaasIdentity): Promise<WebhookDeliveryPage>;
  resendWebhookDelivery(identity: SaasIdentity, deliveryId: string, ifMatch: string): Promise<WebhookDeliveryRecord>;
  getDeveloperJourneyExamples(identity: SaasIdentity): Promise<DeveloperJourneyExamples>;
}

/**
 * Server-side gateway used by the web BFF. It deliberately receives a server
 * identity, never a browser-supplied bearer token.
 */
export interface SaasJourneyGateway {
  readonly publishing?: PublishingJourneyGateway;
  readonly integrations?: IntegrationsJourneyGateway;
  listProjects(identity: SaasIdentity): Promise<ProjectPage>;
  createProject(identity: SaasIdentity, input: ProjectInput, idempotencyKey: string): Promise<Project>;
  listEpisodes(identity: SaasIdentity, projectId: string): Promise<EpisodePage>;
  getEpisode(identity: SaasIdentity, projectId: string, episodeId: string): Promise<Episode>;
  getEpisodeProductionState(identity: SaasIdentity, projectId: string, episodeId: string): Promise<EpisodeProductionState>;
  getWorkspaceCapabilities(identity: SaasIdentity): Promise<CapabilityRegistry>;
  getEpisodeResolvedConfiguration(identity: SaasIdentity, projectId: string, episodeId: string): Promise<ResolvedProductionConfiguration>;
  compareProductionUnitSnapshots(identity: SaasIdentity, projectId: string, episodeId: string): Promise<ProductionUnitComparisonPage>;
  previewArtifactInvalidation(identity: SaasIdentity, projectId: string, episodeId: string, input: { readonly changes: readonly ProductionUnitChange[] }): Promise<ArtifactInvalidationPreview>;
  regenerateProductionUnits(identity: SaasIdentity, projectId: string, episodeId: string, input: { readonly targets: readonly ProductionUnitChange["address"][]; readonly reason?: string }, idempotencyKey: string): Promise<ProductionUnitRegenerationAccepted>;
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
  listReviewQueue(identity: SaasIdentity, projectId: string): Promise<ReviewQueuePage>;
  listApprovalHistory(identity: SaasIdentity, projectId: string): Promise<ApprovalHistoryPage>;
  recordApproval(identity: SaasIdentity, projectId: string, input: { readonly challengeId: string; readonly subjectId: string; readonly expectedRevision: number; readonly decision: "approved" | "rejected"; readonly reason: string }, ifMatch: string, idempotencyKey: string): Promise<ApprovalAccepted>;
  revokeApproval(identity: SaasIdentity, projectId: string, approvalId: string, reason: string, ifMatch: string, idempotencyKey: string): Promise<ApprovalRevoked>;
  getQuota(identity: SaasIdentity): Promise<WorkspaceQuotaStatus>;
  listUsage(identity: SaasIdentity): Promise<UsageRecordPage>;
  listAudit(identity: SaasIdentity): Promise<AuditEventPage>;
}

export { createApiSdkSaasJourneyGateway } from "./saas-modules/api-sdk-gateway.js";
