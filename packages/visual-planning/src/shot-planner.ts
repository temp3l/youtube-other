import {
  shotIdSchema,
  shotPlanSchema,
  type CameraMotion,
  type FocalRegion,
  type NormalizedCrop,
  type RenderShot,
  type ShotPlan,
  type ShotTransition,
  type ShotTreatment,
  type VisualBudget,
  type VisualNarrativePhase,
  type VisualPacingProfile,
  type VisualSourceScene,
} from "@mediaforge/domain";
import {
  areTreatmentsCompatible,
  shotTreatmentCatalog,
  shotTreatmentCatalogVersion,
  type ReadonlyTreatmentCatalogEntry,
} from "@mediaforge/domain/visual-retention/treatment-catalog.js";
import { hashText } from "@mediaforge/shared";

export type VisualPlatform = ShotPlan["variant"];
export type AspectRatio = ShotPlan["aspectRatio"];

export interface ShotPlanningRestrictions {
  readonly disabledTreatmentIds?: readonly string[];
  readonly enabledTreatmentIds?: readonly string[];
  readonly allowNonDefaultTreatments?: boolean;
  readonly allowCacheRequiredTreatments?: boolean;
  readonly allowBlurredFillFallback?: boolean;
}

export interface PlanShotsInput {
  readonly sourceId: ShotPlan["sourceId"];
  readonly locale?: string;
  readonly platform: VisualPlatform;
  readonly aspectRatio: AspectRatio;
  readonly sourceScenes: readonly VisualSourceScene[];
  readonly pacingProfile: VisualPacingProfile;
  readonly visualBudget: VisualBudget;
  readonly treatmentCatalogVersion: string;
  readonly restrictions?: ShotPlanningRestrictions;
  readonly seed: string;
}

export interface ShotPlanningLimitation {
  readonly code:
    | "SHOT_BUDGET_TENSION"
    | "OPENING_CADENCE_LIMITED"
    | "SOURCE_IMAGE_REUSE_LIMITED";
  readonly message: string;
  readonly sceneId?: VisualSourceScene["sceneId"];
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

export interface ShotPlanningResult {
  readonly plan: ShotPlan;
  readonly limitations: readonly ShotPlanningLimitation[];
}

export interface ShotPlanner {
  plan(input: PlanShotsInput): ShotPlan;
}

export type ShotPlanningErrorCode =
  | "EMPTY_SOURCE_SCENES"
  | "INVALID_SOURCE_SCENE_TIMING"
  | "DUPLICATE_SOURCE_SCENE_ID"
  | "DUPLICATE_SCENE_ID"
  | "MISSING_SOURCE_IMAGE_ID"
  | "UNSUPPORTED_TREATMENT_CATALOG"
  | "NO_COMPATIBLE_TREATMENT";

export class ShotPlanningError extends Error {
  public readonly code: ShotPlanningErrorCode;
  public readonly sceneId: string | undefined;

  public constructor(
    code: ShotPlanningErrorCode,
    message: string,
    sceneId?: string,
  ) {
    super(message);
    this.name = "ShotPlanningError";
    this.code = code;
    this.sceneId = sceneId;
  }
}

type TreatmentId = ReadonlyTreatmentCatalogEntry["id"];

interface SceneAllocation {
  readonly sourceScene: VisualSourceScene;
  readonly shotCount: number;
  readonly minimumShotCount: number;
  readonly maximumShotCount: number;
  readonly priority: number;
}

interface PlannedShotDraft {
  readonly sourceScene: VisualSourceScene;
  readonly ordinalInScene: number;
  readonly startMs: number;
  readonly endMs: number;
}

interface PlanningState {
  readonly selectedTreatmentIds: readonly string[];
  readonly previousShot: RenderShot | undefined;
  readonly previousSameImageCrop: NormalizedCrop | undefined;
  readonly recentPanDirections: readonly PanDirection[];
}

type PanDirection = "left" | "right" | "up" | "down";

const plannerVersion = "deterministic-shot-planner-v1";
const openingWindowMs = 8_000;

const phasePriority: Record<VisualNarrativePhase, number> = {
  aftermath: 0,
  setup: 1,
  callback: 2,
  evidence: 3,
  escalation: 4,
  hook: 5,
  climax: 6,
};

const treatmentPreferenceByPhase: Record<VisualNarrativePhase, readonly string[]> = {
  hook: [
    "face-close-up",
    "object-detail-crop",
    "vertical-smart-crop",
    "smart-crop",
    "rule-of-thirds-reposition",
    "vignette-drift",
  ],
  setup: [
    "establishing-wide-crop",
    "medium-crop",
    "slow-push-in",
    "lateral-pan",
    "vertical-pan",
    "smart-crop",
    "handheld-micro-drift",
  ],
  evidence: [
    "object-detail-crop",
    "crop-toward-evidence",
    "vertical-pan",
    "medium-crop",
    "recording-timestamp",
    "smart-crop",
  ],
  escalation: [
    "face-close-up",
    "handheld-micro-drift",
    "smart-crop",
    "rule-of-thirds-reposition",
    "vignette-drift",
  ],
  climax: [
    "face-close-up",
    "object-detail-crop",
    "crop-toward-evidence",
    "smart-crop",
    "vignette-drift",
  ],
  callback: [
    "slow-push-in",
    "establishing-wide-crop",
    "smart-crop",
    "vignette-drift",
    "rule-of-thirds-reposition",
  ],
  aftermath: [
    "establishing-wide-crop",
    "medium-crop",
    "slow-pull-out",
    "smart-crop",
  ],
};

export class DeterministicShotPlanner implements ShotPlanner {
  public plan(input: PlanShotsInput): ShotPlan {
    return this.planWithDiagnostics(input).plan;
  }

