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
