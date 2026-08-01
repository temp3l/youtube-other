import { describe, expect, it, vi } from "vitest";

import type {
  PostgresClient,
  PostgresPool,
  PostgresQueryResult,
} from "./postgres-workflow-repository.js";
import {
  POSTGRES_WEBHOOK_MIGRATION,
  PostgresWebhookRepository,
} from "./postgres-webhook-repository.js";

type Query = {
  readonly sql: string;
  readonly values?: readonly unknown[];
};

function deliveryRow(overrides: Record<string, unknown> = {}) {
  return {
    workspace_id: "workspace-1",
    delivery_id: "delivery-1",
    endpoint_id: "endpoint-1",
    event_id: "event-1",
    event_payload: { id: "event-1" },
    state: "pending",
    revision: 0,
    attempt_count: 0,
    next_attempt_at: "2026-08-01T12:00:00.000Z",
    delivered_at: null,
    dead_lettered_at: null,
    last_status: null,
    last_error: null,
    replay_of_delivery_id: null,
    lease_owner: null,
    lease_fence: 0,
    lease_expires_at: null,
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

describe("Postgres webhook repository", () => {
  it("exports an idempotent tenant-isolated schema without storing signing secrets", async () => {
    expect(POSTGRES_WEBHOOK_MIGRATION).toContain("CREATE TABLE IF NOT EXISTS webhook_endpoints");
    expect(POSTGRES_WEBHOOK_MIGRATION).toContain("secret_handle TEXT NOT NULL");
    expect(POSTGRES_WEBHOOK_MIGRATION).not.toMatch(/secret\s+TEXT/u);
    expect(POSTGRES_WEBHOOK_MIGRATION).toContain("webhook_initial_delivery_event_unique");
    expect(POSTGRES_WEBHOOK_MIGRATION).toContain("replay_of_delivery_id IS NULL");
    expect(POSTGRES_WEBHOOK_MIGRATION).toContain("FORCE ROW LEVEL SECURITY");
    expect(POSTGRES_WEBHOOK_MIGRATION).toContain("webhook delivery attempts are append-only");
    expect(POSTGRES_WEBHOOK_MIGRATION).toContain("workflow_event_webhook_fanout");
    expect(POSTGRES_WEBHOOK_MIGRATION).toContain("endpoint.event_filters ? NEW.type");
    expect(POSTGRES_WEBHOOK_MIGRATION).toContain("'version', '1'");
    expect(POSTGRES_WEBHOOK_MIGRATION).toContain(
      "'subject', jsonb_build_object('type', 'workflow_run', 'id', NEW.run_id)"
    );
    expect(POSTGRES_WEBHOOK_MIGRATION).toContain(
      "'subject_version', NEW.subject_revision"
    );
    expect(POSTGRES_WEBHOOK_MIGRATION).toContain("'correlation_id', COALESCE(");
    expect(POSTGRES_WEBHOOK_MIGRATION).toContain("'causation_id', COALESCE(");
    expect(POSTGRES_WEBHOOK_MIGRATION).toContain("jsonb_strip_nulls");

    const fake = fakePool();
    await new PostgresWebhookRepository(fake.pool).migrate();
    expect(fake.queries.map(({ sql }) => sql)).toEqual([
      "BEGIN",
      POSTGRES_WEBHOOK_MIGRATION,
      "COMMIT",
    ]);
    expect(fake.client.release).toHaveBeenCalledOnce();
  });

  it("creates endpoints using a handle/version and transaction-local workspace RLS", async () => {
    const endpoint = {
      workspace_id: "workspace-1",
      endpoint_id: "endpoint-1",
      url: "https://hooks.example.test/mediaforge",
      secret_version: 2,
      secret_handle: "kms/webhooks/endpoint-1/2",
      enabled: true,
      event_filters: ["workflow.succeeded"],
      revision: 0,
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    };
    const fake = fakePool((sql) => sql.includes("INSERT INTO webhook_endpoints") ? { rows: [endpoint] } : { rows: [] });
    const result = await new PostgresWebhookRepository(fake.pool).createEndpoint({
      workspaceId: "workspace-1",
      endpointId: "endpoint-1",
      url: endpoint.url,
      secretVersion: 2,
      secretHandle: endpoint.secret_handle,
      eventFilters: ["workflow.succeeded", "workflow.succeeded"],
      now: endpoint.created_at,
    });
    expect(result).toMatchObject({ secretVersion: 2, secretHandle: endpoint.secret_handle });
    expect(fake.queries[1]).toEqual({
      sql: "SELECT set_config('app.workspace_id', $1, true)",
      values: ["workspace-1"],
    });
    expect(fake.queries.find(({ sql }) => sql.includes("INSERT INTO webhook_endpoints"))?.values?.[5]).toBe('["workflow.succeeded"]');
  });

  it("deduplicates the initial endpoint/event delivery", async () => {
    const original = deliveryRow();
    const fake = fakePool((sql) => {
      if (sql.includes("INSERT INTO webhook_deliveries")) return { rows: [] };
      if (sql.includes("SELECT * FROM webhook_deliveries")) return { rows: [original] };
      return { rows: [] };
    });
    const result = await new PostgresWebhookRepository(fake.pool).enqueueDelivery({
      workspaceId: "workspace-1",
      deliveryId: "duplicate-id",
      endpointId: "endpoint-1",
      eventId: "event-1",
      eventPayload: { id: "event-1" },
      now: "2026-08-01T12:00:00.000Z",
    });
    expect(result).toMatchObject({ created: false, delivery: { deliveryId: "delivery-1" } });
    expect(fake.queries.some(({ sql }) => sql.includes("ON CONFLICT (workspace_id, endpoint_id, event_id)"))).toBe(true);
  });

  it("updates endpoint configuration with CAS and rotates only to a newer secret version", async () => {
    const endpoint = {
      workspace_id: "workspace-1",
      endpoint_id: "endpoint-1",
      url: "https://hooks.example.test/updated",
      secret_version: 3,
      secret_handle: "kms/webhooks/endpoint-1/3",
      enabled: false,
      event_filters: ["workflow.failed"],
      revision: 2,
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T13:00:00.000Z",
    };
    const fake = fakePool((sql) =>
      sql.includes("UPDATE webhook_endpoints") ? { rows: [endpoint] } : { rows: [] }
    );
    const repository = new PostgresWebhookRepository(fake.pool);

    await expect(repository.updateEndpoint({
      workspaceId: "workspace-1",
      endpointId: "endpoint-1",
      expectedRevision: 1,
      url: endpoint.url,
      eventFilters: ["workflow.failed"],
      enabled: false,
      now: endpoint.updated_at,
    })).resolves.toMatchObject({ revision: 2, enabled: false });
    await expect(repository.rotateEndpointSecret({
      workspaceId: "workspace-1",
      endpointId: "endpoint-1",
      expectedRevision: 2,
      secretVersion: 3,
      secretHandle: endpoint.secret_handle,
      now: endpoint.updated_at,
    })).resolves.toMatchObject({ secretVersion: 3 });

    const rotation = fake.queries.filter(({ sql }) => sql.includes("UPDATE webhook_endpoints")).at(-1)!;
    expect(rotation.sql).toContain("secret_version < $2");
    expect(rotation.values).not.toContain("plaintext-secret");
  });

  it("lists deliveries with a bounded stable cursor", async () => {
    const fake = fakePool((sql) =>
      sql.includes("SELECT * FROM webhook_deliveries")
        ? { rows: [deliveryRow()] }
        : { rows: [] }
    );
    const repository = new PostgresWebhookRepository(fake.pool);
    await expect(repository.listDeliveries({
      workspaceId: "workspace-1",
      endpointId: "endpoint-1",
      after: {
        createdAt: "2026-08-01T11:00:00.000Z",
        deliveryId: "delivery-0",
      },
      size: 25,
    })).resolves.toHaveLength(1);
    expect(fake.queries.find(({ sql }) => sql.includes("ORDER BY created_at, delivery_id"))?.values)
      .toEqual([
        "workspace-1",
        "endpoint-1",
        "2026-08-01T11:00:00.000Z",
        "delivery-0",
        25,
      ]);
    await expect(repository.listDeliveries({
      workspaceId: "workspace-1",
      size: 101,
    })).rejects.toThrow(/between 1 and 100/u);
  });

  it("claims one due enabled delivery with a fenced expiring lease", async () => {
    const claimed = {
      ...deliveryRow({
        lease_owner: "webhook-worker-1",
        lease_fence: 4,
        lease_expires_at: "2026-08-01T12:01:00.000Z",
      }),
      endpoint_url: "https://hooks.example.test/mediaforge",
      secret_handle: "kms/webhooks/endpoint-1/2",
      secret_version: 2,
    };
    const fake = fakePool((sql) => sql.includes("WITH candidate AS") ? { rows: [claimed] } : { rows: [] });
    const result = await new PostgresWebhookRepository(fake.pool).claimNextDue({
      workspaceId: "workspace-1",
      workerId: "webhook-worker-1",
      now: "2026-08-01T12:00:00.000Z",
      leaseSeconds: 60,
    });
    expect(result).toMatchObject({
      deliveryId: "delivery-1",
      leaseOwner: "webhook-worker-1",
      leaseFence: 4,
      endpointUrl: "https://hooks.example.test/mediaforge",
      secretHandle: "kms/webhooks/endpoint-1/2",
    });
    const claim = fake.queries.find(({ sql }) => sql.includes("WITH candidate AS"))!;
    expect(claim.sql).toContain("FOR UPDATE OF delivery SKIP LOCKED LIMIT 1");
    expect(claim.sql).toContain("lease_fence = delivery.lease_fence + 1");
    expect(claim.sql).toContain("endpoint.enabled = TRUE");
  });

  it("atomically records an attempt and schedules retry", async () => {
    const retry = deliveryRow({ revision: 1, attempt_count: 1, next_attempt_at: "2026-08-01T12:05:00.000Z", last_status: 503, lease_fence: 3 });
    const fake = fakePool((sql) => sql.includes("UPDATE webhook_deliveries") ? { rows: [retry] } : { rows: [] });
    const result = await new PostgresWebhookRepository(fake.pool).recordAttempt({
      workspaceId: "workspace-1",
      deliveryId: "delivery-1",
      expectedRevision: 0,
      workerId: "webhook-worker-1",
      leaseFence: 3,
      outcome: "retry",
      responseStatus: 503,
      nextAttemptAt: "2026-08-01T12:05:00.000Z",
      now: "2026-08-01T12:00:00.000Z",
    });
    expect(result).toMatchObject({ state: "pending", revision: 1, attemptCount: 1, lastStatus: 503 });
    expect(fake.queries.some(({ sql }) => sql.includes("INSERT INTO webhook_delivery_attempts"))).toBe(true);
    expect(fake.queries.find(({ sql }) => sql.includes("UPDATE webhook_deliveries"))?.sql).toContain("lease_owner = $9 AND lease_fence = $10");
    expect(fake.queries.at(-1)?.sql).toBe("COMMIT");
  });

  it("returns a lost fence without appending an attempt", async () => {
    const fake = fakePool();
    await expect(new PostgresWebhookRepository(fake.pool).recordAttempt({
      workspaceId: "workspace-1",
      deliveryId: "delivery-1",
      expectedRevision: 0,
      workerId: "late-worker",
      leaseFence: 2,
      outcome: "delivered",
      responseStatus: 204,
      now: "2026-08-01T12:02:00.000Z",
    })).resolves.toBeNull();
    expect(fake.queries.some(({ sql }) => sql.includes("INSERT INTO webhook_delivery_attempts"))).toBe(false);
  });

  it("creates a new replay identity only from a terminal revision on an enabled endpoint", async () => {
    const replay = deliveryRow({ delivery_id: "delivery-replay-1", replay_of_delivery_id: "delivery-1" });
    const fake = fakePool((sql) => sql.includes("INSERT INTO webhook_deliveries") ? { rows: [replay] } : { rows: [] });
    const result = await new PostgresWebhookRepository(fake.pool).replay({
      workspaceId: "workspace-1",
      sourceDeliveryId: "delivery-1",
      expectedRevision: 3,
      newDeliveryId: "delivery-replay-1",
      now: "2026-08-01T13:00:00.000Z",
    });
    expect(result).toMatchObject({ deliveryId: "delivery-replay-1", replayOfDeliveryId: "delivery-1" });
    const replayQuery = fake.queries.find(({ sql }) => sql.includes("INSERT INTO webhook_deliveries"))!;
    expect(replayQuery.sql).toContain("source.state IN ('delivered', 'dead_letter')");
    expect(replayQuery.sql).toContain("endpoint.enabled = TRUE");
    expect(replayQuery.values).toEqual(["delivery-replay-1", "2026-08-01T13:00:00.000Z", "workspace-1", "delivery-1", 3]);
  });

  it("rolls back a rejected replay guard", async () => {
    const fake = fakePool();
    await expect(new PostgresWebhookRepository(fake.pool).replay({
      workspaceId: "workspace-1",
      sourceDeliveryId: "delivery-pending",
      expectedRevision: 0,
      newDeliveryId: "delivery-replay-1",
      now: "2026-08-01T13:00:00.000Z",
    })).rejects.toThrow(/terminal delivery/u);
    expect(fake.queries.at(-1)?.sql).toBe("ROLLBACK");
  });
});
