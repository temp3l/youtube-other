import { createHash } from "node:crypto";

import { hashCanonicalDependency } from "./selected-audio-timing-dependency.js";
import {
  GENERATED_MUSIC_PROVIDER_IDS,
  MICRODRAMA_LICENSED_AUDIO_SCHEMA_VERSION,
  type LicensedAudioAssetRecord,
  type LicensedAudioLayerKind,
  type LicensedAudioLayerTrackEntry,
  type LicensedAudioLayerTracks,
  type LicensedAudioProductionBlocker,
  type LicensedAudioProductionReadiness,
  type LicensedAudioRightsFailureCode,
  licensedAudioAssetRecordSchema,
  licensedAudioLayerTracksSchema,
  licensedAudioProductionReadinessSchema,
} from "./microdrama-licensed-audio-contracts.js";

export type LicensedAudioMixChangeFacet =
  | "asset_rights"
  | "asset_provenance"
  | "track_timing"
  | "track_selection";

const INVALIDATION_BY_FACET: Readonly<
  Record<LicensedAudioMixChangeFacet, readonly string[]>
> = {
  asset_rights: ["mix.rights", "mix.readiness", "render.audio_mix"],
  asset_provenance: ["mix.provenance", "mix.readiness", "render.audio_mix"],
  track_timing: ["mix.timeline", "render.audio_mix"],
  track_selection: ["mix.selection", "mix.readiness", "render.audio_mix"],
};

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Licensed audio record cannot contain a non-finite number.");
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("Licensed audio record contains an unsupported value.");
}

export function computeLicensedAudioAssetFingerprint(input: {
  readonly assetId: string;
  readonly layerKind: LicensedAudioLayerKind;
  readonly assetHash: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly storageUri: string;
  readonly provenance: LicensedAudioAssetRecord["provenance"];
  readonly rights: LicensedAudioAssetRecord["rights"];
  readonly recordedAt: string;
}): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        assetId: input.assetId,
        layerKind: input.layerKind,
        assetHash: input.assetHash,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        storageUri: input.storageUri,
        provenance: input.provenance,
        rights: input.rights,
        recordedAt: input.recordedAt,
      }),
      "utf8"
    )
    .digest("hex");
}

export function planLicensedAudioAssetRecord(input: {
  readonly assetId: string;
  readonly layerKind: LicensedAudioLayerKind;
  readonly assetHash: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly storageUri: string;
  readonly provenance: LicensedAudioAssetRecord["provenance"];
  readonly rights: LicensedAudioAssetRecord["rights"];
  readonly recordedAt: string;
}): LicensedAudioAssetRecord {
  const fingerprint = computeLicensedAudioAssetFingerprint(input);
  return licensedAudioAssetRecordSchema.parse({
    schemaVersion: MICRODRAMA_LICENSED_AUDIO_SCHEMA_VERSION,
    ...input,
    fingerprint,
  });
}

export function assertLicensedAudioImportOnly(input: {
  readonly provider?: string;
  readonly layerKind: LicensedAudioLayerKind;
}): void {
  if (!input.provider) {
    return;
  }
  const normalized = input.provider.trim().toLowerCase();
  if (
    input.layerKind === "music" &&
    (GENERATED_MUSIC_PROVIDER_IDS as readonly string[]).includes(normalized)
  ) {
    throw new Error(
      `Generated music provider "${input.provider}" is unsupported without a future architecture amendment.`
    );
  }
}

function rightsFailure(
  code: LicensedAudioRightsFailureCode,
  message: string,
  assetId?: string,
  entryId?: string
): LicensedAudioProductionBlocker {
  return {
    code,
    message,
    ...(assetId ? { assetId } : {}),
    ...(entryId ? { entryId } : {}),
  };
}

export function evaluateLicensedAudioRightsAt(input: {
  readonly asset: LicensedAudioAssetRecord;
  readonly evaluatedAt: string;
  readonly territory: string;
}):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: LicensedAudioRightsFailureCode;
      readonly message: string;
    } {
  const evaluatedAtMs = Date.parse(input.evaluatedAt);
  const { rights } = input.asset;

  if (!rights.approvedAt || !rights.approvedBy.trim()) {
    return {
      ok: false,
      code: "MISSING_APPROVAL",
      message: `Licensed audio asset ${input.asset.assetId} lacks approval evidence.`,
    };
  }
  if (Date.parse(rights.approvedAt) > evaluatedAtMs) {
    return {
      ok: false,
      code: "MISSING_APPROVAL",
      message: `Licensed audio asset ${input.asset.assetId} approval is not yet effective.`,
    };
  }
  if (
    rights.termStartAt &&
    Date.parse(rights.termStartAt) > evaluatedAtMs
  ) {
    return {
      ok: false,
      code: "RIGHTS_NOT_STARTED",
      message: `Licensed audio asset ${input.asset.assetId} rights are not yet effective.`,
    };
  }
  if (rights.expiresAt && Date.parse(rights.expiresAt) <= evaluatedAtMs) {
    return {
      ok: false,
      code: "RIGHTS_EXPIRED",
      message: `Licensed audio asset ${input.asset.assetId} rights have expired.`,
    };
  }
  const territory = input.territory.trim().toUpperCase();
  const permitted = rights.permittedTerritories.map((value) => value.toUpperCase());
  if (!permitted.includes("WW") && !permitted.includes(territory)) {
    return {
      ok: false,
      code: "TERRITORY_NOT_PERMITTED",
      message: `Licensed audio asset ${input.asset.assetId} is not cleared for territory ${input.territory}.`,
    };
  }
  return { ok: true };
}

