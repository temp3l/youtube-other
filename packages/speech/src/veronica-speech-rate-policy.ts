import { VERONICA_PLANNING_TIMING_POLICY } from "@mediaforge/domain";
import type { LanguageCode } from "@mediaforge/story-localization";
import type { NarrationVariant } from "./narration-schemas.js";

/**
 * Target WPM is used for script planning and speech-rate QA only. Once selected
 * audio exists, its measured duration is the canonical timing authority.
 */
export const VERONICA_SPEECH_RATE_POLICY_VERSION =
  "veronica-speech-rate.v1" as const;

export type VeronicaSpeechRateLocale = LanguageCode;
export type VeronicaSpeechRateVariant = NarrationVariant;

export interface VeronicaSpeechRatePolicy {
  readonly targetWpm: number;
  readonly softMinWpm: number;
  readonly softMaxWpm: number;
  readonly hardMinWpm: number;
  readonly hardMaxWpm: number;
}

const policy = (
  targetWpm: number,
  softMinWpm: number,
  softMaxWpm: number
): VeronicaSpeechRatePolicy =>
  Object.freeze({
    targetWpm,
    softMinWpm,
    softMaxWpm,
    hardMinWpm: softMinWpm - 15,
    hardMaxWpm: softMaxWpm + 15,
  });

export const VERONICA_SPEECH_RATE_POLICY: Readonly<
  Record<
    VeronicaSpeechRateVariant,
    Readonly<Record<VeronicaSpeechRateLocale, VeronicaSpeechRatePolicy>>
  >
> = Object.freeze({
  full: Object.freeze({
    en: policy(VERONICA_PLANNING_TIMING_POLICY.long.wpm.en, 140, 160),
    de: policy(VERONICA_PLANNING_TIMING_POLICY.long.wpm.de, 135, 155),
    es: policy(VERONICA_PLANNING_TIMING_POLICY.long.wpm.es, 140, 160),
    it: policy(VERONICA_PLANNING_TIMING_POLICY.long.wpm.it, 140, 160),
    fr: policy(VERONICA_PLANNING_TIMING_POLICY.long.wpm.fr, 140, 160),
    pt: policy(VERONICA_PLANNING_TIMING_POLICY.long.wpm.pt, 140, 160),
  }),
  short: Object.freeze({
    en: policy(VERONICA_PLANNING_TIMING_POLICY.short.wpm.en, 145, 165),
    de: policy(VERONICA_PLANNING_TIMING_POLICY.short.wpm.de, 140, 160),
    es: policy(VERONICA_PLANNING_TIMING_POLICY.short.wpm.es, 145, 165),
    it: policy(VERONICA_PLANNING_TIMING_POLICY.short.wpm.it, 145, 165),
    fr: policy(VERONICA_PLANNING_TIMING_POLICY.short.wpm.fr, 145, 165),
    pt: policy(VERONICA_PLANNING_TIMING_POLICY.short.wpm.pt, 145, 165),
  }),
});

export const VERONICA_SCRIPT_DURATION_GUIDANCE_SECONDS: Readonly<
  Record<VeronicaSpeechRateVariant, readonly [number, number]>
> = Object.freeze({
  full: VERONICA_PLANNING_TIMING_POLICY.long.planningSeconds,
  short: [
    (VERONICA_PLANNING_TIMING_POLICY.short.planningWords.en[0] /
      VERONICA_PLANNING_TIMING_POLICY.short.wpm.en) * 60,
    (VERONICA_PLANNING_TIMING_POLICY.short.planningWords.de[1] /
      VERONICA_PLANNING_TIMING_POLICY.short.wpm.de) * 60,
  ],
});

function normalizeLocale(locale: string): VeronicaSpeechRateLocale {
  switch (locale.trim().toLowerCase().split("-", 1)[0]) {
    case "en":
      return "en";
    case "de":
      return "de";
    case "es":
      return "es";
    case "it":
      return "it";
    case "fr":
      return "fr";
    case "pt":
      return "pt";
    default:
      throw new Error(
        `Unsupported Veronica speech-rate locale "${locale}". Expected en, de, es, it, fr, or pt.`
      );
  }
}

function normalizeVariant(variant: string): VeronicaSpeechRateVariant {
  if (variant === "full" || variant === "short") return variant;
  throw new Error(
    `Unsupported Veronica speech-rate variant "${variant}". Expected full or short.`
  );
}

