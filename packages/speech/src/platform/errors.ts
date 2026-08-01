export const speechErrorCodes = [
  "SPEECH_PROFILE_NOT_FOUND",
  "SPEECH_PROFILE_VERSION_INACTIVE",
  "SPEECH_PROFILE_INVALID",
  "SPEECH_CONSENT_MISSING",
  "SPEECH_CONSENT_EXPIRED",
  "SPEECH_CONSENT_REVOKED",
  "SPEECH_PROVIDER_DISABLED",
  "SPEECH_PROVIDER_AUTHENTICATION_FAILED",
  "SPEECH_PROVIDER_RATE_LIMITED",
  "SPEECH_PROVIDER_TIMEOUT",
  "SPEECH_PROVIDER_UNAVAILABLE",
  "SPEECH_PROVIDER_REJECTED_INPUT",
  "SPEECH_PROVIDER_INVALID_RESPONSE",
  "SPEECH_QUOTA_EXCEEDED",
  "SPEECH_CACHE_CLAIM_CONFLICT",
  "SPEECH_AUDIO_PROCESSING_FAILED",
  "SPEECH_ARTIFACT_PERSISTENCE_FAILED",
  "SPEECH_GENERATION_NOT_RETRYABLE",
  "SPEECH_GENERATION_CANCELLED",
] as const;
export type SpeechErrorCode = (typeof speechErrorCodes)[number];

export type SpeechRetryClass =
  | "retryable"
  | "permanent"
  | "blocked"
  | "cancelled";

const retryClasses: Readonly<Record<SpeechErrorCode, SpeechRetryClass>> = {
  SPEECH_PROFILE_NOT_FOUND: "blocked",
  SPEECH_PROFILE_VERSION_INACTIVE: "blocked",
  SPEECH_PROFILE_INVALID: "blocked",
  SPEECH_CONSENT_MISSING: "blocked",
  SPEECH_CONSENT_EXPIRED: "blocked",
  SPEECH_CONSENT_REVOKED: "blocked",
  SPEECH_PROVIDER_DISABLED: "blocked",
  SPEECH_PROVIDER_AUTHENTICATION_FAILED: "permanent",
  SPEECH_PROVIDER_RATE_LIMITED: "retryable",
  SPEECH_PROVIDER_TIMEOUT: "retryable",
  SPEECH_PROVIDER_UNAVAILABLE: "retryable",
  SPEECH_PROVIDER_REJECTED_INPUT: "permanent",
  SPEECH_PROVIDER_INVALID_RESPONSE: "permanent",
  SPEECH_QUOTA_EXCEEDED: "blocked",
  SPEECH_CACHE_CLAIM_CONFLICT: "retryable",
  SPEECH_AUDIO_PROCESSING_FAILED: "retryable",
  SPEECH_ARTIFACT_PERSISTENCE_FAILED: "retryable",
  SPEECH_GENERATION_NOT_RETRYABLE: "permanent",
  SPEECH_GENERATION_CANCELLED: "cancelled",
};

export class SpeechDomainError extends Error {
  public readonly retryClass: SpeechRetryClass;
  public constructor(
    public readonly code: SpeechErrorCode,
    message: string,
    options?: {
      readonly cause?: unknown;
      readonly retryClass?: SpeechRetryClass;
    }
  ) {
    super(
      message,
      options?.cause === undefined ? undefined : { cause: options.cause }
    );
    this.name = "SpeechDomainError";
    this.retryClass = options?.retryClass ?? retryClasses[code];
  }
}

export function speechRetryClassFor(error: unknown): SpeechRetryClass {
  return error instanceof SpeechDomainError ? error.retryClass : "permanent";
}
