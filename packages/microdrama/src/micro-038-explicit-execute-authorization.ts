import { createHash } from "node:crypto";

import { computePayloadHash } from "@mediaforge/narrative-core";
import type { MicrodramaSQLiteRepository } from "@mediaforge/persistence";

import { MICRO_038_TASK_ID } from "./micro-038-canary-bindings.js";
import { loadMicro038OperatorAuthorization } from "./micro-038-canary-authorization-persistence.js";

export const MICRO_038_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY =
  "microdrama.explicit-execute-authorization.MICRO-038";

export const MICRO_038_EXPLICIT_EXECUTE_AUTHORIZATION_ID =
  "execute-auth.micro-038.public-publication-canary";

export type Micro038ExplicitExecuteAuthorizationRecord = {
  readonly schemaVersion: "mediaforge.microdrama-explicit-execute-authorization.v1";
  readonly authorizationId: typeof MICRO_038_EXPLICIT_EXECUTE_AUTHORIZATION_ID;
  readonly taskId: typeof MICRO_038_TASK_ID;
  readonly state: "active";
  readonly preparationFingerprint: string;
  readonly binds: {
    readonly providerAccountId: string;
    readonly creatorCapabilityEvidenceRevision: string;
    readonly episodeRevisionId: string;
    readonly locale: string;
    readonly renderHash: string;
    readonly metadataRevision: string;
    readonly privacy: "public";
    readonly consentRevision: string;
    readonly exportApprovalRevision: string;
  };
  readonly authorizedAt: string;
  readonly operatorId: string;
};

export function computeMicro038PreparationFingerprint(input: {
  readonly operatorAuthorizationId: string | null;
  readonly micro050EvidenceContentHash: string | null;
  readonly micro037EvidenceContentHash: string | null;
  readonly micro035EvidenceContentHash: string | null;
  readonly renderHash: string;
  readonly bindingProbe: Record<string, unknown>;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        scope: "micro-038.preparation-fingerprint.v1",
        ...input,
      }),
      "utf8"
    )
    .digest("hex");
}

export function persistMicro038ExplicitExecuteAuthorization(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: Micro038ExplicitExecuteAuthorizationRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_038_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.authorizedAt,
  });
}

export function loadMicro038ExplicitExecuteAuthorization(
  repository: MicrodramaSQLiteRepository
): Micro038ExplicitExecuteAuthorizationRecord | null {
  const stored = repository.getProjection(
    MICRO_038_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY
  );
  if (!stored) {
    return null;
  }
  return stored.projection as Micro038ExplicitExecuteAuthorizationRecord;
}

export function buildMicro038ExplicitExecuteAuthorizationRecord(input: {
  readonly preparationFingerprint: string;
  readonly binds: Micro038ExplicitExecuteAuthorizationRecord["binds"];
  readonly authorizedAt: string;
  readonly operatorId: string;
}): Micro038ExplicitExecuteAuthorizationRecord {
  return {
    schemaVersion: "mediaforge.microdrama-explicit-execute-authorization.v1",
    authorizationId: MICRO_038_EXPLICIT_EXECUTE_AUTHORIZATION_ID,
    taskId: MICRO_038_TASK_ID,
    state: "active",
    preparationFingerprint: input.preparationFingerprint,
    binds: input.binds,
    authorizedAt: input.authorizedAt,
    operatorId: input.operatorId,
  };
}

export function summarizeMicro038PreparationForFingerprint(
  repository: MicrodramaSQLiteRepository,
  input: {
    readonly micro050EvidenceContentHash: string | null;
    readonly micro037EvidenceContentHash: string | null;
    readonly micro035EvidenceContentHash: string | null;
    readonly renderHash: string;
    readonly bindingProbe: Record<string, unknown>;
  }
): {
  readonly operatorAuthorizationId: string | null;
  readonly micro050EvidenceContentHash: string | null;
  readonly micro037EvidenceContentHash: string | null;
  readonly micro035EvidenceContentHash: string | null;
  readonly renderHash: string;
  readonly bindingProbe: Record<string, unknown>;
} {
  const operatorAuthorization = loadMicro038OperatorAuthorization(repository);
  return {
    operatorAuthorizationId: operatorAuthorization?.authorizationId ?? null,
    micro050EvidenceContentHash: input.micro050EvidenceContentHash,
    micro037EvidenceContentHash: input.micro037EvidenceContentHash,
    micro035EvidenceContentHash: input.micro035EvidenceContentHash,
    renderHash: input.renderHash,
    bindingProbe: input.bindingProbe,
  };
}
