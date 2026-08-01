import { describe, expect, it, vi } from "vitest";

import type { PostgresClient, PostgresPool, PostgresQueryResult } from "./postgres-workflow-repository.js";
import {
  POSTGRES_PILOT_API_KEY_MIGRATION,
  PostgresPilotApiKeyRepository,
} from "./postgres-pilot-api-key-repository.js";

type Query = { readonly sql: string; readonly values?: readonly unknown[] };
const row = (overrides: Record<string, unknown> = {}) => ({
  workspace_id: "workspace-1", key_id: "key-1", principal_id: "service-1",
  secret_hash: "scrypt$v1$16384$8$1$c2FsdA$aGFzaA", permissions: ["projects:read"],
  expires_at: "2026-08-02T00:00:00.000Z", revoked_at: null, revision: 0,
  ...overrides,
});

function fakePool(handler: (sql: string) => PostgresQueryResult<unknown> = () => ({ rows: [] })) {
  const queries: Query[] = [];
  const client: PostgresClient = {
    query: async <T>(sql: string, values?: readonly unknown[]) => {
      queries.push({ sql, ...(values ? { values } : {}) });
      return handler(sql) as PostgresQueryResult<T>;
    },
    release: vi.fn(),
  };
  const pool: PostgresPool = { connect: async () => client, query: async <T>() => ({ rows: [] as T[] }), end: async () => undefined };
  return { pool, queries };
}

describe("Postgres pilot API key repository", () => {
  it("defines tenant RLS, hashed-only keys, ownership, and immutable audit", async () => {
    expect(POSTGRES_PILOT_API_KEY_MIGRATION).toContain("lookup_fingerprint TEXT NOT NULL");
    expect(POSTGRES_PILOT_API_KEY_MIGRATION).toContain("secret_hash TEXT NOT NULL");
    expect(POSTGRES_PILOT_API_KEY_MIGRATION).not.toMatch(/plaintext|secret_value|token_value/iu);
    expect(POSTGRES_PILOT_API_KEY_MIGRATION).toContain("REFERENCES workspace_principals (workspace_id, principal_id)");
    expect(POSTGRES_PILOT_API_KEY_MIGRATION).toContain("FORCE ROW LEVEL SECURITY");
    expect(POSTGRES_PILOT_API_KEY_MIGRATION).toContain("pilot API key audit is append-only");
    const fake = fakePool();
    await new PostgresPilotApiKeyRepository(fake.pool).migrate();
    expect(fake.queries.map(({ sql }) => sql)).toEqual(["BEGIN", POSTGRES_PILOT_API_KEY_MIGRATION, "COMMIT"]);
  });

  it("issues only for an active principal and appends audit in one transaction", async () => {
    const fake = fakePool((sql) => sql.includes("INSERT INTO pilot_api_keys") ? { rows: [row()] } : { rows: [] });
    const result = await new PostgresPilotApiKeyRepository(fake.pool).issue({
      workspaceId: "workspace-1", keyId: "key-1", principalId: "service-1", lookupFingerprint: "a".repeat(64),
      secretHash: row().secret_hash, permissions: ["projects:read"], expiresAt: "2026-08-02T00:00:00.000Z",
      actorSubject: "operator-1", auditId: "audit-1", now: "2026-08-01T12:00:00.000Z",
    });
    expect(result).not.toHaveProperty("secretHash");
    expect(fake.queries.find(({ sql }) => sql.includes("INSERT INTO pilot_api_keys"))?.sql).toContain("active = TRUE AND revoked_at IS NULL");
    expect(fake.queries.some(({ sql }) => sql.includes("'issued'"))).toBe(true);
    expect(fake.queries.at(-1)?.sql).toBe("COMMIT");
  });

  it("rotates by CAS, revokes the prior key, and creates one linked replacement", async () => {
    const fake = fakePool((sql) => {
      if (sql.includes("UPDATE pilot_api_keys")) return { rows: [{ principal_id: "service-1" }] };
      if (sql.includes("INSERT INTO pilot_api_keys")) return { rows: [row({ key_id: "key-2" })] };
      return { rows: [] };
    });
    const result = await new PostgresPilotApiKeyRepository(fake.pool).rotate({
      workspaceId: "workspace-1", previousKeyId: "key-1", previousExpectedRevision: 0, keyId: "key-2", principalId: "service-1",
      lookupFingerprint: "b".repeat(64), secretHash: row().secret_hash, permissions: ["projects:read"], expiresAt: "2026-08-03T00:00:00.000Z",
      actorSubject: "operator-1", auditId: "audit-2", now: "2026-08-01T12:00:00.000Z",
    });
    expect(result.keyId).toBe("key-2");
    expect(fake.queries.find(({ sql }) => sql.includes("UPDATE pilot_api_keys"))?.sql).toContain("revision = $6 AND revoked_at IS NULL");
    expect(fake.queries.find(({ sql }) => sql.includes("INSERT INTO pilot_api_keys"))?.values?.[7]).toBe("key-1");
  });

  it("looks up an unexpired key only while its owning principal remains active", async () => {
    const fake = fakePool((sql) => sql.includes("SELECT key.*")
      ? { rows: [row({ principal_permissions: ["projects:read"] })] }
      : { rows: [] });
    const candidate = await new PostgresPilotApiKeyRepository(fake.pool).findActiveByFingerprint({
      workspaceId: "workspace-1", lookupFingerprint: "a".repeat(64), now: "2026-08-01T12:00:00.000Z",
    });
    expect(candidate).toMatchObject({ principalId: "service-1", principalPermissions: ["projects:read"] });
    const query = fake.queries.find(({ sql }) => sql.includes("SELECT key.*"))!.sql;
    expect(query).toContain("key.revoked_at IS NULL AND key.expires_at > $3::timestamptz");
    expect(query).toContain("principal.active = TRUE AND principal.revoked_at IS NULL");
  });
});
