import type {
  CameraMotion,
  CaptionPlan as DomainCaptionPlan,
  EpisodeFocalMetadata,
  FocalRegion,
  NormalizedCrop,
  RenderShot,
  ShotPlan,
  ShotPlanValidationIssue,
  ShotPlanValidationIssueCode,
  ShotPlanValidationIssueSeverity,
  VisualBudget,
  VisualNarrativePhase,
  VisualPacingProfile,
  VisualSourceScene,
} from "@mediaforge/domain";
import type { ReadonlyTreatmentCatalogEntry } from "@mediaforge/domain/visual-retention/treatment-catalog.js";
import {
  calculateEffectiveCropResolution,
  cropContainsRectangleWithMargin,
  normalizedCropIou,
  rectangleIntersectionArea,
  rectanglesOverlap,
  type NormalizedRectangle,
} from "./crop-overlap.js";
import {
  emptyShotPlanValidationMetrics,
  type ShotPlanValidationMetrics,
} from "./shot-validation-metrics.js";

export type FocalMetadataArtifact = EpisodeFocalMetadata;
export type ShotTreatmentCatalog = readonly ReadonlyTreatmentCatalogEntry[];

export type CaptionPlan = DomainCaptionPlan | LegacyCaptionPlan;

export interface LegacyCaptionPlan {
  readonly regions: readonly CaptionLayoutRegion[];
  readonly brandingSafeAreas?: readonly CaptionProtectedRegion[];
}

export interface CaptionLayoutRegion {
  readonly id: string;
  readonly shotId?: string;
  readonly sceneId?: string;
  readonly startMs?: number;
  readonly endMs?: number;
  readonly bounds: NormalizedRectangle;
}

export interface CaptionProtectedRegion {
  readonly id: string;
  readonly bounds: NormalizedRectangle;
}

export interface EvidenceInsert {
  readonly id: string;
  readonly shotId?: string;
  readonly sceneId?: string;
  readonly startMs?: number;
  readonly endMs?: number;
  readonly bounds?: NormalizedRectangle;
  readonly sourceFactId?: string;
}

export interface ValidateShotPlanInput {
  readonly shotPlan: ShotPlan;
  readonly pacingProfile: VisualPacingProfile;
  readonly visualBudget: VisualBudget;
  readonly treatmentCatalog: ShotTreatmentCatalog;
  readonly focalMetadata?: FocalMetadataArtifact;
  readonly captionPlan?: CaptionPlan;
  readonly evidenceInserts?: readonly EvidenceInsert[];
}

export interface ShotPlanValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ShotPlanValidationIssue[];
  readonly metrics: ShotPlanValidationMetrics;
}

export interface MeaningfulVisualChange {
  readonly meaningful: boolean;
  readonly reasons: readonly string[];
  readonly cropIou?: number;
}

const openingWindowMs = 8_000;
const minimumVisiblePanTravel = 0.01;
const minimumVisibleScaleDelta = 0.015;
const minimumVisibleDrift = 0.01;
const minimumVisibleRotationDegrees = 0.15;
const setupToClimaxSpeedupFactor = 0.9;

const issueCodeOrder: readonly ShotPlanValidationIssueCode[] = [
  "VISUAL_CHANGE_RATE_TOO_LOW",
  "OPENING_VISUAL_VARIETY_TOO_LOW",
  "STATIC_SHOT_TOO_LONG",
  "SOURCE_IMAGE_OVERUSED",
  "CONSECUTIVE_SOURCE_IMAGE_REUSE_TOO_HIGH",
  "CONSECUTIVE_CROP_TOO_SIMILAR",
  "REPEATED_MOTION_PATTERN",
  "CLIMAX_PACING_TOO_SLOW",
  "SHOT_BUDGET_EXCEEDED",
  "SOURCE_IMAGE_BUDGET_EXCEEDED",
  "FINAL_CALLBACK_SHOT_MISSING",
  "BLURRED_FILL_OVERUSED",
  "SURVEILLANCE_EFFECT_OVERUSED",
  "PARALLAX_EFFECT_OVERUSED",
  "CAPTION_VISUAL_COLLISION",
  "EVIDENCE_PROVENANCE_MISSING",
  "LOW_RESOLUTION_CROP_RISK",
  "FACE_CLIPPING_RISK",
];

const defaultSeverityByCode: Record<
  ShotPlanValidationIssueCode,
  ShotPlanValidationIssueSeverity
> = {
  VISUAL_CHANGE_RATE_TOO_LOW: "error",
  OPENING_VISUAL_VARIETY_TOO_LOW: "error",
  STATIC_SHOT_TOO_LONG: "error",
  SOURCE_IMAGE_OVERUSED: "warning",
  CONSECUTIVE_SOURCE_IMAGE_REUSE_TOO_HIGH: "warning",
  CONSECUTIVE_CROP_TOO_SIMILAR: "warning",
  REPEATED_MOTION_PATTERN: "warning",
  CLIMAX_PACING_TOO_SLOW: "error",
  SHOT_BUDGET_EXCEEDED: "warning",
  SOURCE_IMAGE_BUDGET_EXCEEDED: "warning",
  FINAL_CALLBACK_SHOT_MISSING: "warning",
  BLURRED_FILL_OVERUSED: "warning",
  SURVEILLANCE_EFFECT_OVERUSED: "warning",
  PARALLAX_EFFECT_OVERUSED: "warning",
  CAPTION_VISUAL_COLLISION: "error",
  EVIDENCE_PROVENANCE_MISSING: "error",
  LOW_RESOLUTION_CROP_RISK: "warning",
  FACE_CLIPPING_RISK: "error",
};

const substantialTreatmentIds = new Set([
  "security-camera-overlay",
  "short-blackout",
  "exposure-flash",
  "frame-skip",
  "static-burst",
  "emergency-light-pulse",
  "fluorescent-flicker",
  "declassified-file-overlay",
  "audio-waveform-insert",
  "clock-close-up",
  "handwritten-note-insert",
  "text-message-insert",
]);

const minorTreatmentIds = new Set([
  "analogue-noise",
  "film-grain",
  "fog-or-grain-overlay",
  "vignette-drift",
]);

const dynamicTreatmentIds = new Set([
  "background-drift",
  "focus-breathing",
  "vignette-drift",
  "emergency-light-pulse",
  "fluorescent-flicker",
  "exposure-flash",
  "short-blackout",
  "frame-skip",
  "static-burst",
  "layered-pseudo-parallax",
  "depth-based-zoom",
]);

