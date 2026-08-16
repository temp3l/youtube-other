import { createHash } from "node:crypto";

import { computePayloadHash } from "@mediaforge/narrative-core";
import type { MicrodramaSQLiteRepository } from "@mediaforge/persistence";

import { MICRO_036_TASK_ID } from "./e004-e010-bounded-batch-preflight.js";
import {
  MICRO_036_BATCH_COST_LIMIT_MINOR,
  MICRO_036_BATCH_EPISODE_IDS,
  MICRO_036_BATCH_LOCALES,
  MICRO_036_BATCH_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
  MICRO_036_PRODUCTION_PROVIDERS,
  MICRO_036_VISUAL_PROFILE_REVISION,
} from "./micro-036-batch-bindings.js";
import {
  loadMicro036AssetGenerationApproval,
  loadMicro036CostBudgetApproval,
  loadMicro036OperatorAuthorization,
  loadMicro036SpeechCredential,
} from "./micro-036-batch-authorization-persistence.js";
import {
  computeMicro035EvidenceContentHash,
  loadMicro035CanaryExecutionEvidenceFromProjection,
} from "./micro-036-batch-micro-035-evidence.js";

export const MICRO_036_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY =
  "microdrama.explicit-execute-authorization.MICRO-036";

export const MICRO_036_EXPLICIT_EXECUTE_AUTHORIZATION_ID =
  "execute-auth.micro-036.bounded-batch";

export type Micro036ExplicitExecuteAuthorizationRecord = {
  readonly schemaVersion: "mediaforge.microdrama-explicit-execute-authorization.v1";
  readonly authorizationId: typeof MICRO_036_EXPLICIT_EXECUTE_AUTHORIZATION_ID;
  readonly taskId: typeof MICRO_036_TASK_ID;
  readonly state: "active";
  readonly preparationFingerprint: string;
  readonly binds: {
    readonly episodeIds: readonly [
      "e004",
      "e005",
      "e006",
      "e007",
      "e008",
      "e009",
      "e010",
    ];
    readonly locales: readonly [...typeof MICRO_036_BATCH_LOCALES];
    readonly scriptRevisionIds: readonly string[];
    readonly revisionSet: readonly string[];
    readonly visualProfileRevision: typeof MICRO_036_VISUAL_PROFILE_REVISION;
    readonly providers: readonly [...typeof MICRO_036_PRODUCTION_PROVIDERS];
    readonly maximumProviderRequests: number;
    readonly costLimitMinor: number;
  };
  readonly authorizedAt: string;
  readonly operatorId: string;
};

export function computeMicro036PreparationFingerprint(input: {
  readonly operatorAuthorizationId: string | null;
  readonly assetGenerationApprovalId: string | null;
  readonly costBudgetApprovalId: string | null;
  readonly speechCredentialHandle: string | null;
  readonly micro035EvidenceContentHash: string | null;
  readonly scriptRevisionIds: readonly string[];
  readonly revisionSet: readonly string[];
  readonly visualProfileRevision: string;
  readonly providerConfigRevision: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        scope: "micro-036.preparation-fingerprint.v1",
        ...input,
      }),
      "utf8"
    )
    .digest("hex");
}

export function persistMicro036ExplicitExecuteAuthorization(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: Micro036ExplicitExecuteAuthorizationRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_036_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.authorizedAt,
  });
}

export function loadMicro036ExplicitExecuteAuthorization(
  repository: MicrodramaSQLiteRepository
): Micro036ExplicitExecuteAuthorizationRecord | null {
  const stored = repository.getProjection(
    MICRO_036_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY
  );
  if (!stored) {
    return null;
  }
  return stored.projection as Micro036ExplicitExecuteAuthorizationRecord;
}

export function buildMicro036ExplicitExecuteAuthorizationRecord(input: {
  readonly preparationFingerprint: string;
  readonly scriptRevisionIds: readonly string[];
  readonly revisionSet: readonly string[];
  readonly authorizedAt: string;
  readonly operatorId: string;
}): Micro036ExplicitExecuteAuthorizationRecord {
  return {
    schemaVersion: "mediaforge.microdrama-explicit-execute-authorization.v1",
    authorizationId: MICRO_036_EXPLICIT_EXECUTE_AUTHORIZATION_ID,
    taskId: MICRO_036_TASK_ID,
    state: "active",
    preparationFingerprint: input.preparationFingerprint,
    binds: {
      episodeIds: ["e004", "e005", "e006", "e007", "e008", "e009", "e010"],
      locales: [...MICRO_036_BATCH_LOCALES],
      scriptRevisionIds: [...input.scriptRevisionIds],
      revisionSet: [...input.revisionSet],
      visualProfileRevision: MICRO_036_VISUAL_PROFILE_REVISION,
      providers: [...MICRO_036_PRODUCTION_PROVIDERS],
      maximumProviderRequests: MICRO_036_BATCH_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
      costLimitMinor: MICRO_036_BATCH_COST_LIMIT_MINOR,
    },
    authorizedAt: input.authorizedAt,
    operatorId: input.operatorId,
  };
}

export function summarizeMicro036PreparationForFingerprint(
  repository: MicrodramaSQLiteRepository
): {
  readonly operatorAuthorizationId: string | null;
  readonly assetGenerationApprovalId: string | null;
  readonly costBudgetApprovalId: string | null;
  readonly speechCredentialHandle: string | null;
  readonly micro035EvidenceContentHash: string | null;
} {
  const operatorAuthorization = loadMicro036OperatorAuthorization(repository);
  const assetGenerationApproval = loadMicro036AssetGenerationApproval(repository);
  const costBudgetApproval = loadMicro036CostBudgetApproval(repository);
  const speechCredential = loadMicro036SpeechCredential(repository);
  const micro035Evidence = loadMicro035CanaryExecutionEvidenceFromProjection(repository);
  return {
    operatorAuthorizationId: operatorAuthorization?.authorizationId ?? null,
    assetGenerationApprovalId: assetGenerationApproval?.approvalId ?? null,
    costBudgetApprovalId: costBudgetApproval?.approvalId ?? null,
    speechCredentialHandle: speechCredential?.credentialHandle ?? null,
    micro035EvidenceContentHash: micro035Evidence
      ? computeMicro035EvidenceContentHash(micro035Evidence)
      : null,
  };
}

export function assertMicro036EpisodeScopeAllowed(episodeId: string): void {
  const normalized = episodeId.toUpperCase();
  if (!/^E\d{3}$/u.test(normalized)) {
    throw new Error(`Invalid episode id: ${episodeId}`);
  }
  if (!(MICRO_036_BATCH_EPISODE_IDS as readonly string[]).includes(normalized)) {
    throw new Error(`Episode ${normalized} is outside bounded batch scope E004-E010`);
  }
}
