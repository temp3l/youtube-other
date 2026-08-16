import { createHash } from "node:crypto";

import type { MicrodramaOperatorAuthorizationRecord } from "@mediaforge/domain";
import { parseMicrodramaOperatorAuthorizationRecord } from "@mediaforge/domain";
import { computePayloadHash } from "@mediaforge/narrative-core";
import type { MicrodramaSQLiteRepository } from "@mediaforge/persistence";

import {
  buildMicro038PublicationBindingProbe,
  MICRO_038_TASK_ID,
} from "./micro-038-canary-bindings.js";
import type { Micro038RenderBinding } from "./micro-038-canary-micro-035-render-evidence.js";

export const MICRO_038_OPERATOR_AUTHORIZATION_PROJECTION_KEY =
  "microdrama.operator-authorization.MICRO-038";

export const MICRO_038_OPERATOR_AUTHORIZATION_ID =
  "auth.micro-038.public-publication-canary";

export function persistMicro038OperatorAuthorization(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: MicrodramaOperatorAuthorizationRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_038_OPERATOR_AUTHORIZATION_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.authorizedAt,
  });
}

export function loadMicro038OperatorAuthorization(
  repository: MicrodramaSQLiteRepository
): MicrodramaOperatorAuthorizationRecord | null {
  const stored = repository.getProjection(MICRO_038_OPERATOR_AUTHORIZATION_PROJECTION_KEY);
  if (!stored) {
    return null;
  }
  return parseMicrodramaOperatorAuthorizationRecord(stored.projection);
}

export function buildMicro038OperatorAuthorizationRecord(input: {
  readonly renderBinding: Micro038RenderBinding;
  readonly episodeRevisionId: string;
  readonly creatorCapabilityEvidenceRevision: string;
  readonly operatorId: string;
  readonly authorizedAt: string;
}): MicrodramaOperatorAuthorizationRecord {
  const bindings = buildMicro038PublicationBindingProbe({
    renderBinding: input.renderBinding,
    episodeRevisionId: input.episodeRevisionId,
    creatorCapabilityEvidenceRevision: input.creatorCapabilityEvidenceRevision,
    approvalTimestamp: input.authorizedAt,
  });
  return {
    schemaVersion: "mediaforge.microdrama-operator-authorization.v1",
    authorizationId: MICRO_038_OPERATOR_AUTHORIZATION_ID,
    taskId: MICRO_038_TASK_ID,
    kind: "EXACT_PUBLICATION_INTENT",
    state: "active",
    bindings,
    authorizedAt: input.authorizedAt,
    operatorId: input.operatorId,
  };
}

export function computeMicro038AuthorizationRevisionId(
  prefix: string,
  payload: unknown
): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");
  return `${prefix}.${digest.slice(0, 16)}`;
}
