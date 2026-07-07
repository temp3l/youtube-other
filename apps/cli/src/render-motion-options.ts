import { Command } from "commander";
import type { MotionRenderConfig, MotionRenderMode } from "@mediaforge/rendering";

export interface RenderMotionCliOptions {
  readonly motion?: boolean;
  readonly motionMode?: string;
  readonly motionSeed?: string;
  readonly motionDebug?: boolean;
  readonly motionRenderPreset?: string;
}

const motionModes: readonly MotionRenderMode[] = [
  "off",
  "safe",
  "cinematic",
  "shorts",
];

const renderMotionPresetIds = [
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

type RenderMotionPresetId = (typeof renderMotionPresetIds)[number];

function isMotionMode(value: string): value is MotionRenderMode {
  return motionModes.includes(value as MotionRenderMode);
}

function isRenderMotionPresetId(value: string): value is RenderMotionPresetId {
  return renderMotionPresetIds.includes(value as RenderMotionPresetId);
}

export function addRenderMotionOptions<TCommand extends Command>(
  command: TCommand
): TCommand {
  command
    .option("--motion", "enable FFmpeg render-time motion")
    .option("--no-motion", "disable FFmpeg render-time motion")
    .option("--motion-mode <off|safe|cinematic|shorts>", "render-motion mode")
    .option("--motion-seed <seed>", "deterministic render-motion seed")
    .option("--motion-debug", "write render-motion debug report")
    .option("--motion-render-preset <presetId>", "explicit render-motion preset id");
  return command;
}

export function buildMotionRenderConfigFromCli(
  options: RenderMotionCliOptions
): MotionRenderConfig | undefined {
  if (options.motionMode !== undefined && !isMotionMode(options.motionMode)) {
    throw new Error(
      `Unsupported motion mode: ${options.motionMode}. Expected one of: ${motionModes.join(", ")}.`
    );
  }
  if (
    options.motionRenderPreset !== undefined &&
    !isRenderMotionPresetId(options.motionRenderPreset)
  ) {
    throw new Error(
      `Unsupported motion render preset: ${options.motionRenderPreset}. Expected one of: ${renderMotionPresetIds.join(", ")}.`
    );
  }

  const hasMotionFlag =
    options.motion !== undefined ||
    options.motionMode !== undefined ||
    options.motionSeed !== undefined ||
    options.motionDebug !== undefined ||
    options.motionRenderPreset !== undefined;
  if (!hasMotionFlag) {
    return undefined;
  }

  const mode = options.motionMode ?? (options.motion === false ? "off" : "safe");
  return Object.freeze({
    enabled: options.motion === false ? false : mode !== "off",
    debug: options.motionDebug ?? false,
    mode,
    seed: options.motionSeed ?? "render-motion-default",
    allowShortsPresetsForFull: false,
    preventSamePresetBackToBack: true,
    maxSameFamilyRunLength: 2,
    preventConsecutiveHighIntensity: true,
    ...(options.motionRenderPreset !== undefined
      ? { explicitPresetId: options.motionRenderPreset }
      : {}),
  });
}
