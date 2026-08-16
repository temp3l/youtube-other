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
  VISUAL_RENDER_READINESS_CHECKS,
  VISUAL_RENDER_READINESS_SCHEMA_VERSION,
  DEFAULT_RENDER_PROFILE_REVISION,
  DEFAULT_VIDEO_PROVIDER_PORT_REVISION,
  DEFAULT_SHARED_VISUAL_PROMPT_VERSION,
  buildVisualRenderBudgetWorkItem,
  buildVisualRenderReadinessEvidenceRecords,
  compileVisualRenderReadinessArtifacts,
  computeRegistryFingerprint,
  computeSafeZoneLayoutFingerprint,
  computeSceneShotPlanContentHash,
  computeSharedVisualCacheFingerprint,
  evaluateAudioTtsGateForVisual,
  evaluateVisualRenderBudgetPreflight,
  evaluateVisualRenderReadiness,
  resolveVisualRenderReadinessBinding,
  validateVisualRenderBinding,
  visualRenderChecksInvalidatedByChange,
  visualRenderTargetRevisionHash,
  visualRenderTargetRevisionId,
} from "./visual-render-readiness.js";
export type {
  VisualRenderReadinessBinding,
  VisualRenderReadinessFacet,
  VisualRenderReadinessInput,
} from "./visual-render-readiness.js";

export {
  PUBLICATION_READINESS_CHECKS,
  PUBLICATION_READINESS_SCHEMA_VERSION,
  buildPublicationBudgetWorkItem,
  buildPublicationReadinessEvidenceRecords,
  evaluatePublicationBudgetPreflight,
  evaluatePublicationReadiness,
  publicationChecksInvalidatedByChange,
  publicationTargetRevisionHash,
  publicationTargetRevisionId,
  resolvePublicationReadinessBinding,
  validatePublicationBinding,
} from "./publication-readiness.js";
export type {
  PublicationReadinessBinding,
  PublicationReadinessFacet,
  PublicationReadinessInput,
} from "./publication-readiness.js";

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

export {
  MICRO_033_TASK_ID,
  EN_E001_E003_TTS_CANARY_EPISODES,
  defaultEnTtsCanaryBudgetProfiles,
  defaultV5PackRoot,
  evaluateEnE001E003TtsCanaryPreflight,
} from "./en-e001-e003-tts-canary-preflight.js";
export type {
  EnE001E003TtsCanaryPreflightInput,
  EnE001E003TtsCanaryPreflightResult,
} from "./en-e001-e003-tts-canary-preflight.js";

export {
  MICRODRAMA_OPENAI_TTS_PLANNING_PRICING,
  MICRODRAMA_OPENAI_TTS_PRICING_REVISION,
  estimateMicrodramaOpenAiTtsCostMinor,
  proposeMicrodramaTtsCanaryCostLimitMinor,
} from "./microdrama-openai-tts-pricing-catalog.js";

export {
  SEVEN_MINUTES_AHEAD_NARRATOR_CHARACTER_ID,
  SEVEN_MINUTES_AHEAD_NARRATOR_OPENAI_MODEL_INTENT,
  SEVEN_MINUTES_AHEAD_NARRATOR_OPENAI_PROVIDER,
  SEVEN_MINUTES_AHEAD_NARRATOR_TARGET_PACE_WPM,
  SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
  buildSevenMinutesAheadNarratorVoiceProfile,
  buildSevenMinutesAheadNarratorVoiceProfileVersion,
  registerSevenMinutesAheadNarratorVoiceProfile,
  sevenMinutesAheadNarratorProfileId,
} from "./seven-minutes-ahead-narrator-voice-registry.js";

export {
  MICRO_033_CANARY_EPISODE_BILLABLE_CHARACTERS,
  MICRO_033_CANARY_EPISODE_IDS,
  MICRO_033_CANARY_INITIAL_PROVIDER_SYNTHESES,
  MICRO_033_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
  MICRO_033_CANARY_COST_LIMIT_MINOR,
  MICRO_033_CANARY_CURRENCY,
  MICRO_033_AUTHORIZATION_PACK_SCRIPT_REVISIONS,
  MICRO_033_AUTHORIZATION_PACK_SCRIPT_HASHES,
  MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION,
  MICRO_033_PROVIDER_VOICE_ID,
  computeMicro033ProviderConfigRevision,
  resolveMicro033CanaryCostProposal,
  resolveMicro033CanaryEpisodeCostMinorAllocations,
} from "./micro-033-canary-bindings.js";

