import { createHash } from "node:crypto";

export const HISTORY_NARRATION_NORMALIZATION_V33 =
  "history-narration-normalization.v3.3.0" as const;
export const HISTORY_TIMING_ESTIMATOR_V33 = "history-timing.v3.3.0" as const;

export interface TextSpanV3_3 {
  readonly startUtf16: number;
  readonly endUtf16Exclusive: number;
}

export interface CanonicalNarrationUnitV3_3 extends TextSpanV3_3 {
  readonly id: string;
  readonly text: string;
  readonly kind: "sentence" | "paragraph";
  readonly paragraphIndex: number;
  readonly wordCount: number;
  readonly textSha256: string;
}

export interface CanonicalNarrationV3_3 {
  readonly normalizationVersion: typeof HISTORY_NARRATION_NORMALIZATION_V33;
  readonly offsetEncoding: "UTF-16 code units";
  readonly unicodeNormalization: "NFKC";
  readonly lineEndings: "LF";
  readonly headingTreatment: "removed-as-non-spoken";
  readonly markdownTreatment: "inline-markup-removed-link-text-preserved";
  readonly punctuationTreatment: "preserved";
  readonly paragraphSeparator: "\n\n";
  readonly rawScriptSha256: string;
  readonly normalizedTextSha256: string;
  readonly normalizedText: string;
  readonly units: readonly CanonicalNarrationUnitV3_3[];
}

export interface DurationPolicyV3_3 {
  readonly profile: "history-long-form";
  readonly preferredDurationMs: number | null;
  readonly allowedMinDurationMs: number;
  readonly allowedMaxDurationMs: number;
  readonly hardMaxDurationMs: number;
  readonly editorialTolerancePercent: number;
  readonly estimatedOnlyProductionApproval: boolean;
  readonly policyVersion: "history-duration-policy.v3.3.0";
}

export type TimingSourceV3_3 =
  | "provisional-text-estimate"
  | "measured-tts"
  | "measured-final-audio";

export interface TimingResultV3_3 {
  readonly timingSource: TimingSourceV3_3;
  readonly normalizedWordCount: number;
  readonly configuredWordsPerMinute: number;
  readonly baseSpeechDurationMs: number;
  readonly punctuationPauseDurationMs: number;
  readonly paragraphPauseDurationMs: number;
  readonly chapterPauseDurationMs: number;
  readonly totalDurationMs: number;
  readonly preferredDeltaMs: number | null;
  readonly preferredDeltaPercent: number | null;
  readonly withinAllowedRange: boolean;
  readonly aboveHardMaximum: boolean;
  readonly estimatorVersion: typeof HISTORY_TIMING_ESTIMATOR_V33;
  readonly measuredAudioSha256?: string;
}

export interface TimingProfileV3_3 {
  readonly wordsPerMinute: number;
  readonly commaPauseMs: number;
  readonly terminalPauseMs: number;
  readonly paragraphPauseMs: number;
  readonly chapterPauseMs: number;
  readonly punctuationPauseCapMs: number;
  readonly paragraphPauseCapMs: number;
  readonly chapterPauseCapMs: number;
}

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const countWords = (text: string): number =>
  [...new Intl.Segmenter("en", { granularity: "word" }).segment(text)].filter(
    (part) => part.isWordLike
  ).length;

