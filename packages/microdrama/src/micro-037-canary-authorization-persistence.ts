import { createHash } from "node:crypto";

import type { MicrodramaOperatorAuthorizationRecord } from "@mediaforge/domain";
import { parseMicrodramaOperatorAuthorizationRecord } from "@mediaforge/domain";
import { computePayloadHash } from "@mediaforge/narrative-core";
import type { MicrodramaSQLiteRepository } from "@mediaforge/persistence";

import {
  buildMicro037PublicationBindingProbe,
  MICRO_037_TASK_ID,
} from "./micro-037-canary-bindings.js";
import type { Micro037RenderBinding } from "./micro-037-canary-micro-035-render-evidence.js";

export const MICRO_037_OPERATOR_AUTHORIZATION_PROJECTION_KEY =
  "microdrama.operator-authorization.MICRO-037";

export const MICRO_037_OPERATOR_AUTHORIZATION_ID =
  "auth.micro-037.private-publication-canary";

export function persistMicro037OperatorAuthorization(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: MicrodramaOperatorAuthorizationRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_037_OPERATOR_AUTHORIZATION_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.authorizedAt,
  });
}

export function loadMicro037OperatorAuthorization(
  repository: MicrodramaSQLiteRepository
): MicrodramaOperatorAuthorizationRecord | null {
  const stored = repository.getProjection(MICRO_037_OPERATOR_AUTHORIZATION_PROJECTION_KEY);
  if (!stored) {
    return null;
  }
  return parseMicrodramaOperatorAuthorizationRecord(stored.projection);
}

export function buildMicro037OperatorAuthorizationRecord(input: {
  readonly renderBinding: Micro037RenderBinding;
  readonly episodeRevisionId: string;
  readonly creatorCapabilityEvidenceRevision: string;
  readonly operatorId: string;
  readonly authorizedAt: string;
}): MicrodramaOperatorAuthorizationRecord {
  const bindings = buildMicro037PublicationBindingProbe({
    renderBinding: input.renderBinding,
    episodeRevisionId: input.episodeRevisionId,
    creatorCapabilityEvidenceRevision: input.creatorCapabilityEvidenceRevision,
    approvalTimestamp: input.authorizedAt,
  });
  return {
    schemaVersion: "mediaforge.microdrama-operator-authorization.v1",
    authorizationId: MICRO_037_OPERATOR_AUTHORIZATION_ID,
    taskId: MICRO_037_TASK_ID,
    kind: "EXACT_PUBLICATION_INTENT",
    state: "active",
    bindings,
    authorizedAt: input.authorizedAt,
    operatorId: input.operatorId,
  };
}

export function computeMicro037AuthorizationRevisionId(
  prefix: string,
  payload: unknown
): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");
  return `${prefix}.${digest.slice(0, 16)}`;
}
