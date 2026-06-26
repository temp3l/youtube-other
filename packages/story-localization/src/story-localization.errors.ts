export class StoryLocalizationError extends Error {
  public override name = "StoryLocalizationError";

  public constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
  }
}

export class StoryLocalizationConfigurationError extends StoryLocalizationError {
  public override name = "StoryLocalizationConfigurationError";
}

export class StorySourceDiscoveryError extends StoryLocalizationError {
  public override name = "StorySourceDiscoveryError";
}

export class StorySourceParseError extends StoryLocalizationError {
  public override name = "StorySourceParseError";
}

export class CanonicalFactsExtractionError extends StoryLocalizationError {
  public override name = "CanonicalFactsExtractionError";
}

export class StoryLocalizationApiError extends StoryLocalizationError {
  public override name = "StoryLocalizationApiError";
}

export class StoryLocalizationSchemaError extends StoryLocalizationError {
  public override name = "StoryLocalizationSchemaError";
}

export class StoryLocalizationValidationError extends StoryLocalizationError {
  public override name = "StoryLocalizationValidationError";
}

export class StoryPreservationError extends StoryLocalizationError {
  public override name = "StoryPreservationError";
}

export class StoryOutputWriteError extends StoryLocalizationError {
  public override name = "StoryOutputWriteError";
}

export function isRetryableStoryLocalizationError(error: unknown): boolean {
  if (error instanceof StoryLocalizationValidationError) {
    return false;
  }
  if (error instanceof StoryLocalizationSchemaError) {
    return false;
  }
  if (error instanceof StoryLocalizationConfigurationError) {
    return false;
  }
  if (error && typeof error === "object") {
    const record = error as { readonly retryable?: boolean; readonly status?: number; readonly code?: string };
    if (record.retryable === true) {
      return true;
    }
    if (record.status !== undefined && [408, 409, 425, 429, 500, 502, 503, 504].includes(record.status)) {
      return true;
    }
    if (record.code === "rate_limit_exceeded" || record.code === "timeout") {
      return true;
    }
  }
  return error instanceof StoryLocalizationApiError;
}
