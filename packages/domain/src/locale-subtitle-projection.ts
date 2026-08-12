import { z } from "zod";

import {
  fingerprintSelectedAudioTimingDependency,
  hashCanonicalDependency,
  selectedAudioTimingDependencySchema,
  type SelectedAudioTimingDependency,
} from "./selected-audio-timing-dependency.js";
import { signalUiBcp47LocaleSchema } from "./signal-ui-contracts.js";

export const LOCALE_SUBTITLE_PROJECTION_SCHEMA_VERSION =
  "mediaforge.locale-subtitle-projection.v1" as const;

export const LOCALE_SUBTITLE_ARTIFACT_SCHEMA_VERSION =
  "mediaforge.locale-subtitle-artifact.v1" as const;

const sha256Pattern = /^[a-f0-9]{64}$/u;

const localeSubtitleCaptionSegmentSchema = z
  .object({
    id: z.string().min(1),
    locale: z.string().min(1),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    text: z.string().min(1),
    lines: z.array(z.string().min(1)).min(1).max(2),
    maxLineCount: z.literal(2),
    anchor: z.string().min(1),
    source: z.object({ kind: z.string().min(1) }).passthrough(),
  })
  .strict();

const localeSubtitleCaptionPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    locale: z.string().min(1),
    variant: z.string().min(1),
    maxLineCount: z.literal(2),
    layoutVersion: z.string().min(1),
    segments: z.array(localeSubtitleCaptionSegmentSchema.passthrough()).min(1),
  })
  .passthrough();

export const localeSubtitleProjectionSchema = z
  .object({
    schemaVersion: z.literal(LOCALE_SUBTITLE_PROJECTION_SCHEMA_VERSION),
    locale: signalUiBcp47LocaleSchema,
    alignmentRevisionId: z.string().min(1).max(200),
    captionPlan: localeSubtitleCaptionPlanSchema,
    timingDependency: selectedAudioTimingDependencySchema,
    fingerprint: z.string().regex(sha256Pattern),
  })
  .strict();
export type LocaleSubtitleProjection = z.infer<
  typeof localeSubtitleProjectionSchema
>;

export const localeSubtitleArtifactSchema = z
  .object({
    schemaVersion: z.literal(LOCALE_SUBTITLE_ARTIFACT_SCHEMA_VERSION),
    locale: signalUiBcp47LocaleSchema,
    alignmentRevisionId: z.string().min(1).max(200),
    fingerprint: z.string().regex(sha256Pattern),
    timingDependencyFingerprint: z.string().regex(sha256Pattern),
    srt: z.string().min(1),
    vtt: z.string().min(1),
    ass: z.string().min(1),
  })
  .strict();
export type LocaleSubtitleArtifact = z.infer<typeof localeSubtitleArtifactSchema>;

export function buildLocaleSubtitleProjectionFingerprint(input: {
  readonly locale: LocaleSubtitleProjection["locale"];
  readonly alignmentRevisionId: string;
  readonly captionPlan: LocaleSubtitleProjection["captionPlan"];
  readonly timingDependency: SelectedAudioTimingDependency;
}): string {
  const timingDependencyFingerprint = fingerprintSelectedAudioTimingDependency(
    input.timingDependency,
  );
  return hashCanonicalDependency({
    schemaVersion: LOCALE_SUBTITLE_PROJECTION_SCHEMA_VERSION,
    locale: input.locale,
    alignmentRevisionId: input.alignmentRevisionId,
    timingDependencyFingerprint,
    captionPlan: input.captionPlan,
  });
}
