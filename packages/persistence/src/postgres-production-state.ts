/**
 * YSAAS-001 production revision identity and replaceable episode projection storage.
 */
export const POSTGRES_PRODUCTION_STATE_MIGRATION = `
CREATE TABLE IF NOT EXISTS production_revisions (
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  production_revision_id TEXT NOT NULL,
  episode_revision BIGINT NOT NULL CHECK (episode_revision >= 0),
  episode_revision_id TEXT NULL,
  resolved_config_fingerprint TEXT NOT NULL CHECK (resolved_config_fingerprint ~ '^[a-f0-9]{64}$'),
  locale TEXT NOT NULL,
  variant TEXT NOT NULL CHECK (variant IN ('full', 'short')),
  workflow_run_id TEXT NULL,
  supersedes_production_revision_id TEXT NULL,
  specification JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, production_revision_id),
  FOREIGN KEY (workspace_id, episode_id) REFERENCES episodes (workspace_id, episode_id),
  FOREIGN KEY (workspace_id, workflow_run_id) REFERENCES workflow_runs (workspace_id, run_id),
  FOREIGN KEY (workspace_id, supersedes_production_revision_id)
    REFERENCES production_revisions (workspace_id, production_revision_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS production_revisions_episode_revision_unique
  ON production_revisions (workspace_id, project_id, episode_id, episode_revision, production_revision_id);
CREATE TABLE IF NOT EXISTS episode_production_state (
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  projection_revision BIGINT NOT NULL DEFAULT 0,
  current_production_revision_id TEXT NOT NULL,
  projection JSONB NOT NULL,
  projection_input_fingerprint TEXT NOT NULL CHECK (projection_input_fingerprint ~ '^[a-f0-9]{64}$'),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, project_id, episode_id),
  FOREIGN KEY (workspace_id, episode_id) REFERENCES episodes (workspace_id, episode_id),
  FOREIGN KEY (workspace_id, current_production_revision_id)
    REFERENCES production_revisions (workspace_id, production_revision_id)
);
CREATE OR REPLACE FUNCTION reject_production_revision_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'production revisions are append-only' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS production_revisions_immutable ON production_revisions;
CREATE TRIGGER production_revisions_immutable
  BEFORE UPDATE OR DELETE ON production_revisions
  FOR EACH ROW EXECUTE FUNCTION reject_production_revision_mutation();
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['production_revisions', 'episode_production_state']
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
