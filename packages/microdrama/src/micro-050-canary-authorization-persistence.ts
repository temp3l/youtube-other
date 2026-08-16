import { createHash } from "node:crypto";

import type { MicrodramaOperatorAuthorizationRecord } from "@mediaforge/domain";
import { parseMicrodramaOperatorAuthorizationRecord } from "@mediaforge/domain";
import { computePayloadHash } from "@mediaforge/narrative-core";
import type { MicrodramaSQLiteRepository } from "@mediaforge/persistence";

import {
  MICRO_050_CANARY_ALLOWED_ENDPOINTS,
  MICRO_050_CANARY_AUTHORIZATION_WINDOW,
  MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
  MICRO_050_CANARY_PROVIDER_APP_REVISION,
  MICRO_050_CANARY_REQUESTED_SCOPES,
  MICRO_050_TASK_ID,
} from "./micro-050-canary-bindings.js";

export const MICRO_050_OPERATOR_AUTHORIZATION_PROJECTION_KEY =
  "microdrama.operator-authorization.MICRO-050";

export const MICRO_050_OPERATOR_AUTHORIZATION_ID =
  "auth.micro-050.oauth-read-canary";

export function persistMicro050OperatorAuthorization(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: MicrodramaOperatorAuthorizationRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_050_OPERATOR_AUTHORIZATION_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.authorizedAt,
  });
}

export function loadMicro050OperatorAuthorization(
  repository: MicrodramaSQLiteRepository
): MicrodramaOperatorAuthorizationRecord | null {
  const stored = repository.getProjection(MICRO_050_OPERATOR_AUTHORIZATION_PROJECTION_KEY);
  if (!stored) {
    return null;
  }
  return parseMicrodramaOperatorAuthorizationRecord(stored.projection);
}

export function buildMicro050OperatorAuthorizationRecord(input: {
  readonly operatorId: string;
  readonly authorizedAt: string;
}): MicrodramaOperatorAuthorizationRecord {
  return {
    schemaVersion: "mediaforge.microdrama-operator-authorization.v1",
    authorizationId: MICRO_050_OPERATOR_AUTHORIZATION_ID,
    taskId: MICRO_050_TASK_ID,
    kind: "EXACT_READ_ONLY_PROVIDER_ACCESS",
    state: "active",
    bindings: {
      providerAppRevision: MICRO_050_CANARY_PROVIDER_APP_REVISION,
      providerAccountId: MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
      requestedScopes: [...MICRO_050_CANARY_REQUESTED_SCOPES],
      allowedEndpoints: [...MICRO_050_CANARY_ALLOWED_ENDPOINTS],
      authorizationWindow: { ...MICRO_050_CANARY_AUTHORIZATION_WINDOW },
    },
    authorizedAt: input.authorizedAt,
    operatorId: input.operatorId,
  };
}

export function computeMicro050AuthorizationRevisionId(
  prefix: string,
  payload: unknown
): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");
  return `${prefix}.${digest.slice(0, 16)}`;
}
