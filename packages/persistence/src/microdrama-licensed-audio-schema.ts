export const MICRODRAMA_LICENSED_AUDIO_SQLITE_MIGRATION_ID =
  "microdrama-embedded-v5-licensed-audio" as const;

export const MICRODRAMA_LICENSED_AUDIO_SQLITE_MIGRATION = `
CREATE TABLE IF NOT EXISTS microdrama_licensed_audio_assets (
  asset_id TEXT PRIMARY KEY,
  layer_kind TEXT NOT NULL CHECK (layer_kind IN ('ambience', 'sfx', 'music')),
  asset_hash TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  asset_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS microdrama_licensed_audio_layer_kind_idx
  ON microdrama_licensed_audio_assets(layer_kind);

CREATE INDEX IF NOT EXISTS microdrama_licensed_audio_fingerprint_idx
  ON microdrama_licensed_audio_assets(fingerprint);
`;
