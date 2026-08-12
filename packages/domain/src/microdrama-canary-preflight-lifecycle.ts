import type { MicrodramaBudgetPreflight } from "./microdrama-budget-contracts.js";
import {
  assetGenerationScopeMatchesProbe,
  evaluateAssetGenerationApprovalAdmission,
} from "./microdrama-asset-generation-approval-lifecycle.js";
import type { MicrodramaAssetGenerationApproval } from "./microdrama-asset-generation-approval-contracts.js";
import {
  type MicrodramaCanaryCallPolicy,
  type MicrodramaCanaryPreflightBlockReason,
  type MicrodramaCanaryPreflightResult,
  type MicrodramaCanaryReadinessGateResult,
  microdramaCanaryPreflightResultSchema,
} from "./microdrama-canary-preflight-contracts.js";
import type { BoundedPaidProviderEffectBindings } from "./microdrama-operator-authorization-contracts.js";
import {
  boundedPaidProviderBindingsMatchProbe,
  evaluateOperatorAuthorizationAdmission,
  type BoundedPaidProviderBindingProbe,
} from "./microdrama-operator-authorization-lifecycle.js";
import type { MicrodramaOperatorAuthorizationRecord } from "./microdrama-operator-authorization-contracts.js";
import type { MicrodramaAssetType } from "./microdrama-budget-contracts.js";

function isCanaryBlockReason(value: string): value is MicrodramaCanaryPreflightBlockReason {
  return (
    value === "operator_authorization_missing" ||
    value === "operator_authorization_stale" ||
    value === "operator_authorization_binding_mismatch" ||
    value === "asset_generation_not_approved" ||
    value === "asset_generation_scope_mismatch" ||
    value === "readiness_gate_blocked" ||
    value === "budget_preflight_blocked" ||
    value === "external_calls_not_permitted" ||
    value === "paid_calls_not_permitted" ||
    value === "publication_calls_not_permitted"
  );
}

function pushReason(
  reasons: MicrodramaCanaryPreflightBlockReason[],
  reason: string | undefined
): void {
  if (reason !== undefined && isCanaryBlockReason(reason)) {
    reasons.push(reason);
  }
}

export function evaluateBoundedPaidProviderCanaryPreflight(input: {
  readonly taskId: string;
  readonly operatorAuthorization: MicrodramaOperatorAuthorizationRecord | undefined;
  readonly assetGenerationApproval: MicrodramaAssetGenerationApproval | undefined;
  readonly readinessGates: readonly MicrodramaCanaryReadinessGateResult[];
  readonly budgetPreflight: MicrodramaBudgetPreflight | undefined;
  readonly bindingProbe: BoundedPaidProviderBindingProbe;
  readonly requiredAssetKinds: readonly MicrodramaAssetType[];
  readonly permittedCallPolicy: MicrodramaCanaryCallPolicy;
  readonly requestedCallPolicy: MicrodramaCanaryCallPolicy;
  readonly evaluatedAt: string;
}): MicrodramaCanaryPreflightResult {
  const blockReasons: MicrodramaCanaryPreflightBlockReason[] = [];

  const authorizationAdmission = evaluateOperatorAuthorizationAdmission({
    authorization: input.operatorAuthorization,
    taskId: input.taskId,
    expectedKind: "BOUNDED_PAID_PROVIDER_EFFECT",
    now: input.evaluatedAt,
  });
  pushReason(blockReasons, authorizationAdmission.reason);

  if (
    input.operatorAuthorization !== undefined &&
    authorizationAdmission.allowed &&
    input.operatorAuthorization.bindings &&
    "episodeIds" in input.operatorAuthorization.bindings
  ) {
    const bindingMatch = boundedPaidProviderBindingsMatchProbe({
      bindings: input.operatorAuthorization.bindings as BoundedPaidProviderEffectBindings,
      probe: input.bindingProbe,
    });
    pushReason(blockReasons, bindingMatch.reason);
  }

  const approvalAdmission = evaluateAssetGenerationApprovalAdmission({
    approval: input.assetGenerationApproval,
    taskId: input.taskId,
    now: input.evaluatedAt,
  });
  pushReason(blockReasons, approvalAdmission.reason);

  if (
    input.assetGenerationApproval !== undefined &&
    approvalAdmission.allowed
  ) {
    const scopeMatch = assetGenerationScopeMatchesProbe({
      scope: input.assetGenerationApproval.scope,
      probe: input.bindingProbe,
      requiredAssetKinds: input.requiredAssetKinds,
    });
    pushReason(blockReasons, scopeMatch.reason);
  }

  for (const gate of input.readinessGates) {
    if (!gate.ok) {
      blockReasons.push("readiness_gate_blocked");
      break;
    }
  }

  if (input.budgetPreflight !== undefined && !input.budgetPreflight.allowed) {
    blockReasons.push("budget_preflight_blocked");
  }

  if (
    input.requestedCallPolicy.externalCallsAllowed &&
    !input.permittedCallPolicy.externalCallsAllowed
  ) {
    blockReasons.push("external_calls_not_permitted");
  }
  if (
    input.requestedCallPolicy.paidCallsAllowed &&
    !input.permittedCallPolicy.paidCallsAllowed
  ) {
    blockReasons.push("paid_calls_not_permitted");
  }
  if (
    input.requestedCallPolicy.publicationCallsAllowed &&
    !input.permittedCallPolicy.publicationCallsAllowed
  ) {
    blockReasons.push("publication_calls_not_permitted");
  }

  const uniqueReasons = [...new Set(blockReasons)];
  const allowed = uniqueReasons.length === 0;

  return microdramaCanaryPreflightResultSchema.parse({
    schemaVersion: "mediaforge.microdrama-canary-preflight.v1",
    taskId: input.taskId,
    allowed,
    blockReasons: uniqueReasons,
    readinessGates: input.readinessGates,
    evaluatedAt: input.evaluatedAt,
    ...(allowed
      ? {}
      : {
          message:
            uniqueReasons[0] === "readiness_gate_blocked"
              ? input.readinessGates.find((gate) => !gate.ok)?.message ??
                "Readiness gate blocked canary preflight."
              : `Canary preflight blocked: ${uniqueReasons.join(", ")}.`,
        }),
  });
}
