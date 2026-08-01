import { describe, expect, it, vi } from "vitest";

import type {
  PostgresClient,
  PostgresPool,
  PostgresQueryResult,
} from "./postgres-workflow-repository.js";
import {
  POSTGRES_PUBLICATION_CHANNEL_LEASE_MIGRATION,
  PostgresPublicationChannelLeaseRepository,
} from "./postgres-publication-channel-lease-repository.js";

type Query = { readonly sql: string; readonly values?: readonly unknown[] };
const now = "2026-08-01T12:00:00.000Z";

function fakePool(
  handler: (sql: string) => PostgresQueryResult<unknown> = () => ({ rows: [] })
) {
  const queries: Query[] = [];
  const client: PostgresClient = {
    query: async <T>(sql: string, values?: readonly unknown[]) => {
      queries.push({ sql, ...(values ? { values } : {}) });
      return handler(sql) as PostgresQueryResult<T>;
    },
    release: vi.fn(),
  };
  const pool: PostgresPool = {
    connect: async () => client,
    query: async <T>() => ({ rows: [] as T[] }),
    end: async () => undefined,
  };
  return { pool, queries };
}

function lease(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    workspace_id: "workspace-1",
    channel_id: "channel-1",
    lease_owner: "publisher-1",
    lease_fence: 4,
    lease_expires_at: "2026-08-01T12:01:00.000Z",
    last_heartbeat_at: now,
    revision: 3,
    ...overrides,
  };
}

describe("PostgreSQL publication channel leases", () => {
  it("defines tenant RLS, durable identity, and monotonic fencing", () => {
    expect(POSTGRES_PUBLICATION_CHANNEL_LEASE_MIGRATION).toContain(
      "PRIMARY KEY (workspace_id, channel_id)"
    );
    expect(POSTGRES_PUBLICATION_CHANNEL_LEASE_MIGRATION).toContain(
      "publication channel lease fence must be monotonic"
    );
    expect(POSTGRES_PUBLICATION_CHANNEL_LEASE_MIGRATION).toContain(
      "FORCE ROW LEVEL SECURITY"
    );
    expect(POSTGRES_PUBLICATION_CHANNEL_LEASE_MIGRATION).toContain(
      "BEFORE UPDATE OR DELETE"
    );
  });

  it("claims a free or expired channel and increments its fence", async () => {
    const fake = fakePool((sql) =>
      sql.includes("INSERT INTO publication_channel_leases")
        ? { rows: [lease()], rowCount: 1 }
        : { rows: [] }
    );
    await expect(
      new PostgresPublicationChannelLeaseRepository(fake.pool).claim({
        workspaceId: "workspace-1",
        channelId: "channel-1",
        workerId: "publisher-1",
        leaseSeconds: 60,
        now,
      })
    ).resolves.toMatchObject({ leaseFence: 4, leaseOwner: "publisher-1" });
    const claim = fake.queries.find(({ sql }) =>
      sql.includes("INSERT INTO publication_channel_leases")
    )!;
    expect(claim.sql).toContain(
      "lease_fence = publication_channel_leases.lease_fence + 1"
    );
    expect(claim.sql).toContain("lease_expires_at <= $4::timestamptz");
    expect(claim.values).toEqual([
      "workspace-1",
      "channel-1",
      "publisher-1",
      now,
      60,
    ]);
  });

  it("does not steal a live lease and heartbeats only the current unexpired fence", async () => {
    const blocked = fakePool();
    await expect(
      new PostgresPublicationChannelLeaseRepository(blocked.pool).claim({
        workspaceId: "workspace-1",
        channelId: "channel-1",
        workerId: "publisher-2",
        leaseSeconds: 60,
        now,
      })
    ).resolves.toBeNull();

    const heartbeat = fakePool((sql) =>
      sql.startsWith("UPDATE publication_channel_leases")
        ? {
            rows: [
              lease({
                lease_expires_at: "2026-08-01T12:02:00.000Z",
                revision: 4,
              }),
            ],
            rowCount: 1,
          }
        : { rows: [] }
    );
    await expect(
      new PostgresPublicationChannelLeaseRepository(heartbeat.pool).heartbeat({
        workspaceId: "workspace-1",
        channelId: "channel-1",
        workerId: "publisher-1",
        leaseFence: 4,
        leaseSeconds: 120,
        now,
      })
    ).resolves.toMatchObject({ leaseFence: 4, revision: 4 });
    const update = heartbeat.queries.find(({ sql }) =>
      sql.startsWith("UPDATE publication_channel_leases")
    )!;
    expect(update.sql).toContain("lease_owner = $5 AND lease_fence = $6");
    expect(update.sql).toContain("lease_expires_at > $1::timestamptz");
  });

  it("releases only the matching tenant, owner, and fence", async () => {
    const current = fakePool((sql) =>
      sql.startsWith("UPDATE publication_channel_leases")
        ? { rows: [], rowCount: 1 }
        : { rows: [] }
    );
    await expect(
      new PostgresPublicationChannelLeaseRepository(current.pool).release({
        workspaceId: "workspace-1",
        channelId: "channel-1",
        workerId: "publisher-1",
        leaseFence: 4,
        now,
      })
    ).resolves.toBe(true);
    const update = current.queries.find(({ sql }) =>
      sql.startsWith("UPDATE publication_channel_leases")
    )!;
    expect(update.sql).toContain("lease_owner = NULL");
    expect(update.sql).toContain("lease_owner = $4 AND lease_fence = $5");

    const stale = fakePool();
    await expect(
      new PostgresPublicationChannelLeaseRepository(stale.pool).release({
        workspaceId: "workspace-1",
        channelId: "channel-1",
        workerId: "publisher-stale",
        leaseFence: 3,
        now,
      })
    ).resolves.toBe(false);
  });
});
