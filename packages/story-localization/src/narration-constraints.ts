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

export const DEFAULT_SHORT_DURATION_WINDOW: NarrationDurationWindow = {
  minSeconds: 55,
  targetSeconds: 60,
  maxSeconds: 65,
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
