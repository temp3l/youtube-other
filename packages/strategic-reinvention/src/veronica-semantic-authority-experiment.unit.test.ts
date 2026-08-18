import { describe, expect, it } from "vitest";
import {
  evaluateVeronicaSemanticExperimentCase,
  summarizeVeronicaSemanticExperiment,
  veronicaSemanticDiagnosticCorpusSchema,
} from "./veronica-semantic-authority-experiment.js";
import {
  VERONICA_SEMANTIC_BEAT_PLAN_SCHEMA_VERSION,
  type VeronicaSemanticResolution,
} from "./veronica-model-semantic-authority.js";

const semanticPlan = {
  schemaVersion: VERONICA_SEMANTIC_BEAT_PLAN_SCHEMA_VERSION,
  semanticIntent: "retained_value" as const,
  subject: "retained margin",
  actionOwner: { type: "abstract" as const, sourceReference: "retained margin" },
  semanticClaims: [
    { claim: "Margin is retained value.", sourceEvidence: "retained margin" },
  ],
  visualStrategies: [
    {
      family: "retained-value-reveal" as const,
      description: "Show the smaller retained value.",
      preservesMeaning: true,
      requiresUnsupportedAction: false,
    },
  ],
  forbiddenInterpretations: [],
  ambiguity: "none" as const,
  abstain: false,
  abstentionReason: null,
};

const diagnosticCase = {
  schemaVersion: "veronica-semantic-diagnostic-case.v1" as const,
  caseId: "retained-control",
  category: "retained-value" as const,
  source: "A small retained margin remains.",
  contextBefore: "",
  contextAfter: "",
  allowedOwnerTypes: ["abstract" as const],
  existingDeterministicResult: {
    status: "BLOCK" as const,
    semanticIntent: null,
    actionOwnerType: null,
    candidateFamilies: ["comparison"],
    classification: "M3 retained-value regression",
  },
  gold: {
    basis: "existing-unit-test" as const,
    expectedIntents: ["retained_value" as const],
    expectedOwnerTypes: ["abstract" as const],
    expectedOutcome: "PASS" as const,
    knownGood: false,
    blockedCase: true,
    acceptedHumanPlan: null,
  },
};

describe("Veronica semantic-authority experiment evaluation", () => {
  it("validates corpus bounds and computes agreement metrics", () => {
    expect(
      veronicaSemanticDiagnosticCorpusSchema.parse({
        schemaVersion: "veronica-semantic-diagnostic-corpus.v1",
        cases: [diagnosticCase],
      }).cases,
    ).toHaveLength(1);
    const resolution: VeronicaSemanticResolution = {
      semanticFingerprint: "a".repeat(64),
      authoritySource: "CURRENT_MODEL_DERIVED_AUTHORITY",
      cacheState: "MISS",
      plan: semanticPlan,
      validation: {
        outcome: "PASS",
        reasons: [],
        groundedClaimCount: 1,
        safeStrategyCount: 1,
        unsupportedStrategyCount: 0,
      },
      artifact: null,
      attempts: 1,
    };
    const result = evaluateVeronicaSemanticExperimentCase({
      diagnosticCase,
      resolution,
    });
    expect(result.finalExperimentalClassification).toBe("AGREEMENT");
    expect(summarizeVeronicaSemanticExperiment([result])).toMatchObject({
      selectedCases: 1,
      semanticFailures: 0,
      blockedCasesImproved: 1,
      deterministicHardGateViolations: 0,
    });
  });
});
