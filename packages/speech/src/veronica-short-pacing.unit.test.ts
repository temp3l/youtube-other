import { describe, expect, it } from "vitest";
import {
  assessVeronicaShortDurationAcceptance,
  calibrateVeronicaShortPacing,
  estimateVeronicaShortPacingSpeed,
  resolveVeronicaShortPacingPolicy,
} from "./veronica-short-pacing.js";

describe("Veronica Short natural pacing", () => {
  const policy = resolveVeronicaShortPacingPolicy("en")!;

  it.each([75, 110])("accepts a naturally paced %ss Short without a duration-driven retry", async (durationSeconds) => {
    let calls = 0;
    const wordCount = Math.round(durationSeconds / 60 * 155);
    const result = await calibrateVeronicaShortPacing({ initialSpeed: 1, wordCount, policy, synthesize: async () => { calls += 1; return { audioHash: "a".repeat(64), durationSeconds, cacheHit: true, hardConstraintsPassed: true }; } });
    expect(result.attempts).toHaveLength(1);
    expect(result.calibrationStatus).toBe("NORMAL_SHORT");
    expect(result.selectedAttempt.pacingStatus).toBe("NATURAL");
    expect(calls).toBe(1);
  });

  it("keeps a natural 121–179s result and requests editorial review", async () => {
    const result = await calibrateVeronicaShortPacing({ initialSpeed: 1, wordCount: 387, policy, synthesize: async () => ({ audioHash: "b".repeat(64), durationSeconds: 150, cacheHit: true, hardConstraintsPassed: true }) });
    expect(result.attempts).toHaveLength(1);
    expect(result.calibrationStatus).toBe("LONG_SHORT_EDITORIAL_REVIEW");
  });

  it("fails the format policy above 180s without trying to accelerate", async () => {
    let calls = 0;
    const result = await calibrateVeronicaShortPacing({ initialSpeed: 1, wordCount: 500, policy, synthesize: async () => { calls += 1; return { audioHash: "c".repeat(64), durationSeconds: 181, cacheHit: false, hardConstraintsPassed: true }; } });
    expect(result.calibrationStatus).toBe("SHORT_PLATFORM_DURATION_EXCEEDED");
    expect(calls).toBe(1);
  });

  it("adjusts only an unreasonable speech rate toward the episode/locale profile", async () => {
    const result = await calibrateVeronicaShortPacing({ initialSpeed: 1.16, wordCount: 210, policy, synthesize: async ({ attemptIndex }) => ({ audioHash: String(attemptIndex).repeat(64), durationSeconds: attemptIndex === 1 ? 60 : 82, cacheHit: false, hardConstraintsPassed: true }) });
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[1]!.requestedSpeed).toBeLessThan(1.16);
    expect(result.selectedAttempt.measuredDurationSeconds).toBe(82);
  });

  it("uses a conceptual-explainer English profile and no global inference for other locales", () => {
    expect(policy.profileId).toBe("conceptual-explainer");
    expect(policy.preferredWpmRange).toEqual([145, 165]);
    expect(resolveVeronicaShortPacingPolicy("de")?.preferredWpmRange).toBeUndefined();
    expect(resolveVeronicaShortPacingPolicy("en-US")?.platformMaximumDurationSeconds).toBe(180);
  });

  it("targets natural WPM rather than 60 or 120 seconds", () => {
    const correction = estimateVeronicaShortPacingSpeed({ currentSpeed: 1, actualDurationSeconds: 60, wordCount: 210, policy });
    expect(correction.speed).toBeLessThan(1);
    expect(assessVeronicaShortDurationAcceptance({ durationSeconds: 121, policy, hardConstraintsPassed: true })).toBe("LONG_SHORT_EDITORIAL_REVIEW");
  });
});
