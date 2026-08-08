import http from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSaasRuntime,
  renderAuthenticatedShell,
  renderSignedOutShell,
} from "./saas-runtime.js";
import type { SaasJourneyGateway } from "./saas-api-bff.js";

const servers: http.Server[] = [];

async function serve(server: http.Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test address.");
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve()))
      )
  );
});

describe("SaaS runtime", () => {
  it("renders signed-out and profile-aware authenticated shells without credentials", () => {
    expect(renderSignedOutShell()).toContain("No workspace session is active.");
    const html = renderAuthenticatedShell({
      workspaceId: "workspace-pilot",
      principalName: "Ada <admin>",
      workspaceName: "Pilot & Co",
      profiles: ["history", "dark_truth", "strategic_reinvention"],
    });
    expect(html).toContain("History");
    expect(html).toContain("Dark Truth");
    expect(html).toContain("Veronica Benini strategic reinvention");
    expect(html).toContain("Ada &lt;admin&gt;");
    expect(html).not.toContain("Bearer ");
  });

  it("uses a server-only session boundary and secure read-only defaults", async () => {
    const baseUrl = await serve(
      createSaasRuntime({
        resolveSession: async () => ({
          workspaceId: "workspace-pilot",
          principalName: "Ada",
          workspaceName: "Pilot",
          profiles: ["mathematics_education", "history"],
        }),
      })
    );
    const page = await fetch(`${baseUrl}/projects`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Mathematics education");
    expect(page.headers.get("content-security-policy")).toContain(
      "default-src 'none'"
    );
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(page.headers.get("set-cookie")).toBeNull();

    const mutation = await fetch(`${baseUrl}/projects`, { method: "POST" });
    expect(mutation.status).toBe(405);
    expect(mutation.headers.get("allow")).toBe("GET, HEAD");
  });

  it("uses PKCE state and a server-side session for sign-in and CSRF-protected sign-out", async () => {
    const exchange = vi.fn(async () => ({ workspaceId: "workspace-pilot", principalName: "Ada", workspaceName: "Pilot", profiles: ["history"] as const }));
    const baseUrl = await serve(createSaasRuntime({
      resolveSession: async () => null,
      oidc: {
        authorizationUrl: "https://identity.example.test/authorize",
        clientId: "mediaforge-web",
        redirectUri: "https://app.example.test/auth/callback",
        stateSecret: "a-secure-oidc-state-secret-with-32-chars",
        secureCookies: false,
        completeAuthorization: exchange,
      },
    }));
    const signIn = await fetch(`${baseUrl}/auth/sign-in`, { redirect: "manual" });
    expect(signIn.status).toBe(302);
    const stateCookie = signIn.headers.get("set-cookie")!;
    const authorize = new URL(signIn.headers.get("location")!);
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    const callback = await fetch(`${baseUrl}/auth/callback?code=code-1&state=${encodeURIComponent(authorize.searchParams.get("state")!)}`, { redirect: "manual", headers: { cookie: stateCookie } });
    expect(callback.status).toBe(303);
    expect(exchange).toHaveBeenCalledWith(expect.objectContaining({ code: "code-1", codeVerifier: expect.any(String) }));
    const sessionId = callback.headers.get("set-cookie")!.match(/mf_session=([^;]+)/u)?.[1];
    expect(sessionId).toBeTruthy();
    const sessionCookie = `mf_session=${sessionId!}`;
    const page = await fetch(`${baseUrl}/`, { headers: { cookie: sessionCookie } });
    expect(await page.text()).toContain("Ada");
    const rejected = await fetch(`${baseUrl}/auth/sign-out`, { method: "POST", headers: { cookie: sessionCookie } });
    expect(rejected.status).toBe(403);
    const signedOut = await fetch(`${baseUrl}/auth/sign-out`, { method: "POST", headers: { cookie: sessionCookie, origin: baseUrl } });
    expect(signedOut.status).toBe(204);
  });

  it("keeps project, typed episode, workflow, and stale-edit actions behind the BFF", async () => {
    const createdProjects: string[] = [];
    const journey: SaasJourneyGateway = {
      listProjects: async () => ({ items: [{ id: "p1", revision: 1, name: "History pilot", profile: "history", createdAt: "2026-08-08T00:00:00.000Z", updatedAt: "2026-08-08T00:00:00.000Z" }] }),
      createProject: async (_identity, input) => { createdProjects.push(input.name); return { id: "p1", revision: 1 }; },
      listEpisodes: async () => ({ items: [{ id: "e1", revision: 2, createdAt: "2026-08-08T00:00:00.000Z", updatedAt: "2026-08-08T00:00:00.000Z", content: { type: "history", version: "1", topic: "The Silk Road", presetId: "historical-biography", format: "standard", audienceLevel: "general" } }] }),
      getEpisode: async () => ({ id: "e1", revision: 2, content: { type: "history", version: "1", topic: "The Silk Road", presetId: "historical-biography", format: "standard", audienceLevel: "general" } }),
      createEpisode: async () => ({ id: "e1", revision: 1 }),
      replaceEpisode: async () => { throw new (await import("@mediaforge/api-sdk")).ApiProblemError({ type: "about:blank", title: "Precondition failed", status: 412, detail: "This brief has a newer revision.", code: "precondition_failed", requestId: "req-1", retryable: false, errors: [] }, new Response()); },
      startWorkflow: async () => ({ workflowRunId: "run-1", jobId: "job-1", revision: 1, links: { workflowRun: "", job: "" } }),
      getWorkflow: async () => ({ id: "run-1", revision: 1, status: "succeeded" }),
      getWorkflowSteps: async () => ({ items: [{ id: "step-1", status: "succeeded", phase: "production" }] }),
      getJob: async () => ({ id: "job-1", revision: 1, status: "succeeded", attempts: 1, cancellationRequested: false }),
      cancelWorkflow: async () => ({ workflowRunId: "run-1", jobId: "job-1", revision: 2, links: { workflowRun: "", job: "" } }),
      resumeWorkflow: async () => ({ workflowRunId: "run-1", jobId: "job-1", revision: 2, links: { workflowRun: "", job: "" } }),
      listAssets: async () => ({ items: [] }),
      listValidations: async () => ({ items: [] }),
      getApprovalChallenge: async () => ({ id: "challenge-1", subjectId: "e1", subjectRevision: 2, artifactHash: "a".repeat(64), expiresAt: "2030-01-01T00:00:00.000Z", consumedAt: null }),
      recordApproval: async () => ({ id: "approval-1", jobId: "job-1", revision: 1 }),
      revokeApproval: async () => ({ id: "approval-1", revision: 2, state: "revoked", revokedAt: "2026-08-08T00:00:00.000Z" }),
      getQuota: async () => ({ workspaceId: "workspace-pilot", budgetLimitMinor: "0", reservedMinor: "0", settledMinor: "0", availableMinor: "0", revision: 1 }),
      listUsage: async () => ({ items: [] }),
      listAudit: async () => ({ items: [] }),
    };
    const baseUrl = await serve(createSaasRuntime({
      resolveSession: async () => ({ workspaceId: "workspace-pilot", principalName: "Ada", workspaceName: "Pilot", profiles: ["history"] }),
      journey,
    }));
    const projects = await fetch(`${baseUrl}/projects`);
    expect(await projects.text()).toContain("History pilot");
    for (const path of [
      "/", "/projects", "/projects/new", "/episodes", "/workflows",
      "/reviews", "/assets", "/usage", "/integrations", "/settings",
      "/projects/p1", "/projects/p1/episodes/e1", "/projects/p1/assets",
      "/projects/p1/approval-challenges/challenge-1", "/workflows/p1/run-1?job=job-1",
    ]) {
      const page = await fetch(`${baseUrl}${path}`);
      const html = await page.text();
      const nonce = page.headers.get("content-security-policy")?.match(/nonce-([^']+)/u)?.[1];
      expect(page.status, path).toBe(200);
      expect(html, path).toContain("<!doctype html>");
      expect(nonce, path).toBeTruthy();
      expect(html, path).toContain(`nonce="${nonce}"`);
    }
    const dashboard = await fetch(`${baseUrl}/`);
    expect(await dashboard.text()).toContain("Editorial workspace");
    expect(await (await fetch(`${baseUrl}/episodes`)).text()).toContain("The Silk Road");
    const settings = await fetch(`${baseUrl}/settings`);
    const settingsHtml = await settings.text();
    expect(settingsHtml).toContain("Languages and voice readiness");
    expect(settingsHtml).toContain("German (de)");
    expect(settingsHtml).toContain("Not entitled");
    expect(settingsHtml).toContain("Speech settings — History");
    expect(settingsHtml).toContain("Voice profile selection and generation are disabled");
    const reviewerHandoff = await fetch(`${baseUrl}/reviews`);
    const reviewerHtml = await reviewerHandoff.text();
    expect(reviewerHtml).toContain("Reviewer handoff");
    expect(reviewerHtml).toContain("Review checklist");
    expect(reviewerHtml).toContain("No approval queue is fabricated here");
    expect(await (await fetch(`${baseUrl}/assets`)).text()).toContain("Asset library");
    const newProject = await fetch(`${baseUrl}/projects/new`);
    expect(await newProject.text()).toContain('action="/projects"');
    const projectDetail = await fetch(`${baseUrl}/projects/p1`);
    const projectHtml = await projectDetail.text();
    expect(projectHtml).toContain('action="/projects/p1/episodes"');
    expect(projectHtml).toContain("Next producer action");
    const episodeDetail = await fetch(`${baseUrl}/projects/p1/episodes/e1`);
    const episodeHtml = await episodeDetail.text();
    expect(episodeHtml).toContain('action="/projects/p1/episodes/e1/workflow-runs"');
    expect(episodeHtml).toContain("Story approach");
    expect(episodeHtml).toContain("Historical biography");
    expect(episodeHtml).toContain("Production language");
    expect(episodeHtml).toContain("English (en)");
    const challengeDetail = await fetch(`${baseUrl}/projects/p1/approval-challenges/challenge-1`);
    expect(await challengeDetail.text()).toContain('action="/projects/p1/approval-challenges/challenge-1/decision"');
    const projectForm = new URLSearchParams({ name: "History pilot", profile: "history", idempotencyKey: "project-1" });
    const created = await fetch(`${baseUrl}/projects`, { method: "POST", redirect: "manual", headers: { origin: baseUrl, "content-type": "application/x-www-form-urlencoded" }, body: projectForm });
    expect(created.status).toBe(303);
    const replay = await fetch(`${baseUrl}/projects`, { method: "POST", redirect: "manual", headers: { origin: baseUrl, "content-type": "application/x-www-form-urlencoded" }, body: projectForm });
    expect(replay.headers.get("idempotency-replayed")).toBe("true");
    expect(createdProjects).toEqual(["History pilot"]);
    const episodeCreated = await fetch(`${baseUrl}/projects/p1/episodes`, { method: "POST", redirect: "manual", headers: { origin: baseUrl, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ idempotencyKey: "episode-1", topic: "The Silk Road", presetId: "historical-biography", format: "standard", audienceLevel: "general" }) });
    expect(episodeCreated.headers.get("location")).toBe("/projects/p1/episodes/e1");
    const stale = await fetch(`${baseUrl}/projects/p1/episodes/e1`, { method: "POST", headers: { origin: baseUrl, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ idempotencyKey: "revise-1", revision: "1", topic: "The Silk Road", presetId: "historical-biography", format: "standard", audienceLevel: "general" }) });
    expect(stale.status).toBe(412);
    const staleHtml = await stale.text();
    expect(staleHtml).toContain("This brief changed elsewhere");
    const staleNonce = stale.headers.get("content-security-policy")?.match(/nonce-([^']+)/u)?.[1];
    expect(staleHtml).toContain(`nonce="${staleNonce}"`);
    const admitted = await fetch(`${baseUrl}/projects/p1/episodes/e1/workflow-runs`, { method: "POST", redirect: "manual", headers: { origin: baseUrl, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ idempotencyKey: "run-1", episodeRevision: "2", locale: "en" }) });
    expect(admitted.headers.get("location")).toContain("/workflows/p1/run-1?job=job-1");
    const workflow = await fetch(`${baseUrl}/workflows/p1/run-1?job=job-1`);
    expect(await workflow.text()).toContain("succeeded");
    const cancelled = await fetch(`${baseUrl}/workflows/p1/run-1:cancel`, { method: "POST", redirect: "manual", headers: { origin: baseUrl, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ idempotencyKey: "cancel-1", revision: "1" }) });
    expect(cancelled.headers.get("location")).toContain("/workflows/p1/run-1?job=job-1");
    const resumed = await fetch(`${baseUrl}/workflows/p1/run-1:resume`, { method: "POST", redirect: "manual", headers: { origin: baseUrl, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ idempotencyKey: "resume-1", revision: "1" }) });
    expect(resumed.headers.get("location")).toContain("/workflows/p1/run-1?job=job-1");
    const decided = await fetch(`${baseUrl}/projects/p1/approval-challenges/challenge-1/decision`, { method: "POST", redirect: "manual", headers: { origin: baseUrl, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ idempotencyKey: "approval-1", subjectId: "e1", revision: "2", decision: "approved", reason: "Ready for the pilot review." }) });
    expect(decided.headers.get("location")).toBe("/projects/p1/approval-challenges/challenge-1");
    const refererOnly = await fetch(`${baseUrl}/projects`, { method: "POST", redirect: "manual", headers: { referer: `${baseUrl}/projects/new`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ name: "Referer project", profile: "history", idempotencyKey: "project-referer" }) });
    expect(refererOnly.status).toBe(303);
    const crossOrigin = await fetch(`${baseUrl}/projects`, { method: "POST", redirect: "manual", headers: { origin: "https://attacker.example", "content-type": "application/x-www-form-urlencoded" }, body: projectForm });
    expect(crossOrigin.status).toBe(403);
  });
});
