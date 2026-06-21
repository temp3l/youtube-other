import { z } from "zod";
import {
  normalizedTranscriptSchema,
  sceneIdSchema,
  subtitleSegmentSchema,
  timestampedWordSchema,
  transcriptSegmentSchema,
  transcriptSchema,
  type NormalizedTranscript,
  type RawTimedWord,
  type SentenceSegmentationOptions,
  type SegmentBoundaryReason,
  type SubtitleSegment,
  type TimestampedWord,
  type TranscriptSegment,
  type VisualScene,
  visualSceneSchema
} from "@mediaforge/domain";
import {
  AtomicWriteError,
  ChronologicalOrderingError,
  InvalidRawTranscriptError,
  InvalidTimedWordError,
  InvalidTimestampRangeError,
  MissingWordTimestampsError,
  PathologicalWordTimingError,
  TranscriptNormalizationError
} from "./errors.js";
import { ensureDir, normalizeWhitespace, writeJsonAtomic } from "@mediaforge/shared";

export const SENTENCE_END_PATTERN = /[.!?…]["'»”)]*$/u;
const CLAUSE_BOUNDARY_PATTERN = /[,:;]["'»”)]*$/u;
const NON_SPEECH_MARKER_PATTERN = /^\[(?:music|música|applause|silence)\]$/iu;

export const DEFAULT_SEGMENTATION_OPTIONS: SentenceSegmentationOptions = {
  minDurationSeconds: 2,
  maxDurationSeconds: 15,
  maxSilenceSeconds: 1.25,
  timestampPrecision: 3,
  maxSingleWordDurationSeconds: 5,
  boundaryLookbackWords: 6
};

const whisperWordCandidateSchema = z
  .object({
    word: z.string().optional(),
    text: z.string().optional(),
    start: z.number().optional(),
    end: z.number().optional(),
    probability: z.number().min(0).max(1).optional(),
    p: z.number().min(0).max(1).optional(),
    timestamps: z
      .object({
        from: z.string().optional(),
        to: z.string().optional()
      })
      .optional(),
    offsets: z
      .object({
        from: z.number().optional(),
        to: z.number().optional()
      })
      .optional()
  })
  .passthrough();

const whisperSentenceCandidateSchema = z
  .object({
    id: z.union([z.number().int().nonnegative(), z.string()]).optional(),
    start: z.number().optional(),
    end: z.number().optional(),
    text: z.string().optional(),
    words: z.array(whisperWordCandidateSchema).optional(),
    tokens: z.array(whisperWordCandidateSchema).optional(),
    timestamps: z
      .object({
        from: z.string().optional(),
        to: z.string().optional()
      })
      .optional(),
    offsets: z
      .object({
        from: z.number().optional(),
        to: z.number().optional()
      })
      .optional()
  })
  .passthrough();

const whisperOutputCandidateSchema = z
  .object({
    text: z.string().optional(),
    language: z.string().optional(),
    duration: z.number().optional(),
    words: z.array(whisperWordCandidateSchema).optional(),
    segments: z.array(whisperSentenceCandidateSchema).optional(),
    transcription: z.array(whisperSentenceCandidateSchema).optional()
  })
  .passthrough();

export interface WhisperRawChunk {
  readonly chunkIndex: number;
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly raw: unknown;
}

export interface WhisperRawTranscriptArtifact {
  readonly schemaVersion: 1;
  readonly sourceId: string;
  readonly language: string;
  readonly backend: string;
  readonly model: string;
  readonly generatedAt: string;
  readonly wordTimestamps: true;
  readonly chunks: readonly WhisperRawChunk[];
  readonly rawSegments: readonly TranscriptSegment[];
  readonly words: readonly RawTimedWord[];
  readonly text: string;
}

interface WhisperTimedTokenCandidate extends RawTimedWord {
  readonly rawText: string;
}

function roundTimestamp(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function normalizeBackendTimestamp(value: number): number {
  return value > 1000 ? value / 1000 : value;
}

function millisecondsToSeconds(value: number): number {
  return value / 1000;
}

function parseWhisperTimestamp(value: string): number {
  const match = /^(?<hours>\d{2}):(?<minutes>\d{2}):(?<seconds>\d{2})[,.](?<millis>\d{3})$/u.exec(value);
  const groups = match?.groups;
  if (
    !groups ||
    typeof groups["hours"] !== "string" ||
    typeof groups["minutes"] !== "string" ||
    typeof groups["seconds"] !== "string" ||
    typeof groups["millis"] !== "string"
  ) {
    return 0;
  }
  const hours = Number.parseInt(groups["hours"], 10);
  const minutes = Number.parseInt(groups["minutes"], 10);
  const seconds = Number.parseInt(groups["seconds"], 10);
  const millis = Number.parseInt(groups["millis"], 10);
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

function ensurePositiveRange(startSeconds: number, endSeconds: number, precision: number): { readonly startSeconds: number; readonly endSeconds: number } {
  const minimumIncrement = 1 / 10 ** precision;
  const adjustedEndSeconds = endSeconds <= startSeconds ? startSeconds + minimumIncrement : endSeconds;
  return {
    startSeconds,
    endSeconds: adjustedEndSeconds
  };
}

function validateOptions(options: SentenceSegmentationOptions): SentenceSegmentationOptions {
  if (options.minDurationSeconds <= 0) {
    throw new TranscriptNormalizationError("Minimum segment duration must be positive.");
  }
  if (options.maxDurationSeconds <= 0) {
    throw new TranscriptNormalizationError("Maximum segment duration must be positive.");
  }
  if (options.minDurationSeconds > options.maxDurationSeconds) {
    throw new TranscriptNormalizationError("Minimum segment duration cannot exceed maximum segment duration.");
  }
  if (options.maxSilenceSeconds < 0) {
    throw new TranscriptNormalizationError("Maximum silence must be non-negative.");
  }
  if (options.timestampPrecision < 0 || options.timestampPrecision > 6) {
    throw new TranscriptNormalizationError("Timestamp precision must be between 0 and 6.");
  }
  if (options.maxSingleWordDurationSeconds <= 0) {
    throw new TranscriptNormalizationError("Maximum single-word duration must be positive.");
  }
  if (options.boundaryLookbackWords < 0) {
    throw new TranscriptNormalizationError("Boundary lookback words must be non-negative.");
  }
  return options;
}

function isWordToken(value: string): boolean {
  return !/^[\s.,!?…:;()\[\]{}"“”«»'’¿¡-]+$/u.test(value);
}

function isOpeningPunctuationToken(value: string): boolean {
  return /^[¿¡([{"“«]+$/u.test(value);
}

function isClosingPunctuationToken(value: string): boolean {
  return /^[)\]}.,!?…:;>"”»'’]+$/u.test(value);
}

function normalizeWordToken(value: string): string {
  return normalizeWhitespace(value.replace(/^[\u2581_]+/u, "").replace(/\s+/g, " "));
}

function normalizeIterable(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function joinTokens(tokens: readonly string[]): string {
  let text = "";
  let afterOpeningPunctuation = false;
  let insideDoubleQuote = false;
  for (const rawToken of tokens) {
    const token = normalizeWordToken(rawToken);
    if (token.length === 0) {
      continue;
    }
    if (token === '"') {
      if (insideDoubleQuote) {
        text = text.replace(/\s+$/u, "");
        text += token;
        insideDoubleQuote = false;
        afterOpeningPunctuation = false;
        continue;
      }
      if (text.length > 0 && !text.endsWith(" ") && !isOpeningPunctuationToken(text.slice(-1))) {
        text += " ";
      }
      text += token;
      insideDoubleQuote = true;
      afterOpeningPunctuation = true;
      continue;
    }
    if (text.length === 0) {
      text = token;
      afterOpeningPunctuation = isOpeningPunctuationToken(token);
      continue;
    }
    if (isOpeningPunctuationToken(token)) {
      text += token;
      afterOpeningPunctuation = true;
      continue;
    }
    if (isClosingPunctuationToken(token)) {
      text = text.replace(/\s+$/u, "");
      text += token;
      afterOpeningPunctuation = false;
      continue;
    }
    if (afterOpeningPunctuation) {
      text += token;
      afterOpeningPunctuation = false;
      continue;
    }
    text += ` ${token}`;
    afterOpeningPunctuation = false;
  }
  return text.replace(/\s+/g, " ").replace(/\s+([,.;:!?…)\]}»”]+)/gu, "$1").replace(/([¿¡([{«“])\s+/gu, "$1");
}

function normalizeTimedWord(word: RawTimedWord, precision: number): TimestampedWord {
  if (!Number.isFinite(word.startSeconds) || !Number.isFinite(word.endSeconds)) {
    throw new InvalidTimedWordError(`Invalid timing for token "${word.text}".`);
  }
  if (word.startSeconds < 0 || word.endSeconds < word.startSeconds) {
    throw new InvalidTimestampRangeError(`Invalid range for token "${word.text}".`);
  }
  return {
    text: normalizeWordToken(word.text),
    startSeconds: roundTimestamp(word.startSeconds, precision),
    endSeconds: roundTimestamp(word.endSeconds, precision),
    probability: word.probability
  };
}

function normalizeRawTimedWordCandidate(candidate: unknown, precision: number): WhisperTimedTokenCandidate {
  const parsed = whisperWordCandidateSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new InvalidTimedWordError("Whisper returned an invalid word payload.", { cause: parsed.error });
  }
  const rawText = parsed.data.word ?? parsed.data.text ?? "";
  const text = normalizeWordToken(rawText);
  if (text.length === 0) {
    throw new InvalidTimedWordError("Whisper returned an empty word token.");
  }
  const startSeconds =
    parsed.data.start ??
    (parsed.data.timestamps?.from ? parseWhisperTimestamp(parsed.data.timestamps.from) : undefined) ??
    (parsed.data.offsets?.from !== undefined ? millisecondsToSeconds(parsed.data.offsets.from) : undefined);
  const endSeconds =
    parsed.data.end ??
    (parsed.data.timestamps?.to ? parseWhisperTimestamp(parsed.data.timestamps.to) : undefined) ??
    (parsed.data.offsets?.to !== undefined ? millisecondsToSeconds(parsed.data.offsets.to) : undefined);
  if (startSeconds === undefined || endSeconds === undefined) {
    throw new MissingWordTimestampsError(`Whisper returned a word without usable timing for "${text}".`);
  }
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
    throw new InvalidTimedWordError(`Whisper returned non-finite timing for "${text}".`);
  }
  const normalized = {
    text,
    ...ensurePositiveRange(
      roundTimestamp(normalizeBackendTimestamp(startSeconds), precision),
      roundTimestamp(normalizeBackendTimestamp(endSeconds), precision),
      precision
    ),
    probability: parsed.data.probability
  };
  if (normalized.startSeconds < 0 || normalized.endSeconds < normalized.startSeconds) {
    throw new InvalidTimestampRangeError(`Invalid timing range for "${text}".`);
  }
  return {
    rawText,
    ...normalized
  };
}

function mergeTokenFragments(tokens: readonly WhisperTimedTokenCandidate[]): RawTimedWord[] {
  const punctuationOnlyPattern = /^[,.;:!?…¿¡()"“”«»'’\-]+$/u;
  const specialTokenPattern = /^\[_[^\]]+\]$/u;
  const words: RawTimedWord[] = [];
  let current: WhisperTimedTokenCandidate | null = null;
  let currentText = "";
  const flushCurrent = (): void => {
    if (!current) {
      return;
    }
    words.push({
      text: normalizeWordToken(currentText),
      startSeconds: current.startSeconds,
      endSeconds: current.endSeconds,
      probability: current.probability
    });
    current = null;
    currentText = "";
  };
  for (const token of tokens) {
    const normalizedText = normalizeWordToken(token.rawText);
    if (normalizedText.length === 0 || specialTokenPattern.test(normalizedText)) {
      continue;
    }
    if (punctuationOnlyPattern.test(normalizedText)) {
      flushCurrent();
      words.push({
        text: normalizedText,
        startSeconds: token.startSeconds,
        endSeconds: token.endSeconds,
        probability: token.probability
      });
      continue;
    }
    const hasLeadingSpace = /^\s/u.test(token.rawText);
    if (!current || hasLeadingSpace) {
      flushCurrent();
      current = token;
      currentText = normalizedText;
      continue;
    }
    currentText += normalizedText;
    current = {
      ...current,
      endSeconds: token.endSeconds,
      probability: token.probability ?? current.probability
    };
  }
  flushCurrent();
  return words;
}

function extractCandidateWords(raw: unknown, precision: number): RawTimedWord[] {
  const parsed = whisperOutputCandidateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new InvalidRawTranscriptError("Whisper response did not match an expected JSON shape.", { cause: parsed.error });
  }
  const candidates: WhisperTimedTokenCandidate[] = [];
  const seen = new Set<string>();
  const appendWord = (candidate: unknown): void => {
    const parsedWord = whisperWordCandidateSchema.safeParse(candidate);
    if (!parsedWord.success) {
      return;
    }
    const rawWord = normalizeRawTimedWordCandidate(parsedWord.data, precision);
    const key = `${rawWord.rawText}::${rawWord.startSeconds.toFixed(precision)}::${rawWord.endSeconds.toFixed(precision)}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push(rawWord);
  };
  for (const word of parsed.data.words ?? []) {
    appendWord(word);
  }
  for (const token of normalizeIterable((parsed.data as { readonly tokens?: unknown }).tokens)) {
    appendWord(token);
  }
  for (const segment of parsed.data.segments ?? []) {
    for (const word of segment.words ?? []) {
      appendWord(word);
    }
    for (const token of normalizeIterable((segment as { readonly tokens?: unknown }).tokens)) {
      appendWord(token);
    }
  }
  for (const segment of parsed.data.transcription ?? []) {
    for (const word of segment.words ?? []) {
      appendWord(word);
    }
    for (const token of normalizeIterable((segment as { readonly tokens?: unknown }).tokens)) {
      appendWord(token);
    }
  }
  const words = mergeTokenFragments(candidates);
  if (words.length === 0) {
    throw new MissingWordTimestampsError("Whisper output did not include usable word timestamps.");
  }
  return words;
}

export function extractTimedWordsFromWhisperResponse(raw: unknown, precision = DEFAULT_SEGMENTATION_OPTIONS.timestampPrecision): RawTimedWord[] {
  return extractCandidateWords(raw, precision);
}

export function extractRawSegmentsFromWhisperResponse(
  raw: unknown,
  precision = DEFAULT_SEGMENTATION_OPTIONS.timestampPrecision
): TranscriptSegment[] {
  const parsed = whisperOutputCandidateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new InvalidRawTranscriptError("Whisper response did not match an expected JSON shape.", { cause: parsed.error });
  }
  const segments: TranscriptSegment[] = [];
  const rawSegments = parsed.data.segments ?? parsed.data.transcription ?? [];
  for (let index = 0; index < rawSegments.length; index += 1) {
    const segment = rawSegments[index];
    if (!segment) {
      continue;
    }
    const words = extractCandidateWords(segment, precision);
    const startSeconds =
      segment.offsets?.from !== undefined
        ? roundTimestamp(millisecondsToSeconds(segment.offsets.from), precision)
        : segment.start !== undefined
          ? roundTimestamp(normalizeBackendTimestamp(segment.start), precision)
          : words[0]?.startSeconds ?? 0;
    const endSeconds =
      segment.offsets?.to !== undefined
        ? roundTimestamp(millisecondsToSeconds(segment.offsets.to), precision)
        : segment.end !== undefined
          ? roundTimestamp(normalizeBackendTimestamp(segment.end), precision)
          : words[words.length - 1]?.endSeconds ?? startSeconds;
    const range = ensurePositiveRange(startSeconds, endSeconds, precision);
    segments.push(
      transcriptSegmentSchema.parse({
        id: `segment-${String(index + 1).padStart(3, "0")}`,
        startSeconds: range.startSeconds,
        endSeconds: range.endSeconds,
      text: normalizeWhitespace(segment.text ?? words.map((word) => word.text).join(" ")),
      words,
      boundaryReason: "end-of-transcript"
    })
  );
  }
  return segments;
}

function validateChronology(words: readonly TimestampedWord[], maxSingleWordDurationSeconds: number): void {
  let previousEnd = -Infinity;
  for (const word of words) {
    if (word.endSeconds - word.startSeconds > maxSingleWordDurationSeconds + 1e-6) {
      throw new PathologicalWordTimingError(`Word "${word.text}" spans too long: ${word.endSeconds - word.startSeconds}s.`);
    }
    if (word.startSeconds < previousEnd - 0.05) {
      throw new ChronologicalOrderingError(`Word timestamps overlap or go backwards near "${word.text}".`);
    }
    previousEnd = Math.max(previousEnd, word.endSeconds);
  }
}

function sortWords(words: readonly RawTimedWord[], precision: number, maxSingleWordDurationSeconds: number): TimestampedWord[] {
  const normalized = words
    .map((word) => normalizeTimedWord(word, precision))
    .filter((word) => word.text.length > 0);
  const sorted = [...normalized].sort((left, right) => {
    if (left.startSeconds !== right.startSeconds) {
      return left.startSeconds - right.startSeconds;
    }
    if (left.endSeconds !== right.endSeconds) {
      return left.endSeconds - right.endSeconds;
    }
    return left.text.localeCompare(right.text);
  });
  const repaired: TimestampedWord[] = [];
  const minimumIncrement = 1 / 10 ** precision;
  for (const word of sorted) {
    const previous = repaired[repaired.length - 1];
    if (previous && word.startSeconds < previous.endSeconds) {
      const overlapSeconds = previous.endSeconds - word.startSeconds;
      if (overlapSeconds > 0.5) {
        throw new ChronologicalOrderingError(`Word timestamps overlap or go backwards near "${word.text}".`);
      }
      const adjustedStartSeconds = roundTimestamp(previous.endSeconds, precision);
      const adjustedEndSeconds = roundTimestamp(Math.max(word.endSeconds, adjustedStartSeconds + minimumIncrement), precision);
      repaired.push({
        ...word,
        startSeconds: adjustedStartSeconds,
        endSeconds: adjustedEndSeconds
      });
      continue;
    }
    repaired.push(word);
  }
  validateChronology(repaired, maxSingleWordDurationSeconds);
  return repaired;
}

function isSentenceEnd(token: string): boolean {
  return SENTENCE_END_PATTERN.test(token);
}

function isClauseBoundary(token: string): boolean {
  return CLAUSE_BOUNDARY_PATTERN.test(token);
}

function makeSegmentId(index: number): `segment-${string}` {
  return `segment-${String(index).padStart(3, "0")}` as `segment-${string}`;
}

function flushSegment(
  items: TimestampedWord[],
  reason: SegmentBoundaryReason,
  precision: number,
  index: number
): TranscriptSegment | null {
  if (items.length === 0) {
    return null;
  }
  const startSeconds = roundTimestamp(items[0]?.startSeconds ?? 0, precision);
  const endSeconds = roundTimestamp(items[items.length - 1]?.endSeconds ?? startSeconds, precision);
  if (endSeconds <= startSeconds) {
    throw new InvalidTimestampRangeError("Segment end time must be greater than start time.");
  }
  const text = joinTokens(items.map((item) => item.text));
  if (text.length === 0) {
    return null;
  }
  return transcriptSegmentSchema.parse({
    id: makeSegmentId(index),
    startSeconds,
    endSeconds,
    text,
    words: items.map((item) => timestampedWordSchema.parse(item)),
    boundaryReason: reason
  });
}

function chooseBoundaryIndex(
  buffer: readonly TimestampedWord[],
  options: SentenceSegmentationOptions,
  mode: "sentence" | "max-duration"
): number {
  const start = Math.max(0, buffer.length - 1 - options.boundaryLookbackWords);
  for (let index = buffer.length - 1; index >= start; index -= 1) {
    const word = buffer[index];
    if (!word) {
      continue;
    }
    if (isSentenceEnd(word.text)) {
      return index;
    }
    if (mode === "max-duration" && isClauseBoundary(word.text)) {
      return index;
    }
  }
  return buffer.length - 1;
}

export function buildSentenceSegments(
  words: readonly TimestampedWord[],
  options: Partial<SentenceSegmentationOptions> = {}
): TranscriptSegment[] {
  const segmentationOptions = validateOptions({
    ...DEFAULT_SEGMENTATION_OPTIONS,
    ...options
  });
  const sortedWords = [...words]
    .filter((word) => {
      const normalized = normalizeWordToken(word.text);
      return normalized.length > 0 && !NON_SPEECH_MARKER_PATTERN.test(normalized);
    })
    .map((word) => ({
      text: normalizeWordToken(word.text),
      startSeconds: roundTimestamp(word.startSeconds, segmentationOptions.timestampPrecision),
      endSeconds: roundTimestamp(word.endSeconds, segmentationOptions.timestampPrecision),
      probability: word.probability
    }));
  validateChronology(sortedWords, segmentationOptions.maxSingleWordDurationSeconds);
  const segments: TranscriptSegment[] = [];
  let buffer: TimestampedWord[] = [];
  let nextId = 1;
  let pendingSentenceBoundary = false;
  const pushBuffer = (reason: SegmentBoundaryReason, flushIndex?: number): void => {
    const targetIndex = flushIndex ?? buffer.length - 1;
    if (targetIndex < 0 || buffer.length === 0) {
      return;
    }
    const prefix = buffer.slice(0, targetIndex + 1);
    const segment = flushSegment(prefix, reason, segmentationOptions.timestampPrecision, nextId);
    if (segment) {
      segments.push(segment);
      nextId += 1;
    }
    buffer = buffer.slice(targetIndex + 1);
  };
  for (const word of sortedWords) {
    if (pendingSentenceBoundary && !isClosingPunctuationToken(word.text)) {
      pushBuffer("sentence");
      pendingSentenceBoundary = false;
    }
    if (buffer.length > 0) {
      const previous = buffer[buffer.length - 1];
      const silenceSeconds = word.startSeconds - (previous?.endSeconds ?? word.startSeconds);
      if (silenceSeconds > segmentationOptions.maxSilenceSeconds && buffer.length > 0) {
        const currentDuration = (buffer[buffer.length - 1]?.endSeconds ?? 0) - (buffer[0]?.startSeconds ?? 0);
        if (currentDuration >= segmentationOptions.minDurationSeconds) {
          pushBuffer("silence");
        }
      }
    }
    buffer.push(word);
    while (buffer.length > 0) {
      const currentDuration = (buffer[buffer.length - 1]?.endSeconds ?? 0) - (buffer[0]?.startSeconds ?? 0);
      if (currentDuration < segmentationOptions.maxDurationSeconds) {
        break;
      }
      const boundaryIndex = chooseBoundaryIndex(buffer, segmentationOptions, "max-duration");
      pushBuffer("max-duration", boundaryIndex);
      if (buffer.length === 0) {
        break;
      }
    }
    if (buffer.length > 0) {
      const endsSentence = isSentenceEnd(buffer[buffer.length - 1]?.text ?? "");
      const duration = (buffer[buffer.length - 1]?.endSeconds ?? 0) - (buffer[0]?.startSeconds ?? 0);
      if (endsSentence && duration >= segmentationOptions.minDurationSeconds) {
        pendingSentenceBoundary = true;
      }
    }
  }
  if (buffer.length > 0) {
    const segment = flushSegment(
      buffer,
      pendingSentenceBoundary ? "sentence" : "end-of-transcript",
      segmentationOptions.timestampPrecision,
      nextId
    );
    if (segment) {
      segments.push(segment);
    }
  }
  return segments.map((segment, index) =>
    subtitleSegmentSchema.parse({
      ...segment,
      id: makeSegmentId(index + 1)
    })
  );
}

export function normalizeTranscriptFromWords(input: {
  readonly sourceId: string;
  readonly language: string;
  readonly words: readonly RawTimedWord[];
  readonly provider: string;
  readonly model: string;
  readonly generatedAt: string;
  readonly options?: Partial<SentenceSegmentationOptions>;
}): NormalizedTranscript {
  const validatedWords = sortWords(
    input.words,
    input.options?.timestampPrecision ?? DEFAULT_SEGMENTATION_OPTIONS.timestampPrecision,
    input.options?.maxSingleWordDurationSeconds ?? DEFAULT_SEGMENTATION_OPTIONS.maxSingleWordDurationSeconds
  );
  const spokenWords = validatedWords.filter((word) => !NON_SPEECH_MARKER_PATTERN.test(word.text));
  if (spokenWords.length === 0) {
    throw new MissingWordTimestampsError("No timed words were available for normalization.");
  }
  const segments = buildSentenceSegments(spokenWords, input.options);
  const normalized = normalizedTranscriptSchema.parse({
    schemaVersion: 1,
    sourceId: input.sourceId,
    language: input.language,
    text: joinTokens(spokenWords.map((word) => word.text)),
    segments,
    words: spokenWords,
    generation: {
      provider: input.provider,
      model: input.model,
      generatedAt: input.generatedAt,
      wordTimestamps: true
    }
  });
  return normalized;
}

export function validateNormalizedTranscript(transcript: NormalizedTranscript): void {
  normalizedTranscriptSchema.parse(transcript);
  if (transcript.words.length === 0) {
    throw new MissingWordTimestampsError("Normalized transcript does not contain any words.");
  }
  validateChronology(transcript.words, DEFAULT_SEGMENTATION_OPTIONS.maxSingleWordDurationSeconds);
  const segmentWords = transcript.segments.flatMap((segment: TranscriptSegment) => segment.words);
  if (segmentWords.length !== transcript.words.length) {
    throw new TranscriptNormalizationError("Transcript words do not match the concatenated segment words.");
  }
  for (let index = 0; index < transcript.words.length; index += 1) {
    const word = transcript.words[index];
    const segmentWord = segmentWords[index];
    if (
      !word ||
      !segmentWord ||
      segmentWord.text !== word.text ||
      segmentWord.startSeconds !== word.startSeconds ||
      segmentWord.endSeconds !== word.endSeconds
    ) {
      throw new TranscriptNormalizationError("Transcript words were duplicated or dropped during normalization.");
    }
  }
  let expectedIndex = 1;
  let previousSegmentEnd = -Infinity;
  for (const segment of transcript.segments) {
    if (segment.id !== makeSegmentId(expectedIndex)) {
      throw new TranscriptNormalizationError(`Expected ${makeSegmentId(expectedIndex)} but found ${segment.id}.`);
    }
    if (segment.endSeconds <= segment.startSeconds) {
      throw new InvalidTimestampRangeError(`Segment ${segment.id} has an invalid time range.`);
    }
    if (segment.startSeconds < previousSegmentEnd - 0.001) {
      throw new ChronologicalOrderingError(`Segment ${segment.id} overlaps the previous segment.`);
    }
    previousSegmentEnd = segment.endSeconds;
    expectedIndex += 1;
  }
}

export function buildVisualScenesFromSubtitleSegments(
  subtitleSegments: readonly SubtitleSegment[],
  options: {
    readonly minDurationSeconds?: number;
    readonly maxDurationSeconds?: number;
    readonly targetDurationSeconds?: number;
  } = {}
): VisualScene[] {
  const minDurationSeconds = options.minDurationSeconds ?? 8;
  const maxDurationSeconds = options.maxDurationSeconds ?? 18;
  const targetDurationSeconds = options.targetDurationSeconds ?? (minDurationSeconds + maxDurationSeconds) / 2;
  if (minDurationSeconds <= 0 || maxDurationSeconds <= 0 || minDurationSeconds > maxDurationSeconds) {
    throw new TranscriptNormalizationError("Invalid visual-scene duration constraints.");
  }
  const scenes: VisualScene[] = [];
  let buffer: SubtitleSegment[] = [];
  let nextId = 1;
  const flush = (): void => {
    if (buffer.length === 0) {
      return;
    }
    const startSeconds = buffer[0]?.startSeconds ?? 0;
    const endSeconds = buffer[buffer.length - 1]?.endSeconds ?? startSeconds;
    scenes.push(
      visualSceneSchema.parse({
        id: sceneIdSchema.parse(`scene-${String(nextId).padStart(3, "0")}`),
        startSeconds,
        endSeconds,
        narration: buffer.map((segment: SubtitleSegment) => segment.text).join(" "),
        sourceSegmentIds: buffer.map((segment: SubtitleSegment) => segment.id)
      })
    );
    nextId += 1;
    buffer = [];
  };
  for (const segment of subtitleSegments) {
    buffer.push(segment);
    const currentDuration = (buffer[buffer.length - 1]?.endSeconds ?? 0) - (buffer[0]?.startSeconds ?? 0);
    const shouldClose =
      currentDuration >= minDurationSeconds &&
      (currentDuration >= targetDurationSeconds || currentDuration >= maxDurationSeconds || isSentenceEnd(segment.text));
    if (shouldClose) {
      flush();
    }
  }
  flush();
  return scenes;
}

export async function writeNormalizedTranscriptArtifacts(
  targetDir: string,
  rawArtifactPath: string,
  normalizedPath: string,
  rawTranscript: WhisperRawTranscriptArtifact,
  normalizedTranscript: NormalizedTranscript
): Promise<void> {
  try {
    await ensureDir(targetDir);
    await writeJsonAtomic(rawArtifactPath, rawTranscript);
    await writeJsonAtomic(normalizedPath, normalizedTranscript);
  } catch (error) {
    throw new AtomicWriteError("Failed to write transcript artifacts atomically.", { cause: error });
  }
}

export function parseWhisperRawArtifact(input: unknown): WhisperRawTranscriptArtifact {
  const artifactSchema = z.object({
    schemaVersion: z.literal(1),
    sourceId: z.string(),
    language: z.string(),
    backend: z.string(),
    model: z.string(),
    generatedAt: z.string(),
    wordTimestamps: z.literal(true),
    chunks: z.array(
      z.object({
        chunkIndex: z.number().int().nonnegative(),
        startSeconds: z.number().nonnegative(),
        durationSeconds: z.number().positive(),
        raw: z.unknown()
      })
    ),
    rawSegments: z.array(transcriptSegmentSchema),
    words: z.array(z.object({
      text: z.string(),
      startSeconds: z.number().nonnegative(),
      endSeconds: z.number().nonnegative(),
      probability: z.number().min(0).max(1).optional()
    })),
    text: z.string()
  });
  return artifactSchema.parse(input);
}
