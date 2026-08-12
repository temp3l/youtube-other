import {
  buildMicrodramaSourcePlatePrompt,
  type MicrodramaSourcePlatePromptInput,
} from "@mediaforge/visual-planning";

import {
  MICRODRAMA_VISUAL_GENERATION_SCHEMA_VERSION,
  type MicrodramaVisualGenerationRequest,
} from "@mediaforge/image-generation/microdrama-visual-generation";

import type { V5SceneShotPlanRecord } from "./v5-scene-shot-compiler-contracts.js";

export type MicrodramaVisualGenerationPlanItem = {
  readonly request: MicrodramaVisualGenerationRequest;
  readonly promptInput: MicrodramaSourcePlatePromptInput;
};

export function buildMicrodramaVisualGenerationPlan(input: {
  readonly seriesId: string;
  readonly plan: V5SceneShotPlanRecord;
  readonly registryRevisionFingerprints: readonly string[];
  readonly sceneShotPlanApproved?: boolean;
}): readonly MicrodramaVisualGenerationPlanItem[] {
  const sceneShotPlanApproved = input.sceneShotPlanApproved ?? true;
  if (!sceneShotPlanApproved) {
    return [];
  }

  const uniquePlates = new Map<
    string,
    {
      readonly sourcePlateSemanticId: string;
      readonly sceneSemanticId: string;
      readonly blockingKind: V5SceneShotPlanRecord["scenes"][number]["blockingKind"];
      readonly registryReferences: V5SceneShotPlanRecord["scenes"][number]["registryReferences"];
      readonly shotSemanticId: string;
    }
  >();

  for (const scene of input.plan.scenes) {
    const representativeShot = input.plan.shots.find(
      (shot) => shot.sourcePlateSemanticId === scene.sourcePlateSemanticId
    );
    if (!representativeShot) {
      continue;
    }
    uniquePlates.set(scene.sourcePlateSemanticId, {
      sourcePlateSemanticId: scene.sourcePlateSemanticId,
      sceneSemanticId: scene.sceneSemanticId,
      blockingKind: scene.blockingKind,
      registryReferences: scene.registryReferences,
      shotSemanticId: representativeShot.shotSemanticId,
    });
  }

  return [...uniquePlates.values()]
    .sort((left, right) =>
      left.sourcePlateSemanticId.localeCompare(right.sourcePlateSemanticId)
    )
    .map((plate) => {
      const promptInput: MicrodramaSourcePlatePromptInput = {
        sourcePlateSemanticId: plate.sourcePlateSemanticId,
        sceneSemanticId: plate.sceneSemanticId,
        blockingKind: plate.blockingKind,
        registryRevisionFingerprints: [...input.registryRevisionFingerprints],
        sceneShotPlanRevisionId: input.plan.shotPlanRevisionId,
      };
      const prompt = buildMicrodramaSourcePlatePrompt(promptInput);
      return {
        promptInput,
        request: {
          schemaVersion: MICRODRAMA_VISUAL_GENERATION_SCHEMA_VERSION,
          requestId: `req.visual.${plate.sourcePlateSemanticId}`,
          seriesId: input.seriesId,
          episodeId: input.plan.episodeId,
          sceneShotPlanRevisionId: input.plan.shotPlanRevisionId,
          assetKind: "source_plate",
          shotSemanticId: plate.shotSemanticId,
          sourcePlateSemanticId: plate.sourcePlateSemanticId,
          sceneSemanticId: plate.sceneSemanticId,
          blockingKind: plate.blockingKind,
          registryReferences: plate.registryReferences,
          promptText: prompt.promptText,
          forceRegeneration: false,
        },
      };
    });
}

export function buildMicrodramaShotVisualGenerationRequests(input: {
  readonly seriesId: string;
  readonly plan: V5SceneShotPlanRecord;
  readonly registryRevisionFingerprints: readonly string[];
}): readonly MicrodramaVisualGenerationRequest[] {
  return input.plan.shots.map((shot) => {
    const scene = input.plan.scenes.find(
      (entry) => entry.sceneSemanticId === shot.sceneSemanticId
    );
    if (!scene) {
      throw new Error(`Missing scene for shot ${shot.shotSemanticId}`);
    }
    const prompt = buildMicrodramaSourcePlatePrompt({
      sourcePlateSemanticId: shot.sourcePlateSemanticId,
      sceneSemanticId: shot.sceneSemanticId,
      blockingKind: shot.blockingKind,
      registryRevisionFingerprints: [...input.registryRevisionFingerprints],
      sceneShotPlanRevisionId: input.plan.shotPlanRevisionId,
    });
    return {
      schemaVersion: MICRODRAMA_VISUAL_GENERATION_SCHEMA_VERSION,
      requestId: `req.visual.${shot.shotSemanticId}`,
      seriesId: input.seriesId,
      episodeId: input.plan.episodeId,
      sceneShotPlanRevisionId: input.plan.shotPlanRevisionId,
      assetKind: "editorial_shot",
      shotSemanticId: shot.shotSemanticId,
      sourcePlateSemanticId: shot.sourcePlateSemanticId,
      sceneSemanticId: shot.sceneSemanticId,
      blockingKind: shot.blockingKind,
      registryReferences: shot.registryReferences,
      promptText: prompt.promptText,
      forceRegeneration: false,
    };
  });
}
