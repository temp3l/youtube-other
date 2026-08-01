import { z } from "zod";

import { ApplicationError } from "@mediaforge/application";

const opaqueId = z.string().min(3).max(160).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u);
const mathGrade = z.union([
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
  z.literal(9),
  z.literal(10),
]);
const mathDifficulty = z.enum(["foundation", "standard", "challenge"]);
const mathSkillId = z
  .string()
  .regex(/^M(?:5|6|7|8|9|10)-[A-Z]{2}-\d{3}$/u);
const mathematicsEducationContentSchema = z
  .object({
    type: z.literal("mathematics_education"),
    version: z.literal("1"),
    curriculumSourceId: opaqueId,
    skillId: mathSkillId,
    grade: mathGrade,
    difficulty: mathDifficulty,
    presentationPresetId: opaqueId,
    audioPresetId: opaqueId,
  })
  .strict()
  .superRefine((value, context) => {
    if (Number(value.skillId.slice(1, value.skillId.indexOf("-"))) !== value.grade) {
      context.addIssue({
        code: "custom",
        path: ["skillId"],
        message: "Mathematics skill ID grade must match the selected grade.",
      });
    }
  });

export const projectInputSchema = z
  .object({ name: z.string().trim().min(1).max(160), profile: z.enum(["dark_truth", "mathematics_education"]) })
  .strict();
export const episodeInputSchema = z
  .object({
    content: z.discriminatedUnion("type", [
      z.object({ type: z.literal("dark_truth"), version: z.literal("1"), premise: z.string().trim().min(1).max(20_000), storyBibleId: opaqueId, referenceAssetIds: z.array(opaqueId).max(100) }).strict(),
      mathematicsEducationContentSchema,
    ]),
  })
  .strict();

/** Keeps parsed-but-unsupported profile capability input distinct from malformed JSON. */
export function parseEpisodeInput(value: unknown): EpisodeInput {
  const parsed = episodeInputSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const content = value && typeof value === "object"
    ? Reflect.get(value, "content")
    : undefined;
  if (
    content &&
    typeof content === "object" &&
    Reflect.get(content, "type") === "mathematics_education"
  ) {
    throw new ApplicationError(
      "profile_input_invalid",
      "Mathematics episode input is outside the supported profile capability.",
      false,
      [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))]
    );
  }
  throw parsed.error;
}
export const workflowAdmissionSchema = z
  .object({
    template: z.literal("episode-production"),
    episodeRevision: z.number().int().nonnegative(),
    locales: z.array(z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/u)).min(1).max(10),
    variants: z.array(z.enum(["full", "short"])).min(1).max(2),
    approvalMode: z.enum(["required", "automatic"]),
    publicationMode: z.literal("none"),
  })
  .strict();
export const approvalInputSchema = z
  .object({
    challengeId: opaqueId,
    subjectId: opaqueId,
    expectedRevision: z.number().int().nonnegative(),
    decision: z.enum(["approved", "rejected"]),
    reason: z.string().trim().min(1).max(2_000),
  })
  .strict();

const schema = (name: string) => ({ $ref: `#/components/schemas/${name}` }) as const;
const parameter = (name: string) => ({ $ref: `#/components/parameters/${name}` }) as const;
const response = (name: string) => ({ $ref: `#/components/responses/${name}` }) as const;
const responseHeader = (name: string) => ({ $ref: `#/components/headers/${name}` }) as const;
const json = (name: string) => ({ "application/json": { schema: schema(name) } }) as const;

