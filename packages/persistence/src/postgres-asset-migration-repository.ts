import type {
  PostgresClient,
  PostgresPool,
  PostgresQueryResult,
} from "./postgres-workflow-repository.js";

export const POSTGRES_ASSET_MIGRATION_MIGRATION = `
CREATE TABLE IF NOT EXISTS asset_aggregate_authorities (
  workspace_id TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  authority TEXT NOT NULL CHECK (authority IN ('filesystem-legacy', 'object-storage-v1')),
  revision BIGINT NOT NULL DEFAULT 0,
  rollback_deadline TIMESTAMPTZ NULL,
  source_retained BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, aggregate_id),
  CHECK (authority = 'object-storage-v1' OR rollback_deadline IS NULL)
);
CREATE TABLE IF NOT EXISTS asset_migrations (
  workspace_id TEXT NOT NULL,
  migration_id TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  source_authority TEXT NOT NULL CHECK (source_authority = 'filesystem-legacy'),
  target_authority TEXT NOT NULL CHECK (target_authority = 'object-storage-v1'),
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'cutover', 'rolled_back')),
  expected_authority_revision BIGINT NOT NULL CHECK (expected_authority_revision >= 0),
  revision BIGINT NOT NULL DEFAULT 0,
  rollback_deadline TIMESTAMPTZ NOT NULL,
  source_retained BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, migration_id),
  UNIQUE (workspace_id, aggregate_id, migration_id),
  FOREIGN KEY (workspace_id, aggregate_id)
    REFERENCES asset_aggregate_authorities (workspace_id, aggregate_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS asset_migrations_one_active_per_aggregate
  ON asset_migrations (workspace_id, aggregate_id)
  WHERE state IN ('active', 'cutover');
CREATE TABLE IF NOT EXISTS asset_migration_items (
  workspace_id TEXT NOT NULL,
  migration_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  logical_role TEXT NOT NULL,
  source_locator TEXT NOT NULL,
  expected_sha256 TEXT NOT NULL CHECK (expected_sha256 ~ '^[a-f0-9]{64}$'),
  expected_bytes BIGINT NOT NULL CHECK (expected_bytes > 0),
  expected_mime_type TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  lineage JSONB NOT NULL CHECK (jsonb_typeof(lineage) = 'object'),
  dependencies JSONB NOT NULL CHECK (jsonb_typeof(dependencies) = 'array'),
  provenance JSONB NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'claimed', 'ready', 'failed')),
  target_locator TEXT NULL,
  validation_id TEXT NULL,
  claim_owner TEXT NULL,
  claim_fence BIGINT NOT NULL DEFAULT 0,
  claim_expires_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  revision BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, migration_id, asset_id),
  FOREIGN KEY (workspace_id, migration_id)
    REFERENCES asset_migrations (workspace_id, migration_id),
  CHECK ((state = 'claimed' AND claim_owner IS NOT NULL AND claim_expires_at IS NOT NULL)
    OR state <> 'claimed'),
  CHECK ((state = 'ready' AND target_locator IS NOT NULL AND validation_id IS NOT NULL)
    OR state <> 'ready')
);
CREATE INDEX IF NOT EXISTS asset_migration_items_claimable
  ON asset_migration_items (workspace_id, migration_id, state, claim_expires_at, asset_id)
  WHERE state IN ('pending', 'claimed', 'failed');
CREATE TABLE IF NOT EXISTS asset_validation_facts (
  workspace_id TEXT NOT NULL,
  validation_id TEXT NOT NULL,
  migration_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  byte_count BIGINT NOT NULL CHECK (byte_count > 0),
  mime_type TEXT NOT NULL,
  target_locator TEXT NOT NULL,
  validator TEXT NOT NULL,
  evidence JSONB NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  validated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, validation_id),
  UNIQUE (workspace_id, migration_id, asset_id),
  FOREIGN KEY (workspace_id, migration_id, asset_id)
    REFERENCES asset_migration_items (workspace_id, migration_id, asset_id)
);
CREATE OR REPLACE FUNCTION reject_asset_validation_fact_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'asset validation facts are append-only' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS asset_validation_facts_immutable ON asset_validation_facts;
CREATE TRIGGER asset_validation_facts_immutable
  BEFORE UPDATE OR DELETE ON asset_validation_facts
  FOR EACH ROW EXECUTE FUNCTION reject_asset_validation_fact_mutation();
CREATE OR REPLACE FUNCTION enforce_asset_inventory_identity() RETURNS trigger AS $$
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.migration_id IS DISTINCT FROM OLD.migration_id
    OR NEW.asset_id IS DISTINCT FROM OLD.asset_id
    OR NEW.logical_role IS DISTINCT FROM OLD.logical_role
    OR NEW.source_locator IS DISTINCT FROM OLD.source_locator
    OR NEW.expected_sha256 IS DISTINCT FROM OLD.expected_sha256
    OR NEW.expected_bytes IS DISTINCT FROM OLD.expected_bytes
    OR NEW.expected_mime_type IS DISTINCT FROM OLD.expected_mime_type
    OR NEW.required IS DISTINCT FROM OLD.required
    OR NEW.lineage IS DISTINCT FROM OLD.lineage
    OR NEW.dependencies IS DISTINCT FROM OLD.dependencies
    OR NEW.provenance IS DISTINCT FROM OLD.provenance
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'asset migration inventory identity is immutable' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'asset migration item revision must advance exactly once' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS asset_migration_items_identity_guard ON asset_migration_items;
CREATE TRIGGER asset_migration_items_identity_guard
  BEFORE UPDATE ON asset_migration_items
  FOR EACH ROW EXECUTE FUNCTION enforce_asset_inventory_identity();
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'asset_aggregate_authorities',
    'asset_migrations',
    'asset_migration_items',
    'asset_validation_facts'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS workspace_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY workspace_isolation ON %I USING (workspace_id = current_setting(''app.workspace_id'', true)) WITH CHECK (workspace_id = current_setting(''app.workspace_id'', true))',
      table_name
    );
  END LOOP;
END;
$$;
`;

