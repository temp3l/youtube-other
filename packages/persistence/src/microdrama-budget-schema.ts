export const MICRODRAMA_BUDGET_SQLITE_MIGRATION_ID =
  "microdrama-embedded-v2-budgets" as const;

export const MICRODRAMA_BUDGET_SQLITE_MIGRATION = `
CREATE TABLE IF NOT EXISTS microdrama_budget_profiles (
  profile_id TEXT PRIMARY KEY,
  scope_kind TEXT NOT NULL CHECK (
    scope_kind IN ('task', 'provider', 'episode', 'locale', 'series')
  ),
  scope_id TEXT NOT NULL,
  limit_minor INTEGER NOT NULL CHECK (limit_minor >= 0),
  enforcement TEXT NOT NULL CHECK (enforcement IN ('hard', 'soft')),
  profile_json TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  UNIQUE(scope_kind, scope_id)
);

CREATE TABLE IF NOT EXISTS microdrama_budget_reservations (
  reservation_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  locale TEXT NULL,
  provider TEXT NULL,
  task_id TEXT NULL,
  reserved_minor INTEGER NOT NULL CHECK (reserved_minor > 0),
  settled_minor INTEGER NULL CHECK (settled_minor IS NULL OR settled_minor >= 0),
  state TEXT NOT NULL CHECK (state IN ('reserved', 'settled', 'released')),
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES microdrama_budget_profiles(profile_id)
);

CREATE INDEX IF NOT EXISTS microdrama_budget_reservations_profile_state_idx
  ON microdrama_budget_reservations(profile_id, state);

CREATE TABLE IF NOT EXISTS microdrama_cost_attributions (
  attribution_id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL,
  locale TEXT NULL,
  provider TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (
    asset_type IN ('image', 'video', 'tts', 'render', 'alignment', 'subtitle')
  ),
  asset_cost_scope TEXT NOT NULL CHECK (
    asset_cost_scope IN (
      'shared_visual',
      'locale_tts',
      'locale_render',
      'locale_subtitle',
      'locale_metadata'
    )
  ),
  revision_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  cost_minor INTEGER NOT NULL CHECK (cost_minor >= 0),
  cache_status TEXT NOT NULL CHECK (cache_status IN ('hit', 'miss', 'disabled')),
  retry_count INTEGER NOT NULL CHECK (retry_count >= 0),
  correlation_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (reservation_id) REFERENCES microdrama_budget_reservations(reservation_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS microdrama_cost_attributions_shared_visual_dedup_idx
  ON microdrama_cost_attributions(episode_id, asset_type, revision_id, asset_cost_scope)
  WHERE asset_cost_scope = 'shared_visual';
`;
