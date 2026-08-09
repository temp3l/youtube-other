import type {
  PostgresClient,
  PostgresPool,
  PostgresQueryResult,
} from "./postgres-workflow-repository.js";

export const POSTGRES_LOCALIZATION_DERIVATIVE_MIGRATION = `
CREATE TABLE IF NOT EXISTS episode_localization_derivatives (
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  derivative_id TEXT NOT NULL,
  root_episode_id TEXT NOT NULL,
  derivative_episode_id TEXT NOT NULL,
  target_locale TEXT NOT NULL,
  content_variant TEXT NOT NULL CHECK (content_variant IN ('full', 'short')),
  source_episode_revision BIGINT NOT NULL CHECK (source_episode_revision >= 0),
  source_content_fingerprint TEXT NOT NULL,
  derivative_revision BIGINT NOT NULL DEFAULT 0 CHECK (derivative_revision >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'ready', 'blocked', 'failed')),
  localized_slug TEXT NOT NULL,
  localized_title TEXT NULL,
  reused_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(reused_asset_ids) = 'array'),
  partial_state JSONB NULL
    CHECK (partial_state IS NULL OR jsonb_typeof(partial_state) = 'object'),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, derivative_id),
  FOREIGN KEY (workspace_id, root_episode_id)
    REFERENCES episodes (workspace_id, episode_id),
  FOREIGN KEY (workspace_id, derivative_episode_id)
    REFERENCES episodes (workspace_id, episode_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS episode_localization_derivatives_tuple_unique
  ON episode_localization_derivatives (
    workspace_id, project_id, root_episode_id, target_locale, content_variant
  );
CREATE INDEX IF NOT EXISTS episode_localization_derivatives_root_idx
  ON episode_localization_derivatives (workspace_id, project_id, root_episode_id);
`;

export class LocalizationDerivativePersistenceError extends Error {
  public override readonly name = "LocalizationDerivativePersistenceError";
}

function row<T>(result: PostgresQueryResult<T>, message: string): T {
  const value = result.rows[0];
  if (!value) throw new LocalizationDerivativePersistenceError(message);
  return value;
}

export interface LocalizationDerivativeRow {
  readonly workspace_id: string;
  readonly project_id: string;
  readonly derivative_id: string;
  readonly root_episode_id: string;
  readonly derivative_episode_id: string;
  readonly target_locale: string;
  readonly content_variant: "full" | "short";
  readonly source_episode_revision: string | number;
  readonly source_content_fingerprint: string;
  readonly derivative_revision: string | number;
  readonly status: string;
  readonly localized_slug: string;
  readonly localized_title: string | null;
  readonly reused_asset_ids: unknown;
  readonly partial_state: unknown;
  readonly created_at: string | Date;
  readonly updated_at: string | Date;
}

export function mapLocalizationDerivativeRow(
  row: LocalizationDerivativeRow
): {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly derivativeId: string;
  readonly rootEpisodeId: string;
  readonly derivativeEpisodeId: string;
  readonly targetLocale: string;
  readonly contentVariant: "full" | "short";
  readonly sourceEpisodeRevision: number;
  readonly sourceContentFingerprint: string;
  readonly derivativeRevision: number;
  readonly status: string;
  readonly localizedSlug: string;
  readonly localizedTitle: string | null;
  readonly reusedAssetIds: unknown;
  readonly partialState: unknown;
  readonly createdAt: string;
  readonly updatedAt: string;
} {
  return {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    derivativeId: row.derivative_id,
    rootEpisodeId: row.root_episode_id,
    derivativeEpisodeId: row.derivative_episode_id,
    targetLocale: row.target_locale,
    contentVariant: row.content_variant,
    sourceEpisodeRevision: Number(row.source_episode_revision),
    sourceContentFingerprint: row.source_content_fingerprint,
    derivativeRevision: Number(row.derivative_revision),
    status: row.status,
    localizedSlug: row.localized_slug,
    localizedTitle: row.localized_title,
    reusedAssetIds: row.reused_asset_ids,
    partialState: row.partial_state,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at,
  };
}

export class PostgresLocalizationDerivativeRepository {
  public constructor(private readonly pool: PostgresPool) {}

