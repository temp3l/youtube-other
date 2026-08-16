import type { BeatCategory, BeatEntry } from "@mediaforge/narrative-core";
import { beatPlanPacingRatios } from "@mediaforge/narrative-core";
import {
  beatSemanticId,
  sceneSemanticId,
  shotSemanticId,
  slugifyRegistryEntryId,
  sourcePlateSemanticId,
} from "@mediaforge/scene-planning";
import {
  distributeEditorialCutsAcrossScenes,
  resolveFrontLoadUniqueCutsForDuration,
  resolveMicrodramaAssetDensityPolicy,
  REVIEW_FRONT_LOAD_UNTIL_RATIO,
} from "@mediaforge/visual-planning";
import { beatPlanPacingRatios } from "@mediaforge/narrative-core";

import type { V5EpisodeProductionBundle, V5EpisodeProductionRecord } from "./v5-episode-production-contracts.js";
import { validateV5EpisodeProductionRecord } from "./v5-episode-production-contracts.js";
import {
  type MicrodramaShotBlockingKind,
  type MicrodramaShotReactionKind,
  type ProjectedLocaleShotTiming,
  type SemanticBeatPlanEntry,
  type SemanticScenePlanEntry,
  type SemanticShotPlanEntry,
  type SemanticTimingWindow,
  type V5SceneShotPlanBundle,
  type V5SceneShotPlanIssue,
  type V5SceneShotPlanRecord,
  type V5SceneShotPlanResult,
  v5SceneShotPlanRecordSchema,
} from "./v5-scene-shot-compiler-contracts.js";
import { MICRODRAMA_PACK_SCHEMA_VERSION } from "./v5-pack-constants.js";

const BEAT_CATEGORY_WEIGHTS: Readonly<Record<BeatCategory, number>> = {
  HOOK: 1.2,
  ORIENTATION: 1,
  CONFLICT: 1.1,
  ESCALATION: 1.4,
  DISCOVERY: 1.2,
  REVERSAL: 1.3,
  DECISION: 1,
  CONSEQUENCE: 1,
  CLIFFHANGER: 1.5,
};

const BLOCKING_BY_CATEGORY: Readonly<Record<BeatCategory, MicrodramaShotBlockingKind>> = {
  HOOK: "establishing",
  ORIENTATION: "establishing",
  CONFLICT: "reaction",
  ESCALATION: "controlled_mouth",
  DISCOVERY: "insert",
  REVERSAL: "reaction",
  DECISION: "dialogue",
  CONSEQUENCE: "offscreen",
  CLIFFHANGER: "phone",
};

const REACTION_ALIASES: Readonly<Record<string, MicrodramaShotReactionKind>> = {
  retain_open_loop: "retain_open_loop",
  honor_prior_opening_obligation: "honor_prior_opening_obligation",
};

function fail(issues: V5SceneShotPlanIssue[]): V5SceneShotPlanResult {
  return { ok: false, issues };
}

function scenePlanRevisionId(episodeId: string): string {
  return `rev.scene-plan.${episodeId.toLowerCase()}`;
}

function shotPlanRevisionId(episodeId: string): string {
  return `rev.shot-plan.${episodeId.toLowerCase()}`;
}

function registryRevisionId(entryId: string): string {
  return `rev.registry.seed.${entryId}`;
}

function buildTimingWindow(beat: BeatEntry): SemanticTimingWindow {
  const ratio = beatPlanPacingRatios[beat.category as BeatCategory];
  return {
    startRatio: ratio.start,
    endRatio: ratio.end,
    targetSeconds: beat.durationTargetSeconds.targetSeconds,
  };
}

function mapRequiredReactions(requiredReactions: readonly string[]): MicrodramaShotReactionKind[] {
  return requiredReactions.flatMap((reaction) => {
    const mapped = REACTION_ALIASES[reaction];
    return mapped ? [mapped] : [];
  });
}

