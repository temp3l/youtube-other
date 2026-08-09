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
CREATE TABLE IF NOT EXISTS episode_production_unit_snapshots (
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  unit_kind TEXT NOT NULL,
  unit_key TEXT NULL,
  input_fingerprint TEXT NOT NULL CHECK (input_fingerprint ~ '^[a-f0-9]{64}$'),
  content_hash TEXT NULL CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL CHECK (status IN ('missing', 'valid', 'stale', 'invalidated')),
  artifact_record_id TEXT NULL,
  worker_id TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, snapshot_id),
  FOREIGN KEY (workspace_id, episode_id) REFERENCES episodes (workspace_id, episode_id)
);
CREATE INDEX IF NOT EXISTS episode_production_unit_snapshots_current
  ON episode_production_unit_snapshots (
    workspace_id, project_id, episode_id, unit_kind, unit_key, created_at DESC, snapshot_id DESC
  );
CREATE OR REPLACE FUNCTION enforce_worker_owned_production_unit_snapshot() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.worker_id', true) IS NULL
    OR current_setting('app.worker_id', true) = ''
    OR NEW.worker_id <> current_setting('app.worker_id', true) THEN
    RAISE EXCEPTION 'production-unit snapshots require a bound worker identity' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS production_unit_snapshot_worker_guard ON episode_production_unit_snapshots;
CREATE TRIGGER production_unit_snapshot_worker_guard
  BEFORE INSERT ON episode_production_unit_snapshots
  FOR EACH ROW EXECUTE FUNCTION enforce_worker_owned_production_unit_snapshot();
CREATE OR REPLACE FUNCTION reject_production_unit_snapshot_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'production-unit snapshots are append-only' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS production_unit_snapshots_immutable ON episode_production_unit_snapshots;
CREATE TRIGGER production_unit_snapshots_immutable
  BEFORE UPDATE OR DELETE ON episode_production_unit_snapshots
  FOR EACH ROW EXECUTE FUNCTION reject_production_unit_snapshot_mutation();
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['production_revisions', 'episode_production_state', 'episode_production_unit_snapshots']
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
