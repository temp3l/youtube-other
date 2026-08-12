import { z } from "zod";

import { licensedAudioLayerTracksSchema } from "./microdrama-licensed-audio-contracts.js";
import { hashCanonicalDependency } from "./selected-audio-timing-dependency.js";
import { signalUiBcp47LocaleSchema } from "./signal-ui-contracts.js";

export const EPISODE_TIMELINE_SCHEMA_VERSION =
  "mediaforge.episode-timeline.v1" as const;

const sha256Pattern = /^[a-f0-9]{64}$/u;

export const localeShotTimingEntrySchema = z
  .object({
    shotSemanticId: z.string().min(1).max(200),
    sceneSemanticId: z.string().min(1).max(200),
    sourcePlateSemanticId: z.string().min(1).max(200),
    order: z.number().int().positive(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    durationMs: z.number().int().positive(),
  })
  .strict()
  .refine((value) => value.endMs > value.startMs, {
    message: "endMs must be > startMs",
  })
  .refine((value) => value.durationMs === value.endMs - value.startMs, {
    message: "durationMs must equal endMs - startMs",
  });
export type LocaleShotTimingEntry = z.infer<typeof localeShotTimingEntrySchema>;

export const episodeTimelineVideoShotTrackEntrySchema = z
  .object({
    shotSemanticId: z.string().min(1).max(200),
    sourcePlateSemanticId: z.string().min(1).max(200),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    durationMs: z.number().int().positive(),
  })
  .strict();
export type EpisodeTimelineVideoShotTrackEntry = z.infer<
  typeof episodeTimelineVideoShotTrackEntrySchema
>;

export const episodeTimelineSubtitleTrackSchema = z
  .object({
    alignmentRevisionId: z.string().min(1).max(200),
    fingerprint: z.string().regex(sha256Pattern),
  })
  .strict();
export type EpisodeTimelineSubtitleTrack = z.infer<
  typeof episodeTimelineSubtitleTrackSchema
>;

export const episodeTimelineSignalUiTrackSchema = z
  .object({
    stateId: z.string().min(1).max(200),
    fingerprint: z.string().regex(sha256Pattern),
  })
  .strict();
export type EpisodeTimelineSignalUiTrack = z.infer<
  typeof episodeTimelineSignalUiTrackSchema
>;

export const episodeTimelineTracksSchema = z
  .object({
    videoShots: z.array(episodeTimelineVideoShotTrackEntrySchema).min(1),
    subtitles: episodeTimelineSubtitleTrackSchema,
    signalUi: episodeTimelineSignalUiTrackSchema.optional(),
    licensedAudio: licensedAudioLayerTracksSchema.optional(),
  })
  .strict();
export type EpisodeTimelineTracks = z.infer<typeof episodeTimelineTracksSchema>;

export const episodeTimelineRevisionSchema = z
  .object({
    schemaVersion: z.literal(EPISODE_TIMELINE_SCHEMA_VERSION),
    timelineRevisionId: z.string().min(1).max(200),
    episodeId: z.string().regex(/^E\d{3}$/u),
    locale: signalUiBcp47LocaleSchema,
    sceneShotPlanRevisionId: z.string().min(1).max(200),
    alignmentRevisionId: z.string().min(1).max(200),
    authoritySource: z.enum(["selected_audio", "lexical_estimate"]),
    totalDurationMs: z.number().int().positive(),
    shotTiming: z.array(localeShotTimingEntrySchema).min(1),
    tracks: episodeTimelineTracksSchema,
    dependencyIdentity: z.record(z.string().min(1), z.string().regex(sha256Pattern)),
    fingerprint: z.string().regex(sha256Pattern),
  })
  .strict();
export type EpisodeTimelineRevision = z.infer<
  typeof episodeTimelineRevisionSchema
>;

export function buildEpisodeTimelineRevisionFingerprint(input: {
  readonly timelineRevisionId: string;
  readonly episodeId: string;
  readonly locale: EpisodeTimelineRevision["locale"];
  readonly sceneShotPlanRevisionId: string;
  readonly alignmentRevisionId: string;
  readonly authoritySource: EpisodeTimelineRevision["authoritySource"];
  readonly totalDurationMs: number;
  readonly shotTiming: readonly LocaleShotTimingEntry[];
  readonly tracks: EpisodeTimelineTracks;
  readonly dependencyIdentity: Readonly<Record<string, string>>;
}): string {
  return hashCanonicalDependency({
    schemaVersion: EPISODE_TIMELINE_SCHEMA_VERSION,
    timelineRevisionId: input.timelineRevisionId,
    episodeId: input.episodeId,
    locale: input.locale,
    sceneShotPlanRevisionId: input.sceneShotPlanRevisionId,
    alignmentRevisionId: input.alignmentRevisionId,
    authoritySource: input.authoritySource,
    totalDurationMs: input.totalDurationMs,
    shotTiming: input.shotTiming.map((entry) => ({
      shotSemanticId: entry.shotSemanticId,
      startMs: entry.startMs,
      endMs: entry.endMs,
    })),
    tracks: input.tracks,
    dependencyIdentity: Object.fromEntries(
      Object.entries(input.dependencyIdentity).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  });
}
