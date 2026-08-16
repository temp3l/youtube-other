import { createHash } from "node:crypto";

import { computePayloadHash } from "@mediaforge/narrative-core";
import type { MicrodramaSQLiteRepository } from "@mediaforge/persistence";

import { MICRO_034_TASK_ID } from "./en-e001-e003-visual-canary-preflight.js";
import {
  MICRO_034_CANARY_COST_LIMIT_MINOR,
  MICRO_034_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
  MICRO_034_VISUAL_PROFILE_REVISION,
  MICRO_034_VISUAL_PROVIDERS,
} from "./micro-034-canary-bindings.js";
import {
  loadMicro034AssetGenerationApproval,
  loadMicro034CostBudgetApproval,
  loadMicro034OperatorAuthorization,
} from "./micro-034-canary-authorization-persistence.js";
import { computeMicro033EvidenceContentHash } from "./micro-034-canary-micro-033-evidence.js";
import { loadMicro033CanaryExecutionEvidenceFromProjection } from "./micro-034-canary-micro-033-evidence.js";

export const MICRO_034_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY =
  "microdrama.explicit-execute-authorization.MICRO-034";

export const MICRO_034_EXPLICIT_EXECUTE_AUTHORIZATION_ID =
  "execute-auth.micro-034.bounded-canary";

export type Micro034ExplicitExecuteAuthorizationRecord = {
  readonly schemaVersion: "mediaforge.microdrama-explicit-execute-authorization.v1";
  readonly authorizationId: typeof MICRO_034_EXPLICIT_EXECUTE_AUTHORIZATION_ID;
  readonly taskId: typeof MICRO_034_TASK_ID;
  readonly state: "active";
  readonly preparationFingerprint: string;
  readonly binds: {
    readonly episodeIds: readonly ["e001", "e002", "e003"];
    readonly locale: "en-US";
    readonly scriptRevisionIds: readonly string[];
    readonly visualProfileRevision: typeof MICRO_034_VISUAL_PROFILE_REVISION;
    readonly audioRevisionIds: readonly string[];
    readonly providers: readonly [...typeof MICRO_034_VISUAL_PROVIDERS];
    readonly maximumProviderRequests: number;
    readonly costLimitMinor: number;
  };
  readonly authorizedAt: string;
  readonly operatorId: string;
};

export function computeMicro034PreparationFingerprint(input: {
  readonly operatorAuthorizationId: string | null;
  readonly assetGenerationApprovalId: string | null;
  readonly costBudgetApprovalId: string | null;
  readonly micro033EvidenceContentHash: string | null;
  readonly scriptRevisionIds: readonly string[];
  readonly visualProfileRevision: string;
  readonly providerConfigRevision: string;
  readonly audioRevisionIds: readonly string[];
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        scope: "micro-034.preparation-fingerprint.v1",
        ...input,
      }),
      "utf8"
    )
    .digest("hex");
}

export function persistMicro034ExplicitExecuteAuthorization(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: Micro034ExplicitExecuteAuthorizationRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_034_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.authorizedAt,
  });
}

export function loadMicro034ExplicitExecuteAuthorization(
  repository: MicrodramaSQLiteRepository
): Micro034ExplicitExecuteAuthorizationRecord | null {
  const stored = repository.getProjection(
    MICRO_034_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY
  );
  if (!stored) {
    return null;
  }
  return stored.projection as Micro034ExplicitExecuteAuthorizationRecord;
}

export function buildMicro034ExplicitExecuteAuthorizationRecord(input: {
  readonly preparationFingerprint: string;
  readonly scriptRevisionIds: readonly string[];
  readonly audioRevisionIds: readonly string[];
  readonly authorizedAt: string;
  readonly operatorId: string;
}): Micro034ExplicitExecuteAuthorizationRecord {
  return {
    schemaVersion: "mediaforge.microdrama-explicit-execute-authorization.v1",
    authorizationId: MICRO_034_EXPLICIT_EXECUTE_AUTHORIZATION_ID,
    taskId: MICRO_034_TASK_ID,
    state: "active",
    preparationFingerprint: input.preparationFingerprint,
    binds: {
      episodeIds: ["e001", "e002", "e003"],
      locale: "en-US",
      scriptRevisionIds: [...input.scriptRevisionIds],
      visualProfileRevision: MICRO_034_VISUAL_PROFILE_REVISION,
      audioRevisionIds: [...input.audioRevisionIds],
      providers: [...MICRO_034_VISUAL_PROVIDERS],
      maximumProviderRequests: MICRO_034_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
      costLimitMinor: MICRO_034_CANARY_COST_LIMIT_MINOR,
    },
    authorizedAt: input.authorizedAt,
    operatorId: input.operatorId,
  };
}

export function summarizeMicro034PreparationForFingerprint(
  repository: MicrodramaSQLiteRepository
): {
  readonly operatorAuthorizationId: string | null;
  readonly assetGenerationApprovalId: string | null;
  readonly costBudgetApprovalId: string | null;
  readonly micro033EvidenceContentHash: string | null;
} {
  const operatorAuthorization = loadMicro034OperatorAuthorization(repository);
  const assetGenerationApproval = loadMicro034AssetGenerationApproval(repository);
  const costBudgetApproval = loadMicro034CostBudgetApproval(repository);
  const micro033Evidence = loadMicro033CanaryExecutionEvidenceFromProjection(repository);
  return {
    operatorAuthorizationId: operatorAuthorization?.authorizationId ?? null,
    assetGenerationApprovalId: assetGenerationApproval?.approvalId ?? null,
    costBudgetApprovalId: costBudgetApproval?.approvalId ?? null,
    micro033EvidenceContentHash: micro033Evidence
      ? computeMicro033EvidenceContentHash(micro033Evidence)
      : null,
  };
}
