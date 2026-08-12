export const MICRODRAMA_VISUAL_REGISTRY_MIGRATION_ID =
  "microdrama-visual-registry-v1" as const;

export const MICRODRAMA_VISUAL_REGISTRY_MIGRATION = `
CREATE TABLE IF NOT EXISTS microdrama_visual_registry_revisions (
  revision_id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  entry_kind TEXT NOT NULL,
  revision_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  envelope_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(series_id, entry_id, entry_kind, revision_number)
);

CREATE INDEX IF NOT EXISTS microdrama_visual_registry_entry_idx
  ON microdrama_visual_registry_revisions(series_id, entry_id, entry_kind);

CREATE TABLE IF NOT EXISTS microdrama_visual_registry_accepted (
  series_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  entry_kind TEXT NOT NULL,
  accepted_revision_id TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  PRIMARY KEY (series_id, entry_id, entry_kind),
  FOREIGN KEY (accepted_revision_id)
    REFERENCES microdrama_visual_registry_revisions(revision_id)
);
`;
