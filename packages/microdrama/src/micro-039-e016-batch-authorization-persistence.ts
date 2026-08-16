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

import {
  buildMicro039E016BatchBindingProbe,
  MICRO_039_E016_TASK_ID,
} from "./micro-039-e016-batch-bindings.js";

export const MICRO_039_E016_OPERATOR_AUTHORIZATION_PROJECTION_KEY =
  "microdrama.operator-authorization.MICRO-039-E016";
export const MICRO_039_E016_ASSET_GENERATION_APPROVAL_PROJECTION_KEY =
  "microdrama.asset-generation-approval.MICRO-039-E016";
export const MICRO_039_E016_COST_BUDGET_APPROVAL_PROJECTION_KEY =
  "microdrama.cost-budget-approval.MICRO-039-E016";

export const MICRO_039_E016_OPERATOR_AUTHORIZATION_ID =
  "auth.micro-039-e016.progressive-e016-batch";
export const MICRO_039_E016_ASSET_GENERATION_APPROVAL_ID =
  "approval.micro-039-e016.asset-generation";
export const MICRO_039_E016_COST_BUDGET_APPROVAL_ID =
  "cost-budget-approval.micro-039-e016";

export type Micro039E016CostBudgetApprovalRecord = {
  readonly schemaVersion: "mediaforge.microdrama-cost-budget-approval.v1";
  readonly approvalId: string;
  readonly taskId: typeof MICRO_039_E016_TASK_ID;
  readonly costLimitMinor: number;
  readonly currency: "USD";
  readonly maximumProviderRequests: number;
  readonly episodeIds: readonly string[];
  readonly locales: readonly string[];
  readonly revisionSet: readonly string[];
  readonly approvedAt: string;
  readonly operatorId: string;
};

export function persistMicro039E016OperatorAuthorization(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: MicrodramaOperatorAuthorizationRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_039_E016_OPERATOR_AUTHORIZATION_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.authorizedAt,
  });
}

export function loadMicro039E016OperatorAuthorization(
  repository: MicrodramaSQLiteRepository
): MicrodramaOperatorAuthorizationRecord | null {
  const stored = repository.getProjection(MICRO_039_E016_OPERATOR_AUTHORIZATION_PROJECTION_KEY);
  if (!stored) {
    return null;
  }
  return parseMicrodramaOperatorAuthorizationRecord(stored.projection);
}

export function buildMicro039E016OperatorAuthorizationRecord(input: {
  readonly revisionSet: readonly string[];
  readonly operatorId: string;
  readonly authorizedAt: string;
}): MicrodramaOperatorAuthorizationRecord {
  return {
    schemaVersion: "mediaforge.microdrama-operator-authorization.v1",
    authorizationId: MICRO_039_E016_OPERATOR_AUTHORIZATION_ID,
    taskId: MICRO_039_E016_TASK_ID,
    kind: "BOUNDED_PRODUCTION_AND_PUBLICATION_BATCH",
    state: "active",
    bindings: buildMicro039E016BatchBindingProbe({ revisionSet: input.revisionSet }),
    authorizedAt: input.authorizedAt,
    operatorId: input.operatorId,
  };
}

export function persistMicro039E016AssetGenerationApproval(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: MicrodramaAssetGenerationApproval;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_039_E016_ASSET_GENERATION_APPROVAL_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.approvedAt,
  });
}

export function loadMicro039E016AssetGenerationApproval(
  repository: MicrodramaSQLiteRepository
): MicrodramaAssetGenerationApproval | null {
  const stored = repository.getProjection(
    MICRO_039_E016_ASSET_GENERATION_APPROVAL_PROJECTION_KEY
  );
  if (!stored) {
    return null;
  }
  return parseMicrodramaAssetGenerationApproval(stored.projection);
}

export function persistMicro039E016CostBudgetApproval(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: Micro039E016CostBudgetApprovalRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_039_E016_COST_BUDGET_APPROVAL_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.approvedAt,
  });
}

export function loadMicro039E016CostBudgetApproval(
  repository: MicrodramaSQLiteRepository
): Micro039E016CostBudgetApprovalRecord | null {
  const stored = repository.getProjection(MICRO_039_E016_COST_BUDGET_APPROVAL_PROJECTION_KEY);
  if (!stored) {
    return null;
  }
  return stored.projection as Micro039E016CostBudgetApprovalRecord;
}

export function computeMicro039E016AuthorizationRevisionId(
  prefix: string,
  payload: unknown
): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");
  return `${prefix}.${digest.slice(0, 16)}`;
}