function buildRegistryReferences(args: {
  participants: readonly string[];
  location: string;
}): SemanticScenePlanEntry["registryReferences"] {
  const references = [
    ...args.participants.map((participant) => ({
      entryId: slugifyRegistryEntryId("character", participant),
      entryKind: "character" as const,
      revisionId: registryRevisionId(slugifyRegistryEntryId("character", participant)),
    })),
    {
      entryId: slugifyRegistryEntryId("location", args.location),
      entryKind: "location" as const,
      revisionId: registryRevisionId(slugifyRegistryEntryId("location", args.location)),
    },
  ];

  return references;
}

function assignSourcePlates(
  episodeId: string,
  sourcePlateTarget: number
): SourcePlateAssignment[] {
  return Array.from({ length: sourcePlateTarget }, (_, index) => ({
    plateSemanticId: sourcePlateSemanticId(episodeId, index + 1),
    order: index + 1,
  }));
}

type SourcePlateAssignment = {
  readonly plateSemanticId: ReturnType<typeof sourcePlateSemanticId>;
  readonly order: number;
};

function resolvePlateForSceneIndex(
  sceneIndex: number,
  plates: readonly SourcePlateAssignment[]
): SourcePlateAssignment {
  const plateIndex = Math.min(sceneIndex, plates.length - 1);
  return plates[plateIndex] ?? plates[0]!;
}

