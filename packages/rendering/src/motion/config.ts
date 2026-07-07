import type { MotionRenderConfig } from "./types.js";

export const defaultMotionRenderConfig = Object.freeze({
  enabled: false,
  debug: false,
  seed: "render-motion-default",
  allowShortsPresetsForFull: false,
  preventSamePresetBackToBack: true,
  maxSameFamilyRunLength: 2,
  preventConsecutiveHighIntensity: true,
} satisfies MotionRenderConfig);

export function resolveMotionRenderConfig(
  override: Partial<MotionRenderConfig> = {}
): MotionRenderConfig {
  return Object.freeze({
    ...defaultMotionRenderConfig,
    ...override,
  });
}
