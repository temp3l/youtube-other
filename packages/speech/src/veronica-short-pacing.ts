import { z } from "zod";
import { calculateAdaptiveWordsPerMinute } from "./adaptive-pacing.js";
import { getVeronicaSpeechRatePolicy } from "./veronica-speech-rate-policy.js";

export const VERONICA_SHORT_PACING_POLICY_VERSION =
  "veronica-short-natural-pacing-v3" as const;
export const VERONICA_SHORT_PACING_CALIBRATION_SCHEMA_VERSION =
  "veronica-short-pacing-calibration-v3" as const;

export type VeronicaShortDurationAcceptanceStatus =
  | "NORMAL_SHORT"
  | "LONG_SHORT_EDITORIAL_REVIEW"
  | "SHORT_PLATFORM_DURATION_EXCEEDED";

export type VeronicaShortPacingStatus =
  | "NATURAL"
  | "SLIGHTLY_FAST"
  | "FAST"
  | "VERY_FAST"
  | "SLIGHTLY_SLOW"
  | "SLOW";

export interface VeronicaShortPacingPolicy {
  readonly enabled: true;
  readonly mode: "pacing-first-content-length-aware";
  readonly pacingPolicyVersion: typeof VERONICA_SHORT_PACING_POLICY_VERSION;
  readonly profileId: "conceptual-explainer";
  readonly platformMaximumDurationSeconds: 180;
  readonly editorialLongShortReviewThresholdSeconds: 120;
  /** Compatibility envelope; this is not an optimization target. */
  readonly preferredDurationRangeSeconds: readonly [0.001, 180];
  readonly targetDurationSeconds: 120;
  readonly preferredWpmRange?: readonly [number, number];
  readonly softAcceptableWpmRange?: readonly [number, number];
  readonly minimumSpeed: number;
  readonly maximumSpeed: number;
  readonly maximumAdjustmentPerAttempt: number;
  readonly maxCalibrationAttempts: number;
  readonly durationToleranceSeconds: number;
  readonly fallbackBehavior: "select-best-safe-natural-candidate";
}

export function resolveVeronicaShortPacingPolicy(
  locale: string
): VeronicaShortPacingPolicy | undefined {
  let guidance: ReturnType<typeof getVeronicaSpeechRatePolicy>;
  try {
    guidance = getVeronicaSpeechRatePolicy({ locale, variant: "short" });
  } catch {
    return undefined;
  }
  return {
    enabled: true,
    mode: "pacing-first-content-length-aware",
    pacingPolicyVersion: VERONICA_SHORT_PACING_POLICY_VERSION,
    profileId: "conceptual-explainer",
    platformMaximumDurationSeconds: 180,
    editorialLongShortReviewThresholdSeconds: 120,
    preferredDurationRangeSeconds: [0.001, 180],
    targetDurationSeconds: 120,
    preferredWpmRange: [guidance.softMinWpm, guidance.softMaxWpm],
    softAcceptableWpmRange: [guidance.hardMinWpm, guidance.hardMaxWpm],
    minimumSpeed: 0.75,
    // Covers the configured provider baselines (German Shorts currently use
    // 1.6) while observed WPM, not this provider-specific value, controls QA.
    maximumSpeed: 2,
    maximumAdjustmentPerAttempt: 0.12,
    // One initial synthesis plus at most one measured, controlled remediation.
    maxCalibrationAttempts: 2,
    durationToleranceSeconds: 0.02,
    fallbackBehavior: "select-best-safe-natural-candidate",
  };
}

export interface VeronicaShortPacingAttempt {
  readonly attemptIndex: number;
  readonly requestedSpeed: number;
  readonly speedSource: "baseline" | "measured-correction";
  readonly cacheHit: boolean;
  readonly audioHash: string;
  readonly measuredDurationSeconds: number;
  readonly measuredWpm: number;
  readonly durationDeltaSeconds: number;
  readonly speedClampApplied: boolean;
  readonly pacingStatus: VeronicaShortPacingStatus;
  readonly durationAcceptanceStatus: VeronicaShortDurationAcceptanceStatus;
  readonly selected: boolean;
}

