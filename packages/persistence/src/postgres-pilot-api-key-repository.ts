import type {
  PostgresClient,
  PostgresPool,
  PostgresQueryResult,
} from "./postgres-workflow-repository.js";

export interface PersistedPilotApiKeyRecord {
  readonly workspaceId: string;
  readonly keyId: string;
  readonly name: string;
  readonly principalId: string;
  readonly permissions: readonly string[];
  readonly expiresAt: string;
  readonly overlapUntil: string | null;
  readonly lastUsedAt: string | null;
  readonly rotatedFromKeyId: string | null;
  readonly revokedAt: string | null;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PersistedPilotApiKeyCandidate extends PersistedPilotApiKeyRecord {
  readonly secretHash: string;
  readonly principalPermissions: readonly string[];
}

interface IssueInput {
  readonly workspaceId: string;
  readonly keyId: string;
  readonly name: string;
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
  readonly overlapMs?: number;
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
ALTER TABLE pilot_api_keys ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE pilot_api_keys ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ NULL;
ALTER TABLE pilot_api_keys ADD COLUMN IF NOT EXISTS overlap_until TIMESTAMPTZ NULL;
CREATE TABLE IF NOT EXISTS pilot_api_key_issues (
  workspace_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  key_id TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, key_id) REFERENCES pilot_api_keys (workspace_id, key_id)
);
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['pilot_api_key_issues']
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
  readonly name: string;
  readonly principal_id: string;
  readonly secret_hash: string;
  readonly permissions: readonly string[];
  readonly principal_permissions?: readonly string[];
  readonly expires_at: Date | string;
  readonly overlap_until: Date | string | null;
  readonly last_used_at: Date | string | null;
  readonly rotated_from_key_id: string | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
  readonly revoked_at: Date | string | null;
  readonly revision: number | string;
}

export class PilotApiKeyPersistenceError extends Error {}

