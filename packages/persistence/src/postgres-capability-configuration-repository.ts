import {
  episodeConfigurationOverrideSchema,
  genreConfigurationSchema,
  tenantSettingsSchema,
  type EpisodeConfigurationOverride,
  type GenreConfiguration,
  type TenantSettings,
} from "@mediaforge/domain";

import type { Queryable } from "./postgres-workflow-repository.js";

/** Authoritative tenant configuration layers. Values are versioned, not inferred from UI defaults. */
export const POSTGRES_CAPABILITY_CONFIGURATION_MIGRATION = `
CREATE TABLE IF NOT EXISTS workspace_tenant_configurations (
  workspace_id TEXT PRIMARY KEY,
  specification JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS workspace_genre_configurations (
  workspace_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  specification JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, profile_id)
);
CREATE TABLE IF NOT EXISTS episode_configuration_overrides (
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  specification JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, project_id, episode_id),
  FOREIGN KEY (workspace_id, episode_id) REFERENCES episodes (workspace_id, episode_id)
);
DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['workspace_tenant_configurations','workspace_genre_configurations','episode_configuration_overrides'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS workspace_isolation ON %I', table_name);
    EXECUTE format('CREATE POLICY workspace_isolation ON %I USING (workspace_id = current_setting(''app.workspace_id'', true)) WITH CHECK (workspace_id = current_setting(''app.workspace_id'', true))', table_name);
  END LOOP;
END $$;
`;

export async function getTenantSettings(connection: Queryable, workspaceId: string): Promise<TenantSettings | null> {
  const result = await connection.query<{ readonly specification: unknown }>(`SELECT specification FROM workspace_tenant_configurations WHERE workspace_id=$1`, [workspaceId]);
  return result.rows[0] ? tenantSettingsSchema.parse(result.rows[0].specification) : null;
}

export async function getGenreConfiguration(connection: Queryable, workspaceId: string, profileId: string): Promise<GenreConfiguration | null> {
  const result = await connection.query<{ readonly specification: unknown }>(`SELECT specification FROM workspace_genre_configurations WHERE workspace_id=$1 AND profile_id=$2`, [workspaceId, profileId]);
  return result.rows[0] ? genreConfigurationSchema.parse(result.rows[0].specification) : null;
}

export async function getEpisodeConfigurationOverride(connection: Queryable, input: { readonly workspaceId: string; readonly projectId: string; readonly episodeId: string }): Promise<EpisodeConfigurationOverride | null> {
  const result = await connection.query<{ readonly specification: unknown }>(`SELECT specification FROM episode_configuration_overrides WHERE workspace_id=$1 AND project_id=$2 AND episode_id=$3`, [input.workspaceId, input.projectId, input.episodeId]);
  return result.rows[0] ? episodeConfigurationOverrideSchema.parse(result.rows[0].specification) : null;
}
