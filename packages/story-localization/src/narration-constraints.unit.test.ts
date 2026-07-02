import { describe, expect, it } from "vitest";
import {
  estimateNarrationDurationSeconds,
  resolveNarrationTimingEstimate,
  resolveShortDurationProfile,
  resolveShortTargetDurationSeconds,
} from "./narration-constraints.js";

describe("narration constraints", () => {
  it("resolves explicit short duration profiles per language", () => {
    expect(
      resolveShortDurationProfile({
        language: "en",
        durationSeconds: 60,
      })
    ).toEqual({
      durationSeconds: 60,
      targetDuration: {
        minSeconds: 55,
        targetSeconds: 60,
        maxSeconds: 65,
      },
      targetWordRange: {
        min: 125,
        target: 138,
        max: 150,
      },
      targetNarrationWpm: 138,
    });
    expect(
      resolveShortDurationProfile({
        language: "de",
        durationSeconds: 45,
      }).targetWordRange
    ).toEqual({
      min: 85,
      target: 95,
      max: 105,
    });
  });

  it("maps duration windows back to canonical short duration buckets", () => {
    expect(
      resolveShortTargetDurationSeconds({
        minSeconds: 55,
        targetSeconds: 60,
        maxSeconds: 65,
      })
    ).toBe(60);
    expect(
      resolveShortTargetDurationSeconds({
        minSeconds: 42,
        targetSeconds: 45,
        maxSeconds: 48,
      })
    ).toBe(45);
  });

  it("uses the shared timing estimate for spoken duration", () => {
    const narration = "Something tapped on the second-floor window. There was no balcony below it.";
    const timing = resolveNarrationTimingEstimate({
      language: "en",
      narrationText: narration,
    });
    expect(timing.totalDurationMs).toBeGreaterThan(timing.spokenWordDurationMs);
    expect(
      estimateNarrationDurationSeconds({
        language: "en",
        narrationText: narration,
      })
    ).toBe(Math.round(timing.totalDurationMs / 1000));
  });
});
