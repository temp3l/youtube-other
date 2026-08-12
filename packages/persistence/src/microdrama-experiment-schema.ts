export const MICRODRAMA_EXPERIMENT_SQLITE_MIGRATION_ID =
  "microdrama-embedded-v5-experiments" as const;

export const MICRODRAMA_EXPERIMENT_SQLITE_MIGRATION = `
CREATE TABLE IF NOT EXISTS microdrama_experiment_revisions (
  experiment_revision_id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  series_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  recorded_at TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  revision_json TEXT NOT NULL,
  UNIQUE(experiment_id, revision_number)
);

CREATE TABLE IF NOT EXISTS microdrama_experiment_assignments (
  assignment_id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  experiment_revision_id TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  publication_revision INTEGER NOT NULL CHECK (publication_revision >= 0),
  locale TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('tiktok', 'youtube')),
  assigned_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL,
  assignment_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS microdrama_experiment_results (
  result_id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  experiment_revision_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL,
  causal_kind TEXT NOT NULL CHECK (causal_kind IN ('controlled', 'observational')),
  result_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS microdrama_experiment_assignments_revision_idx
  ON microdrama_experiment_assignments(experiment_revision_id);

CREATE INDEX IF NOT EXISTS microdrama_experiment_results_revision_idx
  ON microdrama_experiment_results(experiment_revision_id);
`;