  public planWithDiagnostics(input: PlanShotsInput): ShotPlanningResult {
    validatePlannerInput(input);

    const sourceScenes = normalizeSourceScenes(input.sourceScenes);
    const budget = normalizeBudget(input.visualBudget);
    const limitations: ShotPlanningLimitation[] = [];
    const allocations = allocateShots({
      platform: input.platform,
      aspectRatio: input.aspectRatio,
      sourceScenes,
      pacingProfile: input.pacingProfile,
      visualBudget: budget,
      seed: input.seed,
      limitations,
    });
    const drafts = buildShotDrafts({
      allocations,
      platform: input.platform,
      pacingProfile: input.pacingProfile,
      visualBudget: budget,
      seed: input.seed,
    });
    const shots = selectRenderShots({
      drafts,
      platform: input.platform,
      aspectRatio: input.aspectRatio,
      treatmentCatalogVersion: input.treatmentCatalogVersion,
      visualBudget: budget,
      restrictions: input.restrictions,
      seed: input.seed,
    });
    const planInput = {
      schemaVersion: 1 as const,
      sourceId: input.sourceId,
      ...(input.locale ? { locale: input.locale } : {}),
      variant: input.platform,
      aspectRatio: input.aspectRatio,
      sourceScenes,
      shots,
      pacingProfile: {
        mode: "inline" as const,
        profile: normalizePacingProfile(input.pacingProfile),
      },
      visualBudget: budget,
      planningSeed: hashText(`${plannerVersion}\u0000${input.seed}`),
    };

    return {
      plan: shotPlanSchema.parse(planInput),
      limitations,
    };
  }
}

export const deterministicShotPlanner = new DeterministicShotPlanner();

export function planShots(input: PlanShotsInput): ShotPlan {
  return deterministicShotPlanner.plan(input);
}

export function serializeShotPlan(plan: ShotPlan): string {
  return JSON.stringify(toStableJson(plan));
}

function validatePlannerInput(input: PlanShotsInput): void {
  if (input.treatmentCatalogVersion !== shotTreatmentCatalogVersion) {
    throw new ShotPlanningError(
      "UNSUPPORTED_TREATMENT_CATALOG",
      `Unsupported treatment catalog version: ${input.treatmentCatalogVersion}`,
    );
  }
  if (input.sourceScenes.length === 0) {
    throw new ShotPlanningError(
      "EMPTY_SOURCE_SCENES",
      "Shot planning requires at least one source scene.",
    );
  }

  const sourceSceneIds = new Set<string>();
  const sceneIds = new Set<string>();
  let previousEndMs: number | undefined;

  for (const sourceScene of input.sourceScenes) {
    if (sourceSceneIds.has(sourceScene.sourceSceneId)) {
      throw new ShotPlanningError(
        "DUPLICATE_SOURCE_SCENE_ID",
        `Duplicate source scene id: ${sourceScene.sourceSceneId}`,
        sourceScene.sceneId,
      );
    }
    if (sceneIds.has(sourceScene.sceneId)) {
      throw new ShotPlanningError(
        "DUPLICATE_SCENE_ID",
        `Duplicate scene id: ${sourceScene.sceneId}`,
        sourceScene.sceneId,
      );
    }
    if (sourceScene.sourceImageId.length === 0) {
      throw new ShotPlanningError(
        "MISSING_SOURCE_IMAGE_ID",
        `Missing source image id for scene ${sourceScene.sceneId}.`,
        sourceScene.sceneId,
      );
    }
    if (sourceScene.narrationEndMs <= sourceScene.narrationStartMs) {
      throw new ShotPlanningError(
        "INVALID_SOURCE_SCENE_TIMING",
        `Invalid source scene timing for ${sourceScene.sceneId}.`,
        sourceScene.sceneId,
      );
    }
    if (
      previousEndMs !== undefined &&
      sourceScene.narrationStartMs < previousEndMs
    ) {
      throw new ShotPlanningError(
        "INVALID_SOURCE_SCENE_TIMING",
        `Source scene timing overlaps before ${sourceScene.sceneId}.`,
        sourceScene.sceneId,
      );
    }

    sourceSceneIds.add(sourceScene.sourceSceneId);
    sceneIds.add(sourceScene.sceneId);
    previousEndMs = sourceScene.narrationEndMs;
  }
}

function normalizeSourceScenes(
  sourceScenes: readonly VisualSourceScene[],
): VisualSourceScene[] {
  return sourceScenes.map((sourceScene) => ({
    sourceSceneId: sourceScene.sourceSceneId,
    sceneId: sourceScene.sceneId,
    narrationStartMs: sourceScene.narrationStartMs,
    narrationEndMs: sourceScene.narrationEndMs,
    sourceImageId: sourceScene.sourceImageId,
    sourceImagePath: sourceScene.sourceImagePath,
    sourceImageSha256: sourceScene.sourceImageSha256,
    importance: sourceScene.importance,
    focalRegions: [...sourceScene.focalRegions].sort(compareFocalRegions),
  }));
}

function normalizePacingProfile(profile: VisualPacingProfile): VisualPacingProfile {
  return {
    id: profile.id,
    shotDurationMs: { ...profile.shotDurationMs },
    staticShotDurationMs: { ...profile.staticShotDurationMs },
    movingShotDurationMs: { ...profile.movingShotDurationMs },
    openingCadenceMs: { ...profile.openingCadenceMs },
    climaxCadenceMs: { ...profile.climaxCadenceMs },
  };
}

function normalizeBudget(budget: VisualBudget): VisualBudget {
  return {
    sourceImageCount: { ...budget.sourceImageCount },
    shotCount: { ...budget.shotCount },
    ...(budget.shotsPerImage
      ? { shotsPerImage: { ...budget.shotsPerImage } }
      : {}),
    maxConsecutiveSourceImageUses: budget.maxConsecutiveSourceImageUses,
    maxTotalSourceImageUses: budget.maxTotalSourceImageUses,
    cropLimits: { ...budget.cropLimits },
    motionLimits: {
      minShotDurationMs: budget.motionLimits.minShotDurationMs,
      pushInScaleRange: { ...budget.motionLimits.pushInScaleRange },
      fastPushInScaleRange: { ...budget.motionLimits.fastPushInScaleRange },
      panTravelFractionOfImage: {
        ...budget.motionLimits.panTravelFractionOfImage,
      },
      rotationDegreesRange: { ...budget.motionLimits.rotationDegreesRange },
      dissolveDurationMs: { ...budget.motionLimits.dissolveDurationMs },
      dipToBlackDurationMs: { ...budget.motionLimits.dipToBlackDurationMs },
    },
    effectCaps: [...budget.effectCaps].sort((left, right) =>
      `${left.effect}:${left.scope}:${left.maxCount ?? ""}:${left.maxShare ?? ""}`.localeCompare(
        `${right.effect}:${right.scope}:${right.maxCount ?? ""}:${right.maxShare ?? ""}`,
      ),
    ),
  };
}

function allocateShots(args: {
  readonly platform: VisualPlatform;
  readonly aspectRatio: AspectRatio;
  readonly sourceScenes: readonly VisualSourceScene[];
  readonly pacingProfile: VisualPacingProfile;
  readonly visualBudget: VisualBudget;
  readonly seed: string;
  readonly limitations: ShotPlanningLimitation[];
}): SceneAllocation[] {
  const initial = args.sourceScenes.map((sourceScene) =>
    allocateSceneShots({
      ...args,
      sourceScene,
    }),
  );
  const reduced = reduceToBudgetMax(initial, args);
  const expanded = expandTowardBudgetMin(reduced, args);
  ensureOpeningCadence(expanded, args);
  recordReuseLimitations(expanded, args.visualBudget, args.limitations);
  return expanded;
}

function allocateSceneShots(args: {
  readonly platform: VisualPlatform;
  readonly aspectRatio: AspectRatio;
  readonly sourceScene: VisualSourceScene;
  readonly pacingProfile: VisualPacingProfile;
  readonly visualBudget: VisualBudget;
  readonly seed: string;
}): SceneAllocation {
  const durationMs =
    args.sourceScene.narrationEndMs - args.sourceScene.narrationStartMs;
  const minShotDurationMs = minimumShotDuration(args);
  const maximumByMinimum = Math.max(
    1,
    Math.floor(durationMs / minShotDurationMs),
  );
  const maximumPerImage = args.visualBudget.shotsPerImage?.max ?? 4;
  const treatmentMaxMs = maxSupportedTreatmentDuration(
    args.sourceScene.importance,
    args.aspectRatio,
    args.sourceScene.focalRegions,
    args.visualBudget,
  );
  const maxDurationMs = Math.min(
    args.pacingProfile.movingShotDurationMs.maxMs,
    treatmentMaxMs,
  );
  const minimumShotCount = Math.min(
    maximumByMinimum,
    Math.max(1, Math.ceil(durationMs / maxDurationMs)),
  );
  const preferredShotCount = Math.max(
    minimumShotCount,
    Math.round(durationMs / targetShotDurationMs(args.platform, args.pacingProfile, args.sourceScene.importance)),
  );
  const openingBoost =
    args.platform === "short" &&
    args.sourceScene.narrationStartMs < openingWindowMs
      ? 1
      : 0;
  const hookMinimum =
    args.sourceScene.importance === "hook" &&
    durationMs >= minShotDurationMs * 2
      ? 2
      : 1;
  const shotCount = clampInteger(
    Math.max(preferredShotCount + openingBoost, hookMinimum),
    1,
    Math.min(maximumByMinimum, Math.max(maximumPerImage, minimumShotCount)),
  );

  return {
    sourceScene: args.sourceScene,
    shotCount,
    minimumShotCount,
    maximumShotCount: Math.min(maximumByMinimum, Math.max(maximumPerImage, minimumShotCount)),
    priority: phasePriority[args.sourceScene.importance],
  };
}

function reduceToBudgetMax(
  allocations: readonly SceneAllocation[],
  args: {
    readonly visualBudget: VisualBudget;
    readonly seed: string;
    readonly limitations: ShotPlanningLimitation[];
  },
): SceneAllocation[] {
  const result = allocations.map((allocation) => ({ ...allocation }));
  while (sumShotCounts(result) > args.visualBudget.shotCount.max) {
    const index = chooseReducibleAllocationIndex(result, args.seed);
    if (index === -1) {
      args.limitations.push({
        code: "SHOT_BUDGET_TENSION",
        message:
          "Required shot count exceeds the configured shot-count maximum.",
        details: {
          requiredShots: sumShotCounts(result),
          maxShots: args.visualBudget.shotCount.max,
        },
      });
      break;
    }
    const current = result[index];
    if (!current) {
      break;
    }
    result[index] = { ...current, shotCount: current.shotCount - 1 };
  }
  return result;
}

function expandTowardBudgetMin(
  allocations: readonly SceneAllocation[],
  args: {
    readonly visualBudget: VisualBudget;
    readonly seed: string;
    readonly limitations: ShotPlanningLimitation[];
  },
): SceneAllocation[] {
  const result = allocations.map((allocation) => ({ ...allocation }));
  while (
    sumShotCounts(result) < args.visualBudget.shotCount.min &&
    sumShotCounts(result) < args.visualBudget.shotCount.max
  ) {
    const index = chooseExpandableAllocationIndex(result, args.seed);
    if (index === -1) {
      args.limitations.push({
        code: "SHOT_BUDGET_TENSION",
        message:
          "Available scene durations cannot reach the configured shot-count minimum without invalid fragments.",
        details: {
          plannedShots: sumShotCounts(result),
          minShots: args.visualBudget.shotCount.min,
        },
      });
      break;
    }
    const current = result[index];
    if (!current) {
      break;
    }
    result[index] = { ...current, shotCount: current.shotCount + 1 };
  }
  return result;
}

function ensureOpeningCadence(
  allocations: SceneAllocation[],
  args: {
    readonly platform: VisualPlatform;
    readonly sourceScenes: readonly VisualSourceScene[];
    readonly visualBudget: VisualBudget;
    readonly seed: string;
    readonly limitations: ShotPlanningLimitation[];
  },
): void {
  if (args.platform !== "short") {
    return;
  }
  const totalDurationMs =
    args.sourceScenes[args.sourceScenes.length - 1]?.narrationEndMs ?? 0;
  const openingDurationMs = Math.min(totalDurationMs, openingWindowMs);
  const mathematicallyPossibleChanges = Math.max(
    0,
    Math.floor(openingDurationMs / args.visualBudget.motionLimits.minShotDurationMs) - 1,
  );
  // Shorts shorter than eight seconds scale the three-change requirement
  // linearly, then cap it by the minimum-duration math.
  const requiredChanges = Math.min(
    mathematicallyPossibleChanges,
    totalDurationMs >= openingWindowMs
      ? 3
      : Math.floor((totalDurationMs / openingWindowMs) * 3),
  );
  if (requiredChanges <= 0) {
    return;
  }

  while (
    countProjectedOpeningChanges(allocations) < requiredChanges &&
    sumShotCounts(allocations) < args.visualBudget.shotCount.max
  ) {
    const index = chooseOpeningAllocationIndex(allocations, args.seed);
    if (index === -1) {
      break;
    }
    const current = allocations[index];
    if (!current) {
      break;
    }
    allocations[index] = { ...current, shotCount: current.shotCount + 1 };
  }

  if (countProjectedOpeningChanges(allocations) < requiredChanges) {
    args.limitations.push({
      code: "OPENING_CADENCE_LIMITED",
      message:
        "Opening cadence could not reach the preferred visual-change count within duration and budget limits.",
      details: {
        requiredChanges,
        plannedChanges: countProjectedOpeningChanges(allocations),
      },
    });
  }
}

function buildShotDrafts(args: {
  readonly allocations: readonly SceneAllocation[];
  readonly platform: VisualPlatform;
  readonly pacingProfile: VisualPacingProfile;
  readonly visualBudget: VisualBudget;
  readonly seed: string;
}): PlannedShotDraft[] {
  const drafts: PlannedShotDraft[] = [];
  for (const allocation of args.allocations) {
    const durations = allocateSceneDurations({
      allocation,
      platform: args.platform,
      pacingProfile: args.pacingProfile,
      visualBudget: args.visualBudget,
      seed: args.seed,
    });
    let cursorMs = allocation.sourceScene.narrationStartMs;
    for (const [index, durationMs] of durations.entries()) {
      const endMs =
        index === durations.length - 1
          ? allocation.sourceScene.narrationEndMs
          : cursorMs + durationMs;
      drafts.push({
        sourceScene: allocation.sourceScene,
        ordinalInScene: index + 1,
        startMs: cursorMs,
        endMs,
      });
      cursorMs = endMs;
    }
  }
  return drafts;
}

function allocateSceneDurations(args: {
  readonly allocation: SceneAllocation;
  readonly platform: VisualPlatform;
  readonly pacingProfile: VisualPacingProfile;
  readonly visualBudget: VisualBudget;
  readonly seed: string;
}): number[] {
  const durationMs =
    args.allocation.sourceScene.narrationEndMs -
    args.allocation.sourceScene.narrationStartMs;
  const count = args.allocation.shotCount;
  if (count === 1) {
    return [durationMs];
  }

  const minShotDurationMs = minimumShotDuration({
    platform: args.platform,
    pacingProfile: args.pacingProfile,
    visualBudget: args.visualBudget,
  });
  const durations = new Array<number>(count).fill(0);
  let remainingMs = durationMs;
  let remainingCount = count;
  const forceFastHookChange =
    args.platform === "short" &&
    args.allocation.sourceScene.importance === "hook" &&
    durationMs >= minShotDurationMs * 2;

  if (forceFastHookChange) {
    const firstDurationMs = clampInteger(
      Math.min(2_000, durationMs - (count - 1) * minShotDurationMs),
      minShotDurationMs,
      Math.max(minShotDurationMs, durationMs - (count - 1) * minShotDurationMs),
    );
    durations[0] = firstDurationMs;
    remainingMs -= firstDurationMs;
    remainingCount -= 1;
  }

  const startIndex = count - remainingCount;
  const baseDurationMs = Math.floor(remainingMs / remainingCount);
  for (let index = startIndex; index < count; index += 1) {
    durations[index] = baseDurationMs;
  }
  const remainderMs = remainingMs - baseDurationMs * remainingCount;
  const remainderIndexes = [...Array(remainingCount).keys()]
    .map((offset) => startIndex + offset)
    .sort((left, right) =>
      compareHash(
        `${args.seed}:${args.allocation.sourceScene.sceneId}:duration:${left}`,
        `${args.seed}:${args.allocation.sourceScene.sceneId}:duration:${right}`,
      ),
    );
  for (let index = 0; index < remainderMs; index += 1) {
    const durationIndex = remainderIndexes[index % remainderIndexes.length];
    if (durationIndex !== undefined) {
      durations[durationIndex] = (durations[durationIndex] ?? 0) + 1;
    }
  }
  return durations;
}

function selectRenderShots(args: {
  readonly drafts: readonly PlannedShotDraft[];
  readonly platform: VisualPlatform;
  readonly aspectRatio: AspectRatio;
  readonly treatmentCatalogVersion: string;
  readonly visualBudget: VisualBudget;
  readonly restrictions: ShotPlanningRestrictions | undefined;
  readonly seed: string;
}): RenderShot[] {
  let state: PlanningState = {
    selectedTreatmentIds: [],
    previousShot: undefined,
    previousSameImageCrop: undefined,
    recentPanDirections: [],
  };
  const shots: RenderShot[] = [];
  const sceneShotCounts = new Map<string, number>();

  for (const draft of args.drafts) {
    const count = (sceneShotCounts.get(draft.sourceScene.sceneId) ?? 0) + 1;
    sceneShotCounts.set(draft.sourceScene.sceneId, count);
    const shot = buildRenderShot({
      ...args,
      draft,
      ordinalInScene: count,
      state,
    });
    shots.push(shot);
    state = {
      selectedTreatmentIds: [...state.selectedTreatmentIds, shot.treatment.treatmentId],
      previousShot: shot,
      previousSameImageCrop:
        state.previousShot?.sourceImageId === shot.sourceImageId
          ? shot.crop
          : undefined,
      recentPanDirections: updateRecentPanDirections(
        state.recentPanDirections,
        inferPanDirection(shot.motion),
      ),
    };
  }
  return shots;
}

function buildRenderShot(args: {
  readonly draft: PlannedShotDraft;
  readonly ordinalInScene: number;
  readonly platform: VisualPlatform;
  readonly aspectRatio: AspectRatio;
  readonly treatmentCatalogVersion: string;
  readonly visualBudget: VisualBudget;
  readonly restrictions: ShotPlanningRestrictions | undefined;
  readonly seed: string;
  readonly state: PlanningState;
}): RenderShot {
  const durationMs = args.draft.endMs - args.draft.startMs;
  const treatmentEntry = selectTreatment({
    ...args,
    durationMs,
  });
  const focalRegion = selectFocalRegion(
    args.draft.sourceScene.focalRegions,
    treatmentEntry.id,
    args.draft.sourceScene.importance,
    `${args.seed}:${args.draft.sourceScene.sceneId}:${args.ordinalInScene}`,
  );
  const previousSameImageCrop =
    args.state.previousShot?.sourceImageId === args.draft.sourceScene.sourceImageId
      ? args.state.previousShot.crop
      : undefined;
  const crop = selectCrop({
    aspectRatio: args.aspectRatio,
    treatmentId: treatmentEntry.id,
    sourceScene: args.draft.sourceScene,
    focalRegion,
    previousSameImageCrop,
    visualBudget: args.visualBudget,
    seed: `${args.seed}:${args.draft.sourceScene.sceneId}:${args.ordinalInScene}:crop`,
  });
  const motion = selectMotion({
    treatmentId: treatmentEntry.id,
    sourceScene: args.draft.sourceScene,
    crop,
    durationMs,
    visualBudget: args.visualBudget,
    recentPanDirections: args.state.recentPanDirections,
    seed: `${args.seed}:${args.draft.sourceScene.sceneId}:${args.ordinalInScene}:motion`,
  });
  const transition = selectTransition(args.platform);
  const shotId = shotIdSchema.parse(
    `${args.draft.sourceScene.sceneId}-shot-${String(args.ordinalInScene).padStart(3, "0")}`,
  );

  return {
    shotId,
    sourceSceneId: args.draft.sourceScene.sourceSceneId,
    sceneId: args.draft.sourceScene.sceneId,
    sourceImageId: args.draft.sourceScene.sourceImageId,
    startMs: args.draft.startMs,
    endMs: args.draft.endMs,
    treatment: buildShotTreatment(treatmentEntry, args.treatmentCatalogVersion),
    crop,
    motion,
    overlays: [],
    transition,
  };
}

function selectTreatment(args: {
  readonly draft: PlannedShotDraft;
  readonly ordinalInScene: number;
  readonly aspectRatio: AspectRatio;
  readonly durationMs: number;
  readonly visualBudget: VisualBudget;
  readonly restrictions: ShotPlanningRestrictions | undefined;
  readonly seed: string;
  readonly state: PlanningState;
}): ReadonlyTreatmentCatalogEntry {
  const compatible = compatibleTreatments({
    aspectRatio: args.aspectRatio,
    phase: args.draft.sourceScene.importance,
    durationMs: args.durationMs,
    focalRegions: args.draft.sourceScene.focalRegions,
    restrictions: args.restrictions,
    selectedTreatmentIds: args.state.selectedTreatmentIds,
    visualBudget: args.visualBudget,
  });
  if (compatible.length === 0) {
    throw new ShotPlanningError(
      "NO_COMPATIBLE_TREATMENT",
      `No compatible shot treatment for ${args.draft.sourceScene.sceneId}.`,
      args.draft.sourceScene.sceneId,
    );
  }

  const previousTreatmentId = args.state.previousShot?.treatment.treatmentId;
  return [...compatible].sort((left, right) => {
    const leftScore = scoreTreatment(left, args, previousTreatmentId);
    const rightScore = scoreTreatment(right, args, previousTreatmentId);
    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }
    return compareHash(
      `${args.seed}:${args.draft.sourceScene.sceneId}:${args.ordinalInScene}:${left.id}`,
      `${args.seed}:${args.draft.sourceScene.sceneId}:${args.ordinalInScene}:${right.id}`,
    );
  })[0] as ReadonlyTreatmentCatalogEntry;
}