interface Analysis {
  readonly shots: readonly RenderShot[];
  readonly sourceSceneById: ReadonlyMap<string, VisualSourceScene>;
  readonly phaseByShotId: ReadonlyMap<string, VisualNarrativePhase>;
  readonly durationByShotId: ReadonlyMap<string, number>;
  readonly sourceImageUseCounts: ReadonlyMap<string, number>;
  readonly maximumConsecutiveSourceImageUses: number;
  readonly treatmentCounts: Readonly<Record<string, number>>;
  readonly transitionCounts: Readonly<Record<string, number>>;
  readonly boundaries: readonly BoundaryAnalysis[];
  readonly longestStaticIntervalMs: number;
  readonly openingMeaningfulChanges: number;
  readonly metrics: ShotPlanValidationMetrics;
}

interface BoundaryAnalysis {
  readonly previous: RenderShot;
  readonly next: RenderShot;
  readonly change: MeaningfulVisualChange;
}

type RepairSuggestion = Readonly<Record<string, string>>;

type ValidationIssueDetails = NonNullable<ShotPlanValidationIssue["details"]>;

export function validateShotPlan(
  input: ValidateShotPlanInput,
): ShotPlanValidationResult {
  const analysis = analyzeShotPlan(input);
  const issues: ShotPlanValidationIssue[] = [];

  issues.push(...validateTimeline(input, analysis));
  issues.push(...validateBudgets(input, analysis));
  issues.push(...validateOpeningVariety(input, analysis));
  issues.push(...validateDurationAndChangeRate(input, analysis));
  issues.push(...validateSourceImageReuse(input, analysis));
  issues.push(...validateCropSimilarity(input, analysis));
  issues.push(...validateRepeatedMotion(analysis));
  issues.push(...validateClimaxPacing(input, analysis));
  issues.push(...validateFinalCallback(analysis));
  issues.push(...validateEffectCaps(input, analysis));
  issues.push(...validateCaptionCollisions(input, analysis));
  issues.push(...validateEvidenceProvenance(input, analysis));
  issues.push(...validateResolutionRisk(input, analysis));
  issues.push(...validateFaceClipping(input, analysis));

  const sortedIssues = [...issues].sort(compareIssues);
  return {
    valid: sortedIssues.every((issue) => issue.severity !== "error"),
    issues: sortedIssues,
    metrics: analysis.metrics,
  };
}

/**
 * Shared pre-render definition of a meaningful visual boundary. It intentionally
 * ignores captions and metadata-only changes, and is reused by opening-variety,
 * change-rate, static-interval metrics, and external telemetry consumers.
 */
export function classifyMeaningfulVisualChange(args: {
  readonly previous: RenderShot;
  readonly next: RenderShot;
  readonly visualBudget: VisualBudget;
  readonly evidenceInserts?: readonly EvidenceInsert[];
}): MeaningfulVisualChange {
  const reasons: string[] = [];
  const previousEvidence = hasEvidenceAtShot(args.previous, args.evidenceInserts);
  const nextEvidence = hasEvidenceAtShot(args.next, args.evidenceInserts);

  if (args.previous.sourceImageId !== args.next.sourceImageId) {
    reasons.push("source-image-change");
  }
  if (args.previous.sceneId !== args.next.sceneId) {
    reasons.push("scene-boundary");
  }
  if (args.previous.sourceSceneId !== args.next.sourceSceneId) {
    reasons.push("source-scene-boundary");
  }
  if (previousEvidence !== nextEvidence) {
    reasons.push("evidence-insert-boundary");
  }

  let cropIou: number | undefined;
  if (
    args.previous.crop !== undefined &&
    args.next.crop !== undefined &&
    args.previous.sourceImageId === args.next.sourceImageId
  ) {
    cropIou = normalizedCropIou(args.previous.crop, args.next.crop);
    if (cropIou <= args.visualBudget.cropLimits.maxAdjacentSameImageCropIou) {
      reasons.push("material-crop-change");
    }
  }

  const motionChange = classifyMotionChange(args.previous.motion, args.next.motion);
  if (motionChange !== undefined) {
    reasons.push(motionChange);
  }

  const previousTreatmentId = args.previous.treatment.treatmentId;
  const nextTreatmentId = args.next.treatment.treatmentId;
  if (previousTreatmentId !== nextTreatmentId) {
    if (
      substantialTreatmentIds.has(previousTreatmentId) ||
      substantialTreatmentIds.has(nextTreatmentId)
    ) {
      reasons.push("substantial-treatment-change");
    } else if (
      !minorTreatmentIds.has(previousTreatmentId) &&
      !minorTreatmentIds.has(nextTreatmentId)
    ) {
      reasons.push("material-treatment-change");
    }
  }

  return {
    meaningful: reasons.length > 0,
    reasons,
    ...(cropIou === undefined ? {} : { cropIou }),
  };
}

export function isVisiblyMovingShot(shot: RenderShot): boolean {
  return (
    isVisibleMotion(shot.motion) ||
    dynamicTreatmentIds.has(shot.treatment.treatmentId) ||
    shot.treatment.family === "depth"
  );
}

