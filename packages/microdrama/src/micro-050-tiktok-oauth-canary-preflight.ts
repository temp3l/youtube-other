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
  MICRO_050_CANARY_ALLOWED_ENDPOINTS,
  MICRO_050_CANARY_AUTHORIZATION_WINDOW,
  MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
  MICRO_050_CANARY_PROVIDER_APP_ID,
  MICRO_050_CANARY_PROVIDER_APP_REVISION,
  MICRO_050_CANARY_REQUESTED_SCOPES,
  MICRO_050_CANARY_WORKSPACE_ID,
  MICRO_050_TASK_ID,
} from "./micro-050-canary-bindings.js";

export type Micro050TikTokOAuthCanaryPreflightInput = {
  readonly evaluatedAt: string;
  readonly operatorAuthorization?: MicrodramaOperatorAuthorizationRecord;
  readonly appAuditReadiness?: TikTokAppAuditReadinessProjection | null;
};

export type Micro050TikTokOAuthCanaryPreflightResult = {
  readonly preflight: MicrodramaCanaryPreflightResult;
};

export function evaluateMicro050TikTokOAuthCanaryPreflight(
  input: Micro050TikTokOAuthCanaryPreflightInput
): Micro050TikTokOAuthCanaryPreflightResult {
  const auditAdmission = evaluateTikTokAppAuditOperationAdmission({
    operation: "live_oauth",
    readiness: input.appAuditReadiness ?? null,
    now: input.evaluatedAt,
  });

  const readinessGates = [
    {
      gate: "TIKTOK_APP_AUDIT_READY",
      ok: auditAdmission.allowed,
      ...(auditAdmission.allowed
        ? {}
        : { message: auditAdmission.message ?? "TikTok app audit readiness blocked." }),
    },
  ];

  const preflight = evaluateExactReadOnlyProviderCanaryPreflight({
    taskId: MICRO_050_TASK_ID,
    operatorAuthorization: input.operatorAuthorization,
    readinessGates,
    bindingProbe: {
      providerAppRevision: MICRO_050_CANARY_PROVIDER_APP_REVISION,
      providerAccountId: MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
      requestedScopes: [...MICRO_050_CANARY_REQUESTED_SCOPES],
      allowedEndpoints: [...MICRO_050_CANARY_ALLOWED_ENDPOINTS],
      authorizationWindow: { ...MICRO_050_CANARY_AUTHORIZATION_WINDOW },
    },
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

  return { preflight };
}

export function micro050AuditReadinessProbe(input: {
  readonly workspaceId?: string;
  readonly providerAppId?: string;
}): {
  readonly workspaceId: string;
  readonly providerAppId: string;
} {
  return {
    workspaceId: input.workspaceId ?? MICRO_050_CANARY_WORKSPACE_ID,
    providerAppId: input.providerAppId ?? MICRO_050_CANARY_PROVIDER_APP_ID,
  };
}
