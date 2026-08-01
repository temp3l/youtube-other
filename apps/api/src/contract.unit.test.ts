import { describe, expect, it } from "vitest";

import { openApiDocument } from "./contract.js";

const expectedPaths = [
  "/health/live",
  "/health/ready",
  "/v1/openapi.json",
  "/v1/workspaces/{workspace}/quota",
  "/v1/workspaces/{workspace}/usage-records",
  "/v1/workspaces/{workspace}/audit-events",
  "/v1/workspaces/{workspace}/projects",
  "/v1/workspaces/{workspace}/projects/{project}/episodes",
  "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}",
  "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/workflow-runs",
  "/v1/workspaces/{workspace}/projects/{project}/workflow-runs/{run}",
  "/v1/workspaces/{workspace}/projects/{project}/workflow-runs/{run}/steps",
  "/v1/workspaces/{workspace}/projects/{project}/workflow-runs/{run}:cancel",
  "/v1/workspaces/{workspace}/projects/{project}/workflow-runs/{run}:resume",
  "/v1/workspaces/{workspace}/projects/{project}/jobs/{job}",
  "/v1/workspaces/{workspace}/projects/{project}/assets/{asset}",
  "/v1/workspaces/{workspace}/projects/{project}/validations",
  "/v1/workspaces/{workspace}/projects/{project}/approvals",
] as const;

type Operation = {
  readonly operationId: string;
  readonly description?: string;
  readonly parameters?: readonly { readonly $ref: string }[];
  readonly requestBody?: { readonly content: Record<string, unknown> };
  readonly responses: Record<string, { readonly $ref?: string; readonly content?: Record<string, unknown>; readonly headers?: Record<string, unknown> }>;
  readonly security?: readonly unknown[];
};

function operations(): Array<{ readonly path: string; readonly operation: Operation }> {
  return Object.entries(openApiDocument.paths).flatMap(([path, item]) =>
    Object.entries(item).map(([, operation]) => ({ path, operation: operation as Operation }))
  );
}

