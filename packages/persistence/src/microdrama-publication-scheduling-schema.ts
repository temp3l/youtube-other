export const MICRODRAMA_PUBLICATION_SCHEDULING_SQLITE_MIGRATION_ID =
  "microdrama-embedded-v5-publication-scheduling" as const;

export const MICRODRAMA_PUBLICATION_SCHEDULING_SQLITE_MIGRATION = `
CREATE TABLE IF NOT EXISTS microdrama_audience_timezone_profiles (
  profile_id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  audience_timezone TEXT NOT NULL,
  profile_json TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  UNIQUE(series_id, locale)
);

CREATE TABLE IF NOT EXISTS microdrama_publication_schedule_policies (
  policy_id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('tiktok', 'youtube')),
  locale TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  manual_dispatch_enabled INTEGER NOT NULL CHECK (manual_dispatch_enabled IN (0, 1)),
  preapproved_scheduled_enabled INTEGER NOT NULL CHECK (preapproved_scheduled_enabled IN (0, 1)),
  tiktok_audit_readiness_projection_id TEXT NULL,
  max_schedule_horizon_hours INTEGER NOT NULL CHECK (max_schedule_horizon_hours > 0),
  policy_json TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(series_id, locale, provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS microdrama_publication_schedule_records (
  schedule_id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL,
  dispatch_mode TEXT NOT NULL CHECK (dispatch_mode IN ('manual', 'preapproved_scheduled')),
  audience_timezone_profile_id TEXT NOT NULL,
  audience_timezone TEXT NOT NULL,
  local_scheduled_at TEXT NOT NULL,
  scheduled_at_utc TEXT NOT NULL,
  intent_fingerprint TEXT NOT NULL,
  consent_fence_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK (
    state IN ('pending', 'cancelled', 'dispatched', 'superseded')
  ),
  schedule_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (audience_timezone_profile_id)
    REFERENCES microdrama_audience_timezone_profiles(profile_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS microdrama_publication_schedule_records_intent_pending_idx
  ON microdrama_publication_schedule_records(intent_id)
  WHERE state = 'pending';

CREATE TABLE IF NOT EXISTS microdrama_publication_schedule_consent_records (
  consent_record_id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  intent_id TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  intent_fingerprint TEXT NOT NULL,
  consent_fence_hash TEXT NOT NULL,
  dispatch_mode TEXT NOT NULL CHECK (dispatch_mode IN ('manual', 'preapproved_scheduled')),
  consent_json TEXT NOT NULL,
  consented_at TEXT NOT NULL,
  FOREIGN KEY (schedule_id) REFERENCES microdrama_publication_schedule_records(schedule_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS microdrama_publication_schedule_consent_records_schedule_idx
  ON microdrama_publication_schedule_consent_records(schedule_id);
`;
