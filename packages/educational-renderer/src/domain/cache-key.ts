import type { NormalizedRenderProfile, VisualScene } from "../contracts.js";
import { canonicalJson, hashText } from "../infrastructure/files.js";

export interface SceneCacheKeyInput { readonly scene: VisualScene; readonly profile: NormalizedRenderProfile; readonly locale: string; readonly fontHash: string; }
export function createSceneCacheKey(input: SceneCacheKeyInput): string {
  return hashText(canonicalJson({ scene: input.scene, sceneSchemaVersion: "visual-scene.v1", renderer: "svg-static.v1", packageVersion: "0.1.0", rendererFormatVersion: "educational-video.v1", profile: input.profile, themeVersion: "midnight-math.v1", locale: input.scene.localeSensitivity === "language-neutral" ? null : input.locale, font: { family: "DejaVu Sans", sha256: input.fontHash }, formulaRenderer: "katex-0.17.0", svgRenderer: "ffmpeg-librsvg", deterministicSeed: 0, representation: "static-segment", featureFlags: [] }));
}
