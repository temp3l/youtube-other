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

import { MICRO_033_TASK_ID } from "./en-e001-e003-tts-canary-preflight.js";

export const MICRO_033_OPERATOR_AUTHORIZATION_PROJECTION_KEY =
  "microdrama.operator-authorization.MICRO-033";
export const MICRO_033_ASSET_GENERATION_APPROVAL_PROJECTION_KEY =
  "microdrama.asset-generation-approval.MICRO-033";
export const MICRO_033_SPEECH_CREDENTIAL_PROJECTION_KEY =
  "microdrama.speech-credential.MICRO-033";
export const MICRO_033_COST_BUDGET_APPROVAL_PROJECTION_KEY =
  "microdrama.cost-budget-approval.MICRO-033";

export const MICRO_033_OPERATOR_AUTHORIZATION_ID =
  "auth.micro-033.bounded-canary";
export const MICRO_033_ASSET_GENERATION_APPROVAL_ID =
  "approval.micro-033.asset-generation";
export const MICRO_033_COST_BUDGET_APPROVAL_ID = "cost-budget-approval.micro-033";

export type MicrodramaCostBudgetApprovalRecord = {
  readonly schemaVersion: "mediaforge.microdrama-cost-budget-approval.v1";
  readonly approvalId: string;
  readonly taskId: typeof MICRO_033_TASK_ID;
  readonly costLimitMinor: number;
  readonly currency: "USD";
  readonly maximumProviderRequests: number;
  readonly episodeIds: readonly string[];
  readonly locale: string;
  readonly scriptRevisionIds: readonly string[];
  readonly voiceRevision: string;
  readonly provider: string;
  readonly providerModel: string;
  readonly providerVoiceId: string;
  readonly providerConfigRevision: string;
  readonly approvedAt: string;
  readonly operatorId: string;
};

export function persistMicro033OperatorAuthorization(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: MicrodramaOperatorAuthorizationRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_033_OPERATOR_AUTHORIZATION_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.authorizedAt,
  });
}

export function loadMicro033OperatorAuthorization(
  repository: MicrodramaSQLiteRepository
): MicrodramaOperatorAuthorizationRecord | null {
  const stored = repository.getProjection(MICRO_033_OPERATOR_AUTHORIZATION_PROJECTION_KEY);
  if (!stored) {
    return null;
  }
  return parseMicrodramaOperatorAuthorizationRecord(stored.projection);
}

export function persistMicro033AssetGenerationApproval(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: MicrodramaAssetGenerationApproval;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_033_ASSET_GENERATION_APPROVAL_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.approvedAt,
  });
}

export function loadMicro033AssetGenerationApproval(
  repository: MicrodramaSQLiteRepository
): MicrodramaAssetGenerationApproval | null {
  const stored = repository.getProjection(MICRO_033_ASSET_GENERATION_APPROVAL_PROJECTION_KEY);
  if (!stored) {
    return null;
  }
  return parseMicrodramaAssetGenerationApproval(stored.projection);
}

export function persistMicro033SpeechCredential(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: MicrodramaSpeechCredentialRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_033_SPEECH_CREDENTIAL_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.registeredAt,
  });
}

export function loadMicro033SpeechCredential(
  repository: MicrodramaSQLiteRepository
): MicrodramaSpeechCredentialRecord | null {
  const stored = repository.getProjection(MICRO_033_SPEECH_CREDENTIAL_PROJECTION_KEY);
  if (!stored) {
    return null;
  }
  return parseMicrodramaSpeechCredentialRecord(stored.projection);
}

export function persistMicro033CostBudgetApproval(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: MicrodramaCostBudgetApprovalRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_033_COST_BUDGET_APPROVAL_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.approvedAt,
  });
}

export function loadMicro033CostBudgetApproval(
  repository: MicrodramaSQLiteRepository
): MicrodramaCostBudgetApprovalRecord | null {
  const stored = repository.getProjection(MICRO_033_COST_BUDGET_APPROVAL_PROJECTION_KEY);
  if (!stored) {
    return null;
  }
  return stored.projection as MicrodramaCostBudgetApprovalRecord;
}

export function computeMicro033AuthorizationRevisionId(
  prefix: string,
  payload: unknown
): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");
  return `${prefix}.${digest.slice(0, 16)}`;
}
