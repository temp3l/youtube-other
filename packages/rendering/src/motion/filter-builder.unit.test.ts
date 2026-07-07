import { describe, expect, it } from "vitest";
import { buildFilterChain, zoomPanFrameCount } from "../filter-builders/index.js";
import {
  buildMotionPresetFilterPlan,
  summarizeMotionFilterPlan,
} from "./filter-builder.js";
import { motionPresets } from "./presets.js";

describe("motion preset filter builder", () => {
  it("builds supported non-empty operations for every preset", () => {
    for (const preset of motionPresets) {
      const plan = buildMotionPresetFilterPlan({
        preset,
        durationSeconds: 2.4,
        fps: 24,
        output: { width: 1920, height: 1080 },
        videoKind: preset.family === "shorts" ? "short" : "full",
        seed: `preset-${preset.id}`,
      });

      expect(plan.operations.length).toBeGreaterThan(0);
      expect(plan.frameCount).toBe(58);
      expect(() => buildFilterChain(plan.operations)).not.toThrow();
      expect(plan.operations.at(-1)).toEqual({
        kind: "format",
        pixelFormat: "yuv420p",
      });
    }
  });

  it("respects 16:9 and 9:16 output dimensions", () => {
    const preset = motionPresets.find((item) => item.id === "doc_slow_push_in");
    expect(preset).toBeDefined();

    const wide = buildMotionPresetFilterPlan({
      preset: preset!,
      durationSeconds: 3,
      fps: 30,
      output: { width: 1920, height: 1080 },
      videoKind: "full",
      seed: "wide",
    });
    const vertical = buildMotionPresetFilterPlan({
      preset: preset!,
      durationSeconds: 3,
      fps: 30,
      output: { width: 1080, height: 1920 },
      videoKind: "short",
      seed: "vertical",
    });

    expect(wide.operations[0]).toMatchObject({
      kind: "zoompan",
      outputWidthPx: 1920,
      outputHeightPx: 1080,
    });
    expect(vertical.operations[0]).toMatchObject({
      kind: "zoompan",
      outputWidthPx: 1080,
      outputHeightPx: 1920,
    });
  });

  it("uses current zoompan frame count duration math", () => {
    const preset = motionPresets.find((item) => item.id === "tension_creep_zoom");
    expect(preset).toBeDefined();
    const plan = buildMotionPresetFilterPlan({
      preset: preset!,
      durationSeconds: 2,
      fps: 29.97,
      output: { width: 1920, height: 1080 },
      videoKind: "full",
      seed: "duration",
    });

    expect(plan.frameCount).toBe(zoomPanFrameCount({ durationSeconds: 2, fps: 29.97 }));
    expect(plan.operations[0]).toMatchObject({
      kind: "zoompan",
      durationSeconds: 2,
      fps: 29.97,
    });
  });

  it("generates deterministic seeded operations", () => {
    const preset = motionPresets.find((item) => item.id === "short_impact_shake");
    expect(preset).toBeDefined();
    const input = {
      preset: preset!,
      durationSeconds: 1,
      fps: 30,
      output: { width: 1080, height: 1920 },
      videoKind: "short" as const,
      seed: "shake-seed",
    };

    expect(buildMotionPresetFilterPlan(input).operations).toEqual(
      buildMotionPresetFilterPlan(input).operations
    );
    expect(buildMotionPresetFilterPlan({ ...input, seed: "other-seed" }).operations).not.toEqual(
      buildMotionPresetFilterPlan(input).operations
    );
  });

  it("summarizes filter plans concisely", () => {
    const preset = motionPresets.find((item) => item.id === "ambient_static_hold");
    expect(preset).toBeDefined();
    const plan = buildMotionPresetFilterPlan({
      preset: preset!,
      durationSeconds: 2,
      fps: 30,
      output: { width: 1920, height: 1080 },
      videoKind: "full",
      seed: "summary",
    });

    expect(summarizeMotionFilterPlan(plan)).toBe(
      "ambient_static_hold:full:1920x1080:60f:scale+crop+format"
    );
  });
});
