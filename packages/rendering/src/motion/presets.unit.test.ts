import { describe, expect, it } from "vitest";
import {
  getMotionPreset,
  isMotionPresetId,
  motionPresets,
  validateMotionPresetRegistry,
} from "./presets.js";
import type { MotionPreset } from "./types.js";

const expectedIds = [
  "doc_slow_push_in",
  "doc_slow_pull_back",
  "doc_left_drift",
  "tension_creep_zoom",
  "tension_breathing_frame",
  "tension_shadow_push",
  "reveal_pan_to_subject",
  "reveal_zoom_to_detail",
  "reveal_from_darkness",
  "short_fast_push",
  "short_snap_zoom",
  "short_impact_shake",
  "ambient_fog_drift",
  "ambient_light_flicker",
  "ambient_static_hold",
] as const;

describe("motion preset registry", () => {
  it("contains exactly the initial fifteen unique presets", () => {
    expect(motionPresets.map((preset) => preset.id)).toEqual(expectedIds);
    expect(new Set(motionPresets.map((preset) => preset.id)).size).toBe(15);
    expect(() => validateMotionPresetRegistry(motionPresets)).not.toThrow();
  });

  it("looks up known presets and rejects unknown ids", () => {
    expect(isMotionPresetId("doc_slow_push_in")).toBe(true);
    expect(isMotionPresetId("missing")).toBe(false);
    expect(getMotionPreset("ambient_static_hold")).toMatchObject({
      id: "ambient_static_hold",
      family: "ambient",
    });
  });

  it("freezes exported registry data", () => {
    expect(Object.isFrozen(motionPresets)).toBe(true);
    expect(Object.isFrozen(motionPresets[0])).toBe(true);
    expect(Object.isFrozen(motionPresets[0]?.storyBeats)).toBe(true);
    expect(Object.isFrozen(motionPresets[0]?.durationSeconds)).toBe(true);
  });

  it("rejects invalid registry entries", () => {
    const valid = [...motionPresets];
    const duplicate = [valid[0], valid[0], ...valid.slice(2)] as MotionPreset[];
    expect(() => validateMotionPresetRegistry(duplicate)).toThrow(/Duplicate/u);

    expect(() =>
      validateMotionPresetRegistry(
        [
          {
            ...valid[0],
            durationSeconds: { min: 3, max: 1 },
          } as MotionPreset,
          ...valid.slice(1),
        ]
      )
    ).toThrow(/duration/u);

    expect(() =>
      validateMotionPresetRegistry(
        [
          {
            ...valid[0],
            intensity: "extreme",
          } as unknown as MotionPreset,
          ...valid.slice(1),
        ]
      )
    ).toThrow(/intensity/u);
  });

  it("keeps shorts-family presets short-only by default", () => {
    expect(
      motionPresets
        .filter((preset) => preset.family === "shorts")
        .every((preset) => preset.allowedVideoKinds.join(",") === "short")
    ).toBe(true);

    expect(() =>
      validateMotionPresetRegistry(
        [
          ...motionPresets.slice(0, 9),
          {
            ...motionPresets[9],
            allowedVideoKinds: ["full", "short"],
          } as MotionPreset,
          ...motionPresets.slice(10),
        ]
      )
    ).toThrow(/Shorts/u);
  });
});
