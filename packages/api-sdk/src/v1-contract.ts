export interface SdkV1OperationContract {
  readonly method: "GET" | "PATCH" | "POST";
  readonly path: string;
  readonly successStatus: "200" | "201" | "202";
  readonly responseSchema: string;
  readonly requestSchema: string | null;
  readonly requiredHeaders: readonly ("IdempotencyKey" | "IfMatch")[];
  readonly problemResponses: boolean;
}

/**
 * Explicit wire binding for every SDK method. The API compatibility gate owns
 * comparison to OpenAPI; SDK implementation names intentionally equal operation IDs.
 */
export const SDK_V1_OPERATIONS = {
  getLiveness: { method: "GET", path: "/health/live", successStatus: "200", responseSchema: "HealthStatus", requestSchema: null, requiredHeaders: [], problemResponses: false },
  getReadiness: { method: "GET", path: "/health/ready", successStatus: "200", responseSchema: "HealthStatus", requestSchema: null, requiredHeaders: [], problemResponses: false },
  getOpenApiDocument: { method: "GET", path: "/v1/openapi.json", successStatus: "200", responseSchema: "OpenApiDocument", requestSchema: null, requiredHeaders: [], problemResponses: false },
  getQuota: { method: "GET", path: "/v1/workspaces/{workspace}/quota", successStatus: "200", responseSchema: "WorkspaceQuotaStatus", requestSchema: null, requiredHeaders: [], problemResponses: true },
  listUsageRecords: { method: "GET", path: "/v1/workspaces/{workspace}/usage-records", successStatus: "200", responseSchema: "UsageRecordPage", requestSchema: null, requiredHeaders: [], problemResponses: true },
  listAuditEvents: { method: "GET", path: "/v1/workspaces/{workspace}/audit-events", successStatus: "200", responseSchema: "AuditEventPage", requestSchema: null, requiredHeaders: [], problemResponses: true },
  createProject: { method: "POST", path: "/v1/workspaces/{workspace}/projects", successStatus: "201", responseSchema: "Project", requestSchema: "ProjectInput", requiredHeaders: [], problemResponses: true },
  createEpisode: { method: "POST", path: "/v1/workspaces/{workspace}/projects/{project}/episodes", successStatus: "201", responseSchema: "EpisodeCreated", requestSchema: "EpisodeInput", requiredHeaders: [], problemResponses: true },
  getEpisode: { method: "GET", path: "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}", successStatus: "200", responseSchema: "Episode", requestSchema: null, requiredHeaders: [], problemResponses: true },
  replaceEpisodeContent: { method: "PATCH", path: "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}", successStatus: "200", responseSchema: "Episode", requestSchema: "EpisodeInput", requiredHeaders: ["IfMatch"], problemResponses: true },
  admitWorkflow: { method: "POST", path: "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/workflow-runs", successStatus: "202", responseSchema: "WorkflowCommandAccepted", requestSchema: "WorkflowAdmission", requiredHeaders: ["IdempotencyKey"], problemResponses: true },
  getWorkflow: { method: "GET", path: "/v1/workspaces/{workspace}/projects/{project}/workflow-runs/{run}", successStatus: "200", responseSchema: "WorkflowRun", requestSchema: null, requiredHeaders: [], problemResponses: true },
  listWorkflowSteps: { method: "GET", path: "/v1/workspaces/{workspace}/projects/{project}/workflow-runs/{run}/steps", successStatus: "200", responseSchema: "WorkflowStepPage", requestSchema: null, requiredHeaders: [], problemResponses: true },
  cancelWorkflow: { method: "POST", path: "/v1/workspaces/{workspace}/projects/{project}/workflow-runs/{run}:cancel", successStatus: "202", responseSchema: "WorkflowCommandAccepted", requestSchema: null, requiredHeaders: ["IfMatch"], problemResponses: true },
  resumeWorkflow: { method: "POST", path: "/v1/workspaces/{workspace}/projects/{project}/workflow-runs/{run}:resume", successStatus: "202", responseSchema: "WorkflowCommandAccepted", requestSchema: null, requiredHeaders: ["IdempotencyKey", "IfMatch"], problemResponses: true },
  getJob: { method: "GET", path: "/v1/workspaces/{workspace}/projects/{project}/jobs/{job}", successStatus: "200", responseSchema: "Job", requestSchema: null, requiredHeaders: [], problemResponses: true },
  getAsset: { method: "GET", path: "/v1/workspaces/{workspace}/projects/{project}/assets/{asset}", successStatus: "200", responseSchema: "Asset", requestSchema: null, requiredHeaders: [], problemResponses: true },
  listValidations: { method: "GET", path: "/v1/workspaces/{workspace}/projects/{project}/validations", successStatus: "200", responseSchema: "ValidationPage", requestSchema: null, requiredHeaders: [], problemResponses: true },
  getPublication: { method: "GET", path: "/v1/workspaces/{workspace}/projects/{project}/publications/{publication}", successStatus: "200", responseSchema: "Publication", requestSchema: null, requiredHeaders: [], problemResponses: true },
  recordApproval: { method: "POST", path: "/v1/workspaces/{workspace}/projects/{project}/approvals", successStatus: "202", responseSchema: "ApprovalAccepted", requestSchema: "ApprovalInput", requiredHeaders: ["IdempotencyKey", "IfMatch"], problemResponses: true },
  revokeApproval: { method: "POST", path: "/v1/workspaces/{workspace}/projects/{project}/approvals/{approval}:revoke", successStatus: "200", responseSchema: "ApprovalRevoked", requestSchema: "ApprovalRevocationInput", requiredHeaders: ["IdempotencyKey", "IfMatch"], problemResponses: true },
} as const satisfies Readonly<Record<string, SdkV1OperationContract>>;

