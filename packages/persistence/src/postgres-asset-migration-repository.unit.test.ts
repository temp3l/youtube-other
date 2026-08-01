import { describe, expect, it, vi } from "vitest";

import type {
  PostgresClient,
  PostgresPool,
  PostgresQueryResult,
} from "./postgres-workflow-repository.js";
import {
  AssetAuthorityConflictError,
  AssetMigrationIncompleteError,
  AssetMigrationStaleError,
  POSTGRES_ASSET_MIGRATION_MIGRATION,
  PostgresAssetMigrationRepository,
} from "./postgres-asset-migration-repository.js";

type Query = { readonly sql: string; readonly values?: readonly unknown[] };

const now = "2026-08-01T12:00:00.000Z";
const deadline = "2026-08-08T12:00:00.000Z";
const sha256 = "a".repeat(64);

function authority(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    workspace_id: "workspace-1",
    aggregate_id: "episode-1",
    authority: "filesystem-legacy",
    revision: 0,
    rollback_deadline: null,
    source_retained: true,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function migration(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    migration_id: "migration-1",
    aggregate_id: "episode-1",
    state: "active",
    revision: 0,
    ...overrides,
  };
}

function fakePool(
  handler: (
    sql: string,
    values?: readonly unknown[]
  ) => PostgresQueryResult<unknown> = () => ({ rows: [] })
) {
  const queries: Query[] = [];
  const release = vi.fn();
  const client: PostgresClient = {
    query: async <T>(sql: string, values?: readonly unknown[]) => {
      queries.push({ sql, ...(values ? { values } : {}) });
      return handler(sql, values) as PostgresQueryResult<T>;
    },
    release,
  };
  const pool: PostgresPool = {
    connect: async () => client,
    query: async <T>() => ({ rows: [] as T[] }),
    end: async () => undefined,
  };
  return { pool, queries, release };
}

const item = {
  assetId: "asset-1",
  logicalRole: "narration.full.en",
  sourceLocator: "episodes/episode-1/audio/full-en.mp3",
  expectedSha256: sha256,
  expectedBytes: 1234n,
  expectedMimeType: "audio/mpeg",
  required: true,
  lineage: { producer: "speech-v2", parentHash: "b".repeat(64) },
  dependencies: ["script-full-en"],
  provenance: { source: "legacy-filesystem", manifestVersion: 3 },
} as const;

