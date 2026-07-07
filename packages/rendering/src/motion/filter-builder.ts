import {
  zoomPanFrameCount,
  type DimensionsPx,
  type VideoFilterOperation,
} from "../filter-builders/index.js";
import type { NormalizedPoint } from "../filter-builders/types.js";
import { stableSignedUnit } from "./seeded.js";
import type { MotionPreset, MotionVideoKind } from "./types.js";

export interface MotionPresetFilterBuildInput {
  readonly preset: MotionPreset;
  readonly durationSeconds: number;
  readonly fps: number;
  readonly output: DimensionsPx;
  readonly videoKind: MotionVideoKind;
  readonly seed: string;
}

export interface MotionPresetFilterPlan {
  readonly presetId: MotionPreset["id"];
  readonly videoKind: MotionVideoKind;
  readonly output: DimensionsPx;
  readonly durationSeconds: number;
  readonly fps: number;
  readonly frameCount: number;
  readonly operations: readonly VideoFilterOperation[];
}

export function buildMotionPresetFilterPlan(
  input: MotionPresetFilterBuildInput
): MotionPresetFilterPlan {
  const frameCount = zoomPanFrameCount(input);
  const operations = operationsForPreset(input);
  return Object.freeze({
    presetId: input.preset.id,
    videoKind: input.videoKind,
    output: Object.freeze({ ...input.output }),
    durationSeconds: input.durationSeconds,
    fps: input.fps,
    frameCount,
    operations: Object.freeze(operations),
  });
}

export function buildMotionPresetFilterOperations(
  input: MotionPresetFilterBuildInput
): readonly VideoFilterOperation[] {
  return buildMotionPresetFilterPlan(input).operations;
}

export function summarizeMotionFilterPlan(plan: MotionPresetFilterPlan): string {
  const kinds = plan.operations.map((operation) => operation.kind).join("+");
  return `${plan.presetId}:${plan.videoKind}:${plan.output.width}x${plan.output.height}:${plan.frameCount}f:${kinds}`;
}

function operationsForPreset(
  input: MotionPresetFilterBuildInput
): readonly VideoFilterOperation[] {
  switch (input.preset.id) {
    case "doc_slow_push_in":
      return withFormat([zoom(input, 1, 1.05)]);
    case "doc_slow_pull_back":
      return withFormat([zoom(input, 1.06, 1)]);
    case "doc_left_drift":
      return withFormat([
        zoom(input, 1.025, 1.025, { x: 0.56, y: 0.5 }, { x: 0.44, y: 0.5 }),
      ]);
    case "tension_creep_zoom":
      return withFormat([zoom(input, 1, 1.09), { kind: "vignette", angle: 0.72 }]);
    case "tension_breathing_frame":
      return withFormat([
        zoom(input, 1.025, 1.055),
        { kind: "eq", contrast: 1.04, saturation: 0.96 },
        { kind: "vignette", angle: 0.68 },
      ]);
    case "tension_shadow_push":
      return withFormat([
        zoom(input, 1.02, 1.12),
        { kind: "eq", brightness: -0.04, contrast: 1.12, saturation: 0.92 },
        { kind: "vignette", angle: 0.82 },
      ]);
    case "reveal_pan_to_subject":
      return withFormat([
        zoom(
          input,
          1.04,
          1.06,
          panStart(input, "x", -0.18),
          { x: 0.5, y: 0.5 }
        ),
      ]);
    case "reveal_zoom_to_detail":
      return withFormat([
        zoom(input, 1, 1.14, { x: 0.5, y: 0.5 }, seededCenter(input.seed, 0.08)),
      ]);
    case "reveal_from_darkness":
      return withFormat([
        zoom(input, 1.02, 1.1),
        { kind: "fade", direction: "in", startSeconds: 0, durationSeconds: fadeDuration(input) },
        { kind: "eq", brightness: -0.03, contrast: 1.08 },
      ]);
    case "short_fast_push":
      return withFormat([zoom(input, 1, 1.14)]);
    case "short_snap_zoom":
      return withFormat([
        zoom(input, 1, 1.2),
        { kind: "eq", contrast: 1.08, saturation: 1.05 },
      ]);
    case "short_impact_shake":
      return withFormat([
        zoom(input, 1.04, 1.12, seededCenter(input.seed, 0.04), seededCenter(`${input.seed}:end`, 0.06)),
        {
          kind: "rotate",
          angleDegrees: round(stableSignedUnit(`${input.seed}:rotate`) * 0.6),
          expandOutput: false,
          fillColor: "black",
        },
        { kind: "noise", strength: 0.025, temporal: true },
      ]);
    case "ambient_fog_drift":
      return withFormat([
        zoom(input, 1.02, 1.03, panStart(input, "x", 0.06), panStart(input, "x", -0.04)),
        { kind: "boxblur", radius: 1.2, power: 1 },
      ]);
    case "ambient_light_flicker":
      return withFormat([
        zoom(input, 1.01, 1.025),
        { kind: "eq", brightness: 0.025, contrast: 1.03, gamma: 1.02 },
      ]);
    case "ambient_static_hold":
      return [
        {
          kind: "scale",
          mode: "cover",
          widthPx: input.output.width,
          heightPx: input.output.height,
        },
        {
          kind: "crop",
          widthPx: input.output.width,
          heightPx: input.output.height,
          position: { mode: "center" },
        },
        { kind: "format", pixelFormat: "yuv420p" },
      ];
  }
}

function withFormat(
  operations: readonly VideoFilterOperation[]
): readonly VideoFilterOperation[] {
  return [...operations, { kind: "format", pixelFormat: "yuv420p" }];
}

function zoom(
  input: MotionPresetFilterBuildInput,
  startZoom: number,
  endZoom: number,
  startCenter: NormalizedPoint = { x: 0.5, y: 0.5 },
  endCenter: NormalizedPoint = { x: 0.5, y: 0.5 }
): VideoFilterOperation {
  return {
    kind: "zoompan",
    durationSeconds: input.durationSeconds,
    fps: input.fps,
    outputWidthPx: input.output.width,
    outputHeightPx: input.output.height,
    startZoom,
    endZoom,
    startCenter,
    endCenter,
  };
}

function seededCenter(seed: string, magnitude: number): NormalizedPoint {
  return {
    x: clampUnit(0.5 + stableSignedUnit(`${seed}:x`) * magnitude),
    y: clampUnit(0.5 + stableSignedUnit(`${seed}:y`) * magnitude),
  };
}

function panStart(
  input: MotionPresetFilterBuildInput,
  axis: "x" | "y",
  delta: number
): NormalizedPoint {
  if (input.videoKind === "short" && axis === "x") {
    return { x: 0.5, y: clampUnit(0.5 + delta) };
  }
  return axis === "x"
    ? { x: clampUnit(0.5 + delta), y: 0.5 }
    : { x: 0.5, y: clampUnit(0.5 + delta) };
}

function fadeDuration(input: MotionPresetFilterBuildInput): number {
  return Math.min(0.4, Math.max(0.1, input.durationSeconds / 5));
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, round(value)));
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