const requestIdParameter = parameter("RequestId");
const workspaceParameters = [parameter("WorkspaceId"), requestIdParameter] as const;
const projectParameters = [parameter("WorkspaceId"), parameter("ProjectId"), requestIdParameter] as const;
const episodeParameters = [...projectParameters, parameter("EpisodeId")] as const;
const workflowParameters = [...projectParameters, parameter("WorkflowRunId")] as const;
const jobParameters = [...projectParameters, parameter("JobId")] as const;
const assetParameters = [...projectParameters, parameter("AssetId")] as const;
const authenticatedErrors = {
  "401": response("Unauthorized"),
  "403": response("Forbidden"),
} as const;

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Mediaforge API",
    version: "1.0.0",
    description: "Versioned API for asynchronous media production workflows.",
  },
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  security: [{ BearerAuth: [] }],
  paths: {
    "/health/live": {
      get: {
        operationId: "getLiveness",
        security: [],
        parameters: [requestIdParameter],
        responses: {
          "200": { description: "Process is live", headers: { "x-request-id": responseHeader("RequestId") }, content: json("HealthStatus") },
        },
      },
    },
    "/health/ready": {
      get: {
        operationId: "getReadiness",
        security: [],
        parameters: [requestIdParameter],
        responses: {
          "200": { description: "Dependencies are ready", headers: { "x-request-id": responseHeader("RequestId") }, content: json("HealthStatus") },
          "503": { description: "Dependencies are unavailable", headers: { "x-request-id": responseHeader("RequestId") }, content: json("HealthStatus") },
        },
      },
    },
    "/v1/openapi.json": {
      get: {
        operationId: "getOpenApiDocument",
        security: [],
        parameters: [requestIdParameter],
        responses: {
          "200": { description: "OpenAPI 3.1 contract", headers: { "x-request-id": responseHeader("RequestId") }, content: json("OpenApiDocument") },
        },
      },
    },
    "/v1/workspaces/{workspace}/quota": {
      get: {
        operationId: "getQuota",
        description: "Requires the `usage.read` workspace permission. Returns 404 when no quota policy is configured.",
        parameters: workspaceParameters,
        responses: {
          "200": { description: "Configured workspace quota status", headers: { ETag: responseHeader("ETag"), "x-request-id": responseHeader("RequestId") }, content: json("WorkspaceQuotaStatus") },
          ...authenticatedErrors,
          "404": response("NotFound"),
        },
      },
    },
    "/v1/workspaces/{workspace}/usage-records": {
      get: {
        operationId: "listUsageRecords",
        description: "Requires the `usage.read` workspace permission.",
        parameters: [...workspaceParameters, parameter("PageSize"), parameter("PageAfter")],
        responses: {
          "200": { description: "Usage ledger page", headers: { "x-request-id": responseHeader("RequestId") }, content: json("UsageRecordPage") },
          "400": response("BadRequest"),
          ...authenticatedErrors,
          "404": response("NotFound"),
        },
      },
    },
    "/v1/workspaces/{workspace}/audit-events": {
      get: {
        operationId: "listAuditEvents",
        description: "Requires the `audit.read` workspace permission.",
        parameters: [...workspaceParameters, parameter("PageSize"), parameter("PageAfter")],
        responses: {
          "200": { description: "Immutable audit event page", headers: { "x-request-id": responseHeader("RequestId") }, content: json("AuditEventPage") },
          "400": response("BadRequest"),
          ...authenticatedErrors,
          "404": response("NotFound"),
        },
      },
    },
    "/v1/workspaces/{workspace}/projects": {
      post: {
        operationId: "createProject",
        description: "Requires the `content.write` workspace permission.",
        parameters: workspaceParameters,
        requestBody: { required: true, content: json("ProjectInput") },
        responses: {
          "201": { description: "Project created", headers: { ETag: responseHeader("ETag"), "x-request-id": responseHeader("RequestId") }, content: json("Project") },
          "400": response("BadRequest"),
          ...authenticatedErrors,
          "409": response("Conflict"),
        },
      },
    },
    "/v1/workspaces/{workspace}/projects/{project}/episodes": {
      post: {
        operationId: "createEpisode",
        description: "Requires the `content.write` workspace permission.",
        parameters: projectParameters,
        requestBody: { required: true, content: json("EpisodeInput") },
        responses: {
          "201": { description: "Episode created", headers: { ETag: responseHeader("ETag"), "x-request-id": responseHeader("RequestId") }, content: json("EpisodeCreated") },
          "400": response("BadRequest"),
          ...authenticatedErrors,
          "404": response("NotFound"),
          "409": response("Conflict"),
          "422": response("UnprocessableEntity"),
        },
      },
    },
    "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}": {
      get: {
        operationId: "getEpisode",
        description: "Requires the `content.read` workspace permission.",
        parameters: episodeParameters,
        responses: {
          "200": { description: "Episode", headers: { ETag: responseHeader("ETag"), "x-request-id": responseHeader("RequestId") }, content: json("Episode") },
          ...authenticatedErrors,
          "404": response("NotFound"),
        },
      },
      patch: {
        operationId: "replaceEpisodeContent",
        description: "Replaces the complete typed episode content. Requires the `content.write` workspace permission and a current strong ETag.",
        parameters: [...episodeParameters, parameter("IfMatch")],
        requestBody: { required: true, content: json("EpisodeInput") },
        responses: {
          "200": { description: "Updated episode", headers: { ETag: responseHeader("ETag"), "x-request-id": responseHeader("RequestId") }, content: json("Episode") },
          "400": response("BadRequest"),
          ...authenticatedErrors,
          "404": response("NotFound"),
          "412": response("PreconditionFailed"),
          "422": response("UnprocessableEntity"),
          "428": response("PreconditionRequired"),
        },
      },
    },
    "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/workflow-runs": {
      post: {
        operationId: "admitWorkflow",
        description: "Requires the `workflow.start` workspace permission.",
        parameters: [...episodeParameters, parameter("IdempotencyKey")],
        requestBody: { required: true, content: json("WorkflowAdmission") },
        responses: {
          "202": { description: "Workflow accepted", headers: { Location: responseHeader("Location"), "Retry-After": responseHeader("RetryAfter"), ETag: responseHeader("ETag"), "x-request-id": responseHeader("RequestId") }, content: json("WorkflowCommandAccepted") },
          "400": response("BadRequest"),
          ...authenticatedErrors,
          "404": response("NotFound"),
          "409": response("Conflict"),
          "422": response("UnprocessableEntity"),
          "428": response("PreconditionRequired"),
          "429": response("TooManyRequests"),
          "503": response("Unavailable"),
        },
      },
    },
    "/v1/workspaces/{workspace}/projects/{project}/workflow-runs/{run}": {
      get: {
        operationId: "getWorkflow",
        description: "Requires the `content.read` workspace permission.",
        parameters: workflowParameters,
        responses: {
          "200": { description: "Workflow status", headers: { ETag: responseHeader("ETag"), "x-request-id": responseHeader("RequestId") }, content: json("WorkflowRun") },
          ...authenticatedErrors,
          "404": response("NotFound"),
        },
      },
    },
    "/v1/workspaces/{workspace}/projects/{project}/workflow-runs/{run}/steps": {
      get: {
        operationId: "listWorkflowSteps",
        description: "Requires the `content.read` workspace permission.",
        parameters: workflowParameters,
        responses: {
          "200": { description: "Workflow step summaries", headers: { "x-request-id": responseHeader("RequestId") }, content: json("WorkflowStepPage") },
          ...authenticatedErrors,
          "404": response("NotFound"),
        },
      },
    },
    "/v1/workspaces/{workspace}/projects/{project}/workflow-runs/{run}:cancel": {
      post: {
        operationId: "cancelWorkflow",
        description: "Requires the `workflow.cancel` workspace permission.",
        parameters: [...workflowParameters, parameter("IfMatch")],
        responses: {
          "202": { description: "Cancellation accepted", headers: { Location: responseHeader("Location"), "Retry-After": responseHeader("RetryAfter"), ETag: responseHeader("ETag"), "x-request-id": responseHeader("RequestId") }, content: json("WorkflowCommandAccepted") },
          ...authenticatedErrors,
          "404": response("NotFound"),
          "409": response("Conflict"),
          "412": response("PreconditionFailed"),
          "428": response("PreconditionRequired"),
        },
      },
    },
    "/v1/workspaces/{workspace}/projects/{project}/workflow-runs/{run}:resume": {
      post: {
        operationId: "resumeWorkflow",
        description: "Requires the `workflow.start` workspace permission.",
        parameters: [...workflowParameters, parameter("IfMatch"), parameter("IdempotencyKey")],
        responses: {
          "202": { description: "Resume accepted", headers: { Location: responseHeader("Location"), "Retry-After": responseHeader("RetryAfter"), ETag: responseHeader("ETag"), "x-request-id": responseHeader("RequestId") }, content: json("WorkflowCommandAccepted") },
          ...authenticatedErrors,
          "404": response("NotFound"),
          "409": response("Conflict"),
          "412": response("PreconditionFailed"),
          "428": response("PreconditionRequired"),
          "429": response("TooManyRequests"),
          "503": response("Unavailable"),
        },
      },
    },
    "/v1/workspaces/{workspace}/projects/{project}/jobs/{job}": {
      get: {
        operationId: "getJob",
        description: "Requires the `content.read` workspace permission.",
        parameters: jobParameters,
        responses: {
          "200": { description: "Job status", headers: { ETag: responseHeader("ETag"), "x-request-id": responseHeader("RequestId") }, content: json("Job") },
          ...authenticatedErrors,
          "404": response("NotFound"),
        },
      },
    },
    "/v1/workspaces/{workspace}/projects/{project}/assets/{asset}": {
      get: {
        operationId: "getAsset",
        description: "Requires the `content.read` workspace permission.",
        parameters: assetParameters,
        responses: {
          "200": { description: "Asset descriptor", headers: { "x-request-id": responseHeader("RequestId") }, content: json("Asset") },
          ...authenticatedErrors,
          "404": response("NotFound"),
        },
      },
    },
    "/v1/workspaces/{workspace}/projects/{project}/validations": {
      get: {
        operationId: "listValidations",
        description: "Requires the `validation.read` workspace permission.",
        parameters: [...projectParameters, parameter("PageSize"), parameter("PageAfter")],
        responses: {
          "200": { description: "Validation page", headers: { "x-request-id": responseHeader("RequestId") }, content: json("ValidationPage") },
          "400": response("BadRequest"),
          ...authenticatedErrors,
          "404": response("NotFound"),
        },
      },
    },
    "/v1/workspaces/{workspace}/projects/{project}/approvals": {
      post: {
        operationId: "recordApproval",
        description: "Requires the `approval.decide` workspace permission.",
        parameters: [...projectParameters, parameter("IfMatch"), parameter("IdempotencyKey")],
        requestBody: { required: true, content: json("ApprovalInput") },
        responses: {
          "202": { description: "Approval accepted", headers: { Location: responseHeader("Location"), ETag: responseHeader("ETag"), "x-request-id": responseHeader("RequestId") }, content: json("ApprovalAccepted") },
          "400": response("BadRequest"),
          ...authenticatedErrors,
          "404": response("NotFound"),
          "409": response("Conflict"),
          "412": response("PreconditionFailed"),
          "422": response("UnprocessableEntity"),
          "428": response("PreconditionRequired"),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "Workspace permissions are enforced per operation after token and membership validation." },
    },
    headers: {
      ETag: { description: "Strong resource revision tag.", required: true, schema: { type: "string", pattern: '^"(0|[1-9][0-9]*)"$' } },
      RequestId: { description: "Request correlation identifier.", required: true, schema: { type: "string", minLength: 3, maxLength: 160, pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{2,159}$" } },
      Location: { description: "Canonical URL of the asynchronous job.", required: true, schema: { type: "string" } },
      RetryAfter: { description: "Suggested polling delay in seconds.", required: true, schema: { type: "string", pattern: "^[0-9]+$" } },
    },
    parameters: {
      RequestId: { name: "x-request-id", in: "header", required: false, schema: { type: "string", minLength: 3, maxLength: 160, pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{2,159}$" } },
      IdempotencyKey: { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 255, pattern: "^[\\x20-\\x7E]+$" } },
      IfMatch: { name: "If-Match", in: "header", required: true, schema: { type: "string", pattern: '^"(0|[1-9][0-9]*)"$' } },
      WorkspaceId: { name: "workspace", in: "path", required: true, schema: schema("OpaqueId") },
      ProjectId: { name: "project", in: "path", required: true, schema: schema("OpaqueId") },
      EpisodeId: { name: "episode", in: "path", required: true, schema: schema("OpaqueId") },
      WorkflowRunId: { name: "run", in: "path", required: true, schema: schema("OpaqueId") },
      JobId: { name: "job", in: "path", required: true, schema: schema("OpaqueId") },
      AssetId: { name: "asset", in: "path", required: true, schema: schema("OpaqueId") },
      PageSize: { name: "page[size]", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
      PageAfter: { name: "page[after]", in: "query", required: false, schema: { type: "string", minLength: 1, maxLength: 4_096 } },
    },
    schemas: {
      OpaqueId: { type: "string", minLength: 3, maxLength: 160, pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$" },
      Revision: { type: "integer", minimum: 0 },
      SignedBigIntString: { type: "string", pattern: "^-?(0|[1-9][0-9]*)$" },
      NonNegativeBigIntString: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
      WorkspaceQuotaStatus: {
        type: "object",
        additionalProperties: false,
        required: ["workspaceId", "budgetLimitMinor", "reservedMinor", "settledMinor", "availableMinor", "revision"],
        properties: {
          workspaceId: schema("OpaqueId"),
          budgetLimitMinor: schema("NonNegativeBigIntString"),
          reservedMinor: schema("NonNegativeBigIntString"),
          settledMinor: schema("NonNegativeBigIntString"),
          availableMinor: schema("NonNegativeBigIntString"),
          revision: schema("Revision"),
        },
      },
      UsageRecord: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "subjectId", "operation", "unit", "quantityUnits", "costMinor", "correctionOfUsageId", "attemptId", "data", "occurredAt"],
        properties: {
          id: schema("OpaqueId"),
          kind: { type: "string", enum: ["usage", "correction"] },
          subjectId: schema("OpaqueId"),
          operation: { type: "string" },
          unit: { type: "string" },
          quantityUnits: schema("SignedBigIntString"),
          costMinor: schema("SignedBigIntString"),
          correctionOfUsageId: { oneOf: [schema("OpaqueId"), { type: "null" }] },
          attemptId: { oneOf: [schema("OpaqueId"), { type: "null" }] },
          data: {},
          occurredAt: { type: "string", format: "date-time" },
        },
      },
      UsageRecordPage: {
        type: "object",
        additionalProperties: false,
        required: ["items"],
        properties: {
          items: { type: "array", items: schema("UsageRecord") },
          nextAfter: { type: "string", minLength: 1, maxLength: 4_096 },
        },
      },
      AuditEvent: {
        type: "object",
        additionalProperties: false,
        required: ["id", "action", "subjectId", "actorId", "correlationId", "causationId", "data", "occurredAt"],
        properties: {
          id: schema("OpaqueId"),
          action: { type: "string" },
          subjectId: schema("OpaqueId"),
          actorId: schema("OpaqueId"),
          correlationId: schema("OpaqueId"),
          causationId: { oneOf: [schema("OpaqueId"), { type: "null" }] },
          data: {},
          occurredAt: { type: "string", format: "date-time" },
        },
      },
      AuditEventPage: {
        type: "object",
        additionalProperties: false,
        required: ["items"],
        properties: {
          items: { type: "array", items: schema("AuditEvent") },
          nextAfter: { type: "string", minLength: 1, maxLength: 4_096 },
        },
      },
      ProjectInput: {
        type: "object",
        additionalProperties: false,
        required: ["name", "profile"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 160 },
          profile: { type: "string", enum: ["dark_truth", "mathematics_education"] },
        },
      },
      Project: {
        type: "object",
        additionalProperties: false,
        required: ["id", "revision"],
        properties: { id: schema("OpaqueId"), revision: schema("Revision") },
      },
      DarkTruthContent: {
        type: "object",
        additionalProperties: false,
        required: ["type", "version", "premise", "storyBibleId", "referenceAssetIds"],
        properties: {
          type: { const: "dark_truth" },
          version: { const: "1" },
          premise: { type: "string", minLength: 1, maxLength: 20_000 },
          storyBibleId: schema("OpaqueId"),
          referenceAssetIds: { type: "array", maxItems: 100, items: schema("OpaqueId") },
        },
      },
      MathematicsEducationContent: {
        type: "object",
        additionalProperties: false,
        required: ["type", "version", "curriculumSourceId", "skillId", "grade", "difficulty", "presentationPresetId", "audioPresetId"],
        properties: {
          type: { const: "mathematics_education" },
          version: { const: "1" },
          curriculumSourceId: schema("OpaqueId"),
          skillId: { type: "string", pattern: "^M(?:5|6|7|8|9|10)-[A-Z]{2}-\\d{3}$" },
          grade: { type: "integer", enum: [5, 6, 7, 8, 9, 10] },
          difficulty: { type: "string", enum: ["foundation", "standard", "challenge"] },
          presentationPresetId: schema("OpaqueId"),
          audioPresetId: schema("OpaqueId"),
        },
      },
      EpisodeContent: {
        oneOf: [schema("DarkTruthContent"), schema("MathematicsEducationContent")],
        discriminator: { propertyName: "type" },
      },
      EpisodeInput: {
        type: "object",
        additionalProperties: false,
        required: ["content"],
        properties: { content: schema("EpisodeContent") },
      },
      EpisodeCreated: {
        type: "object",
        additionalProperties: false,
        required: ["id", "revision"],
        properties: { id: schema("OpaqueId"), revision: schema("Revision") },
      },
      Episode: {
        type: "object",
        additionalProperties: false,
        required: ["id", "revision", "content"],
        properties: { id: schema("OpaqueId"), revision: schema("Revision"), content: schema("EpisodeContent") },
      },
      WorkflowAdmission: {
        type: "object",
        additionalProperties: false,
        required: ["template", "episodeRevision", "locales", "variants", "approvalMode", "publicationMode"],
        properties: {
          template: { const: "episode-production" },
          episodeRevision: schema("Revision"),
          locales: { type: "array", minItems: 1, maxItems: 10, uniqueItems: true, items: { type: "string", pattern: "^[a-z]{2}(?:-[A-Z]{2})?$" } },
          variants: { type: "array", minItems: 1, maxItems: 2, uniqueItems: true, items: { type: "string", enum: ["full", "short"] } },
          approvalMode: { type: "string", enum: ["required", "automatic"] },
          publicationMode: { const: "none" },
        },
      },
      ResourceLinks: {
        type: "object",
        additionalProperties: false,
        required: ["workflowRun", "job"],
        properties: { workflowRun: { type: "string" }, job: { type: "string" } },
      },
      WorkflowCommandAccepted: {
        type: "object",
        additionalProperties: false,
        required: ["workflowRunId", "jobId", "revision", "links"],
        properties: {
          workflowRunId: schema("OpaqueId"),
          jobId: schema("OpaqueId"),
          revision: schema("Revision"),
          links: schema("ResourceLinks"),
        },
      },
      WorkflowRun: {
        type: "object",
        additionalProperties: false,
        required: ["id", "revision", "status"],
        properties: {
          id: schema("OpaqueId"),
          revision: schema("Revision"),
          status: { type: "string", enum: ["queued", "running", "awaiting_approval", "succeeded", "failed", "cancelled"] },
        },
      },
      WorkflowStep: {
        type: "object",
        additionalProperties: false,
        required: ["id", "status"],
        properties: {
          id: schema("OpaqueId"),
          status: { type: "string" },
          phase: { type: "string" },
          message: { type: "string", maxLength: 2_000 },
        },
      },
      WorkflowStepPage: {
        type: "object",
        additionalProperties: false,
        required: ["items"],
        properties: { items: { type: "array", items: schema("WorkflowStep") } },
      },
      Job: {
        type: "object",
        additionalProperties: false,
        description: "Asynchronous job status. `failure` is present only for failed or dead-lettered jobs and never contains the persisted raw cause.",
        required: ["id", "revision", "status", "attempts", "cancellationRequested"],
        properties: {
          id: schema("OpaqueId"),
          revision: schema("Revision"),
          status: { type: "string", enum: ["queued", "running", "waiting_for_approval", "retry_scheduled", "cancelling", "cancelled", "succeeded", "succeeded_with_warnings", "partially_succeeded", "failed", "dead_lettered"] },
          attempts: { type: "integer", minimum: 0 },
          cancellationRequested: { type: "boolean" },
          failure: schema("JobFailureProblem"),
        },
        allOf: [{
          if: { properties: { status: { enum: ["failed", "dead_lettered"] } }, required: ["status"] },
          then: { required: ["failure"] },
          else: { not: { required: ["failure"] } },
        }],
      },
      JobFailureProblem: {
        type: "object",
        additionalProperties: false,
        description: "Redacted RFC 9457-like asynchronous failure. It intentionally omits HTTP status and request identifiers.",
        required: ["type", "title", "detail", "code", "retryable", "errors"],
        properties: {
          type: { type: "string", format: "uri" },
          title: { type: "string" },
          detail: { type: "string" },
          code: { type: "string", enum: ["job_failed", "job_dead_lettered"] },
          retryable: { type: "boolean" },
          errors: { type: "array", items: schema("ProblemError") },
        },
      },
      Asset: {
        type: "object",
        additionalProperties: false,
        required: ["id", "mimeType", "bytes", "sha256", "lifecycle", "provenance"],
        properties: {
          id: schema("OpaqueId"),
          mimeType: { type: "string", pattern: "^[^/]+/[^/]+$" },
          bytes: { type: "integer", minimum: 0 },
          sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
          lifecycle: { type: "string" },
          provenance: { type: "string" },
        },
      },
      ValidationResult: {
        type: "object",
        required: ["id", "createdAt"],
        properties: {
          id: schema("OpaqueId"),
          createdAt: { type: "string", format: "date-time" },
          status: { type: "string" },
          code: { type: "string" },
          message: { type: "string", maxLength: 2_000 },
        },
      },
      ValidationPage: {
        type: "object",
        additionalProperties: false,
        required: ["items"],
        properties: {
          items: { type: "array", items: schema("ValidationResult") },
          nextAfter: { type: "string" },
        },
      },
      ApprovalInput: {
        type: "object",
        additionalProperties: false,
        required: ["challengeId", "subjectId", "expectedRevision", "decision", "reason"],
        properties: {
          challengeId: schema("OpaqueId"),
          subjectId: schema("OpaqueId"),
          expectedRevision: schema("Revision"),
          decision: { type: "string", enum: ["approved", "rejected"] },
          reason: { type: "string", minLength: 1, maxLength: 2_000 },
        },
      },
      ApprovalAccepted: {
        type: "object",
        additionalProperties: false,
        required: ["id", "jobId", "revision"],
        properties: { id: schema("OpaqueId"), jobId: schema("OpaqueId"), revision: schema("Revision") },
      },
      ProblemError: {
        type: "object",
        additionalProperties: false,
        required: ["path", "message"],
        properties: { path: { type: "string" }, message: { type: "string" } },
      },
      Problem: {
        type: "object",
        additionalProperties: false,
        required: ["type", "title", "status", "detail", "code", "requestId", "retryable", "errors"],
        properties: {
          type: { type: "string", format: "uri" },
          title: { type: "string" },
          status: { type: "integer", minimum: 400, maximum: 599 },
          detail: { type: "string" },
          code: { type: "string", pattern: "^[a-z][a-z0-9_]*$" },
          requestId: { type: "string" },
          retryable: { type: "boolean" },
          errors: { type: "array", items: schema("ProblemError") },
        },
      },
      HealthStatus: {
        type: "object",
        additionalProperties: false,
        required: ["status"],
        properties: { status: { type: "string", enum: ["ok", "ready", "unavailable"] } },
      },
      OpenApiDocument: { type: "object", additionalProperties: true },
    },
    responses: {
      BadRequest: { description: "Request syntax or shape is invalid", headers: { "x-request-id": responseHeader("RequestId") }, content: { "application/problem+json": { schema: schema("Problem") } } },
      Unauthorized: { description: "Authentication is required", headers: { "x-request-id": responseHeader("RequestId") }, content: { "application/problem+json": { schema: schema("Problem") } } },
      Forbidden: { description: "Permission is denied", headers: { "x-request-id": responseHeader("RequestId") }, content: { "application/problem+json": { schema: schema("Problem") } } },
      NotFound: { description: "Resource was not found", headers: { "x-request-id": responseHeader("RequestId") }, content: { "application/problem+json": { schema: schema("Problem") } } },
      Conflict: { description: "State or idempotency conflict", headers: { "x-request-id": responseHeader("RequestId") }, content: { "application/problem+json": { schema: schema("Problem") } } },
      PreconditionFailed: { description: "The supplied precondition is stale", headers: { "x-request-id": responseHeader("RequestId") }, content: { "application/problem+json": { schema: schema("Problem") } } },
      UnprocessableEntity: { description: "Request is semantically invalid", headers: { "x-request-id": responseHeader("RequestId") }, content: { "application/problem+json": { schema: schema("Problem") } } },
      PreconditionRequired: { description: "A required precondition header is missing", headers: { "x-request-id": responseHeader("RequestId") }, content: { "application/problem+json": { schema: schema("Problem") } } },
      TooManyRequests: { description: "A quota or rate limit was exceeded", headers: { "x-request-id": responseHeader("RequestId") }, content: { "application/problem+json": { schema: schema("Problem") } } },
      Unavailable: { description: "A required dependency is unavailable", headers: { "x-request-id": responseHeader("RequestId") }, content: { "application/problem+json": { schema: schema("Problem") } } },
    },
  },
} as const;

export type ProjectInput = z.infer<typeof projectInputSchema>;
export type EpisodeInput = z.infer<typeof episodeInputSchema>;
export type WorkflowAdmission = z.infer<typeof workflowAdmissionSchema>;
export type ApprovalInput = z.infer<typeof approvalInputSchema>;
