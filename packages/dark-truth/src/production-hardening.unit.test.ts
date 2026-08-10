import { describe, expect, it } from "vitest";
import { hashProductionValue } from "@mediaforge/shared";
import { buildScenePlan } from "./index.js";
import { runDarkTruthProductionHardeningFixture } from "./production-hardening.js";

describe("DarkTruth production hardening adapter", () => {
  it.each([
    ["full", "16:9", "multi-state-progression"],
    ["short", "9:16", "decisive-transition"],
  ] as const)("runs the offline %s fixture with genre-specific reveal semantics", (variant, ratio, finalCategory) => {
    const result = runDarkTruthProductionHardeningFixture({
      fixtureId: `007-save-file-knew-his-real-name:${variant}`,
      narrationHash: hashProductionValue("DarkTruth 007 narration"),
      variant,
      selectedAudioDurationSeconds: variant === "short" ? 60 : 420,
    });
    expect(result.status).toBe("passed");
    expect(result.policy.aspectRatio).toBe(ratio);
    expect(result.events.at(-1)?.category).toBe(finalCategory);
    expect(result.findings).toEqual([]);
    expect(result.diversity.intentionalContinuityPairs.length).toBeGreaterThan(0);
    expect(result.providerReadiness.blockers).toEqual(["HUMAN_APPROVAL_MISSING"]);
    expect(result.liveTtsProviderCalls).toBe(0);
    expect(result.imageProviderCalls).toBe(0);
  });

  it("projects the normal short scene plan as 9:16 rather than leaking 16:9", () => {
    const plan = buildScenePlan(
      "Felix buys the cartridge. The save file reveals his name. The room changes.",
      "darktruth-007",
      "short",
    );
    expect(plan.scenes.every((scene) => scene.aspectRatios.includes("9:16"))).toBe(true);
    expect(plan.scenes.every((scene) => scene.expectedImageFilenames[0]?.endsWith("__9x16.png"))).toBe(true);
  });
});