export function getVeronicaSpeechRatePolicy(input: {
  readonly locale: string;
  readonly variant: string;
}): VeronicaSpeechRatePolicy {
  return VERONICA_SPEECH_RATE_POLICY[normalizeVariant(input.variant)][
    normalizeLocale(input.locale)
  ];
}

export function estimateVeronicaSpeechDurationSeconds(input: {
  readonly spokenWordCount: number;
  readonly policy: VeronicaSpeechRatePolicy;
}): number {
  if (!Number.isInteger(input.spokenWordCount) || input.spokenWordCount < 0)
    throw new Error("Spoken word count must be a non-negative integer.");
  return (input.spokenWordCount / input.policy.targetWpm) * 60;
}

export function getVeronicaScriptLengthGuidance(input: {
  readonly locale: string;
  readonly variant: string;
}): {
  readonly targetWpm: number;
  readonly durationRangeSeconds: readonly [number, number];
  readonly spokenWordCountRange: readonly [number, number];
} {
  const variant = normalizeVariant(input.variant);
  const resolvedPolicy = getVeronicaSpeechRatePolicy({
    locale: input.locale,
    variant,
  });
  const locale = normalizeLocale(input.locale);
  const shortWords = VERONICA_PLANNING_TIMING_POLICY.short.planningWords[locale];
  const durationRangeSeconds: readonly [number, number] = variant === "short"
    ? [
        (shortWords[0] / resolvedPolicy.targetWpm) * 60,
        (shortWords[1] / resolvedPolicy.targetWpm) * 60,
      ]
    : VERONICA_SCRIPT_DURATION_GUIDANCE_SECONDS[variant];
  return {
    targetWpm: resolvedPolicy.targetWpm,
    durationRangeSeconds,
    spokenWordCountRange: variant === "short"
      ? VERONICA_PLANNING_TIMING_POLICY.short.planningWords[locale]
      : [
          (durationRangeSeconds[0] * resolvedPolicy.targetWpm) / 60,
          (durationRangeSeconds[1] * resolvedPolicy.targetWpm) / 60,
        ],
  };
}

export type VeronicaSpeechRateStatus =
  | "within-target"
  | "soft-low"
  | "soft-high"
  | "hard-low"
  | "hard-high"
  | "unavailable";

export interface VeronicaSpeechRateAssessment {
  readonly policyVersion: typeof VERONICA_SPEECH_RATE_POLICY_VERSION;
  readonly targetWpm: number;
  readonly softMinWpm: number;
  readonly softMaxWpm: number;
  readonly hardMinWpm: number;
  readonly hardMaxWpm: number;
  readonly spokenWordCount: number;
  readonly audioDurationSeconds: number | null;
  readonly observedWpm: number | null;
  readonly status: VeronicaSpeechRateStatus;
}

export function assessVeronicaSpeechRate(input: {
  readonly spokenWordCount: number;
  readonly audioDurationSeconds: number | null | undefined;
  readonly policy: VeronicaSpeechRatePolicy;
}): VeronicaSpeechRateAssessment {
  if (!Number.isInteger(input.spokenWordCount) || input.spokenWordCount < 0)
    throw new Error("Spoken word count must be a non-negative integer.");
  const duration = input.audioDurationSeconds;
  const base = {
    policyVersion: VERONICA_SPEECH_RATE_POLICY_VERSION,
    targetWpm: input.policy.targetWpm,
    softMinWpm: input.policy.softMinWpm,
    softMaxWpm: input.policy.softMaxWpm,
    hardMinWpm: input.policy.hardMinWpm,
    hardMaxWpm: input.policy.hardMaxWpm,
    spokenWordCount: input.spokenWordCount,
  } as const;
  if (
    duration === null ||
    duration === undefined ||
    !Number.isFinite(duration) ||
    duration <= 0
  )
    return {
      ...base,
      audioDurationSeconds: null,
      observedWpm: null,
      status: "unavailable",
    };
  const observedWpm = (input.spokenWordCount / duration) * 60;
  const status: VeronicaSpeechRateStatus =
    observedWpm < input.policy.hardMinWpm
      ? "hard-low"
      : observedWpm < input.policy.softMinWpm
        ? "soft-low"
        : observedWpm > input.policy.hardMaxWpm
          ? "hard-high"
          : observedWpm > input.policy.softMaxWpm
            ? "soft-high"
            : "within-target";
  return { ...base, audioDurationSeconds: duration, observedWpm, status };
}