export interface SdkV1ObjectSchemaContract {
  readonly required: readonly string[];
  readonly additionalProperties: boolean;
}

/** Requiredness is part of the SDK type contract; changes require an SDK update. */
export const SDK_V1_OBJECT_SCHEMAS = {
  WorkspaceQuotaStatus: { required: ["workspaceId", "budgetLimitMinor", "reservedMinor", "settledMinor", "availableMinor", "revision"], additionalProperties: false },
  UsageRecord: { required: ["id", "kind", "subjectId", "operation", "unit", "quantityUnits", "costMinor", "correctionOfUsageId", "attemptId", "data", "occurredAt"], additionalProperties: false },
  UsageRecordPage: { required: ["items"], additionalProperties: false },
  AuditEvent: { required: ["id", "action", "subjectId", "actorId", "correlationId", "causationId", "data", "occurredAt"], additionalProperties: false },
  AuditEventPage: { required: ["items"], additionalProperties: false },
  ProjectInput: { required: ["name", "profile"], additionalProperties: false },
  Project: { required: ["id", "revision"], additionalProperties: false },
  DarkTruthContent: { required: ["type", "version", "premise", "storyBibleId", "referenceAssetIds"], additionalProperties: false },
  MathematicsEducationContent: { required: ["type", "version", "curriculumSourceId", "skillId", "grade", "difficulty", "presentationPresetId", "audioPresetId"], additionalProperties: false },
  HistoryContent: { required: ["type", "version", "topic", "presetId", "format", "audienceLevel"], additionalProperties: false },
  EpisodeInput: { required: ["content"], additionalProperties: false },
  EpisodeCreated: { required: ["id", "revision"], additionalProperties: false },
  Episode: { required: ["id", "revision", "content"], additionalProperties: false },
  WorkflowAdmission: { required: ["template", "episodeRevision", "locales", "variants", "approvalMode", "publicationMode"], additionalProperties: false },
  ResourceLinks: { required: ["workflowRun", "job"], additionalProperties: false },
  WorkflowCommandAccepted: { required: ["workflowRunId", "jobId", "revision", "links"], additionalProperties: false },
  WorkflowRun: { required: ["id", "revision", "status"], additionalProperties: false },
  WorkflowStep: { required: ["id", "status"], additionalProperties: false },
  WorkflowStepPage: { required: ["items"], additionalProperties: false },
  Job: { required: ["id", "revision", "status", "attempts", "cancellationRequested"], additionalProperties: false },
  JobFailureProblem: { required: ["type", "title", "detail", "code", "retryable", "errors"], additionalProperties: false },
  Asset: { required: ["id", "mimeType", "bytes", "sha256", "lifecycle", "provenance"], additionalProperties: false },
  ValidationResult: { required: ["id", "createdAt"], additionalProperties: true },
  ValidationPage: { required: ["items"], additionalProperties: false },
  PublicationArtifactBinding: { required: ["assetId", "role", "contentHash"], additionalProperties: false },
  Publication: { required: ["id", "revision", "status", "workflowRunId", "approvalId", "approvalRevision", "approvalArtifactHash", "assetHash", "artifactBindings", "channelId", "visibility", "scheduledAt", "playlistIds", "createdAt", "updatedAt"], additionalProperties: false },
  ApprovalInput: { required: ["challengeId", "subjectId", "expectedRevision", "decision", "reason"], additionalProperties: false },
  ApprovalAccepted: { required: ["id", "jobId", "revision"], additionalProperties: false },
  ApprovalRevocationInput: { required: ["reason"], additionalProperties: false },
  ApprovalRevoked: { required: ["id", "revision", "state", "revokedAt"], additionalProperties: false },
  ProblemError: { required: ["path", "message"], additionalProperties: false },
  Problem: { required: ["type", "title", "status", "detail", "code", "requestId", "retryable", "errors"], additionalProperties: false },
  HealthStatus: { required: ["status"], additionalProperties: false },
  OpenApiDocument: { required: [], additionalProperties: true },
} as const satisfies Readonly<Record<string, SdkV1ObjectSchemaContract>>;

