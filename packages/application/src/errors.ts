export const APPLICATION_ERROR_CODES = [
  "authentication_required",
  "authorization_denied",
  "authority_conflict",
  "conflict",
  "idempotency_key_conflict",
  "idempotency_request_in_progress",
  "invalid_request",
  "not_found",
  "precondition_required",
  "precondition_failed",
  "quota_exceeded",
  "state_transition_rejected",
  "upstream_unavailable",
] as const;

export type ApplicationErrorCode = (typeof APPLICATION_ERROR_CODES)[number];

export class ApplicationError extends Error {
  public override readonly name = "ApplicationError";

  public constructor(
    public readonly code: ApplicationErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly details: readonly string[] = []
  ) {
    super(message);
  }
}

export function isApplicationError(value: unknown): value is ApplicationError {
  return value instanceof ApplicationError;
}