export type AssetAggregateAuthority = "filesystem-legacy" | "object-storage-v1";

export interface AssetAggregateAuthorityRecord {
  readonly workspaceId: string;
  readonly aggregateId: string;
  readonly authority: AssetAggregateAuthority;
  readonly revision: number;
  readonly rollbackDeadline: string | null;
  readonly sourceRetained: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AssetMigrationInventoryInput {
  readonly assetId: string;
  readonly logicalRole: string;
  readonly sourceLocator: string;
  readonly expectedSha256: string;
  readonly expectedBytes: bigint;
  readonly expectedMimeType: string;
  readonly required: boolean;
  readonly lineage: Readonly<Record<string, unknown>>;
  readonly dependencies: readonly string[];
  readonly provenance: Readonly<Record<string, unknown>>;
}

export interface AssetMigrationItemClaim {
  readonly workspaceId: string;
  readonly migrationId: string;
  readonly assetId: string;
  readonly logicalRole: string;
  readonly sourceLocator: string;
  readonly expectedSha256: string;
  readonly expectedBytes: bigint;
  readonly expectedMimeType: string;
  readonly required: boolean;
  readonly lineage: Readonly<Record<string, unknown>>;
  readonly dependencies: readonly string[];
  readonly provenance: Readonly<Record<string, unknown>>;
  readonly claimOwner: string;
  readonly claimFence: number;
  readonly claimExpiresAt: string;
  readonly revision: number;
}

interface AuthorityRow {
  readonly workspace_id: string;
  readonly aggregate_id: string;
  readonly authority: AssetAggregateAuthority;
  readonly revision: string | number;
  readonly rollback_deadline: Date | string | null;
  readonly source_retained: boolean;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

interface MigrationRow {
  readonly migration_id: string;
  readonly aggregate_id: string;
  readonly state: "active" | "cutover" | "rolled_back";
  readonly revision: string | number;
}

interface ClaimRow {
  readonly workspace_id: string;
  readonly migration_id: string;
  readonly asset_id: string;
  readonly logical_role: string;
  readonly source_locator: string;
  readonly expected_sha256: string;
  readonly expected_bytes: string | bigint;
  readonly expected_mime_type: string;
  readonly required: boolean;
  readonly lineage: Readonly<Record<string, unknown>>;
  readonly dependencies: readonly string[];
  readonly provenance: Readonly<Record<string, unknown>>;
  readonly claim_owner: string;
  readonly claim_fence: string | number;
  readonly claim_expires_at: Date | string;
  readonly revision: string | number;
}

export class AssetMigrationPersistenceError extends Error {}
export class AssetAuthorityConflictError extends AssetMigrationPersistenceError {}
export class AssetMigrationStaleError extends AssetMigrationPersistenceError {}
export class AssetMigrationIncompleteError extends AssetMigrationPersistenceError {}

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

function mapAuthority(row: AuthorityRow): AssetAggregateAuthorityRecord {
  return {
    workspaceId: row.workspace_id,
    aggregateId: row.aggregate_id,
    authority: row.authority,
    revision: Number(row.revision),
    rollbackDeadline:
      row.rollback_deadline === null ? null : iso(row.rollback_deadline),
    sourceRetained: row.source_retained,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapClaim(row: ClaimRow): AssetMigrationItemClaim {
  return {
    workspaceId: row.workspace_id,
    migrationId: row.migration_id,
    assetId: row.asset_id,
    logicalRole: row.logical_role,
    sourceLocator: row.source_locator,
    expectedSha256: row.expected_sha256,
    expectedBytes: BigInt(row.expected_bytes),
    expectedMimeType: row.expected_mime_type,
    required: row.required,
    lineage: row.lineage,
    dependencies: row.dependencies,
    provenance: row.provenance,
    claimOwner: row.claim_owner,
    claimFence: Number(row.claim_fence),
    claimExpiresAt: iso(row.claim_expires_at),
    revision: Number(row.revision),
  };
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new AssetMigrationPersistenceError(
      `${name} must be a positive integer.`
    );
}

function assertInventory(items: readonly AssetMigrationInventoryInput[]): void {
  if (items.length === 0)
    throw new AssetMigrationPersistenceError(
      "Asset migration inventory cannot be empty."
    );
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.assetId))
      throw new AssetMigrationPersistenceError(
        "Asset migration inventory IDs must be unique."
      );
    ids.add(item.assetId);
    if (
      item.expectedBytes <= 0n ||
      !/^[a-f0-9]{64}$/u.test(item.expectedSha256)
    )
      throw new AssetMigrationPersistenceError(
        "Asset migration inventory hash or byte count is invalid."
      );
  }
}

export class PostgresAssetMigrationRepository {
  public constructor(private readonly pool: PostgresPool) {}

