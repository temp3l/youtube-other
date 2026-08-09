import {
  buildSemanticMediaPlan,
  type SemanticPlannerInput,
  type VeronicaIngestedAsset,
  type VeronicaMediaPlan,
} from "@mediaforge/veronica-media";
import type { SourcePolicyDecision } from "./source-policy.js";
import type { StrategicSourceAdaptationResult } from "./source-adaptation-bridge.js";

export interface StrategicSceneVisualPlanInput {
  readonly episodeId: string;
  readonly narration: Pick<
    StrategicSourceAdaptationResult,
    "canonicalScript" | "editorialOutline" | "narrationRevision"
  >;
  readonly assets: readonly VeronicaIngestedAsset[];
  /** A failed source-policy result is fail-closed for display, but stays auditable as context. */
  readonly sourcePolicyByAssetId?: Readonly<Record<string, SourcePolicyDecision>>;
}

/**
 * Veronica adapter for the shared deterministic planner. It carries the
 * source-led narration identity and source-policy decisions into one canonical
 * visual-plan artifact; it never dispatches a provider or mutates originals.
 */
export function planStrategicSceneVisualMedia(
  input: StrategicSceneVisualPlanInput,
): VeronicaMediaPlan {
  const assets = input.assets.map((asset) => {
    const policy = input.sourcePolicyByAssetId?.[asset.assetId];
    return {
      ...asset,
      ...(policy && !policy.allowed ? { displayPolicy: "forbidden-display" as const } : {}),
    };
  });
  const semanticInput: SemanticPlannerInput = {
    episodeId: input.episodeId,
    originalNarration: input.narration.canonicalScript,
    revisedNarration: input.narration.canonicalScript,
    narrationRevisionId: input.narration.narrationRevision.revisionId,
    narrationOutline: input.narration.editorialOutline.map((line) => ({
      sceneId: line.beatId,
      narrationLineId: line.lineId,
    })),
    assets,
    targetLanguage: "it",
    sourceLanguage: "it",
  };
  return buildSemanticMediaPlan(semanticInput);
}
