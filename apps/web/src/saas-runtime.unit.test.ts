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
      principalId: "principal-ada", principalName: "Ada <admin>",
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
          principalId: "principal-ada", principalName: "Ada",
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
    const exchange = vi.fn(async () => ({ workspaceId: "workspace-pilot", principalId: "principal-ada", principalName: "Ada", workspaceName: "Pilot", profiles: ["history"] as const }));
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
      getEpisodeProductionState: async () => ({
        schemaVersion: "mediaforge.production.v1" as const,
        projectId: "p1",
        episodeId: "e1",
        currentProductionRevision: { id: "production-revision-1" },
        lifecycleStage: "reviewing" as const,
        workflow: { activeRunId: "run-1", runStatus: "succeeded" as const, jobId: "job-1" },
        validation: { items: [] }, review: {}, render: {}, localization: {}, publication: {},
        blockers: [{ code: "approval_missing", message: "A review decision is required before publication.", severity: "blocking" as const, evidence: [] }],
        warnings: [],
        actions: [{ actionId: "submit-review", kind: "submit_review", label: "Submit for review", enabled: true }],
        projectedAt: "2026-08-09T00:00:00.000Z",
        projectionInputFingerprint: "a".repeat(64),
      }),
      getWorkspaceCapabilities: async () => ({ schemaVersion: "mediaforge.capability.v1" as const, capabilityVersion: "a".repeat(64), entitledProfiles: ["history"], cells: [{ profileId: "history", locales: ["en"], variants: ["full"], renderProfiles: ["youtube"], publicationModes: ["none"], approvalModes: ["required"] }], tenantConfigurableFields: ["supportedLocales"], generatedAt: "2026-08-09T00:00:00.000Z" }),
      getEpisodeResolvedConfiguration: async () => ({ schemaVersion: "mediaforge.capability.v1" as const, profileId: "history", supportedLocales: ["en"], defaultLocale: "en", supportedVariants: ["full"], approvalMode: "required", publicationMode: "none", renderProfile: "youtube", requiredReviewGates: ["content"], configurationRevision: 1, capabilityVersion: "a".repeat(64), fingerprint: "b".repeat(64), provenance: [], resolvedAt: "2026-08-09T00:00:00.000Z" }),
      compareProductionUnitSnapshots: async () => ({ items: [] }),
      previewArtifactInvalidation: async () => ({ changedAddresses: [], invalidatedUnits: [], preservedUnits: [], regenerationTargets: [], staleReviewReadiness: false, stalePublishReadiness: false, gateEvidenceUpdates: [], projectedAt: "2026-08-09T00:00:00.000Z" }),
      regenerateProductionUnits: async () => ({ acceptedTargets: [], workflowRunId: "run-1", jobId: "job-1", revision: 1 }),
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
      listReviewQueue: async () => ({ items: [{ id: "challenge-1", challengeId: "challenge-1", subjectId: "e1", expiresAt: "2030-01-01T00:00:00.000Z" }] }),
      listApprovalHistory: async () => ({ items: [{ id: "approval-1", subjectId: "e1", decision: "approved" }] }),
      recordApproval: async () => ({ id: "approval-1", jobId: "job-1", revision: 1 }),
      revokeApproval: async () => ({ id: "approval-1", revision: 2, state: "revoked", revokedAt: "2026-08-08T00:00:00.000Z" }),
      publishing: {
        listChannels: async () => ({ items: [
          { schemaVersion: "mediaforge.publication-preparation.v1", workspaceId: "workspace-pilot", channelId: "channel-1", displayName: "History channel", connectionStatus: "connected", supportedLocales: ["en"], revision: 3, updatedAt: "2026-08-09T00:00:00.000Z" },
          { schemaVersion: "mediaforge.publication-preparation.v1", workspaceId: "workspace-pilot", channelId: "channel-expired", displayName: "Expired channel", connectionStatus: "reauthorize_required", supportedLocales: ["en"], revision: 2, authorizationExpiresAt: "2026-08-08T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" },
        ] }),
        beginChannelConnect: async () => ({ authorizationUrl: "https://accounts.example.test/authorize", expiresAt: "2030-01-01T00:00:00.000Z" }),
        disconnectChannel: async () => ({ schemaVersion: "mediaforge.publication-preparation.v1", workspaceId: "workspace-pilot", channelId: "channel-1", displayName: "History channel", connectionStatus: "disconnected", supportedLocales: ["en"], revision: 4, updatedAt: "2026-08-09T00:00:00.000Z" }),
        preflight: async (_identity, _projectId, _episodeId, input) => input.scheduledAt
          ? { admitted: false, rejections: [{ code: "schedule_horizon", message: "Schedule is outside the configured provider horizon.", field: "scheduledAt" }] }
          : { admitted: true, rejections: [] },
        prepare: async () => ({ publication: { id: "publication-1", revision: 0, status: "pending", workflowRunId: "run-1", approvalId: "approval-1", approvalRevision: 2, approvalArtifactHash: "a".repeat(64), assetHash: "b".repeat(64), artifactBindings: [], channelId: "channel-1", visibility: "public", scheduledAt: null, playlistIds: [], createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" }, metadataRevision: { schemaVersion: "mediaforge.publication-preparation.v1", metadataRevisionId: "metadata-1", revision: 0, contentHash: "c".repeat(64), metadata: { title: "Title", description: "Description", defaultAudioLanguage: "en", thumbnailAssetId: "thumbnail-1", thumbnailHash: "d".repeat(64) }, createdAt: "2026-08-09T00:00:00.000Z" }, replayed: false }),
        getPublication: async (_identity, _projectId, publicationId) => ({ id: publicationId, revision: 1, status: publicationId === "uncertain" ? "reconciliation_required" : "pending", workflowRunId: "run-1", approvalId: "approval-1", approvalRevision: 2, approvalArtifactHash: "a".repeat(64), assetHash: "b".repeat(64), artifactBindings: [], channelId: "channel-1", visibility: "public", scheduledAt: null, playlistIds: [], createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" }),
        cancelPublication: async () => ({ id: "publication-1", revision: 2, status: "cancelled", workflowRunId: "run-1", approvalId: "approval-1", approvalRevision: 2, approvalArtifactHash: "a".repeat(64), assetHash: "b".repeat(64), artifactBindings: [], channelId: "channel-1", visibility: "public", scheduledAt: null, playlistIds: [], createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" }),
        updateSchedule: async () => ({ publication: { id: "publication-1", revision: 2, status: "pending", workflowRunId: "run-1", approvalId: "approval-1", approvalRevision: 2, approvalArtifactHash: "a".repeat(64), assetHash: "b".repeat(64), artifactBindings: [], channelId: "channel-1", visibility: "public", scheduledAt: "2030-01-01T12:00:00.000Z", playlistIds: [], createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" }, replacedPublicationId: "publication-1", replayed: false }),
      },
      getQuota: async () => ({ workspaceId: "workspace-pilot", budgetLimitMinor: "0", reservedMinor: "0", settledMinor: "0", availableMinor: "0", revision: 1 }),
      listUsage: async () => ({ items: [] }),
      listAudit: async () => ({ items: [] }),
    };
    const baseUrl = await serve(createSaasRuntime({
      resolveSession: async () => ({ workspaceId: "workspace-pilot", principalId: "principal-ada", principalName: "Ada", workspaceName: "Pilot", profiles: ["history"] }),
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
    const episodeWorkspace = await fetch(`${baseUrl}/projects/p1/episodes/e1`);
    expect(await episodeWorkspace.text()).toContain("A review decision is required before publication.");
    expect(await (await fetch(`${baseUrl}/projects/p1/episodes/e1`)).text()).toContain("Artifact lineage and comparison");
    const settings = await fetch(`${baseUrl}/settings`);
    const settingsHtml = await settings.text();
    expect(settingsHtml).toContain("Languages and voice readiness");
    expect(settingsHtml).toContain("German (de)");
    expect(settingsHtml).toContain("Not entitled");
    expect(settingsHtml).toContain("Speech settings — History");
    expect(settingsHtml).toContain("Voice profile selection and generation are disabled");
    const reviewerHandoff = await fetch(`${baseUrl}/reviews`);
    const reviewerHtml = await reviewerHandoff.text();
    expect(reviewerHtml).toContain("Review queue");
    expect(reviewerHtml).toContain("Actionable reviews");
    expect(reviewerHtml).toContain("Approval history");
    expect(await (await fetch(`${baseUrl}/assets`)).text()).toContain("Asset library");
    const publishing = await fetch(`${baseUrl}/publishing?project=p1&episode=e1`);
    const publishingHtml = await publishing.text();
    expect(publishingHtml).toContain("Publication execution is unavailable");
    expect(publishingHtml).toContain("History channel");
    expect(publishingHtml).toContain("reauthorize required");
    expect(publishingHtml).toContain("Preflight and prepare");
    expect(publishingHtml).not.toContain("Publish now");
    const uncertain = await fetch(`${baseUrl}/publishing/projects/p1/publications/uncertain`);
    expect(await uncertain.text()).toContain("Recovery is read-only");
    const prepared = await fetch(`${baseUrl}/publishing/projects/p1/episodes/e1:prepare`, { method: "POST", redirect: "manual", headers: { origin: baseUrl, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ idempotencyKey: "publication-prepare-1", confirmed: "yes", boundEpisodeRevision: "2", channelId: "channel-1", visibility: "public", approvalId: "approval-1", approvalRevision: "2", approvalArtifactHash: "a".repeat(64), videoAssetId: "video-1", assetHash: "b".repeat(64), thumbnailAssetId: "thumbnail-1", thumbnailHash: "c".repeat(64), title: "Prepared title", description: "Prepared description", defaultAudioLanguage: "en" }) });
    expect(prepared.headers.get("location")).toBe("/publishing/projects/p1/publications/publication-1");
    const horizonRejected = await fetch(`${baseUrl}/publishing/projects/p1/episodes/e1:prepare`, { method: "POST", headers: { origin: baseUrl, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ idempotencyKey: "publication-prepare-dst", confirmed: "yes", boundEpisodeRevision: "2", channelId: "channel-1", visibility: "public", scheduledAt: "2026-10-25T01:30:00Z", scheduleTimezone: "Europe/Amsterdam", approvalId: "approval-1", approvalRevision: "2", approvalArtifactHash: "a".repeat(64), videoAssetId: "video-1", assetHash: "b".repeat(64), thumbnailAssetId: "thumbnail-1", thumbnailHash: "c".repeat(64), title: "Prepared title", description: "Prepared description", defaultAudioLanguage: "en" }) });
    expect(horizonRejected.status).toBe(412);
    expect(await horizonRejected.text()).toContain("outside the configured provider horizon");
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
