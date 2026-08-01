import { describe, expect, it } from "vitest";

import { parsePrincipalProvisionEnvironment, provisionPrincipal } from "./principal-provision.js";

describe("API principal provisioning", () => {
  it("parses a bounded explicit principal and deduplicates permissions", () => {
    expect(parsePrincipalProvisionEnvironment({
      MEDIAFORGE_PRINCIPAL_WORKSPACE_ID: "workspace-1",
      MEDIAFORGE_PRINCIPAL_OIDC_SUBJECT: "oidc|subject-1",
      MEDIAFORGE_PRINCIPAL_ID: "principal-1",
      MEDIAFORGE_PRINCIPAL_KIND: "service",
      MEDIAFORGE_PRINCIPAL_PERMISSIONS: "workflow.start,content.read,workflow.start",
      MEDIAFORGE_PRINCIPAL_ACTOR_SUBJECT: "operator|one",
    })).toMatchObject({
      permissions: ["content.read", "workflow.start"],
      expectedRevision: null,
    });
  });

  it("migrates and provisions through the directory without exposing database details", async () => {
    const calls: unknown[] = [];
    const pool = {
      connect: async () => ({
        query: async (sql: string, values?: readonly unknown[]) => {
          calls.push({ sql, values });
          if (sql.includes("INSERT INTO workspace_principals")) return { rows: [{
            workspace_id: "workspace-1", oidc_subject: "subject-1", principal_id: "principal-1",
            kind: "user", permissions: ["content.read"], active: true, revoked_at: null,
            revoked_by_subject: null, revocation_reason: null, revision: 0,
            created_at: "2026-08-01T12:00:00.000Z", updated_at: "2026-08-01T12:00:00.000Z",
          }] };
          return { rows: [] };
        },
        release: () => undefined,
      }),
      query: async () => ({ rows: [] }),
      end: async () => undefined,
    };
    await expect(provisionPrincipal({
      pool,
      environment: {
        workspaceId: "workspace-1", oidcSubject: "subject-1", principalId: "principal-1",
        kind: "user", permissions: ["content.read"], expectedRevision: null, actorSubject: "operator-1",
      },
      now: () => new Date("2026-08-01T12:00:00.000Z"),
      createAuditId: () => "audit-1",
    })).resolves.toMatchObject({ principalId: "principal-1", revision: 0 });
    expect(calls.some((call) => (call as { sql: string }).sql.includes("principal_directory_audit"))).toBe(true);
  });
});
