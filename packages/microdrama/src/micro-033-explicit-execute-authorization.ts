import { createHash } from "node:crypto";

import { computePayloadHash } from "@mediaforge/narrative-core";
import type { MicrodramaSQLiteRepository } from "@mediaforge/persistence";

import { MICRO_033_TASK_ID } from "./en-e001-e003-tts-canary-preflight.js";
import {
  MICRO_033_CANARY_COST_LIMIT_MINOR,
  MICRO_033_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
} from "./micro-033-canary-bindings.js";
import {
  loadMicro033AssetGenerationApproval,
  loadMicro033CostBudgetApproval,
  loadMicro033OperatorAuthorization,
  loadMicro033SpeechCredential,
} from "./micro-033-canary-authorization-persistence.js";
import {
  SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
} from "./seven-minutes-ahead-narrator-voice-registry.js";

export const MICRO_033_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY =
  "microdrama.explicit-execute-authorization.MICRO-033";

export const MICRO_033_EXPLICIT_EXECUTE_AUTHORIZATION_ID =
  "execute-auth.micro-033.bounded-canary";

export type Micro033ExplicitExecuteAuthorizationRecord = {
  readonly schemaVersion: "mediaforge.microdrama-explicit-execute-authorization.v1";
  readonly authorizationId: typeof MICRO_033_EXPLICIT_EXECUTE_AUTHORIZATION_ID;
  readonly taskId: typeof MICRO_033_TASK_ID;
  readonly state: "active";
  readonly preparationFingerprint: string;
  readonly binds: {
    readonly episodeIds: readonly ["e001", "e002", "e003"];
    readonly locale: "en-US";
    readonly scriptRevisionIds: readonly string[];
    readonly voiceRevision: string;
    readonly provider: "openai";
    readonly maximumProviderRequests: number;
    readonly costLimitMinor: number;
  };
  readonly authorizedAt: string;
  readonly operatorId: string;
};

export function computeMicro033PreparationFingerprint(input: {
  readonly operatorAuthorizationId: string | null;
  readonly assetGenerationApprovalId: string | null;
  readonly costBudgetApprovalId: string | null;
  readonly credentialHandle: string | null;
  readonly scriptRevisionIds: readonly string[];
  readonly voiceRevision: string;
  readonly providerConfigRevision: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        scope: "micro-033.preparation-fingerprint.v1",
        ...input,
      }),
      "utf8"
    )
    .digest("hex");
}

export function persistMicro033ExplicitExecuteAuthorization(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: Micro033ExplicitExecuteAuthorizationRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_033_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.authorizedAt,
  });
}

export function loadMicro033ExplicitExecuteAuthorization(
  repository: MicrodramaSQLiteRepository
): Micro033ExplicitExecuteAuthorizationRecord | null {
  const stored = repository.getProjection(
    MICRO_033_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY
  );
  if (!stored) {
    return null;
  }
  return stored.projection as Micro033ExplicitExecuteAuthorizationRecord;
}

export function buildMicro033ExplicitExecuteAuthorizationRecord(input: {
  readonly preparationFingerprint: string;
  readonly scriptRevisionIds: readonly string[];
  readonly authorizedAt: string;
  readonly operatorId: string;
}): Micro033ExplicitExecuteAuthorizationRecord {
  return {
    schemaVersion: "mediaforge.microdrama-explicit-execute-authorization.v1",
    authorizationId: MICRO_033_EXPLICIT_EXECUTE_AUTHORIZATION_ID,
    taskId: MICRO_033_TASK_ID,
    state: "active",
    preparationFingerprint: input.preparationFingerprint,
    binds: {
      episodeIds: ["e001", "e002", "e003"],
      locale: "en-US",
      scriptRevisionIds: [...input.scriptRevisionIds],
      voiceRevision: SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
      provider: "openai",
      maximumProviderRequests: MICRO_033_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
      costLimitMinor: MICRO_033_CANARY_COST_LIMIT_MINOR,
    },
    authorizedAt: input.authorizedAt,
    operatorId: input.operatorId,
  };
}

export function summarizeMicro033PreparationForFingerprint(
  repository: MicrodramaSQLiteRepository
): {
  readonly operatorAuthorizationId: string | null;
  readonly assetGenerationApprovalId: string | null;
  readonly costBudgetApprovalId: string | null;
  readonly credentialHandle: string | null;
} {
  const operatorAuthorization = loadMicro033OperatorAuthorization(repository);
  const assetGenerationApproval = loadMicro033AssetGenerationApproval(repository);
  const costBudgetApproval = loadMicro033CostBudgetApproval(repository);
  const speechCredential = loadMicro033SpeechCredential(repository);
  return {
    operatorAuthorizationId: operatorAuthorization?.authorizationId ?? null,
    assetGenerationApprovalId: assetGenerationApproval?.approvalId ?? null,
    costBudgetApprovalId: costBudgetApproval?.approvalId ?? null,
    credentialHandle: speechCredential?.credentialHandle ?? null,
  };
}