export function compileSceneShotPlanFromProductionRecord(
  record: V5EpisodeProductionRecord
): V5SceneShotPlanRecord {
  const productionRecord = validateV5EpisodeProductionRecord(record);
  const episodeId = productionRecord.episodeId;
  const episodeNumber = productionRecord.episodeSpec.episodeNumber;
  const durationSeconds =
    productionRecord.episodeSpec.durationRangeSeconds.maxSeconds ||
    productionRecord.episodeSpec.durationRangeSeconds.targetSeconds;
  const assetDensityPolicy = resolveMicrodramaAssetDensityPolicy(episodeNumber, {
    durationSeconds,
  });
  const sourcePlates = assignSourcePlates(episodeId, assetDensityPolicy.sourcePlateTarget);
  const registryReferences = buildRegistryReferences({
    participants: productionRecord.episodeSpec.startingConditions.cast,
    location: productionRecord.episodeSpec.startingConditions.location,
  });

  const beats: SemanticBeatPlanEntry[] = productionRecord.beatPlan.beats.map((beat) => ({
    beatSemanticId: beatSemanticId(episodeId, beat.category),
    beatPlanBeatId: beat.beatId,
    category: beat.category,
    order: beat.order,
    timing: buildTimingWindow(beat),
    requiredReactions: mapRequiredReactions(beat.requiredReactions),
    boundaryObligation: beat.boundaryObligation,
  }));

  const scenesWithoutPlates: SemanticScenePlanEntry[] = productionRecord.beatPlan.beats.map(
    (beat, index) => {
      const order = index + 1;
      const continuitySceneSemanticIds =
        index === 0 ? [] : [sceneSemanticId(episodeId, index)];

      return {
        sceneSemanticId: sceneSemanticId(episodeId, order),
        beatSemanticId: beatSemanticId(episodeId, beat.category),
        order,
        sourcePlateSemanticId: sourcePlates[0]!.plateSemanticId,
        timing: buildTimingWindow(beat),
        registryReferences,
        continuitySceneSemanticIds,
        blockingKind: BLOCKING_BY_CATEGORY[beat.category],
      };
    }
  );

  const shotCounts = distributeEditorialCutsAcrossScenes({
    sceneCount: scenesWithoutPlates.length,
    editorialCutTarget: assetDensityPolicy.editorialCutTarget,
    sceneWeights: productionRecord.beatPlan.beats.map(
      (beat) => BEAT_CATEGORY_WEIGHTS[beat.category]
    ),
    sceneStartRatios: productionRecord.beatPlan.beats.map(
      (beat) => beatPlanPacingRatios[beat.category].start
    ),
    sceneEndRatios: productionRecord.beatPlan.beats.map(
      (beat) => beatPlanPacingRatios[beat.category].end
    ),
    ...(assetDensityPolicy.scope === "review"
      ? {
          frontLoadUntilRatio: REVIEW_FRONT_LOAD_UNTIL_RATIO,
          frontLoadUniqueCuts: resolveFrontLoadUniqueCutsForDuration(durationSeconds),
        }
      : {}),
  });

  // Representative plate per scene for scene records; shots may override for uniqueness.
  const plateBySceneOrder = new Map<number, SourcePlateAssignment>();
  let plateCursor = 0;
  for (const [sceneIndex, scene] of scenesWithoutPlates.entries()) {
    if ((shotCounts[sceneIndex] ?? 0) <= 0) {
      continue;
    }
    const plate = sourcePlates[plateCursor % sourcePlates.length]!;
    plateBySceneOrder.set(scene.order, plate);
    plateCursor += 1;
  }

  const scenes: SemanticScenePlanEntry[] = scenesWithoutPlates.map((scene, index) => {
    const plate =
      plateBySceneOrder.get(scene.order) ??
      resolvePlateForSceneIndex(index, sourcePlates);
    return {
      ...scene,
      sourcePlateSemanticId: plate.plateSemanticId,
    };
  });

  const shots: SemanticShotPlanEntry[] = [];
  const usedEarlyPlates = new Set<string>();
  let earlyUniqueAssigned = 0;
  let uniquePlateCursor = 0;
  const frontLoadUniquePlates =
    assetDensityPolicy.scope === "review"
      ? resolveFrontLoadUniqueCutsForDuration(durationSeconds)
      : 0;
  const preferUniquePlatesPerShot =
    assetDensityPolicy.scope === "review" ||
    assetDensityPolicy.sourcePlateTarget >= assetDensityPolicy.editorialCutTarget;

  for (const [sceneIndex, scene] of scenes.entries()) {
    const beat = productionRecord.beatPlan.beats[sceneIndex];
    if (!beat) {
      continue;
    }
    const shotsInScene = shotCounts[sceneIndex] ?? 1;
    if (shotsInScene <= 0) {
      continue;
    }
    const sceneDuration = beat.durationTargetSeconds.targetSeconds;
    for (let shotIndex = 0; shotIndex < shotsInScene; shotIndex += 1) {
      const startRatioWithinBeat = shotIndex / shotsInScene;
      const endRatioWithinBeat = (shotIndex + 1) / shotsInScene;
      const timing: SemanticTimingWindow = {
        startRatio: Number(
          (scene.timing.startRatio +
            (scene.timing.endRatio - scene.timing.startRatio) * startRatioWithinBeat).toFixed(4)
        ),
        endRatio: Number(
          (scene.timing.startRatio +
            (scene.timing.endRatio - scene.timing.startRatio) * endRatioWithinBeat).toFixed(4)
        ),
        targetSeconds: Number((sceneDuration / shotsInScene).toFixed(2)),
      };

      let plateSemanticId = scene.sourcePlateSemanticId;
      const isEarlyShot = timing.startRatio < REVIEW_FRONT_LOAD_UNTIL_RATIO;
      if (preferUniquePlatesPerShot) {
        if (
          frontLoadUniquePlates > 0 &&
          isEarlyShot &&
          earlyUniqueAssigned < frontLoadUniquePlates
        ) {
          const plate =
            sourcePlates.find((candidate) => !usedEarlyPlates.has(candidate.plateSemanticId)) ??
            sourcePlates[earlyUniqueAssigned % sourcePlates.length]!;
          plateSemanticId = plate.plateSemanticId;
          usedEarlyPlates.add(plateSemanticId);
          earlyUniqueAssigned += 1;
          uniquePlateCursor = Math.max(uniquePlateCursor, usedEarlyPlates.size);
        } else if (uniquePlateCursor < sourcePlates.length) {
          // Prefer unused plates so review cadence stays one unique image per cut.
          const plate =
            sourcePlates.find((candidate) => !usedEarlyPlates.has(candidate.plateSemanticId)) ??
            sourcePlates[uniquePlateCursor]!;
          plateSemanticId = plate.plateSemanticId;
          usedEarlyPlates.add(plateSemanticId);
          uniquePlateCursor += 1;
        } else {
          const plate = sourcePlates[uniquePlateCursor % sourcePlates.length]!;
          plateSemanticId = plate.plateSemanticId;
          uniquePlateCursor += 1;
        }
      }

      shots.push({
        shotSemanticId: shotSemanticId(episodeId, scene.order, shotIndex + 1),
        sceneSemanticId: scene.sceneSemanticId,
        beatSemanticId: scene.beatSemanticId,
        order: shots.length + 1,
        sceneOrder: scene.order,
        shotOrderInScene: shotIndex + 1,
        sourcePlateSemanticId: plateSemanticId,
        timing,
        blockingKind: BLOCKING_BY_CATEGORY[beat.category],
        reactions: mapRequiredReactions(beat.requiredReactions),
        registryReferences,
        continuitySceneSemanticIds: scene.continuitySceneSemanticIds,
      });
    }
  }

  return v5SceneShotPlanRecordSchema.parse({
    episodeId,
    episodeNumber,
    episodeSpecRevisionId: productionRecord.episodeSpecRevisionId,
    beatPlanRevisionId: productionRecord.beatPlanRevisionId,
    scenePlanRevisionId: scenePlanRevisionId(episodeId),
    shotPlanRevisionId: shotPlanRevisionId(episodeId),
    beats,
    scenes,
    shots,
    assetDensityPolicy,
  });
}

