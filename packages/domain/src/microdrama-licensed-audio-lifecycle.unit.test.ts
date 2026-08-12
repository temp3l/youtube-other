import { describe, expect, it } from "vitest";

import {
  buildLicensedAudioMixDependencyIdentity,
  evaluateLicensedAudioProductionReadiness,
  evaluateLicensedAudioRightsAt,
  fingerprintLicensedAudioLayerTracks,
  licensedAudioMixDependenciesInvalidatedBy,
  planLicensedAudioAssetRecord,
  assertLicensedAudioImportOnly,
} from "./microdrama-licensed-audio-lifecycle.js";
import type {
  LicensedAudioAssetRecord,
  LicensedAudioLayerTracks,
} from "./microdrama-licensed-audio-contracts.js";

const EVALUATED_AT = "2026-08-12T12:00:00.000Z";
const APPROVAL_HASH = "a".repeat(64);

function baseAsset(
  overrides: Partial<LicensedAudioAssetRecord> = {}
): LicensedAudioAssetRecord {
  return planLicensedAudioAssetRecord({
    assetId: "asset.ambience.city-night",
    layerKind: "ambience",
    assetHash: "b".repeat(64),
    mimeType: "audio/wav",
    byteSize: 4_096,
    storageUri: "file:///fixtures/audio/city-night.wav",
    provenance: {
      sourceKind: "stock-library",
      importReference: "library.track.city-night-001",
      importedAt: "2026-08-01T10:00:00.000Z",
      importedBy: "operator.audio",
      originalFilename: "city-night.wav",
    },
    rights: {
      status: "licensed",
      licenseReference: "license.stock.city-night.2026",
      rightsHolders: ["Example Audio Library"],
      permittedTerritories: ["WW"],
      commercialUse: true,
      expiresAt: "2027-08-01T00:00:00.000Z",
      approvalEvidenceHash: APPROVAL_HASH,
      approvedAt: "2026-08-01T11:00:00.000Z",
      approvedBy: "rights.reviewer",
    },
    recordedAt: "2026-08-01T12:00:00.000Z",
    ...overrides,
  });
}

function sampleTracks(asset: LicensedAudioAssetRecord): LicensedAudioLayerTracks {
  return {
    ambience: [
      {
        entryId: "track.ambience.main",
        assetId: asset.assetId,
        assetFingerprint: asset.fingerprint,
        startMs: 0,
        endMs: 61_250,
        gainDb: -12,
      },
    ],
    sfx: [],
    music: [],
  };
}

describe("microdrama licensed audio lifecycle", () => {
  it("rejects generated music providers without an architecture amendment", () => {
    expect(() =>
      assertLicensedAudioImportOnly({ provider: "suno", layerKind: "music" })
    ).toThrow(/unsupported without a future architecture amendment/u);
    expect(() =>
      assertLicensedAudioImportOnly({ provider: "openai", layerKind: "music" })
    ).not.toThrow();
  });

  it("blocks production readiness when rights have expired", () => {
    const asset = baseAsset({
      rights: {
        ...baseAsset().rights,
        expiresAt: "2026-08-01T00:00:00.000Z",
      },
    });
    const rights = evaluateLicensedAudioRightsAt({
      asset,
      evaluatedAt: EVALUATED_AT,
      territory: "US",
    });
    expect(rights.ok).toBe(false);
    if (!rights.ok) {
      expect(rights.code).toBe("RIGHTS_EXPIRED");
    }

    const readiness = evaluateLicensedAudioProductionReadiness({
      tracks: sampleTracks(asset),
      assetsById: new Map([[asset.assetId, asset]]),
      evaluatedAt: EVALUATED_AT,
      territory: "US",
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.some((blocker) => blocker.code === "RIGHTS_EXPIRED")).toBe(
      true
    );
  });

  it("invalidates mix dependencies when rights or track selection changes", () => {
    const asset = baseAsset();
    const tracks = sampleTracks(asset);
    const baseFingerprint = fingerprintLicensedAudioLayerTracks(tracks);
    const changedTiming = fingerprintLicensedAudioLayerTracks({
      ...tracks,
      ambience: [
        {
          ...tracks.ambience[0]!,
          endMs: 60_000,
        },
      ],
    });

    expect(baseFingerprint).not.toBe(changedTiming);
    expect(licensedAudioMixDependenciesInvalidatedBy("asset_rights")).toContain(
      "mix.rights"
    );
    expect(licensedAudioMixDependenciesInvalidatedBy("track_timing")).toContain(
      "mix.timeline"
    );
    expect(licensedAudioMixDependenciesInvalidatedBy("track_selection")).toContain(
      "render.audio_mix"
    );

    const dependencyIdentity = buildLicensedAudioMixDependencyIdentity({
      tracks,
      assetsById: new Map([[asset.assetId, asset]]),
    });
    expect(dependencyIdentity.licensedAudioTracks).toBe(baseFingerprint);
    expect(dependencyIdentity[asset.assetId]).toBe(asset.fingerprint);
  });
});
