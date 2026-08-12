import type { LicensedAudioAssetRecord } from "@mediaforge/domain";

export class MicrodramaLicensedAudioConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MicrodramaLicensedAudioConflictError";
  }
}

export type RecordLicensedAudioAssetInput = {
  readonly asset: LicensedAudioAssetRecord;
};

export interface MicrodramaLicensedAudioPort {
  migrateLicensedAudio(): void;
  recordLicensedAudioAsset(
    input: RecordLicensedAudioAssetInput
  ): LicensedAudioAssetRecord;
  getLicensedAudioAsset(assetId: string): LicensedAudioAssetRecord | null;
  listLicensedAudioAssetsByLayerKind(
    layerKind: LicensedAudioAssetRecord["layerKind"]
  ): readonly LicensedAudioAssetRecord[];
}