describe("OpenAPI contract", () => {
  it("covers every implemented route with unique operation identifiers", () => {
    expect(Object.keys(openApiDocument.paths)).toEqual(expectedPaths);
    const ids = operations().map(({ operation }) => operation.operationId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      "getLiveness", "getReadiness", "getOpenApiDocument", "getQuota",
      "listUsageRecords", "listAuditEvents", "createProject",
      "createEpisode", "getEpisode", "replaceEpisodeContent", "admitWorkflow", "getWorkflow",
      "listWorkflowSteps", "cancelWorkflow", "resumeWorkflow", "getJob",
      "getAsset", "listValidations", "recordApproval",
    ]);
  });

  it("defines reusable authentication, headers, parameters, and public schemas", () => {
    expect(openApiDocument.components.securitySchemes.BearerAuth).toEqual({
      type: "http", scheme: "bearer", bearerFormat: "JWT",
      description: "Workspace permissions are enforced per operation after token and membership validation.",
    });
    expect(openApiDocument.security).toEqual([{ BearerAuth: [] }]);
    expect(openApiDocument.components.parameters).toMatchObject({
      RequestId: { name: "x-request-id", in: "header" },
      IdempotencyKey: { name: "Idempotency-Key", in: "header", required: true },
      IfMatch: { name: "If-Match", in: "header", required: true },
      PageSize: { name: "page[size]", in: "query" },
      PageAfter: { name: "page[after]", in: "query" },
    });
    expect(openApiDocument.components.headers).toMatchObject({
      ETag: { required: true },
      RequestId: { required: true },
      Location: { required: true },
      RetryAfter: { required: true },
    });
    expect(Object.keys(openApiDocument.components.schemas)).toEqual(expect.arrayContaining([
      "Problem", "ProjectInput", "Project", "EpisodeInput", "Episode",
      "WorkflowAdmission", "WorkflowRun", "WorkflowStep", "Job", "Asset",
      "JobFailureProblem", "ValidationResult", "ValidationPage", "ApprovalInput", "ApprovalAccepted",
      "WorkspaceQuotaStatus", "UsageRecord", "UsageRecordPage", "AuditEvent", "AuditEventPage",
    ]));
    expect(openApiDocument.components.schemas.Problem.required).toEqual(expect.arrayContaining([
      "type", "title", "status", "detail", "code", "requestId", "retryable", "errors",
    ]));
  });

  it("keeps usage and quota integer values lossless on the JSON wire", () => {
    expect(openApiDocument.components.schemas.SignedBigIntString).toEqual({
      type: "string", pattern: "^-?(0|[1-9][0-9]*)$",
    });
    expect(openApiDocument.components.schemas.NonNegativeBigIntString).toEqual({
      type: "string", pattern: "^(0|[1-9][0-9]*)$",
    });
    expect(openApiDocument.components.schemas.WorkspaceQuotaStatus.properties).toMatchObject({
      budgetLimitMinor: { $ref: "#/components/schemas/NonNegativeBigIntString" },
      availableMinor: { $ref: "#/components/schemas/NonNegativeBigIntString" },
    });
    expect(openApiDocument.components.schemas.UsageRecord.properties).toMatchObject({
      quantityUnits: { $ref: "#/components/schemas/SignedBigIntString" },
      costMinor: { $ref: "#/components/schemas/SignedBigIntString" },
    });
  });

  it("models job progress and redacted terminal failures", () => {
    expect(openApiDocument.components.schemas.Job).toMatchObject({
      required: expect.arrayContaining(["attempts", "cancellationRequested"]),
      properties: {
        attempts: { type: "integer", minimum: 0 },
        cancellationRequested: { type: "boolean" },
        failure: { $ref: "#/components/schemas/JobFailureProblem" },
      },
      allOf: [{
        if: { properties: { status: { enum: ["failed", "dead_lettered"] } } },
        then: { required: ["failure"] },
        else: { not: { required: ["failure"] } },
      }],
    });
    expect(openApiDocument.components.schemas.JobFailureProblem).toMatchObject({
      additionalProperties: false,
      required: ["type", "title", "detail", "code", "retryable", "errors"],
      properties: {
        code: { enum: ["job_failed", "job_dead_lettered"] },
      },
    });
    expect(openApiDocument.components.schemas.JobFailureProblem.properties).not.toHaveProperty("status");
    expect(openApiDocument.components.schemas.JobFailureProblem.properties).not.toHaveProperty("requestId");
  });

  it("documents request bodies, command preconditions, and response wire formats", () => {
    const byId = new Map(operations().map(({ operation }) => [operation.operationId, operation]));
    for (const id of ["createProject", "createEpisode", "replaceEpisodeContent", "admitWorkflow", "recordApproval"]) {
      expect(byId.get(id)?.requestBody?.content).toHaveProperty("application/json");
    }
    expect(byId.get("admitWorkflow")?.parameters).toContainEqual({ $ref: "#/components/parameters/IdempotencyKey" });
    expect(byId.get("replaceEpisodeContent")?.parameters).toContainEqual({ $ref: "#/components/parameters/IfMatch" });
    expect(byId.get("cancelWorkflow")?.parameters).toContainEqual({ $ref: "#/components/parameters/IfMatch" });
    expect(byId.get("resumeWorkflow")?.parameters).toEqual(expect.arrayContaining([
      { $ref: "#/components/parameters/IfMatch" },
      { $ref: "#/components/parameters/IdempotencyKey" },
    ]));
    expect(byId.get("recordApproval")?.parameters).toEqual(expect.arrayContaining([
      { $ref: "#/components/parameters/IfMatch" },
      { $ref: "#/components/parameters/IdempotencyKey" },
    ]));

    for (const { operation } of operations()) {
      for (const wireResponse of Object.values(operation.responses)) {
        expect(wireResponse.$ref || wireResponse.content).toBeTruthy();
        if (!wireResponse.$ref) expect(wireResponse.headers).toHaveProperty("x-request-id");
      }
    }
    for (const responseName of Object.keys(openApiDocument.components.responses)) {
      const problem = openApiDocument.components.responses[responseName as keyof typeof openApiDocument.components.responses];
      expect(problem.content).toHaveProperty("application/problem+json");
      expect(problem.headers).toHaveProperty("x-request-id");
    }
  });

  it("documents the permission enforced by each workspace operation", () => {
    const expectedPermissions = new Map([
      ["getQuota", "usage.read"],
      ["listUsageRecords", "usage.read"],
      ["listAuditEvents", "audit.read"],
      ["createProject", "content.write"],
      ["createEpisode", "content.write"],
      ["getEpisode", "content.read"],
      ["replaceEpisodeContent", "content.write"],
      ["admitWorkflow", "workflow.start"],
      ["getWorkflow", "content.read"],
      ["listWorkflowSteps", "content.read"],
      ["cancelWorkflow", "workflow.cancel"],
      ["resumeWorkflow", "workflow.start"],
      ["getJob", "content.read"],
      ["getAsset", "content.read"],
      ["listValidations", "validation.read"],
      ["recordApproval", "approval.decide"],
    ]);
    for (const { path, operation } of operations()) {
      if (!path.startsWith("/v1/workspaces/")) continue;
      expect(operation.description).toContain(`\`${expectedPermissions.get(operation.operationId)}\``);
    }
  });

  it("keeps health and discovery unauthenticated and exposes no implementation details", () => {
    expect(openApiDocument.paths["/health/live"].get.security).toEqual([]);
    expect(openApiDocument.paths["/health/ready"].get.security).toEqual([]);
    expect(openApiDocument.paths["/v1/openapi.json"].get.security).toEqual([]);
    for (const { path, operation } of operations()) {
      if (path.startsWith("/v1/workspaces/")) expect(operation.security).toBeUndefined();
    }
    const serialized = JSON.stringify(openApiDocument);
    expect(serialized).not.toMatch(/\/_internal|workspaceDir|localPath|provider[A-Z_]|credential|argv|packageName/u);
  });
});
