import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { createApiServer, createApiWorkflowAdmissionUseCase, createDirectoryBackedRequestAuthenticator, createOidcRequestAuthenticator, type ApiUseCases } from "./index.js";

const useCases: ApiUseCases = {
  getQuota: async () => ({ workspaceId: "ws-1", budgetLimitMinor: "100", reservedMinor: "20", settledMinor: "30", availableMinor: "50", revision: 1 }),
  listUsageRecords: async () => ({ items: [] }),
  listAuditEvents: async () => ({ items: [] }),
  createProject: async () => ({ id: "project-1", revision: 3 }),
  createEpisode: async () => ({ id: "episode-1", revision: 2 }),
  getEpisode: async () => ({ id: "episode-1", revision: 2, content: { type: "dark_truth", version: "1" } }),
  replaceEpisodeContent: async (id, input) => ({ id, revision: 3, content: input.content }),
  admitWorkflow: async () => ({ workflowRunId: "run-1", jobId: "job-1", revision: 0 }),
  getWorkflow: async () => ({ id: "run-1", revision: 2, status: "queued" }),
  listWorkflowSteps: async () => ({ items: [] }),
  cancelWorkflow: async () => ({ workflowRunId: "run-1", jobId: "job-cancel", revision: 3 }),
  resumeWorkflow: async () => ({ workflowRunId: "run-1", jobId: "job-resume", revision: 4 }),
  getJob: async () => ({ id: "job-1", revision: 1, status: "queued", attempts: 0, cancellationRequested: false }),
  getAsset: async () => null,
  listValidations: async () => ({ items: [] }),
  recordApproval: async () => ({ id: "approval-1", jobId: "job-2", revision: 4 }),
};
const authenticate = async () => ({
  principalId: "user-1",
  workspaceId: "ws-1",
  permissions: [
    "approval.decide",
    "audit.read",
    "content.read",
    "content.write",
    "validation.read",
    "usage.read",
    "workflow.cancel",
    "workflow.start",
  ],
  kind: "user" as const,
});

