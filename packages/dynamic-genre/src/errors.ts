export const DYNAMIC_GENRE_ERROR_CODES = [
  "invalid_analysis_input",
  "analysis_provider_unavailable",
  "analysis_timeout",
  "structured_output_validation_failed",
  "repair_exhausted",
  "unsupported_profile_capability",
  "policy_violation",
  "override_rejected",
  "profile_persistence_conflict",
  "stale_profile",
  "profile_not_found",
  "resolution_failure",
  "neutral_fallback_applied",
] as const;
export type DynamicGenreErrorCode = (typeof DYNAMIC_GENRE_ERROR_CODES)[number];

export class DynamicGenreError extends Error {
  constructor(
    readonly code: DynamicGenreErrorCode,
    message: string,
    readonly retryable = false,
    readonly details: readonly string[] = []
  ) {
    super(message);
    this.name = "DynamicGenreError";
  }
}
