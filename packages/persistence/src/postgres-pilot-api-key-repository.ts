import type {
  PostgresClient,
  PostgresPool,
  PostgresQueryResult,
} from "./postgres-workflow-repository.js";

export interface PersistedPilotApiKeyRecord {
  readonly workspaceId: string;
  readonly keyId: string;
  readonly principalId: string;
  readonly permissions: readonly string[];
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly revision: number;
}

export interface PersistedPilotApiKeyCandidate extends PersistedPilotApiKeyRecord {
  readonly secretHash: string;
  readonly principalPermissions: readonly string[];
}

interface IssueInput {
  readonly workspaceId: string;
  readonly keyId: string;
  readonly principalId: string;
  readonly lookupFingerprint: string;
  readonly secretHash: string;
  readonly permissions: readonly string[];
  readonly expiresAt: string;
  readonly actorSubject: string;
  readonly auditId: string;
  readonly now: string;
}

interface RotateInput extends IssueInput {
  readonly previousKeyId: string;
  readonly previousExpectedRevision: number;
}

interface RevokeInput {
  readonly workspaceId: string;
  readonly keyId: string;
  readonly expectedRevision: number;
  readonly actorSubject: string;
  readonly reason: string;
  readonly auditId: string;
  readonly now: string;
}

export const POSTGRES_PILOT_API_KEY_MIGRATION = `
CREATE TABLE IF NOT EXISTS pilot_api_keys (
  workspace_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  lookup_fingerprint TEXT NOT NULL CHECK (lookup_fingerprint ~ '^[a-f0-9]{64}$'),
  secret_hash TEXT NOT NULL CHECK (secret_hash LIKE 'scrypt$v1$%'),
  permissions JSONB NOT NULL CHECK (jsonb_typeof(permissions) = 'array'),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  revoked_by_subject TEXT NULL,
  revocation_reason TEXT NULL,
  rotated_from_key_id TEXT NULL,
  revision BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, key_id),
  UNIQUE (workspace_id, lookup_fingerprint),
  FOREIGN KEY (workspace_id, principal_id) REFERENCES workspace_principals (workspace_id, principal_id),
  FOREIGN KEY (workspace_id, rotated_from_key_id) REFERENCES pilot_api_keys (workspace_id, key_id),
  CHECK ((revoked_at IS NULL AND revoked_by_subject IS NULL AND revocation_reason IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_by_subject IS NOT NULL AND revocation_reason IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS pilot_api_key_audit (
  workspace_id TEXT NOT NULL,
  audit_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  prior_key_id TEXT NULL,
  principal_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('issued', 'rotated', 'revoked')),
  actor_subject TEXT NOT NULL,
  reason TEXT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, audit_id),
  FOREIGN KEY (workspace_id, key_id) REFERENCES pilot_api_keys (workspace_id, key_id)
);
CREATE OR REPLACE FUNCTION reject_pilot_api_key_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'pilot API key audit is append-only' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS pilot_api_key_audit_immutable ON pilot_api_key_audit;
CREATE TRIGGER pilot_api_key_audit_immutable BEFORE UPDATE OR DELETE ON pilot_api_key_audit
  FOR EACH ROW EXECUTE FUNCTION reject_pilot_api_key_audit_mutation();
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['pilot_api_keys', 'pilot_api_key_audit']
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

interface KeyRow {
  readonly workspace_id: string;
  readonly key_id: string;
  readonly principal_id: string;
  readonly secret_hash: string;
  readonly permissions: readonly string[];
  readonly principal_permissions?: readonly string[];
  readonly expires_at: Date | string;
  readonly revoked_at: Date | string | null;
  readonly revision: number | string;
}

export class PilotApiKeyPersistenceError extends Error {}

function map(row: KeyRow): PersistedPilotApiKeyRecord {
  return {
    workspaceId: row.workspace_id,
    keyId: row.key_id,
    principalId: row.principal_id,
    permissions: [...row.permissions],
    expiresAt: new Date(row.expires_at).toISOString(),
    revokedAt: row.revoked_at === null ? null : new Date(row.revoked_at).toISOString(),
    revision: Number(row.revision),
  };
}

function first<T>(result: PostgresQueryResult<T>, message: string): T {
  const value = result.rows[0];
  if (!value) throw new PilotApiKeyPersistenceError(message);
  return value;
}

export class PostgresPilotApiKeyRepository {
  public constructor(private readonly pool: PostgresPool) {}

  public async migrate(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(POSTGRES_PILOT_API_KEY_MIGRATION);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async transaction<T>(workspaceId: string, work: (client: PostgresClient) => Promise<T>): Promise<T> {
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
    } finally {
      client.release();
    }
  }

  public issue(input: IssueInput): Promise<PersistedPilotApiKeyRecord> {
    return this.transaction(input.workspaceId, async (client) => {
      const key = map(first(await client.query<KeyRow>(
        `INSERT INTO pilot_api_keys (
           workspace_id, key_id, principal_id, lookup_fingerprint, secret_hash,
           permissions, expires_at, created_at, updated_at
         )
         SELECT $1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz, $8::timestamptz, $8::timestamptz
         FROM workspace_principals
         WHERE workspace_id = $1 AND principal_id = $3 AND active = TRUE AND revoked_at IS NULL
         RETURNING *`,
        [input.workspaceId, input.keyId, input.principalId, input.lookupFingerprint, input.secretHash, JSON.stringify(input.permissions), input.expiresAt, input.now]
      ), "Pilot API key requires an active owning principal."));
      await client.query(
        `INSERT INTO pilot_api_key_audit (
           workspace_id, audit_id, key_id, principal_id, action, actor_subject, occurred_at
         ) VALUES ($1, $2, $3, $4, 'issued', $5, $6::timestamptz)`,
        [input.workspaceId, input.auditId, input.keyId, input.principalId, input.actorSubject, input.now]
      );
      return key;
    });
  }

  public rotate(input: RotateInput): Promise<PersistedPilotApiKeyRecord> {
    return this.transaction(input.workspaceId, async (client) => {
      const previous = first(await client.query<{ readonly principal_id: string }>(
        `UPDATE pilot_api_keys
         SET revoked_at = $1::timestamptz, revoked_by_subject = $2,
             revocation_reason = 'rotated', revision = revision + 1, updated_at = $1::timestamptz
         WHERE workspace_id = $3 AND key_id = $4 AND principal_id = $5
           AND revision = $6 AND revoked_at IS NULL AND expires_at > $1::timestamptz
         RETURNING principal_id`,
        [input.now, input.actorSubject, input.workspaceId, input.previousKeyId, input.principalId, input.previousExpectedRevision]
      ), "Previous pilot API key was missing, expired, revoked, or stale.");
      const key = map(first(await client.query<KeyRow>(
        `INSERT INTO pilot_api_keys (
           workspace_id, key_id, principal_id, lookup_fingerprint, secret_hash,
           permissions, expires_at, rotated_from_key_id, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz, $8, $9::timestamptz, $9::timestamptz)
         RETURNING *`,
        [input.workspaceId, input.keyId, previous.principal_id, input.lookupFingerprint, input.secretHash, JSON.stringify(input.permissions), input.expiresAt, input.previousKeyId, input.now]
      ), "Rotated pilot API key could not be created."));
      await client.query(
        `INSERT INTO pilot_api_key_audit (
           workspace_id, audit_id, key_id, prior_key_id, principal_id, action, actor_subject, occurred_at
         ) VALUES ($1, $2, $3, $4, $5, 'rotated', $6, $7::timestamptz)`,
        [input.workspaceId, input.auditId, input.keyId, input.previousKeyId, input.principalId, input.actorSubject, input.now]
      );
      return key;
    });
  }

  public revoke(input: RevokeInput): Promise<PersistedPilotApiKeyRecord> {
    if (input.reason.trim().length === 0 || input.reason.length > 2_000)
      throw new PilotApiKeyPersistenceError("A bounded API key revocation reason is required.");
    return this.transaction(input.workspaceId, async (client) => {
      const key = map(first(await client.query<KeyRow>(
        `UPDATE pilot_api_keys
         SET revoked_at = $1::timestamptz, revoked_by_subject = $2, revocation_reason = $3,
             revision = revision + 1, updated_at = $1::timestamptz
         WHERE workspace_id = $4 AND key_id = $5 AND revision = $6 AND revoked_at IS NULL
         RETURNING *`,
        [input.now, input.actorSubject, input.reason, input.workspaceId, input.keyId, input.expectedRevision]
      ), "Pilot API key was missing, revoked, or stale."));
      await client.query(
        `INSERT INTO pilot_api_key_audit (
           workspace_id, audit_id, key_id, principal_id, action, actor_subject, reason, occurred_at
         ) VALUES ($1, $2, $3, $4, 'revoked', $5, $6, $7::timestamptz)`,
        [input.workspaceId, input.auditId, input.keyId, key.principalId, input.actorSubject, input.reason, input.now]
      );
      return key;
    });
  }

  public findActiveByFingerprint(input: {
    readonly workspaceId: string;
    readonly lookupFingerprint: string;
    readonly now: string;
  }): Promise<PersistedPilotApiKeyCandidate | null> {
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<KeyRow>(
        `SELECT key.*, principal.permissions AS principal_permissions
         FROM pilot_api_keys AS key
         JOIN workspace_principals AS principal
           ON principal.workspace_id = key.workspace_id AND principal.principal_id = key.principal_id
         WHERE key.workspace_id = $1 AND key.lookup_fingerprint = $2
           AND key.revoked_at IS NULL AND key.expires_at > $3::timestamptz
           AND principal.active = TRUE AND principal.revoked_at IS NULL`,
        [input.workspaceId, input.lookupFingerprint, input.now]
      );
      const row = result.rows[0];
      return row
        ? { ...map(row), secretHash: row.secret_hash, principalPermissions: [...(row.principal_permissions ?? [])] }
        : null;
    });
  }
}