export function compileV5SceneShotPlans(
  productionBundle: V5EpisodeProductionBundle,
  compiledAt = new Date().toISOString()
): V5SceneShotPlanResult {
  const records: V5SceneShotPlanRecord[] = [];

  for (const record of productionBundle.records) {
    try {
      records.push(compileSceneShotPlanFromProductionRecord(record));
    } catch (error) {
      return fail([
        {
          code: "scene_shot_compile_invalid",
          message: error instanceof Error ? error.message : "Scene/shot compile failed",
          path: record.episodeId,
        },
      ]);
    }
  }

  return {
    ok: true,
    bundle: {
      schemaVersion: MICRODRAMA_PACK_SCHEMA_VERSION,
      importId: productionBundle.importId,
      compiledAt,
      records,
    },
  };
}

export function projectLocaleTimingOverSemanticPlan(args: {
  readonly plan: V5SceneShotPlanRecord;
  readonly measuredDurationMs: number;
}): ProjectedLocaleShotTiming[] {
  const { plan, measuredDurationMs } = args;
  const totalRatioSpan = plan.shots.reduce(
    (sum, shot) => sum + (shot.timing.endRatio - shot.timing.startRatio),
    0
  );

  let cursorMs = 0;
  const projections = plan.shots.map((shot, index) => {
    const ratioSpan = shot.timing.endRatio - shot.timing.startRatio;
    const isLast = index === plan.shots.length - 1;
    const durationMs = isLast
      ? Math.max(1, measuredDurationMs - cursorMs)
      : Math.max(
          1,
          Math.round((ratioSpan / totalRatioSpan) * measuredDurationMs)
        );
    const projected = {
      shotSemanticId: shot.shotSemanticId,
      startMs: cursorMs,
      endMs: cursorMs + durationMs,
    };
    cursorMs += durationMs;
    return projected;
  });

  return projections;
}

export {
  beatSemanticId,
  sceneSemanticId,
  shotSemanticId,
  sourcePlateSemanticId,
};
