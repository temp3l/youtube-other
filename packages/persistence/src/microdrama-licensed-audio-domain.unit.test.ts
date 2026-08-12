import { describe, expect, it } from "vitest";

import { planLicensedAudioAssetRecord } from "@mediaforge/domain";

import { FakeMicrodramaLicensedAudioRepository } from "./microdrama-licensed-audio-fake-repository.js";
import { MicrodramaLicensedAudioConflictError } from "./microdrama-licensed-audio-port.js";

const APPROVAL_HASH = "d".repeat(64);

function sampleAsset(assetId = "asset.sfx.phone-buzz") {
  return planLicensedAudioAssetRecord({
    assetId,
    layerKind: "sfx",
    assetHash: "e".repeat(64),
    mimeType: "audio/wav",
    byteSize: 2_048,
    storageUri: "file:///fixtures/audio/phone-buzz.wav",
    provenance: {
      sourceKind: "imported-file",
      importReference: "imports/phone-buzz.wav",
      importedAt: "2026-08-01T10:00:00.000Z",
      importedBy: "operator.audio",
    },
    rights: {
      status: "creator-owned",
      licenseReference: "creator.library.phone-buzz",
      rightsHolders: ["Series Audio Library"],
      permittedTerritories: ["WW"],
      commercialUse: true,
      approvalEvidenceHash: APPROVAL_HASH,
      approvedAt: "2026-08-01T11:00:00.000Z",
      approvedBy: "rights.reviewer",
    },
    recordedAt: "2026-08-01T12:00:00.000Z",
  });
}

describe("microdrama licensed audio persistence", () => {
  it("persists imported assets with immutable provenance and rights evidence", () => {
    const repository = new FakeMicrodramaLicensedAudioRepository();
    repository.migrateLicensedAudio();

    const asset = sampleAsset();
    repository.recordLicensedAudioAsset({ asset });

    expect(repository.getLicensedAudioAsset(asset.assetId)).toEqual(asset);
    expect(repository.listLicensedAudioAssetsByLayerKind("sfx")).toEqual([asset]);
    expect(repository.listLicensedAudioAssetsByLayerKind("music")).toEqual([]);
  });

  it("rejects conflicting asset fingerprints for the same asset id", () => {
    const repository = new FakeMicrodramaLicensedAudioRepository();
    repository.migrateLicensedAudio();

    const asset = sampleAsset();
    const mutated = planLicensedAudioAssetRecord({
      ...asset,
      rights: {
        ...asset.rights,
        expiresAt: "2027-01-01T00:00:00.000Z",
      },
      recordedAt: "2026-08-02T12:00:00.000Z",
    });

    repository.recordLicensedAudioAsset({ asset });
    expect(() =>
      repository.recordLicensedAudioAsset({ asset: mutated })
    ).toThrow(MicrodramaLicensedAudioConflictError);
  });
});
