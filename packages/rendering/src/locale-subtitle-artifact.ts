import {
  buildLocaleSubtitleProjectionFingerprint,
  fingerprintSelectedAudioTimingDependency,
  localeSubtitleArtifactSchema,
  localeSubtitleProjectionSchema,
  type LocaleSubtitleArtifact,
  type LocaleSubtitleProjection,
} from "@mediaforge/domain";
import { buildAss, buildSrt, buildVtt } from "@mediaforge/shared";

import {
  compileLocaleSubtitleCaptionPlan,
  type CompileLocaleSubtitleProjectionInput,
} from "@mediaforge/alignment";

export const LOCALE_SUBTITLE_RENDERING_SCHEMA_VERSION =
  "mediaforge.rendering.locale-subtitle.v1" as const;

export function compileLocaleSubtitleProjection(
  input: CompileLocaleSubtitleProjectionInput,
): LocaleSubtitleProjection {
  const captionPlan = compileLocaleSubtitleCaptionPlan(input);
  const timingDependency = input.timingDependency;
  const fingerprint = buildLocaleSubtitleProjectionFingerprint({
    locale: input.locale,
    alignmentRevisionId: input.alignment.alignmentRevisionId,
    captionPlan,
    timingDependency,
  });
  return localeSubtitleProjectionSchema.parse({
    schemaVersion: "mediaforge.locale-subtitle-projection.v1",
    locale: input.locale,
    alignmentRevisionId: input.alignment.alignmentRevisionId,
    captionPlan,
    timingDependency,
    fingerprint,
  });
}

export function compileLocaleSubtitleArtifact(
  projection: LocaleSubtitleProjection,
): LocaleSubtitleArtifact {
  const parsed = localeSubtitleProjectionSchema.parse(projection);
  const entries = parsed.captionPlan.segments.map((segment) => ({
    startSeconds: segment.startMs / 1_000,
    endSeconds: segment.endMs / 1_000,
    text: segment.lines.join("\n"),
  }));
  const timingDependencyFingerprint = fingerprintSelectedAudioTimingDependency(
    parsed.timingDependency,
  );
  return localeSubtitleArtifactSchema.parse({
    schemaVersion: "mediaforge.locale-subtitle-artifact.v1",
    locale: parsed.locale,
    alignmentRevisionId: parsed.alignmentRevisionId,
    fingerprint: parsed.fingerprint,
    timingDependencyFingerprint,
    srt: buildSrt(entries),
    vtt: buildVtt(entries),
    ass: buildAss(entries),
  });
}
