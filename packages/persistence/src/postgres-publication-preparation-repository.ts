import type {
  PostgresClient,
  PostgresPool,
  PostgresQueryResult,
} from "./postgres-workflow-repository.js";

export const POSTGRES_PUBLICATION_PREPARATION_MIGRATION = `
CREATE TABLE IF NOT EXISTS workspace_publishing_channels (
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  provider_channel_id TEXT NULL,
  connection_status TEXT NOT NULL
    CHECK (connection_status IN (
      'disconnected', 'connecting', 'connected',
      'reauthorize_required', 'degraded'
    )),
  credential_version TEXT NULL,
  oauth_token_vault_ref TEXT NULL,
  default_visibility TEXT NULL
    CHECK (default_visibility IS NULL OR default_visibility IN ('private', 'unlisted', 'public')),
  default_locale TEXT NULL,
  supported_locales JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(supported_locales) = 'array'),
  authorization_expires_at TIMESTAMPTZ NULL,
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, channel_id)
);
CREATE TABLE IF NOT EXISTS workspace_publication_schedule_policies (
  workspace_id TEXT NOT NULL PRIMARY KEY,
  max_schedule_horizon_hours INTEGER NOT NULL CHECK (max_schedule_horizon_hours > 0),
  default_timezone TEXT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  configured_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS publication_oauth_sessions (
  workspace_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  channel_id TEXT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'completed', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, session_id)
);
CREATE TABLE IF NOT EXISTS publication_metadata_revisions (
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  metadata_revision_id TEXT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  content_hash TEXT NOT NULL,
  metadata JSONB NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
  created_by_principal_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, metadata_revision_id),
  FOREIGN KEY (workspace_id, episode_id) REFERENCES episodes (workspace_id, episode_id)
);
CREATE INDEX IF NOT EXISTS publication_metadata_revisions_episode_idx
  ON publication_metadata_revisions (workspace_id, project_id, episode_id, created_at DESC);
`;

export class PublicationPreparationPersistenceError extends Error {
  public override readonly name = "PublicationPreparationPersistenceError";
}

function row<T>(result: PostgresQueryResult<T>, message: string): T {
  const value = result.rows[0];
  if (!value) throw new PublicationPreparationPersistenceError(message);
  return value;
}

export interface PublishingChannelRow {
  readonly workspace_id: string;
  readonly channel_id: string;
  readonly display_name: string;
  readonly provider_channel_id: string | null;
  readonly connection_status: string;
  readonly credential_version: string | null;
  readonly default_visibility: string | null;
  readonly default_locale: string | null;
  readonly supported_locales: unknown;
  readonly authorization_expires_at: string | Date | null;
  readonly revision: string | number;
  readonly updated_at: string | Date;
}

export function mapPublishingChannelRow(row: PublishingChannelRow): {
  readonly workspaceId: string;
  readonly channelId: string;
  readonly displayName: string;
  readonly providerChannelId: string | null;
  readonly connectionStatus: string;
  readonly credentialVersion: string | null;
  readonly defaultVisibility: string | null;
  readonly defaultLocale: string | null;
  readonly supportedLocales: unknown;
  readonly authorizationExpiresAt: string | null;
  readonly revision: number;
  readonly updatedAt: string;
} {
  return {
    workspaceId: row.workspace_id,
    channelId: row.channel_id,
    displayName: row.display_name,
    providerChannelId: row.provider_channel_id,
    connectionStatus: row.connection_status,
    credentialVersion: row.credential_version,
    defaultVisibility: row.default_visibility,
    defaultLocale: row.default_locale,
    supportedLocales: row.supported_locales,
    authorizationExpiresAt:
      row.authorization_expires_at === null
        ? null
        : row.authorization_expires_at instanceof Date
          ? row.authorization_expires_at.toISOString()
          : row.authorization_expires_at,
    revision: Number(row.revision),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at,
  };
}

export class PostgresPublicationPreparationRepository {
  public constructor(private readonly pool: PostgresPool) {}