export {
  ensureSevenMinutesAheadNarratorVoiceProfilePersisted,
} from "./seven-minutes-ahead-narrator-voice-persistence.js";

export {
  isOpenAiSpeechSecretConfigured,
  buildMicro033OpenAiSpeechCredentialRecord,
  MICRO_033_OPENAI_CREDENTIAL_HANDLE,
} from "./microdrama-openai-speech-credential.js";

export {
  prepareMicro033BoundedCanaryAuthorization,
  computeMicro033CanaryVoiceBindingEvidenceHash,
  micro033AuthorizationEvidenceSummary,
} from "./micro-033-bounded-canary-authorization-preparation.js";
export type {
  Micro033BoundedCanaryAuthorizationPreparationInput,
  Micro033BoundedCanaryAuthorizationPreparationResult,
} from "./micro-033-bounded-canary-authorization-preparation.js";

export {
  defaultEnTtsCanaryModelConfiguration,
} from "./en-e001-e003-tts-canary-preflight.js";

export {
  authorizeMicro033BoundedCanaryExplicitExecute,
  executeMicro033BoundedTtsCanary,
  createMicro033OpenAiSegmentSynthesisPortFromEnv,
  createMicro033OpenAiSpeechProviderFromEnv,
  createMicro033MockSegmentSynthesisPort,
  MICRO_033_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
} from "./micro-033-bounded-tts-canary-execute.js";
export type {
  Micro033AuthorizeExplicitExecuteInput,
  Micro033AuthorizeExplicitExecuteResult,
  Micro033BoundedTtsCanaryExecuteInput,
  Micro033BoundedTtsCanaryExecuteResult,
  Micro033EpisodeCanaryTimingEvidence,
} from "./micro-033-bounded-tts-canary-execute.js";

export {
  buildMicro033ExplicitExecuteAuthorizationRecord,
  computeMicro033PreparationFingerprint,
  loadMicro033ExplicitExecuteAuthorization,
  MICRO_033_EXPLICIT_EXECUTE_AUTHORIZATION_ID,
  persistMicro033ExplicitExecuteAuthorization,
} from "./micro-033-explicit-execute-authorization.js";
export type { Micro033ExplicitExecuteAuthorizationRecord } from "./micro-033-explicit-execute-authorization.js";

export {
  MICRO_034_CANARY_EPISODE_IDS,
  MICRO_034_AUTHORIZATION_PACK_SCRIPT_REVISIONS,
  MICRO_034_AUTHORIZATION_PACK_SCRIPT_HASHES,
  MICRO_034_VISUAL_PROFILE_REVISION,
  MICRO_034_ESTIMATED_COST_MINOR_PER_IMAGE,
  MICRO_034_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
  MICRO_034_CANARY_COST_LIMIT_MINOR,
  MICRO_034_CANARY_CURRENCY,
  MICRO_034_VISUAL_PROVIDERS,
  computeMicro034ProviderConfigRevision,
  resolveMicro034CanaryEpisodeCostMinorAllocations,
} from "./micro-034-canary-bindings.js";

export {
  DEFAULT_MICRO_033_EXECUTION_EVIDENCE_JSON_PATH,
  computeMicro033EvidenceContentHash,
  extractMicro033AudioRevisionIds,
  loadMicro033CanaryExecutionEvidence,
  mapMicro033EpisodeToSelectedAudioFixture,
} from "./micro-034-canary-micro-033-evidence.js";
export type { Micro033CanaryExecutionEvidence } from "./micro-034-canary-micro-033-evidence.js";