const currentAttemptSchema = z
  .object({
    attemptIndex: z.number().int().positive(),
    requestedSpeed: z.number().positive(),
    speedSource: z.enum(["baseline", "measured-correction"]),
    cacheHit: z.boolean(),
    audioHash: z.string().regex(/^[a-f0-9]{64}$/u),
    measuredDurationSeconds: z.number().positive(),
    measuredWpm: z.number().nonnegative(),
    durationDeltaSeconds: z.number(),
    speedClampApplied: z.boolean(),
    pacingStatus: z.enum([
      "NATURAL",
      "SLIGHTLY_FAST",
      "FAST",
      "VERY_FAST",
      "SLIGHTLY_SLOW",
      "SLOW",
    ]),
    durationAcceptanceStatus: z.enum([
      "NORMAL_SHORT",
      "LONG_SHORT_EDITORIAL_REVIEW",
      "SHORT_PLATFORM_DURATION_EXCEEDED",
    ]),
    selected: z.boolean(),
  })
  .strict();

const legacyAttemptSchema = z
  .object({
    attemptIndex: z.number().int().positive(),
    requestedSpeed: z.number().positive(),
    speedSource: z.enum(["baseline", "measured-correction"]),
    cacheHit: z.boolean(),
    audioHash: z.string().regex(/^[a-f0-9]{64}$/u),
    measuredDurationSeconds: z.number().positive(),
    measuredWpm: z.number().nonnegative(),
    durationDeltaSeconds: z.number(),
    speedClampApplied: z.boolean(),
    pacingStatus: z.enum([
      "within-target",
      "slightly-fast",
      "fast",
      "very-fast",
      "slightly-slow",
      "slow",
    ]),
    durationAcceptanceStatus: z.enum([
      "WITHIN_PREFERRED_RANGE",
      "WITHIN_ACCEPTANCE_TOLERANCE",
      "PACING_TARGET_MISSED",
    ]),
    selected: z.boolean(),
  })
  .strict();

const sharedCalibrationShape = {
  contentId: z.string().min(1),
  locale: z.string().min(1),
  variant: z.literal("short"),
  provider: z.string().min(1),
  model: z.string().min(1),
  voice: z.string().min(1),
  narrationHash: z.string().regex(/^[a-f0-9]{64}$/u),
  targetDurationRange: z.tuple([z.number().positive(), z.number().positive()]),
  preferredWpmRange: z
    .tuple([z.number().positive(), z.number().positive()])
    .optional(),
  wordCount: z.number().int().nonnegative(),
  selectedAttempt: z.number().int().positive(),
  selectedSpeed: z.number().positive(),
  selectedDurationSeconds: z.number().positive(),
  selectedWpm: z.number().nonnegative(),
  speedNormalizationApplied: z.boolean(),
  artifactHash: z.string().regex(/^[a-f0-9]{64}$/u),
  selectedAudioHash: z.string().regex(/^[a-f0-9]{64}$/u),
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
} as const;

const currentCalibrationSchema = z
  .object({
    schemaVersion: z.literal(VERONICA_SHORT_PACING_CALIBRATION_SCHEMA_VERSION),
    ...sharedCalibrationShape,
    pacingPolicyVersion: z.literal(VERONICA_SHORT_PACING_POLICY_VERSION),
    pacingProfileId: z.literal("conceptual-explainer"),
    platformMaximumDurationSeconds: z.literal(180),
    editorialLongShortReviewThresholdSeconds: z.literal(120),
    attempts: z.array(currentAttemptSchema).min(1).max(3),
    selectedPacingStatus: currentAttemptSchema.shape.pacingStatus,
    selectedDurationAcceptanceStatus:
      currentAttemptSchema.shape.durationAcceptanceStatus,
    calibrationStatus: currentAttemptSchema.shape.durationAcceptanceStatus,
  })
  .strict();