function analyzeShotPlan(input: ValidateShotPlanInput): Analysis {
  if (input.shotPlan.shots.length === 0) {
    return {
      shots: [],
      sourceSceneById: new Map(),
      phaseByShotId: new Map(),
      durationByShotId: new Map(),
      sourceImageUseCounts: new Map(),
      maximumConsecutiveSourceImageUses: 0,
      treatmentCounts: {},
      transitionCounts: {},
      boundaries: [],
      longestStaticIntervalMs: 0,
      openingMeaningfulChanges: 0,
      metrics: emptyShotPlanValidationMetrics(),
    };
  }

  const shots = [...input.shotPlan.shots].sort(compareShotsByTimeline);
  const sourceSceneById = new Map(
    input.shotPlan.sourceScenes.map((scene) => [scene.sourceSceneId, scene]),
  );
  const phaseByShotId = new Map<string, VisualNarrativePhase>();
  const durationByShotId = new Map<string, number>();
  const sourceImageUseCounts = new Map<string, number>();
  const treatmentCounts = new Map<string, number>();
  const transitionCounts = new Map<string, number>();
  const durations: number[] = [];
  const climaxDurations: number[] = [];
  const boundaries: BoundaryAnalysis[] = [];

  let maximumConsecutiveSourceImageUses = 0;
  let currentSourceImageId: string | undefined;
  let currentSourceImageRun = 0;
  let openingMeaningfulChanges = 0;
  let currentStaticStartMs = shots[0]?.startMs ?? 0;
  let longestStaticIntervalMs = 0;

  for (const shot of shots) {
    const durationMs = shot.endMs - shot.startMs;
    const sourceScene = sourceSceneById.get(shot.sourceSceneId);
    const phase = sourceScene?.importance ?? "setup";
    phaseByShotId.set(shot.shotId, phase);
    durationByShotId.set(shot.shotId, durationMs);
    durations.push(durationMs);
    if (phase === "climax") {
      climaxDurations.push(durationMs);
    }
    sourceImageUseCounts.set(
      shot.sourceImageId,
      (sourceImageUseCounts.get(shot.sourceImageId) ?? 0) + 1,
    );
    treatmentCounts.set(
      shot.treatment.treatmentId,
      (treatmentCounts.get(shot.treatment.treatmentId) ?? 0) + 1,
    );
    transitionCounts.set(
      shot.transition?.kind ?? "none",
      (transitionCounts.get(shot.transition?.kind ?? "none") ?? 0) + 1,
    );

    if (shot.sourceImageId === currentSourceImageId) {
      currentSourceImageRun += 1;
    } else {
      currentSourceImageId = shot.sourceImageId;
      currentSourceImageRun = 1;
    }
    maximumConsecutiveSourceImageUses = Math.max(
      maximumConsecutiveSourceImageUses,
      currentSourceImageRun,
    );
  }

  for (let index = 1; index < shots.length; index += 1) {
    const previous = shots[index - 1];
    const next = shots[index];
    if (previous === undefined || next === undefined) {
      continue;
    }
    const change = classifyMeaningfulVisualChange({
      previous,
      next,
      visualBudget: input.visualBudget,
      ...(input.evidenceInserts === undefined
        ? {}
        : { evidenceInserts: input.evidenceInserts }),
    });
    boundaries.push({ previous, next, change });
    if (change.meaningful) {
      if (next.startMs <= openingWindowMs) {
        openingMeaningfulChanges += 1;
      }
      longestStaticIntervalMs = Math.max(
        longestStaticIntervalMs,
        previous.endMs - currentStaticStartMs,
      );
      currentStaticStartMs = next.startMs;
    }
  }
  const lastShot = shots.at(-1);
  if (lastShot !== undefined) {
    longestStaticIntervalMs = Math.max(
      longestStaticIntervalMs,
      lastShot.endMs - currentStaticStartMs,
    );
  }

  return {
    shots,
    sourceSceneById,
    phaseByShotId,
    durationByShotId,
    sourceImageUseCounts,
    maximumConsecutiveSourceImageUses,
    treatmentCounts: sortedRecord(treatmentCounts),
    transitionCounts: sortedRecord(transitionCounts),
    boundaries,
    longestStaticIntervalMs,
    openingMeaningfulChanges,
    metrics: {
      totalShots: shots.length,
      uniqueSourceImages: sourceImageUseCounts.size,
      averageShotDurationMs: average(durations),
      medianShotDurationMs: median(durations),
      longestShotDurationMs: Math.max(...durations),
      longestStaticIntervalMs,
      openingMeaningfulChanges,
      climaxAverageShotDurationMs:
        climaxDurations.length === 0 ? null : average(climaxDurations),
      averageShotsPerSourceImage:
        sourceImageUseCounts.size === 0 ? 0 : shots.length / sourceImageUseCounts.size,
      maximumConsecutiveSourceImageUses,
      treatmentCounts: sortedRecord(treatmentCounts),
      transitionCounts: sortedRecord(transitionCounts),
    },
  };
}

