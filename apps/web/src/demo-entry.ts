import { createSaasRuntime, type SaasIdentity } from "./saas-runtime.js";
import type { SaasJourneyGateway } from "./saas-api-bff.js";

const now = "2026-08-08T12:00:00.000Z";
const identity: SaasIdentity = {
  session: {
    workspaceId: "workspace-demo",
    workspaceName: "MediaForge demo workspace",
    principalName: "Ada Lovelace",
    profiles: ["mathematics_education", "history", "dark_truth", "strategic_reinvention"],
  },
};
const projects = [{ id: "project-history", name: "The Silk Road", profile: "history" as const, revision: 1, createdAt: now, updatedAt: now }];
const episodes = [{ id: "episode-silk-road", revision: 2, createdAt: now, updatedAt: now, content: { type: "history" as const, version: "1" as const, topic: "How the Silk Road reshaped cities", presetId: "historical-biography" as const, format: "standard" as const, audienceLevel: "general" as const } }];

const gateway: SaasJourneyGateway = {
  async listProjects() { return { items: projects }; },
  async createProject(_identity, input) { const project = { id: `project-${projects.length + 1}`, name: input.name, profile: input.profile as "history", revision: 1, createdAt: now, updatedAt: now }; projects.push(project); return project; },
  async listEpisodes() { return { items: episodes }; },
  async getEpisode() { return episodes[0]!; },
  async getEpisodeProductionState() { return { schemaVersion: "mediaforge.production.v1" as const, projectId: "project-history", episodeId: "episode-silk-road", currentProductionRevision: { id: "production-revision-demo" }, lifecycleStage: "reviewing" as const, workflow: { activeRunId: "run-demo", runStatus: "succeeded" as const, jobId: "job-demo" }, validation: { items: [] }, review: {}, render: {}, localization: {}, publication: {}, blockers: [{ code: "approval_missing", message: "A scoped review decision is required.", severity: "blocking" as const, evidence: [] }], warnings: [], actions: [{ actionId: "submit-review", kind: "submit_review", label: "Submit for review", enabled: true }], projectedAt: now, projectionInputFingerprint: "a".repeat(64) }; },
  async getWorkspaceCapabilities() { return { schemaVersion: "mediaforge.capability.v1" as const, capabilityVersion: "a".repeat(64), entitledProfiles: ["history"], cells: [{ profileId: "history", locales: ["en"], variants: ["full", "short"], renderProfiles: ["youtube"], publicationModes: ["none"], approvalModes: ["required"] }], tenantConfigurableFields: ["supportedLocales"], generatedAt: now }; },
  async getEpisodeResolvedConfiguration() { return { schemaVersion: "mediaforge.capability.v1" as const, profileId: "history", supportedLocales: ["en"], defaultLocale: "en", supportedVariants: ["full"], approvalMode: "required", publicationMode: "none", renderProfile: "youtube", requiredReviewGates: ["content"], configurationRevision: 1, capabilityVersion: "a".repeat(64), fingerprint: "b".repeat(64), provenance: [], resolvedAt: now }; },
  async compareProductionUnitSnapshots() { return { items: [] }; },
  async previewArtifactInvalidation() { return { changedAddresses: [], invalidatedUnits: [], preservedUnits: [], regenerationTargets: [], staleReviewReadiness: false, stalePublishReadiness: false, gateEvidenceUpdates: [], projectedAt: now }; },
  async regenerateProductionUnits() { return { acceptedTargets: [], workflowRunId: "run-demo", jobId: "job-demo", revision: 1 }; },
  async createEpisode() { return { id: "episode-demo", revision: 1 }; },
  async replaceEpisode(_identity, _project, episodeId, input) { return { id: episodeId, revision: 3, content: input.content }; },
  async startWorkflow() { return { workflowRunId: "run-demo", jobId: "job-demo", revision: 1, links: { workflowRun: "", job: "" } }; },
  async getWorkflow() { return { id: "run-demo", revision: 1, status: "succeeded" as const }; },
  async getWorkflowSteps() { return { items: [{ id: "research", status: "succeeded", phase: "Research brief", message: "Provider-free fixture completed." }, { id: "review", status: "succeeded", phase: "Human review", message: "Ready for a scoped decision." }] }; },
  async getJob() { return { id: "job-demo", revision: 1, status: "succeeded" as const, attempts: 1, cancellationRequested: false }; },
  async cancelWorkflow() { return { workflowRunId: "run-demo", jobId: "job-demo", revision: 2, links: { workflowRun: "", job: "" } }; },
  async resumeWorkflow() { return { workflowRunId: "run-demo", jobId: "job-demo", revision: 2, links: { workflowRun: "", job: "" } }; },
  async listAssets() { return { items: [{ id: "asset-demo", mimeType: "application/json", bytes: 1432, sha256: "b".repeat(64), lifecycle: "validated", provenance: "provider-free-fixture" }] }; },
  async listValidations() { return { items: [{ id: "validation-demo", createdAt: now, status: "passed", code: "metadata.complete", message: "Required metadata is complete." }] }; },
  async getApprovalChallenge() { return { id: "challenge-demo", subjectId: "episode-silk-road", subjectRevision: 2, artifactHash: "c".repeat(64), expiresAt: "2030-01-01T00:00:00.000Z", consumedAt: null }; },
  async listReviewQueue() { return { items: [{ id: "challenge-demo", challengeId: "challenge-demo", subjectId: "episode-silk-road", expiresAt: "2030-01-01T00:00:00.000Z" }] }; },
  async listApprovalHistory() { return { items: [{ id: "approval-demo", subjectId: "episode-silk-road", decision: "approved" }] }; },
  async recordApproval() { return { id: "approval-demo", jobId: "job-demo", revision: 1 }; },
  async revokeApproval() { return { id: "approval-demo", revision: 2, state: "revoked" as const, revokedAt: now }; },
  async getQuota() { return { workspaceId: "workspace-demo", budgetLimitMinor: "0", reservedMinor: "0", settledMinor: "0", availableMinor: "0", revision: 1 }; },
  async listUsage() { return { items: [{ id: "usage-demo", kind: "usage" as const, subjectId: "run-demo", operation: "provider-free-fixture", unit: "run", quantityUnits: "1", costMinor: "0", correctionOfUsageId: null, attemptId: "attempt-demo", data: {}, occurredAt: now }] }; },
  async listAudit() { return { items: [{ id: "audit-demo", action: "workflow.completed", subjectId: "run-demo", actorId: "worker-demo", correlationId: "demo-1", causationId: null, data: {}, occurredAt: now }] }; },
};

const port = Number(process.env["PORT"] ?? "4173");
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("PORT must be a valid TCP port.");
const server = createSaasRuntime({
  resolveSession: async () => identity.session,
  journey: gateway,
  // The workspace preview proxy may strip Origin and Referer. This demo has no
  // external effects, credentials, or persisted data; production must not set it.
  allowUnverifiedDemoFormPosts: true,
});
const host = process.env["HOST"] ?? "0.0.0.0";
server.listen(port, host, () => process.stdout.write(`MediaForge demo: http://${host}:${port}\n`));
const stop = () => server.close(() => process.exit(0));
process.once("SIGINT", stop); process.once("SIGTERM", stop);