const legacyCalibrationSchema = z
  .object({
    schemaVersion: z.literal("veronica-short-pacing-calibration-v2"),
    ...sharedCalibrationShape,
    pacingPolicyVersion: z.literal("veronica-short-adaptive-pacing-v2"),
    attempts: z.array(legacyAttemptSchema).min(1).max(3),
    selectedPacingStatus: legacyAttemptSchema.shape.pacingStatus,
    selectedDurationAcceptanceStatus:
      legacyAttemptSchema.shape.durationAcceptanceStatus,
    calibrationStatus: legacyAttemptSchema.shape.durationAcceptanceStatus,
  })
  .strict();

export const veronicaShortPacingCalibrationSchema = z.union([
  currentCalibrationSchema,
  legacyCalibrationSchema,
]);
export type VeronicaShortPacingCalibration = z.infer<
  typeof veronicaShortPacingCalibrationSchema
>;

export function calculateWordsPerMinute(
  wordCount: number,
  durationSeconds: number
): number {
  return calculateAdaptiveWordsPerMinute(wordCount, durationSeconds);
}

export function assessVeronicaShortDurationAcceptance(input: {
  readonly durationSeconds: number;
  readonly policy: VeronicaShortPacingPolicy;
  readonly hardConstraintsPassed: boolean;
}): VeronicaShortDurationAcceptanceStatus {
  if (
    !input.hardConstraintsPassed ||
    input.durationSeconds > input.policy.platformMaximumDurationSeconds
  )
    return "SHORT_PLATFORM_DURATION_EXCEEDED";
  return input.durationSeconds >
    input.policy.editorialLongShortReviewThresholdSeconds
    ? "LONG_SHORT_EDITORIAL_REVIEW"
    : "NORMAL_SHORT";
}

export function assessVeronicaShortPacing(input: {
  readonly durationSeconds: number;
  readonly wordCount: number;
  readonly policy: VeronicaShortPacingPolicy;
}): VeronicaShortPacingStatus {
  const wpm = calculateWordsPerMinute(input.wordCount, input.durationSeconds);
  const preferred = input.policy.preferredWpmRange;
  const soft = input.policy.softAcceptableWpmRange;
  if (!preferred || !soft) return "NATURAL";
  if (wpm >= preferred[0] && wpm <= preferred[1]) return "NATURAL";
  if (wpm > preferred[1])
    return wpm <= soft[1]
      ? "SLIGHTLY_FAST"
      : wpm <= soft[1] + 10
        ? "FAST"
        : "VERY_FAST";
  return wpm >= soft[0] ? "SLIGHTLY_SLOW" : "SLOW";
}

export function estimateVeronicaShortPacingSpeed(input: {
  readonly currentSpeed: number;
  readonly actualDurationSeconds: number;
  readonly wordCount: number;
  readonly policy: VeronicaShortPacingPolicy;
}): { readonly speed: number; readonly clampApplied: boolean } {
  const guidance = input.policy.preferredWpmRange;
  if (!guidance || input.wordCount === 0)
    return { speed: input.currentSpeed, clampApplied: false };
  const targetWpm = (guidance[0] + guidance[1]) / 2;
  const desiredDuration = (input.wordCount / targetWpm) * 60;
  const proportional =
    (input.currentSpeed * input.actualDurationSeconds) / desiredDuration;
  const attemptMin =
    input.currentSpeed * (1 - input.policy.maximumAdjustmentPerAttempt);
  const attemptMax =
    input.currentSpeed * (1 + input.policy.maximumAdjustmentPerAttempt);
  const bounded = Math.min(
    input.policy.maximumSpeed,
    Math.max(
      input.policy.minimumSpeed,
      Math.min(attemptMax, Math.max(attemptMin, proportional))
    )
  );
  const speed = Math.round(bounded * 10_000) / 10_000;
  return {
    speed,
    clampApplied: speed !== Math.round(proportional * 10_000) / 10_000,
  };
}

export interface VeronicaShortPacingCandidate {
  readonly audioHash: string;
  readonly durationSeconds: number;
  readonly cacheHit: boolean;
  readonly hardConstraintsPassed: boolean;
}