export {
  prepareMicro034BoundedCanaryAuthorization,
  computeMicro034CanaryVisualBindingEvidenceHash,
  micro034AuthorizationEvidenceSummary,
} from "./micro-034-bounded-canary-authorization-preparation.js";
export type {
  Micro034BoundedCanaryAuthorizationPreparationInput,
  Micro034BoundedCanaryAuthorizationPreparationResult,
} from "./micro-034-bounded-canary-authorization-preparation.js";

export {
  defaultEnVisualCanaryBudgetProfiles,
  evaluateEnE001E003VisualCanaryPreflight,
  MICRO_034_TASK_ID,
} from "./en-e001-e003-visual-canary-preflight.js";

export {
  authorizeMicro034BoundedCanaryExplicitExecute,
  executeMicro034BoundedVisualCanary,
  createMicro034MockVisualProductionPort,
  createMicro034MockVisualProductionPortFromEnv,
  createMicro034LiveVisualProductionPort,
  createMicro034LiveVisualProductionPortFromEnv,
  MICRO_034_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
} from "./micro-034-bounded-visual-canary-execute.js";
export type {
  Micro034AuthorizeExplicitExecuteInput,
  Micro034AuthorizeExplicitExecuteResult,
  Micro034BoundedVisualCanaryExecuteInput,
  Micro034BoundedVisualCanaryExecuteResult,
  Micro034EpisodeVisualCanaryEvidence,
} from "./micro-034-bounded-visual-canary-execute.js";

export {
  buildMicro034ExplicitExecuteAuthorizationRecord,
  computeMicro034PreparationFingerprint,
  loadMicro034ExplicitExecuteAuthorization,
  MICRO_034_EXPLICIT_EXECUTE_AUTHORIZATION_ID,
  persistMicro034ExplicitExecuteAuthorization,
} from "./micro-034-explicit-execute-authorization.js";
export type { Micro034ExplicitExecuteAuthorizationRecord } from "./micro-034-explicit-execute-authorization.js";

export {
  attachPlanRegistryToVisualProductionPort,
  buildV5SeedVisualAssetRegistry,
  createMinimalPngBuffer,
} from "./micro-034-visual-production-ports.js";
export type { Micro034VisualProductionPort } from "./micro-034-visual-production-ports.js";

export {
  MICRO_035_CANARY_LOCALES,
  MICRO_035_CANARY_EPISODE_IDS,
  MICRO_035_AUTHORIZATION_PACK_SCRIPT_REVISIONS,
  MICRO_035_AUTHORIZATION_PACK_SCRIPT_FILE_HASHES,
  MICRO_035_SHARED_VISUAL_REVISION_IDS,
  MICRO_035_CANARY_COST_LIMIT_MINOR,
  MICRO_035_CANARY_CURRENCY,
  MICRO_035_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
  MICRO_035_VISUAL_PROFILE_REVISION,
  MICRO_035_PRODUCTION_PROVIDERS,
  computeMicro035ProviderConfigRevision,
  resolveMicro035CanaryEpisodeCostMinorAllocations,
} from "./micro-035-canary-bindings.js";

export { resolveMicro035OpenAiTtsModelConfigurationForLocale } from "./micro-035-openai-tts-env.js";

export {
  DEFAULT_MICRO_034_EXECUTION_EVIDENCE_JSON_PATH,
  computeMicro034EvidenceContentHash,
  extractMicro034SharedVisualRevisionIds,
  extractSharedVisualPathsFromMicro034Artifacts,
  loadMicro034CanaryExecutionEvidence,
  resolveMicro034SharedVisualPaths,
} from "./micro-035-canary-micro-034-evidence.js";
export type {
  Micro034CanaryExecutionEvidence,
  Micro034SharedVisualPathsByEpisode,
} from "./micro-035-canary-micro-034-evidence.js";

export {
  prepareMicro035BoundedCanaryAuthorization,
  computeMicro035CanaryMultilingualBindingEvidenceHash,
  micro035AuthorizationEvidenceSummary,
} from "./micro-035-bounded-canary-authorization-preparation.js";
export type {
  Micro035BoundedCanaryAuthorizationPreparationInput,
  Micro035BoundedCanaryAuthorizationPreparationResult,
} from "./micro-035-bounded-canary-authorization-preparation.js";