function compatibleTreatments(args: {
  readonly aspectRatio: AspectRatio;
  readonly phase: VisualNarrativePhase;
  readonly durationMs: number;
  readonly focalRegions: readonly FocalRegion[];
  readonly restrictions: ShotPlanningRestrictions | undefined;
  readonly selectedTreatmentIds: readonly string[];
  readonly visualBudget: VisualBudget;
}): ReadonlyTreatmentCatalogEntry[] {
  const disabled = new Set(args.restrictions?.disabledTreatmentIds ?? []);
  const enabled = args.restrictions?.enabledTreatmentIds
    ? new Set(args.restrictions.enabledTreatmentIds)
    : undefined;
  const allowNonDefault = args.restrictions?.allowNonDefaultTreatments ?? false;
  const allowCacheRequired =
    args.restrictions?.allowCacheRequiredTreatments ?? false;
  const allowBlurredFillFallback =
    args.restrictions?.allowBlurredFillFallback ?? true;

  const defaults = shotTreatmentCatalog.filter((entry) =>
    isCompatibleTreatment(entry, {
      ...args,
      disabled,
      enabled,
      allowNonDefault,
      allowCacheRequired,
      allowBlurredFillFallback: false,
    }),
  );
  if (defaults.length > 0) {
    return defaults;
  }
  if (!allowBlurredFillFallback || disabled.has("blurred-fill")) {
    return [];
  }
  return shotTreatmentCatalog.filter((entry) =>
    isCompatibleTreatment(entry, {
      ...args,
      disabled,
      enabled,
      allowNonDefault: true,
      allowCacheRequired,
      allowBlurredFillFallback,
    }),
  );
}

