import type { VisualNarrativePhase } from "@mediaforge/domain";

export type MotionPresetFamily =
  | "documentary"
  | "tension"
  | "reveal"
  | "shorts"
  | "ambient";

export type MotionIntensity = "low" | "medium" | "high";

export type MotionVideoKind = "full" | "short";

export type MotionRenderMode = "off" | "safe" | "cinematic" | "shorts";

export type MotionStoryBeat = VisualNarrativePhase | "unknown";

export type MotionImageKind =
  | "wide"
  | "subject"
  | "detail"
  | "environment"
  | "texture"
  | "unknown";

export type MotionPresetId =
  | "doc_slow_push_in"
  | "doc_slow_pull_back"
  | "doc_left_drift"
  | "tension_creep_zoom"
  | "tension_breathing_frame"
  | "tension_shadow_push"
  | "reveal_pan_to_subject"
  | "reveal_zoom_to_detail"
  | "reveal_from_darkness"
  | "short_fast_push"
  | "short_snap_zoom"
  | "short_impact_shake"
  | "ambient_fog_drift"
  | "ambient_light_flicker"
  | "ambient_static_hold";

export interface MotionPreset {
  readonly id: MotionPresetId;
  readonly family: MotionPresetFamily;
  readonly label: string;
  readonly intensity: MotionIntensity;
  readonly allowedVideoKinds: readonly MotionVideoKind[];
  readonly storyBeats: readonly MotionStoryBeat[];
  readonly imageKinds: readonly MotionImageKind[];
  readonly durationSeconds: {
    readonly min: number;
    readonly max: number;
  };
  readonly weight: number;
}

export interface ShotMotionContext {
  readonly videoKind: MotionVideoKind;
  readonly storyBeat?: MotionStoryBeat;
  readonly imageKind?: MotionImageKind;
  readonly shotIndex?: number;
  readonly durationSeconds?: number;
  readonly previousPresetId?: MotionPresetId;
  readonly recentPresetIds?: readonly MotionPresetId[];
}

export interface SelectedMotionPreset {
  readonly preset: MotionPreset;
  readonly seed: string;
  readonly fallbackUsed: boolean;
  readonly reason: string;
}

export interface MotionRenderConfig {
  readonly enabled: boolean;
  readonly debug: boolean;
  readonly mode: MotionRenderMode;
  readonly seed: string;
  readonly allowShortsPresetsForFull: boolean;
  readonly preventSamePresetBackToBack: boolean;
  readonly maxSameFamilyRunLength: number;
  readonly preventConsecutiveHighIntensity: boolean;
  readonly explicitPresetId?: MotionPresetId;
}
