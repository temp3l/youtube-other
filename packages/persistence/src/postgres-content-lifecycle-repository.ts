import type {
  PostgresClient,
  PostgresPool,
  PostgresQueryResult,
} from "./postgres-workflow-repository.js";

export const POSTGRES_CONTENT_LIFECYCLE_MIGRATION = `
CREATE TABLE IF NOT EXISTS episode_content_lifecycle (
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'active'
    CHECK (visibility IN ('active', 'archived', 'tombstoned')),
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  archive_reason TEXT NULL,
  archived_at TIMESTAMPTZ NULL,
  tombstoned_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, project_id, episode_id),
  FOREIGN KEY (workspace_id, episode_id)
    REFERENCES episodes (workspace_id, episode_id)
);
CREATE INDEX IF NOT EXISTS episode_content_lifecycle_visibility_idx
  ON episode_content_lifecycle (workspace_id, project_id, visibility, episode_id);
CREATE TABLE IF NOT EXISTS workspace_retention_policies (
  workspace_id TEXT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  categories JSONB NOT NULL CHECK (jsonb_typeof(categories) = 'array'),
  inherited_from_platform BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id)
);
CREATE TABLE IF NOT EXISTS episode_deletion_idempotency (
  workspace_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  response JSONB NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, idempotency_key)
);
`;

export class ContentLifecyclePersistenceError extends Error {
  public override readonly name = "ContentLifecyclePersistenceError";
}

function timestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function row<T>(result: PostgresQueryResult<T>, message: string): T {
  const value = result.rows[0];
  if (!value) throw new ContentLifecyclePersistenceError(message);
  return value;
}

export interface EpisodeContentLifecycleRow {
  readonly workspace_id: string;
  readonly project_id: string;
  readonly episode_id: string;
  readonly visibility: "active" | "archived" | "tombstoned";
  readonly revision: string | number;
  readonly archive_reason: string | null;
  readonly archived_at: string | Date | null;
  readonly tombstoned_at: string | Date | null;
  readonly created_at: string | Date;
  readonly updated_at: string | Date;
}

export interface WorkspaceRetentionPolicyRow {
  readonly workspace_id: string;
  readonly revision: string | number;
  readonly categories: unknown;
  readonly inherited_from_platform: boolean;
  readonly created_at: string | Date;
  readonly updated_at: string | Date;
}

export class PostgresContentLifecycleRepository {
  public constructor(private readonly pool: PostgresPool) {}

