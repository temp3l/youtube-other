import { z } from "zod";

import {
  buildLicensedAudioMixDependencyIdentity,
  evaluateLicensedAudioProductionReadiness,
  fingerprintLicensedAudioLayerTracks,
  hashCanonicalDependency,
  type EpisodeTimelineRevision,
  type LicensedAudioAssetRecord,
  type LicensedAudioLayerTracks,
} from "@mediaforge/domain";

export const MICRODRAMA_LICENSED_AUDIO_MIX_SCHEMA_VERSION =
  "mediaforge.microdrama-licensed-audio-mix.v1" as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const licensedAudioMixLayerSchema = z
  .object({
    layerKind: z.enum(["ambience", "sfx", "music"]),
    entryId: z.string().min(1),
    assetId: z.string().min(1),
    assetPath: z.string().min(1),
    startSeconds: z.number().nonnegative(),
    endSeconds: z.number().positive(),
    gainDb: z.number().min(-60).max(12).optional(),
  })
  .strict();
export type LicensedAudioMixLayer = z.infer<typeof licensedAudioMixLayerSchema>;

export const licensedAudioMixManifestSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_LICENSED_AUDIO_MIX_SCHEMA_VERSION),
    timelineRevisionId: z.string().min(1),
    locale: z.string().min(1),
    narrationAudioPath: z.string().min(1),
    layers: z.array(licensedAudioMixLayerSchema),
    dependencyIdentity: z.record(z.string().min(1), sha256Schema),
    contentHash: sha256Schema,
  })
  .strict();
export type LicensedAudioMixManifest = z.infer<
  typeof licensedAudioMixManifestSchema
>;

function collectTrackEntries(
  tracks: LicensedAudioLayerTracks
): Array<{
  layerKind: LicensedAudioMixLayer["layerKind"];
  entry: LicensedAudioLayerTracks["ambience"][number];
}> {
  return [
    ...tracks.ambience.map((entry) => ({ layerKind: "ambience" as const, entry })),
    ...tracks.sfx.map((entry) => ({ layerKind: "sfx" as const, entry })),
    ...tracks.music.map((entry) => ({ layerKind: "music" as const, entry })),
  ];
}

export function compileLicensedAudioMixManifest(input: {
  readonly timeline: EpisodeTimelineRevision;
  readonly tracks: LicensedAudioLayerTracks;
  readonly assetsById: ReadonlyMap<string, LicensedAudioAssetRecord>;
  readonly assetPaths: Readonly<Record<string, string>>;
  readonly narrationAudioPath: string;
  readonly evaluatedAt: string;
  readonly territory: string;
}): LicensedAudioMixManifest {
  const readiness = evaluateLicensedAudioProductionReadiness({
    tracks: input.tracks,
    assetsById: input.assetsById,
    evaluatedAt: input.evaluatedAt,
    territory: input.territory,
  });
  if (!readiness.ready) {
    const blocker = readiness.blockers[0];
    throw new Error(
      blocker
        ? `Licensed audio mix blocked: ${blocker.code} ${blocker.message}`
        : "Licensed audio mix blocked by production readiness."
    );
  }

  const layers = collectTrackEntries(input.tracks).map(({ layerKind, entry }) => {
    const assetPath = input.assetPaths[entry.assetId];
    if (!assetPath) {
      throw new Error(`Missing asset path for licensed audio asset ${entry.assetId}`);
    }
    return licensedAudioMixLayerSchema.parse({
      layerKind,
      entryId: entry.entryId,
      assetId: entry.assetId,
      assetPath,
      startSeconds: Number((entry.startMs / 1_000).toFixed(3)),
      endSeconds: Number((entry.endMs / 1_000).toFixed(3)),
      ...(entry.gainDb !== undefined ? { gainDb: entry.gainDb } : {}),
    });
  });

  const dependencyIdentity = buildLicensedAudioMixDependencyIdentity({
    tracks: input.tracks,
    assetsById: input.assetsById,
  });
  const withoutHash = {
    schemaVersion: MICRODRAMA_LICENSED_AUDIO_MIX_SCHEMA_VERSION,
    timelineRevisionId: input.timeline.timelineRevisionId,
    locale: input.timeline.locale,
    narrationAudioPath: input.narrationAudioPath,
    layers,
    dependencyIdentity,
  };
  const contentHash = hashCanonicalDependency(withoutHash);
  return licensedAudioMixManifestSchema.parse({
    ...withoutHash,
    contentHash,
  });
}

export function compileLicensedAudioMixToFfmpegFilter(
  manifest: LicensedAudioMixManifest
): string {
  const parsed = licensedAudioMixManifestSchema.parse(manifest);
  const inputs = [
    `[1:a]volume=1.0[narration]`,
    ...parsed.layers.map((layer, index) => {
      const inputLabel = `${index + 2}:a`;
      const outputLabel = `layer${index}`;
      const gain = layer.gainDb ?? 0;
      const delayMs = Math.round(layer.startSeconds * 1_000);
      const durationMs = Math.round((layer.endSeconds - layer.startSeconds) * 1_000);
      return `[${inputLabel}]atrim=0:${(durationMs / 1_000).toFixed(3)},adelay=${delayMs}|${delayMs},volume=${Math.pow(10, gain / 20).toFixed(4)}[${outputLabel}]`;
    }),
  ];
  const mixInputs = ["[narration]", ...parsed.layers.map((_, index) => `[layer${index}]`)];
  return `${inputs.join(";")};${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=longest:dropout_transition=0[aout]`;
}

export function licensedAudioMixCacheDependency(input: {
  readonly tracks: LicensedAudioLayerTracks;
  readonly assetsById: ReadonlyMap<string, LicensedAudioAssetRecord>;
}): Record<string, string> {
  return {
    licensedAudioTracks: fingerprintLicensedAudioLayerTracks(input.tracks),
    ...buildLicensedAudioMixDependencyIdentity(input),
  };
}
