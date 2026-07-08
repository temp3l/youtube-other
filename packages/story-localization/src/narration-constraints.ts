import {
  countSpokenWords,
  normalizeWhitespace,
  splitIntoSentences,
} from "@mediaforge/shared";
import {
  type LanguageCode,
  type NarrationPace,
} from "./story-localization.types.js";
export type NarrationVariant = "full" | "short";

export interface NarrationWordRangeInput {
  readonly wordsPerMinute: number;
  readonly minDurationSeconds: number;
  readonly targetDurationSeconds: number;
  readonly maxDurationSeconds: number;
}

export interface NarrationWordRange {
  readonly min: number;
  readonly target: number;
  readonly max: number;
}

export interface NarrationDurationWindow {
  readonly minSeconds: number;
  readonly targetSeconds: number;
  readonly maxSeconds: number;
}

export type ShortTargetDurationSeconds = 30 | 45 | 60 | 75;

export interface ShortDurationProfile {
  readonly durationSeconds: ShortTargetDurationSeconds;
  readonly targetDuration: NarrationDurationWindow;
  readonly targetWordRange: NarrationWordRange;
  readonly targetNarrationWpm: number;
}

export interface NarrationTimingEstimate {
  readonly spokenWordDurationMs: number;
  readonly punctuationPauseMs: number;
  readonly suspensePauseMs: number;
  readonly revealPauseMs: number;
  readonly paragraphPauseMs: number;
  readonly totalDurationMs: number;
}

export const DEFAULT_SHORT_DURATION_WINDOW: NarrationDurationWindow = {
  minSeconds: 55,
  targetSeconds: 60,
  maxSeconds: 65,
} as const;

const SHORT_TARGET_DURATION_WINDOWS: Readonly<
  Record<ShortTargetDurationSeconds, NarrationDurationWindow>
> = {
  30: { minSeconds: 28, targetSeconds: 30, maxSeconds: 33 },
  45: { minSeconds: 42, targetSeconds: 45, maxSeconds: 48 },
  60: DEFAULT_SHORT_DURATION_WINDOW,
  75: { minSeconds: 70, targetSeconds: 75, maxSeconds: 80 },
} as const;

const SHORT_DURATION_WORD_RANGES: Readonly<
  Record<
    LanguageCode,
    Readonly<Record<ShortTargetDurationSeconds, NarrationWordRange>>
  >
> = {
  en: {
    30: { min: 65, target: 72, max: 80 },
    45: { min: 95, target: 105, max: 115 },
    60: { min: 150, target: 160, max: 170 },
    75: { min: 155, target: 170, max: 185 },
  },
  de: {
    30: { min: 60, target: 66, max: 72 },
    45: { min: 85, target: 95, max: 105 },
    60: { min: 155, target: 168, max: 180 },
    75: { min: 145, target: 158, max: 170 },
  },
  es: {
    30: { min: 62, target: 70, max: 78 },
    45: { min: 90, target: 100, max: 112 },
    60: { min: 120, target: 132, max: 145 },
    75: { min: 150, target: 164, max: 178 },
  },
  fr: {
    30: { min: 60, target: 68, max: 76 },
    45: { min: 88, target: 98, max: 108 },
    60: { min: 118, target: 130, max: 142 },
    75: { min: 148, target: 162, max: 176 },
  },
  pt: {
    30: { min: 62, target: 70, max: 78 },
    45: { min: 90, target: 100, max: 112 },
    60: { min: 120, target: 132, max: 145 },
    75: { min: 150, target: 164, max: 178 },
  },
} as const;

export const FAST_NARRATION_WPM = {
  en: { full: 190, short: 205 },
  de: { full: 180, short: 195 },
  es: { full: 190, short: 205 },
  fr: { full: 185, short: 198 },
  pt: { full: 190, short: 205 },
} as const satisfies Readonly<Record<LanguageCode, Readonly<Record<NarrationVariant, number>>>>;

export const NORMAL_NARRATION_WPM = {
  en: { full: 178, short: 180 },
  de: { full: 168, short: 170 },
  es: { full: 175, short: 178 },
  fr: { full: 172, short: 172 },
  pt: { full: 175, short: 178 },
} as const satisfies Readonly<Record<LanguageCode, Readonly<Record<NarrationVariant, number>>>>;

export function calculateNarrationWordRange(
  input: NarrationWordRangeInput
): NarrationWordRange {
  return {
    min: Math.floor((input.wordsPerMinute * input.minDurationSeconds) / 60),
    target: Math.round((input.wordsPerMinute * input.targetDurationSeconds) / 60),
    max: Math.ceil((input.wordsPerMinute * input.maxDurationSeconds) / 60),
  };
}

export function resolveNarrationWordsPerMinute(args: {
  readonly language: LanguageCode;
  readonly variant: NarrationVariant;
  readonly pace?: NarrationPace | undefined;
}): number {
  const pace = args.pace ?? "fast";
  const registry = pace === "fast" ? FAST_NARRATION_WPM : NORMAL_NARRATION_WPM;
  return registry[args.language][args.variant];
}