  public async migrate(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(POSTGRES_ASSET_MIGRATION_MIGRATION);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async transaction<T>(
    workspaceId: string,
    work: (client: PostgresClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [
        workspaceId,
      ]);
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public registerLegacyAggregate(input: {
    readonly workspaceId: string;
    readonly aggregateId: string;
    readonly now: string;
  }): Promise<AssetAggregateAuthorityRecord> {
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<AuthorityRow>(
        `INSERT INTO asset_aggregate_authorities (
           workspace_id, aggregate_id, authority, created_at, updated_at
         ) VALUES ($1, $2, 'filesystem-legacy', $3::timestamptz, $3::timestamptz)
         ON CONFLICT (workspace_id, aggregate_id) DO NOTHING
         RETURNING *`,
        [input.workspaceId, input.aggregateId, input.now]
      );
      if (result.rows[0]) return mapAuthority(result.rows[0]);
      const existing = await client.query<AuthorityRow>(
        `SELECT * FROM asset_aggregate_authorities
         WHERE workspace_id = $1 AND aggregate_id = $2`,
        [input.workspaceId, input.aggregateId]
      );
      const authority = existing.rows[0];
      if (!authority || authority.authority !== "filesystem-legacy")
        throw new AssetAuthorityConflictError(
          "Aggregate is not writable by the legacy authority."
        );
      return mapAuthority(authority);
    });
  }