export {
  defaultMultilingualCanaryBudgetProfiles,
  evaluateDeEsPtE001E003MultilingualCanaryPreflight,
  MICRO_035_TASK_ID,
} from "./de-es-pt-e001-e003-multilingual-canary-preflight.js";

export {
  authorizeMicro035BoundedCanaryExplicitExecute,
  executeMicro035BoundedMultilingualCanary,
  createMicro035MockSegmentSynthesisPort,
  createMicro035OpenAiSegmentSynthesisPortForLocale,
  createMicro035SharedVisualReusePort,
  createMicro035MockSharedVisualReusePort,
  normalizeSelectedAudioSegmentDurations,
  MICRO_035_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
} from "./micro-035-bounded-multilingual-canary-execute.js";
export type {
  Micro035AuthorizeExplicitExecuteInput,
  Micro035AuthorizeExplicitExecuteResult,
  Micro035BoundedMultilingualCanaryExecuteInput,
  Micro035BoundedMultilingualCanaryExecuteResult,
  Micro035EpisodeMultilingualCanaryEvidence,
} from "./micro-035-bounded-multilingual-canary-execute.js";

export {
  buildMicro035ExplicitExecuteAuthorizationRecord,
  computeMicro035PreparationFingerprint,
  loadMicro035ExplicitExecuteAuthorization,
  MICRO_035_EXPLICIT_EXECUTE_AUTHORIZATION_ID,
  persistMicro035ExplicitExecuteAuthorization,
} from "./micro-035-explicit-execute-authorization.js";
export type { Micro035ExplicitExecuteAuthorizationRecord } from "./micro-035-explicit-execute-authorization.js";

export {
  MICRO_036_BATCH_EPISODE_IDS,
  MICRO_036_BATCH_LOCALES,
  MICRO_036_NON_EN_LOCALES,
  MICRO_036_AUTHORIZATION_PACK_SCRIPT_REVISIONS,
  MICRO_036_AUTHORIZATION_PACK_SCRIPT_FILE_HASHES,
  MICRO_036_BATCH_COST_LIMIT_MINOR,
  MICRO_036_BATCH_CURRENCY,
  MICRO_036_BATCH_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
  MICRO_036_VISUAL_PROFILE_REVISION,
  MICRO_036_PRODUCTION_PROVIDERS,
  computeMicro036ProviderConfigRevision,
  resolveMicro036BatchEpisodeCostMinorAllocations,
  isMicro036OutOfScopeEpisodeId,
} from "./micro-036-batch-bindings.js";

export { resolveMicro036OpenAiTtsModelConfigurationForLocale } from "./micro-036-openai-tts-env.js";

export {
  computeMicro035EvidenceContentHash,
  loadMicro035CanaryExecutionEvidence,
  loadMicro035CanaryExecutionEvidenceFromProjection,
  resolveMicro036BatchSharedVisualPaths,
} from "./micro-036-batch-micro-035-evidence.js";

export {
  prepareMicro036BoundedBatchAuthorization,
  computeMicro036BatchBindingEvidenceHash,
  micro036AuthorizationEvidenceSummary,
} from "./micro-036-bounded-batch-authorization-preparation.js";
export type {
  Micro036BoundedBatchAuthorizationPreparationInput,
  Micro036BoundedBatchAuthorizationPreparationResult,
} from "./micro-036-bounded-batch-authorization-preparation.js";

export {
  defaultBoundedBatchBudgetProfiles,
  evaluateE004E010BoundedBatchPreflight,
  MICRO_036_TASK_ID,
} from "./e004-e010-bounded-batch-preflight.js";

export {
  authorizeMicro036BoundedBatchExplicitExecute,
  executeMicro036BoundedBatch,
  createMicro036MockEnVisualProductionPort,
  createMicro036MockSegmentSynthesisPort,
  createMicro036MockSegmentSynthesisPorts,
  createMicro036SharedVisualReusePort,
  createMicro036MockSharedVisualReusePort,
  MICRO_036_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY,
} from "./micro-036-bounded-batch-execute.js";
export type {
  Micro036AuthorizeExplicitExecuteInput,
  Micro036AuthorizeExplicitExecuteResult,
  Micro036BoundedBatchExecuteInput,
  Micro036BoundedBatchExecuteResult,
  Micro036BatchEpisodeEvidence,
} from "./micro-036-bounded-batch-execute.js";

