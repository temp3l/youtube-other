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
