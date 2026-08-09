import type { BulkProductionPreflight } from "@mediaforge/domain";

import type { PostgresPool, PostgresQueryResult } from "./postgres-workflow-repository.js";

export const POSTGRES_BULK_PRODUCTION_MIGRATION = `
CREATE TABLE IF NOT EXISTS bulk_production_batches (
  workspace_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  selection_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned', 'running', 'partial', 'succeeded', 'failed', 'cancelling', 'cancelled')),
  created_by_principal_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, batch_id),
  UNIQUE (workspace_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS bulk_production_batch_items (
  workspace_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  selection_order INTEGER NOT NULL CHECK (selection_order >= 0),
  project_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  expected_revision BIGINT NOT NULL CHECK (expected_revision >= 0),
  locale TEXT NOT NULL,
  variant TEXT NOT NULL,
  item_fingerprint TEXT NOT NULL,
  eligible BOOLEAN NOT NULL,
  eligibility_reasons JSONB NOT NULL CHECK (jsonb_typeof(eligibility_reasons) = 'array'),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed-retryable', 'failed-permanent', 'cancelled', 'ineligible')),
  workflow_run_id TEXT NULL,
  job_id TEXT NULL,
  error_code TEXT NULL,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, batch_id, item_id),
  FOREIGN KEY (workspace_id, batch_id) REFERENCES bulk_production_batches (workspace_id, batch_id)
);
CREATE INDEX IF NOT EXISTS bulk_production_batch_items_status_idx
  ON bulk_production_batch_items (workspace_id, batch_id, status, selection_order);
DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['bulk_production_batches', 'bulk_production_batch_items'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS workspace_isolation ON %I', table_name);
    EXECUTE format('CREATE POLICY workspace_isolation ON %I USING (workspace_id = current_setting(''app.workspace_id'', true)) WITH CHECK (workspace_id = current_setting(''app.workspace_id'', true))', table_name);
  END LOOP;
END $$;
`;

export class BulkProductionPersistenceError extends Error {
  public override readonly name = "BulkProductionPersistenceError";
}

export interface BulkProductionBatchRecord {
  readonly workspaceId: string;
  readonly batchId: string;
  readonly selectionFingerprint: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class PostgresBulkProductionRepository {
  public constructor(private readonly pool: PostgresPool) {}

  private async withWorkspace<T>(workspaceId: string, work: (client: { query<TValue>(sql: string, values?: readonly unknown[]): Promise<PostgresQueryResult<TValue>> }) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceId]);
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  public async ensureSchema(): Promise<void> {
    const client = await this.pool.connect();
    try { await client.query(POSTGRES_BULK_PRODUCTION_MIGRATION); } finally { client.release(); }
  }

