import { createHash } from "node:crypto";

import { computePayloadHash } from "@mediaforge/narrative-core";
import type { MicrodramaSQLiteRepository } from "@mediaforge/persistence";

import { MICRO_042_TASK_ID } from "./micro-042-canary-bindings.js";
import { loadMicro042OperatorAuthorization } from "./micro-042-canary-authorization-persistence.js";

export const MICRO_042_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY =
  "microdrama.explicit-execute-authorization.MICRO-042";

export const MICRO_042_EXPLICIT_EXECUTE_AUTHORIZATION_ID =
  "execute-auth.micro-042.public-video-read-canary";

export type Micro042ExplicitExecuteAuthorizationRecord = {
  readonly schemaVersion: "mediaforge.microdrama-explicit-execute-authorization.v1";
  readonly authorizationId: typeof MICRO_042_EXPLICIT_EXECUTE_AUTHORIZATION_ID;
  readonly taskId: typeof MICRO_042_TASK_ID;
  readonly state: "active";
  readonly preparationFingerprint: string;
  readonly binds: {
    readonly providerAccountId: string;
    readonly publicationId: string;
    readonly providerVideoId: string;
    readonly observationWindow: {
      readonly windowStart: string;
      readonly windowEnd: string;
    };
    readonly requestedMetricSet: readonly string[];
  };
  readonly authorizedAt: string;
  readonly operatorId: string;
};

export function computeMicro042PreparationFingerprint(input: {
  readonly operatorAuthorizationId: string | null;
  readonly micro038EvidenceContentHash: string | null;
  readonly bindingProbe: Record<string, unknown>;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        scope: "micro-042.preparation-fingerprint.v1",
        ...input,
      }),
      "utf8"
    )
    .digest("hex");
}

export function persistMicro042ExplicitExecuteAuthorization(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: Micro042ExplicitExecuteAuthorizationRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_042_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.authorizedAt,
  });
}

export function loadMicro042ExplicitExecuteAuthorization(
  repository: MicrodramaSQLiteRepository
): Micro042ExplicitExecuteAuthorizationRecord | null {
  const stored = repository.getProjection(
    MICRO_042_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY
  );
  if (!stored) {
    return null;
  }
  return stored.projection as Micro042ExplicitExecuteAuthorizationRecord;
}

export function buildMicro042ExplicitExecuteAuthorizationRecord(input: {
  readonly preparationFingerprint: string;
  readonly binds: Micro042ExplicitExecuteAuthorizationRecord["binds"];
  readonly authorizedAt: string;
  readonly operatorId: string;
}): Micro042ExplicitExecuteAuthorizationRecord {
  return {
    schemaVersion: "mediaforge.microdrama-explicit-execute-authorization.v1",
    authorizationId: MICRO_042_EXPLICIT_EXECUTE_AUTHORIZATION_ID,
    taskId: MICRO_042_TASK_ID,
    state: "active",
    preparationFingerprint: input.preparationFingerprint,
    binds: input.binds,
    authorizedAt: input.authorizedAt,
    operatorId: input.operatorId,
  };
}

export function summarizeMicro042PreparationForFingerprint(
  repository: MicrodramaSQLiteRepository,
  input: {
    readonly micro038EvidenceContentHash: string | null;
    readonly bindingProbe: Record<string, unknown>;
  }
): {
  readonly operatorAuthorizationId: string | null;
  readonly micro038EvidenceContentHash: string | null;
  readonly bindingProbe: Record<string, unknown>;
} {
  const operatorAuthorization = loadMicro042OperatorAuthorization(repository);
  return {
    operatorAuthorizationId: operatorAuthorization?.authorizationId ?? null,
    micro038EvidenceContentHash: input.micro038EvidenceContentHash,
    bindingProbe: input.bindingProbe,
  };
}