function isCompatibleTreatment(
  entry: ReadonlyTreatmentCatalogEntry,
  args: {
    readonly aspectRatio: AspectRatio;
    readonly phase: VisualNarrativePhase;
    readonly durationMs: number;
    readonly focalRegions: readonly FocalRegion[];
    readonly selectedTreatmentIds: readonly string[];
    readonly visualBudget: VisualBudget;
    readonly disabled: ReadonlySet<string>;
    readonly enabled: ReadonlySet<string> | undefined;
    readonly allowNonDefault: boolean;
    readonly allowCacheRequired: boolean;
    readonly allowBlurredFillFallback: boolean;
  },
): boolean {
  if (args.disabled.has(entry.id)) {
    return false;
  }
  if (args.enabled !== undefined && !args.enabled.has(entry.id)) {
    return false;
  }
  if (entry.status !== "supported") {
    return false;
  }
  if (!entry.inlineRenderable) {
    return false;
  }
  if (entry.derivedClipCacheRequired && !args.allowCacheRequired) {
    return false;
  }
  if (!entry.availableByDefault && !args.allowNonDefault) {
    return false;
  }
  if (entry.id === "blurred-fill" && !args.allowBlurredFillFallback) {
    return false;
  }
  if (!entry.aspectRatios.includes(args.aspectRatio)) {
    return false;
  }
  if (!entry.phases.includes(args.phase)) {
    return false;
  }
  const unavoidableSubMinimum =
    args.durationMs < args.visualBudget.motionLimits.minShotDurationMs;
  if (!unavoidableSubMinimum && args.durationMs < entry.durationMs.minMs) {
    return false;
  }
  if (args.durationMs > entry.durationMs.maxMs) {
    return false;
  }
  if (!hasRequiredFocalMetadata(entry.id, args.focalRegions)) {
    return false;
  }
  if (
    !areTreatmentsCompatible([...args.selectedTreatmentIds.slice(-1), entry.id])
  ) {
    return false;
  }
  if (wouldExceedEffectCap(entry.id, args.selectedTreatmentIds, args.visualBudget)) {
    return false;
  }
  return true;
}

