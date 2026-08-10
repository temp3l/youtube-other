import { z } from "zod";

/**
 * Veronica conceptual Shorts are calibrated against decoded audio duration. WPM
 * remains a locale-specific diagnostic because translations need not contain
 * comparable word counts.
 */
export const VERONICA_SHORT_PACING_POLICY_VERSION =
  "veronica-short-adaptive-pacing-v1" as const;
export const VERONICA_SHORT_PACING_CALIBRATION_SCHEMA_VERSION =
  "veronica-short-pacing-calibration-v1" as const;

export type VeronicaShortPacingStatus =
  | "within-target"
  | "slightly-fast"
  | "fast"
  | "very-fast"
  | "slightly-slow"
  | "slow";

export interface VeronicaShortPacingPolicy {
  readonly enabled: true;
  readonly mode: "adaptive-duration";
  readonly pacingPolicyVersion: typeof VERONICA_SHORT_PACING_POLICY_VERSION;
  readonly preferredDurationRangeSeconds: readonly [number, number];
  readonly targetDurationSeconds: number;
  readonly preferredWpmRange?: readonly [number, number];
  readonly minimumSpeed: number;
  readonly maximumSpeed: number;
  readonly maximumAdjustmentPerAttempt: number;
  readonly maxCalibrationAttempts: number;
  readonly durationToleranceSeconds: number;
  readonly fallbackBehavior: "select-closest-safe-candidate";
}

const englishGuidance = [160, 165] as const;
const localeGuidance: Readonly<Record<string, readonly [number, number] | undefined>> = {
  en: englishGuidance,
  de: undefined,
  it: undefined,
  fr: undefined,
  pt: undefined,
};

