import { createHash } from "node:crypto";

import { computePayloadHash } from "@mediaforge/narrative-core";
import type { MicrodramaSQLiteRepository } from "@mediaforge/persistence";

import { MICRO_037_TASK_ID } from "./micro-037-canary-bindings.js";
import { loadMicro037OperatorAuthorization } from "./micro-037-canary-authorization-persistence.js";

export const MICRO_037_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY =
  "microdrama.explicit-execute-authorization.MICRO-037";

export const MICRO_037_EXPLICIT_EXECUTE_AUTHORIZATION_ID =
  "execute-auth.micro-037.private-publication-canary";

export type Micro037ExplicitExecuteAuthorizationRecord = {
  readonly schemaVersion: "mediaforge.microdrama-explicit-execute-authorization.v1";
  readonly authorizationId: typeof MICRO_037_EXPLICIT_EXECUTE_AUTHORIZATION_ID;
  readonly taskId: typeof MICRO_037_TASK_ID;
  readonly state: "active";
  readonly preparationFingerprint: string;
  readonly binds: {
    readonly providerAccountId: string;
    readonly creatorCapabilityEvidenceRevision: string;
    readonly episodeRevisionId: string;
    readonly locale: string;
    readonly renderHash: string;
    readonly metadataRevision: string;
    readonly privacy: "private";
    readonly consentRevision: string;
    readonly exportApprovalRevision: string;
  };
  readonly authorizedAt: string;
  readonly operatorId: string;
};

export function computeMicro037PreparationFingerprint(input: {
  readonly operatorAuthorizationId: string | null;
  readonly micro050EvidenceContentHash: string | null;
  readonly micro035EvidenceContentHash: string | null;
  readonly renderHash: string;
  readonly bindingProbe: Record<string, unknown>;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        scope: "micro-037.preparation-fingerprint.v1",
        ...input,
      }),
      "utf8"
    )
    .digest("hex");
}

export function persistMicro037ExplicitExecuteAuthorization(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: Micro037ExplicitExecuteAuthorizationRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_037_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.authorizedAt,
  });
}

export function loadMicro037ExplicitExecuteAuthorization(
  repository: MicrodramaSQLiteRepository
): Micro037ExplicitExecuteAuthorizationRecord | null {
  const stored = repository.getProjection(
    MICRO_037_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY
  );
  if (!stored) {
    return null;
  }
  return stored.projection as Micro037ExplicitExecuteAuthorizationRecord;
}

export function buildMicro037ExplicitExecuteAuthorizationRecord(input: {
  readonly preparationFingerprint: string;
  readonly binds: Micro037ExplicitExecuteAuthorizationRecord["binds"];
  readonly authorizedAt: string;
  readonly operatorId: string;
}): Micro037ExplicitExecuteAuthorizationRecord {
  return {
    schemaVersion: "mediaforge.microdrama-explicit-execute-authorization.v1",
    authorizationId: MICRO_037_EXPLICIT_EXECUTE_AUTHORIZATION_ID,
    taskId: MICRO_037_TASK_ID,
    state: "active",
    preparationFingerprint: input.preparationFingerprint,
    binds: input.binds,
    authorizedAt: input.authorizedAt,
    operatorId: input.operatorId,
  };
}

export function summarizeMicro037PreparationForFingerprint(
  repository: MicrodramaSQLiteRepository,
  input: {
    readonly micro050EvidenceContentHash: string | null;
    readonly micro035EvidenceContentHash: string | null;
    readonly renderHash: string;
    readonly bindingProbe: Record<string, unknown>;
  }
): {
  readonly operatorAuthorizationId: string | null;
  readonly micro050EvidenceContentHash: string | null;
  readonly micro035EvidenceContentHash: string | null;
  readonly renderHash: string;
  readonly bindingProbe: Record<string, unknown>;
} {
  const operatorAuthorization = loadMicro037OperatorAuthorization(repository);
  return {
    operatorAuthorizationId: operatorAuthorization?.authorizationId ?? null,
    micro050EvidenceContentHash: input.micro050EvidenceContentHash,
    micro035EvidenceContentHash: input.micro035EvidenceContentHash,
    renderHash: input.renderHash,
    bindingProbe: input.bindingProbe,
  };
}
