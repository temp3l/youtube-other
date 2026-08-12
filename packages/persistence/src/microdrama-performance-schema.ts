export const MICRODRAMA_PERFORMANCE_SQLITE_MIGRATION_ID =
  "microdrama-embedded-v4-performance" as const;

export const MICRODRAMA_PERFORMANCE_SQLITE_MIGRATION = `
CREATE TABLE IF NOT EXISTS microdrama_performance_observations (
  observation_id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('tiktok', 'youtube')),
  provider_account_id TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  publication_revision INTEGER NOT NULL CHECK (publication_revision >= 0),
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL,
  observation_json TEXT NOT NULL,
  UNIQUE(
    publication_id,
    publication_revision,
    window_start,
    window_end,
    fingerprint
  )
);

CREATE INDEX IF NOT EXISTS microdrama_performance_observations_episode_idx
  ON microdrama_performance_observations(series_id, episode_id, locale);
`;