async function serve(server: http.Server): Promise<{ readonly baseUrl: string; readonly close: () => Promise<void> }> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
  return { baseUrl: `http://127.0.0.1:${address.port}`, close: async () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

async function request(input: {
  readonly url: string;
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
}): Promise<{ readonly status: number; readonly headers: http.IncomingHttpHeaders; readonly body: string }> {
  return new Promise((resolve, reject) => {
    const target = new URL(input.url);
    const outgoing = http.request({ hostname: target.hostname, port: target.port, path: `${target.pathname}${target.search}`, method: input.method, headers: input.headers, agent: false }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    outgoing.on("error", reject);
    outgoing.end(input.body);
  });
}

describe("HTTP API contract", () => {
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => { await Promise.all(closers.splice(0).map((close) => close())); });

  it("publishes a versioned OpenAPI document without local runtime details", async () => {
    const running = await serve(createApiServer({ useCases, authenticate, requestId: () => "request-1" }));
    closers.push(running.close);
    const response = await request({ url: `${running.baseUrl}/v1/openapi.json` });
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body) as unknown).toMatchObject({
      openapi: "3.1.0",
      paths: {
        "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}": { get: { operationId: "getEpisode" } },
        "/v1/workspaces/{workspace}/projects/{project}/workflow-runs/{run}/steps": { get: { operationId: "listWorkflowSteps" } },
        "/v1/workspaces/{workspace}/projects/{project}/workflow-runs/{run}:cancel": { post: { operationId: "cancelWorkflow" } },
        "/v1/workspaces/{workspace}/projects/{project}/workflow-runs/{run}:resume": { post: { operationId: "resumeWorkflow" } },
        "/v1/workspaces/{workspace}/projects/{project}/jobs/{job}": { get: { operationId: "getJob" } },
      },
    });
    expect(response.body).not.toContain("workspaceDir");
  });

  it("creates a project at the advertised workspace project collection route", async () => {
    const created: unknown[] = [];
    const running = await serve(createApiServer({
      useCases: {
        ...useCases,
        createProject: async (input, context) => {
          created.push({ input, context });
          return { id: "project-created", revision: 0 };
        },
      },
      authenticate,
      requestId: () => "request-project",
    }));
    closers.push(running.close);
    const response = await request({
      url: `${running.baseUrl}/v1/workspaces/ws-1/projects`,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Project", profile: "dark_truth" }),
    });
    expect(response.status).toBe(201);
    expect(response.headers.etag).toBe('"0"');
    expect(created).toEqual([
      expect.objectContaining({
        input: { name: "Project", profile: "dark_truth" },
        context: expect.objectContaining({ workspaceId: "ws-1" }),
      }),
    ]);

    const itemResponse = await request({
      url: `${running.baseUrl}/v1/workspaces/ws-1/projects/not-a-collection`,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Project", profile: "dark_truth" }),
    });
    expect(itemResponse.status).toBe(404);
    expect(created).toHaveLength(1);
  });

  it("maps workflow admission to one use case and returns asynchronous contract headers", async () => {
    const admitted: unknown[] = [];
    const running = await serve(createApiServer({
      useCases: { ...useCases, admitWorkflow: async (input, context) => { admitted.push({ input, context }); return { workflowRunId: "run-1", jobId: "job-1", revision: 0 }; } },
      authenticate,
      requestId: () => "request-2",
    }));
    closers.push(running.close);
    const response = await request({
      url: `${running.baseUrl}/v1/workspaces/ws-1/projects/project-1/episodes/episode-1/workflow-runs`,
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": "workflow-key" },
      body: JSON.stringify({ template: "episode-production", episodeRevision: 1, locales: ["en"], variants: ["full"], approvalMode: "required", publicationMode: "none" }),
    });
    expect(response.status).toBe(202);
    expect(response.headers.location).toContain("jobs/job-1");
    expect(response.headers["retry-after"]).toBe("3");
    expect(JSON.parse(response.body) as unknown).toMatchObject({ workflowRunId: "run-1", links: { workflowRun: expect.stringContaining("workflow-runs/run-1") } });
    expect(admitted).toEqual([expect.objectContaining({ context: expect.objectContaining({ workspaceId: "ws-1", projectId: "project-1", episodeId: "episode-1", idempotencyKey: "workflow-key" }) })]);
  });

  it("replaces complete typed episode content under a strong If-Match", async () => {
    const replacements: unknown[] = [];
    const running = await serve(createApiServer({
      useCases: {
        ...useCases,
        replaceEpisodeContent: async (id, input, context) => {
          replacements.push({ id, input, context });
          return { id, revision: 3, content: input.content };
        },
      },
      authenticate,
      requestId: () => "request-replace-episode",
    }));
    closers.push(running.close);
    const input = { content: { type: "dark_truth", version: "1", premise: "Replacement", storyBibleId: "bible-1", referenceAssetIds: [] } } as const;

    const response = await request({
      url: `${running.baseUrl}/v1/workspaces/ws-1/projects/project-1/episodes/episode-1`,
      method: "PATCH",
      headers: { "content-type": "application/json", "if-match": '"2"' },
      body: JSON.stringify(input),
    });
    expect(response.status).toBe(200);
    expect(response.headers.etag).toBe('"3"');
    expect(JSON.parse(response.body) as unknown).toEqual({ id: "episode-1", revision: 3, content: input.content });
    expect(replacements).toEqual([expect.objectContaining({ id: "episode-1", input, context: expect.objectContaining({ ifMatch: '"2"', principal: expect.objectContaining({ principalId: "user-1" }) }) })]);

    const missing = await request({
      url: `${running.baseUrl}/v1/workspaces/ws-1/projects/project-1/episodes/episode-1`,
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    expect(missing.status).toBe(428);
    const weak = await request({
      url: `${running.baseUrl}/v1/workspaces/ws-1/projects/project-1/episodes/episode-1`,
      method: "PATCH",
      headers: { "content-type": "application/json", "if-match": "W/\"2\"" },
      body: "{",
    });
    expect(weak.status).toBe(412);
    expect(replacements).toHaveLength(1);
  });

  it("maps episode, job, and workflow-step reads to their exact use cases", async () => {
    const calls: unknown[] = [];
    const running = await serve(createApiServer({
      useCases: {
        ...useCases,
        getEpisode: async (id, context) => { calls.push({ operation: "episode", id, context }); return { id, revision: 5, content: { type: "dark_truth", version: "1" } }; },
        getJob: async (id, context) => {
          calls.push({ operation: "job", id, context });
          return {
            id,
            revision: 6,
            status: "failed",
            attempts: 2,
            cancellationRequested: true,
            failure: {
              type: "https://mediaforge.invalid/problems/job-failed",
              title: "Job failed",
              detail: "The job did not complete successfully.",
              code: "job_failed",
              retryable: false,
              errors: [],
            },
          };
        },
        listWorkflowSteps: async (id, context) => { calls.push({ operation: "steps", id, context }); return { items: [{ id: "phase-render", status: "running" }] }; },
      },
      authenticate,
      requestId: () => "request-read",
    }));
    closers.push(running.close);

    const episode = await request({ url: `${running.baseUrl}/v1/workspaces/ws-1/projects/project-1/episodes/episode-read` });
    const job = await request({ url: `${running.baseUrl}/v1/workspaces/ws-1/projects/project-1/jobs/job-read` });
    const steps = await request({ url: `${running.baseUrl}/v1/workspaces/ws-1/projects/project-1/workflow-runs/run-read/steps` });

    expect(episode.status).toBe(200);
    expect(episode.headers.etag).toBe('"5"');
    expect(job.status).toBe(200);
    expect(job.headers.etag).toBe('"6"');
    expect(JSON.parse(job.body) as unknown).toEqual({
      id: "job-read",
      revision: 6,
      status: "failed",
      attempts: 2,
      cancellationRequested: true,
      failure: {
        type: "https://mediaforge.invalid/problems/job-failed",
        title: "Job failed",
        detail: "The job did not complete successfully.",
        code: "job_failed",
        retryable: false,
        errors: [],
      },
    });
    expect(steps.status).toBe(200);
    expect(JSON.parse(steps.body) as unknown).toEqual({ items: [{ id: "phase-render", status: "running" }] });
    expect(calls).toEqual([
      expect.objectContaining({ operation: "episode", id: "episode-read", context: expect.objectContaining({ projectId: "project-1" }) }),
      expect.objectContaining({ operation: "job", id: "job-read", context: expect.objectContaining({ projectId: "project-1" }) }),
      expect.objectContaining({ operation: "steps", id: "run-read", context: expect.objectContaining({ projectId: "project-1" }) }),
    ]);
  });

  it("enforces workflow control preconditions and returns asynchronous job links", async () => {
    const calls: unknown[] = [];
    const running = await serve(createApiServer({
      useCases: {
        ...useCases,
        cancelWorkflow: async (id, context) => { calls.push({ operation: "cancel", id, context }); return { workflowRunId: id, jobId: "job-cancelled", revision: 7 }; },
        resumeWorkflow: async (id, context) => { calls.push({ operation: "resume", id, context }); return { workflowRunId: id, jobId: "job-resumed", revision: 8 }; },
      },
      authenticate,
      requestId: () => "request-control",
    }));
    closers.push(running.close);

    const missingCancel = await request({ url: `${running.baseUrl}/v1/workspaces/ws-1/projects/project-1/workflow-runs/run-1:cancel`, method: "POST" });
    const missingResume = await request({ url: `${running.baseUrl}/v1/workspaces/ws-1/projects/project-1/workflow-runs/run-1:resume`, method: "POST", headers: { "if-match": '"6"' } });
    expect(missingCancel.status).toBe(428);
    expect(missingResume.status).toBe(428);
    expect(JSON.parse(missingCancel.body) as unknown).toMatchObject({ code: "precondition_required" });
    expect(JSON.parse(missingResume.body) as unknown).toMatchObject({ code: "precondition_required" });
    expect(calls).toEqual([]);

    const cancelled = await request({ url: `${running.baseUrl}/v1/workspaces/ws-1/projects/project-1/workflow-runs/run-1:cancel`, method: "POST", headers: { "if-match": '"6"' } });
    const resumed = await request({ url: `${running.baseUrl}/v1/workspaces/ws-1/projects/project-1/workflow-runs/run-1:resume`, method: "POST", headers: { "if-match": '"7"', "idempotency-key": "resume-key" } });
    expect(cancelled.status).toBe(202);
    expect(cancelled.headers.location).toContain("jobs/job-cancelled");
    expect(cancelled.headers["retry-after"]).toBe("3");
    expect(cancelled.headers.etag).toBe('"7"');
    expect(resumed.status).toBe(202);
    expect(resumed.headers.location).toContain("jobs/job-resumed");
    expect(resumed.headers.etag).toBe('"8"');
    expect(calls).toEqual([
      expect.objectContaining({ operation: "cancel", id: "run-1", context: expect.objectContaining({ ifMatch: '"6"' }) }),
      expect.objectContaining({ operation: "resume", id: "run-1", context: expect.objectContaining({ ifMatch: '"7"', idempotencyKey: "resume-key" }) }),
    ]);
  });

  it("returns RFC 9457 problems for preconditions and never runs the handler", async () => {
    const running = await serve(createApiServer({ useCases, authenticate, requestId: () => "request-3" }));
    closers.push(running.close);
    const response = await request({ url: `${running.baseUrl}/v1/workspaces/ws-1/projects/project-1/episodes/episode-1/workflow-runs`, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
    expect(response.status).toBe(428);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(JSON.parse(response.body) as unknown).toMatchObject({ code: "precondition_required", requestId: "request-3", retryable: false });
  });

  it("returns an opaque not-found response for a foreign workspace", async () => {
    const running = await serve(createApiServer({ useCases, authenticate, requestId: () => "request-4" }));
    closers.push(running.close);
    const response = await request({ url: `${running.baseUrl}/v1/workspaces/foreign/projects/project-1/validations` });
    expect(response.status).toBe(404);
    expect(JSON.parse(response.body) as unknown).toMatchObject({ code: "not_found" });
    const workspaceResponse = await request({ url: `${running.baseUrl}/v1/workspaces/foreign/quota` });
    expect(workspaceResponse.status).toBe(404);
    expect(JSON.parse(workspaceResponse.body) as unknown).toMatchObject({ code: "not_found" });
    const episodeResponse = await request({
      url: `${running.baseUrl}/v1/workspaces/foreign/projects/project-1/episodes/episode-1`,
      method: "PATCH",
      body: "{",
    });
    expect(episodeResponse.status).toBe(404);
    expect(JSON.parse(episodeResponse.body) as unknown).toMatchObject({ code: "not_found" });
  });

  it("maps workspace quota, usage, and audit reads without numeric precision loss", async () => {
    const calls: unknown[] = [];
    const running = await serve(createApiServer({
      useCases: {
        ...useCases,
        getQuota: async (context) => {
          calls.push({ operation: "quota", context });
          return { workspaceId: "ws-1", budgetLimitMinor: "90071992547409930", reservedMinor: "10", settledMinor: "20", availableMinor: "90071992547409900", revision: 7 };
        },
        listUsageRecords: async (after, size, context) => {
          calls.push({ operation: "usage", after, size, context });
          return { items: [{ id: "usage-1", kind: "usage", subjectId: "run-1", operation: "render", unit: "frame", quantityUnits: "9007199254740993", costMinor: "42", correctionOfUsageId: null, attemptId: "attempt-1", data: {}, occurredAt: "2026-08-01T12:00:00.000Z" }], nextAfter: "signed-usage-cursor" };
        },
        listAuditEvents: async (after, size, context) => {
          calls.push({ operation: "audit", after, size, context });
          return { items: [{ id: "audit-1", action: "workflow.admitted", subjectId: "run-1", actorId: "user-1", correlationId: "request-1", causationId: null, data: {}, occurredAt: "2026-08-01T12:01:00.000Z" }] };
        },
      },
      authenticate,
      requestId: () => "request-workspace-reads",
    }));
    closers.push(running.close);

    const quota = await request({ url: `${running.baseUrl}/v1/workspaces/ws-1/quota` });
    const usage = await request({ url: `${running.baseUrl}/v1/workspaces/ws-1/usage-records?page[size]=1&page[after]=cursor-1` });
    const audit = await request({ url: `${running.baseUrl}/v1/workspaces/ws-1/audit-events?page[size]=2` });

    expect(quota.status).toBe(200);
    expect(quota.headers.etag).toBe('"7"');
    expect(JSON.parse(quota.body) as unknown).toMatchObject({ budgetLimitMinor: "90071992547409930", availableMinor: "90071992547409900" });
    expect(JSON.parse(usage.body) as unknown).toMatchObject({ items: [{ quantityUnits: "9007199254740993", costMinor: "42" }], nextAfter: "signed-usage-cursor" });
    expect(audit.status).toBe(200);
    expect(calls).toEqual([
      expect.objectContaining({ operation: "quota", context: expect.objectContaining({ workspaceId: "ws-1" }) }),
      expect.objectContaining({ operation: "usage", after: "cursor-1", size: 1 }),
      expect.objectContaining({ operation: "audit", after: undefined, size: 2 }),
    ]);

    const missingQuota = await serve(createApiServer({
      useCases: { ...useCases, getQuota: async () => null },
      authenticate,
      requestId: () => "request-missing-quota",
    }));
    closers.push(missingQuota.close);
    const missing = await request({ url: `${missingQuota.baseUrl}/v1/workspaces/ws-1/quota` });
    expect(missing.status).toBe(404);
    expect(JSON.parse(missing.body) as unknown).toMatchObject({ code: "not_found" });
  });

  it("enforces the route-specific permission vocabulary before parsing command bodies", async () => {
    const running = await serve(createApiServer({
      useCases: {
        ...useCases,
        getAsset: async (id) => ({ id, mimeType: "video/mp4", bytes: 10, sha256: "a".repeat(64), lifecycle: "available", provenance: "generated" }),
      },
      authenticate: async (incoming) => ({
        principalId: "permission-test-user",
        workspaceId: "ws-1",
        permissions: typeof incoming.headers["x-test-permission"] === "string"
          ? [incoming.headers["x-test-permission"]]
          : [],
        kind: "user" as const,
      }),
      requestId: () => "request-permission",
    }));
    closers.push(running.close);

    const workflowBody = JSON.stringify({ template: "episode-production", episodeRevision: 1, locales: ["en"], variants: ["full"], approvalMode: "required", publicationMode: "none" });
    const cases = [
      { permission: "content.write", method: "POST", path: "/v1/workspaces/ws-1/projects", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Project", profile: "dark_truth" }), status: 201 },
      { permission: "content.write", method: "POST", path: "/v1/workspaces/ws-1/projects/project-1/episodes", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: { type: "dark_truth", version: "1", premise: "Premise", storyBibleId: "bible-1", referenceAssetIds: [] } }), status: 201 },
      { permission: "content.read", method: "GET", path: "/v1/workspaces/ws-1/projects/project-1/episodes/episode-1", status: 200 },
      { permission: "content.write", method: "PATCH", path: "/v1/workspaces/ws-1/projects/project-1/episodes/episode-1", headers: { "content-type": "application/json", "if-match": "\"2\"" }, body: JSON.stringify({ content: { type: "dark_truth", version: "1", premise: "Replacement", storyBibleId: "bible-1", referenceAssetIds: [] } }), status: 200 },
      { permission: "workflow.start", method: "POST", path: "/v1/workspaces/ws-1/projects/project-1/episodes/episode-1/workflow-runs", headers: { "content-type": "application/json", "idempotency-key": "admit-1" }, body: workflowBody, status: 202 },
      { permission: "content.read", method: "GET", path: "/v1/workspaces/ws-1/projects/project-1/workflow-runs/run-1", status: 200 },
      { permission: "content.read", method: "GET", path: "/v1/workspaces/ws-1/projects/project-1/workflow-runs/run-1/steps", status: 200 },
      { permission: "workflow.cancel", method: "POST", path: "/v1/workspaces/ws-1/projects/project-1/workflow-runs/run-1:cancel", headers: { "if-match": "\"2\"" }, status: 202 },
      { permission: "workflow.start", method: "POST", path: "/v1/workspaces/ws-1/projects/project-1/workflow-runs/run-1:resume", headers: { "if-match": "\"2\"", "idempotency-key": "resume-1" }, status: 202 },
      { permission: "content.read", method: "GET", path: "/v1/workspaces/ws-1/projects/project-1/jobs/job-1", status: 200 },
      { permission: "content.read", method: "GET", path: "/v1/workspaces/ws-1/projects/project-1/assets/asset-1", status: 200 },
      { permission: "validation.read", method: "GET", path: "/v1/workspaces/ws-1/projects/project-1/validations", status: 200 },
      { permission: "approval.decide", method: "POST", path: "/v1/workspaces/ws-1/projects/project-1/approvals", headers: { "content-type": "application/json", "if-match": "\"3\"", "idempotency-key": "approval-1" }, body: JSON.stringify({ challengeId: "challenge-1", subjectId: "subject-1", expectedRevision: 3, decision: "approved", reason: "Reviewed" }), status: 202 },
      { permission: "usage.read", method: "GET", path: "/v1/workspaces/ws-1/quota", status: 200 },
      { permission: "usage.read", method: "GET", path: "/v1/workspaces/ws-1/usage-records?page[size]=1", status: 200 },
      { permission: "audit.read", method: "GET", path: "/v1/workspaces/ws-1/audit-events?page[size]=1", status: 200 },
    ] as const;

    for (const item of cases) {
      const allowed = await request({
        url: `${running.baseUrl}${item.path}`,
        method: item.method,
        headers: { ...item.headers, "x-test-permission": item.permission },
        ...(item.body ? { body: item.body } : {}),
      });
      expect(allowed.status, `${item.method} ${item.path} with ${item.permission}`).toBe(item.status);

      const denied = await request({
        url: `${running.baseUrl}${item.path}`,
        method: item.method,
        headers: { ...item.headers, "x-test-permission": "unrelated.permission" },
        ...(item.method === "POST" || item.method === "PATCH" ? { body: "{" } : {}),
      });
      expect(denied.status, `${item.method} ${item.path} without ${item.permission}`).toBe(403);
      expect(JSON.parse(denied.body) as unknown).toMatchObject({ code: "authorization_denied" });
    }

    const deniedBeforeQueryParsing = await request({
      url: `${running.baseUrl}/v1/workspaces/ws-1/usage-records?page[size]=not-a-number`,
      headers: { "x-test-permission": "unrelated.permission" },
    });
    expect(deniedBeforeQueryParsing.status).toBe(403);
    const authorizedInvalidQuery = await request({
      url: `${running.baseUrl}/v1/workspaces/ws-1/usage-records?page[size]=not-a-number`,
      headers: { "x-test-permission": "usage.read" },
    });
    expect(authorizedInvalidQuery.status).toBe(400);
  });

  it("adapts shared OIDC authentication at the HTTP boundary", async () => {
    const authenticateOidc = createOidcRequestAuthenticator({
      authenticate: async (value: string | undefined) => value === "Bearer valid" ? authenticate() : null,
    });
    await expect(authenticateOidc({ headers: { authorization: "Bearer valid" } } as http.IncomingMessage)).resolves.toMatchObject({ workspaceId: "ws-1" });
    await expect(authenticateOidc({ headers: {} } as http.IncomingMessage)).resolves.toBeNull();
    const directoryBacked = createDirectoryBackedRequestAuthenticator({
      authenticateToken: authenticateOidc,
      directory: {
        findActive: async (workspaceId, subject) =>
          workspaceId === "ws-1" && subject === "user-1"
            ? { principalId: "member-1", kind: "user", permissions: ["content.read"] }
            : null,
      },
    });
    await expect(directoryBacked({ headers: { authorization: "Bearer valid" } } as http.IncomingMessage)).resolves.toEqual({
      principalId: "member-1",
      workspaceId: "ws-1",
      kind: "user",
      permissions: ["content.read"],
    });
  });

  it("maps API admission through the shared application handler", async () => {
    const calls: Array<{ readonly input: unknown; readonly execution: unknown }> = [];
    const execute = async (input: unknown, execution: unknown) => {
      calls.push({ input, execution });
      return { workflowRunId: "run-application", jobId: "job-application", revision: 0 };
    };
    const admission = createApiWorkflowAdmissionUseCase({ execute });
    const input = { template: "episode-production", episodeRevision: 1, locales: ["en"], variants: ["full"], approvalMode: "required", publicationMode: "none" } as const;
    const principal = await authenticate();
    await expect(admission(input, { workspaceId: "ws-1", projectId: "project-1", episodeId: "episode-1", principal, requestId: "request-1", idempotencyKey: "key-1" })).resolves.toMatchObject({ workflowRunId: "run-application" });
    await expect(admission(input, { workspaceId: "ws-1", projectId: "project-1", episodeId: "episode-2", principal, requestId: "request-2", idempotencyKey: "key-1" })).resolves.toMatchObject({ workflowRunId: "run-application" });
    expect(calls).toEqual([
      {
        input: expect.objectContaining({ template: "episode-production", episodeId: "episode-1" }),
        execution: expect.objectContaining({ actor: { principalId: "user-1", kind: "user", permissions: expect.any(Array) }, workspace: { id: "ws-1" }, authorization: { decision: "allowed", requiredPermissions: ["workflow.start"] }, idempotency: { key: expect.stringMatching(/^v1:/u), fingerprint: expect.any(String) } }),
      },
      {
        input: expect.objectContaining({ template: "episode-production", episodeId: "episode-2" }),
        execution: expect.objectContaining({ actor: { principalId: "user-1", kind: "user", permissions: expect.any(Array) }, workspace: { id: "ws-1" }, authorization: { decision: "allowed", requiredPermissions: ["workflow.start"] }, idempotency: { key: expect.stringMatching(/^v1:/u), fingerprint: expect.any(String) } }),
      },
    ]);
    const fingerprints = calls.map((call) => (call.execution as { readonly idempotency: { readonly fingerprint: string } }).idempotency.fingerprint);
    expect(new Set(fingerprints).size).toBe(2);
  });
});
