import { describe, expect, it } from "vitest";
import { hashProductionValue } from "@mediaforge/shared";
import { runHistoryProductionHardeningFixture } from "./history-production-hardening.js";

describe("History production hardening adapter", () => {
  it.each([
    ["full", "16:9", "multi-state-first-class"],
    ["short", "9:16", "decisive-transition-preferred"],
  ] as const)("runs the offline %s fixture without weakening maps or approval gates", (variant, ratio, representation) => {
    const result = runHistoryProductionHardeningFixture({
      fixtureId: `02-napoleons-invasion-of-russia:${variant}`,
      narrationHash: hashProductionValue("trusted Napoleon narration"),
      variant,
      selectedAudioDurationSeconds: 786,
    });
    expect(result.status).toBe("passed");
    expect(result.policy.aspectRatio).toBe(ratio);
    expect(result.policy.stateRepresentation).toBe(representation);
    expect(result.policy.pacing.mode).toBe(
      variant === "short" ? "adaptive-duration" : "preserve-current",
    );
    expect(result.pacingCalibrationPlanHash === null).toBe(variant === "full");
    expect(result.events.filter((event) => event.category === "map-progression")).toHaveLength(3);
    expect(result.events.some((event) => event.stateIds.length > 1)).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.providerReadiness).toEqual({
      allowed: false,
      blockers: ["HUMAN_APPROVAL_MISSING"],
    });
    expect(result.liveTtsProviderCalls).toBe(0);
    expect(result.imageProviderCalls).toBe(0);
  });
});
