export const MICRODRAMA_PUBLICATION_SQLITE_MIGRATION_ID =
  "microdrama-embedded-v3-publication" as const;

export const MICRODRAMA_PUBLICATION_SQLITE_MIGRATION = `
CREATE TABLE IF NOT EXISTS microdrama_publication_target_profiles (
  profile_id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('tiktok', 'youtube')),
  provider_account_id TEXT NOT NULL,
  credential_version TEXT NOT NULL,
  metadata_profile_id TEXT NOT NULL,
  schedule_profile_id TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  profile_json TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  UNIQUE(series_id, locale, provider)
);

CREATE TABLE IF NOT EXISTS microdrama_creator_content_consent_revisions (
  consent_revision_id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  rightsholder_id TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  evidence_source TEXT NOT NULL,
  permitted_provider TEXT NOT NULL CHECK (permitted_provider IN ('tiktok', 'youtube')),
  permitted_locale TEXT NOT NULL,
  permitted_territory TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  expires_at TEXT NULL,
  revoked_at TEXT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'expired', 'revoked')),
  consent_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS microdrama_tiktok_export_approval_revisions (
  export_approval_revision_id TEXT PRIMARY KEY,
  consent_revision_id TEXT NOT NULL,
  creator_capability_evidence_hash TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  render_hash TEXT NOT NULL,
  artifact_manifest_hash TEXT NOT NULL,
  metadata_revision_id TEXT NOT NULL,
  privacy TEXT NOT NULL CHECK (privacy IN ('public', 'friends', 'private')),
  ai_content_declared INTEGER NOT NULL CHECK (ai_content_declared IN (0, 1)),
  commercial_content_declared INTEGER NOT NULL CHECK (commercial_content_declared IN (0, 1)),
  operator_id TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'expired', 'revoked')),
  approval_json TEXT NOT NULL,
  FOREIGN KEY (consent_revision_id) REFERENCES microdrama_creator_content_consent_revisions(consent_revision_id)
);

CREATE TABLE IF NOT EXISTS microdrama_publication_intents (
  intent_id TEXT PRIMARY KEY,
  target_profile_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('tiktok', 'youtube')),
  provider_account_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  approval_state TEXT NOT NULL CHECK (
    approval_state IN ('pending', 'publication_approved', 'rejected', 'revoked')
  ),
  bound_export_approval_revision_id TEXT NULL,
  state TEXT NOT NULL CHECK (
    state IN (
      'draft',
      'approved',
      'prepared',
      'in_flight',
      'published',
      'failed_known',
      'outcome_uncertain',
      'reconciled',
      'cancelled'
    )
  ),
  intent_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (target_profile_id) REFERENCES microdrama_publication_target_profiles(profile_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS microdrama_publication_intents_idempotency_idx
  ON microdrama_publication_intents(idempotency_key);

CREATE TABLE IF NOT EXISTS microdrama_publication_idempotency_records (
  idempotency_key TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  intent_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('fresh', 'reserved', 'committed', 'conflict')),
  reserved_at TEXT NOT NULL,
  committed_at TEXT NULL,
  record_json TEXT NOT NULL,
  FOREIGN KEY (intent_id) REFERENCES microdrama_publication_intents(intent_id)
);

CREATE TABLE IF NOT EXISTS microdrama_publication_attempts (
  attempt_id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL,
  attempt_fence INTEGER NOT NULL CHECK (attempt_fence > 0),
  idempotency_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK (
    state IN ('prepared', 'in_flight', 'succeeded', 'failed_known', 'outcome_uncertain')
  ),
  provider_request_id TEXT NULL,
  provider_correlation_id TEXT NULL,
  provider_response_id TEXT NULL,
  attempt_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (intent_id) REFERENCES microdrama_publication_intents(intent_id),
  UNIQUE(intent_id, attempt_fence)
);

CREATE TABLE IF NOT EXISTS microdrama_publication_effect_evidence (
  effect_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  intent_id TEXT NOT NULL,
  outcome_state TEXT NOT NULL CHECK (
    outcome_state IN (
      'pending',
      'succeeded',
      'failed_known',
      'outcome_uncertain',
      'reconciled'
    )
  ),
  provider_request_id TEXT NULL,
  provider_correlation_id TEXT NULL,
  provider_response_id TEXT NULL,
  rate_limit_state TEXT NOT NULL CHECK (rate_limit_state IN ('none', 'throttled', 'paused')),
  retry_after TEXT NULL,
  next_eligible_at TEXT NULL,
  reconciliation_outcome TEXT NULL,
  effect_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (attempt_id) REFERENCES microdrama_publication_attempts(attempt_id),
  FOREIGN KEY (intent_id) REFERENCES microdrama_publication_intents(intent_id)
);
`;