  public async ensureSchema(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(POSTGRES_LOCALIZATION_DERIVATIVE_MIGRATION);
    } finally {
      client.release();
    }
  }

  public async listByRootEpisode(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly rootEpisodeId: string;
  }): Promise<readonly LocalizationDerivativeRow[]> {
    const result = await this.pool.query<LocalizationDerivativeRow>(
      `SELECT workspace_id, project_id, derivative_id, root_episode_id,
              derivative_episode_id, target_locale, content_variant,
              source_episode_revision, source_content_fingerprint,
              derivative_revision, status, localized_slug, localized_title,
              reused_asset_ids, partial_state, created_at, updated_at
       FROM episode_localization_derivatives
       WHERE workspace_id = $1 AND project_id = $2 AND root_episode_id = $3
       ORDER BY created_at, derivative_id`,
      [input.workspaceId, input.projectId, input.rootEpisodeId]
    );
    return result.rows;
  }

  public async getById(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly rootEpisodeId: string;
    readonly derivativeId: string;
  }): Promise<LocalizationDerivativeRow | null> {
    const result = await this.pool.query<LocalizationDerivativeRow>(
      `SELECT workspace_id, project_id, derivative_id, root_episode_id,
              derivative_episode_id, target_locale, content_variant,
              source_episode_revision, source_content_fingerprint,
              derivative_revision, status, localized_slug, localized_title,
              reused_asset_ids, partial_state, created_at, updated_at
       FROM episode_localization_derivatives
       WHERE workspace_id = $1 AND project_id = $2
         AND root_episode_id = $3 AND derivative_id = $4`,
      [
        input.workspaceId,
        input.projectId,
        input.rootEpisodeId,
        input.derivativeId,
      ]
    );
    return result.rows[0] ?? null;
  }

  public async insertDerivative(
    input: {
      readonly workspaceId: string;
      readonly projectId: string;
      readonly derivativeId: string;
      readonly rootEpisodeId: string;
      readonly derivativeEpisodeId: string;
      readonly targetLocale: string;
      readonly contentVariant: "full" | "short";
      readonly sourceEpisodeRevision: number;
      readonly sourceContentFingerprint: string;
      readonly localizedSlug: string;
      readonly localizedTitle?: string;
      readonly reusedAssetIds: unknown;
      readonly now: string;
    },
    client?: PostgresClient
  ): Promise<LocalizationDerivativeRow> {
    const connection = client ?? this.pool;
    const result = await connection.query<LocalizationDerivativeRow>(
      `INSERT INTO episode_localization_derivatives (
         workspace_id, project_id, derivative_id, root_episode_id,
         derivative_episode_id, target_locale, content_variant,
         source_episode_revision, source_content_fingerprint,
         derivative_revision, status, localized_slug, localized_title,
         reused_asset_ids, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 'pending',
                 $10, $11, $12::jsonb, $13::timestamptz, $13::timestamptz)
       RETURNING workspace_id, project_id, derivative_id, root_episode_id,
                 derivative_episode_id, target_locale, content_variant,
                 source_episode_revision, source_content_fingerprint,
                 derivative_revision, status, localized_slug, localized_title,
                 reused_asset_ids, partial_state, created_at, updated_at`,
      [
        input.workspaceId,
        input.projectId,
        input.derivativeId,
        input.rootEpisodeId,
        input.derivativeEpisodeId,
        input.targetLocale,
        input.contentVariant,
        input.sourceEpisodeRevision,
        input.sourceContentFingerprint,
        input.localizedSlug,
        input.localizedTitle ?? null,
        JSON.stringify(input.reusedAssetIds),
        input.now,
      ]
    );
    return row(result, "Localization derivative row was not created.");
  }

  public async markRetry(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly rootEpisodeId: string;
    readonly derivativeId: string;
    readonly expectedDerivativeRevision: number;
    readonly now: string;
  }): Promise<LocalizationDerivativeRow | null> {
    const result = await this.pool.query<LocalizationDerivativeRow>(
      `UPDATE episode_localization_derivatives
       SET status = 'in_progress',
           partial_state = NULL,
           derivative_revision = derivative_revision + 1,
           updated_at = $5::timestamptz
       WHERE workspace_id = $1 AND project_id = $2
         AND root_episode_id = $3 AND derivative_id = $4
         AND derivative_revision = $6
       RETURNING workspace_id, project_id, derivative_id, root_episode_id,
                 derivative_episode_id, target_locale, content_variant,
                 source_episode_revision, source_content_fingerprint,
                 derivative_revision, status, localized_slug, localized_title,
                 reused_asset_ids, partial_state, created_at, updated_at`,
      [
        input.workspaceId,
        input.projectId,
        input.rootEpisodeId,
        input.derivativeId,
        input.now,
        input.expectedDerivativeRevision,
      ]
    );
    return result.rows[0] ?? null;
  }
}