function scoreTreatment(
  entry: ReadonlyTreatmentCatalogEntry,
  args: {
    readonly draft: PlannedShotDraft;
    readonly ordinalInScene: number;
    readonly aspectRatio: AspectRatio;
  },
  previousTreatmentId: string | undefined,
): number {
  const preferences = treatmentPreferenceByPhase[args.draft.sourceScene.importance];
  const preferenceIndex = preferences.indexOf(entry.id);
  const preferenceScore =
    preferenceIndex === -1 ? 0 : (preferences.length - preferenceIndex) * 10;
  const focalScore =
    entry.id === "face-close-up" && hasFaceRegion(args.draft.sourceScene.focalRegions)
      ? 80
      : isEvidenceTreatment(entry.id) &&
          hasEvidenceRegion(args.draft.sourceScene.focalRegions)
        ? 70
        : entry.focalMetadataRequirement === "required"
          ? 20
          : 10;
  const verticalScore =
    args.aspectRatio === "9:16" && entry.id === "vertical-smart-crop" ? 25 : 0;
  const repeatPenalty = previousTreatmentId === entry.id ? -80 : 0;
  const fallbackPenalty = entry.id === "blurred-fill" ? -150 : 0;
  return preferenceScore + focalScore + verticalScore + repeatPenalty + fallbackPenalty;
}

function buildShotTreatment(
  entry: ReadonlyTreatmentCatalogEntry,
  catalogVersion: string,
): ShotTreatment {
  const framingVariant = toFramingVariant(entry.id);
  if (framingVariant) {
    return {
      family: "framing",
      catalogVersion,
      treatmentId: entry.id,
      variant: framingVariant,
    };
  }
  if (entry.id === "crop-toward-evidence") {
    return {
      family: "framing",
      catalogVersion,
      treatmentId: entry.id,
      variant: "object-detail-crop",
    };
  }
  if (entry.id === "blurred-fill") {
    return {
      family: "adaptation",
      catalogVersion,
      treatmentId: entry.id,
      variant: "blurred-fill",
      fallbackBehavior: "blurred-fill",
    };
  }
  if (entry.id === "pan-and-scan") {
    return {
      family: "adaptation",
      catalogVersion,
      treatmentId: entry.id,
      variant: "pan-and-scan",
    };
  }
  if (entry.category === "depth-and-motion") {
    return {
      family: "depth",
      catalogVersion,
      treatmentId: entry.id,
      variant: "background-drift",
      cacheRequired: entry.derivedClipCacheRequired,
    };
  }
  return {
    family: "adaptation",
    catalogVersion,
    treatmentId: entry.id,
    variant: "smart-crop",
    fallbackBehavior: "widen-crop",
  };
}

function toFramingVariant(
  treatmentId: string,
):
  | "establishing-wide-crop"
  | "medium-crop"
  | "face-close-up"
  | "object-detail-crop"
  | "caption-safe-negative-space-crop"
  | undefined {
  if (
    treatmentId === "establishing-wide-crop" ||
    treatmentId === "medium-crop" ||
    treatmentId === "face-close-up" ||
    treatmentId === "object-detail-crop" ||
    treatmentId === "caption-safe-negative-space-crop"
  ) {
    return treatmentId;
  }
  return undefined;
}

function selectFocalRegion(
  regions: readonly FocalRegion[],
  treatmentId: string,
  phase: VisualNarrativePhase,
  seed: string,
): FocalRegion | undefined {
  const allowedKinds = allowedFocalKinds(treatmentId, phase);
  const candidates = regions.filter((region) => allowedKinds.includes(region.kind));
  if (candidates.length === 0) {
    return undefined;
  }
  return [...candidates].sort((left, right) => {
    const priorityDelta =
      focalRegionPriority(right, treatmentId, phase) -
      focalRegionPriority(left, treatmentId, phase);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    const confidenceDelta =
      (right.confidence ?? 0.5) - (left.confidence ?? 0.5);
    if (confidenceDelta !== 0) {
      return confidenceDelta;
    }
    const hashDelta = compareHash(
      `${seed}:${left.id}`,
      `${seed}:${right.id}`,
    );
    if (hashDelta !== 0) {
      return hashDelta;
    }
    return left.id.localeCompare(right.id);
  })[0];
}

function selectCrop(args: {
  readonly aspectRatio: AspectRatio;
  readonly treatmentId: string;
  readonly sourceScene: VisualSourceScene;
  readonly focalRegion: FocalRegion | undefined;
  readonly previousSameImageCrop: NormalizedCrop | undefined;
  readonly visualBudget: VisualBudget;
  readonly seed: string;
}): NormalizedCrop {
  const candidates = cropCandidates(args);
  const cap = args.visualBudget.cropLimits.maxAdjacentSameImageCropIou;
  if (!args.previousSameImageCrop) {
    return candidates[0] ?? centerCrop(args.aspectRatio, args.visualBudget.cropLimits.minCropArea);
  }
  const previousSameImageCrop = args.previousSameImageCrop;
  const nonRepeating = candidates.find(
    (candidate) => cropIou(candidate, previousSameImageCrop) < cap,
  );
  if (nonRepeating) {
    return nonRepeating;
  }
  return [...candidates].sort(
    (left, right) =>
      cropIou(left, previousSameImageCrop) -
      cropIou(right, previousSameImageCrop),
  )[0] ?? centerCrop(args.aspectRatio, args.visualBudget.cropLimits.minCropArea);
}

function cropCandidates(args: {
  readonly aspectRatio: AspectRatio;
  readonly treatmentId: string;
  readonly sourceScene: VisualSourceScene;
  readonly focalRegion: FocalRegion | undefined;
  readonly visualBudget: VisualBudget;
  readonly seed: string;
}): NormalizedCrop[] {
  const minArea = Math.max(
    args.visualBudget.cropLimits.minCropArea,
    1 / args.visualBudget.cropLimits.maxCropZoom ** 2,
  );
  const baseArea = treatmentCropArea(args.treatmentId, args.sourceScene.importance, minArea);
  const anchors = args.focalRegion
    ? [regionCenter(args.focalRegion)]
    : deterministicAnchors(args.aspectRatio, args.seed);
  const candidates: NormalizedCrop[] = [];
  for (const anchor of anchors) {
    candidates.push(
      normalizeCropAroundPoint({
        aspectRatio: args.aspectRatio,
        anchor,
        minArea,
        desiredArea: baseArea,
        includeRegion: args.focalRegion,
        faceMargin:
          args.treatmentId === "face-close-up"
            ? args.visualBudget.cropLimits.minFaceMargin
            : 0.04,
      }),
    );
    candidates.push(
      normalizeCropAroundPoint({
        aspectRatio: args.aspectRatio,
        anchor,
        minArea,
        desiredArea: Math.min(1, baseArea + 0.12),
        includeRegion: args.focalRegion,
        faceMargin: 0.04,
      }),
    );
  }
  return uniqueCrops(candidates);
}

