import { BEAT_CATEGORIES, beatPlanPacingRatios } from "@mediaforge/narrative-core";
import {
  beatSemanticId,
  sceneSemanticId,
  shotSemanticId,
  sourcePlateSemanticId,
} from "@mediaforge/scene-planning";
import { resolveMicrodramaAssetDensityPolicy } from "@mediaforge/visual-planning";

import {
  validateV5SceneShotPlanRecord,
  type V5SceneShotPlanRecord,
} from "./v5-scene-shot-compiler-contracts.js";

export function buildMinimalSceneShotPlanFixture(
  episodeId = "E001",
): V5SceneShotPlanRecord {
  const episodeNumber = 1;
  const assetDensityPolicy = resolveMicrodramaAssetDensityPolicy(episodeNumber);
  const sourcePlates = Array.from(
    { length: assetDensityPolicy.sourcePlateTarget },
    (_, index) => sourcePlateSemanticId(episodeId, index + 1),
  );
  const registryReferences = [
    {
      entryId: "character.maya",
      entryKind: "character" as const,
      revisionId: "rev.registry.seed.character.maya",
    },
    {
      entryId: "location.city-street",
      entryKind: "location" as const,
      revisionId: "rev.registry.seed.location.city-street",
    },
  ];

  const beats = BEAT_CATEGORIES.map((category, index) => {
    const ratio = beatPlanPacingRatios[category];
    return {
      beatSemanticId: beatSemanticId(episodeId, category),
      beatPlanBeatId: `beat.${episodeId.toLowerCase()}.${category.toLowerCase()}`,
      category,
      order: index + 1,
      timing: {
        startRatio: ratio.start,
        endRatio: ratio.end,
        targetSeconds: 6,
      },
      requiredReactions: [] as const,
    };
  });

  const scenes = BEAT_CATEGORIES.map((category, index) => {
    const order = index + 1;
    const plateIndex = Math.min(index, sourcePlates.length - 1);
    return {
      sceneSemanticId: sceneSemanticId(episodeId, order),
      beatSemanticId: beatSemanticId(episodeId, category),
      order,
      sourcePlateSemanticId: sourcePlates[plateIndex]!,
      timing: beats[index]!.timing,
      registryReferences,
      continuitySceneSemanticIds: index === 0 ? [] : [sceneSemanticId(episodeId, index)],
      blockingKind: "establishing" as const,
    };
  });

  const shotCounts = Array.from({ length: scenes.length }, (_, index) =>
    index < assetDensityPolicy.editorialCutTarget ? 1 : 0,
  );
  const shots = scenes.flatMap((scene, sceneIndex) => {
    const shotsInScene = shotCounts[sceneIndex] ?? 0;
    return Array.from({ length: shotsInScene }, (_, shotIndex) => {
      const shotOrderInScene = shotIndex + 1;
      return {
        shotSemanticId: shotSemanticId(episodeId, scene.order, shotOrderInScene),
        sceneSemanticId: scene.sceneSemanticId,
        beatSemanticId: scene.beatSemanticId,
        order: 0,
        sceneOrder: scene.order,
        shotOrderInScene,
        sourcePlateSemanticId: scene.sourcePlateSemanticId,
        timing: scene.timing,
        blockingKind: scene.blockingKind,
        reactions: [] as const,
        registryReferences,
        continuitySceneSemanticIds: scene.continuitySceneSemanticIds,
      };
    });
  }).map((shot, index) => ({
    ...shot,
    order: index + 1,
  }));

  return validateV5SceneShotPlanRecord({
    episodeId,
    episodeNumber,
    episodeSpecRevisionId: `rev.episode-spec.${episodeId.toLowerCase()}`,
    beatPlanRevisionId: `rev.beat-plan.${episodeId.toLowerCase()}`,
    scenePlanRevisionId: `rev.scene-plan.${episodeId.toLowerCase()}`,
    shotPlanRevisionId: `rev.shot-plan.${episodeId.toLowerCase()}`,
    beats,
    scenes,
    shots,
    assetDensityPolicy,
  });
}
