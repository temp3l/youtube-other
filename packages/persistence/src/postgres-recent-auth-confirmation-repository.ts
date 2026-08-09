import type { PostgresPool, PostgresQueryResult } from "./postgres-workflow-repository.js";

export const POSTGRES_RECENT_AUTH_CONFIRMATION_MIGRATION = `
CREATE TABLE IF NOT EXISTS recent_auth_confirmations (
  workspace_id TEXT NOT NULL,
  confirmation_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  action TEXT NOT NULL,
  csrf_session_id TEXT NOT NULL,
  authenticated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  PRIMARY KEY (workspace_id, confirmation_id),
  CHECK (expires_at > authenticated_at)
);
CREATE INDEX IF NOT EXISTS recent_auth_confirmations_lookup
  ON recent_auth_confirmations (workspace_id, principal_id, action, csrf_session_id, expires_at DESC)
  WHERE consumed_at IS NULL;
DO $$ BEGIN
  ALTER TABLE recent_auth_confirmations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE recent_auth_confirmations FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS workspace_isolation ON recent_auth_confirmations;
  CREATE POLICY workspace_isolation ON recent_auth_confirmations
    USING (workspace_id = current_setting('app.workspace_id', true))
    WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
END $$;
`;

export interface RecentAuthConfirmationBinding {
  readonly workspaceId: string;
  readonly principalId: string;
  readonly action: string;
  readonly csrfSessionId: string;
}

export class PostgresRecentAuthConfirmationRepository {
  public constructor(private readonly pool: PostgresPool) {}

  private async transaction<T>(workspaceId: string, work: (client: { query<T>(sql: string, values?: readonly unknown[]): Promise<PostgresQueryResult<T>> }) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query("BEGIN"); await client.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceId]); const result = await work(client); await client.query("COMMIT"); return result; }
    catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  public async record(input: RecentAuthConfirmationBinding & { readonly confirmationId: string; readonly authenticatedAt: string; readonly expiresAt: string }): Promise<void> {
    await this.transaction(input.workspaceId, async (client) => { await client.query(`INSERT INTO recent_auth_confirmations (workspace_id, confirmation_id, principal_id, action, csrf_session_id, authenticated_at, expires_at) VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7::timestamptz)`, [input.workspaceId, input.confirmationId, input.principalId, input.action, input.csrfSessionId, input.authenticatedAt, input.expiresAt]); });
  }

  /** Consumes exactly one unexpired confirmation for the exact security binding. */
  public async consume(input: RecentAuthConfirmationBinding & { readonly now: string }): Promise<boolean> {
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<{ readonly confirmation_id: string }>(`WITH selected AS (SELECT confirmation_id FROM recent_auth_confirmations WHERE workspace_id=$1 AND principal_id=$2 AND action=$3 AND csrf_session_id=$4 AND consumed_at IS NULL AND expires_at > $5::timestamptz ORDER BY authenticated_at DESC, confirmation_id DESC LIMIT 1 FOR UPDATE) UPDATE recent_auth_confirmations AS confirmation SET consumed_at=$5::timestamptz FROM selected WHERE confirmation.workspace_id=$1 AND confirmation.confirmation_id=selected.confirmation_id RETURNING confirmation.confirmation_id`, [input.workspaceId, input.principalId, input.action, input.csrfSessionId, input.now]);
      return result.rows.length === 1;
    });
  }
}