function selectMotion(args: {
  readonly treatmentId: string;
  readonly sourceScene: VisualSourceScene;
  readonly crop: NormalizedCrop;
  readonly durationMs: number;
  readonly visualBudget: VisualBudget;
  readonly recentPanDirections: readonly PanDirection[];
  readonly seed: string;
}): CameraMotion {
  const fallbackOnly = isFallbackOnly(args.sourceScene.focalRegions);
  if (args.treatmentId === "face-close-up") {
    return { kind: "none" };
  }
  if (args.treatmentId === "slow-pull-out") {
    return {
      kind: "pull-out",
      startScale: roundFloat(args.visualBudget.motionLimits.pushInScaleRange.min),
      endScale: 1,
      anchor: cropCenter(args.crop),
    };
  }
  if (
    args.treatmentId === "slow-push-in" ||
    args.sourceScene.importance === "callback"
  ) {
    return {
      kind: "push-in",
      startScale: 1,
      endScale: roundFloat(args.visualBudget.motionLimits.pushInScaleRange.min),
      anchor: cropCenter(args.crop),
    };
  }
  if (
    !fallbackOnly &&
    (args.treatmentId === "pan-and-scan" ||
      args.treatmentId === "lateral-pan" ||
      args.treatmentId === "vertical-pan")
  ) {
    return panMotion(args);
  }
  if (
    !fallbackOnly &&
    (args.sourceScene.importance === "climax" ||
      args.sourceScene.importance === "escalation")
  ) {
    const direction = choosePanDirection(args.recentPanDirections, args.seed);
    return panAndZoomMotion(args, direction);
  }
  if (args.durationMs > args.visualBudget.motionLimits.minShotDurationMs) {
    return {
      kind: "drift",
      deltaX: roundFloat(stableSignedFraction(`${args.seed}:drift-x`, 0.015)),
      deltaY: roundFloat(stableSignedFraction(`${args.seed}:drift-y`, 0.015)),
      rotationDegrees: roundFloat(
        clampNumber(
          stableSignedFraction(`${args.seed}:rotation`, 0.25),
          args.visualBudget.motionLimits.rotationDegreesRange.min,
          args.visualBudget.motionLimits.rotationDegreesRange.max,
        ),
      ),
    };
  }
  return { kind: "none" };
}

function panMotion(args: {
  readonly treatmentId: string;
  readonly crop: NormalizedCrop;
  readonly visualBudget: VisualBudget;
  readonly recentPanDirections: readonly PanDirection[];
  readonly seed: string;
}): CameraMotion {
  const forcedDirection =
    args.treatmentId === "lateral-pan"
      ? chooseFrom(["left", "right"] as const, args.seed)
      : args.treatmentId === "vertical-pan"
        ? chooseFrom(["up", "down"] as const, args.seed)
        : choosePanDirection(args.recentPanDirections, args.seed);
  const [startCenter, endCenter] = panCenters(
    args.crop,
    forcedDirection,
    args.visualBudget.motionLimits.panTravelFractionOfImage.min,
  );
  return {
    kind: "pan",
    startCenter,
    endCenter,
  };
}

function panAndZoomMotion(
  args: {
    readonly crop: NormalizedCrop;
    readonly visualBudget: VisualBudget;
  },
  direction: PanDirection,
): CameraMotion {
  const [startCenter, endCenter] = panCenters(
    args.crop,
    direction,
    args.visualBudget.motionLimits.panTravelFractionOfImage.min,
  );
  return {
    kind: "pan-and-zoom",
    startCenter,
    endCenter,
    startScale: 1,
    endScale: roundFloat(args.visualBudget.motionLimits.pushInScaleRange.min),
  };
}

function selectTransition(platform: VisualPlatform): ShotTransition {
  void platform;
  return { kind: "hard-cut", durationMs: 0 };
}

function maxSupportedTreatmentDuration(
  phase: VisualNarrativePhase,
  aspectRatio: AspectRatio,
  regions: readonly FocalRegion[],
  budget: VisualBudget,
): number {
  const maxDuration = shotTreatmentCatalog
    .filter((entry) =>
      isCompatibleTreatment(entry, {
        aspectRatio,
        phase,
        durationMs: entry.durationMs.maxMs,
        focalRegions: regions,
        selectedTreatmentIds: [],
        visualBudget: budget,
        disabled: new Set(),
        enabled: undefined,
        allowNonDefault: false,
        allowCacheRequired: false,
        allowBlurredFillFallback: false,
      }),
    )
    .map((entry) => entry.durationMs.maxMs)
    .sort((left, right) => right - left)[0];
  return maxDuration ?? 6_000;
}

function targetShotDurationMs(
  platform: VisualPlatform,
  profile: VisualPacingProfile,
  phase: VisualNarrativePhase,
): number {
  if (phase === "hook") {
    return midpoint(profile.openingCadenceMs.minMs, profile.openingCadenceMs.maxMs);
  }
  if (phase === "climax") {
    return midpoint(profile.climaxCadenceMs.minMs, profile.climaxCadenceMs.maxMs);
  }
  if (platform === "short") {
    if (phase === "evidence") {
      return 3_000;
    }
    if (phase === "escalation") {
      return 2_500;
    }
    if (phase === "callback") {
      return 3_000;
    }
    return 4_000;
  }
  if (profile.id === "atmospheric") {
    return phase === "callback" ? 7_000 : 8_000;
  }
  if (phase === "evidence") {
    return 4_500;
  }
  if (phase === "escalation") {
    return 3_500;
  }
  if (phase === "callback") {
    return 5_000;
  }
  return 6_000;
}

function minimumShotDuration(args: {
  readonly platform: VisualPlatform;
  readonly pacingProfile: VisualPacingProfile;
  readonly visualBudget: VisualBudget;
}): number {
  void args.platform;
  return Math.max(
    args.visualBudget.motionLimits.minShotDurationMs,
    args.pacingProfile.shotDurationMs.minMs,
  );
}

function chooseReducibleAllocationIndex(
  allocations: readonly SceneAllocation[],
  seed: string,
): number {
  return allocations
    .map((allocation, index) => ({ allocation, index }))
    .filter(({ allocation }) => allocation.shotCount > allocation.minimumShotCount)
    .sort((left, right) => {
      if (left.allocation.priority !== right.allocation.priority) {
        return left.allocation.priority - right.allocation.priority;
      }
      return compareHash(
        `${seed}:reduce:${left.allocation.sourceScene.sceneId}`,
        `${seed}:reduce:${right.allocation.sourceScene.sceneId}`,
      );
    })[0]?.index ?? -1;
}

function chooseExpandableAllocationIndex(
  allocations: readonly SceneAllocation[],
  seed: string,
): number {
  return allocations
    .map((allocation, index) => ({ allocation, index }))
    .filter(({ allocation }) => allocation.shotCount < allocation.maximumShotCount)
    .sort((left, right) => {
      if (left.allocation.priority !== right.allocation.priority) {
        return right.allocation.priority - left.allocation.priority;
      }
      return compareHash(
        `${seed}:expand:${left.allocation.sourceScene.sceneId}`,
        `${seed}:expand:${right.allocation.sourceScene.sceneId}`,
      );
    })[0]?.index ?? -1;
}