  public startMigration(input: {
    readonly workspaceId: string;
    readonly migrationId: string;
    readonly aggregateId: string;
    readonly expectedAuthorityRevision: number;
    readonly rollbackDeadline: string;
    readonly sourceRetained: boolean;
    readonly items: readonly AssetMigrationInventoryInput[];
    readonly now: string;
  }): Promise<void> {
    assertInventory(input.items);
    if (new Date(input.rollbackDeadline) <= new Date(input.now))
      throw new AssetMigrationPersistenceError(
        "Rollback deadline must be after migration creation."
      );
    return this.transaction(input.workspaceId, async (client) => {
      const authority = await this.lockAuthority(
        client,
        input.workspaceId,
        input.aggregateId
      );
      if (authority.authority !== "filesystem-legacy")
        throw new AssetAuthorityConflictError(
          "Only the active legacy writer may start migration."
        );
      if (Number(authority.revision) !== input.expectedAuthorityRevision)
        throw new AssetMigrationStaleError(
          "Aggregate authority revision is stale."
        );
      await client.query(
        `INSERT INTO asset_migrations (
           workspace_id, migration_id, aggregate_id, source_authority,
           target_authority, expected_authority_revision, rollback_deadline,
           source_retained, created_at, updated_at
         ) VALUES ($1, $2, $3, 'filesystem-legacy', 'object-storage-v1',
                   $4, $5::timestamptz, $6, $7::timestamptz, $7::timestamptz)`,
        [
          input.workspaceId,
          input.migrationId,
          input.aggregateId,
          input.expectedAuthorityRevision,
          input.rollbackDeadline,
          input.sourceRetained,
          input.now,
        ]
      );
      for (const item of input.items) {
        await client.query(
          `INSERT INTO asset_migration_items (
             workspace_id, migration_id, asset_id, logical_role, source_locator,
             expected_sha256, expected_bytes, expected_mime_type, required,
             lineage, dependencies, provenance, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                     $10::jsonb, $11::jsonb, $12::jsonb,
                     $13::timestamptz, $13::timestamptz)`,
          [
            input.workspaceId,
            input.migrationId,
            item.assetId,
            item.logicalRole,
            item.sourceLocator,
            item.expectedSha256,
            item.expectedBytes,
            item.expectedMimeType,
            item.required,
            JSON.stringify(item.lineage),
            JSON.stringify(item.dependencies),
            JSON.stringify(item.provenance),
            input.now,
          ]
        );
      }
    });
  }

