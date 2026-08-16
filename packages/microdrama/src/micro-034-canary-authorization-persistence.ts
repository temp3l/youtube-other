import { createHash } from "node:crypto";

import type {
  MicrodramaAssetGenerationApproval,
  MicrodramaOperatorAuthorizationRecord,
} from "@mediaforge/domain";
import {
  parseMicrodramaAssetGenerationApproval,
  parseMicrodramaOperatorAuthorizationRecord,
} from "@mediaforge/domain";
import { computePayloadHash } from "@mediaforge/narrative-core";
import type { MicrodramaSQLiteRepository } from "@mediaforge/persistence";

import { MICRO_034_TASK_ID } from "./en-e001-e003-visual-canary-preflight.js";

export const MICRO_034_OPERATOR_AUTHORIZATION_PROJECTION_KEY =
  "microdrama.operator-authorization.MICRO-034";
export const MICRO_034_ASSET_GENERATION_APPROVAL_PROJECTION_KEY =
  "microdrama.asset-generation-approval.MICRO-034";
export const MICRO_034_COST_BUDGET_APPROVAL_PROJECTION_KEY =
  "microdrama.cost-budget-approval.MICRO-034";

export const MICRO_034_OPERATOR_AUTHORIZATION_ID =
  "auth.micro-034.bounded-canary";
export const MICRO_034_ASSET_GENERATION_APPROVAL_ID =
  "approval.micro-034.asset-generation";
export const MICRO_034_COST_BUDGET_APPROVAL_ID = "cost-budget-approval.micro-034";

export type MicrodramaVisualCostBudgetApprovalRecord = {
  readonly schemaVersion: "mediaforge.microdrama-cost-budget-approval.v1";
  readonly approvalId: string;
  readonly taskId: typeof MICRO_034_TASK_ID;
  readonly costLimitMinor: number;
  readonly currency: "USD";
  readonly maximumProviderRequests: number;
  readonly episodeIds: readonly string[];
  readonly locale: string;
  readonly scriptRevisionIds: readonly string[];
  readonly visualProfileRevision: string;
  readonly audioRevisionIds: readonly string[];
  readonly providers: readonly string[];
  readonly providerConfigRevision: string;
  readonly approvedAt: string;
  readonly operatorId: string;
};

export function persistMicro034OperatorAuthorization(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: MicrodramaOperatorAuthorizationRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_034_OPERATOR_AUTHORIZATION_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.authorizedAt,
  });
}

export function loadMicro034OperatorAuthorization(
  repository: MicrodramaSQLiteRepository
): MicrodramaOperatorAuthorizationRecord | null {
  const stored = repository.getProjection(MICRO_034_OPERATOR_AUTHORIZATION_PROJECTION_KEY);
  if (!stored) {
    return null;
  }
  return parseMicrodramaOperatorAuthorizationRecord(stored.projection);
}

export function persistMicro034AssetGenerationApproval(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: MicrodramaAssetGenerationApproval;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_034_ASSET_GENERATION_APPROVAL_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.approvedAt,
  });
}

export function loadMicro034AssetGenerationApproval(
  repository: MicrodramaSQLiteRepository
): MicrodramaAssetGenerationApproval | null {
  const stored = repository.getProjection(MICRO_034_ASSET_GENERATION_APPROVAL_PROJECTION_KEY);
  if (!stored) {
    return null;
  }
  return parseMicrodramaAssetGenerationApproval(stored.projection);
}

export function persistMicro034CostBudgetApproval(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: MicrodramaVisualCostBudgetApprovalRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_034_COST_BUDGET_APPROVAL_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.approvedAt,
  });
}

export function loadMicro034CostBudgetApproval(
  repository: MicrodramaSQLiteRepository
): MicrodramaVisualCostBudgetApprovalRecord | null {
  const stored = repository.getProjection(MICRO_034_COST_BUDGET_APPROVAL_PROJECTION_KEY);
  if (!stored) {
    return null;
  }
  return stored.projection as MicrodramaVisualCostBudgetApprovalRecord;
}

export function computeMicro034AuthorizationRevisionId(
  prefix: string,
  payload: unknown
): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");
  return `${prefix}.${digest.slice(0, 16)}`;
}
