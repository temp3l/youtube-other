import { createHash } from "node:crypto";

export type DurationAcceptanceStatus =
  | "WITHIN_PREFERRED_RANGE"
  | "WITHIN_ACCEPTANCE_TOLERANCE"
  | "PACING_TARGET_MISSED";

export type AdaptivePacingStatus =
  | "within-target"
  | "slightly-fast"
  | "fast"
  | "very-fast"
  | "slightly-slow"
  | "slow";

export interface AdaptivePacingPolicy {
  readonly preferredDurationRangeSeconds: readonly [number, number];
  readonly targetDurationSeconds: number;
  readonly preferredWpmRange?: readonly [number, number];
  readonly minimumSpeed: number;
  readonly maximumSpeed: number;
  readonly maximumAdjustmentPerAttempt: number;
  readonly maxCalibrationAttempts: number;
  readonly durationAcceptanceToleranceSeconds: number;
}

export interface AdaptivePacingCandidate {
  readonly audioHash: string;
  readonly durationSeconds: number;
  readonly cacheHit: boolean;
  readonly hardConstraintsPassed: boolean;
}

export interface AdaptivePacingAttempt {
  readonly attemptIndex: number;
  readonly requestedSpeed: number;
  readonly speedSource: "baseline" | "measured-correction";
  readonly cacheHit: boolean;
  readonly audioHash: string;
  readonly measuredDurationSeconds: number;
  readonly measuredWpm: number;
  readonly durationDeltaSeconds: number;
  readonly speedClampApplied: boolean;
  readonly pacingStatus: AdaptivePacingStatus;
  readonly durationAcceptanceStatus: DurationAcceptanceStatus;
  readonly selected: boolean;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Readonly<Record<string, unknown>>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export function adaptivePacingCandidateCacheKey(input: {
  readonly provider: string;
  readonly model: string;
  readonly voice: string;
  readonly locale: string;
  readonly narrationHash: string;
  readonly instructions: string;
  readonly requestedSpeed: number;
  readonly outputFormat: string;
  readonly providerOptions: Readonly<Record<string, unknown>>;
}): string {
  return hash({ schemaVersion: "adaptive-pacing-candidate-cache.v1", ...input });
}

export function completedCalibrationCacheKey(input: {
  readonly narrationHash: string;
  readonly genre: string;
  readonly variant: string;
  readonly locale: string;
  readonly provider: string;
  readonly model: string;
  readonly voice: string;
  readonly pacingPolicyVersion: string;
  readonly targetDurationSeconds: number;
  readonly preferredDurationRangeSeconds: readonly [number, number];
  readonly durationAcceptanceToleranceSeconds: number;
  readonly outputFormat: string;
  readonly providerOptions: Readonly<Record<string, unknown>>;
}): string {
  return hash({ schemaVersion: "adaptive-pacing-completed-cache.v1", ...input });
}

export function calculateAdaptiveWordsPerMinute(
  wordCount: number,
  durationSeconds: number,
): number {
  return durationSeconds > 0 ? (wordCount / durationSeconds) * 60 : 0;
}

export function assessDurationAcceptance(input: {
  readonly durationSeconds: number;
  readonly policy: AdaptivePacingPolicy;
  readonly hardConstraintsPassed: boolean;
}): DurationAcceptanceStatus {
  if (!input.hardConstraintsPassed) return "PACING_TARGET_MISSED";
  const [minimum, maximum] = input.policy.preferredDurationRangeSeconds;
  if (input.durationSeconds >= minimum && input.durationSeconds <= maximum) {
    return "WITHIN_PREFERRED_RANGE";
  }
  return input.durationSeconds >=
      minimum - input.policy.durationAcceptanceToleranceSeconds &&
    input.durationSeconds <=
      maximum + input.policy.durationAcceptanceToleranceSeconds
    ? "WITHIN_ACCEPTANCE_TOLERANCE"
    : "PACING_TARGET_MISSED";
}

export function assessAdaptivePacing(input: {
  readonly durationSeconds: number;
  readonly wordCount: number;
  readonly policy: AdaptivePacingPolicy;
}): AdaptivePacingStatus {
  const wordsPerMinute = calculateAdaptiveWordsPerMinute(
    input.wordCount,
    input.durationSeconds,
  );
  const guidance = input.policy.preferredWpmRange;
  if (!guidance) return "within-target";
  const [minimum, maximum] = guidance;
  if (wordsPerMinute >= minimum && wordsPerMinute <= maximum)
    return "within-target";
  if (wordsPerMinute > maximum)
    return wordsPerMinute <= maximum + 3
      ? "slightly-fast"
      : wordsPerMinute <= maximum + 10
        ? "fast"
        : "very-fast";
  return wordsPerMinute >= minimum - 3 ? "slightly-slow" : "slow";
}

export function estimateAdaptivePacingSpeed(input: {
  readonly currentSpeed: number;
  readonly actualDurationSeconds: number;
  readonly policy: AdaptivePacingPolicy;
}): { readonly speed: number; readonly clampApplied: boolean } {
  const proportional =
    input.currentSpeed *
    (input.actualDurationSeconds / input.policy.targetDurationSeconds);
  const adjustmentMinimum =
    input.currentSpeed * (1 - input.policy.maximumAdjustmentPerAttempt);
  const adjustmentMaximum =
    input.currentSpeed * (1 + input.policy.maximumAdjustmentPerAttempt);
  const bounded = Math.min(
    input.policy.maximumSpeed,
    Math.max(
      input.policy.minimumSpeed,
      Math.min(adjustmentMaximum, Math.max(adjustmentMinimum, proportional)),
    ),
  );
  const speed = Math.round(bounded * 10_000) / 10_000;
  return {
    speed,
    clampApplied: speed !== Math.round(proportional * 10_000) / 10_000,
  };
}

export async function calibrateAdaptivePacing(input: {
  readonly initialSpeed: number;
  readonly wordCount: number;
  readonly policy: AdaptivePacingPolicy;
  readonly synthesize: (request: {
    readonly attemptIndex: number;
    readonly requestedSpeed: number;
    readonly speedSource: "baseline" | "measured-correction";
  }) => Promise<AdaptivePacingCandidate>;
}): Promise<{
  readonly attempts: readonly AdaptivePacingAttempt[];
  readonly selectedAttempt: AdaptivePacingAttempt;
  readonly calibrationStatus: DurationAcceptanceStatus;
}> {
  const attempts: AdaptivePacingAttempt[] = [];
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
    const durationAcceptanceStatus = assessDurationAcceptance({
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
      measuredWpm: calculateAdaptiveWordsPerMinute(
        input.wordCount,
        candidate.durationSeconds,
      ),
      durationDeltaSeconds:
        candidate.durationSeconds - input.policy.targetDurationSeconds,
      speedClampApplied: clampApplied,
      pacingStatus: assessAdaptivePacing({
        durationSeconds: candidate.durationSeconds,
        wordCount: input.wordCount,
        policy: input.policy,
      }),
      durationAcceptanceStatus,
      selected: false,
    });
    if (durationAcceptanceStatus !== "PACING_TARGET_MISSED") break;
    const estimate = estimateAdaptivePacingSpeed({
      currentSpeed: speed,
      actualDurationSeconds: candidate.durationSeconds,
      policy: input.policy,
    });
    if (estimate.speed === speed) break;
    speed = estimate.speed;
    clampApplied = estimate.clampApplied;
    speedSource = "measured-correction";
  }
  const preferredIndex = attempts.findIndex(
    (attempt) =>
      attempt.durationAcceptanceStatus === "WITHIN_PREFERRED_RANGE",
  );
  const selectedIndex =
    preferredIndex >= 0
      ? preferredIndex
      : attempts.reduce((best, attempt, index) => {
          const bestDistance = Math.abs(attempts[best]!.durationDeltaSeconds);
          return Math.abs(attempt.durationDeltaSeconds) < bestDistance
            ? index
            : best;
        }, 0);
  const selectedAttempt = attempts[selectedIndex]!;
  return {
    attempts: attempts.map((attempt, index) => ({
      ...attempt,
      selected: index === selectedIndex,
    })),
    selectedAttempt: { ...selectedAttempt, selected: true },
    calibrationStatus: selectedAttempt.durationAcceptanceStatus,
  };
}
