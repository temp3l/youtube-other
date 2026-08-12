export const CHARACTER_VOICE_SQLITE_MIGRATION_ID =
  "microdrama-character-voice-v1" as const;

export const CHARACTER_VOICE_SQLITE_MIGRATION = `
CREATE TABLE IF NOT EXISTS microdrama_character_voice_profiles (
  profile_id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  display_name TEXT NOT NULL,
  narrative_role TEXT NOT NULL CHECK (narrative_role IN ('narrator', 'character')),
  speech_style_notes TEXT NOT NULL,
  active_version_id TEXT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (character_id, locale)
);

CREATE TABLE IF NOT EXISTS microdrama_character_voice_consent_records (
  consent_record_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS microdrama_character_voice_profile_versions (
  profile_version_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'DEPRECATED')),
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'elevenlabs')),
  model_intent TEXT NOT NULL,
  voice_binding_status TEXT NOT NULL CHECK (
    voice_binding_status IN ('UNBOUND', 'CANARY_PENDING', 'CANARY_APPROVED')
  ),
  provider_voice_id TEXT NULL,
  canary_evidence_artifact_hash TEXT NULL,
  consent_record_id TEXT NULL,
  delivery_configuration_json TEXT NOT NULL,
  pronunciation_revision_id TEXT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  activated_at TEXT NULL,
  deprecated_at TEXT NULL,
  UNIQUE (profile_id, version_number),
  FOREIGN KEY (profile_id) REFERENCES microdrama_character_voice_profiles (profile_id),
  FOREIGN KEY (consent_record_id)
    REFERENCES microdrama_character_voice_consent_records (consent_record_id)
);

CREATE TABLE IF NOT EXISTS microdrama_character_voice_pronunciation_revisions (
  pronunciation_revision_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  profile_version_number INTEGER NOT NULL CHECK (profile_version_number > 0),
  locale TEXT NOT NULL,
  entries_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (profile_id, profile_version_number),
  FOREIGN KEY (profile_id) REFERENCES microdrama_character_voice_profiles (profile_id)
);

CREATE INDEX IF NOT EXISTS microdrama_character_voice_profiles_character_locale_idx
  ON microdrama_character_voice_profiles (character_id, locale);

CREATE INDEX IF NOT EXISTS microdrama_character_voice_profile_versions_profile_idx
  ON microdrama_character_voice_profile_versions (profile_id, status, version_number DESC);
`;