  public async ensureSchema(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(POSTGRES_PUBLICATION_PREPARATION_MIGRATION);
    } finally {
      client.release();
    }
  }

  public async listChannels(
    workspaceId: string
  ): Promise<readonly ReturnType<typeof mapPublishingChannelRow>[]> {
    const result = await this.pool.query<PublishingChannelRow>(
      `SELECT workspace_id, channel_id, display_name, provider_channel_id,
              connection_status, credential_version, default_visibility,
              default_locale, supported_locales, authorization_expires_at,
              revision, updated_at
       FROM workspace_publishing_channels
       WHERE workspace_id = $1
       ORDER BY display_name ASC, channel_id ASC`,
      [workspaceId]
    );
    return result.rows.map(mapPublishingChannelRow);
  }

  public async getChannel(input: {
    readonly workspaceId: string;
    readonly channelId: string;
  }): Promise<ReturnType<typeof mapPublishingChannelRow> | null> {
    const result = await this.pool.query<PublishingChannelRow>(
      `SELECT workspace_id, channel_id, display_name, provider_channel_id,
              connection_status, credential_version, default_visibility,
              default_locale, supported_locales, authorization_expires_at,
              revision, updated_at
       FROM workspace_publishing_channels
       WHERE workspace_id = $1 AND channel_id = $2`,
      [input.workspaceId, input.channelId]
    );
    return result.rows[0] ? mapPublishingChannelRow(result.rows[0]) : null;
  }

  public async beginOAuthSession(input: {
    readonly workspaceId: string;
    readonly sessionId: string;
    readonly nonce: string;
    readonly expiresAt: string;
    readonly now: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO publication_oauth_sessions (
         workspace_id, session_id, nonce, state, expires_at, created_at
       ) VALUES ($1, $2, $3, 'pending', $4::timestamptz, $5::timestamptz)`,
      [
        input.workspaceId,
        input.sessionId,
        input.nonce,
        input.expiresAt,
        input.now,
      ]
    );
  }

  public async getOAuthSession(input: {
    readonly workspaceId: string;
    readonly sessionId: string;
  }): Promise<{
    readonly nonce: string;
    readonly state: string;
    readonly channelId: string | null;
    readonly expiresAt: string;
  } | null> {
    const result = await this.pool.query<{
      readonly nonce: string;
      readonly state: string;
      readonly channel_id: string | null;
      readonly expires_at: string | Date;
    }>(
      `SELECT nonce, state, channel_id, expires_at
       FROM publication_oauth_sessions
       WHERE workspace_id = $1 AND session_id = $2`,
      [input.workspaceId, input.sessionId]
    );
    const rowValue = result.rows[0];
    if (!rowValue) return null;
    return {
      nonce: rowValue.nonce,
      state: rowValue.state,
      channelId: rowValue.channel_id,
      expiresAt:
        rowValue.expires_at instanceof Date
          ? rowValue.expires_at.toISOString()
          : rowValue.expires_at,
    };
  }

  public async completeOAuthSession(input: {
    readonly workspaceId: string;
    readonly sessionId: string;
    readonly channelId: string;
    readonly displayName: string;
    readonly providerChannelId: string;
    readonly credentialVersion: string;
    readonly oauthTokenVaultRef: string;
    readonly authorizationExpiresAt: string;
    readonly now: string;
  }): Promise<ReturnType<typeof mapPublishingChannelRow>> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE publication_oauth_sessions
         SET state = 'completed', channel_id = $3
         WHERE workspace_id = $1 AND session_id = $2 AND state = 'pending'`,
        [input.workspaceId, input.sessionId, input.channelId]
      );
      await client.query(
        `INSERT INTO publication_credential_versions (
           workspace_id, credential_version, channel_id, state, revision,
           created_at, updated_at
         ) VALUES ($1, $2, $3, 'active', 0, $4::timestamptz, $4::timestamptz)
         ON CONFLICT (workspace_id, credential_version) DO NOTHING`,
        [
          input.workspaceId,
          input.credentialVersion,
          input.channelId,
          input.now,
        ]
      );
      const upsert = await client.query<PublishingChannelRow>(
        `INSERT INTO workspace_publishing_channels (
           workspace_id, channel_id, display_name, provider_channel_id,
           connection_status, credential_version, oauth_token_vault_ref,
           revision, created_at, updated_at, authorization_expires_at
         ) VALUES (
           $1, $2, $3, $4, 'connected', $5, $6, 0, $7::timestamptz, $7::timestamptz, $8::timestamptz
         )
         ON CONFLICT (workspace_id, channel_id) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           provider_channel_id = EXCLUDED.provider_channel_id,
           connection_status = 'connected',
           credential_version = EXCLUDED.credential_version,
           oauth_token_vault_ref = EXCLUDED.oauth_token_vault_ref,
           authorization_expires_at = EXCLUDED.authorization_expires_at,
           revision = workspace_publishing_channels.revision + 1,
           updated_at = EXCLUDED.updated_at
         RETURNING workspace_id, channel_id, display_name, provider_channel_id,
                   connection_status, credential_version, default_visibility,
                   default_locale, supported_locales, authorization_expires_at,
                   revision, updated_at`,
        [
          input.workspaceId,
          input.channelId,
          input.displayName,
          input.providerChannelId,
          input.credentialVersion,
          input.oauthTokenVaultRef,
          input.now,
          input.authorizationExpiresAt,
        ]
      );
      await client.query("COMMIT");
      return mapPublishingChannelRow(row(upsert, "Channel upsert failed."));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  public async disconnectChannel(input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly expectedRevision: number;
    readonly now: string;
  }): Promise<ReturnType<typeof mapPublishingChannelRow> | null> {
    const result = await this.pool.query<PublishingChannelRow>(
      `UPDATE workspace_publishing_channels
       SET connection_status = 'disconnected',
           credential_version = NULL,
           oauth_token_vault_ref = NULL,
           authorization_expires_at = NULL,
           revision = revision + 1,
           updated_at = $4::timestamptz
       WHERE workspace_id = $1 AND channel_id = $2 AND revision = $3
       RETURNING workspace_id, channel_id, display_name, provider_channel_id,
                 connection_status, credential_version, default_visibility,
                 default_locale, supported_locales, authorization_expires_at,
                 revision, updated_at`,
      [
        input.workspaceId,
        input.channelId,
        input.expectedRevision,
        input.now,
      ]
    );
    return result.rows[0] ? mapPublishingChannelRow(result.rows[0]) : null;
  }

  public async getSchedulePolicy(
    workspaceId: string
  ): Promise<{
    readonly maxScheduleHorizonHours: number;
    readonly defaultTimezone: string;
    readonly revision: number;
  } | null> {
    const result = await this.pool.query<{
      readonly max_schedule_horizon_hours: string | number;
      readonly default_timezone: string;
      readonly revision: string | number;
    }>(
      `SELECT max_schedule_horizon_hours, default_timezone, revision
       FROM workspace_publication_schedule_policies
       WHERE workspace_id = $1`,
      [workspaceId]
    );
    const rowValue = result.rows[0];
    if (!rowValue) return null;
    return {
      maxScheduleHorizonHours: Number(rowValue.max_schedule_horizon_hours),
      defaultTimezone: rowValue.default_timezone,
      revision: Number(rowValue.revision),
    };
  }

  public async getPrincipalRevision(input: {
    readonly workspaceId: string;
    readonly principalId: string;
  }): Promise<number | null> {
    const result = await this.pool.query<{ readonly revision: string | number }>(
      `SELECT revision FROM workspace_principals
       WHERE workspace_id = $1 AND principal_id = $2
         AND active = TRUE AND revoked_at IS NULL`,
      [input.workspaceId, input.principalId]
    );
    return result.rows[0] ? Number(result.rows[0].revision) : null;
  }

  public async insertMetadataRevision(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly episodeId: string;
    readonly metadataRevisionId: string;
    readonly contentHash: string;
    readonly metadata: unknown;
    readonly createdByPrincipalId: string;
    readonly now: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO publication_metadata_revisions (
         workspace_id, project_id, episode_id, metadata_revision_id,
         revision, content_hash, metadata, created_by_principal_id, created_at
       ) VALUES ($1, $2, $3, $4, 0, $5, $6::jsonb, $7, $8::timestamptz)`,
      [
        input.workspaceId,
        input.projectId,
        input.episodeId,
        input.metadataRevisionId,
        input.contentHash,
        JSON.stringify(input.metadata),
        input.createdByPrincipalId,
        input.now,
      ]
    );
  }
}