export function resolveShortNarrationWordRange(args: {
  readonly language: LanguageCode;
  readonly pace?: NarrationPace | undefined;
  readonly duration?: NarrationDurationWindow;
}): NarrationWordRange {
  if (args.duration) {
    const matchingDuration = resolveShortTargetDurationSeconds(args.duration);
    if (matchingDuration) {
      return SHORT_DURATION_WORD_RANGES[args.language][matchingDuration];
    }
  }
  const duration = args.duration ?? DEFAULT_SHORT_DURATION_WINDOW;
  return calculateNarrationWordRange({
    wordsPerMinute: resolveNarrationWordsPerMinute({
      language: args.language,
      variant: "short",
      pace: args.pace,
    }),
    minDurationSeconds: duration.minSeconds,
    targetDurationSeconds: duration.targetSeconds,
    maxDurationSeconds: duration.maxSeconds,
  });
}

export function resolveShortTargetDurationSeconds(
  duration: NarrationDurationWindow
): ShortTargetDurationSeconds | null {
  const exact = ([
    30, 45, 60, 75,
  ] as const).find((seconds) => duration.targetSeconds === seconds);
  if (exact !== undefined) {
    return exact;
  }
  const target = duration.targetSeconds;
  if (target <= 37) {
    return 30;
  }
  if (target <= 52) {
    return 45;
  }
  if (target <= 67) {
    return 60;
  }
  return target <= 82 ? 75 : null;
}

export function resolveShortDurationProfile(args: {
  readonly language: LanguageCode;
  readonly durationSeconds: ShortTargetDurationSeconds;
}): ShortDurationProfile {
  const targetWordRange = SHORT_DURATION_WORD_RANGES[args.language][
    args.durationSeconds
  ];
  return {
    durationSeconds: args.durationSeconds,
    targetDuration: SHORT_TARGET_DURATION_WINDOWS[args.durationSeconds],
    targetWordRange,
    targetNarrationWpm: Math.round(
      (targetWordRange.target / args.durationSeconds) * 60
    ),
  };
}

const TIMING_CONFIG: Readonly<
  Record<
    LanguageCode,
    Readonly<{
      readonly spokenWordDurationMs: number;
      readonly punctuationPauseMs: number;
      readonly suspensePauseMs: number;
      readonly revealPauseMs: number;
      readonly paragraphPauseMs: number;
    }>
  >
> = {
  en: {
    spokenWordDurationMs: 308,
    punctuationPauseMs: 120,
    suspensePauseMs: 140,
    revealPauseMs: 90,
    paragraphPauseMs: 180,
  },
  de: {
    spokenWordDurationMs: 325,
    punctuationPauseMs: 130,
    suspensePauseMs: 150,
    revealPauseMs: 95,
    paragraphPauseMs: 190,
  },
  es: {
    spokenWordDurationMs: 316,
    punctuationPauseMs: 125,
    suspensePauseMs: 145,
    revealPauseMs: 95,
    paragraphPauseMs: 185,
  },
  fr: {
    spokenWordDurationMs: 322,
    punctuationPauseMs: 128,
    suspensePauseMs: 145,
    revealPauseMs: 95,
    paragraphPauseMs: 185,
  },
  pt: {
    spokenWordDurationMs: 318,
    punctuationPauseMs: 125,
    suspensePauseMs: 145,
    revealPauseMs: 95,
    paragraphPauseMs: 185,
  },
};

export function resolveNarrationTimingEstimate(args: {
  readonly language: LanguageCode;
  readonly narrationText?: string | undefined;
  readonly wordCount?: number | undefined;
  readonly suspensePauseCount?: number | undefined;
  readonly revealPauseCount?: number | undefined;
  readonly paragraphCount?: number | undefined;
}): NarrationTimingEstimate {
  const config = TIMING_CONFIG[args.language];
  const narrationText = normalizeWhitespace(args.narrationText ?? "");
  const wordCount = args.wordCount ?? countSpokenWords(narrationText);
  const sentenceCount = Math.max(1, splitIntoSentences(narrationText).length);
  const paragraphCount =
    args.paragraphCount ??
    Math.max(1, narrationText.split(/\n{2,}/u).filter(Boolean).length);
  const commaCount = (narrationText.match(/,/gu) ?? []).length;
  const spokenWordDurationMs = Math.round(wordCount * config.spokenWordDurationMs);
  const punctuationPauseMs =
    commaCount * config.punctuationPauseMs +
    Math.max(0, sentenceCount - 1) * 220;
  const suspensePauseMs = (args.suspensePauseCount ?? 1) * config.suspensePauseMs;
  const revealPauseMs = (args.revealPauseCount ?? 1) * config.revealPauseMs;
  const paragraphPauseMs =
    Math.max(0, paragraphCount - 1) * config.paragraphPauseMs;
  return {
    spokenWordDurationMs,
    punctuationPauseMs,
    suspensePauseMs,
    revealPauseMs,
    paragraphPauseMs,
    totalDurationMs:
      spokenWordDurationMs +
      punctuationPauseMs +
      suspensePauseMs +
      revealPauseMs +
      paragraphPauseMs,
  };
}

export function estimateNarrationDurationSeconds(args: {
  readonly language: LanguageCode;
  readonly narrationText: string;
}): number {
  return Math.round(
    resolveNarrationTimingEstimate(args).totalDurationMs / 1000
  );
}
