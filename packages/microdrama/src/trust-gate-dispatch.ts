import {
  evaluateTrustGate,
  type ArtifactIdentity,
  type TrustGateDecision,
} from "@mediaforge/domain";
import { buildRedactedMicrodramaAuditRecord } from "@mediaforge/observability/log-redaction.js";

export type MediaDispatchTrustInput = {
  readonly correlationId: string;
  readonly evaluatedAt: string;
  readonly untrustedPayload?: unknown;
  readonly artifact?: {
    readonly identity: ArtifactIdentity;
    readonly artifactRoot: string;
    readonly observedContentHash?: string;
  };
};

export type PublicationDispatchTrustInput = MediaDispatchTrustInput & {
  readonly signedUrl?: {
    readonly url: string;
    readonly allowedHosts: readonly string[];
    readonly now: string;
    readonly maxTtlSeconds?: number;
  };
};

export type TrustGateDispatchResult = {
  readonly decision: TrustGateDecision;
  readonly auditRecord: Record<string, unknown>;
};

function buildAuditRecord(
  decision: TrustGateDecision,
  payload: Record<string, unknown>
): Record<string, unknown> {
  return buildRedactedMicrodramaAuditRecord({
    correlation: {
      correlationId: decision.correlationId,
    },
    payload: {
      ...payload,
      allowed: decision.allowed,
      issueCodes: decision.issues.map((issue) => issue.code),
    },
  });
}

export function evaluateMediaDispatchTrustGate(
  input: MediaDispatchTrustInput
): TrustGateDispatchResult {
  const decision = evaluateTrustGate({
    correlationId: input.correlationId,
    evaluatedAt: input.evaluatedAt,
    ...(input.untrustedPayload !== undefined
      ? { untrustedPayload: input.untrustedPayload }
      : {}),
    ...(input.artifact ? { artifact: input.artifact } : {}),
  });
  return {
    decision,
    auditRecord: buildAuditRecord(decision, {
      gate: "media_dispatch",
      correlationId: input.correlationId,
    }),
  };
}

export function evaluatePublicationDispatchTrustGate(
  input: PublicationDispatchTrustInput
): TrustGateDispatchResult {
  const decision = evaluateTrustGate({
    correlationId: input.correlationId,
    evaluatedAt: input.evaluatedAt,
    ...(input.untrustedPayload !== undefined
      ? { untrustedPayload: input.untrustedPayload }
      : {}),
    ...(input.artifact ? { artifact: input.artifact } : {}),
    ...(input.signedUrl
      ? {
          signedUrl: {
            url: input.signedUrl.url,
            scope: {
              allowedHosts: [...input.signedUrl.allowedHosts],
              now: input.signedUrl.now,
              maxTtlSeconds: input.signedUrl.maxTtlSeconds ?? 86_400,
            },
          },
        }
      : {}),
  });
  return {
    decision,
    auditRecord: buildAuditRecord(decision, {
      gate: "publication_dispatch",
      correlationId: input.correlationId,
    }),
  };
}

export function assertDispatchTrustGateAllowed(result: TrustGateDispatchResult): void {
  if (!result.decision.allowed) {
    throw new Error(
      result.decision.issues.map((issue) => `${issue.code}: ${issue.message}`).join("; ")
    );
  }
}