const stripInlineMarkdown = (line: string): string =>
  line
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/<((?:https?:\/\/|mailto:)[^>]+)>/giu, "$1")
    .replace(/(?:\*\*|__|~~|`)/gu, "")
    .replace(/(?<!\*)\*(?!\*)/gu, "")
    .replace(/(?<!_)_(?!_)/gu, "")
    .replace(/^\s*(?:>|[-+*]|\d+[.)])\s+/u, "")
    .replace(/[\t ]+/gu, " ")
    .trim();

const spokenParagraphs = (raw: string): string[] => {
  const normalizedLines = raw
    .normalize("NFKC")
    .replace(/\r\n?/gu, "\n")
    .split("\n");
  const paragraphs: string[] = [];
  let current: string[] = [];
  const flush = (): void => {
    const value = current.join(" ").replace(/\s+/gu, " ").trim();
    if (value && /[\p{L}\p{N}]/u.test(value)) paragraphs.push(value);
    current = [];
  };
  for (const rawLine of normalizedLines) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    if (/^#{1,6}(?:\s+|$)/u.test(line)) {
      flush();
      continue;
    }
    const spoken = stripInlineMarkdown(line);
    if (spoken && /[\p{L}\p{N}]/u.test(spoken)) current.push(spoken);
  }
  flush();
  return paragraphs;
};

export function normalizeHistoryNarrationV33(input: {
  readonly episodeId: string;
  readonly rawScript: string;
}): CanonicalNarrationV3_3 {
  const paragraphs = spokenParagraphs(input.rawScript);
  if (!paragraphs.length)
    throw new Error("History V3.3 narration contains no spoken content.");
  const normalizedText = paragraphs.join("\n\n");
  const narrationHash = sha256(normalizedText);
  const units: CanonicalNarrationUnitV3_3[] = [];
  const sentenceSegmenter = new Intl.Segmenter("en", {
    granularity: "sentence",
  });
  let paragraphStart = 0;
  for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
    const segments = [...sentenceSegmenter.segment(paragraph)]
      .map((segment) => ({
        start: segment.index,
        text: segment.segment,
      }))
      .filter((segment) => /[\p{L}\p{N}]/u.test(segment.text));
    const selected = segments.length
      ? segments
      : [{ start: 0, text: paragraph }];
    for (const segment of selected) {
      const leading = segment.text.match(/^\s*/u)?.[0].length ?? 0;
      const trailing = segment.text.match(/\s*$/u)?.[0].length ?? 0;
      const text = segment.text.slice(
        leading,
        trailing ? segment.text.length - trailing : undefined
      );
      if (!text) continue;
      const startUtf16 = paragraphStart + segment.start + leading;
      const endUtf16Exclusive = startUtf16 + text.length;
      const ordinal = units.length + 1;
      units.push({
        id: `unit-${String(ordinal).padStart(4, "0")}-${sha256(
          [
            input.episodeId,
            narrationHash,
            String(startUtf16),
            String(endUtf16Exclusive),
            text,
          ].join("\u0000")
        ).slice(0, 16)}`,
        startUtf16,
        endUtf16Exclusive,
        text,
        kind: selected.length === 1 ? "paragraph" : "sentence",
        paragraphIndex,
        wordCount: countWords(text),
        textSha256: sha256(text),
      });
    }
    paragraphStart += paragraph.length + (paragraphIndex < paragraphs.length - 1 ? 2 : 0);
  }
  assertCanonicalNarrationV33({ normalizedText, units });
  return {
    normalizationVersion: HISTORY_NARRATION_NORMALIZATION_V33,
    offsetEncoding: "UTF-16 code units",
    unicodeNormalization: "NFKC",
    lineEndings: "LF",
    headingTreatment: "removed-as-non-spoken",
    markdownTreatment: "inline-markup-removed-link-text-preserved",
    punctuationTreatment: "preserved",
    paragraphSeparator: "\n\n",
    rawScriptSha256: sha256(
      input.rawScript.normalize("NFC").replace(/\r\n?/gu, "\n")
    ),
    normalizedTextSha256: narrationHash,
    normalizedText,
    units,
  };
}

export function assertCanonicalNarrationV33(input: {
  readonly normalizedText: string;
  readonly units: readonly CanonicalNarrationUnitV3_3[];
}): void {
  let previousEnd = 0;
  const seenIds = new Set<string>();
  for (const unit of input.units) {
    if (seenIds.has(unit.id)) throw new Error(`Duplicate narration unit ID ${unit.id}.`);
    seenIds.add(unit.id);
    if (
      unit.startUtf16 < 0 ||
      unit.startUtf16 >= unit.endUtf16Exclusive ||
      unit.endUtf16Exclusive > input.normalizedText.length
    )
      throw new Error(`Narration unit ${unit.id} has an invalid UTF-16 span.`);
    if (
      input.normalizedText.slice(unit.startUtf16, unit.endUtf16Exclusive) !==
      unit.text
    )
      throw new Error(`Narration unit ${unit.id} does not slice to its text.`);
    if (unit.startUtf16 < previousEnd)
      throw new Error(`Narration unit ${unit.id} overlaps its predecessor.`);
    const gap = input.normalizedText.slice(previousEnd, unit.startUtf16);
    if (gap && !/^\s+$/u.test(gap))
      throw new Error(`Narration gap before ${unit.id} contains spoken text.`);
    const before = input.normalizedText[unit.startUtf16 - 1];
    const first = input.normalizedText[unit.startUtf16];
    const last = input.normalizedText[unit.endUtf16Exclusive - 1];
    const after = input.normalizedText[unit.endUtf16Exclusive];
    if (before && first && /[\p{L}\p{N}]/u.test(before) && /[\p{L}\p{N}]/u.test(first))
      throw new Error(`Narration unit ${unit.id} starts inside a word.`);
    if (last && after && /[\p{L}\p{N}]/u.test(last) && /[\p{L}\p{N}]/u.test(after))
      throw new Error(`Narration unit ${unit.id} ends inside a word.`);
    previousEnd = unit.endUtf16Exclusive;
  }
  const tail = input.normalizedText.slice(previousEnd);
  if (tail && !/^\s*$/u.test(tail))
    throw new Error("Canonical narration has uncovered spoken text at the end.");
}

export const HISTORY_LONG_FORM_DURATION_POLICY_V33: DurationPolicyV3_3 = {
  profile: "history-long-form",
  preferredDurationMs: 600_000,
  allowedMinDurationMs: 480_000,
  allowedMaxDurationMs: 1_200_000,
  hardMaxDurationMs: 1_200_000,
  editorialTolerancePercent: 10,
  estimatedOnlyProductionApproval: false,
  policyVersion: "history-duration-policy.v3.3.0",
};

export const HISTORY_TIMING_PROFILE_V33: TimingProfileV3_3 = {
  wordsPerMinute: 108,
  commaPauseMs: 55,
  terminalPauseMs: 110,
  paragraphPauseMs: 220,
  chapterPauseMs: 450,
  punctuationPauseCapMs: 15_000,
  paragraphPauseCapMs: 12_000,
  chapterPauseCapMs: 6_000,
};

export function estimateHistoryTimingV33(input: {
  readonly narration: CanonicalNarrationV3_3;
  readonly durationPolicy?: DurationPolicyV3_3;
  readonly timingProfile?: TimingProfileV3_3;
  readonly chapterCount?: number;
  readonly measurement?: {
    readonly source: "measured-tts" | "measured-final-audio";
    readonly durationMs: number;
    readonly audioSha256: string;
  };
}): TimingResultV3_3 {
  const policy = input.durationPolicy ?? HISTORY_LONG_FORM_DURATION_POLICY_V33;
  const profile = input.timingProfile ?? HISTORY_TIMING_PROFILE_V33;
  if (!Number.isFinite(profile.wordsPerMinute) || profile.wordsPerMinute <= 0)
    throw new Error("History V3.3 timing WPM must be positive.");
  const normalizedWordCount = input.narration.units.reduce(
    (sum, unit) => sum + unit.wordCount,
    0
  );
  const baseSpeechDurationMs = Math.round(
    (normalizedWordCount / profile.wordsPerMinute) * 60_000
  );
  const punctuationPauseDurationMs = Math.min(
    profile.punctuationPauseCapMs,
    (input.narration.normalizedText.match(/[,;:\u2014\u2013]/gu)?.length ?? 0) *
      profile.commaPauseMs +
      (input.narration.normalizedText.match(/[.!?]/gu)?.length ?? 0) *
        profile.terminalPauseMs
  );
  const paragraphCount = new Set(
    input.narration.units.map((unit) => unit.paragraphIndex)
  ).size;
  const paragraphPauseDurationMs = Math.min(
    profile.paragraphPauseCapMs,
    Math.max(0, paragraphCount - 1) * profile.paragraphPauseMs
  );
  const chapterPauseDurationMs = Math.min(
    profile.chapterPauseCapMs,
    Math.max(0, (input.chapterCount ?? 1) - 1) * profile.chapterPauseMs
  );
  const estimatedTotal =
    baseSpeechDurationMs +
    punctuationPauseDurationMs +
    paragraphPauseDurationMs +
    chapterPauseDurationMs;
  const totalDurationMs = input.measurement?.durationMs ?? estimatedTotal;
  if (!Number.isInteger(totalDurationMs) || totalDurationMs <= 0)
    throw new Error("History V3.3 measured duration must be a positive integer.");
  const preferredDeltaMs =
    policy.preferredDurationMs === null
      ? null
      : totalDurationMs - policy.preferredDurationMs;
  return {
    timingSource: input.measurement?.source ?? "provisional-text-estimate",
    normalizedWordCount,
    configuredWordsPerMinute: profile.wordsPerMinute,
    baseSpeechDurationMs,
    punctuationPauseDurationMs,
    paragraphPauseDurationMs,
    chapterPauseDurationMs,
    totalDurationMs,
    preferredDeltaMs,
    preferredDeltaPercent:
      preferredDeltaMs === null || policy.preferredDurationMs === null
        ? null
        : Number(((preferredDeltaMs / policy.preferredDurationMs) * 100).toFixed(3)),
    withinAllowedRange:
      totalDurationMs >= policy.allowedMinDurationMs &&
      totalDurationMs <= policy.allowedMaxDurationMs,
    aboveHardMaximum: totalDurationMs > policy.hardMaxDurationMs,
    estimatorVersion: HISTORY_TIMING_ESTIMATOR_V33,
    ...(input.measurement
      ? { measuredAudioSha256: input.measurement.audioSha256 }
      : {}),
  };
}

export function allocateHistoryTimingV33(
  totalDurationMs: number,
  weights: readonly number[]
): number[] {
  if (!Number.isInteger(totalDurationMs) || totalDurationMs < 0)
    throw new Error("History V3.3 duration must be a non-negative integer.");
  if (!weights.length) return [];
  const safe = weights.map((weight) => (weight > 0 ? weight : 0));
  const denominator = safe.reduce((sum, weight) => sum + weight, 0);
  const raw = denominator
    ? safe.map((weight) => (totalDurationMs * weight) / denominator)
    : safe.map(() => totalDurationMs / safe.length);
  const allocated = raw.map(Math.floor);
  let remainder = totalDurationMs - allocated.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (const item of order) {
    if (remainder-- <= 0) break;
    allocated[item.index]! += 1;
  }
  return allocated;
}
