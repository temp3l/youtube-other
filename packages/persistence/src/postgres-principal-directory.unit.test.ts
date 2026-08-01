import { describe, expect, it, vi } from "vitest";

import type { PostgresClient, PostgresPool, PostgresQueryResult } from "./postgres-workflow-repository.js";
import {
  POSTGRES_PRINCIPAL_DIRECTORY_MIGRATION,
  PostgresPrincipalDirectory,
} from "./postgres-principal-directory.js";

type Query = { readonly sql: string; readonly values?: readonly unknown[] };

function principal(overrides: Record<string, unknown> = {}) {
  return {
    workspace_id: "workspace-1",
    oidc_subject: "issuer|subject-1",
    principal_id: "principal-1",
    kind: "user",
    permissions: ["projects:read"],
    active: true,
    revoked_at: null,
    revoked_by_subject: null,
    revocation_reason: null,
    revision: 0,
    created_at: "2026-08-01T12:00:00.000Z",
    updated_at: "2026-08-01T12:00:00.000Z",
    ...overrides,
  };
}

function fakePool(handler: (sql: string, values?: readonly unknown[]) => PostgresQueryResult<unknown> = () => ({ rows: [] })) {
  const queries: Query[] = [];
  const client: PostgresClient = {
    query: async <T>(sql: string, values?: readonly unknown[]) => {
      queries.push({ sql, ...(values ? { values } : {}) });
      return handler(sql, values) as PostgresQueryResult<T>;
    },
    release: vi.fn(),
  };
  const pool: PostgresPool = {
    connect: async () => client,
    query: async <T>() => ({ rows: [] as T[] }),
    end: async () => undefined,
  };
  return { pool, client, queries };
}

describe("Postgres principal directory", () => {
  it("defines a tenant-isolated composite OIDC identity without credential storage", async () => {
    expect(POSTGRES_PRINCIPAL_DIRECTORY_MIGRATION).toContain("PRIMARY KEY (workspace_id, oidc_subject)");
    expect(POSTGRES_PRINCIPAL_DIRECTORY_MIGRATION).toContain("kind IN ('user', 'service', 'worker')");
    expect(POSTGRES_PRINCIPAL_DIRECTORY_MIGRATION).toContain("principal_directory_audit_immutable");
    expect(POSTGRES_PRINCIPAL_DIRECTORY_MIGRATION).toContain("FORCE ROW LEVEL SECURITY");
    expect(POSTGRES_PRINCIPAL_DIRECTORY_MIGRATION).not.toMatch(/\b(secret|token|credential)\b/iu);

    const fake = fakePool();
    await new PostgresPrincipalDirectory(fake.pool).migrate();
    expect(fake.queries.map(({ sql }) => sql)).toEqual(["BEGIN", POSTGRES_PRINCIPAL_DIRECTORY_MIGRATION, "COMMIT"]);
  });

  it("looks up only active tenant-local principals", async () => {
    const fake = fakePool((sql) => sql.includes("SELECT * FROM workspace_principals") ? { rows: [principal()] } : { rows: [] });
    const result = await new PostgresPrincipalDirectory(fake.pool).findActive("workspace-1", "issuer|subject-1");
    expect(result).toMatchObject({ workspaceId: "workspace-1", oidcSubject: "issuer|subject-1", active: true });
    expect(fake.queries[1]).toEqual({ sql: "SELECT set_config('app.workspace_id', $1, true)", values: ["workspace-1"] });
    expect(fake.queries.find(({ sql }) => sql.includes("SELECT * FROM workspace_principals"))?.sql).toContain("active = TRUE AND revoked_at IS NULL");
  });

  it("provisions a principal and immutable audit fact in one transaction", async () => {
    const fake = fakePool((sql) => sql.includes("INSERT INTO workspace_principals") ? { rows: [principal()] } : { rows: [] });
    const result = await new PostgresPrincipalDirectory(fake.pool).provision({
      workspaceId: "workspace-1", oidcSubject: "issuer|subject-1", principalId: "principal-1", kind: "user",
      permissions: ["projects:read", "projects:read"], expectedRevision: null, actorSubject: "operator-1", auditId: "audit-1", now: "2026-08-01T12:00:00.000Z",
    });
    expect(result.permissions).toEqual(["projects:read"]);
    const audit = fake.queries.find(({ sql }) => sql.includes("INSERT INTO principal_directory_audit"))!;
    expect(audit.values?.[3]).toBe("provisioned");
    expect(fake.queries.at(-1)?.sql).toBe("COMMIT");
  });

  it("updates permissions only at the expected active revision and audits the result", async () => {
    const updated = principal({ permissions: ["projects:read", "workflow:write"], revision: 3 });
    const fake = fakePool((sql) => sql.includes("UPDATE workspace_principals") ? { rows: [updated] } : { rows: [] });
    const result = await new PostgresPrincipalDirectory(fake.pool).provision({
      workspaceId: "workspace-1", oidcSubject: "issuer|subject-1", principalId: "principal-1", kind: "user",
      permissions: ["workflow:write", "projects:read"], expectedRevision: 2, actorSubject: "operator-1", auditId: "audit-2", now: "2026-08-01T12:05:00.000Z",
    });
    expect(result).toMatchObject({ revision: 3, permissions: ["projects:read", "workflow:write"] });
    const update = fake.queries.find(({ sql }) => sql.includes("UPDATE workspace_principals"))!;
    expect(update.sql).toContain("revision = $7 AND active = TRUE AND revoked_at IS NULL");
    expect(fake.queries.find(({ sql }) => sql.includes("INSERT INTO principal_directory_audit"))?.values?.[3]).toBe("updated");
  });

  it("revokes by CAS and records who performed the revocation", async () => {
    const revoked = principal({ active: false, revoked_at: "2026-08-01T12:10:00.000Z", revoked_by_subject: "operator-1", revocation_reason: "access removed", revision: 1 });
    const fake = fakePool((sql) => sql.includes("UPDATE workspace_principals") ? { rows: [revoked] } : { rows: [] });
    const result = await new PostgresPrincipalDirectory(fake.pool).revoke({
      workspaceId: "workspace-1", oidcSubject: "issuer|subject-1", expectedRevision: 0, actorSubject: "operator-1",
      reason: "access removed", auditId: "audit-3", now: "2026-08-01T12:10:00.000Z",
    });
    expect(result).toMatchObject({ active: false, revokedBySubject: "operator-1", revision: 1 });
    expect(fake.queries.find(({ sql }) => sql.includes("'revoked'"))?.values).toContain("access removed");
  });

  it("rolls back stale provisioning without appending audit history", async () => {
    const fake = fakePool();
    await expect(new PostgresPrincipalDirectory(fake.pool).provision({
      workspaceId: "workspace-1", oidcSubject: "issuer|subject-1", principalId: "principal-1", kind: "user",
      permissions: [], expectedRevision: 9, actorSubject: "operator-1", auditId: "audit-stale", now: "2026-08-01T12:00:00.000Z",
    })).rejects.toThrow(/stale/u);
    expect(fake.queries.some(({ sql }) => sql.includes("INSERT INTO principal_directory_audit"))).toBe(false);
    expect(fake.queries.at(-1)?.sql).toBe("ROLLBACK");
  });
});
