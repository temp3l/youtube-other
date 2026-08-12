import { describe, expect, it } from "vitest";

import type {
  MicrodramaAssetGenerationApproval,
  MicrodramaOperatorAuthorizationRecord,
} from "@mediaforge/domain";

import {
  defaultEnTtsCanaryBudgetProfiles,
  defaultV5PackRoot,
  evaluateEnE001E003TtsCanaryPreflight,
  EN_E001_E003_TTS_CANARY_EPISODES,
  MICRO_033_TASK_ID,
} from "./en-e001-e003-tts-canary-preflight.js";

const ADMITTED_AT = "2026-08-12T04:00:00.000Z";
const EVALUATED_AT = "2026-08-12T06:00:00.000Z";

function operatorAuthorization(
  scriptRevisionIds: readonly string[]
): MicrodramaOperatorAuthorizationRecord {
  return {
    schemaVersion: "mediaforge.microdrama-operator-authorization.v1",
    authorizationId: "auth.micro-033",
    taskId: MICRO_033_TASK_ID,
    kind: "BOUNDED_PAID_PROVIDER_EFFECT",
    state: "active",
    bindings: {
      episodeIds: [...EN_E001_E003_TTS_CANARY_EPISODES],
      locale: "en-US",
      scriptRevisionIds: [...scriptRevisionIds],
      voiceRevision: "voice-version.narrator.en-us.v1",
      provider: "openai",
      costLimitMinor: 10_000,
    },
    authorizedAt: "2026-08-12T05:00:00.000Z",
    operatorId: "operator.canary",
  };
}

function assetGenerationApproval(
  scriptRevisionIds: readonly string[]
): MicrodramaAssetGenerationApproval {
  return {
    schemaVersion: "mediaforge.microdrama-asset-generation-approval.v1",
    approvalId: "approval.micro-033",
    taskId: MICRO_033_TASK_ID,
    state: "active",
    scope: {
      episodeIds: [...EN_E001_E003_TTS_CANARY_EPISODES],
      locale: "en-US",
      scriptRevisionIds: [...scriptRevisionIds],
      assetKinds: ["tts", "alignment"],
      providers: ["openai"],
      voiceRevision: "voice-version.narrator.en-us.v1",
      costLimitMinor: 10_000,
    },
    approvedAt: "2026-08-12T05:00:00.000Z",
    operatorId: "operator.canary",
  };
}

describe("EN E001-E003 TTS canary preflight", () => {
  it("blocks without operator authorization even when V5 readiness is satisfied", async () => {
    const { preflight } = await evaluateEnE001E003TtsCanaryPreflight({
      packRoot: defaultV5PackRoot,
      admittedAt: ADMITTED_AT,
      evaluatedAt: EVALUATED_AT,
      profiles: defaultEnTtsCanaryBudgetProfiles(EVALUATED_AT),
    });

    expect(preflight.allowed).toBe(false);
    expect(preflight.blockReasons).toContain("operator_authorization_missing");
    expect(
      preflight.readinessGates.filter((gate) => gate.gate === "AUDIO_TTS_READY")
    ).toHaveLength(3);
    expect(
      preflight.readinessGates.every(
        (gate) => gate.gate !== "AUDIO_TTS_READY" || gate.ok
      )
    ).toBe(true);
  });

  it("allows provider-free preflight when authorization and approvals bind E001-E003", async () => {
    const probe = await evaluateEnE001E003TtsCanaryPreflight({
      packRoot: defaultV5PackRoot,
      admittedAt: ADMITTED_AT,
      evaluatedAt: EVALUATED_AT,
      profiles: defaultEnTtsCanaryBudgetProfiles(EVALUATED_AT),
    });

    const { preflight } = await evaluateEnE001E003TtsCanaryPreflight({
      packRoot: defaultV5PackRoot,
      admittedAt: ADMITTED_AT,
      evaluatedAt: EVALUATED_AT,
      profiles: defaultEnTtsCanaryBudgetProfiles(EVALUATED_AT),
      operatorAuthorization: operatorAuthorization(
        probe.bindingProbe.scriptRevisionIds
      ),
      assetGenerationApproval: assetGenerationApproval(
        probe.bindingProbe.scriptRevisionIds
      ),
    });

    expect(preflight.allowed).toBe(true);
    expect(preflight.blockReasons).toEqual([]);
  });
});