function chooseOpeningAllocationIndex(
  allocations: readonly SceneAllocation[],
  seed: string,
): number {
  return allocations
    .map((allocation, index) => ({ allocation, index }))
    .filter(
      ({ allocation }) =>
        allocation.sourceScene.narrationStartMs < openingWindowMs &&
        allocation.shotCount < allocation.maximumShotCount,
    )
    .sort((left, right) => {
      if (left.allocation.priority !== right.allocation.priority) {
        return right.allocation.priority - left.allocation.priority;
      }
      return compareHash(
        `${seed}:opening:${left.allocation.sourceScene.sceneId}`,
        `${seed}:opening:${right.allocation.sourceScene.sceneId}`,
      );
    })[0]?.index ?? -1;
}

function countProjectedOpeningChanges(
  allocations: readonly SceneAllocation[],
): number {
  let changes = 0;
  let previousHadOpeningShot = false;
  for (const allocation of allocations) {
    if (allocation.sourceScene.narrationStartMs >= openingWindowMs) {
      break;
    }
    if (previousHadOpeningShot) {
      changes += 1;
    }
    changes += Math.max(0, allocation.shotCount - 1);
    previousHadOpeningShot = true;
  }
  return changes;
}

function recordReuseLimitations(
  allocations: readonly SceneAllocation[],
  budget: VisualBudget,
  limitations: ShotPlanningLimitation[],
): void {
  const usesByImage = new Map<string, number>();
  for (const allocation of allocations) {
    usesByImage.set(
      allocation.sourceScene.sourceImageId,
      (usesByImage.get(allocation.sourceScene.sourceImageId) ?? 0) +
        allocation.shotCount,
    );
  }
  for (const [sourceImageId, uses] of usesByImage) {
    if (uses > budget.maxTotalSourceImageUses) {
      limitations.push({
        code: "SOURCE_IMAGE_REUSE_LIMITED",
        message:
          "A source image exceeds the preferred total reuse limit because shot planning cannot create new source images.",
        details: {
          sourceImageId,
          uses,
          maxTotalSourceImageUses: budget.maxTotalSourceImageUses,
        },
      });
    }
  }
}

function hasRequiredFocalMetadata(
  treatmentId: string,
  regions: readonly FocalRegion[],
): boolean {
  if (treatmentId === "face-close-up") {
    return hasFaceRegion(regions);
  }
  if (isEvidenceTreatment(treatmentId)) {
    return hasEvidenceRegion(regions);
  }
  if (
    treatmentId === "vertical-smart-crop" ||
    treatmentId === "caption-safe-negative-space-crop" ||
    treatmentId === "subject-aware-repositioning"
  ) {
    return regions.some((region) =>
      [
        "primary-subject",
        "secondary-subject",
        "safe-crop-region",
        "caption-safe-negative-space",
        "face",
        "evidence-object",
      ].includes(region.kind),
    );
  }
  return true;
}

function hasFaceRegion(regions: readonly FocalRegion[]): boolean {
  return regions.some(
    (region) => region.kind === "face" && (region.confidence ?? 1) >= 0.6,
  );
}

function hasEvidenceRegion(regions: readonly FocalRegion[]): boolean {
  return regions.some(
    (region) =>
      region.kind === "evidence-object" && (region.confidence ?? 1) >= 0.55,
  );
}

function isEvidenceTreatment(treatmentId: string): boolean {
  return treatmentId === "object-detail-crop" || treatmentId === "crop-toward-evidence";
}

function allowedFocalKinds(
  treatmentId: string,
  phase: VisualNarrativePhase,
): readonly FocalRegion["kind"][] {
  if (treatmentId === "face-close-up") {
    return ["face"];
  }
  if (isEvidenceTreatment(treatmentId) || phase === "evidence") {
    return ["evidence-object", "primary-subject", "safe-crop-region"];
  }
  if (treatmentId === "caption-safe-negative-space-crop") {
    return ["caption-safe-negative-space", "safe-crop-region"];
  }
  return [
    "primary-subject",
    "face",
    "evidence-object",
    "secondary-subject",
    "safe-crop-region",
    "foreground",
  ];
}

function focalRegionPriority(
  region: FocalRegion,
  treatmentId: string,
  phase: VisualNarrativePhase,
): number {
  if (treatmentId === "face-close-up") {
    return region.kind === "face" ? 100 : 0;
  }
  if (isEvidenceTreatment(treatmentId) || phase === "evidence") {
    return region.kind === "evidence-object"
      ? 100
      : region.kind === "primary-subject"
        ? 40
        : 10;
  }
  if (region.kind === "primary-subject") {
    return 70;
  }
  if (region.kind === "face") {
    return 60;
  }
  if (region.kind === "safe-crop-region") {
    return 20;
  }
  return 10;
}

function treatmentCropArea(
  treatmentId: string,
  phase: VisualNarrativePhase,
  minArea: number,
): number {
  if (treatmentId === "establishing-wide-crop") {
    return Math.max(minArea, 0.78);
  }
  if (treatmentId === "face-close-up" || isEvidenceTreatment(treatmentId)) {
    return Math.max(minArea, 0.38);
  }
  if (phase === "climax" || phase === "hook") {
    return Math.max(minArea, 0.46);
  }
  if (phase === "callback") {
    return Math.max(minArea, 0.62);
  }
  return Math.max(minArea, 0.56);
}

function normalizeCropAroundPoint(args: {
  readonly aspectRatio: AspectRatio;
  readonly anchor: Readonly<{ x: number; y: number }>;
  readonly minArea: number;
  readonly desiredArea: number;
  readonly includeRegion: FocalRegion | undefined;
  readonly faceMargin: number;
}): NormalizedCrop {
  const ratio = args.aspectRatio === "16:9" ? 16 / 9 : 9 / 16;
  let area = clampNumber(Math.max(args.desiredArea, args.minArea), args.minArea, 1);
  let width = Math.sqrt(area * ratio);
  let height = area / width;
  if (width > 1) {
    width = 1;
    height = area;
  }
  if (height > 1) {
    height = 1;
    width = area;
  }
  if (args.includeRegion) {
    width = Math.max(width, args.includeRegion.bounds.width + args.faceMargin * 2);
    height = Math.max(height, args.includeRegion.bounds.height + args.faceMargin * 2);
    if (width > 1) {
      width = 1;
    }
    if (height > 1) {
      height = 1;
    }
    area = width * height;
    if (area < args.minArea) {
      const scale = Math.sqrt(args.minArea / area);
      width = Math.min(1, width * scale);
      height = Math.min(1, height * scale);
    }
  }
  const x = clampNumber(args.anchor.x - width / 2, 0, 1 - width);
  const y = clampNumber(args.anchor.y - height / 2, 0, 1 - height);
  return roundCrop({ x, y, width, height });
}

function centerCrop(aspectRatio: AspectRatio, minArea: number): NormalizedCrop {
  return normalizeCropAroundPoint({
    aspectRatio,
    anchor: { x: 0.5, y: 0.5 },
    minArea,
    desiredArea: Math.max(minArea, 0.56),
    includeRegion: undefined,
    faceMargin: 0,
  });
}