function validateTimeline(
  input: ValidateShotPlanInput,
  analysis: Analysis,
): readonly ShotPlanValidationIssue[] {
  const issues: ShotPlanValidationIssue[] = [];
  if (analysis.shots.length === 0) {
    issues.push(
      issue("VISUAL_CHANGE_RATE_TOO_LOW", {
        message: "Shot plan contains no render shots to validate.",
        details: {
          reason: "empty-shot-list",
          repairSuggestion: repair("add-supported-shots"),
        },
      }),
    );
    return issues;
  }

  const seenShotIds = new Set<string>();
  for (const shot of input.shotPlan.shots) {
    if (seenShotIds.has(shot.shotId)) {
      issues.push(
        issue("VISUAL_CHANGE_RATE_TOO_LOW", {
          shot,
          message: "Shot plan contains duplicate shot ids.",
          details: {
            reason: "duplicate-shot-id",
            repairSuggestion: repair("deduplicate-shot-id", shot.shotId),
          },
        }),
      );
    }
    seenShotIds.add(shot.shotId);
  }

  for (const shot of analysis.shots) {
    const sourceScene = analysis.sourceSceneById.get(shot.sourceSceneId);
    if (sourceScene === undefined) {
      issues.push(
        issue("VISUAL_CHANGE_RATE_TOO_LOW", {
          shot,
          message: "Shot references a missing source scene.",
          details: {
            reason: "missing-source-scene",
            sourceSceneId: shot.sourceSceneId,
            repairSuggestion: repair("reassign-shot-source-scene", shot.shotId),
          },
        }),
      );
      continue;
    }
    if (
      shot.startMs < sourceScene.narrationStartMs ||
      shot.endMs > sourceScene.narrationEndMs
    ) {
      issues.push(
        issue("VISUAL_CHANGE_RATE_TOO_LOW", {
          shot,
          message: "Shot timing falls outside its source-scene narration bounds.",
          details: {
            reason: "shot-outside-source-scene",
            shotStartMs: shot.startMs,
            shotEndMs: shot.endMs,
            sceneStartMs: sourceScene.narrationStartMs,
            sceneEndMs: sourceScene.narrationEndMs,
            repairSuggestion: repair("trim-shot-to-source-scene", shot.shotId),
          },
        }),
      );
    }
  }

  for (let index = 1; index < analysis.shots.length; index += 1) {
    const previous = analysis.shots[index - 1];
    const current = analysis.shots[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    if (current.startMs > previous.endMs) {
      issues.push(
        issue("VISUAL_CHANGE_RATE_TOO_LOW", {
          shot: current,
          message: "Shot timeline has a gap between adjacent shots.",
          details: {
            reason: "timeline-gap",
            gapMs: current.startMs - previous.endMs,
            previousShotId: previous.shotId,
            repairSuggestion: repair("fill-or-close-timeline-gap", current.shotId),
          },
        }),
      );
    }
    const overlapMs = previous.endMs - current.startMs;
    const transitionAllowsOverlap =
      overlapMs > 0 &&
      previous.transition !== undefined &&
      previous.transition.kind !== "hard-cut" &&
      previous.transition.durationMs === overlapMs;
    if (overlapMs > 0 && !transitionAllowsOverlap) {
      issues.push(
        issue("VISUAL_CHANGE_RATE_TOO_LOW", {
          shot: current,
          message: "Shot timeline has an unsupported overlap.",
          details: {
            reason: "timeline-overlap",
            overlapMs,
            previousShotId: previous.shotId,
            repairSuggestion: repair("remove-unsupported-overlap", current.shotId),
          },
        }),
      );
    }
  }
  return issues;
}

function validateBudgets(
  input: ValidateShotPlanInput,
  analysis: Analysis,
): readonly ShotPlanValidationIssue[] {
  const issues: ShotPlanValidationIssue[] = [];
  if (analysis.shots.length > input.visualBudget.shotCount.max) {
    issues.push(
      issue("SHOT_BUDGET_EXCEEDED", {
        shot: analysis.shots.at(-1),
        message: "Shot count exceeds the configured visual budget.",
        details: {
          observedShots: analysis.shots.length,
          maxShots: input.visualBudget.shotCount.max,
          repairSuggestion: repair("merge-low-importance-shots"),
        },
      }),
    );
  }
  if (analysis.sourceImageUseCounts.size > input.visualBudget.sourceImageCount.max) {
    issues.push(
      issue("SOURCE_IMAGE_BUDGET_EXCEEDED", {
        shot: analysis.shots.at(-1),
        message: "Unique source-image count exceeds the configured visual budget.",
        details: {
          observedSourceImages: analysis.sourceImageUseCounts.size,
          maxSourceImages: input.visualBudget.sourceImageCount.max,
          repairSuggestion: repair("reuse-existing-source-images"),
        },
      }),
    );
  }
  return issues;
}

function validateOpeningVariety(
  input: ValidateShotPlanInput,
  analysis: Analysis,
): readonly ShotPlanValidationIssue[] {
  if (input.shotPlan.variant !== "short") {
    return [];
  }
  const totalDurationMs = analysis.shots.at(-1)?.endMs ?? 0;
  const mathematicallyPossibleChanges = Math.max(
    0,
    Math.floor(Math.min(totalDurationMs, openingWindowMs) / input.visualBudget.motionLimits.minShotDurationMs) - 1,
  );
  const requiredChanges = Math.min(
    mathematicallyPossibleChanges,
    totalDurationMs >= openingWindowMs
      ? 3
      : Math.floor((totalDurationMs / openingWindowMs) * 3),
  );
  if (requiredChanges <= 0 || analysis.openingMeaningfulChanges >= requiredChanges) {
    return [];
  }
  return [
    issue("OPENING_VISUAL_VARIETY_TOO_LOW", {
      shot: analysis.shots.find((shot) => shot.startMs < openingWindowMs),
      message: "Opening has too few meaningful visual changes.",
      details: {
        observedChanges: analysis.openingMeaningfulChanges,
        requiredChanges,
        windowMs: Math.min(totalDurationMs, openingWindowMs),
        repairSuggestion: repair("add-hook-detail-or-evidence-shot"),
      },
    }),
  ];
}

function validateDurationAndChangeRate(
  input: ValidateShotPlanInput,
  analysis: Analysis,
): readonly ShotPlanValidationIssue[] {
  const issues: ShotPlanValidationIssue[] = [];
  for (const shot of analysis.shots) {
    const durationMs = analysis.durationByShotId.get(shot.shotId) ?? 0;
    const moving = isVisiblyMovingShot(shot);
    if (!moving && durationMs > input.pacingProfile.staticShotDurationMs.maxMs) {
      issues.push(
        issue("STATIC_SHOT_TOO_LONG", {
          shot,
          message: "Fully static shot exceeds the pacing profile maximum.",
          details: {
            observedDurationMs: durationMs,
            configuredLimitMs: input.pacingProfile.staticShotDurationMs.maxMs,
            moving,
            repairSuggestion: repair("split-static-shot-or-add-visible-motion", shot.shotId),
          },
        }),
      );
    }
    if (moving && durationMs > input.pacingProfile.movingShotDurationMs.maxMs) {
      issues.push(
        issue("VISUAL_CHANGE_RATE_TOO_LOW", {
          shot,
          message: "Moving shot exceeds the pacing profile maximum.",
          details: {
            observedDurationMs: durationMs,
            configuredLimitMs: input.pacingProfile.movingShotDurationMs.maxMs,
            moving,
            repairSuggestion: repair("split-moving-shot", shot.shotId),
          },
        }),
      );
    }
  }

  let intervalStart = analysis.shots[0];
  let intervalHasVisibleMotion = intervalStart
    ? isVisiblyMovingShot(intervalStart)
    : false;
  for (const boundary of analysis.boundaries) {
    if (!boundary.change.meaningful) {
      intervalHasVisibleMotion =
        intervalHasVisibleMotion || isVisiblyMovingShot(boundary.next);
      continue;
    }
    if (intervalStart !== undefined) {
      issues.push(
        ...validateVisualInterval(input, intervalStart, boundary.previous, intervalHasVisibleMotion),
      );
    }
    intervalStart = boundary.next;
    intervalHasVisibleMotion = isVisiblyMovingShot(boundary.next);
  }
  const lastShot = analysis.shots.at(-1);
  if (intervalStart !== undefined && lastShot !== undefined) {
    issues.push(
      ...validateVisualInterval(input, intervalStart, lastShot, intervalHasVisibleMotion),
    );
  }
  return issues;
}

function validateVisualInterval(
  input: ValidateShotPlanInput,
  startShot: RenderShot,
  endShot: RenderShot,
  intervalHasVisibleMotion: boolean,
): readonly ShotPlanValidationIssue[] {
  const observedDurationMs = endShot.endMs - startShot.startMs;
  const configuredLimitMs = intervalHasVisibleMotion
    ? input.pacingProfile.movingShotDurationMs.maxMs
    : input.pacingProfile.staticShotDurationMs.maxMs;
  if (observedDurationMs <= configuredLimitMs) {
    return [];
  }
  return [
    issue("VISUAL_CHANGE_RATE_TOO_LOW", {
      shot: endShot,
      message: "Meaningful visual-change interval exceeds the pacing profile cadence.",
      details: {
        intervalStartShotId: startShot.shotId,
        intervalEndShotId: endShot.shotId,
        observedDurationMs,
        configuredLimitMs,
        moving: intervalHasVisibleMotion,
        repairSuggestion: repair("insert-meaningful-visual-change", endShot.shotId),
      },
    }),
  ];
}

function validateSourceImageReuse(
  input: ValidateShotPlanInput,
  analysis: Analysis,
): readonly ShotPlanValidationIssue[] {
  const issues: ShotPlanValidationIssue[] = [];
  for (const [sourceImageId, uses] of sortedMapEntries(analysis.sourceImageUseCounts)) {
    if (uses > input.visualBudget.maxTotalSourceImageUses) {
      const firstShot = analysis.shots.find(
        (shot) => shot.sourceImageId === sourceImageId,
      );
      issues.push(
        issue("SOURCE_IMAGE_OVERUSED", {
          shot: firstShot,
          message: "Source image total use exceeds the configured reuse budget.",
          details: {
            sourceImageId,
            uses,
            maxTotalSourceImageUses: input.visualBudget.maxTotalSourceImageUses,
            repairSuggestion: repair("switch-source-image-where-available", sourceImageId),
          },
        }),
      );
    }
  }

  let runStart: RenderShot | undefined;
  let runLength = 0;
  for (const shot of analysis.shots) {
    if (runStart === undefined || runStart.sourceImageId !== shot.sourceImageId) {
      runStart = shot;
      runLength = 1;
      continue;
    }
    runLength += 1;
    if (runLength === input.visualBudget.maxConsecutiveSourceImageUses + 1) {
      issues.push(
        issue("CONSECUTIVE_SOURCE_IMAGE_REUSE_TOO_HIGH", {
          shot,
          message: "Adjacent source-image reuse exceeds the configured maximum.",
          details: {
            sourceImageId: shot.sourceImageId,
            consecutiveUses: runLength,
            maxConsecutiveSourceImageUses:
              input.visualBudget.maxConsecutiveSourceImageUses,
            runStartShotId: runStart.shotId,
            repairSuggestion: repair("force-alternate-source-image", shot.shotId),
          },
        }),
      );
    }
  }
  return issues;
}

function validateCropSimilarity(
  input: ValidateShotPlanInput,
  analysis: Analysis,
): readonly ShotPlanValidationIssue[] {
  const issues: ShotPlanValidationIssue[] = [];
  for (const boundary of analysis.boundaries) {
    if (
      boundary.previous.sourceImageId !== boundary.next.sourceImageId ||
      boundary.previous.crop === undefined ||
      boundary.next.crop === undefined
    ) {
      continue;
    }
    const iou = normalizedCropIou(boundary.previous.crop, boundary.next.crop);
    if (iou <= input.visualBudget.cropLimits.maxAdjacentSameImageCropIou) {
      continue;
    }
    const nextPhase = analysis.phaseByShotId.get(boundary.next.shotId);
    if (
      nextPhase === "callback" ||
      hasStrongMotionOrTreatmentChange(boundary.previous, boundary.next)
    ) {
      continue;
    }
    issues.push(
      issue("CONSECUTIVE_CROP_TOO_SIMILAR", {
        shot: boundary.next,
        message: "Adjacent same-image crops are too similar.",
        details: {
          previousShotId: boundary.previous.shotId,
          sourceImageId: boundary.next.sourceImageId,
          observedCropIou: iou,
          configuredLimit: input.visualBudget.cropLimits.maxAdjacentSameImageCropIou,
          repairSuggestion: repair("reframe-or-change-treatment", boundary.next.shotId),
        },
      }),
    );
  }
  return issues;
}

function validateRepeatedMotion(
  analysis: Analysis,
): readonly ShotPlanValidationIssue[] {
  const issues: ShotPlanValidationIssue[] = [];
  let currentPattern: string | undefined;
  let runLength = 0;
  for (const shot of analysis.shots) {
    const pattern = normalizedMotionPattern(shot.motion);
    if (pattern === undefined) {
      currentPattern = undefined;
      runLength = 0;
      continue;
    }
    if (pattern === currentPattern) {
      runLength += 1;
    } else {
      currentPattern = pattern;
      runLength = 1;
    }
    if (runLength === 3) {
      issues.push(
        issue("REPEATED_MOTION_PATTERN", {
          shot,
          message: "Camera motion pattern repeats too often in adjacent shots.",
          details: {
            motionPattern: pattern,
            repeatedCount: runLength,
            repairSuggestion: repair("change-motion-direction-or-use-static-detail", shot.shotId),
          },
        }),
      );
    }
  }
  return issues;
}

function validateClimaxPacing(
  input: ValidateShotPlanInput,
  analysis: Analysis,
): readonly ShotPlanValidationIssue[] {
  const climaxShots = analysis.shots.filter(
    (shot) => analysis.phaseByShotId.get(shot.shotId) === "climax",
  );
  if (climaxShots.length === 0) {
    return [];
  }

  const issues: ShotPlanValidationIssue[] = [];
  const climaxDurations = climaxShots.map((shot) => shot.endMs - shot.startMs);
  const climaxAverage = average(climaxDurations);
  const climaxMax = Math.max(...climaxDurations);
  if (
    climaxAverage > input.pacingProfile.climaxCadenceMs.maxMs ||
    climaxMax > input.pacingProfile.movingShotDurationMs.maxMs
  ) {
    issues.push(
      issue("CLIMAX_PACING_TOO_SLOW", {
        shot: climaxShots.at(-1),
        message: "Climax pacing exceeds the configured cadence.",
        details: {
          climaxAverageShotDurationMs: climaxAverage,
          maximumClimaxShotDurationMs: climaxMax,
          configuredLimitMs: input.pacingProfile.climaxCadenceMs.maxMs,
          repairSuggestion: repair("split-and-shorten-climax-shots"),
        },
      }),
    );
  }

  const setupDurations = analysis.shots
    .filter((shot) => analysis.phaseByShotId.get(shot.shotId) === "setup")
    .map((shot) => shot.endMs - shot.startMs);
  if (setupDurations.length > 0 && climaxAverage >= average(setupDurations) * setupToClimaxSpeedupFactor) {
    issues.push(
      issue("CLIMAX_PACING_TOO_SLOW", {
        shot: climaxShots.at(-1),
        message: "Climax pacing is not materially faster than setup pacing.",
        details: {
          climaxAverageShotDurationMs: climaxAverage,
          setupAverageShotDurationMs: average(setupDurations),
          requiredRelativeFactor: setupToClimaxSpeedupFactor,
          repairSuggestion: repair("shorten-climax-relative-to-setup"),
        },
      }),
    );
  }

  const finalThirdStartMs = (analysis.shots.at(-1)?.endMs ?? 0) * (2 / 3);
  for (const shot of climaxShots) {
    const durationMs = shot.endMs - shot.startMs;
    if (shot.startMs >= finalThirdStartMs && durationMs > input.pacingProfile.climaxCadenceMs.maxMs) {
      issues.push(
        issue("CLIMAX_PACING_TOO_SLOW", {
          shot,
          message: "Final-third climax shot remains too long.",
          details: {
            observedDurationMs: durationMs,
            configuredLimitMs: input.pacingProfile.climaxCadenceMs.maxMs,
            repairSuggestion: repair("insert-final-third-visual-change", shot.shotId),
          },
        }),
      );
    }
  }
  return issues;
}

function validateFinalCallback(analysis: Analysis): readonly ShotPlanValidationIssue[] {
  const hasCallbackSource = [...analysis.sourceSceneById.values()].some(
    (scene) => scene.importance === "callback",
  );
  if (!hasCallbackSource) {
    return [];
  }
  const lastShot = analysis.shots.at(-1);
  if (lastShot !== undefined && analysis.phaseByShotId.get(lastShot.shotId) === "callback") {
    return [];
  }
  return [
    issue("FINAL_CALLBACK_SHOT_MISSING", {
      shot: lastShot,
      message: "Plan has callback phase metadata but no final callback shot.",
      details: {
        repairSuggestion: repair("add-final-callback-shot"),
      },
    }),
  ];
}

function validateEffectCaps(
  input: ValidateShotPlanInput,
  analysis: Analysis,
): readonly ShotPlanValidationIssue[] {
  const issues: ShotPlanValidationIssue[] = [];
  const effectCounts = new Map<VisualBudget["effectCaps"][number]["effect"], number>();
  for (const shot of analysis.shots) {
    for (const effect of effectsForTreatment(shot.treatment.treatmentId, input.treatmentCatalog)) {
      effectCounts.set(effect, (effectCounts.get(effect) ?? 0) + 1);
    }
  }

  for (const cap of input.visualBudget.effectCaps) {
    const count = effectCounts.get(cap.effect) ?? 0;
    if (count === 0) {
      continue;
    }
    const exceedsCount = cap.maxCount !== undefined && count > cap.maxCount;
    const share = analysis.shots.length === 0 ? 0 : count / analysis.shots.length;
    const exceedsShare = cap.maxShare !== undefined && share > cap.maxShare;
    if (!exceedsCount && !exceedsShare) {
      continue;
    }
    const code = effectCapIssueCode(cap.effect);
    if (code === undefined) {
      continue;
    }
    issues.push(
      issue(code, {
        shot: firstShotWithEffect(analysis.shots, input.treatmentCatalog, cap.effect),
        message: "Treatment effect usage exceeds the configured cap.",
        details: {
          effect: cap.effect,
          observedCount: count,
          observedShare: share,
          ...(cap.maxCount === undefined ? {} : { maxCount: cap.maxCount }),
          ...(cap.maxShare === undefined ? {} : { maxShare: cap.maxShare }),
          repairSuggestion: effectRepairSuggestion(cap.effect),
        },
      }),
    );
  }

  let blurredRun = 0;
  for (const shot of analysis.shots) {
    if (shot.treatment.treatmentId === "blurred-fill") {
      blurredRun += 1;
      if (blurredRun === 3) {
        issues.push(
          issue("BLURRED_FILL_OVERUSED", {
            shot,
            message: "Blurred-fill treatment appears too many times consecutively.",
            details: {
              adjacentCount: blurredRun,
              maxAdjacentCount: 2,
              repairSuggestion: repair("use-blurred-fill-only-when-no-safe-crop-exists"),
            },
          }),
        );
      }
    } else {
      blurredRun = 0;
    }
  }
  return issues;
}

function validateCaptionCollisions(
  input: ValidateShotPlanInput,
  analysis: Analysis,
): readonly ShotPlanValidationIssue[] {
  if (input.captionPlan === undefined) {
    return [];
  }
  const issues: ShotPlanValidationIssue[] = [];
  for (const caption of captionLayoutRegionsForPlan(input.captionPlan)) {
    const shots = shotsForTimedArtifact(caption, analysis);
    for (const shot of shots) {
      for (const protectedRegion of protectedRegionsForShot(input, analysis, shot)) {
        if (!rectanglesOverlap(caption.bounds, protectedRegion.bounds)) {
          continue;
        }
        issues.push(
          issue("CAPTION_VISUAL_COLLISION", {
            shot,
            message: "Caption region overlaps protected visual content.",
            details: {
              captionRegionId: caption.id,
              protectedRegionId: protectedRegion.id,
              intersectionArea: rectangleIntersectionArea(
                caption.bounds,
                protectedRegion.bounds,
              ),
              repairSuggestion: repair("move-caption-to-safe-region", caption.id),
            },
          }),
        );
      }
    }
  }
  return issues;
}

function validateEvidenceProvenance(
  input: ValidateShotPlanInput,
  analysis: Analysis,
): readonly ShotPlanValidationIssue[] {
  if (input.evidenceInserts === undefined) {
    return [];
  }
  const issues: ShotPlanValidationIssue[] = [];
  for (const insert of input.evidenceInserts) {
    if ((insert.sourceFactId ?? "").trim().length > 0) {
      continue;
    }
    const shot = shotForArtifact(insert, analysis);
    issues.push(
      issue("EVIDENCE_PROVENANCE_MISSING", {
        shot,
        message: "Evidence insert lacks a source-fact provenance reference.",
        details: {
          evidenceInsertId: insert.id,
          repairSuggestion: repair("remove-unprovenanced-evidence-insert", insert.id),
        },
      }),
    );
  }
  return issues;
}

function validateResolutionRisk(
  input: ValidateShotPlanInput,
  analysis: Analysis,
): readonly ShotPlanValidationIssue[] {
  const dimensionsByImage = focalDimensionsByImage(input);
  if (dimensionsByImage.size === 0) {
    return [];
  }
  const issues: ShotPlanValidationIssue[] = [];
  for (const shot of analysis.shots) {
    if (shot.crop === undefined) {
      continue;
    }
    const dimensions = dimensionsByImage.get(shot.sourceImageId);
    if (dimensions === undefined) {
      continue;
    }
    const resolution = calculateEffectiveCropResolution({
      sourceWidthPx: dimensions.width,
      sourceHeightPx: dimensions.height,
      crop: shot.crop,
    });
    if (
      resolution.outputEquivalentHeightPx >= input.visualBudget.cropLimits.minOutputHeightPx
    ) {
      continue;
    }
    issues.push(
      issue("LOW_RESOLUTION_CROP_RISK", {
        shot,
        message: "Selected crop is below the configured output-equivalent resolution.",
        details: {
          sourceImageId: shot.sourceImageId,
          cropWidthPx: resolution.cropWidthPx,
          cropHeightPx: resolution.cropHeightPx,
          outputEquivalentHeightPx: resolution.outputEquivalentHeightPx,
          minOutputHeightPx: input.visualBudget.cropLimits.minOutputHeightPx,
          repairSuggestion: repair("use-wider-crop-or-blurred-fill", shot.shotId),
        },
      }),
    );
  }
  return issues;
}

function validateFaceClipping(
  input: ValidateShotPlanInput,
  analysis: Analysis,
): readonly ShotPlanValidationIssue[] {
  const issues: ShotPlanValidationIssue[] = [];
  for (const shot of analysis.shots) {
    if (shot.crop === undefined) {
      continue;
    }
    for (const face of faceRegionsForShot(input, analysis, shot)) {
      const contained = cropContainsRectangleWithMargin({
        crop: shot.crop,
        rectangle: face.bounds,
        margin: input.visualBudget.cropLimits.minFaceMargin,
      });
      if (contained) {
        continue;
      }
      issues.push(
        issue("FACE_CLIPPING_RISK", {
          shot,
          message: "Shot crop clips a protected face region or violates face margin.",
          details: {
            faceRegionId: face.id,
            minFaceMargin: input.visualBudget.cropLimits.minFaceMargin,
            repairSuggestion: repair("widen-or-recenter-face-crop", shot.shotId),
          },
        }),
      );
    }
  }
  return issues;
}

function issue(
  code: ShotPlanValidationIssueCode,
  args: {
    readonly shot?: RenderShot | undefined;
    readonly message: string;
    readonly details?: ValidationIssueDetails | undefined;
  },
): ShotPlanValidationIssue {
  return {
    code,
    severity: defaultSeverityByCode[code],
    message: args.message,
    ...(args.shot === undefined
      ? {}
      : { shotId: args.shot.shotId, sceneId: args.shot.sceneId }),
    ...(args.details === undefined && args.shot === undefined
      ? {}
      : {
          details: {
            ...(args.details ?? {}),
            ...(args.shot === undefined ? {} : { timelineMs: args.shot.startMs }),
          },
        }),
  };
}

function repair(action: string, target?: string): RepairSuggestion {
  return {
    action,
    ...(target === undefined ? {} : { target }),
  };
}

function effectRepairSuggestion(
  effect: VisualBudget["effectCaps"][number]["effect"],
): RepairSuggestion {
  if (effect === "parallax") {
    return repair("replace-parallax-with-push-in");
  }
  if (effect === "surveillance-glitch-static-combined") {
    return repair("downgrade-surveillance-glitch-static-to-hard-cut-or-grain");
  }
  if (effect === "blurred-fill") {
    return repair("prefer-crop-pan-or-alternate-image");
  }
  return repair("reduce-capped-effect-use", effect);
}

function compareIssues(left: ShotPlanValidationIssue, right: ShotPlanValidationIssue): number {
  const leftTime = issueTimelinePosition(left);
  const rightTime = issueTimelinePosition(right);
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  const severity = severityRank(left.severity) - severityRank(right.severity);
  if (severity !== 0) {
    return severity;
  }
  const code = issueCodeOrder.indexOf(left.code) - issueCodeOrder.indexOf(right.code);
  if (code !== 0) {
    return code;
  }
  const shot = (left.shotId ?? "").localeCompare(right.shotId ?? "");
  if (shot !== 0) {
    return shot;
  }
  return (left.sceneId ?? "").localeCompare(right.sceneId ?? "");
}

function issueTimelinePosition(issueToOrder: ShotPlanValidationIssue): number {
  const timelineMs = issueToOrder.details?.["timelineMs"];
  if (typeof timelineMs === "number") {
    return timelineMs;
  }
  return Number.MAX_SAFE_INTEGER;
}

function severityRank(severity: ShotPlanValidationIssueSeverity): number {
  return severity === "error" ? 0 : 1;
}

function compareShotsByTimeline(left: RenderShot, right: RenderShot): number {
  if (left.startMs !== right.startMs) {
    return left.startMs - right.startMs;
  }
  if (left.endMs !== right.endMs) {
    return left.endMs - right.endMs;
  }
  return left.shotId.localeCompare(right.shotId);
}

function classifyMotionChange(
  previous: CameraMotion | undefined,
  next: CameraMotion | undefined,
): string | undefined {
  const previousPattern = normalizedMotionPattern(previous);
  const nextPattern = normalizedMotionPattern(next);
  if (previousPattern === nextPattern) {
    return undefined;
  }
  if (previousPattern === undefined && nextPattern === undefined) {
    return undefined;
  }
  return "material-motion-change";
}

function normalizedMotionPattern(motion: CameraMotion | undefined): string | undefined {
  if (!isVisibleMotion(motion) || motion === undefined) {
    return undefined;
  }
  switch (motion.kind) {
    case "none":
      return undefined;
    case "push-in":
      return "push-in";
    case "pull-out":
      return "pull-out";
    case "pan":
      return `pan-${panDirection(motion.startCenter, motion.endCenter)}`;
    case "pan-and-zoom":
      return `pan-and-zoom-${panDirection(motion.startCenter, motion.endCenter)}`;
    case "drift":
      return `drift-${Math.sign(motion.deltaX)}:${Math.sign(motion.deltaY)}`;
  }
}

function isVisibleMotion(motion: CameraMotion | undefined): boolean {
  if (motion === undefined) {
    return false;
  }
  switch (motion.kind) {
    case "none":
      return false;
    case "push-in":
      return Math.abs(motion.endScale - motion.startScale) >= minimumVisibleScaleDelta;
    case "pull-out":
      return Math.abs(motion.startScale - motion.endScale) >= minimumVisibleScaleDelta;
    case "pan":
      return pointDistance(motion.startCenter, motion.endCenter) >= minimumVisiblePanTravel;
    case "pan-and-zoom":
      return (
        pointDistance(motion.startCenter, motion.endCenter) >= minimumVisiblePanTravel ||
        Math.abs(motion.endScale - motion.startScale) >= minimumVisibleScaleDelta
      );
    case "drift":
      return (
        Math.hypot(motion.deltaX, motion.deltaY) >= minimumVisibleDrift ||
        Math.abs(motion.rotationDegrees ?? 0) >= minimumVisibleRotationDegrees
      );
  }
}

function pointDistance(
  left: Readonly<{ x: number; y: number }>,
  right: Readonly<{ x: number; y: number }>,
): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function panDirection(
  start: Readonly<{ x: number; y: number }>,
  end: Readonly<{ x: number; y: number }>,
): string {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX >= 0 ? "right" : "left";
  }
  return deltaY >= 0 ? "down" : "up";
}