export {
  buildMicro036ExplicitExecuteAuthorizationRecord,
  computeMicro036PreparationFingerprint,
  loadMicro036ExplicitExecuteAuthorization,
  MICRO_036_EXPLICIT_EXECUTE_AUTHORIZATION_ID,
  persistMicro036ExplicitExecuteAuthorization,
  assertMicro036EpisodeScopeAllowed,
} from "./micro-036-explicit-execute-authorization.js";
export type { Micro036ExplicitExecuteAuthorizationRecord } from "./micro-036-explicit-execute-authorization.js";

export {
  MICRO_035_OPENAI_CREDENTIAL_HANDLE,
  buildMicro035OpenAiSpeechCredentialRecord,
} from "./microdrama-openai-speech-credential.js";

export {
  MICRO_050_TASK_ID,
  MICRO_050_CANARY_WORKSPACE_ID,
  MICRO_050_CANARY_PROVIDER_APP_ID,
  MICRO_050_CANARY_ACCOUNT_ID,
  MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
  MICRO_050_CANARY_REQUESTED_SCOPES,
  MICRO_050_CANARY_ALLOWED_ENDPOINTS,
  MICRO_050_INITIAL_CREDENTIAL_VERSION_ID,
  MICRO_050_REFRESHED_CREDENTIAL_VERSION_ID,
} from "./micro-050-canary-bindings.js";
export {
  MICRO_050_OPERATOR_AUTHORIZATION_ID,
  loadMicro050OperatorAuthorization,
  persistMicro050OperatorAuthorization,
} from "./micro-050-canary-authorization-persistence.js";
export {
  evaluateMicro050TikTokOAuthCanaryPreflight,
} from "./micro-050-tiktok-oauth-canary-preflight.js";
export {
  prepareMicro050BoundedOAuthCanaryAuthorization,
  micro050AuthorizationEvidenceSummary,
} from "./micro-050-bounded-oauth-canary-authorization-preparation.js";
export type {
  Micro050BoundedOAuthCanaryAuthorizationPreparationInput,
  Micro050BoundedOAuthCanaryAuthorizationPreparationResult,
} from "./micro-050-bounded-oauth-canary-authorization-preparation.js";
export {
  authorizeMicro050BoundedOAuthCanaryExplicitExecute,
  createMicro050TikTokOAuthCanaryPorts,
  executeMicro050TikTokOAuthCanary,
  MICRO_050_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
} from "./micro-050-tiktok-oauth-canary-execute.js";
export {
  MICRO_050_EXPLICIT_EXECUTE_AUTHORIZATION_ID,
  loadMicro050ExplicitExecuteAuthorization,
} from "./micro-050-explicit-execute-authorization.js";

export {
  MICRO_037_TASK_ID,
  MICRO_037_CANARY_PRIVACY,
  MICRO_037_INTENT_ID,
  buildMicro037PublicationBindingProbe,
} from "./micro-037-canary-bindings.js";
export {
  loadMicro050CanaryExecutionEvidence,
  micro050EvidenceProvesActiveAccount,
  DEFAULT_MICRO_050_EXECUTION_EVIDENCE_JSON_PATH,
} from "./micro-037-canary-micro-050-evidence.js";
export {
  resolveMicro037RenderBindingFromCanaryEvidence,
  MICRO_037_CANARY_LOCALE,
  MICRO_037_CANARY_EPISODE_ID,
} from "./micro-037-canary-micro-035-render-evidence.js";
export {
  MICRO_037_OPERATOR_AUTHORIZATION_ID,
  loadMicro037OperatorAuthorization,
} from "./micro-037-canary-authorization-persistence.js";
export {
  evaluateMicro037TikTokPrivatePublicationCanaryPreflight,
} from "./micro-037-tiktok-private-publication-canary-preflight.js";
export {
  prepareMicro037BoundedPublicationCanaryAuthorization,
  micro037AuthorizationEvidenceSummary,
} from "./micro-037-bounded-publication-canary-authorization-preparation.js";
export {
  authorizeMicro037BoundedPublicationCanaryExplicitExecute,
  createMicro037TikTokPublicationPorts,
  executeMicro037TikTokPrivatePublicationCanary,
  MICRO_037_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
} from "./micro-037-tiktok-private-publication-canary-execute.js";
export {
  MICRO_037_EXPLICIT_EXECUTE_AUTHORIZATION_ID,
  loadMicro037ExplicitExecuteAuthorization,
} from "./micro-037-explicit-execute-authorization.js";

