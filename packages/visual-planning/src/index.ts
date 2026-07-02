export {
  DeterministicShotPlanner,
  ShotPlanningError,
  deterministicShotPlanner,
  planShots,
  serializeShotPlan,
  type PlanShotsInput,
  type ShotPlanner,
  type ShotPlanningErrorCode,
  type ShotPlanningLimitation,
  type ShotPlanningRestrictions,
  type ShotPlanningResult,
  type VisualPlatform,
  type AspectRatio,
} from "./shot-planner.js";

export {
  calculateEffectiveCropResolution,
  cropContainsRectangleWithMargin,
  normalizedCropIou,
  rectangleIntersectionArea,
  rectanglesOverlap,
  type EffectiveCropResolution,
  type NormalizedRectangle,
} from "./crop-overlap.js";

export {
  classifyMeaningfulVisualChange,
  isVisiblyMovingShot,
  validateShotPlan,
  type CaptionLayoutRegion,
  type CaptionPlan,
  type CaptionProtectedRegion,
  type EvidenceInsert,
  type FocalMetadataArtifact,
  type MeaningfulVisualChange,
  type ShotPlanValidationResult,
  type ShotTreatmentCatalog,
  type ValidateShotPlanInput,
} from "./shot-validation.js";

export {
  emptyShotPlanValidationMetrics,
  type ShotPlanValidationMetrics,
} from "./shot-validation-metrics.js";

export {
  buildEvidenceInsertCacheIdentity,
  renderEvidenceInsertSvg,
  validateEvidenceInsertAgainstFacts,
  validateEvidenceInsertsAgainstFacts,
  type EvidenceInsertCacheIdentity,
  type EvidenceInsertCacheInputs,
  type EvidenceInsertSvgAsset,
  type EvidenceInsertValidationIssue,
  type EvidenceInsertValidationResult,
  type EvidenceSourceFact,
} from "./evidence-inserts.js";

export {
  captionCollisions,
  collectProtectedRegionsForCaption,
  resolveCaptionPlacements,
  type CaptionCollision,
  type CaptionCollisionIssue,
  type CaptionPlacementResult,
  type CaptionProtectedRegion as CaptionCollisionProtectedRegion,
  type ResolveCaptionPlacementInput,
} from "./caption-collision.js";

export {
  migrateLegacyEpisodeShots,
  type LegacyArtifactFormat,
  type LegacyMigrationResult,
  type LegacyMigrationWarning,
  type LegacyMigrationWarningCode,
  type MigrateLegacyEpisodeInput,
} from "./legacy-shot-plan.js";
