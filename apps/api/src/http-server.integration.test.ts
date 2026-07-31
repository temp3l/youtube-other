import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { createApiServer, createApiWorkflowAdmissionUseCase, createOidcRequestAuthenticator, type ApiUseCases } from "./index.js";

const useCases: ApiUseCases = {
  createProject: async () => ({ id: "project-1", revision: 3 }),
  createEpisode: async () => ({ id: "episode-1", revision: 2 }),
  admitWorkflow: async () => ({ workflowRunId: "run-1", jobId: "job-1", revision: 0 }),
  getWorkflow: async () => ({ id: "run-1", revision: 2, status: "queued" }),
  getAsset: async () => null,
  listValidations: async () => ({ items: [] }),
  recordApproval: async () => ({ id: "approval-1", jobId: "job-2", revision: 4 }),
};
const authenticate = async () => ({ principalId: "user-1", workspaceId: "ws-1", permissions: ["projects:read", "projects:write", "workflow:write"], kind: "user" as const });

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
    expect(JSON.parse(response.body) as unknown).toMatchObject({ openapi: "3.1.0", paths: expect.any(Object) });
    expect(response.body).not.toContain("workspaceDir");
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
    expect(admitted).toEqual([expect.objectContaining({ context: expect.objectContaining({ workspaceId: "ws-1", projectId: "project-1", idempotencyKey: "workflow-key" }) })]);
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
  });

  it("adapts shared OIDC authentication at the HTTP boundary", async () => {
    const authenticateOidc = createOidcRequestAuthenticator({
      authenticate: async (value: string | undefined) => value === "Bearer valid" ? authenticate() : null,
    });
    await expect(authenticateOidc({ headers: { authorization: "Bearer valid" } } as http.IncomingMessage)).resolves.toMatchObject({ workspaceId: "ws-1" });
    await expect(authenticateOidc({ headers: {} } as http.IncomingMessage)).resolves.toBeNull();
  });

  it("maps API admission through the shared application handler", async () => {
    const execute = async (input: unknown, execution: unknown) => {
      expect(input).toMatchObject({ template: "episode-production" });
      expect(execution).toMatchObject({ actor: { principalId: "user-1" }, workspace: { id: "ws-1" }, idempotency: { key: "key-1" } });
      return { workflowRunId: "run-application", jobId: "job-application", revision: 0 };
    };
    const admission = createApiWorkflowAdmissionUseCase({ execute });
    await expect(admission({ template: "episode-production", episodeRevision: 1, locales: ["en"], variants: ["full"], approvalMode: "required", publicationMode: "none" }, { workspaceId: "ws-1", projectId: "project-1", principal: await authenticate(), requestId: "request-1", idempotencyKey: "key-1" })).resolves.toMatchObject({ workflowRunId: "run-application" });
  });
});
