import { describe, expect, it } from "vitest";

import { evaluateMicrodramaBudgetPreflight } from "./microdrama-budget-preflight.js";
import type { MicrodramaBudgetProfile } from "./microdrama-budget-contracts.js";
import {
  evaluateBoundedPaidProviderCanaryPreflight,
} from "./microdrama-canary-preflight-lifecycle.js";
import type { MicrodramaAssetGenerationApproval } from "./microdrama-asset-generation-approval-contracts.js";
import type { MicrodramaOperatorAuthorizationRecord } from "./microdrama-operator-authorization-contracts.js";

const EVALUATED_AT = "2026-08-12T06:00:00.000Z";
const TASK_ID = "MICRO-033";

const bindingProbe = {
  episodeIds: ["E001", "E002", "E003"],
  locale: "en-US",
  scriptRevisionIds: [
    "script.revision.e001.en-us",
    "script.revision.e002.en-us",
    "script.revision.e003.en-us",
  ],
  voiceRevision: "voice-version.narrator.en-us.v1",
  provider: "openai",
  estimatedCostMinor: 360,
};

const readinessGates = [
  { gate: "STORY_SCRIPT_READY", ok: true },
  { gate: "AUDIO_TTS_READY", ok: true },
  { gate: "ASSET_GENERATION_APPROVED", ok: true },
  { gate: "COST_BUDGET_APPROVED", ok: true },
];

function budgetProfiles(): MicrodramaBudgetProfile[] {
  const profile = (
    scopeKind: MicrodramaBudgetProfile["scopeKind"],
    scopeId: string
  ): MicrodramaBudgetProfile => ({
    schemaVersion: "mediaforge.microdrama-budget.v1",
    profileId: `profile.${scopeKind}.${scopeId}`,
    scopeKind,
    scopeId,
    limitMinor: 10_000,
    enforcement: "hard",
    registeredAt: EVALUATED_AT,
  });
  return [
    profile("task", "task.locale-tts"),
    profile("provider", "openai"),
    profile("episode", "e001"),
    profile("locale", "en-us"),
  ];
}

function budgetPreflight() {
  return evaluateMicrodramaBudgetPreflight({
    correlationId: "corr.canary.033",
    workItems: [
      {
        taskId: "task.locale-tts",
        episodeId: "e001",
        locale: "en-US",
        provider: "openai",
        assetType: "tts",
        assetCostScope: "locale_tts",
        revisionId: "audio.revision.e001.en-us",
        estimatedCostMinor: 120,
      },
    ],
    profiles: budgetProfiles(),
    commitments: [],
    evaluatedAt: EVALUATED_AT,
  });
}

function operatorAuthorization(): MicrodramaOperatorAuthorizationRecord {
  return {
    schemaVersion: "mediaforge.microdrama-operator-authorization.v1",
    authorizationId: "auth.micro-033",
    taskId: TASK_ID,
    kind: "BOUNDED_PAID_PROVIDER_EFFECT",
    state: "active",
    bindings: {
      episodeIds: ["E001", "E002", "E003"],
      locale: "en-US",
      scriptRevisionIds: bindingProbe.scriptRevisionIds,
      voiceRevision: bindingProbe.voiceRevision,
      provider: bindingProbe.provider,
      costLimitMinor: 1_000,
    },
    authorizedAt: "2026-08-12T05:00:00.000Z",
    operatorId: "operator.canary",
  };
}

function assetGenerationApproval(): MicrodramaAssetGenerationApproval {
  return {
    schemaVersion: "mediaforge.microdrama-asset-generation-approval.v1",
    approvalId: "approval.micro-033",
    taskId: TASK_ID,
    state: "active",
    scope: {
      episodeIds: ["E001", "E002", "E003"],
      locale: "en-US",
      scriptRevisionIds: bindingProbe.scriptRevisionIds,
      assetKinds: ["tts", "alignment"],
      providers: ["openai"],
      voiceRevision: bindingProbe.voiceRevision,
      costLimitMinor: 1_000,
    },
    approvedAt: "2026-08-12T05:00:00.000Z",
    operatorId: "operator.canary",
  };
}

describe("bounded paid provider canary preflight", () => {
  it("fails closed without operator authorization", () => {
    const result = evaluateBoundedPaidProviderCanaryPreflight({
      taskId: TASK_ID,
      operatorAuthorization: undefined,
      assetGenerationApproval: assetGenerationApproval(),
      readinessGates,
      budgetPreflight: budgetPreflight(),
      bindingProbe,
      requiredAssetKinds: ["tts"],
      permittedCallPolicy: {
        externalCallsAllowed: true,
        paidCallsAllowed: true,
        publicationCallsAllowed: false,
      },
      requestedCallPolicy: {
        externalCallsAllowed: true,
        paidCallsAllowed: true,
        publicationCallsAllowed: false,
      },
      evaluatedAt: EVALUATED_AT,
    });

    expect(result.allowed).toBe(false);
    expect(result.blockReasons).toContain("operator_authorization_missing");
  });

  it("allows preflight when authorization, approval, readiness and budget align", () => {
    const result = evaluateBoundedPaidProviderCanaryPreflight({
      taskId: TASK_ID,
      operatorAuthorization: operatorAuthorization(),
      assetGenerationApproval: assetGenerationApproval(),
      readinessGates,
      budgetPreflight: budgetPreflight(),
      bindingProbe,
      requiredAssetKinds: ["tts"],
      permittedCallPolicy: {
        externalCallsAllowed: true,
        paidCallsAllowed: true,
        publicationCallsAllowed: false,
      },
      requestedCallPolicy: {
        externalCallsAllowed: true,
        paidCallsAllowed: true,
        publicationCallsAllowed: false,
      },
      evaluatedAt: EVALUATED_AT,
    });

    expect(result.allowed).toBe(true);
    expect(result.blockReasons).toEqual([]);
  });

  it("blocks when authorization bindings do not match the requested scope", () => {
    const result = evaluateBoundedPaidProviderCanaryPreflight({
      taskId: TASK_ID,
      operatorAuthorization: {
        ...operatorAuthorization(),
        bindings: {
          ...operatorAuthorization().bindings,
          episodeIds: ["E001"],
        },
      },
      assetGenerationApproval: assetGenerationApproval(),
      readinessGates,
      budgetPreflight: budgetPreflight(),
      bindingProbe,
      requiredAssetKinds: ["tts"],
      permittedCallPolicy: {
        externalCallsAllowed: true,
        paidCallsAllowed: true,
        publicationCallsAllowed: false,
      },
      requestedCallPolicy: {
        externalCallsAllowed: true,
        paidCallsAllowed: true,
        publicationCallsAllowed: false,
      },
      evaluatedAt: EVALUATED_AT,
    });

    expect(result.allowed).toBe(false);
    expect(result.blockReasons).toContain(
      "operator_authorization_binding_mismatch"
    );
  });
});
