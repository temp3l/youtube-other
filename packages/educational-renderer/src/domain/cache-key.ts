import type { NormalizedRenderProfile, VisualScene } from "../contracts.js";
import { canonicalJson, hashText } from "../infrastructure/files.js";

export interface SceneCacheKeyInput { readonly scene: VisualScene; readonly profile: NormalizedRenderProfile; readonly locale: string; readonly fontHash: string; readonly toolchainIdentity: string; }
export function createSceneCacheKey(input: SceneCacheKeyInput): string {
  const { narrationCue: _narrationCue, ...visualScene } = input.scene;
  return hashText(canonicalJson({ scene: visualScene, sceneSchemaVersion: "visual-scene.v1", renderer: "svg-static.v3", packageVersion: "0.1.0", rendererFormatVersion: "educational-video.v2", profile: input.profile, themeVersion: "midnight-math.v1", locale: input.scene.localeSensitivity === "language-neutral" ? null : input.locale, font: { sha256: input.fontHash }, formulaRenderer: "native-svg-math.v1", svgRenderer: "ffmpeg-librsvg", toolchainIdentity: input.toolchainIdentity, deterministicSeed: 0, representation: "static-segment", featureFlags: [] }));
}
