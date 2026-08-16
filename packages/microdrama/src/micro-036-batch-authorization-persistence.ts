import { createHash } from "node:crypto";

import type {
  MicrodramaAssetGenerationApproval,
  MicrodramaOperatorAuthorizationRecord,
  MicrodramaSpeechCredentialRecord,
} from "@mediaforge/domain";
import {
  parseMicrodramaAssetGenerationApproval,
  parseMicrodramaOperatorAuthorizationRecord,
  parseMicrodramaSpeechCredentialRecord,
} from "@mediaforge/domain";
import { computePayloadHash } from "@mediaforge/narrative-core";
import type { MicrodramaSQLiteRepository } from "@mediaforge/persistence";

import { MICRO_036_TASK_ID } from "./e004-e010-bounded-batch-preflight.js";

export const MICRO_036_OPERATOR_AUTHORIZATION_PROJECTION_KEY =
  "microdrama.operator-authorization.MICRO-036";
export const MICRO_036_ASSET_GENERATION_APPROVAL_PROJECTION_KEY =
  "microdrama.asset-generation-approval.MICRO-036";
export const MICRO_036_SPEECH_CREDENTIAL_PROJECTION_KEY =
  "microdrama.speech-credential.MICRO-036";
export const MICRO_036_COST_BUDGET_APPROVAL_PROJECTION_KEY =
  "microdrama.cost-budget-approval.MICRO-036";

export const MICRO_036_OPERATOR_AUTHORIZATION_ID =
  "auth.micro-036.bounded-batch";
export const MICRO_036_ASSET_GENERATION_APPROVAL_ID =
  "approval.micro-036.asset-generation";
export const MICRO_036_COST_BUDGET_APPROVAL_ID = "cost-budget-approval.micro-036";

export type MicrodramaBatchCostBudgetApprovalRecord = {
  readonly schemaVersion: "mediaforge.microdrama-cost-budget-approval.v1";
  readonly approvalId: string;
  readonly taskId: typeof MICRO_036_TASK_ID;
  readonly costLimitMinor: number;
  readonly currency: "USD";
  readonly maximumProviderRequests: number;
  readonly episodeIds: readonly string[];
  readonly locales: readonly string[];
  readonly scriptRevisionIds: readonly string[];
  readonly revisionSet: readonly string[];
  readonly visualProfileRevision: string;
  readonly providers: readonly string[];
  readonly providerConfigRevision: string;
  readonly approvedAt: string;
  readonly operatorId: string;
};

export function persistMicro036OperatorAuthorization(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: MicrodramaOperatorAuthorizationRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_036_OPERATOR_AUTHORIZATION_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.authorizedAt,
  });
}

export function loadMicro036OperatorAuthorization(
  repository: MicrodramaSQLiteRepository
): MicrodramaOperatorAuthorizationRecord | null {
  const stored = repository.getProjection(MICRO_036_OPERATOR_AUTHORIZATION_PROJECTION_KEY);
  if (!stored) {
    return null;
  }
  return parseMicrodramaOperatorAuthorizationRecord(stored.projection);
}

export function persistMicro036AssetGenerationApproval(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: MicrodramaAssetGenerationApproval;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_036_ASSET_GENERATION_APPROVAL_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.approvedAt,
  });
}

export function loadMicro036AssetGenerationApproval(
  repository: MicrodramaSQLiteRepository
): MicrodramaAssetGenerationApproval | null {
  const stored = repository.getProjection(MICRO_036_ASSET_GENERATION_APPROVAL_PROJECTION_KEY);
  if (!stored) {
    return null;
  }
  return parseMicrodramaAssetGenerationApproval(stored.projection);
}

export function persistMicro036SpeechCredential(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: MicrodramaSpeechCredentialRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_036_SPEECH_CREDENTIAL_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.registeredAt,
  });
}

export function loadMicro036SpeechCredential(
  repository: MicrodramaSQLiteRepository
): MicrodramaSpeechCredentialRecord | null {
  const stored = repository.getProjection(MICRO_036_SPEECH_CREDENTIAL_PROJECTION_KEY);
  if (!stored) {
    return null;
  }
  return parseMicrodramaSpeechCredentialRecord(stored.projection);
}

export function persistMicro036CostBudgetApproval(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: MicrodramaBatchCostBudgetApprovalRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_036_COST_BUDGET_APPROVAL_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.approvedAt,
  });
}

export function loadMicro036CostBudgetApproval(
  repository: MicrodramaSQLiteRepository
): MicrodramaBatchCostBudgetApprovalRecord | null {
  const stored = repository.getProjection(MICRO_036_COST_BUDGET_APPROVAL_PROJECTION_KEY);
  if (!stored) {
    return null;
  }
  return stored.projection as MicrodramaBatchCostBudgetApprovalRecord;
}

export function computeMicro036AuthorizationRevisionId(
  prefix: string,
  payload: unknown
): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");
  return `${prefix}.${digest.slice(0, 16)}`;
}
