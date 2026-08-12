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
  type VisualMotionPreset,
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
  shotPlanSourceIdentityEquals,
  validateShotPlan,
  validateShotPlanArtifactReferences,
  type CaptionLayoutRegion,
  type CaptionPlan,
  type CaptionProtectedRegion,
  type EvidenceInsert,
  type FocalMetadataArtifact,
  type MeaningfulVisualChange,
  type ShotPlanArtifactReferenceValidationResult,
  type ShotPlanArtifactValidationCode,
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
  fixtureSafeZoneLayout,
  validateSafeZoneLayout,
  type SafeZoneLayoutElement,
  type SafeZoneLayoutIssue,
  type SafeZoneLayoutValidationResult,
  type ValidateSafeZoneLayoutInput,
} from "./safe-zone-layout.js";

export {
  migrateLegacyEpisodeShots,
  type LegacyArtifactFormat,
  type LegacyMigrationResult,
  type LegacyMigrationWarning,
  type LegacyMigrationWarningCode,
  type MigrateLegacyEpisodeInput,
} from "./legacy-shot-plan.js";

export {
  EditorialDocumentaryPlanningError,
  planEditorialDocumentaryCompositions,
  type EditorialAspectRatio,
  type EditorialAspectBrief,
  type EditorialComposition,
  type EditorialCompositionBrief,
  type EditorialDocumentaryPlan,
  type EditorialDocumentaryPlanSet,
  type EditorialDocumentaryPlanningErrorCode,
  type EditorialVisualTreatment,
  type SuppliedEditorialMedia,
  type SuppliedMediaRightsEvidence,
} from "./editorial-documentary-plan.js";

export {
  sceneVisualPolicyConfigurationHash,
  selectSceneVisualMedia,
  type SceneVisualPolicyCandidate,
  type SceneVisualPolicyInput,
  type SceneVisualPolicyResult,
  type SceneVisualPolicyScene,
  type SceneVisualPolicySource,
  type SceneVisualSelection,
  type SourceDisplayPolicy,
} from "./scene-visual-policy.js";

export {
  CANARY_EDITORIAL_CUT_RANGE,
  CANARY_EPISODE_NUMBER_MAX,
  CANARY_SOURCE_PLATE_RANGE,
  distributeEditorialCutsAcrossScenes,
  resolveMicrodramaAssetDensityPolicy,
  type MicrodramaAssetDensityPolicy,
  type MicrodramaAssetDensityScope,
} from "./microdrama-canary-asset-density.js";

export {
  MICRODRAMA_SHOT_BLOCKING_KINDS,
  MICRODRAMA_SOURCE_PLATE_PROMPT_VERSION,
  assertSourceImagePromptIsLanguageNeutral,
  buildMicrodramaSourcePlatePrompt,
  containsLocalizedReadableText,
  microdramaShotBlockingKindSchema,
  microdramaSourcePlatePromptInputSchema,
  type MicrodramaShotBlockingKind,
  type MicrodramaSourcePlatePrompt,
  type MicrodramaSourcePlatePromptInput,
} from "./microdrama-source-plate-prompt.js";

export {
  PERSISTED_VISUAL_DIRECTION_RESOLVER_V1,
  PERSISTED_VISUAL_DIRECTION_SCHEMA_V1,
  buildPersistedVisualDirectionFingerprint,
  canonicalVisualDirectionProfileId,
  createInMemoryPersistedVisualDirectionStore,
  derivePersistedVisualDirection,
  resolvePersistedVisualDirection,
  selectRelevantVisualDirectionReferences,
  type PersistedVisualDirectionArtifact,
  type PersistedVisualDirectionInput,
  type PersistedVisualDirectionResolution,
  type PersistedVisualDirectionStore,
  type VisualDirectionOperation,
  type VisualDirectionReferenceCandidate,
  type VisualDirectionScene,
} from "./persisted-direction.js";
