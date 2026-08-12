import { z } from "zod";

import {
  buildLocaleTtsSelectedAudioAlignment,
  localeTtsSelectedAudioAlignmentSchema,
  type LocaleTtsSelectedAudioAlignment,
} from "@mediaforge/alignment/locale-tts-alignment.js";
import {
  createLocaleTtsCacheIdentity,
  lexicalDurationForSegments,
  localeTtsSegmentRequestSchema,
  segmentLocaleScript,
  type LocaleTtsModelConfiguration,
  type LocaleTtsSegmentRequest,
} from "@mediaforge/speech/locale-tts-segmentation.js";
import { hashText } from "@mediaforge/shared";

import {
  type SevenMinutesAheadProductionProfile,
  type V5Bcp47Locale,
  v5Bcp47LocaleSchema,
} from "./v5-production-profile-contracts.js";
import {
  buildSevenMinutesAheadProductionProfile,
  resolveLexicalTimingAuthority,
  resolveLocaleProductionProfile,
} from "./v5-production-profile.js";

export const LOCALE_TTS_SEGMENTATION_BUNDLE_SCHEMA_VERSION =
  "mediaforge.microdrama.locale-tts-segmentation.v1" as const;

export const SELECTED_AUDIO_TIMING_SCHEMA_VERSION =
  "mediaforge.microdrama.selected-audio-timing.v1" as const;

export const fakeSelectedAudioFixtureSchema = z
  .object({
    kind: z.literal("fake-measured-audio"),
    totalDurationMs: z.number().int().positive(),
    segmentDurationsMs: z.array(z.number().int().positive()).min(1),
  })
  .strict();
export type FakeSelectedAudioFixture = z.infer<typeof fakeSelectedAudioFixtureSchema>;

