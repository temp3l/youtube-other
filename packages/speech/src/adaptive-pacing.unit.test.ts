import { describe, expect, it } from "vitest";
import {
  adaptivePacingCandidateCacheKey,
  calibrateAdaptivePacing,
  completedCalibrationCacheKey,
  type AdaptivePacingPolicy,
} from "./adaptive-pacing.js";

const hash = (character: string): string => character.repeat(64);
const policy: AdaptivePacingPolicy = {
  preferredDurationRangeSeconds: [58, 60],
  targetDurationSeconds: 59,
  preferredWpmRange: [160, 165],
  minimumSpeed: 0.75,
  maximumSpeed: 1.5,
  maximumAdjustmentPerAttempt: 0.16,
  maxCalibrationAttempts: 3,
  durationAcceptanceToleranceSeconds: 0.25,
};

describe("generic adaptive pacing engine", () => {
  it("accepts preferred and tolerance candidates before another paid synthesis", async () => {
    let calls = 0;
    const preferred = await calibrateAdaptivePacing({
      initialSpeed: 1,
      wordCount: 162,
      policy,
      synthesize: async () => {
        calls += 1;
        return {
          audioHash: hash("a"),
          durationSeconds: 59,
          cacheHit: false,
          hardConstraintsPassed: true,
        };
      },
    });
    expect(preferred.calibrationStatus).toBe("WITHIN_PREFERRED_RANGE");
    expect(calls).toBe(1);
    const tolerance = await calibrateAdaptivePacing({
      initialSpeed: 1,
      wordCount: 162,
      policy,
      synthesize: async () => {
        calls += 1;
        return {
          audioHash: hash("b"),
          durationSeconds: 60.2,
          cacheHit: true,
          hardConstraintsPassed: true,
        };
      },
    });
    expect(tolerance.calibrationStatus).toBe("WITHIN_ACCEPTANCE_TOLERANCE");
    expect(tolerance.attempts).toHaveLength(1);
  });

  it("corrects too-fast and too-slow candidates, honors hard bounds and max attempts", async () => {
    const fastRequests: number[] = [];
    await calibrateAdaptivePacing({
      initialSpeed: 1,
      wordCount: 162,
      policy,
      synthesize: async ({ requestedSpeed, attemptIndex }) => {
        fastRequests.push(requestedSpeed);
        return {
          audioHash: hash(String(attemptIndex)),
          durationSeconds: attemptIndex === 1 ? 50 : 59,
          cacheHit: attemptIndex === 2,
          hardConstraintsPassed: true,
        };
      },
    });
    expect(fastRequests[1]).toBeLessThan(fastRequests[0]!);
    const slowRequests: number[] = [];
    const missed = await calibrateAdaptivePacing({
      initialSpeed: 1,
      wordCount: 162,
      policy: { ...policy, maxCalibrationAttempts: 2 },
      synthesize: async ({ requestedSpeed, attemptIndex }) => {
        slowRequests.push(requestedSpeed);
        return {
          audioHash: hash(attemptIndex === 1 ? "c" : "d"),
          durationSeconds: 70,
          cacheHit: false,
          hardConstraintsPassed: attemptIndex !== 2,
        };
      },
    });
    expect(slowRequests[1]).toBeGreaterThan(slowRequests[0]!);
    expect(missed.attempts).toHaveLength(2);
  });

  it("isolates exact-speed candidates and completed genre/variant policy caches", () => {
    const candidate = {
      provider: "provider",
      model: "model",
      voice: "voice",
      locale: "en",
      narrationHash: hash("e"),
      instructions: "restrained",
      outputFormat: "wav",
      providerOptions: { quality: "standard" },
    };
    expect(
      adaptivePacingCandidateCacheKey({ ...candidate, requestedSpeed: 1 }),
    ).not.toBe(
      adaptivePacingCandidateCacheKey({ ...candidate, requestedSpeed: 0.95 }),
    );
    const completed = {
      narrationHash: hash("f"),
      genre: "history",
      variant: "short",
      locale: "en",
      provider: "provider",
      model: "model",
      voice: "voice",
      pacingPolicyVersion: "history-short.v1",
      targetDurationSeconds: 60,
      preferredDurationRangeSeconds: [55, 65] as const,
      durationAcceptanceToleranceSeconds: 0.5,
      outputFormat: "wav",
      providerOptions: {},
    };
    expect(completedCalibrationCacheKey(completed)).not.toBe(
      completedCalibrationCacheKey({ ...completed, variant: "full" }),
    );
    expect(completedCalibrationCacheKey(completed)).not.toBe(
      completedCalibrationCacheKey({
        ...completed,
        genre: "dark-truth",
        pacingPolicyVersion: "darktruth-short.v1",
      }),
    );
  });
});
