export const MICRODRAMA_SQLITE_MIGRATION_ID = "microdrama-embedded-v1" as const;

export const MICRODRAMA_SQLITE_MIGRATION = `
CREATE TABLE IF NOT EXISTS microdrama_schema_migrations (
  migration_id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS microdrama_narrative_revisions (
  revision_id TEXT PRIMARY KEY,
  aggregate_id TEXT NOT NULL,
  aggregate_kind TEXT NOT NULL,
  revision_number INTEGER NOT NULL,
  envelope_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(aggregate_id, aggregate_kind, revision_number)
);

CREATE TABLE IF NOT EXISTS microdrama_events (
  event_id TEXT PRIMARY KEY,
  sequence INTEGER NOT NULL,
  event_kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS microdrama_events_sequence_idx
  ON microdrama_events(sequence);

CREATE TABLE IF NOT EXISTS microdrama_artifact_references (
  artifact_hash TEXT PRIMARY KEY,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  storage_uri TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS microdrama_projections (
  projection_key TEXT PRIMARY KEY,
  projection_revision INTEGER NOT NULL,
  projection_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;
