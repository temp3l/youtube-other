import type {
  PostgresClient,
  PostgresPool,
  PostgresQueryResult,
} from "./postgres-workflow-repository.js";

export const POSTGRES_CONTENT_REUSE_MIGRATION = `
CREATE TABLE IF NOT EXISTS production_templates (
  workspace_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  name TEXT NOT NULL,
  profile TEXT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, template_id)
);
CREATE TABLE IF NOT EXISTS production_template_revisions (
  workspace_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  revision BIGINT NOT NULL CHECK (revision > 0),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, template_id, revision),
  FOREIGN KEY (workspace_id, template_id)
    REFERENCES production_templates (workspace_id, template_id)
);
CREATE TABLE IF NOT EXISTS episode_production_template_bindings (
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  pinned_revision BIGINT NOT NULL CHECK (pinned_revision > 0),
  applied_snapshot JSONB NOT NULL CHECK (jsonb_typeof(applied_snapshot) = 'object'),
  applied_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, project_id, episode_id),
  FOREIGN KEY (workspace_id, template_id)
    REFERENCES production_templates (workspace_id, template_id)
);
CREATE TABLE IF NOT EXISTS episode_asset_references (
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  attachment_key TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  provenance TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('reference', 'copy_on_write')),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, project_id, episode_id, attachment_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS episode_asset_reference_asset_unique
  ON episode_asset_references (workspace_id, project_id, episode_id, asset_id);
CREATE TABLE IF NOT EXISTS episode_clone_idempotency (
  workspace_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  response JSONB NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, idempotency_key)
);
`;

export class ContentReusePersistenceError extends Error {
  public override readonly name = "ContentReusePersistenceError";
}

function timestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function row<T>(result: PostgresQueryResult<T>, message: string): T {
  const value = result.rows[0];
  if (!value) throw new ContentReusePersistenceError(message);
  return value;
}

export interface ProductionTemplateRow {
  readonly workspace_id: string;
  readonly template_id: string;
  readonly name: string;
  readonly profile: string;
  readonly revision: string | number;
  readonly snapshot: unknown;
  readonly created_at: string | Date;
  readonly updated_at: string | Date;
}

export interface EpisodeProductionTemplateBindingRow {
  readonly workspace_id: string;
  readonly project_id: string;
  readonly episode_id: string;
  readonly template_id: string;
  readonly pinned_revision: string | number;
  readonly applied_snapshot: unknown;
  readonly applied_at: string | Date;
}

export interface EpisodeAssetReferenceRow {
  readonly workspace_id: string;
  readonly project_id: string;
  readonly episode_id: string;
  readonly attachment_key: string;
  readonly asset_id: string;
  readonly sha256: string;
  readonly provenance: string;
  readonly mode: "reference" | "copy_on_write";
  readonly created_at: string | Date;
}

export class PostgresContentReuseRepository {
  public constructor(private readonly pool: PostgresPool) {}

