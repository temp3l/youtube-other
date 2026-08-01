import type {
  PostgresClient,
  PostgresPool,
  PostgresQueryResult,
} from "./postgres-workflow-repository.js";

export const POSTGRES_PRINCIPAL_DIRECTORY_MIGRATION = `
CREATE TABLE IF NOT EXISTS workspace_principals (
  workspace_id TEXT NOT NULL,
  oidc_subject TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('user', 'service', 'worker')),
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(permissions) = 'array'),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  revoked_at TIMESTAMPTZ NULL,
  revoked_by_subject TEXT NULL,
  revocation_reason TEXT NULL,
  revision BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, oidc_subject),
  UNIQUE (workspace_id, principal_id),
  CHECK ((active = TRUE AND revoked_at IS NULL AND revoked_by_subject IS NULL AND revocation_reason IS NULL)
    OR (active = FALSE AND revoked_at IS NOT NULL AND revoked_by_subject IS NOT NULL AND revocation_reason IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS principal_directory_audit (
  workspace_id TEXT NOT NULL,
  audit_id TEXT NOT NULL,
  oidc_subject TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('provisioned', 'updated', 'revoked')),
  actor_subject TEXT NOT NULL,
  prior_revision BIGINT NULL,
  resulting_revision BIGINT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('user', 'service', 'worker')),
  permissions JSONB NOT NULL CHECK (jsonb_typeof(permissions) = 'array'),
  reason TEXT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, audit_id),
  FOREIGN KEY (workspace_id, oidc_subject) REFERENCES workspace_principals (workspace_id, oidc_subject)
);
CREATE OR REPLACE FUNCTION reject_principal_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'principal directory audit is append-only' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS principal_directory_audit_immutable ON principal_directory_audit;
CREATE TRIGGER principal_directory_audit_immutable
  BEFORE UPDATE OR DELETE ON principal_directory_audit
  FOR EACH ROW EXECUTE FUNCTION reject_principal_audit_mutation();
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['workspace_principals', 'principal_directory_audit']
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

export interface PrincipalDirectoryRecord {
  readonly workspaceId: string;
  readonly oidcSubject: string;
  readonly principalId: string;
  readonly kind: "user" | "service" | "worker";
  readonly permissions: readonly string[];
  readonly active: boolean;
  readonly revokedAt: string | null;
  readonly revokedBySubject: string | null;
  readonly revocationReason: string | null;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface PrincipalRow {
  readonly workspace_id: string;
  readonly oidc_subject: string;
  readonly principal_id: string;
  readonly kind: "user" | "service" | "worker";
  readonly permissions: readonly string[];
  readonly active: boolean;
  readonly revoked_at: Date | string | null;
  readonly revoked_by_subject: string | null;
  readonly revocation_reason: string | null;
  readonly revision: number | string;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

export class PrincipalDirectoryPersistenceError extends Error {}

function timestamp(value: Date | string): string {
  return new Date(value).toISOString();
}

function mapPrincipal(row: PrincipalRow): PrincipalDirectoryRecord {
  return {
    workspaceId: row.workspace_id,
    oidcSubject: row.oidc_subject,
    principalId: row.principal_id,
    kind: row.kind,
    permissions: [...row.permissions],
    active: row.active,
    revokedAt: row.revoked_at === null ? null : timestamp(row.revoked_at),
    revokedBySubject: row.revoked_by_subject,
    revocationReason: row.revocation_reason,
    revision: Number(row.revision),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function first<T>(result: PostgresQueryResult<T>, message: string): T {
  const value = result.rows[0];
  if (!value) throw new PrincipalDirectoryPersistenceError(message);
  return value;
}

function permissions(values: readonly string[]): readonly string[] {
  if (values.some((value) => value.length === 0 || value.length > 160))
    throw new PrincipalDirectoryPersistenceError("Principal permissions must be non-empty bounded strings.");
  return [...new Set(values)].sort();
}

export class PostgresPrincipalDirectory {
  public constructor(private readonly pool: PostgresPool) {}

  public async migrate(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(POSTGRES_PRINCIPAL_DIRECTORY_MIGRATION);
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

  public async findActive(workspaceId: string, oidcSubject: string): Promise<PrincipalDirectoryRecord | null> {
    return this.transaction(workspaceId, async (client) => {
      const result = await client.query<PrincipalRow>(
        `SELECT * FROM workspace_principals
         WHERE workspace_id = $1 AND oidc_subject = $2
           AND active = TRUE AND revoked_at IS NULL`,
        [workspaceId, oidcSubject]
      );
      return result.rows[0] ? mapPrincipal(result.rows[0]) : null;
    });
  }

  /** Null expected revision provisions a new identity; a number updates the matching active revision. */
  public async provision(input: {
    readonly workspaceId: string;
    readonly oidcSubject: string;
    readonly principalId: string;
    readonly kind: "user" | "service" | "worker";
    readonly permissions: readonly string[];
    readonly expectedRevision: number | null;
    readonly actorSubject: string;
    readonly auditId: string;
    readonly now: string;
  }): Promise<PrincipalDirectoryRecord> {
    const granted = permissions(input.permissions);
    if (input.expectedRevision !== null && (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0))
      throw new PrincipalDirectoryPersistenceError("Expected principal revision is invalid.");
    return this.transaction(input.workspaceId, async (client) => {
      const result = input.expectedRevision === null
        ? await client.query<PrincipalRow>(
          `INSERT INTO workspace_principals (
             workspace_id, oidc_subject, principal_id, kind, permissions, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz, $6::timestamptz)
           ON CONFLICT (workspace_id, oidc_subject) DO NOTHING
           RETURNING *`,
          [input.workspaceId, input.oidcSubject, input.principalId, input.kind, JSON.stringify(granted), input.now]
        )
        : await client.query<PrincipalRow>(
          `UPDATE workspace_principals
           SET kind = $1, permissions = $2::jsonb, revision = revision + 1, updated_at = $3::timestamptz
           WHERE workspace_id = $4 AND oidc_subject = $5 AND principal_id = $6
             AND revision = $7 AND active = TRUE AND revoked_at IS NULL
           RETURNING *`,
          [input.kind, JSON.stringify(granted), input.now, input.workspaceId, input.oidcSubject, input.principalId, input.expectedRevision]
        );
      const principal = mapPrincipal(first(result, "Principal already exists, is revoked, or its revision is stale."));
      await client.query(
        `INSERT INTO principal_directory_audit (
           workspace_id, audit_id, oidc_subject, action, actor_subject, prior_revision,
           resulting_revision, kind, permissions, occurred_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::timestamptz)`,
        [input.workspaceId, input.auditId, input.oidcSubject, input.expectedRevision === null ? "provisioned" : "updated", input.actorSubject, input.expectedRevision, principal.revision, principal.kind, JSON.stringify(principal.permissions), input.now]
      );
      return principal;
    });
  }

  public async revoke(input: {
    readonly workspaceId: string;
    readonly oidcSubject: string;
    readonly expectedRevision: number;
    readonly actorSubject: string;
    readonly reason: string;
    readonly auditId: string;
    readonly now: string;
  }): Promise<PrincipalDirectoryRecord> {
    if (input.reason.trim().length === 0 || input.reason.length > 2_000)
      throw new PrincipalDirectoryPersistenceError("A bounded revocation reason is required.");
    return this.transaction(input.workspaceId, async (client) => {
      const result = await client.query<PrincipalRow>(
        `UPDATE workspace_principals
         SET active = FALSE, revoked_at = $1::timestamptz, revoked_by_subject = $2,
             revocation_reason = $3, revision = revision + 1, updated_at = $1::timestamptz
         WHERE workspace_id = $4 AND oidc_subject = $5 AND revision = $6
           AND active = TRUE AND revoked_at IS NULL
         RETURNING *`,
        [input.now, input.actorSubject, input.reason, input.workspaceId, input.oidcSubject, input.expectedRevision]
      );
      const principal = mapPrincipal(first(result, "Principal was missing, already revoked, or its revision is stale."));
      await client.query(
        `INSERT INTO principal_directory_audit (
           workspace_id, audit_id, oidc_subject, action, actor_subject, prior_revision,
           resulting_revision, kind, permissions, reason, occurred_at
         ) VALUES ($1, $2, $3, 'revoked', $4, $5, $6, $7, $8::jsonb, $9, $10::timestamptz)`,
        [input.workspaceId, input.auditId, input.oidcSubject, input.actorSubject, input.expectedRevision, principal.revision, principal.kind, JSON.stringify(principal.permissions), input.reason, input.now]
      );
      return principal;
    });
  }
}