export async function calibrateVeronicaShortPacing(input: {
  readonly initialSpeed: number;
  readonly wordCount: number;
  readonly policy: VeronicaShortPacingPolicy;
  readonly synthesize: (request: {
    readonly attemptIndex: number;
    readonly requestedSpeed: number;
    readonly speedSource: "baseline" | "measured-correction";
  }) => Promise<VeronicaShortPacingCandidate>;
}): Promise<{
  readonly attempts: readonly VeronicaShortPacingAttempt[];
  readonly selectedAttempt: VeronicaShortPacingAttempt;
  readonly calibrationStatus: VeronicaShortDurationAcceptanceStatus;
}> {
  const attempts: VeronicaShortPacingAttempt[] = [];
  let speed = input.initialSpeed;
  let speedSource: "baseline" | "measured-correction" = "baseline";
  let clampApplied = false;
  for (
    let attemptIndex = 1;
    attemptIndex <= input.policy.maxCalibrationAttempts;
    attemptIndex += 1
  ) {
    const candidate = await input.synthesize({
      attemptIndex,
      requestedSpeed: speed,
      speedSource,
    });
    const pacingStatus = assessVeronicaShortPacing({
      durationSeconds: candidate.durationSeconds,
      wordCount: input.wordCount,
      policy: input.policy,
    });
    const durationAcceptanceStatus = assessVeronicaShortDurationAcceptance({
      durationSeconds: candidate.durationSeconds,
      policy: input.policy,
      hardConstraintsPassed: candidate.hardConstraintsPassed,
    });
    attempts.push({
      attemptIndex,
      requestedSpeed: speed,
      speedSource,
      cacheHit: candidate.cacheHit,
      audioHash: candidate.audioHash,
      measuredDurationSeconds: candidate.durationSeconds,
      measuredWpm: calculateWordsPerMinute(
        input.wordCount,
        candidate.durationSeconds
      ),
      durationDeltaSeconds:
        candidate.durationSeconds -
        input.policy.editorialLongShortReviewThresholdSeconds,
      speedClampApplied: clampApplied,
      pacingStatus,
      durationAcceptanceStatus,
      selected: false,
    });
    // Duration alone never triggers acceleration. Unknown-locale guidance also
    // accepts the baseline, while a >180s result is an editorial hard stop.
    if (
      durationAcceptanceStatus === "SHORT_PLATFORM_DURATION_EXCEEDED" ||
      pacingStatus === "NATURAL" ||
      !input.policy.preferredWpmRange
    )
      break;
    const estimate = estimateVeronicaShortPacingSpeed({
      currentSpeed: speed,
      actualDurationSeconds: candidate.durationSeconds,
      wordCount: input.wordCount,
      policy: input.policy,
    });
    if (estimate.speed === speed) break;
    speed = estimate.speed;
    clampApplied = estimate.clampApplied;
    speedSource = "measured-correction";
  }
  const safe = attempts
    .map((attempt, index) => ({ attempt, index }))
    .filter(
      ({ attempt }) =>
        attempt.durationAcceptanceStatus !== "SHORT_PLATFORM_DURATION_EXCEEDED"
    );
  const guidance = input.policy.preferredWpmRange;
  const targetWpm = guidance ? (guidance[0] + guidance[1]) / 2 : 0;
  const pool =
    safe.length > 0
      ? safe
      : attempts.map((attempt, index) => ({ attempt, index }));
  const selectedIndex = pool.reduce((best, current) =>
    Math.abs(current.attempt.measuredWpm - targetWpm) <
    Math.abs(best.attempt.measuredWpm - targetWpm)
      ? current
      : best
  ).index;
  const selectedAttempt = { ...attempts[selectedIndex]!, selected: true };
  return {
    attempts: attempts.map((attempt, index) => ({
      ...attempt,
      selected: index === selectedIndex,
    })),
    selectedAttempt,
    calibrationStatus: selectedAttempt.durationAcceptanceStatus,
  };
}
