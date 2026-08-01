/**
 * The gate lives immediately in front of provider dispatch.  It intentionally
 * has no provider dependency, making the failure deterministic and preventing
 * a request from being created before rights/evidence exists.
 */
export type CreatorMediaPolicyErrorCode =
  | "CREATOR_MEDIA_CONTEXT_REQUIRED"
  | "SYNTHETIC_LIKENESS_BLOCKED";

export class CreatorMediaPolicyError extends Error {
  public constructor(
    public readonly code: CreatorMediaPolicyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CreatorMediaPolicyError";
  }
}

export interface CreatorMediaGenerationRequest {
  /** True for a generated or edited image intended to depict a real creator. */
  readonly syntheticLikeness: boolean;
}

/**
 * Synthetic creator likeness is fail-closed until external rights evidence is
 * recorded.  A profile configuration value cannot bypass this boundary.
 */
export function assertCreatorMediaPolicy(
  request: CreatorMediaGenerationRequest | null | undefined,
): asserts request is CreatorMediaGenerationRequest {
  if (!request) {
    throw new CreatorMediaPolicyError(
      "CREATOR_MEDIA_CONTEXT_REQUIRED",
      "Creator-media context is required before an image provider mutation.",
    );
  }
  if (request.syntheticLikeness) {
    throw new CreatorMediaPolicyError(
      "SYNTHETIC_LIKENESS_BLOCKED",
      "Synthetic creator likeness is blocked pending explicit rights evidence.",
    );
  }
}

/** Executes a provider mutation only after the creator-media policy has passed. */
export async function dispatchCreatorMediaGeneration<T>(input: {
  readonly request: CreatorMediaGenerationRequest;
  readonly dispatch: () => Promise<T>;
}): Promise<T> {
  assertCreatorMediaPolicy(input.request);
  return input.dispatch();
}