export function resolveVeronicaShortPacingPolicy(locale: string):
  | VeronicaShortPacingPolicy
  | undefined {
  const normalized = locale.trim().toLowerCase().split("-", 1)[0] ?? "";
  if (!(normalized in localeGuidance)) return undefined;
  return {
    enabled: true,
    mode: "adaptive-duration",
    pacingPolicyVersion: VERONICA_SHORT_PACING_POLICY_VERSION,
    preferredDurationRangeSeconds: [58, 60],
    targetDurationSeconds: 59,
    ...(localeGuidance[normalized]
      ? { preferredWpmRange: localeGuidance[normalized] }
      : {}),
    // OpenAI accepts 0.25–4.0. This narrower range preserves a natural
    // conceptual delivery while still allowing a measured correction.
    minimumSpeed: 0.75,
    maximumSpeed: 1.5,
    maximumAdjustmentPerAttempt: 0.16,
    maxCalibrationAttempts: 3,
    durationToleranceSeconds: 1,
    fallbackBehavior: "select-closest-safe-candidate",
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
  readonly selected: boolean;
}

export const veronicaShortPacingCalibrationSchema = z
  .object({
    schemaVersion: z.literal(VERONICA_SHORT_PACING_CALIBRATION_SCHEMA_VERSION),
    contentId: z.string().min(1),
    locale: z.string().min(1),
    variant: z.literal("short"),
    provider: z.string().min(1),
    model: z.string().min(1),
    voice: z.string().min(1),
    narrationHash: z.string().regex(/^[a-f0-9]{64}$/u),
    pacingPolicyVersion: z.literal(VERONICA_SHORT_PACING_POLICY_VERSION),
    targetDurationRange: z.tuple([z.number().positive(), z.number().positive()]),
    preferredWpmRange: z.tuple([z.number().positive(), z.number().positive()]).optional(),
    wordCount: z.number().int().nonnegative(),
    attempts: z.array(z.object({
      attemptIndex: z.number().int().positive(),
      requestedSpeed: z.number().positive(),
      speedSource: z.enum(["baseline", "measured-correction"]),
      cacheHit: z.boolean(),
      audioHash: z.string().regex(/^[a-f0-9]{64}$/u),
      measuredDurationSeconds: z.number().positive(),
      measuredWpm: z.number().nonnegative(),
      durationDeltaSeconds: z.number(),
      speedClampApplied: z.boolean(),
      pacingStatus: z.enum(["within-target", "slightly-fast", "fast", "very-fast", "slightly-slow", "slow"]),
      selected: z.boolean(),
    }).strict()).min(1).max(3),
    selectedAttempt: z.number().int().positive(),
    selectedSpeed: z.number().positive(),
    selectedDurationSeconds: z.number().positive(),
    selectedWpm: z.number().nonnegative(),
    selectedPacingStatus: z.enum(["within-target", "slightly-fast", "fast", "very-fast", "slightly-slow", "slow"]),
    speedNormalizationApplied: z.boolean(),
    calibrationStatus: z.enum(["TARGET_MET", "PACING_TARGET_MISSED", "BYPASSED_BY_OVERRIDE"]),
    artifactHash: z.string().regex(/^[a-f0-9]{64}$/u),
    selectedAudioHash: z.string().regex(/^[a-f0-9]{64}$/u),
    inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();

export type VeronicaShortPacingCalibration = z.infer<
  typeof veronicaShortPacingCalibrationSchema
>;

export function calculateWordsPerMinute(wordCount: number, durationSeconds: number): number {
  return durationSeconds > 0 ? (wordCount / durationSeconds) * 60 : 0;
}

export function assessVeronicaShortPacing(input: {
  readonly durationSeconds: number;
  readonly wordCount: number;
  readonly policy: VeronicaShortPacingPolicy;
}): VeronicaShortPacingStatus {
  const [min, max] = input.policy.preferredDurationRangeSeconds;
  if (input.durationSeconds >= min && input.durationSeconds <= max) return "within-target";
  if (input.durationSeconds < min) {
    return input.durationSeconds < min - 4 ? "very-fast" : input.durationSeconds < min - 2 ? "fast" : "slightly-fast";
  }
  return input.durationSeconds > max + 4 ? "slow" : "slightly-slow";
}

export function estimateVeronicaShortPacingSpeed(input: {
  readonly currentSpeed: number;
  readonly actualDurationSeconds: number;
  readonly policy: VeronicaShortPacingPolicy;
}): { readonly speed: number; readonly clampApplied: boolean } {
  const proportional = input.currentSpeed *
    (input.actualDurationSeconds / input.policy.targetDurationSeconds);
  const adjustmentMin = input.currentSpeed * (1 - input.policy.maximumAdjustmentPerAttempt);
  const adjustmentMax = input.currentSpeed * (1 + input.policy.maximumAdjustmentPerAttempt);
  const bounded = Math.min(
    input.policy.maximumSpeed,
    Math.max(input.policy.minimumSpeed, Math.min(adjustmentMax, Math.max(adjustmentMin, proportional)))
  );
  const speed = Math.round(bounded * 10_000) / 10_000;
  return { speed, clampApplied: speed !== Math.round(proportional * 10_000) / 10_000 };
}

export interface VeronicaShortPacingCandidate {
  readonly audioHash: string;
  readonly durationSeconds: number;
  readonly cacheHit: boolean;
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
}): Promise<{ readonly attempts: readonly VeronicaShortPacingAttempt[]; readonly selectedAttempt: VeronicaShortPacingAttempt; readonly calibrationStatus: "TARGET_MET" | "PACING_TARGET_MISSED" }> {
  const attempts: VeronicaShortPacingAttempt[] = [];
  let speed = input.initialSpeed;
  let source: "baseline" | "measured-correction" = "baseline";
  let clampApplied = false;
  for (let index = 1; index <= input.policy.maxCalibrationAttempts; index += 1) {
    const candidate = await input.synthesize({ attemptIndex: index, requestedSpeed: speed, speedSource: source });
    const durationDeltaSeconds = candidate.durationSeconds - input.policy.targetDurationSeconds;
    const status = assessVeronicaShortPacing({ durationSeconds: candidate.durationSeconds, wordCount: input.wordCount, policy: input.policy });
    const attempt: VeronicaShortPacingAttempt = {
      attemptIndex: index, requestedSpeed: speed, speedSource: source, cacheHit: candidate.cacheHit,
      audioHash: candidate.audioHash, measuredDurationSeconds: candidate.durationSeconds,
      measuredWpm: calculateWordsPerMinute(input.wordCount, candidate.durationSeconds),
      durationDeltaSeconds, speedClampApplied: clampApplied, pacingStatus: status, selected: false,
    };
    attempts.push(attempt);
    if (status === "within-target") break;
    const estimate = estimateVeronicaShortPacingSpeed({ currentSpeed: speed, actualDurationSeconds: candidate.durationSeconds, policy: input.policy });
    if (estimate.speed === speed) break;
    speed = estimate.speed;
    clampApplied = estimate.clampApplied;
    source = "measured-correction";
  }
  const selectedIndex = attempts.reduce((best, attempt, index) => {
    const bestDistance = Math.abs(attempts[best]!.durationDeltaSeconds);
    const candidateDistance = Math.abs(attempt.durationDeltaSeconds);
    return candidateDistance < bestDistance ? index : best;
  }, 0);
  const selectedAttempt = attempts[selectedIndex]!;
  return {
    attempts: attempts.map((attempt, index) => ({ ...attempt, selected: index === selectedIndex })),
    selectedAttempt: { ...selectedAttempt, selected: true },
    calibrationStatus: selectedAttempt.pacingStatus === "within-target" ? "TARGET_MET" : "PACING_TARGET_MISSED",
  };
}
