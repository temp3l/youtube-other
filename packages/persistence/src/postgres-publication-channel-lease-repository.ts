import type {
  PostgresClient,
  PostgresPool,
} from "./postgres-workflow-repository.js";

export const POSTGRES_PUBLICATION_CHANNEL_LEASE_MIGRATION = `
CREATE TABLE IF NOT EXISTS publication_channel_leases (
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  lease_owner TEXT NULL,
  lease_fence BIGINT NOT NULL DEFAULT 0 CHECK (lease_fence >= 0),
  lease_expires_at TIMESTAMPTZ NULL,
  last_heartbeat_at TIMESTAMPTZ NULL,
  revision BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, channel_id),
  CHECK ((lease_owner IS NULL AND lease_expires_at IS NULL)
    OR (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS publication_channel_leases_expiry_idx
  ON publication_channel_leases (workspace_id, lease_expires_at, channel_id)
  WHERE lease_owner IS NOT NULL;
CREATE OR REPLACE FUNCTION enforce_publication_channel_lease_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'publication channel lease rows cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.channel_id IS DISTINCT FROM OLD.channel_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'publication channel lease identity is immutable' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'publication channel lease revision must advance exactly once' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.lease_fence < OLD.lease_fence
    OR (NEW.lease_owner IS NOT NULL AND NEW.lease_owner IS DISTINCT FROM OLD.lease_owner
      AND NEW.lease_fence <> OLD.lease_fence + 1) THEN
    RAISE EXCEPTION 'publication channel lease fence must be monotonic' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS publication_channel_lease_guard ON publication_channel_leases;
CREATE TRIGGER publication_channel_lease_guard
  BEFORE UPDATE OR DELETE ON publication_channel_leases
  FOR EACH ROW EXECUTE FUNCTION enforce_publication_channel_lease_mutation();
ALTER TABLE publication_channel_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE publication_channel_leases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_isolation ON publication_channel_leases;
CREATE POLICY workspace_isolation ON publication_channel_leases
  USING (workspace_id = current_setting('app.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
`;

export interface PublicationChannelLease {
  readonly workspaceId: string;
  readonly channelId: string;
  readonly leaseOwner: string;
  readonly leaseFence: number;
  readonly leaseExpiresAt: string;
  readonly lastHeartbeatAt: string;
  readonly revision: number;
}

interface LeaseRow {
  readonly workspace_id: string;
  readonly channel_id: string;
  readonly lease_owner: string;
  readonly lease_fence: string | number;
  readonly lease_expires_at: Date | string;
  readonly last_heartbeat_at: Date | string;
  readonly revision: string | number;
}

export class PublicationChannelLeasePersistenceError extends Error {}

function mapLease(row: LeaseRow): PublicationChannelLease {
  return {
    workspaceId: row.workspace_id,
    channelId: row.channel_id,
    leaseOwner: row.lease_owner,
    leaseFence: Number(row.lease_fence),
    leaseExpiresAt: new Date(row.lease_expires_at).toISOString(),
    lastHeartbeatAt: new Date(row.last_heartbeat_at).toISOString(),
    revision: Number(row.revision),
  };
}

function positive(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new PublicationChannelLeasePersistenceError(
      `${name} must be a positive integer.`
    );
}

export class PostgresPublicationChannelLeaseRepository {
  public constructor(private readonly pool: PostgresPool) {}

  public async migrate(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(POSTGRES_PUBLICATION_CHANNEL_LEASE_MIGRATION);
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

  /** Acquires an unowned channel or reclaims an expired one with a new fence. */
  public claim(input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly workerId: string;
    readonly leaseSeconds: number;
    readonly now: string;
  }): Promise<PublicationChannelLease | null> {
    positive(input.leaseSeconds, "Publication channel lease seconds");
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<LeaseRow>(
        `INSERT INTO publication_channel_leases (
           workspace_id, channel_id, lease_owner, lease_fence,
           lease_expires_at, last_heartbeat_at, created_at, updated_at
         ) VALUES ($1, $2, $3, 1,
                   $4::timestamptz + ($5::text || ' seconds')::interval,
                   $4::timestamptz, $4::timestamptz, $4::timestamptz)
         ON CONFLICT (workspace_id, channel_id) DO UPDATE
         SET lease_owner = EXCLUDED.lease_owner,
             lease_fence = publication_channel_leases.lease_fence + 1,
             lease_expires_at = EXCLUDED.lease_expires_at,
             last_heartbeat_at = EXCLUDED.last_heartbeat_at,
             revision = publication_channel_leases.revision + 1,
             updated_at = EXCLUDED.updated_at
         WHERE publication_channel_leases.lease_owner IS NULL
            OR publication_channel_leases.lease_expires_at <= $4::timestamptz
         RETURNING *`,
        [
          input.workspaceId,
          input.channelId,
          input.workerId,
          input.now,
          input.leaseSeconds,
        ]
      );
      return result.rows[0] ? mapLease(result.rows[0]) : null;
    });
  }

  public heartbeat(input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly workerId: string;
    readonly leaseFence: number;
    readonly leaseSeconds: number;
    readonly now: string;
  }): Promise<PublicationChannelLease | null> {
    positive(input.leaseFence, "Publication channel lease fence");
    positive(input.leaseSeconds, "Publication channel lease seconds");
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<LeaseRow>(
        `UPDATE publication_channel_leases
         SET lease_expires_at = $1::timestamptz + ($2::text || ' seconds')::interval,
             last_heartbeat_at = $1::timestamptz,
             revision = revision + 1, updated_at = $1::timestamptz
         WHERE workspace_id = $3 AND channel_id = $4
           AND lease_owner = $5 AND lease_fence = $6
           AND lease_expires_at > $1::timestamptz
         RETURNING *`,
        [
          input.now,
          input.leaseSeconds,
          input.workspaceId,
          input.channelId,
          input.workerId,
          input.leaseFence,
        ]
      );
      return result.rows[0] ? mapLease(result.rows[0]) : null;
    });
  }

  public release(input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly workerId: string;
    readonly leaseFence: number;
    readonly now: string;
  }): Promise<boolean> {
    positive(input.leaseFence, "Publication channel lease fence");
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query(
        `UPDATE publication_channel_leases
         SET lease_owner = NULL, lease_expires_at = NULL,
             last_heartbeat_at = NULL, revision = revision + 1,
             updated_at = $1::timestamptz
         WHERE workspace_id = $2 AND channel_id = $3
           AND lease_owner = $4 AND lease_fence = $5`,
        [
          input.now,
          input.workspaceId,
          input.channelId,
          input.workerId,
          input.leaseFence,
        ]
      );
      return result.rowCount === 1;
    });
  }
}
