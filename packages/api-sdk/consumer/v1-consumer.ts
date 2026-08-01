import {
  MediaforgeApiClient,
  parseApiProblem,
  verifyWebhookSignature,
  type ApiProblem,
  type ApprovalAccepted,
  type ApprovalInput,
  type Asset,
  type AuditEventPage,
  type Episode,
  type EpisodeCreated,
  type EpisodeInput,
  type HealthStatus,
  type Job,
  type Project,
  type ProjectInput,
  type UsageRecordPage,
  type ValidationPage,
  type WorkflowAdmission,
  type WorkflowCommandAccepted,
  type WorkflowRun,
  type WorkflowStepPage,
  type WorkspaceQuotaStatus,
} from "@mediaforge/api-sdk";

const projectInput = { name: "Consumer project", profile: "dark_truth" } satisfies ProjectInput;
const episodeInput = { content: { type: "dark_truth", version: "1", premise: "Premise", storyBibleId: "bible-1", referenceAssetIds: [] } } satisfies EpisodeInput;
const workflowInput = { template: "episode-production", episodeRevision: 0, locales: ["en"], variants: ["full"], approvalMode: "required", publicationMode: "none" } satisfies WorkflowAdmission;
const approvalInput = { challengeId: "challenge-1", subjectId: "run-1", expectedRevision: 0, decision: "approved", reason: "Reviewed" } satisfies ApprovalInput;

const problem = { type: "https://api.example.test/problems/profile-input-invalid", title: "Profile input invalid", status: 422, detail: "Unsupported profile capability.", code: "profile_input_invalid", requestId: "request-1", retryable: false, errors: [{ path: "content.grade", message: "Unsupported value." }] } satisfies ApiProblem;

const publicResponses = [
  { status: "ready" },
  { workspaceId: "workspace-1", budgetLimitMinor: "100", reservedMinor: "10", settledMinor: "20", availableMinor: "70", revision: 0 },
  { items: [{ id: "usage-1", kind: "usage", subjectId: "run-1", operation: "render", unit: "frame", quantityUnits: "1", costMinor: "1", correctionOfUsageId: null, attemptId: null, data: {}, occurredAt: "2026-08-01T00:00:00.000Z" }] },
  { items: [{ id: "audit-1", action: "workflow.started", subjectId: "run-1", actorId: "user-1", correlationId: "request-1", causationId: null, data: {}, occurredAt: "2026-08-01T00:00:00.000Z" }] },
  { id: "project-1", revision: 0 },
  { id: "episode-1", revision: 0 },
  { id: "episode-1", revision: 0, content: episodeInput.content },
  { workflowRunId: "run-1", jobId: "job-1", revision: 0, links: { workflowRun: "/workflow-runs/run-1", job: "/jobs/job-1" } },
  { id: "run-1", revision: 0, status: "queued" },
  { items: [{ id: "step-1", status: "queued" }] },
  { id: "job-1", revision: 0, status: "queued", attempts: 0, cancellationRequested: false },
  { id: "asset-1", mimeType: "video/mp4", bytes: 1, sha256: "a".repeat(64), lifecycle: "ready", provenance: "generated" },
  { items: [{ id: "validation-1", createdAt: "2026-08-01T00:00:00.000Z" }] },
  { id: "approval-1", jobId: "job-1", revision: 0 },
] as const satisfies readonly [
  HealthStatus,
  WorkspaceQuotaStatus,
  UsageRecordPage,
  AuditEventPage,
  Project,
  EpisodeCreated,
  Episode,
  WorkflowCommandAccepted,
  WorkflowRun,
  WorkflowStepPage,
  Job,
  Asset,
  ValidationPage,
  ApprovalAccepted,
];
void publicResponses;
void parseApiProblem(problem);
void verifyWebhookSignature({ payload: "{}", timestamp: new Date().toISOString(), signature: "v1=00", secrets: ["secret"] });

export function compileV1Consumer(client: MediaforgeApiClient): void {
  void client.getLiveness();
  void client.getReadiness();
  void client.getOpenApiDocument();
  void client.getQuota("workspace-1");
  void client.listUsageRecords("workspace-1", { size: 25 });
  void client.listAuditEvents("workspace-1", { size: 25 });
  void client.createProject("workspace-1", projectInput);
  void client.createEpisode("workspace-1", "project-1", episodeInput);
  void client.getEpisode("workspace-1", "project-1", "episode-1");
  void client.replaceEpisodeContent("workspace-1", "project-1", "episode-1", episodeInput, { ifMatch: '"0"' });
  void client.admitWorkflow("workspace-1", "project-1", "episode-1", workflowInput, { idempotencyKey: "workflow-1" });
  void client.getWorkflow("workspace-1", "project-1", "run-1");
  void client.listWorkflowSteps("workspace-1", "project-1", "run-1");
  void client.cancelWorkflow("workspace-1", "project-1", "run-1", { ifMatch: '"0"' });
  void client.resumeWorkflow("workspace-1", "project-1", "run-1", { ifMatch: '"0"', idempotencyKey: "resume-1" });
  void client.getJob("workspace-1", "project-1", "job-1");
  void client.getAsset("workspace-1", "project-1", "asset-1");
  void client.listValidations("workspace-1", "project-1", { size: 25 });
  void client.recordApproval("workspace-1", "project-1", approvalInput, { ifMatch: '"0"', idempotencyKey: "approval-1" });
}
