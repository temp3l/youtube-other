import { describe, expect, it } from "vitest";
import {
  mapVisualPhaseToMotionStoryBeat,
  motionFamilyDistributions,
  selectMotionPreset,
} from "./selection.js";

describe("motion preset selection", () => {
  it("returns the same selection for the same seed and context", () => {
    const input = {
      seed: "episode-seed",
      context: {
        videoKind: "full" as const,
        storyBeat: "setup" as const,
        imageKind: "wide" as const,
        shotIndex: 4,
        durationSeconds: 4,
      },
      config: { enabled: true },
    };

    expect(selectMotionPreset(input)).toEqual(selectMotionPreset(input));
  });

  it("allows different seeds to vary over a small sample", () => {
    const ids = new Set(
      Array.from({ length: 20 }, (_, index) =>
        selectMotionPreset({
          seed: `seed-${index}`,
          context: {
            videoKind: "short",
            storyBeat: "hook",
            imageKind: "subject",
            shotIndex: index,
          },
          config: { enabled: true },
        }).preset.id
      )
    );

    expect(ids.size).toBeGreaterThan(1);
  });

  it("does not select shorts presets for full videos by default", () => {
    for (let index = 0; index < 100; index += 1) {
      const selection = selectMotionPreset({
        seed: `full-seed-${index}`,
        context: {
          videoKind: "full",
          storyBeat: "climax",
          imageKind: "subject",
          shotIndex: index,
        },
        config: { enabled: true },
      });
      expect(selection.preset.family).not.toBe("shorts");
    }
  });

  it("falls back safely when motion is disabled or metadata is missing", () => {
    expect(
      selectMotionPreset({
        seed: "disabled",
        context: { videoKind: "full" },
      })
    ).toMatchObject({
      preset: { id: "ambient_static_hold" },
      fallbackUsed: true,
      reason: "motion-disabled",
    });

    expect(
      selectMotionPreset({
        seed: "missing-metadata",
        context: { videoKind: "short" },
        config: { enabled: true },
      }).preset.id
    ).toMatch(/_/u);
  });

  it("maps visual phases to motion story beats", () => {
    expect(mapVisualPhaseToMotionStoryBeat("evidence")).toBe("evidence");
    expect(mapVisualPhaseToMotionStoryBeat(undefined)).toBe("unknown");
    expect(mapVisualPhaseToMotionStoryBeat("not-a-phase")).toBe("unknown");
  });

  it("prevents configured repeats", () => {
    const noSamePreset = selectMotionPreset({
      seed: "repeat",
      context: {
        videoKind: "full",
        previousPresetId: "doc_slow_push_in",
        recentPresetIds: ["doc_slow_push_in", "doc_slow_pull_back"],
      },
      config: {
        enabled: true,
        explicitPresetId: undefined,
        maxSameFamilyRunLength: 2,
      },
    });

    expect(noSamePreset.preset.id).not.toBe("doc_slow_push_in");
    expect(noSamePreset.preset.family).not.toBe("documentary");

    const afterHighIntensity = selectMotionPreset({
      seed: "after-high",
      context: {
        videoKind: "short",
        previousPresetId: "short_snap_zoom",
      },
      config: { enabled: true },
    });
    expect(afterHighIntensity.preset.intensity).not.toBe("high");
  });

  it("validates explicit preset overrides", () => {
    expect(
      selectMotionPreset({
        seed: "explicit",
        context: { videoKind: "full" },
        config: { enabled: true, explicitPresetId: "doc_slow_push_in" },
      }).preset.id
    ).toBe("doc_slow_push_in");

    expect(() =>
      selectMotionPreset({
        seed: "bad-explicit",
        context: { videoKind: "full" },
        config: {
          enabled: true,
          explicitPresetId: "missing" as "doc_slow_push_in",
        },
      })
    ).toThrow(/Unknown explicit/u);

    expect(() =>
      selectMotionPreset({
        seed: "shorts-explicit",
        context: { videoKind: "full" },
        config: { enabled: true, explicitPresetId: "short_fast_push" },
      })
    ).toThrow(/not allowed/u);
  });

  it("keeps approximate family distribution within tolerance", () => {
    const total = 1200;
    const counts = new Map<string, number>();
    for (let index = 0; index < total; index += 1) {
      const family = selectMotionPreset({
        seed: `distribution-${index}`,
        context: {
          videoKind: "full",
          storyBeat: "unknown",
          imageKind: "unknown",
          shotIndex: index,
        },
        config: { enabled: true },
      }).preset.family;
      counts.set(family, (counts.get(family) ?? 0) + 1);
    }

    for (const item of motionFamilyDistributions.full) {
      const observed = (counts.get(item.family) ?? 0) / total;
      expect(Math.abs(observed - item.weight)).toBeLessThan(0.09);
    }
  });
});
