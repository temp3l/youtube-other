import { z } from "zod";

import {
  alignmentResultSchema,
  wordTimingSchema,
  type AlignmentResult,
  type WordTiming,
} from "@mediaforge/domain";
import { countSpokenWords, splitIntoWords } from "@mediaforge/shared";

export const LOCALE_TTS_ALIGNMENT_SCHEMA_VERSION =
  "mediaforge.alignment.locale-tts.v1" as const;

export const localeTtsSegmentAlignmentSchema = z
  .object({
    schemaVersion: z.literal(LOCALE_TTS_ALIGNMENT_SCHEMA_VERSION),
    segmentId: z.string().min(1).max(200),
    durationMs: z.number().int().positive(),
    wordCount: z.number().int().nonnegative(),
    words: z.array(wordTimingSchema),
  })
  .strict();
export type LocaleTtsSegmentAlignment = z.infer<typeof localeTtsSegmentAlignmentSchema>;

export const localeTtsSelectedAudioAlignmentSchema = z
  .object({
    schemaVersion: z.literal(LOCALE_TTS_ALIGNMENT_SCHEMA_VERSION),
    alignmentRevisionId: z.string().min(1).max(200),
    totalDurationMs: z.number().int().positive(),
    segments: z.array(localeTtsSegmentAlignmentSchema).min(1),
    alignment: alignmentResultSchema,
  })
  .strict();
export type LocaleTtsSelectedAudioAlignment = z.infer<
  typeof localeTtsSelectedAudioAlignmentSchema
>;

function alignWordsWithinDuration(text: string, durationMs: number): WordTiming[] {
  const words = splitIntoWords(text);
  if (words.length === 0) {
    return [];
  }
  const durationSeconds = durationMs / 1_000;
  const step = durationSeconds / words.length;
  return words.map((word, index) => {
    const startSeconds = index * step;
    return wordTimingSchema.parse({
      word,
      startSeconds: Number(startSeconds.toFixed(3)),
      endSeconds: Number((startSeconds + step).toFixed(3)),
      confidence: 1,
    });
  });
}

export function alignLocaleTtsSegment(input: {
  readonly segmentId: string;
  readonly text: string;
  readonly durationMs: number;
}): LocaleTtsSegmentAlignment {
  const words = alignWordsWithinDuration(input.text, input.durationMs);
  return localeTtsSegmentAlignmentSchema.parse({
    schemaVersion: LOCALE_TTS_ALIGNMENT_SCHEMA_VERSION,
    segmentId: input.segmentId,
    durationMs: input.durationMs,
    wordCount: countSpokenWords(input.text),
    words,
  });
}

export function buildLocaleTtsSelectedAudioAlignment(input: {
  readonly alignmentRevisionId: string;
  readonly segments: readonly {
    readonly segmentId: string;
    readonly text: string;
    readonly durationMs: number;
  }[];
}): LocaleTtsSelectedAudioAlignment {
  let cursorSeconds = 0;
  const segmentAlignments = input.segments.map((segment) => {
    const aligned = alignLocaleTtsSegment(segment);
    const offsetWords = aligned.words.map((word) =>
      wordTimingSchema.parse({
        word: word.word,
        startSeconds: Number((word.startSeconds + cursorSeconds).toFixed(3)),
        endSeconds: Number((word.endSeconds + cursorSeconds).toFixed(3)),
        confidence: word.confidence,
      })
    );
    cursorSeconds += segment.durationMs / 1_000;
    return {
      ...aligned,
      words: offsetWords,
    };
  });

  const totalDurationMs = input.segments.reduce(
    (total, segment) => total + segment.durationMs,
    0
  );
  const words = segmentAlignments.flatMap((segment) => segment.words);
  const alignment = alignmentResultSchema.parse({
    sceneId: "scene-001",
    words,
    lowConfidenceRanges: [],
  } satisfies AlignmentResult);

  return localeTtsSelectedAudioAlignmentSchema.parse({
    schemaVersion: LOCALE_TTS_ALIGNMENT_SCHEMA_VERSION,
    alignmentRevisionId: input.alignmentRevisionId,
    totalDurationMs,
    segments: segmentAlignments,
    alignment,
  });
}