function hasStrongMotionOrTreatmentChange(
  previous: RenderShot,
  next: RenderShot,
): boolean {
  if (classifyMotionChange(previous.motion, next.motion) !== undefined) {
    return true;
  }
  return (
    substantialTreatmentIds.has(previous.treatment.treatmentId) ||
    substantialTreatmentIds.has(next.treatment.treatmentId)
  );
}

function hasEvidenceAtShot(
  shot: RenderShot,
  evidenceInserts: readonly EvidenceInsert[] | undefined,
): boolean {
  if (shot.overlays.some((overlay) => overlay.kind === "evidence-insert")) {
    return true;
  }
  if (evidenceInserts === undefined) {
    return false;
  }
  return evidenceInserts.some((insert) => artifactAppliesToShot(insert, shot));
}

function protectedRegionsForShot(
  input: ValidateShotPlanInput,
  analysis: Analysis,
  shot: RenderShot,
): readonly CaptionProtectedRegion[] {
  const regions: CaptionProtectedRegion[] = [
    ...faceRegionsForShot(input, analysis, shot).map((region) => ({
      id: region.id,
      bounds: region.bounds,
    })),
    ...focalRegionsForShot(input, analysis, shot)
      .filter((region) => region.kind === "evidence-object")
      .map((region) => ({ id: region.id, bounds: region.bounds })),
    ...legacyBrandingSafeAreasForCaptionPlan(input.captionPlan),
    ...brandingSafeAreasForCaptionPlan(input.captionPlan),
  ];
  for (const insert of input.evidenceInserts ?? []) {
    if (insert.bounds !== undefined && artifactAppliesToShot(insert, shot)) {
      regions.push({ id: insert.id, bounds: insert.bounds });
    }
  }
  return regions.sort((left, right) => left.id.localeCompare(right.id));
}

