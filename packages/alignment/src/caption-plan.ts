import {
  captionPlanSchema,
  captionPlanSegmentSchema,
  type CaptionAnchor,
  type CaptionPlan,
  type CaptionPlanSegment,
  type Scene,
  type ScenePlan,
  type Transcript,
} from "@mediaforge/domain";
import { normalizeWhitespace, splitIntoWords } from "@mediaforge/shared";

export interface PlanPhraseCaptionsInput {
  readonly transcript: Transcript;
  readonly scenePlan: ScenePlan;
  readonly locale: string;
  readonly variant?: CaptionPlan["variant"];
  readonly maxCharsPerLine?: number;
  readonly minDurationMs?: number;
}

interface PhraseCandidate {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly source: CaptionPlanSegment["source"];
}

const defaultMaxCharsPerLine = 24;
const defaultMinDurationMs = 900;
const captionLayoutVersion = "caption-plan-v1";
const defaultCaptionRegion = {
  x: 0.12,
  y: 0.68,
  width: 0.76,
  height: 0.16,
} as const;

const stopwords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "but",
  "by",
  "der",
  "die",
  "das",
  "el",
  "en",
  "for",
  "from",
  "in",
  "is",
  "it",
  "la",
  "le",
  "of",
  "on",
  "or",
  "the",
  "to",
  "und",
  "was",
  "with",
]);

export function planPhraseCaptions(input: PlanPhraseCaptionsInput): CaptionPlan {
  const maxCharsPerLine = input.maxCharsPerLine ?? defaultMaxCharsPerLine;
  const minDurationMs = input.minDurationMs ?? defaultMinDurationMs;
  const candidates =
    input.transcript.words.length > 0
      ? candidatesFromWords(input.transcript.words, maxCharsPerLine, minDurationMs)
      : input.transcript.segments.length > 0
        ? candidatesFromTranscriptSegments(
            input.transcript.segments,
            maxCharsPerLine,
            minDurationMs,
          )
        : candidatesFromScenes(input.scenePlan.scenes, maxCharsPerLine);

  const segments = candidates.map((candidate, index) =>
    captionPlanSegmentSchema.parse({
      id: `caption-${String(index + 1).padStart(3, "0")}`,
      locale: input.locale,
      startMs: candidate.startMs,
      endMs: Math.max(candidate.endMs, candidate.startMs + minDurationMs),
      text: candidate.text,
      lines: wrapCaptionLines(candidate.text, maxCharsPerLine),
      emphasizedText: chooseEmphasis(candidate.text),
      maxLineCount: 2,
      layoutRegion: defaultCaptionRegion,
      anchor: "lower-middle",
      safeAreaRefs: ["shorts-bottom-controls", "shorts-lower-right-controls"],
      shotIds: [],
      source: candidate.source,
    }),
  );

  return captionPlanSchema.parse({
    schemaVersion: 1,
    locale: input.locale,
    variant: input.variant ?? "short",
    maxLineCount: 2,
    layoutVersion: captionLayoutVersion,
    segments,
    brandingSafeAreas: [],
    platformSafeAreas: [
      { x: 0, y: 0.84, width: 1, height: 0.16 },
      { x: 0.78, y: 0.58, width: 0.22, height: 0.34 },
    ],
  });
}

export function wrapCaptionLines(
  text: string,
  maxCharsPerLine = defaultMaxCharsPerLine,
): readonly string[] {
  const words = splitIntoWords(text);
  if (words.length === 0) {
    return [normalizeWhitespace(text)];
  }
  const total = normalizeWhitespace(text);
  if (total.length <= maxCharsPerLine) {
    return [total];
  }

  let best: readonly string[] | undefined;
  for (let index = 1; index < words.length; index += 1) {
    const first = words.slice(0, index).join(" ");
    const second = words.slice(index).join(" ");
    const longest = Math.max(first.length, second.length);
    if (
      first.length <= maxCharsPerLine &&
      second.length <= maxCharsPerLine &&
      (best === undefined || longest < Math.max(best[0]?.length ?? 0, best[1]?.length ?? 0))
    ) {
      best = [first, second];
    }
  }
  if (best !== undefined) {
    return best;
  }

  const midpoint = Math.ceil(words.length / 2);
  return [words.slice(0, midpoint).join(" "), words.slice(midpoint).join(" ")].filter(
    (line) => line.length > 0,
  );
}

export function chooseEmphasis(text: string): string | undefined {
  const candidates = splitIntoWords(text)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((word) => word.length >= 4 && !stopwords.has(word.toLowerCase()));
  return candidates.sort((left, right) => right.length - left.length || left.localeCompare(right))[0];
}

