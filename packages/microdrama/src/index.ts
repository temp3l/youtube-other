export {
  MICRODRAMA_PACK_SCHEMA_VERSION,
  SEVEN_MINUTES_AHEAD_SERIES_ID,
  V5_REMEDIATED_PACK_VERSION,
  V5_EXPECTED_FILE_COUNT,
  V5_EXPECTED_HASH_MANIFEST_ENTRIES,
  V5_EXPECTED_EPISODE_COUNT,
  V5_EXPECTED_LOCALE_VARIANT_COUNT,
  V5_HASH_MANIFEST_RELATIVE_PATH,
  V5_PACK_MANIFEST_HASH,
  V5_SOURCE_LOCALE_ALIASES,
  V5_LOCALE_PROFILES,
  canonicalEpisodeIds,
} from "./v5-pack-constants.js";
export type { V5SourceLocaleAlias } from "./v5-pack-constants.js";

export {
  episodeImportSchema,
  localizedScriptImportSchema,
  packProvenanceSchema,
  seriesImportSchema,
  v5LocaleManifestEntrySchema,
  v5LocaleManifestSchema,
  v5PackImportResultSchema,
} from "./v5-pack-contracts.js";
export type {
  EpisodeImport,
  LocalizedScriptImport,
  SeriesImport,
  V5LocaleManifestEntry,
  V5PackImportResult,
  V5PackValidationIssue,
  V5PackValidationIssueCode,
  V5PackValidationResult,
} from "./v5-pack-contracts.js";

export { computePackManifestHash, hashFileSync, loadHashManifest } from "./v5-pack-hash.js";
export {
  isSafePackRelativePath,
  normalizePackRelativePath,
  resolvePackPath,
} from "./v5-pack-path-policy.js";

export { validateAndImportV5Pack } from "./v5-pack-parser.js";

export {
  admittedLocalizedScriptSchema,
  episodeBoundaryContractSchema,
  episodeIdentityRecordSchema,
  IMPORTED_SCRIPT_STATUSES,
  validateV5CanonAdmissionBundle,
  validateV5CanonAdmissionProjection,
  v5CanonAdmissionBundleSchema,
  v5CanonAdmissionProjectionSchema,
} from "./v5-canon-admission-contracts.js";
export type {
  AdmittedLocalizedScript,
  EpisodeBoundaryContract,
  EpisodeIdentityRecord,
  ImportedScriptStatus,
  V5CanonAdmissionBundle,
  V5CanonAdmissionIssue,
  V5CanonAdmissionIssueCode,
  V5CanonAdmissionProjection,
  V5CanonAdmissionResult,
} from "./v5-canon-admission-contracts.js";

export {
  buildCanonAdmissionProjection,
  buildSeriesBibleRevisionEnvelope,
  compileV5CanonAdmission,
} from "./v5-canon-admission.js";

export {
  persistV5CanonAdmission,
  replayV5CanonAdmission,
  verifyReplayedCanonAdmission,
} from "./v5-canon-persistence.js";
export type { V5CanonAdmissionRepository } from "./v5-canon-persistence.js";

export {
  audioGatePolicySchema,
  HERITAGE_SINGLE_VALUE_WPM,
  lexicalGatePolicySchema,
  localeProductionProfileSchema,
  sevenMinutesAheadProductionProfileSchema,
  V5_BCP47_LOCALES,
  validateSevenMinutesAheadProductionProfile,
  v5Bcp47LocaleSchema,
} from "./v5-production-profile-contracts.js";
export type {
  AudioGatePolicy,
  LexicalGatePolicy,
  LexicalTimingAuthorityResolution,
  LocaleProductionProfile,
  SevenMinutesAheadProductionProfile,
  TimingAuthorityHint,
  TimingAuthorityHintSource,
  V5Bcp47Locale,
} from "./v5-production-profile-contracts.js";

export {
  buildSevenMinutesAheadProductionProfile,
  heritageWpmIsRuntimeAuthority,
  resolveLexicalTimingAuthority,
  resolveLocaleProductionProfile,
} from "./v5-production-profile.js";

export {
  persistV5ProductionProfile,
  replayV5ProductionProfile,
} from "./v5-production-profile-persistence.js";