export const SDK_V1_ENUMS = {
  "UsageRecord.kind": ["usage", "correction"],
  "ProjectInput.profile": ["dark_truth", "mathematics_education", "dynamic_generic", "history"],
  "MathematicsEducationContent.grade": [5, 6, 7, 8, 9, 10],
  "MathematicsEducationContent.difficulty": ["foundation", "standard", "challenge"],
  "HistoryContent.presetId": ["military-campaign", "civilization-rise-fall", "historical-biography", "archaeology-mystery", "world-war-geopolitics", "royal-court-intrigue", "everyday-life", "disaster-pandemic-survival", "technology-trade-transformation", "dark-strange-history"],
  "HistoryContent.format": ["short", "standard", "long"],
  "HistoryContent.audienceLevel": ["general", "enthusiast", "academic-lite"],
  "HistoryContent.period": ["prehistory", "ancient", "late antiquity", "medieval", "early modern", "industrial age", "modern", "contemporary history", "cross-period"],
  "WorkflowAdmission.variants.items": ["full", "short"],
  "WorkflowAdmission.approvalMode": ["required", "automatic"],
  "WorkflowRun.status": ["queued", "running", "awaiting_approval", "succeeded", "failed", "cancelled"],
  "Job.status": ["queued", "running", "waiting_for_approval", "retry_scheduled", "cancelling", "cancelled", "succeeded", "succeeded_with_warnings", "partially_succeeded", "failed", "dead_lettered"],
  "JobFailureProblem.code": ["job_failed", "job_dead_lettered"],
  "Publication.status": ["pending", "executing", "published", "failed", "reconciliation_required", "cancelled"],
  "Publication.visibility": ["private", "unlisted", "public"],
  "ApprovalInput.decision": ["approved", "rejected"],
  "HealthStatus.status": ["ok", "ready", "unavailable"],
} as const;

export const SDK_V1_CONSTS = {
  "DarkTruthContent.type": "dark_truth",
  "DarkTruthContent.version": "1",
  "MathematicsEducationContent.type": "mathematics_education",
  "MathematicsEducationContent.version": "1",
  "HistoryContent.type": "history",
  "HistoryContent.version": "1",
  "WorkflowAdmission.template": "episode-production",
  "WorkflowAdmission.publicationMode": "none",
  "ApprovalRevoked.state": "revoked",
} as const;
