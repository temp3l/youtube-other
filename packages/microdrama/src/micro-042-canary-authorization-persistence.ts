import { createHash } from "node:crypto";

import type { MicrodramaOperatorAuthorizationRecord } from "@mediaforge/domain";
import { parseMicrodramaOperatorAuthorizationRecord } from "@mediaforge/domain";
import { computePayloadHash } from "@mediaforge/narrative-core";
import type { MicrodramaSQLiteRepository } from "@mediaforge/persistence";

import {
  buildMicro042ReadOnlyBindingProbe,
  MICRO_042_TASK_ID,
} from "./micro-042-canary-bindings.js";

export const MICRO_042_OPERATOR_AUTHORIZATION_PROJECTION_KEY =
  "microdrama.operator-authorization.MICRO-042";

export const MICRO_042_OPERATOR_AUTHORIZATION_ID =
  "auth.micro-042.public-video-read-canary";

export function persistMicro042OperatorAuthorization(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: MicrodramaOperatorAuthorizationRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_042_OPERATOR_AUTHORIZATION_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.authorizedAt,
  });
}

export function loadMicro042OperatorAuthorization(
  repository: MicrodramaSQLiteRepository
): MicrodramaOperatorAuthorizationRecord | null {
  const stored = repository.getProjection(
    MICRO_042_OPERATOR_AUTHORIZATION_PROJECTION_KEY
  );
  if (!stored) {
    return null;
  }
  return parseMicrodramaOperatorAuthorizationRecord(stored.projection);
}

export function buildMicro042OperatorAuthorizationRecord(input: {
  readonly operatorId: string;
  readonly authorizedAt: string;
  readonly publicationId: string;
}): MicrodramaOperatorAuthorizationRecord {
  const bindings = buildMicro042ReadOnlyBindingProbe({
    publicationId: input.publicationId,
  });
  return {
    schemaVersion: "mediaforge.microdrama-operator-authorization.v1",
    authorizationId: MICRO_042_OPERATOR_AUTHORIZATION_ID,
    taskId: MICRO_042_TASK_ID,
    kind: "EXACT_READ_ONLY_PROVIDER_ACCESS",
    state: "active",
    bindings,
    authorizedAt: input.authorizedAt,
    operatorId: input.operatorId,
  };
}

export function computeMicro042AuthorizationRevisionId(
  prefix: string,
  payload: unknown
): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");
  return `${prefix}.${digest.slice(0, 16)}`;
}
