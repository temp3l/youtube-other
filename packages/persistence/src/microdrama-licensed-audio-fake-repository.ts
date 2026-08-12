import {
  computeLicensedAudioAssetFingerprint,
  licensedAudioAssetRecordSchema,
  type LicensedAudioAssetRecord,
} from "@mediaforge/domain";

import {
  type MicrodramaLicensedAudioPort,
  type RecordLicensedAudioAssetInput,
  MicrodramaLicensedAudioConflictError,
} from "./microdrama-licensed-audio-port.js";

function assetFingerprint(asset: LicensedAudioAssetRecord): string {
  return computeLicensedAudioAssetFingerprint({
    assetId: asset.assetId,
    layerKind: asset.layerKind,
    assetHash: asset.assetHash,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
    storageUri: asset.storageUri,
    provenance: asset.provenance,
    rights: asset.rights,
    recordedAt: asset.recordedAt,
  });
}

export class FakeMicrodramaLicensedAudioRepository
  implements MicrodramaLicensedAudioPort
{
  private readonly assetsById = new Map<string, LicensedAudioAssetRecord>();

  public migrateLicensedAudio(): void {}

  public recordLicensedAudioAsset(
    input: RecordLicensedAudioAssetInput
  ): LicensedAudioAssetRecord {
    const asset = licensedAudioAssetRecordSchema.parse(input.asset);
    const expectedFingerprint = assetFingerprint(asset);
    if (asset.fingerprint !== expectedFingerprint) {
      throw new MicrodramaLicensedAudioConflictError(
        `Licensed audio asset ${asset.assetId} fingerprint does not match canonical content.`
      );
    }
    const existing = this.assetsById.get(asset.assetId);
    if (existing && existing.fingerprint !== asset.fingerprint) {
      throw new MicrodramaLicensedAudioConflictError(
        `Licensed audio asset ${asset.assetId} already exists with a different fingerprint.`
      );
    }
    this.assetsById.set(asset.assetId, asset);
    return asset;
  }

  public getLicensedAudioAsset(assetId: string): LicensedAudioAssetRecord | null {
    return this.assetsById.get(assetId) ?? null;
  }

  public listLicensedAudioAssetsByLayerKind(
    layerKind: LicensedAudioAssetRecord["layerKind"]
  ): readonly LicensedAudioAssetRecord[] {
    return [...this.assetsById.values()].filter(
      (asset) => asset.layerKind === layerKind
    );
  }
}