function faceRegionsForShot(
  input: ValidateShotPlanInput,
  analysis: Analysis,
  shot: RenderShot,
): readonly FocalRegion[] {
  return focalRegionsForShot(input, analysis, shot).filter(
    (region) => region.kind === "face" && (region.confidence ?? 1) >= 0.6,
  );
}

function focalRegionsForShot(
  input: ValidateShotPlanInput,
  analysis: Analysis,
  shot: RenderShot,
): readonly FocalRegion[] {
  const metadataImage = input.focalMetadata?.images.find(
    (image) => image.sourceImageId === shot.sourceImageId,
  );
  if (
    metadataImage !== undefined &&
    metadataImage.origin !== "local-fallback" &&
    metadataImage.origin !== "legacy-unknown"
  ) {
    return [...metadataImage.focalRegions].sort(compareFocalRegions);
  }
  const sourceScene = analysis.sourceSceneById.get(shot.sourceSceneId);
  return [...(sourceScene?.focalRegions ?? [])].sort(compareFocalRegions);
}

function focalDimensionsByImage(
  input: ValidateShotPlanInput,
): ReadonlyMap<string, Readonly<{ width: number; height: number }>> {
  const result = new Map<string, Readonly<{ width: number; height: number }>>();
  for (const image of input.focalMetadata?.images ?? []) {
    result.set(image.sourceImageId, {
      width: image.imageWidth,
      height: image.imageHeight,
    });
  }
  return result;
}

