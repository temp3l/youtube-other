import type { NormalizedRenderProfile, VisualScene } from "../contracts.js";
import { canonicalJson, hashText } from "../infrastructure/files.js";
import { isChalkAnimatedScene, CHALK_RENDERER_VERSION } from "../renderers/chalk-animation.js";
import { SVG_RENDERER_VERSION } from "../renderers/svg.js";

export interface SceneCacheKeyInput { readonly scene: VisualScene; readonly profile: NormalizedRenderProfile; readonly locale: string; readonly fontHash: string; readonly toolchainIdentity: string; }
export function createSceneCacheKey(input: SceneCacheKeyInput): string {
  const { narrationCue: _narrationCue, ...visualScene } = input.scene;
  const animated = isChalkAnimatedScene(input.scene);
  return hashText(canonicalJson({ scene: visualScene, sceneSchemaVersion: "visual-scene.v1", renderer: animated ? CHALK_RENDERER_VERSION : SVG_RENDERER_VERSION, packageVersion: "0.1.0", rendererFormatVersion: "educational-video.v2", profile: input.profile, themeVersion: "midnight-math.v1", locale: input.scene.localeSensitivity === "language-neutral" ? null : input.locale, font: { sha256: input.fontHash }, formulaRenderer: "native-svg-math.v1", svgRenderer: "ffmpeg-librsvg", toolchainIdentity: input.toolchainIdentity, deterministicSeed: 0, representation: animated ? "animated-segment" : "static-segment", featureFlags: animated ? ["chalk-write"] : [] }));
}