function map(row: KeyRow): PersistedPilotApiKeyRecord {
  return {
    workspaceId: row.workspace_id,
    keyId: row.key_id,
    name: row.name,
    principalId: row.principal_id,
    permissions: [...row.permissions],
    expiresAt: new Date(row.expires_at).toISOString(),
    overlapUntil:
      row.overlap_until === null
        ? null
        : new Date(row.overlap_until).toISOString(),
    lastUsedAt:
      row.last_used_at === null
        ? null
        : new Date(row.last_used_at).toISOString(),
    rotatedFromKeyId: row.rotated_from_key_id,
    revokedAt:
      row.revoked_at === null ? null : new Date(row.revoked_at).toISOString(),
    revision: Number(row.revision),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
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
           workspace_id, key_id, name, principal_id, lookup_fingerprint, secret_hash,
           permissions, expires_at, created_at, updated_at
         )
         SELECT $1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz, $9::timestamptz, $9::timestamptz
         FROM workspace_principals
         WHERE workspace_id = $1 AND principal_id = $4 AND active = TRUE AND revoked_at IS NULL
         RETURNING *`,
        [
          input.workspaceId,
          input.keyId,
          input.name,
          input.principalId,
          input.lookupFingerprint,
          input.secretHash,
          JSON.stringify(input.permissions),
          input.expiresAt,
          input.now,
        ]
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
      const overlapMs = input.overlapMs ?? 0;
      const previous = first(
        await client.query<{ readonly principal_id: string }>(
          overlapMs > 0
            ? `UPDATE pilot_api_keys
               SET overlap_until = ($1::timestamptz + ($7::bigint * interval '1 millisecond')),
                   revision = revision + 1, updated_at = $1::timestamptz
               WHERE workspace_id = $3 AND key_id = $4 AND principal_id = $5
                 AND revision = $6 AND revoked_at IS NULL AND expires_at > $1::timestamptz
               RETURNING principal_id`
            : `UPDATE pilot_api_keys
               SET revoked_at = $1::timestamptz, revoked_by_subject = $2,
                   revocation_reason = 'rotated', revision = revision + 1, updated_at = $1::timestamptz
               WHERE workspace_id = $3 AND key_id = $4 AND principal_id = $5
                 AND revision = $6 AND revoked_at IS NULL AND expires_at > $1::timestamptz
               RETURNING principal_id`,
          overlapMs > 0
            ? [
                input.now,
                input.actorSubject,
                input.workspaceId,
                input.previousKeyId,
                input.principalId,
                input.previousExpectedRevision,
                overlapMs,
              ]
            : [
                input.now,
                input.actorSubject,
                input.workspaceId,
                input.previousKeyId,
                input.principalId,
                input.previousExpectedRevision,
              ]
        ),
        "Previous pilot API key was missing, expired, revoked, or stale."
      );
      const key = map(
        first(
          await client.query<KeyRow>(
            `INSERT INTO pilot_api_keys (
               workspace_id, key_id, name, principal_id, lookup_fingerprint, secret_hash,
               permissions, expires_at, rotated_from_key_id, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz, $9, $10::timestamptz, $10::timestamptz)
             RETURNING *`,
            [
              input.workspaceId,
              input.keyId,
              input.name,
              previous.principal_id,
              input.lookupFingerprint,
              input.secretHash,
              JSON.stringify(input.permissions),
              input.expiresAt,
              input.previousKeyId,
              input.now,
            ]
          ),
          "Rotated pilot API key could not be created."
        )
      );
      await client.query(
        `INSERT INTO pilot_api_key_audit (
           workspace_id, audit_id, key_id, prior_key_id, principal_id, action, actor_subject, occurred_at
         ) VALUES ($1, $2, $3, $4, $5, 'rotated', $6, $7::timestamptz)`,
        [
          input.workspaceId,
          input.auditId,
          input.keyId,
          input.previousKeyId,
          input.principalId,
          input.actorSubject,
          input.now,
        ]
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
           AND key.expires_at > $3::timestamptz
           AND (key.revoked_at IS NULL OR key.overlap_until > $3::timestamptz)
           AND principal.active = TRUE AND principal.revoked_at IS NULL`,
        [input.workspaceId, input.lookupFingerprint, input.now]
      );
      const row = result.rows[0];
      return row
        ? { ...map(row), secretHash: row.secret_hash, principalPermissions: [...(row.principal_permissions ?? [])] }
        : null;
    });
  }

  public list(input: {
    readonly workspaceId: string;
  }): Promise<readonly PersistedPilotApiKeyRecord[]> {
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<KeyRow>(
        `SELECT workspace_id, key_id, name, principal_id, permissions, expires_at,
                overlap_until, last_used_at, rotated_from_key_id, created_at, updated_at,
                revoked_at, revision
         FROM pilot_api_keys
         WHERE workspace_id = $1
         ORDER BY created_at DESC, key_id DESC`,
        [input.workspaceId]
      );
      return result.rows.map((row) =>
        map({
          ...row,
          secret_hash: "",
          principal_permissions: [],
        })
      );
    });
  }

  public get(input: {
    readonly workspaceId: string;
    readonly keyId: string;
  }): Promise<PersistedPilotApiKeyRecord | null> {
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<KeyRow>(
        `SELECT workspace_id, key_id, name, principal_id, permissions, expires_at,
                overlap_until, last_used_at, rotated_from_key_id, created_at, updated_at,
                revoked_at, revision
         FROM pilot_api_keys
         WHERE workspace_id = $1 AND key_id = $2`,
        [input.workspaceId, input.keyId]
      );
      const row = result.rows[0];
      return row
        ? map({ ...row, secret_hash: "", principal_permissions: [] })
        : null;
    });
  }

  public findIssueIdempotency(input: {
    readonly workspaceId: string;
    readonly idempotencyKey: string;
  }): Promise<{
    readonly keyId: string;
    readonly requestFingerprint: string;
  } | null> {
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<{
        readonly key_id: string;
        readonly request_fingerprint: string;
      }>(
        `SELECT key_id, request_fingerprint
         FROM pilot_api_key_issues
         WHERE workspace_id = $1 AND idempotency_key = $2`,
        [input.workspaceId, input.idempotencyKey]
      );
      const row = result.rows[0];
      return row
        ? {
            keyId: row.key_id,
            requestFingerprint: row.request_fingerprint,
          }
        : null;
    });
  }

  public recordIssueIdempotency(input: {
    readonly workspaceId: string;
    readonly idempotencyKey: string;
    readonly keyId: string;
    readonly requestFingerprint: string;
    readonly now: string;
  }): Promise<void> {
    return this.transaction(input.workspaceId, async (client) => {
      await client.query(
        `INSERT INTO pilot_api_key_issues (
           workspace_id, idempotency_key, key_id, request_fingerprint, created_at
         ) VALUES ($1, $2, $3, $4, $5::timestamptz)`,
        [
          input.workspaceId,
          input.idempotencyKey,
          input.keyId,
          input.requestFingerprint,
          input.now,
        ]
      );
    });
  }

  public touchLastUsed(input: {
    readonly workspaceId: string;
    readonly keyId: string;
    readonly now: string;
  }): Promise<void> {
    return this.transaction(input.workspaceId, async (client) => {
      await client.query(
        `UPDATE pilot_api_keys
         SET last_used_at = $3::timestamptz, updated_at = $3::timestamptz
         WHERE workspace_id = $1 AND key_id = $2`,
        [input.workspaceId, input.keyId, input.now]
      );
    });
  }
}
