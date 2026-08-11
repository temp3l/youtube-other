import { describe, expect, it } from "vitest";
import type {
  PlannedScene,
  PositioningVisualPlanV2,
  PositioningVisualTreatment,
} from "./positioning-visual-contracts.js";
import {
  FixtureEpisodeSequenceJudge,
  FixtureSemanticRemediationAdvisor,
  FixtureSourceGroundedSceneJudge,
  InMemorySourceGroundedVisualQaCache,
  SOURCE_GROUNDED_REMEDIATION_SCHEMA_VERSION,
  SOURCE_GROUNDED_SCENE_JUDGE_SCHEMA_VERSION,
  runSourceGroundedVisualQaController,
  sourceGroundedPassJudgement,
  sourceGroundedPassSequence,
  type SourceGroundedSceneJudgement,
  type SourceGroundedVisualQaPolicy,
} from "./source-grounded-visual-qa.js";
import { sourceGroundedQaExecutionPolicy } from "./source-grounded-qa-scheduler.js";
import {
  applyVeronicaSourceGroundedRemediationDirectives,
  rebuildVeronicaFinalTreatmentState,
} from "./veronica-pre-image-semantic-gate.js";

function treatment(sceneId: string, action: string): PositioningVisualTreatment {
  return {
    treatmentId: `${sceneId}-treatment`,
    sceneId,
    progressionStage: "EXPLANATION",
    narrativeBeat: action,
    communicationIntent: "explain-causality",
    strategy: "evidence-proof",
    subjectRequirement: "professional and buyer",
    environment: "buyer proof-review wall",
    composition: "title badge beside proof cards",
    camera: "documentary eye-level",
    lighting: "daylight",
    action,
    actionOwnerRole: "buyer",
    props: ["title badge", "proof cards"],
    motionOpportunities: ["slow-push"],
    diagram: null,
    grammar: {
      strategy: "evidence-proof",
      subjectArchetype: "professional and buyer",
      environment: "buyer proof-review wall",
      composition: "title badge beside proof cards",
      camera: "documentary eye-level",
      props: ["title badge", "proof cards"],
      topology: "none",
      semanticTokens: ["buyer", "proof"],
      continuityIdentityId: null,
    },
    viewerVisibleFingerprint: {
      strategyFamily: "evidence-proof",
      subjectArchetype: "professional and buyer",
      environmentArchetype: "buyer proof-review wall",
      compositionArchetype: "proof comparison",
      cameraArchetype: "documentary eye-level",
      lightingArchetype: "daylight",
      actionArchetype: action,
      dominantObjectArchetype: "proof cards",
      motionArchetype: "slow-push",
    },
    treatmentHash: "a".repeat(64),
  };
}

function scene(sceneId: string, narration: string, action: string): PlannedScene {
  return {
    sceneId,
    progressionStage: "EXPLANATION",
    narrationAnchor: narration,
    startMs: sceneId === "generic-remediation-target" ? 0 : 5_000,
    durationMs: 5_000,
    treatment: treatment(sceneId, action),
    assetId: `${sceneId}-asset`,
    eventIds: [],
    overlayKey: sceneId,
    visibleThesis: "A buyer inspects proof and establishes expertise.",
    newInformation: "Buyer proof inspection establishes expertise.",
    narrativeFunction: "explain",
    visualFamily: "evidence-proof",
  };
}