function shotsForTimedArtifact(
  artifact: CaptionLayoutRegion,
  analysis: Analysis,
): readonly RenderShot[] {
  return analysis.shots.filter((shot) => artifactAppliesToShot(artifact, shot));
}

function captionLayoutRegionsForPlan(
  captionPlan: CaptionPlan,
): readonly CaptionLayoutRegion[] {
  if ("regions" in captionPlan) {
    return captionPlan.regions;
  }
  return captionPlan.segments.map((segment) => ({
    id: segment.id,
    startMs: segment.startMs,
    endMs: segment.endMs,
    bounds: segment.layoutRegion,
  }));
}

function brandingSafeAreasForCaptionPlan(
  captionPlan: CaptionPlan | undefined,
): readonly CaptionProtectedRegion[] {
  if (captionPlan === undefined || "regions" in captionPlan) {
    return [];
  }
  return captionPlan.brandingSafeAreas.map((bounds, index) => ({
    id: `branding-safe-area-${String(index + 1).padStart(2, "0")}`,
    bounds,
  }));
}

function legacyBrandingSafeAreasForCaptionPlan(
  captionPlan: CaptionPlan | undefined,
): readonly CaptionProtectedRegion[] {
  if (captionPlan === undefined || !("regions" in captionPlan)) {
    return [];
  }
  return captionPlan.brandingSafeAreas ?? [];
}