function evaluateTrackEntry(input: {
  readonly entry: LicensedAudioLayerTrackEntry;
  readonly expectedLayerKind: LicensedAudioLayerKind;
  readonly assetsById: ReadonlyMap<string, LicensedAudioAssetRecord>;
  readonly evaluatedAt: string;
  readonly territory: string;
}): LicensedAudioProductionBlocker[] {
  const asset = input.assetsById.get(input.entry.assetId);
  if (!asset) {
    return [
      rightsFailure(
        "MISSING_ASSET",
        `Licensed audio track ${input.entry.entryId} references missing asset ${input.entry.assetId}.`,
        input.entry.assetId,
        input.entry.entryId
      ),
    ];
  }
  if (asset.fingerprint !== input.entry.assetFingerprint) {
    return [
      rightsFailure(
        "ASSET_FINGERPRINT_MISMATCH",
        `Licensed audio track ${input.entry.entryId} fingerprint does not match asset ${input.entry.assetId}.`,
        input.entry.assetId,
        input.entry.entryId
      ),
    ];
  }
  if (asset.layerKind !== input.expectedLayerKind) {
    return [
      rightsFailure(
        "LAYER_KIND_MISMATCH",
        `Licensed audio asset ${input.entry.assetId} is registered for ${asset.layerKind}, not ${input.expectedLayerKind}.`,
        input.entry.assetId,
        input.entry.entryId
      ),
    ];
  }
  const rights = evaluateLicensedAudioRightsAt({
    asset,
    evaluatedAt: input.evaluatedAt,
    territory: input.territory,
  });
  if (!rights.ok) {
    return [
      rightsFailure(
        rights.code,
        rights.message,
        input.entry.assetId,
        input.entry.entryId
      ),
    ];
  }
  return [];
}

export function evaluateLicensedAudioProductionReadiness(input: {
  readonly tracks: LicensedAudioLayerTracks;
  readonly assetsById: ReadonlyMap<string, LicensedAudioAssetRecord>;
  readonly evaluatedAt: string;
  readonly territory: string;
}): LicensedAudioProductionReadiness {
  const parsedTracks = licensedAudioLayerTracksSchema.parse(input.tracks);
  const blockers: LicensedAudioProductionBlocker[] = [];

  for (const entry of parsedTracks.ambience) {
    blockers.push(
      ...evaluateTrackEntry({
        entry,
        expectedLayerKind: "ambience",
        assetsById: input.assetsById,
        evaluatedAt: input.evaluatedAt,
        territory: input.territory,
      })
    );
  }
  for (const entry of parsedTracks.sfx) {
    blockers.push(
      ...evaluateTrackEntry({
        entry,
        expectedLayerKind: "sfx",
        assetsById: input.assetsById,
        evaluatedAt: input.evaluatedAt,
        territory: input.territory,
      })
    );
  }
  for (const entry of parsedTracks.music) {
    blockers.push(
      ...evaluateTrackEntry({
        entry,
        expectedLayerKind: "music",
        assetsById: input.assetsById,
        evaluatedAt: input.evaluatedAt,
        territory: input.territory,
      })
    );
  }

  return licensedAudioProductionReadinessSchema.parse({
    ready: blockers.length === 0,
    blockers,
  });
}

export function fingerprintLicensedAudioLayerTracks(
  tracks: LicensedAudioLayerTracks
): string {
  const parsed = licensedAudioLayerTracksSchema.parse(tracks);
  return hashCanonicalDependency({
    ambience: parsed.ambience.map((entry) => ({
      entryId: entry.entryId,
      assetId: entry.assetId,
      assetFingerprint: entry.assetFingerprint,
      startMs: entry.startMs,
      endMs: entry.endMs,
      gainDb: entry.gainDb,
      fadeInMs: entry.fadeInMs,
      fadeOutMs: entry.fadeOutMs,
    })),
    sfx: parsed.sfx.map((entry) => ({
      entryId: entry.entryId,
      assetId: entry.assetId,
      assetFingerprint: entry.assetFingerprint,
      startMs: entry.startMs,
      endMs: entry.endMs,
      gainDb: entry.gainDb,
      fadeInMs: entry.fadeInMs,
      fadeOutMs: entry.fadeOutMs,
    })),
    music: parsed.music.map((entry) => ({
      entryId: entry.entryId,
      assetId: entry.assetId,
      assetFingerprint: entry.assetFingerprint,
      startMs: entry.startMs,
      endMs: entry.endMs,
      gainDb: entry.gainDb,
      fadeInMs: entry.fadeInMs,
      fadeOutMs: entry.fadeOutMs,
    })),
  });
}

export function licensedAudioMixDependenciesInvalidatedBy(
  facet: LicensedAudioMixChangeFacet
): readonly string[] {
  return INVALIDATION_BY_FACET[facet];
}

export function buildLicensedAudioMixDependencyIdentity(input: {
  readonly tracks: LicensedAudioLayerTracks;
  readonly assetsById: ReadonlyMap<string, LicensedAudioAssetRecord>;
}): Record<string, string> {
  const trackFingerprint = fingerprintLicensedAudioLayerTracks(input.tracks);
  const assetFingerprints = Object.fromEntries(
    [...new Set(
      [
        ...input.tracks.ambience,
        ...input.tracks.sfx,
        ...input.tracks.music,
      ].map((entry) => entry.assetId)
    )]
      .sort()
      .map((assetId) => {
        const asset = input.assetsById.get(assetId);
        if (!asset) {
          throw new Error(`Missing licensed audio asset ${assetId} for mix identity.`);
        }
        return [assetId, asset.fingerprint] as const;
      })
  );
  return {
    licensedAudioTracks: trackFingerprint,
    ...assetFingerprints,
  };
}