function deterministicAnchors(
  aspectRatio: AspectRatio,
  seed: string,
): ReadonlyArray<Readonly<{ x: number; y: number }>> {
  const anchors =
    aspectRatio === "9:16"
      ? [
          { x: 0.5, y: 0.5 },
          { x: 0.32, y: 0.5 },
          { x: 0.68, y: 0.5 },
          { x: 0.5, y: 0.42 },
          { x: 0.5, y: 0.58 },
        ]
      : [
          { x: 0.5, y: 0.5 },
          { x: 0.5, y: 0.32 },
          { x: 0.5, y: 0.68 },
          { x: 0.42, y: 0.5 },
          { x: 0.58, y: 0.5 },
        ];
  return [...anchors].sort((left, right) =>
    compareHash(
      `${seed}:${left.x}:${left.y}`,
      `${seed}:${right.x}:${right.y}`,
    ),
  );
}

function regionCenter(region: FocalRegion): Readonly<{ x: number; y: number }> {
  return {
    x: region.bounds.x + region.bounds.width / 2,
    y: region.bounds.y + region.bounds.height / 2,
  };
}

function cropCenter(crop: NormalizedCrop): Readonly<{ x: number; y: number }> {
  return {
    x: roundFloat(crop.x + crop.width / 2),
    y: roundFloat(crop.y + crop.height / 2),
  };
}

function panCenters(
  crop: NormalizedCrop,
  direction: PanDirection,
  requestedTravel: number,
): readonly [
  Readonly<{ x: number; y: number }>,
  Readonly<{ x: number; y: number }>,
] {
  const center = cropCenter(crop);
  const horizontalTravel = Math.min(
    requestedTravel,
    Math.max(0, center.x - crop.width / 2),
    Math.max(0, 1 - crop.width / 2 - center.x),
  );
  const verticalTravel = Math.min(
    requestedTravel,
    Math.max(0, center.y - crop.height / 2),
    Math.max(0, 1 - crop.height / 2 - center.y),
  );
  if (direction === "left" || direction === "right") {
    const delta = direction === "left" ? -horizontalTravel : horizontalTravel;
    return [
      { x: roundFloat(center.x - delta), y: center.y },
      { x: roundFloat(center.x + delta), y: center.y },
    ];
  }
  const delta = direction === "up" ? -verticalTravel : verticalTravel;
  return [
    { x: center.x, y: roundFloat(center.y - delta) },
    { x: center.x, y: roundFloat(center.y + delta) },
  ];
}

function choosePanDirection(
  recentPanDirections: readonly PanDirection[],
  seed: string,
): PanDirection {
  const directions: readonly PanDirection[] = ["left", "right", "up", "down"];
  const last = recentPanDirections.at(-1);
  const secondLast = recentPanDirections.at(-2);
  const available =
    last !== undefined && last === secondLast
      ? directions.filter((direction) => direction !== last)
      : directions;
  return chooseFrom(available, seed);
}

function updateRecentPanDirections(
  current: readonly PanDirection[],
  next: PanDirection | undefined,
): readonly PanDirection[] {
  if (!next) {
    return current.slice(-2);
  }
  return [...current.slice(-1), next];
}

function inferPanDirection(motion: CameraMotion | undefined): PanDirection | undefined {
  if (!motion || motion.kind === "none" || motion.kind === "push-in" || motion.kind === "pull-out" || motion.kind === "drift") {
    return undefined;
  }
  const deltaX = motion.endCenter.x - motion.startCenter.x;
  const deltaY = motion.endCenter.y - motion.startCenter.y;
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX >= 0 ? "right" : "left";
  }
  return deltaY >= 0 ? "down" : "up";
}

function wouldExceedEffectCap(
  treatmentId: string,
  selectedTreatmentIds: readonly string[],
  budget: VisualBudget,
): boolean {
  const effect = treatmentEffect(treatmentId);
  if (!effect) {
    return false;
  }
  const cap = budget.effectCaps.find((entry) => entry.effect === effect);
  if (!cap) {
    return false;
  }
  const currentCount = selectedTreatmentIds.filter(
    (id) => treatmentEffect(id) === effect,
  ).length;
  if (cap.maxCount !== undefined && currentCount + 1 > cap.maxCount) {
    return true;
  }
  if (cap.maxShare !== undefined) {
    const plannedShare = (currentCount + 1) / (selectedTreatmentIds.length + 1);
    return plannedShare > cap.maxShare;
  }
  return false;
}

function treatmentEffect(treatmentId: string): VisualBudget["effectCaps"][number]["effect"] | undefined {
  if (treatmentId === "blurred-fill") {
    return "blurred-fill";
  }
  if (["analogue-noise", "security-camera-overlay", "static-burst"].includes(treatmentId)) {
    return "surveillance-glitch-static-combined";
  }
  if (["fast-push-in", "pan-plus-zoom", "accelerated-climax-zoom"].includes(treatmentId)) {
    return "fast-zoom";
  }
  return undefined;
}

function isFallbackOnly(regions: readonly FocalRegion[]): boolean {
  return (
    regions.length === 0 ||
    regions.every((region) =>
      ["safe-crop-region", "caption-safe-negative-space"].includes(region.kind),
    )
  );
}

function compareFocalRegions(left: FocalRegion, right: FocalRegion): number {
  if (left.kind !== right.kind) {
    return left.kind.localeCompare(right.kind);
  }
  const confidenceDelta = (right.confidence ?? 0) - (left.confidence ?? 0);
  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }
  return left.id.localeCompare(right.id);
}

function cropIou(left: NormalizedCrop, right: NormalizedCrop): number {
  const x1 = Math.max(left.x, right.x);
  const y1 = Math.max(left.y, right.y);
  const x2 = Math.min(left.x + left.width, right.x + right.width);
  const y2 = Math.min(left.y + left.height, right.y + right.height);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = left.width * left.height + right.width * right.height - intersection;
  return union === 0 ? 0 : intersection / union;
}

function uniqueCrops(crops: readonly NormalizedCrop[]): NormalizedCrop[] {
  const seen = new Set<string>();
  const result: NormalizedCrop[] = [];
  for (const crop of crops) {
    const key = `${crop.x}:${crop.y}:${crop.width}:${crop.height}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(crop);
  }
  return result;
}

function roundCrop(crop: NormalizedCrop): NormalizedCrop {
  const width = roundFloat(clampNumber(crop.width, 0.000001, 1));
  const height = roundFloat(clampNumber(crop.height, 0.000001, 1));
  return {
    x: roundFloat(clampNumber(crop.x, 0, 1 - width)),
    y: roundFloat(clampNumber(crop.y, 0, 1 - height)),
    width,
    height,
  };
}

function sumShotCounts(allocations: readonly SceneAllocation[]): number {
  return allocations.reduce((sum, allocation) => sum + allocation.shotCount, 0);
}

function midpoint(min: number, max: number): number {
  return Math.round((min + max) / 2);
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundFloat(value: number): number {
  return Number(value.toFixed(6));
}

function stableSignedFraction(seed: string, magnitude: number): number {
  return (stableUnit(seed) * 2 - 1) * magnitude;
}

function stableUnit(seed: string): number {
  const hex = hashText(`${plannerVersion}\u0000${seed}`).slice(0, 12);
  return Number.parseInt(hex, 16) / 0xffffffffffff;
}

function compareHash(leftSeed: string, rightSeed: string): number {
  return hashText(`${plannerVersion}\u0000${leftSeed}`).localeCompare(
    hashText(`${plannerVersion}\u0000${rightSeed}`),
  );
}

function chooseFrom<T>(values: readonly T[], seed: string): T {
  const index = Math.floor(stableUnit(seed) * values.length);
  const value = values[Math.min(index, values.length - 1)];
  if (value === undefined) {
    throw new Error("Cannot choose from an empty array.");
  }
  return value;
}

function toStableJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => toStableJson(entry));
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (entry !== undefined) {
        result[key] = toStableJson(entry);
      }
    }
    return result;
  }
  return value;
}