export {
  MICRO_038_TASK_ID,
  MICRO_038_CANARY_PRIVACY,
  MICRO_038_INTENT_ID,
  buildMicro038PublicationBindingProbe,
} from "./micro-038-canary-bindings.js";
export {
  resolveMicro038RenderBindingFromCanaryEvidence,
  MICRO_038_CANARY_LOCALE,
  MICRO_038_CANARY_EPISODE_ID,
} from "./micro-038-canary-micro-035-render-evidence.js";
export {
  loadMicro037CanaryExecutionEvidence,
  micro037EvidenceProvesPrivateCanaryDone,
  DEFAULT_MICRO_037_EXECUTION_EVIDENCE_JSON_PATH,
} from "./micro-038-canary-micro-037-evidence.js";
export {
  MICRO_038_OPERATOR_AUTHORIZATION_ID,
  loadMicro038OperatorAuthorization,
} from "./micro-038-canary-authorization-persistence.js";
export {
  evaluateMicro038TikTokPublicPublicationCanaryPreflight,
} from "./micro-038-tiktok-public-publication-canary-preflight.js";
export {
  prepareMicro038BoundedPublicationCanaryAuthorization,
  micro038AuthorizationEvidenceSummary,
} from "./micro-038-bounded-publication-canary-authorization-preparation.js";
export {
  authorizeMicro038BoundedPublicationCanaryExplicitExecute,
  createMicro038TikTokPublicationPorts,
  executeMicro038TikTokPublicPublicationCanary,
  MICRO_038_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
} from "./micro-038-tiktok-public-publication-canary-execute.js";
export {
  MICRO_038_EXPLICIT_EXECUTE_AUTHORIZATION_ID,
  loadMicro038ExplicitExecuteAuthorization,
} from "./micro-038-explicit-execute-authorization.js";

export {
  MICRO_042_TASK_ID,
  MICRO_042_CANARY_PUBLICATION_ID,
  MICRO_042_CANARY_PROVIDER_VIDEO_ID,
  buildMicro042ReadOnlyBindingProbe,
} from "./micro-042-canary-bindings.js";
export {
  loadMicro038PublicCanaryExecutionEvidence,
  micro038EvidenceProvesPublicCanaryDone,
  DEFAULT_MICRO_038_EXECUTION_EVIDENCE_JSON_PATH,
} from "./micro-042-canary-micro-038-evidence.js";
export {
  MICRO_042_OPERATOR_AUTHORIZATION_ID,
  loadMicro042OperatorAuthorization,
} from "./micro-042-canary-authorization-persistence.js";
export {
  evaluateMicro042TikTokPublicVideoReadCanaryPreflight,
} from "./micro-042-tiktok-public-video-read-canary-preflight.js";
export {
  prepareMicro042BoundedPublicVideoReadCanaryAuthorization,
  micro042AuthorizationEvidenceSummary,
} from "./micro-042-bounded-public-video-read-canary-authorization-preparation.js";
export {
  authorizeMicro042BoundedPublicVideoReadCanaryExplicitExecute,
  createMicro042TikTokPublicVideoReadPorts,
  executeMicro042TikTokPublicVideoReadCanary,
  MICRO_042_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
} from "./micro-042-tiktok-public-video-read-canary-execute.js";
export {
  MICRO_042_EXPLICIT_EXECUTE_AUTHORIZATION_ID,
  loadMicro042ExplicitExecuteAuthorization,
} from "./micro-042-explicit-execute-authorization.js";

