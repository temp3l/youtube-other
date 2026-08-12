import {
  buildLocaleShotTimingProjection,
  validateLocaleShotTimingProjection,
} from "@mediaforge/alignment";
import {
  buildEpisodeTimelineRevisionFingerprint,
  episodeTimelineRevisionSchema,
  fingerprintSelectedAudioTimingDependency,
  hashCanonicalDependency,
  type EpisodeTimelineRevision,
  type LocaleSubtitleProjection,
  type LocalizedSignalUiProjection,
  type SelectedAudioTimingDependency,
} from "@mediaforge/domain";
import { composeLocaleVideoShotTrack } from "@mediaforge/visual-planning";

import type { LocaleTtsSegmentationBundle } from "./locale-tts-segmentation.js";
import {
  projectLocaleTimingOverSemanticPlan,
  type V5SceneShotPlanRecord,
} from "./v5-scene-shot-compiler.js";

export const LOCALE_COMPOSITION_SCHEMA_VERSION =
  "mediaforge.microdrama.locale-composition.v1" as const;

export type CompileLocaleEpisodeTimelineInput = {
  readonly plan: V5SceneShotPlanRecord;
  readonly ttsBundle: LocaleTtsSegmentationBundle;
  readonly timingDependency: SelectedAudioTimingDependency;
  readonly subtitleProjection: LocaleSubtitleProjection;
  readonly signalUiProjection?: LocalizedSignalUiProjection;
  readonly sharedVisualDependencyHashes: Readonly<Record<string, string>>;
};

function timelineRevisionIdFor(input: {
  readonly episodeId: string;
  readonly locale: string;
  readonly sceneShotPlanRevisionId: string;
  readonly alignmentRevisionId: string;
}): string {
  return `rev.timeline.${input.episodeId.toLowerCase()}.${input.locale.toLowerCase()}.${input.sceneShotPlanRevisionId}.${input.alignmentRevisionId}`;
}

export function compileLocaleEpisodeTimeline(
  input: CompileLocaleEpisodeTimelineInput,
): EpisodeTimelineRevision {
  const { plan, ttsBundle, timingDependency } = input;
  if (ttsBundle.locale !== timingDependency.locale) {
    throw new Error("TTS bundle locale does not match timing dependency locale.");
  }
  if (ttsBundle.timingContract.locale !== timingDependency.locale) {
    throw new Error("TTS timing contract locale does not match timing dependency locale.");
  }

  const projectedTiming = projectLocaleTimingOverSemanticPlan({
    plan,
    measuredDurationMs: timingDependency.totalDurationMs,
  });
  const semanticShotOrder = plan.shots.map((shot) => ({
    shotSemanticId: shot.shotSemanticId,
    sceneSemanticId: shot.sceneSemanticId,
    sourcePlateSemanticId: shot.sourcePlateSemanticId,
    order: shot.order,
  }));
  const shotTimingProjection = buildLocaleShotTimingProjection({
    semanticShotOrder,
    projectedTiming,
  });
  const validationIssues = validateLocaleShotTimingProjection({
    semanticShotOrder,
    shotTiming: shotTimingProjection.shotTiming,
    measuredDurationMs: shotTimingProjection.measuredDurationMs,
  });
  if (validationIssues.length > 0) {
    throw new Error(
      validationIssues.map((issue) => issue.message).join("; "),
    );
  }

  const videoShotTrack = composeLocaleVideoShotTrack(shotTimingProjection.shotTiming);
  const timingDependencyFingerprint =
    fingerprintSelectedAudioTimingDependency(timingDependency);
  const dependencyIdentity: Record<string, string> = {
    sceneShotPlanRevision: hashCanonicalDependency({
      revisionId: plan.shotPlanRevisionId,
    }),
    selectedAudioTiming: timingDependencyFingerprint,
    subtitleProjection: input.subtitleProjection.fingerprint,
    ...Object.fromEntries(
      Object.entries(input.sharedVisualDependencyHashes).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  };
  if (input.signalUiProjection) {
    dependencyIdentity.signalUiProjection = input.signalUiProjection.fingerprint;
  }

  const tracks = {
    videoShots: videoShotTrack.entries,
    subtitles: {
      alignmentRevisionId: input.subtitleProjection.alignmentRevisionId,
      fingerprint: input.subtitleProjection.fingerprint,
    },
    ...(input.signalUiProjection
      ? {
          signalUi: {
            stateId: input.signalUiProjection.stateId,
            fingerprint: input.signalUiProjection.fingerprint,
          },
        }
      : {}),
  };
  const timelineRevisionId = timelineRevisionIdFor({
    episodeId: plan.episodeId,
    locale: timingDependency.locale,
    sceneShotPlanRevisionId: plan.shotPlanRevisionId,
    alignmentRevisionId: ttsBundle.timingContract.alignmentRevisionId,
  });
  const fingerprint = buildEpisodeTimelineRevisionFingerprint({
    timelineRevisionId,
    episodeId: plan.episodeId,
    locale: timingDependency.locale,
    sceneShotPlanRevisionId: plan.shotPlanRevisionId,
    alignmentRevisionId: ttsBundle.timingContract.alignmentRevisionId,
    authoritySource: timingDependency.authoritySource,
    totalDurationMs: timingDependency.totalDurationMs,
    shotTiming: shotTimingProjection.shotTiming,
    tracks,
    dependencyIdentity,
  });

  return episodeTimelineRevisionSchema.parse({
    schemaVersion: "mediaforge.episode-timeline.v1",
    timelineRevisionId,
    episodeId: plan.episodeId,
    locale: timingDependency.locale,
    sceneShotPlanRevisionId: plan.shotPlanRevisionId,
    alignmentRevisionId: ttsBundle.timingContract.alignmentRevisionId,
    authoritySource: timingDependency.authoritySource,
    totalDurationMs: timingDependency.totalDurationMs,
    shotTiming: shotTimingProjection.shotTiming,
    tracks,
    dependencyIdentity,
    fingerprint,
  });
}