  public claimNextItem(input: {
    readonly workspaceId: string;
    readonly migrationId: string;
    readonly workerId: string;
    readonly leaseSeconds: number;
    readonly now: string;
  }): Promise<AssetMigrationItemClaim | null> {
    assertPositiveInteger(input.leaseSeconds, "Asset migration lease seconds");
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<ClaimRow>(
        `WITH candidate AS (
           SELECT item.asset_id
           FROM asset_migration_items AS item
           JOIN asset_migrations AS migration
             ON migration.workspace_id = item.workspace_id
            AND migration.migration_id = item.migration_id
           WHERE item.workspace_id = $1 AND item.migration_id = $2
             AND migration.state = 'active'
             AND (item.state IN ('pending', 'failed')
               OR (item.state = 'claimed' AND item.claim_expires_at <= $3::timestamptz))
           ORDER BY item.required DESC, item.asset_id
           FOR UPDATE OF item SKIP LOCKED LIMIT 1
         )
         UPDATE asset_migration_items AS item
         SET state = 'claimed', claim_owner = $4, claim_fence = claim_fence + 1,
             claim_expires_at = $3::timestamptz + ($5::text || ' seconds')::interval,
             last_error = NULL, revision = revision + 1, updated_at = $3::timestamptz
         FROM candidate
         WHERE item.workspace_id = $1 AND item.migration_id = $2
           AND item.asset_id = candidate.asset_id
         RETURNING item.*`,
        [
          input.workspaceId,
          input.migrationId,
          input.now,
          input.workerId,
          input.leaseSeconds,
        ]
      );
      return result.rows[0] ? mapClaim(result.rows[0]) : null;
    });
  }

  public recordItemReady(input: {
    readonly workspaceId: string;
    readonly migrationId: string;
    readonly assetId: string;
    readonly workerId: string;
    readonly claimFence: number;
    readonly validationId: string;
    readonly sha256: string;
    readonly bytes: bigint;
    readonly mimeType: string;
    readonly targetLocator: string;
    readonly validator: string;
    readonly evidence: Readonly<Record<string, unknown>>;
    readonly now: string;
  }): Promise<void> {
    assertPositiveInteger(input.claimFence, "Asset migration claim fence");
    return this.transaction(input.workspaceId, async (client) => {
      const validation = await client.query(
        `INSERT INTO asset_validation_facts (
           workspace_id, validation_id, migration_id, asset_id, sha256,
           byte_count, mime_type, target_locator, validator, evidence, validated_at
         )
         SELECT $1, $2, item.migration_id, item.asset_id, $6, $7, $8, $9, $10,
                $11::jsonb, $12::timestamptz
         FROM asset_migration_items AS item
         JOIN asset_migrations AS migration
           ON migration.workspace_id = item.workspace_id
          AND migration.migration_id = item.migration_id
         WHERE item.workspace_id = $1 AND item.migration_id = $3 AND item.asset_id = $4
           AND item.state = 'claimed' AND item.claim_owner = $5
           AND item.claim_fence = $13 AND migration.state = 'active'
           AND item.expected_sha256 = $6 AND item.expected_bytes = $7
           AND item.expected_mime_type = $8
         RETURNING validation_id`,
        [
          input.workspaceId,
          input.validationId,
          input.migrationId,
          input.assetId,
          input.workerId,
          input.sha256,
          input.bytes,
          input.mimeType,
          input.targetLocator,
          input.validator,
          JSON.stringify(input.evidence),
          input.now,
          input.claimFence,
        ]
      );
      if (validation.rowCount !== 1)
        throw new AssetMigrationStaleError(
          "Asset claim is stale or validation evidence mismatches inventory."
        );
      const updated = await client.query(
        `UPDATE asset_migration_items
         SET state = 'ready', target_locator = $1, validation_id = $2,
             claim_owner = NULL, claim_expires_at = NULL, last_error = NULL,
             revision = revision + 1, updated_at = $3::timestamptz
         WHERE workspace_id = $4 AND migration_id = $5 AND asset_id = $6
           AND state = 'claimed' AND claim_owner = $7 AND claim_fence = $8`,
        [
          input.targetLocator,
          input.validationId,
          input.now,
          input.workspaceId,
          input.migrationId,
          input.assetId,
          input.workerId,
          input.claimFence,
        ]
      );
      if (updated.rowCount !== 1)
        throw new AssetMigrationStaleError(
          "Asset claim was lost before ready registration."
        );
    });
  }

  public cutover(input: {
    readonly workspaceId: string;
    readonly migrationId: string;
    readonly aggregateId: string;
    readonly expectedAuthorityRevision: number;
    readonly expectedMigrationRevision: number;
    readonly now: string;
  }): Promise<AssetAggregateAuthorityRecord> {
    return this.transaction(input.workspaceId, async (client) => {
      const authority = await this.lockAuthority(
        client,
        input.workspaceId,
        input.aggregateId
      );
      if (authority.authority !== "filesystem-legacy")
        throw new AssetAuthorityConflictError(
          "Legacy authority is no longer the active writer."
        );
      if (Number(authority.revision) !== input.expectedAuthorityRevision)
        throw new AssetMigrationStaleError(
          "Aggregate authority revision is stale."
        );
      const migration = await this.lockMigration(
        client,
        input.workspaceId,
        input.migrationId
      );
      if (
        migration.aggregate_id !== input.aggregateId ||
        migration.state !== "active"
      )
        throw new AssetAuthorityConflictError(
          "Migration does not own an active cutover for this aggregate."
        );
      if (Number(migration.revision) !== input.expectedMigrationRevision)
        throw new AssetMigrationStaleError(
          "Asset migration revision is stale."
        );
      const incomplete = await client.query<{ readonly incomplete: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM asset_migration_items AS item
           LEFT JOIN asset_validation_facts AS fact
             ON fact.workspace_id = item.workspace_id
            AND fact.migration_id = item.migration_id
            AND fact.asset_id = item.asset_id
           WHERE item.workspace_id = $1 AND item.migration_id = $2 AND item.required
             AND (item.state <> 'ready' OR fact.validation_id IS NULL
               OR fact.sha256 <> item.expected_sha256
               OR fact.byte_count <> item.expected_bytes
               OR fact.mime_type <> item.expected_mime_type
               OR fact.target_locator <> item.target_locator)
         ) AS incomplete`,
        [input.workspaceId, input.migrationId]
      );
      if (incomplete.rows[0]?.incomplete !== false)
        throw new AssetMigrationIncompleteError(
          "Required migration assets are not durably validated and ready."
        );
      const switched = await client.query<AuthorityRow>(
        `UPDATE asset_aggregate_authorities AS authority
         SET authority = 'object-storage-v1', revision = revision + 1,
             rollback_deadline = migration.rollback_deadline,
             source_retained = migration.source_retained,
             updated_at = $1::timestamptz
         FROM asset_migrations AS migration
         WHERE authority.workspace_id = $2 AND authority.aggregate_id = $3
           AND authority.authority = 'filesystem-legacy' AND authority.revision = $4
           AND migration.workspace_id = authority.workspace_id
           AND migration.migration_id = $5 AND migration.aggregate_id = authority.aggregate_id
           AND migration.state = 'active' AND migration.revision = $6
         RETURNING authority.*`,
        [
          input.now,
          input.workspaceId,
          input.aggregateId,
          input.expectedAuthorityRevision,
          input.migrationId,
          input.expectedMigrationRevision,
        ]
      );
      if (!switched.rows[0])
        throw new AssetMigrationStaleError(
          "Asset authority changed during cutover."
        );
      const finalized = await client.query(
        `UPDATE asset_migrations
         SET state = 'cutover', revision = revision + 1, updated_at = $1::timestamptz
         WHERE workspace_id = $2 AND migration_id = $3
           AND state = 'active' AND revision = $4`,
        [
          input.now,
          input.workspaceId,
          input.migrationId,
          input.expectedMigrationRevision,
        ]
      );
      if (finalized.rowCount !== 1)
        throw new AssetMigrationStaleError(
          "Asset migration changed during cutover."
        );
      return mapAuthority(switched.rows[0]);
    });
  }

  public rollbackCutover(input: {
    readonly workspaceId: string;
    readonly migrationId: string;
    readonly aggregateId: string;
    readonly expectedAuthorityRevision: number;
    readonly expectedMigrationRevision: number;
    readonly now: string;
  }): Promise<AssetAggregateAuthorityRecord> {
    return this.transaction(input.workspaceId, async (client) => {
      const authority = await this.lockAuthority(
        client,
        input.workspaceId,
        input.aggregateId
      );
      if (
        authority.authority !== "object-storage-v1" ||
        !authority.source_retained
      )
        throw new AssetAuthorityConflictError(
          "Rollback requires retained legacy source under object-storage authority."
        );
      if (Number(authority.revision) !== input.expectedAuthorityRevision)
        throw new AssetMigrationStaleError(
          "Aggregate authority revision is stale."
        );
      if (
        !authority.rollback_deadline ||
        new Date(authority.rollback_deadline) <= new Date(input.now)
      )
        throw new AssetAuthorityConflictError(
          "Asset migration rollback window has expired."
        );
      const migration = await this.lockMigration(
        client,
        input.workspaceId,
        input.migrationId
      );
      if (
        migration.aggregate_id !== input.aggregateId ||
        migration.state !== "cutover"
      )
        throw new AssetAuthorityConflictError(
          "Migration is not the active cutover for this aggregate."
        );
      if (Number(migration.revision) !== input.expectedMigrationRevision)
        throw new AssetMigrationStaleError(
          "Asset migration revision is stale."
        );
      const rolledBack = await client.query<AuthorityRow>(
        `UPDATE asset_aggregate_authorities
         SET authority = 'filesystem-legacy', revision = revision + 1,
             rollback_deadline = NULL, updated_at = $1::timestamptz
         WHERE workspace_id = $2 AND aggregate_id = $3
           AND authority = 'object-storage-v1' AND revision = $4
           AND source_retained AND rollback_deadline > $1::timestamptz
         RETURNING *`,
        [
          input.now,
          input.workspaceId,
          input.aggregateId,
          input.expectedAuthorityRevision,
        ]
      );
      if (!rolledBack.rows[0])
        throw new AssetMigrationStaleError(
          "Asset authority changed during rollback."
        );
      const finalized = await client.query(
        `UPDATE asset_migrations
         SET state = 'rolled_back', revision = revision + 1, updated_at = $1::timestamptz
         WHERE workspace_id = $2 AND migration_id = $3
           AND state = 'cutover' AND revision = $4`,
        [
          input.now,
          input.workspaceId,
          input.migrationId,
          input.expectedMigrationRevision,
        ]
      );
      if (finalized.rowCount !== 1)
        throw new AssetMigrationStaleError(
          "Asset migration changed during rollback."
        );
      return mapAuthority(rolledBack.rows[0]);
    });
  }

  public async assertWriterAuthority(input: {
    readonly workspaceId: string;
    readonly aggregateId: string;
    readonly expectedAuthority: AssetAggregateAuthority;
  }): Promise<AssetAggregateAuthorityRecord> {
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<AuthorityRow>(
        `SELECT * FROM asset_aggregate_authorities
         WHERE workspace_id = $1 AND aggregate_id = $2 AND authority = $3`,
        [input.workspaceId, input.aggregateId, input.expectedAuthority]
      );
      if (!result.rows[0])
        throw new AssetAuthorityConflictError(
          "Requested writer is not authoritative for this aggregate."
        );
      return mapAuthority(result.rows[0]);
    });
  }

  private async lockAuthority(
    client: PostgresClient,
    workspaceId: string,
    aggregateId: string
  ): Promise<AuthorityRow> {
    const result = await client.query<AuthorityRow>(
      `SELECT * FROM asset_aggregate_authorities
       WHERE workspace_id = $1 AND aggregate_id = $2 FOR UPDATE`,
      [workspaceId, aggregateId]
    );
    if (!result.rows[0])
      throw new AssetAuthorityConflictError(
        "Asset aggregate authority is not registered."
      );
    return result.rows[0];
  }

  private async lockMigration(
    client: PostgresClient,
    workspaceId: string,
    migrationId: string
  ): Promise<MigrationRow> {
    const result = await client.query<MigrationRow>(
      `SELECT migration_id, aggregate_id, state, revision
       FROM asset_migrations
       WHERE workspace_id = $1 AND migration_id = $2 FOR UPDATE`,
      [workspaceId, migrationId]
    );
    if (!result.rows[0])
      throw new AssetAuthorityConflictError(
        "Asset migration is not registered."
      );
    return result.rows[0];
  }
}