export {
  MICRO_039_TASK_ID,
  MICRO_039_BATCH_EPISODE_IDS,
  assertMicro039EpisodeRangeAllowed,
  buildMicro039BatchBindingProbe,
} from "./micro-039-batch-bindings.js";
export {
  prepareMicro039BoundedProgressiveBatchAuthorization,
  micro039AuthorizationEvidenceSummary,
} from "./micro-039-bounded-progressive-batch-authorization-preparation.js";
export {
  authorizeMicro039BoundedProgressiveBatchExplicitExecute,
  createMicro039ProgressiveBatchPorts,
  executeMicro039BoundedProgressiveBatch,
  MICRO_039_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY,
} from "./micro-039-bounded-progressive-batch-execute.js";
export {
  evaluateMicro039ProgressiveBatchPreflight,
  evaluateMicro039LearningAdmission,
} from "./micro-039-progressive-batch-preflight.js";

export {
  MICRO_039_E012_TASK_ID,
  MICRO_039_E012_BATCH_EPISODE_IDS,
  assertMicro039E012EpisodeRangeAllowed,
  buildMicro039E012BatchBindingProbe,
} from "./micro-039-e012-batch-bindings.js";
export {
  prepareMicro039E012BoundedProgressiveBatchAuthorization,
  micro039E012AuthorizationEvidenceSummary,
} from "./micro-039-e012-bounded-progressive-batch-authorization-preparation.js";
export {
  authorizeMicro039E012BoundedProgressiveBatchExplicitExecute,
  createMicro039E012ProgressiveBatchPorts,
  executeMicro039E012BoundedProgressiveBatch,
  MICRO_039_E012_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY,
} from "./micro-039-e012-bounded-progressive-batch-execute.js";
export {
  evaluateMicro039E012ProgressiveBatchPreflight,
  evaluateMicro039E012LearningAdmission,
} from "./micro-039-e012-progressive-batch-preflight.js";

export {
  MICRO_039_E013_TASK_ID,
  MICRO_039_E013_BATCH_EPISODE_IDS,
  assertMicro039E013EpisodeRangeAllowed,
  buildMicro039E013BatchBindingProbe,
} from "./micro-039-e013-batch-bindings.js";
export {
  prepareMicro039E013BoundedProgressiveBatchAuthorization,
  micro039E013AuthorizationEvidenceSummary,
} from "./micro-039-e013-bounded-progressive-batch-authorization-preparation.js";
export {
  authorizeMicro039E013BoundedProgressiveBatchExplicitExecute,
  createMicro039E013ProgressiveBatchPorts,
  executeMicro039E013BoundedProgressiveBatch,
  MICRO_039_E013_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY,
} from "./micro-039-e013-bounded-progressive-batch-execute.js";
export {
  evaluateMicro039E013ProgressiveBatchPreflight,
  evaluateMicro039E013LearningAdmission,
} from "./micro-039-e013-progressive-batch-preflight.js";

export {
  MICRO_039_E014_TASK_ID,
  MICRO_039_E014_BATCH_EPISODE_IDS,
  assertMicro039E014EpisodeRangeAllowed,
  buildMicro039E014BatchBindingProbe,
} from "./micro-039-e014-batch-bindings.js";
export {
  prepareMicro039E014BoundedProgressiveBatchAuthorization,
  micro039E014AuthorizationEvidenceSummary,
} from "./micro-039-e014-bounded-progressive-batch-authorization-preparation.js";
export {
  authorizeMicro039E014BoundedProgressiveBatchExplicitExecute,
  createMicro039E014ProgressiveBatchPorts,
  executeMicro039E014BoundedProgressiveBatch,
  MICRO_039_E014_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY,
} from "./micro-039-e014-bounded-progressive-batch-execute.js";
export {
  evaluateMicro039E014ProgressiveBatchPreflight,
  evaluateMicro039E014LearningAdmission,
} from "./micro-039-e014-progressive-batch-preflight.js";