export {
  MICRODRAMA_PLANNING_TASK_IDS,
  MICRODRAMA_PLANNING_WORKFLOW_TASKS,
  MICRODRAMA_PLANNING_WORKFLOW_VERSION,
  planningTaskForHorizon,
  topologicalSortMicrodramaPlanningTasks,
} from "./rolling-plan-workflow.js";
export type {
  MicrodramaPlanningTaskId,
  MicrodramaPlanningWorkflowTask,
} from "./rolling-plan-workflow.js";

export {
  NEAR_HORIZON_DEFAULT_SIZE,
  NEAR_HORIZON_MAX_SIZE,
  PLANNING_HORIZONS,
  ROLLING_PLAN_REVISION_STATUSES,
  ROLLING_PLAN_SCHEMA_VERSION,
  SEASON_1_EPISODE_COUNT,
  parseCanonicalEpisodeNumber,
  planningHorizonSchema,
  planningIntentionSchema,
  rollingPlanPayloadSchema,
  rollingPlanRevisionSchema,
  validateRollingPlanPayload,
  validateRollingPlanRevision,
} from "./rolling-plan-contracts.js";
export type {
  PlanningHorizon,
  PlanningIntention,
  RollingPlanIssue,
  RollingPlanIssueCode,
  RollingPlanPayload,
  RollingPlanRevision,
  RollingPlanRevisionStatus,
  RollingPlanValidationResult,
} from "./rolling-plan-contracts.js";

export {
  expectedEpisodeRange,
  validateRollingPlanConstraints,
} from "./rolling-plan-constraints.js";
export type { RollingPlanConstraintContext } from "./rolling-plan-constraints.js";

export {
  buildRollingPlanPayload,
  buildRollingPlanRevision,
  compileRollingPlanFromFixture,
} from "./rolling-plan-planner.js";
export type { RollingPlanFixtureInput } from "./rolling-plan-planner.js";

export {
  mapRollingPlanIssues,
  rollingPlanEpisodeProductionBundleSchema,
  rollingPlanEpisodeProductionRecordSchema,
  validateRollingPlanEpisodeProductionBundle,
} from "./rolling-plan-episode-production-contracts.js";
export type {
  CompiledRollingEpisodeProduction,
  RollingPlanEpisodeProductionBundle,
  RollingPlanEpisodeProductionIssue,
  RollingPlanEpisodeProductionIssueCode,
  RollingPlanEpisodeProductionRecord,
  RollingPlanEpisodeProductionResult,
} from "./rolling-plan-episode-production-contracts.js";

export {
  buildRollingPlanEpisodeProductionRevisionEnvelopes,
  compileRollingEpisodeProductionFromIntention,
  compileRollingPlanEpisodeProduction,
} from "./rolling-plan-episode-production-compiler.js";

export {
  v5EpisodeProductionBundleSchema,
  v5EpisodeProductionProjectionSchema,
  v5EpisodeProductionRecordSchema,
  validateV5EpisodeProductionBundle,
  validateV5EpisodeProductionRecord,
} from "./v5-episode-production-contracts.js";
export type {
  CompiledEpisodeProduction,
  V5EpisodeProductionBundle,
  V5EpisodeProductionIssue,
  V5EpisodeProductionIssueCode,
  V5EpisodeProductionProjection,
  V5EpisodeProductionRecord,
  V5EpisodeProductionResult,
} from "./v5-episode-production-contracts.js";

export {
  FORBIDDEN_OPEN_LOOP_RESOLUTION,
  buildEpisodeProductionRevisionEnvelopes,
  buildV5EpisodeProductionProjection,
  compileEpisodeProductionFromBoundary,
  compileV5EpisodeProduction,
} from "./v5-episode-production-compiler.js";

export {
  assertDispatchTrustGateAllowed,
  evaluateMediaDispatchTrustGate,
  evaluatePublicationDispatchTrustGate,
} from "./trust-gate-dispatch.js";
export type {
  MediaDispatchTrustInput,
  PublicationDispatchTrustInput,
  TrustGateDispatchResult,
} from "./trust-gate-dispatch.js";

