import { describe, expect, it } from "vitest";

import type {
  PostgresClient,
  PostgresPool,
  PostgresQueryResult,
} from "@mediaforge/persistence";

import {
  administerPilotApiKey,
  parsePilotApiKeyAdminEnvironment,
  pilotApiKeyAdminOutput,
} from "./pilot-api-key-admin.js";

function fakePool(
  handler: (sql: string, values?: readonly unknown[]) => PostgresQueryResult<unknown>
) {
  const queries: Array<{ readonly sql: string; readonly values?: readonly unknown[] }> = [];
  const client: PostgresClient = {
    query: async <T>(sql: string, values?: readonly unknown[]) => {
      queries.push({ sql, ...(values ? { values } : {}) });
      return handler(sql, values) as PostgresQueryResult<T>;
    },
    release: () => undefined,
  };
  const pool: PostgresPool = {
    connect: async () => client,
    query: async <T>() => ({ rows: [] as T[] }),
    end: async () => undefined,
  };
  return { pool, queries };
}

describe("pilot API key administration", () => {
  it("parses a bounded show-once issuance request", () => {
    expect(
      parsePilotApiKeyAdminEnvironment({
        MEDIAFORGE_API_KEY_ACTION: "issue",
        MEDIAFORGE_API_KEY_WORKSPACE_ID: "workspace-1",
        MEDIAFORGE_API_KEY_PRINCIPAL_ID: "service-1",
        MEDIAFORGE_API_KEY_PERMISSIONS: "content.read,workflow.start,content.read",
        MEDIAFORGE_API_KEY_EXPIRES_AT: "2026-09-01T00:00:00.000Z",
        MEDIAFORGE_API_KEY_ACTOR_SUBJECT: "operator-1",
      })
    ).toMatchObject({
      action: "issue",
      permissions: ["content.read", "workflow.start"],
    });
  });

  it("requires a revision and reason for revocation", () => {
    expect(() =>
      parsePilotApiKeyAdminEnvironment({
        MEDIAFORGE_API_KEY_ACTION: "revoke",
        MEDIAFORGE_API_KEY_WORKSPACE_ID: "workspace-1",
        MEDIAFORGE_API_KEY_ID: "key-1",
        MEDIAFORGE_API_KEY_ACTOR_SUBJECT: "operator-1",
      })
    ).toThrow();
    expect(() =>
      parsePilotApiKeyAdminEnvironment({
        MEDIAFORGE_API_KEY_ACTION: "revoke",
        MEDIAFORGE_API_KEY_WORKSPACE_ID: "workspace-1",
        MEDIAFORGE_API_KEY_ID: "key-1",
        MEDIAFORGE_API_KEY_EXPECTED_REVISION: "",
        MEDIAFORGE_API_KEY_REVOCATION_REASON: "compromised",
        MEDIAFORGE_API_KEY_ACTOR_SUBJECT: "operator-1",
      })
    ).toThrow();
  });

  it("parses rotation with a canonical revision and rejects invalid permissions", () => {
    expect(parsePilotApiKeyAdminEnvironment({
      MEDIAFORGE_API_KEY_ACTION: "rotate",
      MEDIAFORGE_API_KEY_WORKSPACE_ID: "workspace-1",
      MEDIAFORGE_API_KEY_PREVIOUS_ID: "key-1",
      MEDIAFORGE_API_KEY_EXPECTED_REVISION: "2",
      MEDIAFORGE_API_KEY_PRINCIPAL_ID: "service-1",
      MEDIAFORGE_API_KEY_PERMISSIONS: "content.read,workflow.start",
      MEDIAFORGE_API_KEY_EXPIRES_AT: "2026-09-01T00:00:00.000Z",
      MEDIAFORGE_API_KEY_ACTOR_SUBJECT: "operator-1",
    })).toMatchObject({ action: "rotate", previousExpectedRevision: 2 });
    expect(() => parsePilotApiKeyAdminEnvironment({
      MEDIAFORGE_API_KEY_ACTION: "issue",
      MEDIAFORGE_API_KEY_WORKSPACE_ID: "workspace-1",
      MEDIAFORGE_API_KEY_PRINCIPAL_ID: "service-1",
      MEDIAFORGE_API_KEY_PERMISSIONS: "not valid",
      MEDIAFORGE_API_KEY_EXPIRES_AT: "2026-09-01T00:00:00.000Z",
      MEDIAFORGE_API_KEY_ACTOR_SUBJECT: "operator-1",
    })).toThrow(/PERMISSIONS/u);
    expect(() => parsePilotApiKeyAdminEnvironment({
      MEDIAFORGE_API_KEY_ACTION: "issue",
      MEDIAFORGE_API_KEY_WORKSPACE_ID: "workspace-1",
      MEDIAFORGE_API_KEY_PRINCIPAL_ID: "service-1",
      MEDIAFORGE_API_KEY_PERMISSIONS: "publication.execute",
      MEDIAFORGE_API_KEY_EXPIRES_AT: "2026-09-01T00:00:00.000Z",
      MEDIAFORGE_API_KEY_ACTOR_SUBJECT: "operator-1",
    })).toThrow(/PERMISSIONS/u);
  });

  it("migrates principal authority first and persists only hashes before show-once output", async () => {
    const fake = fakePool((sql) => sql.includes("INSERT INTO pilot_api_keys")
      ? { rows: [{
        workspace_id: "workspace-1",
        key_id: "key-1",
        principal_id: "service-1",
        permissions: ["content.read"],
        expires_at: "2026-09-01T00:00:00.000Z",
        revoked_at: null,
        revision: 0,
      }] }
      : { rows: [] });
    const result = await administerPilotApiKey({
      pool: fake.pool,
      environment: {
        action: "issue",
        workspaceId: "workspace-1",
        principalId: "service-1",
        permissions: ["content.read"],
        expiresAt: "2026-09-01T00:00:00.000Z",
        actorSubject: "operator-1",
      },
      now: () => new Date("2026-08-01T00:00:00.000Z"),
      createId: (kind) => kind === "key" ? "key-1" : "audit-1",
    });
    const principalMigration = fake.queries.findIndex(({ sql }) =>
      sql.includes("CREATE TABLE IF NOT EXISTS workspace_principals")
    );
    const keyMigration = fake.queries.findIndex(({ sql }) =>
      sql.includes("CREATE TABLE IF NOT EXISTS pilot_api_keys")
    );
    expect(principalMigration).toBeGreaterThan(-1);
    expect(principalMigration).toBeLessThan(keyMigration);
    expect(fake.queries.flatMap(({ values }) => values ?? [])).not.toContain(result.token);
    expect(fake.queries.find(({ sql }) => sql.includes("INSERT INTO pilot_api_keys"))?.values)
      .toEqual(expect.arrayContaining([
        expect.stringMatching(/^[a-f0-9]{64}$/u),
        expect.stringMatching(/^scrypt\$v1\$/u),
      ]));
    expect(pilotApiKeyAdminOutput(result)).toMatchObject({
      action: "issued",
      token: result.token,
      keyId: "key-1",
    });
    expect(pilotApiKeyAdminOutput({ action: "revoked", key: result.key }))
      .not.toHaveProperty("token");
  });
});
