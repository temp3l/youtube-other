import crypto from "node:crypto";

import { describe, expect, expectTypeOf, it } from "vitest";

import {
  ApiProblemError,
  MediaforgeApiClient,
  createIdempotencyKey,
  formatEtag,
  parseApiProblem,
  verifyWebhookSignature,
  withIdempotencyKey,
  withIfMatch,
  withRequestId,
  type Job,
  type HistoryContent,
  type MathematicsEducationContent,
} from "./index.js";

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers as Record<string, string> | undefined) },
  });
}

describe("Mediaforge API SDK", () => {
  it("types the canonical mathematics capability contract", () => {
    expectTypeOf<MathematicsEducationContent["grade"]>().toEqualTypeOf<
      5 | 6 | 7 | 8 | 9 | 10
    >();
    expectTypeOf<MathematicsEducationContent["difficulty"]>().toEqualTypeOf<
      "foundation" | "standard" | "challenge"
    >();
    const content: MathematicsEducationContent = {
      type: "mathematics_education",
      version: "1",
      curriculumSourceId: "curriculum-1",
      skillId: "M5-NO-001",
      grade: 5,
      difficulty: "foundation",
      presentationPresetId: "presentation-1",
      audioPresetId: "audio-1",
    };
    expect(content).toMatchObject({ grade: 5, difficulty: "foundation" });
  });

  it("types the canonical History documentary contract", () => {
    expectTypeOf<HistoryContent["format"]>().toEqualTypeOf<
      "short" | "standard" | "long"
    >();
    const content: HistoryContent = {
      type: "history",
      version: "1",
      topic: "The Bronze Age Collapse",
      presetId: "civilization-rise-fall",
      format: "standard",
      audienceLevel: "general",
      period: "ancient",
    };
    expect(content).toMatchObject({ presetId: "civilization-rise-fall", period: "ancient" });
  });

  it("maps every current operation to its typed HTTP route and headers", async () => {
    const requests: Array<{ readonly url: string; readonly init?: RequestInit }> = [];
    const bodies: unknown[] = [
      { status: "ok" }, { status: "ready" }, { openapi: "3.1.0" },
      { id: "project-1", revision: 0 }, { id: "episode-1", revision: 0 },
      { id: "episode-1", revision: 0, content: { type: "dark_truth", version: "1", premise: "p", storyBibleId: "sb-1", referenceAssetIds: [] } },
      { id: "episode-1", revision: 1, content: { type: "dark_truth", version: "1", premise: "replacement", storyBibleId: "sb-1", referenceAssetIds: [] } },
      { workflowRunId: "run-1", jobId: "job-1", revision: 0, links: { workflowRun: "/run", job: "/job" } },
      { id: "run-1", revision: 0, status: "queued" }, { items: [] },
      { workflowRunId: "run-1", jobId: "job-cancel", revision: 1, links: { workflowRun: "/run", job: "/job" } },
      { workflowRunId: "run-1", jobId: "job-resume", revision: 2, links: { workflowRun: "/run", job: "/job" } },
      { id: "job-1", revision: 0, status: "queued", attempts: 0, cancellationRequested: false },
      { id: "asset-1", mimeType: "image/png", bytes: 1, sha256: "a".repeat(64), lifecycle: "ready", provenance: "upload" },
      { items: [] },
      { id: "publication-1", revision: 0, status: "pending", workflowRunId: "run-1", approvalId: "approval-1", approvalRevision: 0, approvalArtifactHash: "approval-hash", assetHash: "asset-hash", artifactBindings: [], channelId: "channel-1", visibility: "private", scheduledAt: null, playlistIds: [], createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
      { id: "approval-1", jobId: "job-approval", revision: 1 },
      { id: "approval-1", revision: 2, state: "revoked", revokedAt: "2026-08-01T12:00:00.000Z" },
      { workspaceId: "ws-1", budgetLimitMinor: "100", reservedMinor: "10", settledMinor: "20", availableMinor: "70", revision: 1 },
      { items: [], nextAfter: "usage-cursor" },
      { items: [] },
    ];
    const client = new MediaforgeApiClient({
      baseUrl: "https://api.example.test/",
      accessToken: "token",
      requestId: () => "request-sdk",
      request: (async (url: string | URL | Request, init?: RequestInit) => {
        requests.push({ url: String(url), ...(init ? { init } : {}) });
        return jsonResponse(bodies.shift(), { status: init?.method === "POST" ? 202 : 200, headers: { "x-request-id": "request-server", etag: '"0"' } });
      }) as typeof fetch,
    });

    await client.getLiveness();
    await client.getReadiness();
    await client.getOpenApiDocument();
    await client.createProject("ws-1", { name: "Project", profile: "dark_truth" });
    await client.createEpisode("ws-1", "project-1", { content: { type: "dark_truth", version: "1", premise: "p", storyBibleId: "sb-1", referenceAssetIds: [] } });
    await client.getEpisode("ws-1", "project-1", "episode-1");
    await client.replaceEpisodeContent("ws-1", "project-1", "episode-1", { content: { type: "dark_truth", version: "1", premise: "replacement", storyBibleId: "sb-1", referenceAssetIds: [] } }, { ifMatch: '"0"' });
    await client.admitWorkflow("ws-1", "project-1", "episode-1", { template: "episode-production", episodeRevision: 0, locales: ["en"], variants: ["full"], approvalMode: "required", publicationMode: "none" }, { idempotencyKey: "admit-key" });
    await client.getWorkflow("ws-1", "project-1", "run-1");
    await client.listWorkflowSteps("ws-1", "project-1", "run-1");
    await client.cancelWorkflow("ws-1", "project-1", "run-1", { ifMatch: '"0"' });
    await client.resumeWorkflow("ws-1", "project-1", "run-1", { ifMatch: '"1"', idempotencyKey: "resume-key" });
    await client.getJob("ws-1", "project-1", "job-1");
    await client.getAsset("ws-1", "project-1", "asset-1");
    await client.listValidations("ws-1", "project-1", { size: 25, after: "cursor" });
    await client.getPublication("ws-1", "project-1", "publication/one");
    await client.recordApproval("ws-1", "project-1", { challengeId: "challenge-1", subjectId: "run-1", expectedRevision: 1, decision: "approved", reason: "Ready" }, { ifMatch: '"1"', idempotencyKey: "approval-key" });
    await client.revokeApproval("ws-1", "project-1", "approval/one", { reason: "Superseded" }, { ifMatch: '"1"', idempotencyKey: "approval-revoke-key" });
    await client.getQuota("ws-1");
    await client.listUsageRecords("ws-1", { size: 25, after: "usage-after" });
    await client.listAuditEvents("ws-1", { size: 10, after: "audit-after" });

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/health/live", "/health/ready", "/v1/openapi.json", "/v1/workspaces/ws-1/projects",
      "/v1/workspaces/ws-1/projects/project-1/episodes", "/v1/workspaces/ws-1/projects/project-1/episodes/episode-1",
      "/v1/workspaces/ws-1/projects/project-1/episodes/episode-1",
      "/v1/workspaces/ws-1/projects/project-1/episodes/episode-1/workflow-runs", "/v1/workspaces/ws-1/projects/project-1/workflow-runs/run-1",
      "/v1/workspaces/ws-1/projects/project-1/workflow-runs/run-1/steps", "/v1/workspaces/ws-1/projects/project-1/workflow-runs/run-1:cancel",
      "/v1/workspaces/ws-1/projects/project-1/workflow-runs/run-1:resume", "/v1/workspaces/ws-1/projects/project-1/jobs/job-1",
      "/v1/workspaces/ws-1/projects/project-1/assets/asset-1", "/v1/workspaces/ws-1/projects/project-1/validations",
      "/v1/workspaces/ws-1/projects/project-1/publications/publication%2Fone",
      "/v1/workspaces/ws-1/projects/project-1/approvals",
      "/v1/workspaces/ws-1/projects/project-1/approvals/approval%2Fone:revoke",
      "/v1/workspaces/ws-1/quota", "/v1/workspaces/ws-1/usage-records", "/v1/workspaces/ws-1/audit-events",
    ]);
    expect(requests[6]!.init?.method).toBe("PATCH");
    expect(new Headers(requests[6]!.init?.headers).get("if-match")).toBe('"0"');
    expect(new URL(requests[14]!.url).searchParams.get("page[after]")).toBe("cursor");
    expect(new Headers(requests[7]!.init?.headers).get("idempotency-key")).toBe("admit-key");
    expect(new Headers(requests[10]!.init?.headers).get("if-match")).toBe('"0"');
    expect(new Headers(requests[11]!.init?.headers).get("idempotency-key")).toBe("resume-key");
    expect(new Headers(requests[16]!.init?.headers).get("authorization")).toBe("Bearer token");
    expect(new Headers(requests[16]!.init?.headers).get("x-request-id")).toBe("request-sdk");
    expect(new Headers(requests[17]!.init?.headers).get("if-match")).toBe('"1"');
    expect(new Headers(requests[17]!.init?.headers).get("idempotency-key")).toBe("approval-revoke-key");
    expect(new URL(requests[19]!.url).searchParams.get("page[after]")).toBe("usage-after");
    expect(new URL(requests[20]!.url).searchParams.get("page[size]")).toBe("10");
  });

  it("parses RFC 9457 problems and throws a typed API error", async () => {
    const problem = { type: "https://api.example.test/problems/conflict", title: "Conflict", status: 409, detail: "Already exists.", code: "conflict", requestId: "request-1", retryable: false, errors: [] };
    expect(parseApiProblem(problem)).toEqual(problem);
    const client = new MediaforgeApiClient({
      baseUrl: "https://api.example.test",
      request: (async () => new Response(JSON.stringify(problem), { status: 409, headers: { "content-type": "application/problem+json" } })) as typeof fetch,
    });
    const error = await client.createProject("ws-1", { name: "Project", profile: "dark_truth" }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiProblemError);
    expect(error).toMatchObject({ status: 409, code: "conflict", requestId: "request-1", retryable: false });
  });

  it("polls jobs using Retry-After and honors abort signals", async () => {
    const jobs: Job[] = [
      { id: "job-1", revision: 0, status: "running", attempts: 1, cancellationRequested: false },
      { id: "job-1", revision: 1, status: "succeeded", attempts: 1, cancellationRequested: false },
    ];
    const delays: number[] = [];
    const client = new MediaforgeApiClient({
      baseUrl: "https://api.example.test",
      sleep: async (milliseconds) => { delays.push(milliseconds); },
      request: (async () => jsonResponse(jobs.shift(), { headers: { "retry-after": "2" } })) as typeof fetch,
    });
    await expect(client.pollJob("ws-1", "project-1", "job-1")).resolves.toMatchObject({ data: { status: "succeeded" } });
    expect(delays).toEqual([2_000]);

    const aborted = new AbortController();
    aborted.abort(new Error("stop"));
    await expect(client.pollJob("ws-1", "project-1", "job-1", { signal: aborted.signal })).rejects.toThrow("stop");
  });

  it("types stable redacted failure details on terminal jobs", () => {
    const job: Job = {
      id: "job-failed",
      revision: 3,
      status: "failed",
      attempts: 2,
      cancellationRequested: false,
      failure: {
        type: "https://mediaforge.invalid/problems/job-failed",
        title: "Job failed",
        detail: "The job did not complete successfully.",
        code: "job_failed",
        retryable: false,
        errors: [],
      },
    };
    expect(job.failure).toMatchObject({ code: "job_failed", retryable: false });
  });

  it("iterates validation cursors without exposing pagination mechanics", async () => {
    const pages = [
      { items: [{ id: "validation-1", createdAt: "2026-08-01T00:00:00.000Z" }], nextAfter: "next" },
      { items: [{ id: "validation-2", createdAt: "2026-08-01T00:00:01.000Z" }] },
    ];
    const urls: string[] = [];
    const client = new MediaforgeApiClient({
      baseUrl: "https://api.example.test",
      request: (async (url: string | URL | Request) => { urls.push(String(url)); return jsonResponse(pages.shift()); }) as typeof fetch,
    });
    const ids: string[] = [];
    for await (const validation of client.iterateValidations("ws-1", "project-1", { size: 1 })) ids.push(validation.id);
    expect(ids).toEqual(["validation-1", "validation-2"]);
    expect(new URL(urls[1]!).searchParams.get("page[after]")).toBe("next");
  });

  it("provides safe header, ETag, idempotency, and webhook verification helpers", () => {
    expect(withRequestId(undefined, "request-1").get("x-request-id")).toBe("request-1");
    expect(withIdempotencyKey(undefined, "key-1").get("idempotency-key")).toBe("key-1");
    expect(withIfMatch(undefined, '"3"').get("if-match")).toBe('"3"');
    expect(formatEtag(3)).toBe('"3"');
    expect(createIdempotencyKey("upload")).toMatch(/^upload-[0-9a-f-]+$/u);

    const payload = JSON.stringify({ id: "event-1" });
    const timestamp = "2026-08-01T12:00:00.000Z";
    const signature = `v1=${crypto.createHmac("sha256", "old-secret").update(`${timestamp}.${payload}`).digest("hex")}`;
    expect(verifyWebhookSignature({ payload, timestamp, signature, secrets: ["new-secret", "old-secret"], now: new Date(timestamp) })).toBe(true);
    expect(verifyWebhookSignature({ payload: `${payload}x`, timestamp, signature, secrets: ["old-secret"], now: new Date(timestamp) })).toBe(false);
    expect(verifyWebhookSignature({ payload, timestamp, signature, secrets: ["old-secret"], now: new Date("2026-08-01T12:10:00.000Z") })).toBe(false);
  });
});