  public async ensureSchema(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(POSTGRES_CONTENT_REUSE_MIGRATION);
    } finally {
      client.release();
    }
  }

  public async createTemplate(input: {
    readonly workspaceId: string;
    readonly templateId: string;
    readonly name: string;
    readonly profile: string;
    readonly snapshot: unknown;
    readonly now: string;
  }): Promise<ProductionTemplateRow> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<ProductionTemplateRow>(
        `INSERT INTO production_templates (
           workspace_id, template_id, name, profile, revision, snapshot, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, 1, $5::jsonb, $6::timestamptz, $6::timestamptz)
         RETURNING workspace_id, template_id, name, profile, revision, snapshot, created_at, updated_at`,
        [
          input.workspaceId,
          input.templateId,
          input.name,
          input.profile,
          JSON.stringify(input.snapshot),
          input.now,
        ]
      );
      const created = row(result, "Production template was not created.");
      await client.query(
        `INSERT INTO production_template_revisions (
           workspace_id, template_id, revision, snapshot, created_at
         ) VALUES ($1, $2, 1, $3::jsonb, $4::timestamptz)`,
        [
          input.workspaceId,
          input.templateId,
          JSON.stringify(input.snapshot),
          input.now,
        ]
      );
      return created;
    } finally {
      client.release();
    }
  }

  public async getTemplate(
    workspaceId: string,
    templateId: string
  ): Promise<ProductionTemplateRow | null> {
    const result = await this.pool.query<ProductionTemplateRow>(
      `SELECT workspace_id, template_id, name, profile, revision, snapshot, created_at, updated_at
       FROM production_templates
       WHERE workspace_id = $1 AND template_id = $2`,
      [workspaceId, templateId]
    );
    return result.rows[0] ?? null;
  }

  public async listTemplates(
    workspaceId: string
  ): Promise<readonly ProductionTemplateRow[]> {
    const result = await this.pool.query<ProductionTemplateRow>(
      `SELECT workspace_id, template_id, name, profile, revision, snapshot, created_at, updated_at
       FROM production_templates
       WHERE workspace_id = $1
       ORDER BY created_at, template_id`,
      [workspaceId]
    );
    return result.rows;
  }

  public async updateTemplate(input: {
    readonly workspaceId: string;
    readonly templateId: string;
    readonly expectedRevision: number;
    readonly name: string;
    readonly snapshot: unknown;
    readonly now: string;
  }): Promise<ProductionTemplateRow | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<ProductionTemplateRow>(
        `UPDATE production_templates
         SET name = $4,
             revision = revision + 1,
             snapshot = $5::jsonb,
             updated_at = $6::timestamptz
         WHERE workspace_id = $1 AND template_id = $2 AND revision = $3
         RETURNING workspace_id, template_id, name, profile, revision, snapshot, created_at, updated_at`,
        [
          input.workspaceId,
          input.templateId,
          input.expectedRevision,
          input.name,
          JSON.stringify(input.snapshot),
          input.now,
        ]
      );
      const updated = result.rows[0];
      if (!updated) return null;
      await client.query(
        `INSERT INTO production_template_revisions (
           workspace_id, template_id, revision, snapshot, created_at
         ) VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz)`,
        [
          input.workspaceId,
          input.templateId,
          Number(updated.revision),
          JSON.stringify(input.snapshot),
          input.now,
        ]
      );
      return updated;
    } finally {
      client.release();
    }
  }

  public async upsertEpisodeTemplateBinding(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly episodeId: string;
    readonly templateId: string;
    readonly pinnedRevision: number;
    readonly appliedSnapshot: unknown;
    readonly appliedAt: string;
  }): Promise<EpisodeProductionTemplateBindingRow> {
    const result = await this.pool.query<EpisodeProductionTemplateBindingRow>(
      `INSERT INTO episode_production_template_bindings (
         workspace_id, project_id, episode_id, template_id, pinned_revision,
         applied_snapshot, applied_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz)
       ON CONFLICT (workspace_id, project_id, episode_id) DO UPDATE
         SET template_id = EXCLUDED.template_id,
             pinned_revision = EXCLUDED.pinned_revision,
             applied_snapshot = EXCLUDED.applied_snapshot,
             applied_at = EXCLUDED.applied_at
       RETURNING workspace_id, project_id, episode_id, template_id, pinned_revision,
                 applied_snapshot, applied_at`,
      [
        input.workspaceId,
        input.projectId,
        input.episodeId,
        input.templateId,
        input.pinnedRevision,
        JSON.stringify(input.appliedSnapshot),
        input.appliedAt,
      ]
    );
    return row(result, "Episode production template binding was not stored.");
  }

  public async getEpisodeTemplateBinding(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly episodeId: string;
  }): Promise<EpisodeProductionTemplateBindingRow | null> {
    const result = await this.pool.query<EpisodeProductionTemplateBindingRow>(
      `SELECT workspace_id, project_id, episode_id, template_id, pinned_revision,
              applied_snapshot, applied_at
       FROM episode_production_template_bindings
       WHERE workspace_id = $1 AND project_id = $2 AND episode_id = $3`,
      [input.workspaceId, input.projectId, input.episodeId]
    );
    return result.rows[0] ?? null;
  }

  public async attachAssetReference(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly episodeId: string;
    readonly attachmentKey: string;
    readonly assetId: string;
    readonly sha256: string;
    readonly provenance: string;
    readonly mode: "reference" | "copy_on_write";
    readonly now: string;
  }): Promise<{ readonly row: EpisodeAssetReferenceRow; readonly replayed: boolean }> {
    const existing = await this.pool.query<EpisodeAssetReferenceRow>(
      `SELECT workspace_id, project_id, episode_id, attachment_key, asset_id, sha256,
              provenance, mode, created_at
       FROM episode_asset_references
       WHERE workspace_id = $1 AND project_id = $2 AND episode_id = $3 AND attachment_key = $4`,
      [
        input.workspaceId,
        input.projectId,
        input.episodeId,
        input.attachmentKey,
      ]
    );
    if (existing.rows[0])
      return { row: existing.rows[0], replayed: true };
    const result = await this.pool.query<EpisodeAssetReferenceRow>(
      `INSERT INTO episode_asset_references (
         workspace_id, project_id, episode_id, attachment_key, asset_id, sha256,
         provenance, mode, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz)
       RETURNING workspace_id, project_id, episode_id, attachment_key, asset_id, sha256,
                 provenance, mode, created_at`,
      [
        input.workspaceId,
        input.projectId,
        input.episodeId,
        input.attachmentKey,
        input.assetId,
        input.sha256,
        input.provenance,
        input.mode,
        input.now,
      ]
    );
    return { row: row(result, "Episode asset reference was not stored."), replayed: false };
  }

  public async getCloneIdempotency(
    workspaceId: string,
    idempotencyKey: string
  ): Promise<{
    readonly requestFingerprint: string;
    readonly response: unknown;
  } | null> {
    const result = await this.pool.query<{
      readonly request_fingerprint: string;
      readonly response: unknown;
    }>(
      `SELECT request_fingerprint, response
       FROM episode_clone_idempotency
       WHERE workspace_id = $1 AND idempotency_key = $2`,
      [workspaceId, idempotencyKey]
    );
    const row = result.rows[0];
    return row
      ? { requestFingerprint: row.request_fingerprint, response: row.response }
      : null;
  }

  public async recordCloneIdempotency(input: {
    readonly workspaceId: string;
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
    readonly response: unknown;
    readonly now: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO episode_clone_idempotency (
         workspace_id, idempotency_key, request_fingerprint, response, created_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz)
       ON CONFLICT (workspace_id, idempotency_key) DO NOTHING`,
      [
        input.workspaceId,
        input.idempotencyKey,
        input.requestFingerprint,
        JSON.stringify(input.response),
        input.now,
      ]
    );
  }
}

export function mapProductionTemplateRow(
  row: ProductionTemplateRow
): {
  readonly workspaceId: string;
  readonly templateId: string;
  readonly name: string;
  readonly profile: string;
  readonly revision: number;
  readonly snapshot: unknown;
  readonly createdAt: string;
  readonly updatedAt: string;
} {
  return {
    workspaceId: row.workspace_id,
    templateId: row.template_id,
    name: row.name,
    profile: row.profile,
    revision: Number(row.revision),
    snapshot: row.snapshot,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

export function mapEpisodeTemplateBindingRow(
  row: EpisodeProductionTemplateBindingRow
): {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly templateId: string;
  readonly pinnedRevision: number;
  readonly appliedSnapshot: unknown;
  readonly appliedAt: string;
} {
  return {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    episodeId: row.episode_id,
    templateId: row.template_id,
    pinnedRevision: Number(row.pinned_revision),
    appliedSnapshot: row.applied_snapshot,
    appliedAt: timestamp(row.applied_at),
  };
}

export function mapEpisodeAssetReferenceRow(
  row: EpisodeAssetReferenceRow
): {
  readonly attachmentKey: string;
  readonly assetId: string;
  readonly sha256: string;
  readonly provenance: string;
  readonly mode: "reference" | "copy_on_write";
  readonly createdAt: string;
} {
  return {
    attachmentKey: row.attachment_key,
    assetId: row.asset_id,
    sha256: row.sha256,
    provenance: row.provenance,
    mode: row.mode,
    createdAt: timestamp(row.created_at),
  };
}
