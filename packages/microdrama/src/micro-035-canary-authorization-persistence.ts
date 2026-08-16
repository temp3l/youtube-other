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

import { MICRO_035_TASK_ID } from "./de-es-pt-e001-e003-multilingual-canary-preflight.js";

export const MICRO_035_OPERATOR_AUTHORIZATION_PROJECTION_KEY =
  "microdrama.operator-authorization.MICRO-035";
export const MICRO_035_ASSET_GENERATION_APPROVAL_PROJECTION_KEY =
  "microdrama.asset-generation-approval.MICRO-035";
export const MICRO_035_SPEECH_CREDENTIAL_PROJECTION_KEY =
  "microdrama.speech-credential.MICRO-035";
export const MICRO_035_COST_BUDGET_APPROVAL_PROJECTION_KEY =
  "microdrama.cost-budget-approval.MICRO-035";

export const MICRO_035_OPERATOR_AUTHORIZATION_ID =
  "auth.micro-035.bounded-canary";
export const MICRO_035_ASSET_GENERATION_APPROVAL_ID =
  "approval.micro-035.asset-generation";
export const MICRO_035_COST_BUDGET_APPROVAL_ID = "cost-budget-approval.micro-035";

export type MicrodramaMultilingualCostBudgetApprovalRecord = {
  readonly schemaVersion: "mediaforge.microdrama-cost-budget-approval.v1";
  readonly approvalId: string;
  readonly taskId: typeof MICRO_035_TASK_ID;
  readonly costLimitMinor: number;
  readonly currency: "USD";
  readonly maximumProviderRequests: number;
  readonly episodeIds: readonly string[];
  readonly locales: readonly string[];
  readonly scriptRevisionIds: readonly string[];
  readonly sharedVisualRevisionIds: readonly string[];
  readonly visualProfileRevision: string;
  readonly providers: readonly string[];
  readonly providerConfigRevision: string;
  readonly approvedAt: string;
  readonly operatorId: string;
};

export function persistMicro035OperatorAuthorization(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: MicrodramaOperatorAuthorizationRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_035_OPERATOR_AUTHORIZATION_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.authorizedAt,
  });
}

export function loadMicro035OperatorAuthorization(
  repository: MicrodramaSQLiteRepository
): MicrodramaOperatorAuthorizationRecord | null {
  const stored = repository.getProjection(MICRO_035_OPERATOR_AUTHORIZATION_PROJECTION_KEY);
  if (!stored) {
    return null;
  }
  return parseMicrodramaOperatorAuthorizationRecord(stored.projection);
}

export function persistMicro035AssetGenerationApproval(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: MicrodramaAssetGenerationApproval;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_035_ASSET_GENERATION_APPROVAL_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.approvedAt,
  });
}

export function loadMicro035AssetGenerationApproval(
  repository: MicrodramaSQLiteRepository
): MicrodramaAssetGenerationApproval | null {
  const stored = repository.getProjection(MICRO_035_ASSET_GENERATION_APPROVAL_PROJECTION_KEY);
  if (!stored) {
    return null;
  }
  return parseMicrodramaAssetGenerationApproval(stored.projection);
}

export function persistMicro035SpeechCredential(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: MicrodramaSpeechCredentialRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_035_SPEECH_CREDENTIAL_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.registeredAt,
  });
}

export function loadMicro035SpeechCredential(
  repository: MicrodramaSQLiteRepository
): MicrodramaSpeechCredentialRecord | null {
  const stored = repository.getProjection(MICRO_035_SPEECH_CREDENTIAL_PROJECTION_KEY);
  if (!stored) {
    return null;
  }
  return parseMicrodramaSpeechCredentialRecord(stored.projection);
}

export function persistMicro035CostBudgetApproval(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: MicrodramaMultilingualCostBudgetApprovalRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_035_COST_BUDGET_APPROVAL_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.approvedAt,
  });
}

export function loadMicro035CostBudgetApproval(
  repository: MicrodramaSQLiteRepository
): MicrodramaMultilingualCostBudgetApprovalRecord | null {
  const stored = repository.getProjection(MICRO_035_COST_BUDGET_APPROVAL_PROJECTION_KEY);
  if (!stored) {
    return null;
  }
  return stored.projection as MicrodramaMultilingualCostBudgetApprovalRecord;
}

export function computeMicro035AuthorizationRevisionId(
  prefix: string,
  payload: unknown
): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");
  return `${prefix}.${digest.slice(0, 16)}`;
}
