import type { DatabaseSync } from "node:sqlite";

import {
  licensedAudioAssetRecordSchema,
  type LicensedAudioAssetRecord,
} from "@mediaforge/domain";

import { FakeMicrodramaLicensedAudioRepository } from "./microdrama-licensed-audio-fake-repository.js";
import {
  type MicrodramaLicensedAudioPort,
  type RecordLicensedAudioAssetInput,
} from "./microdrama-licensed-audio-port.js";
import {
  MICRODRAMA_LICENSED_AUDIO_SQLITE_MIGRATION,
  MICRODRAMA_LICENSED_AUDIO_SQLITE_MIGRATION_ID,
} from "./microdrama-licensed-audio-schema.js";

type SQLitePersistenceHost = {
  readonly database: DatabaseSync;
};

function parseAsset(row: { asset_json: string }): LicensedAudioAssetRecord {
  return licensedAudioAssetRecordSchema.parse(JSON.parse(row.asset_json));
}

export class MicrodramaLicensedAudioRepository implements MicrodramaLicensedAudioPort {
  private readonly fake = new FakeMicrodramaLicensedAudioRepository();

  public constructor(private readonly sqlite: SQLitePersistenceHost) {}

  public migrateLicensedAudio(): void {
    const database = this.sqlite.database;
    database.exec(MICRODRAMA_LICENSED_AUDIO_SQLITE_MIGRATION);
    const applied = database
      .prepare(
        "SELECT migration_id FROM microdrama_schema_migrations WHERE migration_id = ?"
      )
      .get(MICRODRAMA_LICENSED_AUDIO_SQLITE_MIGRATION_ID) as
      | { migration_id: string }
      | undefined;
    if (!applied) {
      database
        .prepare(
          "INSERT INTO microdrama_schema_migrations (migration_id, applied_at) VALUES (?, ?)"
        )
        .run(MICRODRAMA_LICENSED_AUDIO_SQLITE_MIGRATION_ID, new Date().toISOString());
    }
    this.fake.migrateLicensedAudio();
  }

  public recordLicensedAudioAsset(
    input: RecordLicensedAudioAssetInput
  ): LicensedAudioAssetRecord {
    const asset = this.fake.recordLicensedAudioAsset(input);
    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_licensed_audio_assets (
          asset_id, layer_kind, asset_hash, fingerprint, recorded_at, asset_json
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(asset_id) DO NOTHING`
      )
      .run(
        asset.assetId,
        asset.layerKind,
        asset.assetHash,
        asset.fingerprint,
        asset.recordedAt,
        JSON.stringify(asset)
      );
    return asset;
  }

  public getLicensedAudioAsset(assetId: string): LicensedAudioAssetRecord | null {
    const row = this.sqlite.database
      .prepare(
        "SELECT asset_json FROM microdrama_licensed_audio_assets WHERE asset_id = ?"
      )
      .get(assetId) as { asset_json: string } | undefined;
    if (row) {
      return parseAsset(row);
    }
    return this.fake.getLicensedAudioAsset(assetId);
  }

  public listLicensedAudioAssetsByLayerKind(
    layerKind: LicensedAudioAssetRecord["layerKind"]
  ): readonly LicensedAudioAssetRecord[] {
    const rows = this.sqlite.database
      .prepare(
        "SELECT asset_json FROM microdrama_licensed_audio_assets WHERE layer_kind = ? ORDER BY asset_id"
      )
      .all(layerKind) as Array<{ asset_json: string }>;
    if (rows.length > 0) {
      return rows.map(parseAsset);
    }
    return this.fake.listLicensedAudioAssetsByLayerKind(layerKind);
  }
}