  public async ensureSchema(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(POSTGRES_CONTENT_LIFECYCLE_MIGRATION);
    } finally {
      client.release();
    }
  }

  public async getEpisodeLifecycle(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly episodeId: string;
  }): Promise<EpisodeContentLifecycleRow | null> {
    const result = await this.pool.query<EpisodeContentLifecycleRow>(
      `SELECT workspace_id, project_id, episode_id, visibility, revision,
              archive_reason, archived_at, tombstoned_at, created_at, updated_at
       FROM episode_content_lifecycle
       WHERE workspace_id = $1 AND project_id = $2 AND episode_id = $3`,
      [input.workspaceId, input.projectId, input.episodeId]
    );
    return result.rows[0] ?? null;
  }

  public async ensureEpisodeLifecycle(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly episodeId: string;
    readonly now: string;
  }): Promise<EpisodeContentLifecycleRow> {
    const existing = await this.getEpisodeLifecycle(input);
    if (existing) return existing;
    const result = await this.pool.query<EpisodeContentLifecycleRow>(
      `INSERT INTO episode_content_lifecycle (
         workspace_id, project_id, episode_id, visibility, revision,
         created_at, updated_at
       ) VALUES ($1, $2, $3, 'active', 0, $4::timestamptz, $4::timestamptz)
       ON CONFLICT (workspace_id, project_id, episode_id) DO NOTHING
       RETURNING workspace_id, project_id, episode_id, visibility, revision,
                 archive_reason, archived_at, tombstoned_at, created_at, updated_at`,
      [
        input.workspaceId,
        input.projectId,
        input.episodeId,
        input.now,
      ]
    );
    if (result.rows[0]) return result.rows[0];
    return row(
      await this.pool.query<EpisodeContentLifecycleRow>(
        `SELECT workspace_id, project_id, episode_id, visibility, revision,
                archive_reason, archived_at, tombstoned_at, created_at, updated_at
         FROM episode_content_lifecycle
         WHERE workspace_id = $1 AND project_id = $2 AND episode_id = $3`,
        [input.workspaceId, input.projectId, input.episodeId]
      ),
      "Episode lifecycle row was not created."
    );
  }

  public async listEpisodeLifecycles(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly visibility?: "active" | "archived";
  }): Promise<readonly EpisodeContentLifecycleRow[]> {
    const result = await this.pool.query<EpisodeContentLifecycleRow>(
      `SELECT lifecycle.workspace_id, lifecycle.project_id, lifecycle.episode_id,
              lifecycle.visibility, lifecycle.revision, lifecycle.archive_reason,
              lifecycle.archived_at, lifecycle.tombstoned_at,
              lifecycle.created_at, lifecycle.updated_at
       FROM episode_content_lifecycle AS lifecycle
       INNER JOIN episodes AS episode
         ON episode.workspace_id = lifecycle.workspace_id
        AND episode.project_id = lifecycle.project_id
        AND episode.episode_id = lifecycle.episode_id
       WHERE lifecycle.workspace_id = $1
         AND lifecycle.project_id = $2
         AND ($3::text IS NULL OR lifecycle.visibility = $3::text)
       ORDER BY episode.created_at, lifecycle.episode_id`,
      [input.workspaceId, input.projectId, input.visibility ?? null]
    );
    return result.rows;
  }

  public async transitionEpisodeLifecycle(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly episodeId: string;
    readonly expectedRevision: number;
    readonly visibility: "active" | "archived" | "tombstoned";
    readonly archiveReason?: string | null;
    readonly archivedAt?: string | null;
    readonly tombstonedAt?: string | null;
    readonly now: string;
  }): Promise<EpisodeContentLifecycleRow | null> {
    const result = await this.pool.query<EpisodeContentLifecycleRow>(
      `UPDATE episode_content_lifecycle
       SET visibility = $4,
           revision = revision + 1,
           archive_reason = $5,
           archived_at = $6::timestamptz,
           tombstoned_at = $7::timestamptz,
           updated_at = $8::timestamptz
       WHERE workspace_id = $1 AND project_id = $2 AND episode_id = $3
         AND revision = $9
       RETURNING workspace_id, project_id, episode_id, visibility, revision,
                 archive_reason, archived_at, tombstoned_at, created_at, updated_at`,
      [
        input.workspaceId,
        input.projectId,
        input.episodeId,
        input.visibility,
        input.archiveReason ?? null,
        input.archivedAt ?? null,
        input.tombstonedAt ?? null,
        input.now,
        input.expectedRevision,
      ]
    );
    return result.rows[0] ?? null;
  }

  public async countActiveWorkflowRunsForEpisode(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly episodeId: string;
  }): Promise<number> {
    const result = await this.pool.query<{ readonly count: string | number }>(
      `SELECT COUNT(*)::bigint AS count
       FROM workflow_runs AS run
       INNER JOIN workflow_run_bindings AS binding
         ON binding.workspace_id = run.workspace_id
        AND binding.run_id = run.run_id
       WHERE binding.workspace_id = $1
         AND binding.project_id = $2
         AND binding.episode_id = $3
         AND run.status IN ('queued', 'running', 'awaiting_approval')`,
      [input.workspaceId, input.projectId, input.episodeId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  public async countTerminalPublicationsForEpisode(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly episodeId: string;
  }): Promise<number> {
    const result = await this.pool.query<{ readonly count: string | number }>(
      `SELECT COUNT(*)::bigint AS count
       FROM publications AS publication
       INNER JOIN workflow_run_bindings AS binding
         ON binding.workspace_id = publication.workspace_id
        AND binding.run_id = publication.run_id
       WHERE binding.workspace_id = $1
         AND binding.project_id = $2
         AND binding.episode_id = $3
         AND publication.status IN ('succeeded', 'published', 'completed')`,
      [input.workspaceId, input.projectId, input.episodeId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  public async countSharedAssetSurvivorsForEpisode(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly episodeId: string;
  }): Promise<number> {
    const result = await this.pool.query<{ readonly count: string | number }>(
      `SELECT COUNT(DISTINCT reference.asset_id)::bigint AS count
       FROM episode_asset_references AS reference
       INNER JOIN assets AS asset
         ON asset.workspace_id = reference.workspace_id
        AND asset.project_id = reference.project_id
        AND asset.asset_id = reference.asset_id
       WHERE reference.workspace_id = $1
         AND reference.project_id = $2
         AND reference.episode_id = $3
         AND asset.lifecycle = 'shared'`,
      [input.workspaceId, input.projectId, input.episodeId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  public async getRetentionPolicy(
    workspaceId: string
  ): Promise<WorkspaceRetentionPolicyRow | null> {
    const result = await this.pool.query<WorkspaceRetentionPolicyRow>(
      `SELECT workspace_id, revision, categories, inherited_from_platform,
              created_at, updated_at
       FROM workspace_retention_policies
       WHERE workspace_id = $1`,
      [workspaceId]
    );
    return result.rows[0] ?? null;
  }

  public async getDeletionIdempotency(
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
       FROM episode_deletion_idempotency
       WHERE workspace_id = $1 AND idempotency_key = $2`,
      [workspaceId, idempotencyKey]
    );
    const rowValue = result.rows[0];
    return rowValue
      ? {
          requestFingerprint: rowValue.request_fingerprint,
          response: rowValue.response,
        }
      : null;
  }

  public async recordDeletionIdempotency(input: {
    readonly workspaceId: string;
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
    readonly response: unknown;
    readonly now: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO episode_deletion_idempotency (
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

export function mapEpisodeContentLifecycleRow(
  row: EpisodeContentLifecycleRow
): {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly visibility: "active" | "archived" | "tombstoned";
  readonly revision: number;
  readonly archiveReason: string | null;
  readonly archivedAt: string | null;
  readonly tombstonedAt: string | null;
  readonly updatedAt: string;
} {
  return {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    episodeId: row.episode_id,
    visibility: row.visibility,
    revision: Number(row.revision),
    archiveReason: row.archive_reason,
    archivedAt: row.archived_at ? timestamp(row.archived_at) : null,
    tombstonedAt: row.tombstoned_at ? timestamp(row.tombstoned_at) : null,
    updatedAt: timestamp(row.updated_at),
  };
}

export function mapWorkspaceRetentionPolicyRow(
  row: WorkspaceRetentionPolicyRow
): {
  readonly workspaceId: string;
  readonly revision: number;
  readonly categories: unknown;
  readonly inheritedFromPlatform: boolean;
  readonly updatedAt: string;
} {
  return {
    workspaceId: row.workspace_id,
    revision: Number(row.revision),
    categories: row.categories,
    inheritedFromPlatform: row.inherited_from_platform,
    updatedAt: timestamp(row.updated_at),
  };
}