export const selectedAudioTimingContractSchema = z
  .object({
    schemaVersion: z.literal(SELECTED_AUDIO_TIMING_SCHEMA_VERSION),
    scriptRevisionId: z.string().min(1).max(160),
    locale: v5Bcp47LocaleSchema,
    authoritySource: z.enum(["selected_audio", "lexical_estimate"]),
    selectedAudioIsTimingAuthority: z.literal(true),
    lexicalGateKind: z.literal("LEXICAL_GATE"),
    audioGateKind: z.literal("AUDIO_GATE"),
    lexicalEstimateDurationMs: z.number().int().positive(),
    measuredDurationMs: z.number().int().positive().optional(),
    totalDurationMs: z.number().int().positive(),
    targetSpokenWpm: z.number().int().positive(),
    alignmentRevisionId: z.string().min(1).max(200),
    cacheKey: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();
export type SelectedAudioTimingContract = z.infer<
  typeof selectedAudioTimingContractSchema
>;

export const localeTtsSegmentationBundleSchema = z
  .object({
    schemaVersion: z.literal(LOCALE_TTS_SEGMENTATION_BUNDLE_SCHEMA_VERSION),
    scriptRevisionId: z.string().min(1).max(160),
    scriptContentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    locale: v5Bcp47LocaleSchema,
    voiceProfileVersionId: z.string().min(1).max(160),
    segmentRequests: z.array(localeTtsSegmentRequestSchema).min(1),
    timingContract: selectedAudioTimingContractSchema,
    selectedAudioAlignment: localeTtsSelectedAudioAlignmentSchema.optional(),
    cacheIdentity: z.object({
      cacheKey: z.string().regex(/^[a-f0-9]{64}$/u),
      canonicalInput: z.string().min(1),
    }),
  })
  .strict();
export type LocaleTtsSegmentationBundle = z.infer<
  typeof localeTtsSegmentationBundleSchema
>;

export type LocaleTtsSegmentationInput = {
  readonly scriptText: string;
  readonly scriptRevisionId: string;
  readonly locale: V5Bcp47Locale;
  readonly voiceProfileVersionId: string;
  readonly modelConfiguration: LocaleTtsModelConfiguration;
  readonly productionProfile?: SevenMinutesAheadProductionProfile;
  readonly selectedAudio?: FakeSelectedAudioFixture;
};

export type LocaleTtsTimingAuthorityResolution =
  | {
      readonly ok: true;
      readonly authoritySource: "selected_audio" | "lexical_estimate";
      readonly totalDurationMs: number;
      readonly lexicalEstimateDurationMs: number;
      readonly measuredDurationMs?: number;
      readonly localeProfile: NonNullable<
        ReturnType<typeof resolveLocaleProductionProfile>
      >;
    }
  | {
      readonly ok: false;
      readonly code: "unsupported_locale" | "selected_audio_shape_mismatch";
      readonly message: string;
    };

export function resolveLocaleTtsTimingAuthority(input: {
  readonly locale: V5Bcp47Locale;
  readonly segmentRequests: readonly LocaleTtsSegmentRequest[];
  readonly productionProfile: SevenMinutesAheadProductionProfile;
  readonly selectedAudio?: FakeSelectedAudioFixture;
}): LocaleTtsTimingAuthorityResolution {
  const lexicalResolution = resolveLexicalTimingAuthority(
    input.productionProfile,
    input.locale
  );
  if (!lexicalResolution.ok) {
    return {
      ok: false,
      code: "unsupported_locale",
      message: lexicalResolution.message,
    };
  }

  const localeProfile = lexicalResolution.localeProfile;
  const lexicalEstimateDurationMs = lexicalDurationForSegments(
    input.segmentRequests,
    localeProfile.lexicalGate.targetSpokenWpm
  );

  if (!input.selectedAudio) {
    return {
      ok: true,
      authoritySource: "lexical_estimate",
      totalDurationMs: lexicalEstimateDurationMs,
      lexicalEstimateDurationMs,
      localeProfile,
    };
  }

  if (
    input.selectedAudio.segmentDurationsMs.length !== input.segmentRequests.length
  ) {
    return {
      ok: false,
      code: "selected_audio_shape_mismatch",
      message: `Selected audio segment count ${input.selectedAudio.segmentDurationsMs.length} does not match request count ${input.segmentRequests.length}.`,
    };
  }

  const measuredDurationMs = input.selectedAudio.segmentDurationsMs.reduce(
    (total, durationMs) => total + durationMs,
    0
  );
  if (measuredDurationMs !== input.selectedAudio.totalDurationMs) {
    return {
      ok: false,
      code: "selected_audio_shape_mismatch",
      message: `Selected audio total ${input.selectedAudio.totalDurationMs} does not equal segment sum ${measuredDurationMs}.`,
    };
  }

  if (!localeProfile.audioGate.selectedAudioIsTimingAuthority) {
    return {
      ok: true,
      authoritySource: "lexical_estimate",
      totalDurationMs: lexicalEstimateDurationMs,
      lexicalEstimateDurationMs,
      measuredDurationMs,
      localeProfile,
    };
  }

  return {
    ok: true,
    authoritySource: "selected_audio",
    totalDurationMs: measuredDurationMs,
    lexicalEstimateDurationMs,
    measuredDurationMs,
    localeProfile,
  };
}

export function compileLocaleTtsSegmentation(
  input: LocaleTtsSegmentationInput
): LocaleTtsSegmentationBundle {
  const productionProfile =
    input.productionProfile ?? buildSevenMinutesAheadProductionProfile();
  const scriptContentHash = hashText(input.scriptText);
  const segmentRequests = segmentLocaleScript({
    scriptText: input.scriptText,
    scriptRevisionId: input.scriptRevisionId,
    locale: input.locale,
    voiceProfileVersionId: input.voiceProfileVersionId,
    modelConfiguration: input.modelConfiguration,
  });

  const timingAuthority = resolveLocaleTtsTimingAuthority({
    locale: input.locale,
    segmentRequests,
    productionProfile,
    ...(input.selectedAudio ? { selectedAudio: input.selectedAudio } : {}),
  });
  if (!timingAuthority.ok) {
    throw new Error(timingAuthority.message);
  }

  const cacheIdentity = createLocaleTtsCacheIdentity({
    scriptContentHash,
    locale: input.locale,
    voiceProfileVersionId: input.voiceProfileVersionId,
    modelConfiguration: input.modelConfiguration,
  });

  const alignmentRevisionId = `rev.locale-tts-alignment.${input.scriptRevisionId}.${input.locale.toLowerCase()}`;
  let selectedAudioAlignment: LocaleTtsSelectedAudioAlignment | undefined;
  if (
    timingAuthority.authoritySource === "selected_audio" &&
    input.selectedAudio
  ) {
    selectedAudioAlignment = buildLocaleTtsSelectedAudioAlignment({
      alignmentRevisionId,
      segments: segmentRequests.map((segment, index) => ({
        segmentId: segment.segmentId,
        text: segment.text,
        durationMs: input.selectedAudio!.segmentDurationsMs[index]!,
      })),
    });
  }

  const timingContract = selectedAudioTimingContractSchema.parse({
    schemaVersion: SELECTED_AUDIO_TIMING_SCHEMA_VERSION,
    scriptRevisionId: input.scriptRevisionId,
    locale: input.locale,
    authoritySource: timingAuthority.authoritySource,
    selectedAudioIsTimingAuthority:
      timingAuthority.localeProfile.audioGate.selectedAudioIsTimingAuthority,
    lexicalGateKind: timingAuthority.localeProfile.lexicalGate.gateKind,
    audioGateKind: timingAuthority.localeProfile.audioGate.gateKind,
    lexicalEstimateDurationMs: timingAuthority.lexicalEstimateDurationMs,
    ...(timingAuthority.measuredDurationMs !== undefined
      ? { measuredDurationMs: timingAuthority.measuredDurationMs }
      : {}),
    totalDurationMs: timingAuthority.totalDurationMs,
    targetSpokenWpm: timingAuthority.localeProfile.lexicalGate.targetSpokenWpm,
    alignmentRevisionId,
    cacheKey: cacheIdentity.cacheKey,
  });

  return localeTtsSegmentationBundleSchema.parse({
    schemaVersion: LOCALE_TTS_SEGMENTATION_BUNDLE_SCHEMA_VERSION,
    scriptRevisionId: input.scriptRevisionId,
    scriptContentHash,
    locale: input.locale,
    voiceProfileVersionId: input.voiceProfileVersionId,
    segmentRequests,
    timingContract,
    ...(selectedAudioAlignment ? { selectedAudioAlignment } : {}),
    cacheIdentity: {
      cacheKey: cacheIdentity.cacheKey,
      canonicalInput: cacheIdentity.canonicalInput,
    },
  });
}
