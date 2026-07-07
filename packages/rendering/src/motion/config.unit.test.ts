import { describe, expect, it } from "vitest";
import {
  defaultMotionRenderConfig,
  resolveMotionRenderConfig,
} from "./config.js";

describe("motion render config", () => {
  it("defaults render motion to disabled", () => {
    expect(defaultMotionRenderConfig).toMatchObject({
      enabled: false,
      debug: false,
      allowShortsPresetsForFull: false,
      preventSamePresetBackToBack: true,
      maxSameFamilyRunLength: 2,
      preventConsecutiveHighIntensity: true,
    });
  });

  it("resolves immutable overrides without changing defaults", () => {
    const config = resolveMotionRenderConfig({
      enabled: true,
      debug: true,
      seed: "episode-seed",
      explicitPresetId: "doc_slow_push_in",
    });

    expect(config).toMatchObject({
      enabled: true,
      debug: true,
      seed: "episode-seed",
      explicitPresetId: "doc_slow_push_in",
    });
    expect(defaultMotionRenderConfig.enabled).toBe(false);
    expect(Object.isFrozen(config)).toBe(true);
  });
});
