import { createHash } from "node:crypto";

export const HISTORY_TIMING_V32 = "history-timing.v3.2.0" as const;
export const HISTORY_TIMING_WPM_V32 = 108 as const;

export interface HistoryTimingV32 {
  readonly version: typeof HISTORY_TIMING_V32;
  readonly normalizedNarration: string;
  readonly rawScriptSha256: string;
  readonly normalizedNarrationSha256: string;
  readonly spokenWordCount: number;
  readonly baseSpeechMs: number;
  readonly punctuationPauseMs: number;
  readonly paragraphPauseMs: number;
  readonly chapterPauseMs: number;
  readonly totalDurationMs: number;
}

export interface HistoryTimingOptionsV32 {
  readonly wordsPerMinute?: number;
  readonly paragraphCount?: number;
  readonly chapterCount?: number;
  /** Audited TTS-normalized count supplied by a versioned canonical importer. */
  readonly spokenWordCount?: number;
}

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

/** This is deliberately small and idempotent: planner timing has no provider dependency. */
export function normalizeHistoryNarrationV32(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/\b(\d+)\b/gu, "$1")
    .replace(/\b([A-Za-z])\.([A-Za-z])\./gu, "$1 $2")
    .replace(/\s+/gu, " ")
    .trim();
}

const wordCount = (text: string): number => {
  const segmenter = new Intl.Segmenter("en", { granularity: "word" });
  return [...segmenter.segment(text)].filter((part) => part.isWordLike).length;
};

export function estimateHistoryTimingV32(
  rawNarration: string,
  options: HistoryTimingOptionsV32 = {}
): HistoryTimingV32 {
  const normalizedNarration = normalizeHistoryNarrationV32(rawNarration);
  const spokenWordCount = options.spokenWordCount ?? wordCount(normalizedNarration);
  if (!Number.isInteger(spokenWordCount) || spokenWordCount < 0)
    throw new Error("History timing spoken-word count must be a non-negative integer.");
  const wordsPerMinute = options.wordsPerMinute ?? HISTORY_TIMING_WPM_V32;
  if (!Number.isFinite(wordsPerMinute) || wordsPerMinute <= 0)
    throw new Error("History timing WPM must be positive.");
  const baseSpeechMs = Math.round((spokenWordCount / wordsPerMinute) * 60_000);
  const punctuationRaw =
    (normalizedNarration.match(/[,;:—–]/gu)?.length ?? 0) * 60 +
    (normalizedNarration.match(/[.!?]/gu)?.length ?? 0) * 120;
  const punctuationPauseMs = Math.min(
    15_000,
    Math.floor(baseSpeechMs * 0.015),
    punctuationRaw
  );
  const paragraphPauseMs = Math.min(
    12_000,
    Math.floor(baseSpeechMs * 0.015),
    Math.max(0, (options.paragraphCount ?? 0) - 1) * 250
  );
  const chapterPauseMs = Math.min(
    6_000,
    Math.floor(baseSpeechMs * 0.01),
    Math.max(0, (options.chapterCount ?? 0) - 1) * 500
  );
  return {
    version: HISTORY_TIMING_V32,
    normalizedNarration,
    rawScriptSha256: sha256(rawNarration.normalize("NFC").replace(/\r\n?/gu, "\n")),
    normalizedNarrationSha256: sha256(normalizedNarration),
    spokenWordCount,
    baseSpeechMs,
    punctuationPauseMs,
    paragraphPauseMs,
    chapterPauseMs,
    totalDurationMs:
      baseSpeechMs + punctuationPauseMs + paragraphPauseMs + chapterPauseMs,
  };
}

/** Largest-remainder allocation, with no invented per-unit duration. */
export function allocateHistoryTimingV32(
  totalDurationMs: number,
  weights: readonly number[]
): number[] {
  if (!Number.isInteger(totalDurationMs) || totalDurationMs < 0)
    throw new Error("History timing duration must be a non-negative integer.");
  if (weights.length === 0) return [];
  const normalized = weights.map((weight) => (weight > 0 ? weight : 0));
  const denominator = normalized.reduce((sum, weight) => sum + weight, 0);
  if (denominator === 0) return weights.map((_weight, index) =>
    Math.floor(totalDurationMs / weights.length) +
    (index < totalDurationMs % weights.length ? 1 : 0)
  );
  const raw = normalized.map((weight) => (totalDurationMs * weight) / denominator);
  const allocation = raw.map(Math.floor);
  let remainder = totalDurationMs - allocation.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (const item of order) {
    if (remainder-- <= 0) break;
    allocation[item.index]! += 1;
  }
  return allocation;
}

export function classifyHistoryTimingDeltaV32(
  plannedMs: number,
  declaredMs: number | undefined
): "pass" | "warning" | "block" {
  if (declaredMs === undefined) return "pass";
  const delta = Math.abs(plannedMs - declaredMs);
  const passTolerance = Math.max(5_000, declaredMs * 0.01);
  const warningTolerance = Math.max(60_000, declaredMs * 0.1);
  return delta <= passTolerance ? "pass" : delta <= warningTolerance ? "warning" : "block";
}
