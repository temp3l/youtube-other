import http from "node:http";

import { MediaforgeApiClient } from "@mediaforge/api-sdk";
import { PostgresWorkflowRepository } from "@mediaforge/persistence";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApiSdkSaasJourneyGateway } from "../../web/src/saas-modules/api-sdk-gateway.js";
import { createSaasRuntime, type SaasSession } from "../../web/src/saas-runtime.js";
import { createApiServer } from "./http-server.js";
import { createPostgresApiUseCases } from "./postgres-api-use-cases.js";

const adminConnectionString = process.env.POSTGRES_INTEGRATION_ADMIN_URL;
const applicationConnectionString = process.env.POSTGRES_INTEGRATION_APPLICATION_URL;
const applicationRole = process.env.POSTGRES_INTEGRATION_APPLICATION_ROLE ?? "mediaforge_task04_app";
if (Boolean(adminConnectionString) !== Boolean(applicationConnectionString))
  throw new Error("POSTGRES_INTEGRATION_ADMIN_URL and POSTGRES_INTEGRATION_APPLICATION_URL must be configured together.");
if (!/^[a-z_][a-z0-9_]{0,62}$/u.test(applicationRole))
  throw new Error("POSTGRES_INTEGRATION_APPLICATION_ROLE is not a safe PostgreSQL identifier.");

const describePostgres = adminConnectionString ? describe : describe.skip;
const workspaceA = "workspace-acceptance-a";
const workspaceB = "workspace-acceptance-b";
const permissions = ["content.read", "content.write"] as const;
const session = (workspaceId: string): SaasSession => ({
  workspaceId,
  principalId: `principal-${workspaceId}`,
  principalName: "Fixture operator",
  workspaceName: "Provider-free fixture",
  profiles: ["history"],
});

async function serve(server: http.Server): Promise<{ readonly baseUrl: string; readonly close: () => Promise<void> }> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

describePostgres("provider-free tenant brief BFF acceptance", () => {
  const adminPool = new Pool({ connectionString: adminConnectionString, max: 1 });
  const applicationPool = new Pool({ connectionString: applicationConnectionString, max: 1 });
  const admin = new PostgresWorkflowRepository(adminPool);
  const application = new PostgresWorkflowRepository(applicationPool);
  const closers: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    await admin.migrate();
    await adminPool.query(`GRANT USAGE ON SCHEMA public TO ${applicationRole}`);
    await adminPool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${applicationRole}`);
  });

  beforeEach(async () => {
    await adminPool.query("TRUNCATE workflow_events, job_dead_letters, workflow_outbox, command_admissions, effect_records, jobs, workflow_attempts, workflow_steps, workflow_batches, approvals, approval_challenges, validation_results, assets, publications, workflow_run_bindings, workflow_runs, episode_production_state, production_revisions, episode_revisions, episodes, projects CASCADE");
  });

  afterAll(async () => {
    await Promise.all(closers.splice(0).map((close) => close()));
    await application.close();
    await admin.close();
  });

  it("persists a tenant-scoped provider-free brief, rejects a stale BFF edit, and does not expose it to another tenant", async () => {
    const api = await serve(createApiServer({
      useCases: createPostgresApiUseCases({
        pool: applicationPool,
        workflowAdmissionHandler: { execute: async () => ({ workflowRunId: "unused", jobId: "unused", revision: 0 }) },
        cursorSecret: "provider-free-acceptance-cursor-secret-32-bytes",
        createId: (prefix) => `${prefix}-fixture`,
      }),
      authenticate: async (request) => {
        const token = request.headers.authorization?.replace(/^Bearer /u, "");
        if (token !== workspaceA && token !== workspaceB) return null;
        return { principalId: `principal-${token}`, workspaceId: token, kind: "user", permissions: [...permissions] };
      },
      requestId: () => "provider-free-acceptance",
    }));
    closers.push(api.close);
    const gateway = createApiSdkSaasJourneyGateway({
      clientFor: (identity) => new MediaforgeApiClient({ baseUrl: api.baseUrl, accessToken: identity.session.workspaceId, requestId: () => "provider-free-bff" }),
    });
    const bff = await serve(createSaasRuntime({ resolveSession: async () => session(workspaceA), journey: gateway }));
    const otherTenantBff = await serve(createSaasRuntime({ resolveSession: async () => session(workspaceB), journey: gateway }));
    closers.push(bff.close, otherTenantBff.close);

    const project = await fetch(`${bff.baseUrl}/projects`, {
      method: "POST", redirect: "manual", headers: { origin: bff.baseUrl, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ name: "Provider-free history", profile: "history", idempotencyKey: "project-fixture" }),
    });
    expect(project.status).toBe(303);
    const projectId = project.headers.get("location")?.split("/").at(-1);
    expect(projectId).toBe("project-fixture");

    const episode = await fetch(`${bff.baseUrl}/projects/${projectId}/episodes`, {
      method: "POST", redirect: "manual", headers: { origin: bff.baseUrl, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ topic: "Provider-free evidence", presetId: "historical-biography", format: "standard", audienceLevel: "general", idempotencyKey: "episode-fixture" }),
    });
    expect(episode.status).toBe(303);
    expect(episode.headers.get("location")).toBe(`/projects/${projectId}/episodes/episode-fixture`);

    const currentEdit = await fetch(`${bff.baseUrl}/projects/${projectId}/episodes/episode-fixture`, {
      method: "POST", redirect: "manual", headers: { origin: bff.baseUrl, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ topic: "Current provider-free evidence", presetId: "historical-biography", format: "standard", audienceLevel: "general", revision: "0", idempotencyKey: "episode-current-fixture" }),
    });
    expect(currentEdit.status).toBe(303);

    const staleEdit = await fetch(`${bff.baseUrl}/projects/${projectId}/episodes/episode-fixture`, {
      method: "POST", redirect: "manual", headers: { origin: bff.baseUrl, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ topic: "Stale provider-free evidence", presetId: "historical-biography", format: "standard", audienceLevel: "general", revision: "0", idempotencyKey: "episode-stale-fixture" }),
    });
    expect(staleEdit.status).toBe(412);
    expect(await staleEdit.text()).toContain("This brief changed elsewhere");

    const persisted = await application.withWorkspaceTransaction(workspaceA, (transaction) => transaction.getEpisode(workspaceA, projectId!, "episode-fixture"));
    expect(persisted).toMatchObject({ revision: 1, content: { type: "history", topic: "Current provider-free evidence" } });
    const tenantProjects = await fetch(`${bff.baseUrl}/projects`);
    expect(await tenantProjects.text()).toContain("Provider-free history");
    const otherTenantProjects = await fetch(`${otherTenantBff.baseUrl}/projects`);
    const otherTenantHtml = await otherTenantProjects.text();
    expect(otherTenantHtml).not.toContain("Provider-free history");
    expect(otherTenantHtml).not.toContain("Current provider-free evidence");
    expect(otherTenantHtml).not.toContain("Stale provider-free evidence");
  });
});