export {
  READINESS_DOMAINS,
  READINESS_CHECK_RESULTS,
  READINESS_EVIDENCE_SCHEMA_VERSION,
  READINESS_EVIDENCE_STATUSES,
  READINESS_FAILURE_CLASSES,
  readinessCheckEvaluationSchema,
  readinessCheckResultSchema,
  readinessDomainSchema,
  readinessEvidenceRecordSchema,
  readinessEvidenceStatusSchema,
  readinessFailureClassSchema,
  readinessInvalidationReasonSchema,
  readinessProjectionSchema,
  validateReadinessEvidenceRecord,
  validateReadinessProjection,
} from "./readiness-evidence-contracts.js";
export type {
  ReadinessCheckEvaluation,
  ReadinessCheckResult,
  ReadinessDomain,
  ReadinessEvidenceRecord,
  ReadinessEvidenceStatus,
  ReadinessFailureClass,
  ReadinessInvalidationReason,
  ReadinessProjection,
  ReadinessProjectionResult,
} from "./readiness-evidence-contracts.js";

export {
  conjunctionEvaluatesToPass,
  defaultEvidenceBackedCheck,
  evaluateReadinessProjection,
  evidenceMatchesRevision,
  projectionBlocksOnlyDomain,
  unavailableCheckNeverPasses,
} from "./readiness-evidence-evaluator.js";
export type { ReadinessCheckDefinition, ReadinessEvaluationInput } from "./readiness-evidence-evaluator.js";

export {
  STORY_SCRIPT_READINESS_CHECKS,
  STORY_SCRIPT_READINESS_SCHEMA_VERSION,
  buildStoryScriptReadinessEvidenceRecords,
  evaluateStoryScriptReadiness,
  resolveStoryScriptReadinessBinding,
  storyScriptTargetRevisionHash,
  storyScriptTargetRevisionId,
  validateStoryScriptBinding,
} from "./story-script-readiness.js";
export type {
  StoryScriptReadinessBinding,
  StoryScriptReadinessInput,
} from "./story-script-readiness.js";

export {
  AUDIO_TTS_READINESS_CHECKS,
  AUDIO_TTS_READINESS_SCHEMA_VERSION,
  audioTtsChecksInvalidatedByChange,
  audioTtsTargetRevisionHash,
  audioTtsTargetRevisionId,
  buildAudioTtsBudgetWorkItem,
  buildAudioTtsReadinessEvidenceRecords,
  compileAudioTtsReadinessArtifacts,
  evaluateAudioTtsBudgetPreflight,
  evaluateAudioTtsReadiness,
  evaluateStoryScriptGateForAudio,
  extractLocalizedMasterStory,
  readAdmittedLocalizedScriptText,
  resolveAudioTtsReadinessBinding,
  validateAudioTtsBinding,
} from "./audio-tts-readiness.js";
export type {
  AudioTtsReadinessBinding,
  AudioTtsReadinessFacet,
  AudioTtsReadinessInput,
} from "./audio-tts-readiness.js";

export {
  STORY_QA_ISSUE_CODES,
  STORY_QA_SCHEMA_VERSION,
  SEMANTIC_STORY_QA_STATUSES,
  craftEditorialEvidenceSchema,
  semanticStoryQaStatusSchema,
  storyApprovedEvidenceSchema,
  storyQaIssueCodeSchema,
  storyQaIssueSchema,
  validateStoryApprovedEvidence,
} from "./v5-story-qa-contracts.js";
export type {
  CraftEditorialEvidence,
  SemanticStoryQaAdapter,
  SemanticStoryQaAdapterResult,
  SemanticStoryQaStatus,
  StoryApprovedEvidence,
  StoryQaIssue,
  StoryQaIssueCode,
  V5StoryDeterministicQaResult,
} from "./v5-story-qa-contracts.js";

export {
  validateV5StoryDeterministicQa,
  validateV5StoryEpisodeDeterministicQa,
} from "./v5-story-qa.js";

export {
  assertDeterministicStoryQaPassed,
  buildStoryApprovalDeterministicQa,
  evaluateOptionalSemanticStoryQa,
  grantStoryApprovedEvidence,
} from "./v5-story-approval.js";
export type { StoryApprovalRequest, StoryApprovalResult } from "./v5-story-approval.js";