export {
  MICRO_039_E015_TASK_ID,
  MICRO_039_E015_BATCH_EPISODE_IDS,
  assertMicro039E015EpisodeRangeAllowed,
  buildMicro039E015BatchBindingProbe,
} from "./micro-039-e015-batch-bindings.js";
export {
  prepareMicro039E015BoundedProgressiveBatchAuthorization,
  micro039E015AuthorizationEvidenceSummary,
} from "./micro-039-e015-bounded-progressive-batch-authorization-preparation.js";
export {
  authorizeMicro039E015BoundedProgressiveBatchExplicitExecute,
  createMicro039E015ProgressiveBatchPorts,
  executeMicro039E015BoundedProgressiveBatch,
  MICRO_039_E015_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY,
} from "./micro-039-e015-bounded-progressive-batch-execute.js";
export {
  evaluateMicro039E015ProgressiveBatchPreflight,
  evaluateMicro039E015LearningAdmission,
} from "./micro-039-e015-progressive-batch-preflight.js";

export {
  MICRO_039_E016_TASK_ID,
  MICRO_039_E016_BATCH_EPISODE_IDS,
  assertMicro039E016EpisodeRangeAllowed,
  buildMicro039E016BatchBindingProbe,
} from "./micro-039-e016-batch-bindings.js";
export {
  prepareMicro039E016BoundedProgressiveBatchAuthorization,
  micro039E016AuthorizationEvidenceSummary,
} from "./micro-039-e016-bounded-progressive-batch-authorization-preparation.js";
export {
  authorizeMicro039E016BoundedProgressiveBatchExplicitExecute,
  createMicro039E016ProgressiveBatchPorts,
  executeMicro039E016BoundedProgressiveBatch,
  MICRO_039_E016_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY,
} from "./micro-039-e016-bounded-progressive-batch-execute.js";
export {
  evaluateMicro039E016ProgressiveBatchPreflight,
  evaluateMicro039E016LearningAdmission,
} from "./micro-039-e016-progressive-batch-preflight.js";

export {
  MICRO_039_E017_TASK_ID,
  MICRO_039_E017_BATCH_EPISODE_IDS,
  assertMicro039E017EpisodeRangeAllowed,
  buildMicro039E017BatchBindingProbe,
} from "./micro-039-e017-batch-bindings.js";
export {
  prepareMicro039E017BoundedProgressiveBatchAuthorization,
  micro039E017AuthorizationEvidenceSummary,
} from "./micro-039-e017-bounded-progressive-batch-authorization-preparation.js";
export {
  authorizeMicro039E017BoundedProgressiveBatchExplicitExecute,
  createMicro039E017ProgressiveBatchPorts,
  executeMicro039E017BoundedProgressiveBatch,
  MICRO_039_E017_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY,
} from "./micro-039-e017-bounded-progressive-batch-execute.js";
export {
  evaluateMicro039E017ProgressiveBatchPreflight,
  evaluateMicro039E017LearningAdmission,
} from "./micro-039-e017-progressive-batch-preflight.js";

export {
  MICRO_039_E018_TASK_ID,
  MICRO_039_E018_BATCH_EPISODE_IDS,
  assertMicro039E018EpisodeRangeAllowed,
  buildMicro039E018BatchBindingProbe,
} from "./micro-039-e018-batch-bindings.js";
export {
  prepareMicro039E018BoundedProgressiveBatchAuthorization,
  micro039E018AuthorizationEvidenceSummary,
} from "./micro-039-e018-bounded-progressive-batch-authorization-preparation.js";
export {
  authorizeMicro039E018BoundedProgressiveBatchExplicitExecute,
  createMicro039E018ProgressiveBatchPorts,
  executeMicro039E018BoundedProgressiveBatch,
  MICRO_039_E018_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY,
} from "./micro-039-e018-bounded-progressive-batch-execute.js";
export {
  evaluateMicro039E018ProgressiveBatchPreflight,
  evaluateMicro039E018LearningAdmission,
} from "./micro-039-e018-progressive-batch-preflight.js";
