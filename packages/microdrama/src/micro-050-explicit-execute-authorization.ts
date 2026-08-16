import { createHash } from "node:crypto";

import { computePayloadHash } from "@mediaforge/narrative-core";
import type { MicrodramaSQLiteRepository } from "@mediaforge/persistence";

import { MICRO_050_TASK_ID } from "./micro-050-canary-bindings.js";
import { loadMicro050OperatorAuthorization } from "./micro-050-canary-authorization-persistence.js";

export const MICRO_050_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY =
  "microdrama.explicit-execute-authorization.MICRO-050";

export const MICRO_050_EXPLICIT_EXECUTE_AUTHORIZATION_ID =
  "execute-auth.micro-050.oauth-read-canary";

export type Micro050ExplicitExecuteAuthorizationRecord = {
  readonly schemaVersion: "mediaforge.microdrama-explicit-execute-authorization.v1";
  readonly authorizationId: typeof MICRO_050_EXPLICIT_EXECUTE_AUTHORIZATION_ID;
  readonly taskId: typeof MICRO_050_TASK_ID;
  readonly state: "active";
  readonly preparationFingerprint: string;
  readonly binds: {
    readonly providerAppRevision: string;
    readonly providerAccountId: string;
    readonly requestedScopes: readonly string[];
    readonly allowedEndpoints: readonly string[];
    readonly authorizationWindow: {
      readonly startAt: string;
      readonly endAt: string;
    };
  };
  readonly authorizedAt: string;
  readonly operatorId: string;
};

export function computeMicro050PreparationFingerprint(input: {
  readonly operatorAuthorizationId: string | null;
  readonly appAuditReadinessProjectionId: string | null;
  readonly providerAppRevision: string;
  readonly providerAccountId: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        scope: "micro-050.preparation-fingerprint.v1",
        ...input,
      }),
      "utf8"
    )
    .digest("hex");
}

export function persistMicro050ExplicitExecuteAuthorization(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: Micro050ExplicitExecuteAuthorizationRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_050_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.authorizedAt,
  });
}

export function loadMicro050ExplicitExecuteAuthorization(
  repository: MicrodramaSQLiteRepository
): Micro050ExplicitExecuteAuthorizationRecord | null {
  const stored = repository.getProjection(
    MICRO_050_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY
  );
  if (!stored) {
    return null;
  }
  return stored.projection as Micro050ExplicitExecuteAuthorizationRecord;
}

export function buildMicro050ExplicitExecuteAuthorizationRecord(input: {
  readonly preparationFingerprint: string;
  readonly providerAppRevision: string;
  readonly providerAccountId: string;
  readonly requestedScopes: readonly string[];
  readonly allowedEndpoints: readonly string[];
  readonly authorizationWindow: {
    readonly startAt: string;
    readonly endAt: string;
  };
  readonly authorizedAt: string;
  readonly operatorId: string;
}): Micro050ExplicitExecuteAuthorizationRecord {
  return {
    schemaVersion: "mediaforge.microdrama-explicit-execute-authorization.v1",
    authorizationId: MICRO_050_EXPLICIT_EXECUTE_AUTHORIZATION_ID,
    taskId: MICRO_050_TASK_ID,
    state: "active",
    preparationFingerprint: input.preparationFingerprint,
    binds: {
      providerAppRevision: input.providerAppRevision,
      providerAccountId: input.providerAccountId,
      requestedScopes: [...input.requestedScopes],
      allowedEndpoints: [...input.allowedEndpoints],
      authorizationWindow: { ...input.authorizationWindow },
    },
    authorizedAt: input.authorizedAt,
    operatorId: input.operatorId,
  };
}

export function summarizeMicro050PreparationForFingerprint(
  repository: MicrodramaSQLiteRepository,
  input: {
    readonly appAuditReadinessProjectionId: string | null;
    readonly providerAppRevision: string;
    readonly providerAccountId: string;
  }
): {
  readonly operatorAuthorizationId: string | null;
  readonly appAuditReadinessProjectionId: string | null;
  readonly providerAppRevision: string;
  readonly providerAccountId: string;
} {
  const operatorAuthorization = loadMicro050OperatorAuthorization(repository);
  return {
    operatorAuthorizationId: operatorAuthorization?.authorizationId ?? null,
    appAuditReadinessProjectionId: input.appAuditReadinessProjectionId,
    providerAppRevision: input.providerAppRevision,
    providerAccountId: input.providerAccountId,
  };
}