function shotForArtifact(
  artifact: EvidenceInsert,
  analysis: Analysis,
): RenderShot | undefined {
  return analysis.shots.find((shot) => artifactAppliesToShot(artifact, shot));
}

function artifactAppliesToShot(
  artifact: {
    readonly shotId?: string;
    readonly sceneId?: string;
    readonly startMs?: number;
    readonly endMs?: number;
  },
  shot: RenderShot,
): boolean {
  if (artifact.shotId !== undefined) {
    return artifact.shotId === shot.shotId;
  }
  if (artifact.sceneId !== undefined && artifact.sceneId !== shot.sceneId) {
    return false;
  }
  if (artifact.startMs === undefined && artifact.endMs === undefined) {
    return artifact.sceneId === undefined || artifact.sceneId === shot.sceneId;
  }
  const startMs = artifact.startMs ?? shot.startMs;
  const endMs = artifact.endMs ?? shot.endMs;
  return startMs < shot.endMs && endMs > shot.startMs;
}

function effectsForTreatment(
  treatmentId: string,
  catalog: ShotTreatmentCatalog,
): readonly VisualBudget["effectCaps"][number]["effect"][] {
  const entry = catalog.find((candidate) => candidate.id === treatmentId);
  const effects: VisualBudget["effectCaps"][number]["effect"][] = [];
  if (treatmentId === "blurred-fill") {
    effects.push("blurred-fill");
  }
  if (
    treatmentId === "layered-pseudo-parallax" ||
    treatmentId === "depth-based-zoom" ||
    treatmentId.includes("parallax")
  ) {
    effects.push("parallax");
  }
  if (
    entry?.frequencyCapRefs.some((ref) =>
      ref.includes("surveillance-glitch-static-combined"),
    ) === true ||
    ["security-camera-overlay", "static-burst", "frame-skip", "analogue-noise"].includes(
      treatmentId,
    )
  ) {
    effects.push("surveillance-glitch-static-combined");
  }
  if (treatmentId === "exposure-flash") {
    effects.push("exposure-flash");
  }
  if (treatmentId === "short-blackout") {
    effects.push("blackout");
  }
  if (["fast-push-in", "pan-plus-zoom", "accelerated-climax-zoom"].includes(treatmentId)) {
    effects.push("fast-zoom");
  }
  return effects;
}

function firstShotWithEffect(
  shots: readonly RenderShot[],
  catalog: ShotTreatmentCatalog,
  effect: VisualBudget["effectCaps"][number]["effect"],
): RenderShot | undefined {
  return shots.find((shot) => effectsForTreatment(shot.treatment.treatmentId, catalog).includes(effect));
}

function effectCapIssueCode(
  effect: VisualBudget["effectCaps"][number]["effect"],
): ShotPlanValidationIssueCode | undefined {
  if (effect === "blurred-fill") {
    return "BLURRED_FILL_OVERUSED";
  }
  if (effect === "surveillance-glitch-static-combined" || effect === "surveillance" || effect === "glitch") {
    return "SURVEILLANCE_EFFECT_OVERUSED";
  }
  if (effect === "parallax") {
    return "PARALLAX_EFFECT_OVERUSED";
  }
  return undefined;
}

function compareFocalRegions(left: FocalRegion, right: FocalRegion): number {
  if (left.kind !== right.kind) {
    return left.kind.localeCompare(right.kind);
  }
  const confidence = (right.confidence ?? 0) - (left.confidence ?? 0);
  if (confidence !== 0) {
    return confidence;
  }
  return left.id.localeCompare(right.id);
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function sortedRecord(values: ReadonlyMap<string, number>): Readonly<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const [key, value] of sortedMapEntries(values)) {
    result[key] = value;
  }
  return result;
}

function sortedMapEntries(
  values: ReadonlyMap<string, number>,
): readonly (readonly [string, number])[] {
  return [...values.entries()].sort((left, right) => left[0].localeCompare(right[0]));
}
