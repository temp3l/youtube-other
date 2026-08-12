import { z } from "zod";

import {
  episodeTimelineVideoShotTrackEntrySchema,
  type EpisodeTimelineVideoShotTrackEntry,
  type LocaleShotTimingEntry,
} from "@mediaforge/domain";

export const LOCALE_VIDEO_SHOT_TRACK_SCHEMA_VERSION =
  "mediaforge.visual-planning.locale-video-shot-track.v1" as const;

export const localeVideoShotTrackSchema = z
  .object({
    schemaVersion: z.literal(LOCALE_VIDEO_SHOT_TRACK_SCHEMA_VERSION),
    entries: z.array(episodeTimelineVideoShotTrackEntrySchema).min(1),
  })
  .strict();
export type LocaleVideoShotTrack = z.infer<typeof localeVideoShotTrackSchema>;

export function composeLocaleVideoShotTrack(
  shotTiming: readonly LocaleShotTimingEntry[],
): LocaleVideoShotTrack {
  const ordered = [...shotTiming].sort((left, right) => left.order - right.order);
  const entries: EpisodeTimelineVideoShotTrackEntry[] = ordered.map((entry) =>
    episodeTimelineVideoShotTrackEntrySchema.parse({
      shotSemanticId: entry.shotSemanticId,
      sourcePlateSemanticId: entry.sourcePlateSemanticId,
      startMs: entry.startMs,
      endMs: entry.endMs,
      durationMs: entry.durationMs,
    }),
  );
  return localeVideoShotTrackSchema.parse({
    schemaVersion: LOCALE_VIDEO_SHOT_TRACK_SCHEMA_VERSION,
    entries,
  });
}
