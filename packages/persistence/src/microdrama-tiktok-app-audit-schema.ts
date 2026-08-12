export const MICRODRAMA_TIKTOK_APP_AUDIT_SQLITE_MIGRATION_ID =
  "microdrama-embedded-v4-tiktok-app-audit" as const;

export const MICRODRAMA_TIKTOK_APP_AUDIT_SQLITE_MIGRATION = `
CREATE TABLE IF NOT EXISTS microdrama_tiktok_app_configuration_revisions (
  configuration_revision_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  provider_app_id TEXT NOT NULL,
  product TEXT NOT NULL CHECK (product IN ('login_kit', 'content_posting_api')),
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  app_credential_handle TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  expires_at TEXT NULL,
  revoked_at TEXT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'expired', 'revoked')),
  configuration_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS microdrama_tiktok_app_configuration_workspace_idx
  ON microdrama_tiktok_app_configuration_revisions(workspace_id, provider_app_id, recorded_at);

CREATE TABLE IF NOT EXISTS microdrama_tiktok_provider_audit_evidence (
  audit_evidence_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  provider_app_id TEXT NOT NULL,
  configuration_revision_id TEXT NOT NULL,
  evidence_source TEXT NOT NULL CHECK (
    evidence_source IN ('provider_portal_export', 'operator_canary_evidence')
  ),
  submission_state TEXT NOT NULL CHECK (
    submission_state IN (
      'not_submitted',
      'submitted',
      'provider_approved',
      'provider_rejected',
      'provider_pending'
    )
  ),
  effective_at TEXT NOT NULL,
  expires_at TEXT NULL,
  revoked_at TEXT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'expired', 'revoked')),
  audit_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (configuration_revision_id)
    REFERENCES microdrama_tiktok_app_configuration_revisions(configuration_revision_id)
);

CREATE TABLE IF NOT EXISTS microdrama_tiktok_app_audit_readiness_projections (
  readiness_projection_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  provider_app_id TEXT NOT NULL,
  configuration_revision_id TEXT NOT NULL,
  audit_evidence_id TEXT NOT NULL,
  app_credential_handle TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  expires_at TEXT NULL,
  revoked_at TEXT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'expired', 'revoked')),
  readiness_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (configuration_revision_id)
    REFERENCES microdrama_tiktok_app_configuration_revisions(configuration_revision_id),
  FOREIGN KEY (audit_evidence_id)
    REFERENCES microdrama_tiktok_provider_audit_evidence(audit_evidence_id)
);
`;
