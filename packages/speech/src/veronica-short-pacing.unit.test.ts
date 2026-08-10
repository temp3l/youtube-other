import { describe, expect, it } from "vitest";
import {
  calibrateVeronicaShortPacing,
  estimateVeronicaShortPacingSpeed,
  resolveVeronicaShortPacingPolicy,
} from "./veronica-short-pacing.js";

describe("Veronica Short adaptive pacing", () => {
  const policy = resolveVeronicaShortPacingPolicy("en")!;

  it("uses measured duration to slow a fast narration and selects the in-range candidate", async () => {
    const result = await calibrateVeronicaShortPacing({
      initialSpeed: 1.16, wordCount: 161, policy,
      synthesize: async ({ requestedSpeed }) => requestedSpeed > 1.1
        ? { audioHash: "a".repeat(64), durationSeconds: 51.5, cacheHit: false, hardConstraintsPassed: true }
        : { audioHash: "b".repeat(64), durationSeconds: 59.1, cacheHit: false, hardConstraintsPassed: true },
    });
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[1]!.requestedSpeed).toBeLessThan(1.16);
    expect(result.selectedAttempt.measuredDurationSeconds).toBe(59.1);
  });

  it("uses the latest non-linear measurement and bounds attempts", async () => {
    const durations = [51.5, 57.9, 59.1];
    const result = await calibrateVeronicaShortPacing({
      initialSpeed: 1.16, wordCount: 161, policy,
      synthesize: async ({ attemptIndex }) => ({ audioHash: String(attemptIndex).repeat(64), durationSeconds: durations[attemptIndex - 1]!, cacheHit: false, hardConstraintsPassed: true }),
    });
    expect(result.attempts).toHaveLength(2);
    expect(result.selectedAttempt.measuredDurationSeconds).toBe(57.9);
    expect(result.calibrationStatus).toBe("WITHIN_ACCEPTANCE_TOLERANCE");
  });

  it("does not leak the Short policy to full or unsupported locales", () => {
    expect(resolveVeronicaShortPacingPolicy("es")).toBeUndefined();
    expect(resolveVeronicaShortPacingPolicy("en-US")?.preferredDurationRangeSeconds).toEqual([58, 60]);
  });

  it("clamps an excessive correction to the configured safety envelope", () => {
    const correction = estimateVeronicaShortPacingSpeed({ currentSpeed: 1.16, actualDurationSeconds: 20, policy });
    expect(correction.clampApplied).toBe(true);
    expect(correction.speed).toBeGreaterThanOrEqual(policy.minimumSpeed);
  });

  it("accepts 57.916s inside tolerance, but continues for 57.70s", async () => {
    const accepted = await calibrateVeronicaShortPacing({ initialSpeed: 1.16, wordCount: 161, policy, synthesize: async () => ({ audioHash: "c".repeat(64), durationSeconds: 57.916, cacheHit: true, hardConstraintsPassed: true }) });
    expect(accepted.calibrationStatus).toBe("WITHIN_ACCEPTANCE_TOLERANCE");
    expect(accepted.selectedAttempt.pacingStatus).toBe("slightly-fast");
    const continued = await calibrateVeronicaShortPacing({ initialSpeed: 1.16, wordCount: 161, policy, synthesize: async ({ attemptIndex }) => ({ audioHash: String(attemptIndex + 3).repeat(64), durationSeconds: attemptIndex === 1 ? 57.7 : 59, cacheHit: true, hardConstraintsPassed: true }) });
    expect(continued.attempts).toHaveLength(2);
    expect(continued.calibrationStatus).toBe("WITHIN_PREFERRED_RANGE");
  });

  it("does not accept tolerance when hard constraints fail", async () => {
    const result = await calibrateVeronicaShortPacing({ initialSpeed: 1.16, wordCount: 161, policy, synthesize: async ({ attemptIndex }) => ({ audioHash: String(attemptIndex + 6).repeat(64), durationSeconds: 57.916, cacheHit: true, hardConstraintsPassed: false }) });
    expect(result.calibrationStatus).toBe("PACING_TARGET_MISSED");
  });
});