export {
  MICRODRAMA_SHOT_BLOCKING_KINDS,
  MICRODRAMA_SHOT_REACTION_KINDS,
  V5_SCENE_SHOT_SCHEMA_VERSION,
  microdramaAssetDensityPolicySchema,
  microdramaShotBlockingKindSchema,
  microdramaShotReactionKindSchema,
  projectedLocaleShotTimingSchema,
  semanticBeatPlanEntrySchema,
  semanticScenePlanEntrySchema,
  semanticShotPlanEntrySchema,
  semanticTimingWindowSchema,
  validateV5SceneShotPlanBundle,
  validateV5SceneShotPlanRecord,
  v5SceneShotPlanBundleSchema,
  v5SceneShotPlanRecordSchema,
} from "./v5-scene-shot-compiler-contracts.js";
export type {
  MicrodramaAssetDensityPolicyRecord,
  MicrodramaShotBlockingKind,
  MicrodramaShotReactionKind,
  ProjectedLocaleShotTiming,
  SemanticBeatPlanEntry,
  SemanticScenePlanEntry,
  SemanticShotPlanEntry,
  SemanticTimingWindow,
  ShotVisualRegistryReference,
  V5SceneShotPlanBundle,
  V5SceneShotPlanIssue,
  V5SceneShotPlanIssueCode,
  V5SceneShotPlanRecord,
  V5SceneShotPlanResult,
} from "./v5-scene-shot-compiler-contracts.js";

export {
  beatSemanticId,
  compileSceneShotPlanFromProductionRecord,
  compileV5SceneShotPlans,
  projectLocaleTimingOverSemanticPlan,
  sceneSemanticId,
  shotSemanticId,
  sourcePlateSemanticId,
} from "./v5-scene-shot-compiler.js";

export {
  buildMicrodramaShotVisualGenerationRequests,
  buildMicrodramaVisualGenerationPlan,
  type MicrodramaVisualGenerationPlanItem,
} from "./v5-visual-generation.js";

export {
  LOCALE_COMPOSITION_SCHEMA_VERSION,
  compileLocaleEpisodeTimeline,
  type CompileLocaleEpisodeTimelineInput,
} from "./locale-composition.js";

export {
  LOCALE_TTS_SEGMENTATION_BUNDLE_SCHEMA_VERSION,
  SELECTED_AUDIO_TIMING_SCHEMA_VERSION,
  compileLocaleTtsSegmentation,
  fakeSelectedAudioFixtureSchema,
  localeTtsSegmentationBundleSchema,
  resolveLocaleTtsTimingAuthority,
  selectedAudioTimingContractSchema,
  type FakeSelectedAudioFixture,
  type LocaleTtsSegmentationBundle,
  type LocaleTtsSegmentationInput,
  type LocaleTtsTimingAuthorityResolution,
  type SelectedAudioTimingContract,
} from "./locale-tts-segmentation.js";

export { buildMinimalSceneShotPlanFixture } from "./scene-shot-plan-fixture.js";

export {
  LEARNING_ADMISSION_SCHEMA_VERSION,
  LEARNING_ADMISSION_ISSUE_CODES,
  acceptedPlanningLearningInputSchema,
  learningAdmissionIssueCodeSchema,
  learningAdmissionIssueSchema,
  learningAdmissionValidationResultSchema,
  planningLearningInputsSchema,
} from "./learning-admission-contracts.js";
export type {
  AcceptedPlanningLearningInput,
  LearningAdmissionIssue,
  LearningAdmissionIssueCode,
  LearningAdmissionValidationResult,
  PlanningLearningInputs,
} from "./learning-admission-contracts.js";

export {
  acceptCreativeRecommendationForPlanning,
  buildAcceptedPlanningLearningInput,
  rejectUnadmittedRecommendationsForPlanning,
  selectAcceptedRecommendationsForPlanning,
  validateCreativeRecommendationCanonSafety,
} from "./learning-admission.js";
export type { LearningAdmissionContext } from "./learning-admission.js";
