import {
  episodeIdSchema,
  scenePlanSchema,
  transcriptSchema,
  type CaptionPlan,
  type SelectedAudioTimingDependency,
} from "@mediaforge/domain";
import {
  localeTtsSelectedAudioAlignmentSchema,
  type LocaleTtsSelectedAudioAlignment,
} from "./locale-tts-alignment.js";
import { planPhraseCaptions } from "./caption-plan.js";

export const LOCALE_SUBTITLE_COMPILATION_SCHEMA_VERSION =
  "mediaforge.alignment.locale-subtitle-compilation.v1" as const;

const localeMaxCharsPerLine: Readonly<Record<string, number>> = {
  "en-US": 24,
  "de-DE": 28,
  "es-ES": 26,
  "pt-BR": 26,
};

export type CompileLocaleSubtitleProjectionInput = {
  readonly locale: SelectedAudioTimingDependency["locale"];
  readonly alignment: LocaleTtsSelectedAudioAlignment;
  readonly timingDependency: SelectedAudioTimingDependency;
};

function transcriptFromSelectedAudioAlignment(
  alignment: LocaleTtsSelectedAudioAlignment,
  locale: string,
) {
  const words = alignment.segments.flatMap((segment) =>
    segment.words.map((word) => ({
      text: word.word,
      startSeconds: word.startSeconds,
      endSeconds: word.endSeconds,
    })),
  );
  const text = alignment.segments
    .flatMap((segment) => segment.words.map((word) => word.word))
    .join(" ");
  return transcriptSchema.parse({
    sourceId: episodeIdSchema.parse("episode-locale-subtitle"),
    language: locale,
    text,
    segments: alignment.segments.map((segment, index) => ({
      id: `segment-${String(index + 1).padStart(3, "0")}`,
      startSeconds: segment.words[0]?.startSeconds ?? 0,
      endSeconds: segment.words.at(-1)?.endSeconds ?? 0,
      text: segment.words.map((word) => word.word).join(" "),
      words: [],
      sequenceNumber: index + 1,
    })),
    words,
  });
}

function minimalScenePlanForLocale(text: string) {
  const lastWord = text.trim().split(/\s+/u).at(-1) ?? "line";
  const durationSeconds = Math.max(1, Math.ceil(text.length / 12));
  return {
    sourceId: episodeIdSchema.parse("episode-locale-subtitle"),
    scenes: [
      {
        id: "scene-001",
        sequenceNumber: 1,
        canonicalNarration: text,
        sourceSegmentIds: ["segment-001"],
        estimatedDurationSeconds: durationSeconds,
        timing: { startSeconds: 0, endSeconds: durationSeconds },
        visualPurpose: "setup",
        textRequirement: { required: false },
        subject: "locale",
        action: "speak",
        setting: "scene",
        composition: "centered",
        cameraFraming: "medium",
        mood: "neutral",
        aspectRatios: ["9:16"],
        imagePrompt: "neutral",
        expectedImageFilenames: ["scene-001.png"],
        qualityStatus: "approved",
      },
    ],
  };
}

export function compileLocaleSubtitleCaptionPlan(
  input: CompileLocaleSubtitleProjectionInput,
): CaptionPlan {
  const alignment = localeTtsSelectedAudioAlignmentSchema.parse(input.alignment);
  const transcript = transcriptFromSelectedAudioAlignment(alignment, input.locale);
  return planPhraseCaptions({
    transcript,
    scenePlan: scenePlanSchema.parse(minimalScenePlanForLocale(transcript.text)),
    locale: input.locale,
    maxCharsPerLine: localeMaxCharsPerLine[input.locale] ?? 24,
  });
}
