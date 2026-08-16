import { createHash } from "node:crypto";

import { computePayloadHash } from "@mediaforge/narrative-core";
import type { MicrodramaSQLiteRepository } from "@mediaforge/persistence";

import { MICRO_035_TASK_ID } from "./de-es-pt-e001-e003-multilingual-canary-preflight.js";
import {
  MICRO_035_CANARY_COST_LIMIT_MINOR,
  MICRO_035_CANARY_LOCALES,
  MICRO_035_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
  MICRO_035_PRODUCTION_PROVIDERS,
  MICRO_035_VISUAL_PROFILE_REVISION,
} from "./micro-035-canary-bindings.js";
import {
  loadMicro035AssetGenerationApproval,
  loadMicro035CostBudgetApproval,
  loadMicro035OperatorAuthorization,
  loadMicro035SpeechCredential,
} from "./micro-035-canary-authorization-persistence.js";
import {
  computeMicro034EvidenceContentHash,
  loadMicro034CanaryExecutionEvidenceFromProjection,
} from "./micro-035-canary-micro-034-evidence.js";

export const MICRO_035_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY =
  "microdrama.explicit-execute-authorization.MICRO-035";

export const MICRO_035_EXPLICIT_EXECUTE_AUTHORIZATION_ID =
  "execute-auth.micro-035.bounded-canary";

export type Micro035ExplicitExecuteAuthorizationRecord = {
  readonly schemaVersion: "mediaforge.microdrama-explicit-execute-authorization.v1";
  readonly authorizationId: typeof MICRO_035_EXPLICIT_EXECUTE_AUTHORIZATION_ID;
  readonly taskId: typeof MICRO_035_TASK_ID;
  readonly state: "active";
  readonly preparationFingerprint: string;
  readonly binds: {
    readonly episodeIds: readonly ["e001", "e002", "e003"];
    readonly locales: readonly [...typeof MICRO_035_CANARY_LOCALES];
    readonly scriptRevisionIds: readonly string[];
    readonly sharedVisualRevisionIds: readonly string[];
    readonly visualProfileRevision: typeof MICRO_035_VISUAL_PROFILE_REVISION;
    readonly providers: readonly [...typeof MICRO_035_PRODUCTION_PROVIDERS];
    readonly maximumProviderRequests: number;
    readonly costLimitMinor: number;
  };
  readonly authorizedAt: string;
  readonly operatorId: string;
};

export function computeMicro035PreparationFingerprint(input: {
  readonly operatorAuthorizationId: string | null;
  readonly assetGenerationApprovalId: string | null;
  readonly costBudgetApprovalId: string | null;
  readonly speechCredentialHandle: string | null;
  readonly micro034EvidenceContentHash: string | null;
  readonly scriptRevisionIds: readonly string[];
  readonly sharedVisualRevisionIds: readonly string[];
  readonly visualProfileRevision: string;
  readonly providerConfigRevision: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        scope: "micro-035.preparation-fingerprint.v1",
        ...input,
      }),
      "utf8"
    )
    .digest("hex");
}

export function persistMicro035ExplicitExecuteAuthorization(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: Micro035ExplicitExecuteAuthorizationRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_035_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.authorizedAt,
  });
}

export function loadMicro035ExplicitExecuteAuthorization(
  repository: MicrodramaSQLiteRepository
): Micro035ExplicitExecuteAuthorizationRecord | null {
  const stored = repository.getProjection(
    MICRO_035_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY
  );
  if (!stored) {
    return null;
  }
  return stored.projection as Micro035ExplicitExecuteAuthorizationRecord;
}

export function buildMicro035ExplicitExecuteAuthorizationRecord(input: {
  readonly preparationFingerprint: string;
  readonly scriptRevisionIds: readonly string[];
  readonly sharedVisualRevisionIds: readonly string[];
  readonly authorizedAt: string;
  readonly operatorId: string;
}): Micro035ExplicitExecuteAuthorizationRecord {
  return {
    schemaVersion: "mediaforge.microdrama-explicit-execute-authorization.v1",
    authorizationId: MICRO_035_EXPLICIT_EXECUTE_AUTHORIZATION_ID,
    taskId: MICRO_035_TASK_ID,
    state: "active",
    preparationFingerprint: input.preparationFingerprint,
    binds: {
      episodeIds: ["e001", "e002", "e003"],
      locales: [...MICRO_035_CANARY_LOCALES],
      scriptRevisionIds: [...input.scriptRevisionIds],
      sharedVisualRevisionIds: [...input.sharedVisualRevisionIds],
      visualProfileRevision: MICRO_035_VISUAL_PROFILE_REVISION,
      providers: [...MICRO_035_PRODUCTION_PROVIDERS],
      maximumProviderRequests: MICRO_035_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
      costLimitMinor: MICRO_035_CANARY_COST_LIMIT_MINOR,
    },
    authorizedAt: input.authorizedAt,
    operatorId: input.operatorId,
  };
}

export function summarizeMicro035PreparationForFingerprint(
  repository: MicrodramaSQLiteRepository
): {
  readonly operatorAuthorizationId: string | null;
  readonly assetGenerationApprovalId: string | null;
  readonly costBudgetApprovalId: string | null;
  readonly speechCredentialHandle: string | null;
  readonly micro034EvidenceContentHash: string | null;
} {
  const operatorAuthorization = loadMicro035OperatorAuthorization(repository);
  const assetGenerationApproval = loadMicro035AssetGenerationApproval(repository);
  const costBudgetApproval = loadMicro035CostBudgetApproval(repository);
  const speechCredential = loadMicro035SpeechCredential(repository);
  const micro034Evidence = loadMicro034CanaryExecutionEvidenceFromProjection(repository);
  return {
    operatorAuthorizationId: operatorAuthorization?.authorizationId ?? null,
    assetGenerationApprovalId: assetGenerationApproval?.approvalId ?? null,
    costBudgetApprovalId: costBudgetApproval?.approvalId ?? null,
    speechCredentialHandle: speechCredential?.credentialHandle ?? null,
    micro034EvidenceContentHash: micro034Evidence
      ? computeMicro034EvidenceContentHash(micro034Evidence)
      : null,
  };
}
