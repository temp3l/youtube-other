import { describe, expect, it } from "vitest";

import type {
  PostgresClient,
  PostgresPool,
  PostgresQueryResult,
} from "@mediaforge/persistence";

import {
  parseWebhookEndpointProvisionEnvironment,
  provisionWebhookEndpoint,
} from "./webhook-endpoint-provision.js";

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

describe("webhook endpoint provisioning", () => {
  it("parses an opaque secret handle and normalized event filters", () => {
    expect(
      parseWebhookEndpointProvisionEnvironment({
        MEDIAFORGE_WEBHOOK_ENDPOINT_WORKSPACE_ID: "workspace-1",
        MEDIAFORGE_WEBHOOK_ENDPOINT_ID: "endpoint-1",
        MEDIAFORGE_WEBHOOK_ENDPOINT_URL:
          "https://hooks.example.test/mediaforge",
        MEDIAFORGE_WEBHOOK_ENDPOINT_SECRET_HANDLE:
          "vault://webhooks/endpoint-1/1",
        MEDIAFORGE_WEBHOOK_ENDPOINT_SECRET_VERSION: "1",
        MEDIAFORGE_WEBHOOK_ENDPOINT_EVENT_FILTERS:
          "workflow.succeeded, workflow.failed,workflow.succeeded",
      })
    ).toEqual({
      workspaceId: "workspace-1",
      endpointId: "endpoint-1",
      url: "https://hooks.example.test/mediaforge",
      secretHandle: "vault://webhooks/endpoint-1/1",
      secretVersion: 1,
      eventFilters: ["workflow.failed", "workflow.succeeded"],
    });
  });

  it("rejects missing handles and non-URL endpoints", () => {
    expect(() =>
      parseWebhookEndpointProvisionEnvironment({
        MEDIAFORGE_WEBHOOK_ENDPOINT_WORKSPACE_ID: "workspace-1",
        MEDIAFORGE_WEBHOOK_ENDPOINT_ID: "endpoint-1",
        MEDIAFORGE_WEBHOOK_ENDPOINT_URL: "not-a-url",
        MEDIAFORGE_WEBHOOK_ENDPOINT_SECRET_HANDLE: "",
        MEDIAFORGE_WEBHOOK_ENDPOINT_SECRET_VERSION: "0",
      })
    ).toThrow();
    expect(() => parseWebhookEndpointProvisionEnvironment({
      MEDIAFORGE_WEBHOOK_ENDPOINT_WORKSPACE_ID: "workspace-1",
      MEDIAFORGE_WEBHOOK_ENDPOINT_ID: "endpoint-1",
      MEDIAFORGE_WEBHOOK_ENDPOINT_URL: "http://hooks.example.test/mediaforge",
      MEDIAFORGE_WEBHOOK_ENDPOINT_SECRET_HANDLE: "plaintext-secret",
      MEDIAFORGE_WEBHOOK_ENDPOINT_SECRET_VERSION: "1e3",
    })).toThrow();
  });

  it("migrates workflow events first and never returns the external secret handle", async () => {
    const secretHandle = "vault://webhooks/endpoint-1/1";
    const fake = fakePool((sql) => sql.includes("INSERT INTO webhook_endpoints")
      ? { rows: [{
        workspace_id: "workspace-1",
        endpoint_id: "endpoint-1",
        url: "https://hooks.example.test/mediaforge",
        secret_version: 1,
        secret_handle: secretHandle,
        enabled: true,
        event_filters: ["workflow.succeeded"],
        revision: 0,
        created_at: "2026-08-01T00:00:00.000Z",
        updated_at: "2026-08-01T00:00:00.000Z",
      }] }
      : { rows: [] });
    const result = await provisionWebhookEndpoint({
      pool: fake.pool,
      environment: {
        workspaceId: "workspace-1",
        endpointId: "endpoint-1",
        url: "https://hooks.example.test/mediaforge",
        secretHandle,
        secretVersion: 1,
        eventFilters: ["workflow.succeeded"],
      },
      now: () => new Date("2026-08-01T00:00:00.000Z"),
    });
    const workflowMigration = fake.queries.findIndex(({ sql }) =>
      sql.includes("CREATE TABLE IF NOT EXISTS workflow_events")
    );
    const webhookMigration = fake.queries.findIndex(({ sql }) =>
      sql.includes("CREATE TABLE IF NOT EXISTS webhook_endpoints")
    );
    expect(workflowMigration).toBeGreaterThan(-1);
    expect(workflowMigration).toBeLessThan(webhookMigration);
    expect(result).not.toHaveProperty("secretHandle");
    expect(JSON.stringify(result)).not.toContain(secretHandle);
  });
});