  /** Persists the exact preflight outcome atomically; idempotent replays never duplicate items. */
  public async createFromPreflight(input: {
    readonly batchId: string;
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
    readonly principalId: string;
    readonly preflight: BulkProductionPreflight;
    readonly now: string;
  }): Promise<{ readonly kind: "created" | "replayed"; readonly batch: BulkProductionBatchRecord }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [input.preflight.workspaceId]);
      const inserted = await client.query<{ readonly workspace_id: string; readonly batch_id: string; readonly selection_fingerprint: string; readonly status: string; readonly created_at: string; readonly updated_at: string }>(
        `INSERT INTO bulk_production_batches (workspace_id, batch_id, idempotency_key, request_fingerprint, selection_fingerprint, status, created_by_principal_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,'planned',$6,$7::timestamptz,$7::timestamptz)
         ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
         RETURNING workspace_id, batch_id, selection_fingerprint, status, created_at, updated_at`,
        [input.preflight.workspaceId, input.batchId, input.idempotencyKey, input.requestFingerprint, input.preflight.selectionFingerprint, input.principalId, input.now]
      );
      const toRecord = (value: { readonly workspace_id: string; readonly batch_id: string; readonly selection_fingerprint: string; readonly status: string; readonly created_at: string; readonly updated_at: string }): BulkProductionBatchRecord => ({ workspaceId: value.workspace_id, batchId: value.batch_id, selectionFingerprint: value.selection_fingerprint, status: value.status, createdAt: value.created_at, updatedAt: value.updated_at });
      if (!inserted.rows[0]) {
        const existing = await client.query<{ readonly workspace_id: string; readonly batch_id: string; readonly selection_fingerprint: string; readonly status: string; readonly created_at: string; readonly updated_at: string; readonly request_fingerprint: string }>(`SELECT workspace_id, batch_id, selection_fingerprint, status, created_at, updated_at, request_fingerprint FROM bulk_production_batches WHERE workspace_id=$1 AND idempotency_key=$2 FOR UPDATE`, [input.preflight.workspaceId, input.idempotencyKey]);
        const value = existing.rows[0];
        if (!value) throw new BulkProductionPersistenceError("Batch idempotency record disappeared.");
        if (value.request_fingerprint !== input.requestFingerprint) throw new BulkProductionPersistenceError("Idempotency key is already associated with a different batch request.");
        await client.query("COMMIT"); return { kind: "replayed", batch: toRecord(value) };
      }
      for (const [selectionOrder, item] of input.preflight.items.entries()) {
        await client.query(`INSERT INTO bulk_production_batch_items (workspace_id, batch_id, item_id, selection_order, project_id, episode_id, expected_revision, locale, variant, item_fingerprint, eligible, eligibility_reasons, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14::timestamptz,$14::timestamptz)`, [input.preflight.workspaceId, input.batchId, `item-${selectionOrder + 1}`, selectionOrder, item.item.projectId, item.item.episodeId, item.item.expectedRevision, item.item.locale, item.item.variant, item.fingerprint, item.eligible, JSON.stringify(item.reasons), item.eligible ? "pending" : "ineligible", input.now]);
      }
      await client.query("COMMIT");
      return { kind: "created", batch: toRecord(inserted.rows[0]) };
    } catch (error) {
      await client.query("ROLLBACK"); throw error;
    } finally { client.release(); }
  }

  public async listItems(input: { readonly workspaceId: string; readonly batchId: string }): Promise<readonly { readonly itemId: string; readonly eligible: boolean; readonly status: string; readonly reasons: readonly string[] }[]> {
    return this.withWorkspace(input.workspaceId, async (client) => {
      const result = await client.query<{ readonly item_id: string; readonly eligible: boolean; readonly status: string; readonly eligibility_reasons: unknown }>(`SELECT item_id, eligible, status, eligibility_reasons FROM bulk_production_batch_items WHERE workspace_id=$1 AND batch_id=$2 ORDER BY selection_order`, [input.workspaceId, input.batchId]);
      return result.rows.map((row) => ({ itemId: row.item_id, eligible: row.eligible, status: row.status, reasons: Array.isArray(row.eligibility_reasons) ? row.eligibility_reasons.filter((value): value is string => typeof value === "string") : [] }));
    });
  }

  public async getBatch(input: { readonly workspaceId: string; readonly batchId: string }): Promise<BulkProductionBatchRecord | null> {
    return this.withWorkspace(input.workspaceId, async (client) => {
      const result = await client.query<{ readonly workspace_id: string; readonly batch_id: string; readonly selection_fingerprint: string; readonly status: string; readonly created_at: string; readonly updated_at: string }>(`SELECT workspace_id, batch_id, selection_fingerprint, status, created_at, updated_at FROM bulk_production_batches WHERE workspace_id=$1 AND batch_id=$2`, [input.workspaceId, input.batchId]);
      const row = result.rows[0];
      return row ? { workspaceId: row.workspace_id, batchId: row.batch_id, selectionFingerprint: row.selection_fingerprint, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at } : null;
    });
  }
}