describe("source-grounded remediation propagation", () => {
  it("rebuilds only the targeted semantic lineage before rejudge and sequence QA", async () => {
    const targetNarration = "Doing substantive professional work develops actual expertise. External recognition of that expertise is a separate problem.";
    const unaffectedNarration = "A buyer selects the option with the clearest relevant signal.";
    const sourcePlan = {
      contentId: "generic-remediation-fixture",
      plannerVersion: "fixture",
      format: "short",
      aspectRatio: "9:16",
      scenes: [
        scene("generic-remediation-target", targetNarration, "a buyer inspects proof and decides that the professional is an expert"),
        scene("unaffected-passing-scene", unaffectedNarration, "a buyer selects the option with the clearest relevant signal"),
      ],
      assets: [],
      planHash: "b".repeat(64),
      semanticPlanCacheKey: "c".repeat(64),
    } as PositioningVisualPlanV2;
    const sceneTimings = [
      { id: "generic-remediation-target", timing: { startSeconds: 0, endSeconds: 5 } },
      { id: "unaffected-passing-scene", timing: { startSeconds: 5, endSeconds: 10 } },
    ];
    const narrationByScene = [targetNarration, unaffectedNarration];
    const canonical = rebuildVeronicaFinalTreatmentState({
      plan: sourcePlan,
      sceneTimings,
      narrationByScene,
    });
    const blocked: SourceGroundedSceneJudgement = {
      schemaVersion: SOURCE_GROUNDED_SCENE_JUDGE_SCHEMA_VERSION,
      sourceFidelity: "FAIL",
      actorCorrect: false,
      actionOwnerCorrect: false,
      causalDirectionCorrect: false,
      polarityCorrect: true,
      stateRolesCorrect: false,
      visualMechanismGrounded: false,
      providerPromptDepictsNarration: false,
      renderableUnderConstraints: true,
      informationCoverage: "PARTIAL",
      verdict: "BLOCK",
      defectCodes: [
        "ACTION_OWNER_INVERSION",
        "CAUSAL_INVERSION",
        "STATE_ROLE_INVERSION",
        "STALE_VISUAL_MECHANISM",
      ],
      earliestFaultBoundary: "SEMANTIC_EXTRACTION",
      remediationRoute: "REBUILD_SEMANTICS",
      expectedSourceSemantics: {
        actorRole: "professional",
        actionOwner: "professional through their work",
        causalDirection: "professional work develops actual expertise; external recognition remains a separate problem",
        polarity: "NEUTRAL",
        requiredDomainObjects: [
          "substantive work process",
          "expert work result",
          "separate external observer",
        ],
        requiredVisibleEvidence: [
          "professional performs substantive work",
          "clear distinction between producing expertise and making it perceptible",
        ],
      },
      reason: "Buyer proof evaluation inverted professional-owned work and external recognition.",
    };
    const judge = new FixtureSourceGroundedSceneJudge((payload) => {
      if (payload.sceneId === "unaffected-passing-scene") return sourceGroundedPassJudgement();
      return payload.semantic.actorRole === "expert"
        && payload.semantic.actionOwner === "expert"
        && payload.semantic.visualMechanism === "work-expertise-separation"
        && /^the professional performs substantive work/iu.test(payload.treatment.action ?? "")
        && !/buyer inspects proof|title badge/iu.test(payload.providerPrompt)
        ? sourceGroundedPassJudgement("The corrected professional-owned work and separate recognition state are preserved.")
        : blocked;
    });
    const policy: SourceGroundedVisualQaPolicy = {
      enabled: true,
      policyIdentity: "generic-semantic-remediation-fixture.v1",
      sceneJudge: { model: "fixture-primary", reasoningEffort: "low" },
      escalation: { model: "fixture-escalation", reasoningEffort: "medium" },
      remediationAdvisor: { model: "fixture-advisor", reasoningEffort: "medium" },
      sequenceJudge: { model: "fixture-sequence", reasoningEffort: "low" },
      maxRemediationRounds: 1,
      remediateReview: true,
      execution: sourceGroundedQaExecutionPolicy("INTERACTIVE", {
        providerMode: "FIXTURE",
      }),
    };
    const advisor = new FixtureSemanticRemediationAdvisor({
      "generic-remediation-target": {
        schemaVersion: SOURCE_GROUNDED_REMEDIATION_SCHEMA_VERSION,
        repairBoundary: "SEMANTIC_EXTRACTION",
        visualMechanism: "work-expertise-separation",
        actionOwnerRole: "expert",
        sourceSemantics: {
          actorRole: "professional",
          actionOwner: "professional through their work",
          causalDirection: "professional work develops actual expertise; external recognition remains a separate problem",
          polarity: "NEUTRAL",
        },
        requiredVisibleEvidence: [
          "professional performs substantive work",
          "actual expertise remains distinct from external recognition",
        ],
        requiredDomainObjects: [
          "substantive work process",
          "expert work result",
          "separate external observer",
        ],
        forbiddenMisinterpretations: [
          "buyer proof evaluation establishes expertise",
        ],
        reason: "Restore professional-owned work and separate recognition.",
      },
    });
    const result = await runSourceGroundedVisualQaController({
      plan: canonical,
      narrationByScene,
      policy,
      primaryJudge: judge,
      remediationAdvisor: advisor,
      sequenceJudge: new FixtureEpisodeSequenceJudge(sourceGroundedPassSequence()),
      cache: new InMemorySourceGroundedVisualQaCache(),
      regenerate: async ({ plan, directives, round }) => rebuildVeronicaFinalTreatmentState({
        plan: applyVeronicaSourceGroundedRemediationDirectives({
          plan,
          directives,
          narrationByScene,
          round,
        }),
        sceneTimings,
        narrationByScene,
      }),
    });

    expect(judge.calls.filter((call) => call.sceneId === "generic-remediation-target")).toHaveLength(2);
    expect(advisor.calls).toHaveLength(1);
    expect(judge.calls.filter((call) => call.sceneId === "unaffected-passing-scene")).toHaveLength(1);
    expect(result.plan.scenes[0]?.semanticProposition?.visualMechanism).toBe("work-expertise-separation");
    expect(result.qa.remediationHistory[0]?.directive?.visualMechanism).toBe("work-expertise-separation");
    expect(result.plan.scenes[0]?.treatment.actionOwnerRole).toBe("expert");
    expect(result.qa.scenes.map((entry) => entry.judgement.verdict)).toEqual(["PASS", "PASS"]);
    expect(result.qa.sequence.verdict).toBe("PASS");
    expect(result.qa.sourceFidelityReady).toBe(true);
    expect(result.qa.aggregate.scenesRejudged).toBe(1);
  });
});
