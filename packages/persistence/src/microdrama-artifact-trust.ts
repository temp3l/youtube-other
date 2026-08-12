import {
  evaluateTrustGate,
  type ArtifactIdentity,
  type TrustGateIssue,
} from "@mediaforge/domain";

export class MicrodramaArtifactTrustError extends Error {
  public override readonly name = "MicrodramaArtifactTrustError";

  public constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function validateArtifactReferenceForRegistration(input: {
  readonly correlationId: string;
  readonly evaluatedAt: string;
  readonly artifactRoot: string;
  readonly artifactHash: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly storageUri: string;
  readonly observedContentHash?: string;
  readonly untrustedProvenance?: unknown;
}): void {
  const identity: ArtifactIdentity = {
    artifactHash: input.artifactHash,
    mimeType: input.mimeType as ArtifactIdentity["mimeType"],
    byteSize: input.byteSize,
    storageUri: input.storageUri,
  };
  const decision = evaluateTrustGate({
    correlationId: input.correlationId,
    evaluatedAt: input.evaluatedAt,
    ...(input.untrustedProvenance !== undefined
      ? { untrustedPayload: input.untrustedProvenance }
      : {}),
    artifact: {
      identity,
      artifactRoot: input.artifactRoot,
      ...(input.observedContentHash !== undefined
        ? { observedContentHash: input.observedContentHash }
        : {}),
    },
  });
  if (!decision.allowed) {
    const primary = decision.issues[0];
    throw new MicrodramaArtifactTrustError(
      primary?.code ?? "dispatch_blocked",
      decision.issues.map((issue: TrustGateIssue) => issue.message).join("; ")
    );
  }
}
