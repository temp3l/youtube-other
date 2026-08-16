import type {
  MicrodramaCanaryPreflightResult,
  MicrodramaOperatorAuthorizationRecord,
  TikTokAppAuditReadinessProjection,
} from "@mediaforge/domain";
import {
  evaluateExactReadOnlyProviderCanaryPreflight,
  evaluateTikTokAppAuditOperationAdmission,
} from "@mediaforge/domain";

import {
  buildMicro042ReadOnlyBindingProbe,
  MICRO_042_AUDIT_READY_FIXTURE,
  MICRO_042_CANARY_PROVIDER_VIDEO_ID,
  MICRO_042_CANARY_WORKSPACE_ID,
  MICRO_042_TASK_ID,
} from "./micro-042-canary-bindings.js";
import {
  micro038EvidenceProvesPublicCanaryDone,
  type Micro038PublicCanaryExecutionEvidence,
} from "./micro-042-canary-micro-038-evidence.js";
import { MICRO_050_CANARY_PROVIDER_APP_ID } from "./micro-050-canary-bindings.js";

export type Micro042TikTokPublicVideoReadCanaryPreflightInput = {
  readonly evaluatedAt: string;
  readonly operatorAuthorization?: MicrodramaOperatorAuthorizationRecord;
  readonly micro038Evidence?: Micro038PublicCanaryExecutionEvidence | null;
  readonly appAuditReadiness?: TikTokAppAuditReadinessProjection | null;
  readonly publicationId: string;
};

export type Micro042TikTokPublicVideoReadCanaryPreflightResult = {
  readonly preflight: MicrodramaCanaryPreflightResult;
  readonly bindingProbe: ReturnType<typeof buildMicro042ReadOnlyBindingProbe>;
};

export function evaluateMicro042TikTokPublicVideoReadCanaryPreflight(
  input: Micro042TikTokPublicVideoReadCanaryPreflightInput
): Micro042TikTokPublicVideoReadCanaryPreflightResult {
  const bindingProbe =
    input.operatorAuthorization &&
    "providerAppRevision" in input.operatorAuthorization.bindings
      ? {
          ...input.operatorAuthorization.bindings,
          publicationId:
            input.operatorAuthorization.bindings.publicationId ??
            input.publicationId,
          observationWindow:
            input.operatorAuthorization.bindings.observationWindow ??
            buildMicro042ReadOnlyBindingProbe({
              publicationId: input.publicationId,
            }).observationWindow,
          requestedMetricSet:
            input.operatorAuthorization.bindings.requestedMetricSet ??
            buildMicro042ReadOnlyBindingProbe({
              publicationId: input.publicationId,
            }).requestedMetricSet,
        }
      : buildMicro042ReadOnlyBindingProbe({
          publicationId: input.publicationId,
        });

  const auditAdmission = evaluateTikTokAppAuditOperationAdmission({
    operation: "creator_preflight",
    readiness: input.appAuditReadiness ?? null,
    now: input.evaluatedAt,
  });

  const publicVideoReady =
    micro038EvidenceProvesPublicCanaryDone(input.micro038Evidence ?? null) &&
    input.micro038Evidence?.receiptPublicVideoId ===
      MICRO_042_CANARY_PROVIDER_VIDEO_ID &&
    Boolean(bindingProbe.publicationId) &&
    Boolean(bindingProbe.observationWindow) &&
    (bindingProbe.requestedMetricSet?.length ?? 0) > 0;

  const readinessGates = [
    {
      gate: "TIKTOK_APP_AUDIT_READY",
      ok: auditAdmission.allowed,
      ...(auditAdmission.allowed
        ? {}
        : { message: auditAdmission.message ?? "TikTok app audit blocked." }),
    },
    {
      gate: "TIKTOK_PUBLIC_VIDEO_READ_READY",
      ok: publicVideoReady,
      ...(publicVideoReady
        ? {}
        : {
            message:
              "Public video read requires MICRO-038 public canary evidence, exact publicationId, observation window and metric set.",
          }),
    },
  ];

  const preflight = evaluateExactReadOnlyProviderCanaryPreflight({
    taskId: MICRO_042_TASK_ID,
    operatorAuthorization: input.operatorAuthorization,
    readinessGates,
    bindingProbe,
    permittedCallPolicy: {
      externalCallsAllowed: true,
      paidCallsAllowed: false,
      publicationCallsAllowed: false,
    },
    requestedCallPolicy: {
      externalCallsAllowed: true,
      paidCallsAllowed: false,
      publicationCallsAllowed: false,
    },
    evaluatedAt: input.evaluatedAt,
  });

  return { preflight, bindingProbe };
}

export const MICRO_042_AUDIT_PROBE = {
  workspaceId: MICRO_042_CANARY_WORKSPACE_ID,
  providerAppId: MICRO_050_CANARY_PROVIDER_APP_ID,
  fixture: MICRO_042_AUDIT_READY_FIXTURE,
} as const;