describe("PostgreSQL asset migration authority", () => {
  it("defines tenant-isolated immutable validation and inventory authority", () => {
    expect(POSTGRES_ASSET_MIGRATION_MIGRATION).toContain(
      "CREATE TABLE IF NOT EXISTS asset_aggregate_authorities"
    );
    expect(POSTGRES_ASSET_MIGRATION_MIGRATION).toContain(
      "asset validation facts are append-only"
    );
    expect(POSTGRES_ASSET_MIGRATION_MIGRATION).toContain(
      "asset migration inventory identity is immutable"
    );
    expect(POSTGRES_ASSET_MIGRATION_MIGRATION).toContain(
      "asset_migrations_one_active_per_aggregate"
    );
    expect(POSTGRES_ASSET_MIGRATION_MIGRATION).toContain(
      "FORCE ROW LEVEL SECURITY"
    );
    expect(POSTGRES_ASSET_MIGRATION_MIGRATION).toContain(
      "rollback_deadline TIMESTAMPTZ"
    );
    expect(POSTGRES_ASSET_MIGRATION_MIGRATION).toContain(
      "source_retained BOOLEAN"
    );
  });

  it("locks the legacy authority and durably inventories lineage before copying", async () => {
    const fake = fakePool((sql) =>
      sql.includes("FROM asset_aggregate_authorities") &&
      sql.includes("FOR UPDATE")
        ? { rows: [authority()] }
        : { rows: [], rowCount: 1 }
    );
    await new PostgresAssetMigrationRepository(fake.pool).startMigration({
      workspaceId: "workspace-1",
      migrationId: "migration-1",
      aggregateId: "episode-1",
      expectedAuthorityRevision: 0,
      rollbackDeadline: deadline,
      sourceRetained: true,
      items: [item],
      now,
    });

    const authorityLock = fake.queries.findIndex(
      ({ sql }) =>
        sql.includes("asset_aggregate_authorities") &&
        sql.includes("FOR UPDATE")
    );
    const migrationInsert = fake.queries.findIndex(({ sql }) =>
      sql.includes("INSERT INTO asset_migrations")
    );
    const inventoryInsert = fake.queries.find(({ sql }) =>
      sql.includes("INSERT INTO asset_migration_items")
    );
    expect(authorityLock).toBeLessThan(migrationInsert);
    expect(inventoryInsert?.values).toEqual(
      expect.arrayContaining([
        JSON.stringify(item.lineage),
        JSON.stringify(item.dependencies),
        JSON.stringify(item.provenance),
      ])
    );
    expect(fake.queries.at(-1)?.sql).toBe("COMMIT");
  });

  it("reclaims only claimable active-migration items with a monotonic fence", async () => {
    const fake = fakePool((sql) =>
      sql.includes("WITH candidate")
        ? {
            rows: [
              {
                workspace_id: "workspace-1",
                migration_id: "migration-1",
                asset_id: item.assetId,
                logical_role: item.logicalRole,
                source_locator: item.sourceLocator,
                expected_sha256: item.expectedSha256,
                expected_bytes: "1234",
                expected_mime_type: item.expectedMimeType,
                required: true,
                lineage: item.lineage,
                dependencies: item.dependencies,
                provenance: item.provenance,
                claim_owner: "worker-1",
                claim_fence: 3,
                claim_expires_at: "2026-08-01T12:01:00.000Z",
                revision: 4,
              },
            ],
          }
        : { rows: [] }
    );
    await expect(
      new PostgresAssetMigrationRepository(fake.pool).claimNextItem({
        workspaceId: "workspace-1",
        migrationId: "migration-1",
        workerId: "worker-1",
        leaseSeconds: 60,
        now,
      })
    ).resolves.toMatchObject({
      assetId: "asset-1",
      expectedBytes: 1234n,
      claimFence: 3,
      lineage: item.lineage,
      dependencies: item.dependencies,
      provenance: item.provenance,
    });
    const claim = fake.queries.find(({ sql }) =>
      sql.includes("WITH candidate")
    )!;
    expect(claim.sql).toContain("FOR UPDATE OF item SKIP LOCKED");
    expect(claim.sql).toContain("item.claim_expires_at <= $3::timestamptz");
    expect(claim.sql).toContain("claim_fence = claim_fence + 1");
  });

  it("rolls back validation when the claim or byte evidence is stale", async () => {
    const fake = fakePool((sql) =>
      sql.includes("INSERT INTO asset_validation_facts")
        ? { rows: [], rowCount: 0 }
        : { rows: [] }
    );
    await expect(
      new PostgresAssetMigrationRepository(fake.pool).recordItemReady({
        workspaceId: "workspace-1",
        migrationId: "migration-1",
        assetId: "asset-1",
        workerId: "worker-1",
        claimFence: 2,
        validationId: "validation-1",
        sha256,
        bytes: 1234n,
        mimeType: "audio/mpeg",
        targetLocator: "mediaforge/objects/workspace-1/asset-1",
        validator: "strict-media-v1",
        evidence: { checksumHeader: sha256 },
        now,
      })
    ).rejects.toBeInstanceOf(AssetMigrationStaleError);
    expect(
      fake.queries.some(({ sql }) =>
        sql.startsWith("UPDATE asset_migration_items")
      )
    ).toBe(false);
    expect(fake.queries.at(-1)?.sql).toBe("ROLLBACK");
  });

  it("rejects incomplete cutover before changing either authority", async () => {
    const fake = fakePool((sql) => {
      if (
        sql.includes("FROM asset_aggregate_authorities") &&
        sql.includes("FOR UPDATE")
      )
        return { rows: [authority()] };
      if (sql.includes("FROM asset_migrations") && sql.includes("FOR UPDATE"))
        return { rows: [migration()] };
      if (sql.includes("SELECT EXISTS"))
        return { rows: [{ incomplete: true }] };
      return { rows: [] };
    });
    await expect(
      new PostgresAssetMigrationRepository(fake.pool).cutover({
        workspaceId: "workspace-1",
        migrationId: "migration-1",
        aggregateId: "episode-1",
        expectedAuthorityRevision: 0,
        expectedMigrationRevision: 0,
        now,
      })
    ).rejects.toBeInstanceOf(AssetMigrationIncompleteError);
    expect(
      fake.queries.some(({ sql }) =>
        sql.startsWith("UPDATE asset_aggregate_authorities")
      )
    ).toBe(false);
    expect(fake.queries.at(-1)?.sql).toBe("ROLLBACK");
  });

  it("atomically CAS-switches authority only after every required fact matches", async () => {
    const fake = fakePool((sql) => {
      if (
        sql.includes("FROM asset_aggregate_authorities") &&
        sql.includes("FOR UPDATE")
      )
        return { rows: [authority()] };
      if (sql.includes("FROM asset_migrations") && sql.includes("FOR UPDATE"))
        return { rows: [migration()] };
      if (sql.includes("SELECT EXISTS"))
        return { rows: [{ incomplete: false }] };
      if (sql.includes("UPDATE asset_aggregate_authorities AS authority"))
        return {
          rows: [
            authority({
              authority: "object-storage-v1",
              revision: 1,
              rollback_deadline: deadline,
            }),
          ],
          rowCount: 1,
        };
      if (sql.includes("UPDATE asset_migrations"))
        return { rows: [], rowCount: 1 };
      return { rows: [] };
    });
    await expect(
      new PostgresAssetMigrationRepository(fake.pool).cutover({
        workspaceId: "workspace-1",
        migrationId: "migration-1",
        aggregateId: "episode-1",
        expectedAuthorityRevision: 0,
        expectedMigrationRevision: 0,
        now,
      })
    ).resolves.toMatchObject({
      authority: "object-storage-v1",
      revision: 1,
      rollbackDeadline: deadline,
      sourceRetained: true,
    });
    const verification = fake.queries.find(({ sql }) =>
      sql.includes("SELECT EXISTS")
    )!;
    expect(verification.sql).toContain("item.required");
    expect(verification.sql).toContain(
      "fact.target_locator <> item.target_locator"
    );
    expect(fake.queries.at(-1)?.sql).toBe("COMMIT");
  });

  it("rejects the wrong writer and an expired rollback window", async () => {
    const wrongWriter = fakePool((sql) =>
      sql.includes("FROM asset_aggregate_authorities") &&
      sql.includes("FOR UPDATE")
        ? {
            rows: [
              authority({
                authority: "object-storage-v1",
                revision: 1,
                rollback_deadline: deadline,
              }),
            ],
          }
        : { rows: [] }
    );
    await expect(
      new PostgresAssetMigrationRepository(wrongWriter.pool).cutover({
        workspaceId: "workspace-1",
        migrationId: "migration-1",
        aggregateId: "episode-1",
        expectedAuthorityRevision: 1,
        expectedMigrationRevision: 0,
        now,
      })
    ).rejects.toBeInstanceOf(AssetAuthorityConflictError);

    const expired = fakePool((sql) =>
      sql.includes("FROM asset_aggregate_authorities") &&
      sql.includes("FOR UPDATE")
        ? {
            rows: [
              authority({
                authority: "object-storage-v1",
                revision: 1,
                rollback_deadline: "2026-07-31T12:00:00.000Z",
              }),
            ],
          }
        : { rows: [] }
    );
    await expect(
      new PostgresAssetMigrationRepository(expired.pool).rollbackCutover({
        workspaceId: "workspace-1",
        migrationId: "migration-1",
        aggregateId: "episode-1",
        expectedAuthorityRevision: 1,
        expectedMigrationRevision: 1,
        now,
      })
    ).rejects.toBeInstanceOf(AssetAuthorityConflictError);
    expect(expired.queries.at(-1)?.sql).toBe("ROLLBACK");
  });
});