function candidatesFromWords(
  words: Transcript["words"],
  maxCharsPerLine: number,
  minDurationMs: number,
): readonly PhraseCandidate[] {
  const result: PhraseCandidate[] = [];
  let current: Transcript["words"] = [];
  let startIndex = 0;
  for (const [index, word] of words.entries()) {
    if (current.length === 0) {
      startIndex = index;
    }
    const nextText = [...current.map((entry) => entry.text), word.text].join(" ");
    const shouldFlush =
      current.length > 0 &&
      (nextText.length > maxCharsPerLine * 2 ||
        phraseBoundary(current.at(-1)?.text ?? "") ||
        current.length >= 7);
    if (shouldFlush) {
      result.push(candidateFromWordGroup(current, startIndex, index - 1, minDurationMs));
      current = [word];
      startIndex = index;
    } else {
      current.push(word);
    }
  }
  if (current.length > 0) {
    result.push(candidateFromWordGroup(current, startIndex, words.length - 1, minDurationMs));
  }
  return result.filter((candidate) => candidate.text.length > 0);
}

function candidateFromWordGroup(
  words: Transcript["words"],
  startIndex: number,
  endIndex: number,
  minDurationMs: number,
): PhraseCandidate {
  const first = words[0];
  const last = words.at(-1);
  const startMs = Math.round((first?.startSeconds ?? 0) * 1000);
  const endMs = Math.max(
    Math.round((last?.endSeconds ?? first?.endSeconds ?? 0) * 1000),
    startMs + minDurationMs,
  );
  return {
    text: normalizeWhitespace(words.map((word) => word.text).join(" ")),
    startMs,
    endMs,
    source: {
      kind: "word-alignment",
      wordStartIndex: startIndex,
      wordEndIndex: endIndex,
    },
  };
}

function candidatesFromTranscriptSegments(
  segments: Transcript["segments"],
  maxCharsPerLine: number,
  minDurationMs: number,
): readonly PhraseCandidate[] {
  return segments.flatMap((segment, segmentIndex) => {
    const phrases = splitTextIntoPhrases(segment.text, maxCharsPerLine);
    const durationMs = Math.max(
      minDurationMs * phrases.length,
      Math.round((segment.endSeconds - segment.startSeconds) * 1000),
    );
    const stepMs = durationMs / Math.max(1, phrases.length);
    return phrases.map((phrase, phraseIndex) => ({
      text: phrase,
      startMs: Math.round(segment.startSeconds * 1000 + phraseIndex * stepMs),
      endMs: Math.round(segment.startSeconds * 1000 + (phraseIndex + 1) * stepMs),
      source: {
        kind: "transcript-segment" as const,
        ...(segment.id === undefined ? {} : { segmentId: segment.id }),
        segmentIndex,
      },
    }));
  });
}

function candidatesFromScenes(
  scenes: readonly Scene[],
  maxCharsPerLine: number,
): readonly PhraseCandidate[] {
  return scenes.flatMap((scene) => {
    const phrases = splitTextIntoPhrases(scene.canonicalNarration, maxCharsPerLine);
    const durationMs = Math.max(
      1,
      Math.round((scene.timing.endSeconds - scene.timing.startSeconds) * 1000),
    );
    const stepMs = durationMs / Math.max(1, phrases.length);
    return phrases.map((phrase, phraseIndex) => ({
      text: phrase,
      startMs: Math.round(scene.timing.startSeconds * 1000 + phraseIndex * stepMs),
      endMs: Math.round(scene.timing.startSeconds * 1000 + (phraseIndex + 1) * stepMs),
      source: {
        kind: "scene" as const,
        sceneId: scene.id,
      },
    }));
  });
}

function splitTextIntoPhrases(
  text: string,
  maxCharsPerLine: number,
): readonly string[] {
  const words = splitIntoWords(text);
  const phrases: string[] = [];
  let current: string[] = [];
  for (const word of words) {
    const next = [...current, word].join(" ");
    if (
      current.length > 0 &&
      (next.length > maxCharsPerLine * 2 ||
        phraseBoundary(current.at(-1) ?? "") ||
        current.length >= 7)
    ) {
      phrases.push(current.join(" "));
      current = [word];
    } else {
      current.push(word);
    }
  }
  if (current.length > 0) {
    phrases.push(current.join(" "));
  }
  return phrases.map(normalizeWhitespace).filter((phrase) => phrase.length > 0);
}

function phraseBoundary(word: string): boolean {
  return /[.!?;:]$/u.test(word);
}

export function defaultCaptionAnchor(): CaptionAnchor {
  return "lower-middle";
}
