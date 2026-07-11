import { describe, expect, it } from "vitest";
import {
  assertStoryPipelineStage,
  buildProfessionalStoryCacheKey,
  calculateNarrationMetrics,
  detectProfessionalStoryQualityIssues,
  editorialReviewCanProceed,
  validateProfessionalBeatPlan,
  validateProfessionalMechanics,
  type EditorialReview,
  type ProfessionalStoryBeat,
  type ProfessionalStoryMechanics,
} from "./professional-story-contracts.js";

const mechanics: ProfessionalStoryMechanics = {
  centralThreat: "A voice living in the hospital telemetry network",
  supernaturalRule: {
    trigger: "A monitor identifies a visitor's pulse",
    effect: "The corridor rewrites the visitor as a patient",
    strengtheningConditions: [
      "Each successful identification makes the records more complete",
    ],
    limitations: [
      "Without a stable telemetry identity, the corridor cannot retain the visitor",
    ],
    exceptions: [],
  },
  protagonist: {
    goal: "Paul wants to return to his daughter before morning",
    emotionalStake:
      "His daughter will believe he abandoned her as his father abandoned him",
    emotionalCost:
      "Paul destroys the only voicemail containing his daughter's voice",
  },
  evidenceProgression: [
    {
      id: "evidence-1",
      observation: "An empty bed displays Paul's pulse",
      implication: "The ward can identify him without a sensor",
    },
    {
      id: "evidence-2",
      observation: "His badge becomes a patient wristband",
      implication: "Identification changes physical records",
    },
  ],
  failedExperiments: [
    {
      id: "experiment-1",
      question: "Does distance break identification?",
      action: "Paul wheels the monitor into the lift",
      physicalObjects: ["monitor", "lift"],
      observableResult: "The pulse continues on another floor",
      ruleLearned: "Distance does not break an existing identity",
      escalationCaused: "His employee record becomes an admission file",
    },
    {
      id: "experiment-2",
      question: "Does replacing the sensor break identification?",
      action: "Paul swaps the pulse lead for a signal generator",
      physicalObjects: ["pulse lead", "signal generator"],
      observableResult: "The screen prints his name anyway",
      ruleLearned: "The ward follows identity rather than hardware",
      escalationCaused: "Every room begins showing his pulse",
    },
  ],
  climax: {
    protagonistAction: "Paul disconnects the telemetry identity bridge",
    ruleConnection:
      "He removes the stable identity the corridor needs to retain him",
    foreshadowingEvidenceIds: ["evidence-1", "evidence-2"],
    concreteCost: "He destroys his daughter's voicemail stored on the bridge",
    immediateConsequence: "The patient records lose his name",
  },
  finalReveal: {
    concreteImageOrSound: "His badge printer produces a discharge label",
    contradiction: "The label says he only believes he escaped",
    endingConsequence: "The hospital now records his escape as a symptom",
  },
};

function beats(): readonly ProfessionalStoryBeat[] {
  const types: ProfessionalStoryBeat["type"][] = [
    "HOOK",
    "SETUP",
    "WARNING",
    "EXPERIMENT",
    "EVIDENCE",
    "EXPERIMENT",
    "RULE_DISCOVERY",
    "FAILED_RESPONSE",
    "PERSONAL_ESCALATION",
    "EMOTIONAL_DILEMMA",
    "CLIMAX_PREPARATION",
    "CLIMAX",
    "COST",
    "FINAL_REVEAL",
  ];
  return types.map((type, order) => ({
    id: `beat-${String(order + 1).padStart(3, "0")}`,
    order,
    type,
    purpose: `Purpose ${order}`,
    requiredFacts: [],
    requiredCharacters: ["Paul"],
    requiredObjects: type === "EXPERIMENT" ? ["monitor"] : [],
    mechanicsReferences: [],
    visualAnchors:
      type === "EXPERIMENT" ? ["pulse display"] : ["hospital corridor"],
    sensoryAnchors: ["monitor beep"],
    entryState: "Paul is uncertain",
    characterAction: "Paul tests the corridor",
    observableOutcome: "The display changes visibly",
  }));
}

describe("professional story contracts", () => {
  it("validates demonstrated mechanics and catches an unforeshadowed climax", () => {
    expect(validateProfessionalMechanics(mechanics)).toEqual([]);
    expect(
      validateProfessionalMechanics({
        ...mechanics,
        climax: {
          ...mechanics.climax,
          foreshadowingEvidenceIds: ["missing", "evidence-2"],
        },
      }).map((issue) => issue.code)
    ).toContain("UNFORESHADOWED_CLIMAX_MECHANIC");
  });

  it("requires the professional beat architecture and concrete experiments", () => {
    expect(validateProfessionalBeatPlan(beats())).toEqual([]);
    expect(
      validateProfessionalBeatPlan(
        beats().filter((beat) => beat.type !== "EXPERIMENT")
      ).map((issue) => issue.code)
    ).toContain("BEAT_ARCHITECTURE_INCOMPLETE");
  });

  it("rejects meta-writing, generic alternatives, and explanation after a reveal", () => {
    const codes = detectProfessionalStoryQualityIssues(
      "The episode's sound warned the audience. A witness, recording or physical trace confirmed it. The screen revealed his death. This meant the corridor had won."
    ).map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "META_NARRATION",
        "GENERIC_EVIDENCE_REFERENCE",
        "UNRESOLVED_TEMPLATE_ALTERNATIVE",
        "EXPLANATION_AFTER_FINAL_REVEAL",
      ])
    );
  });

  it("calculates metrics from narration rather than claimed metadata", () => {
    const metrics = calculateNarrationMetrics({
      narration: `# Metadata\n\n${"spoken ".repeat(180)}`,
      wordsPerMinute: 180,
      dramaticPauseSeconds: 5,
      targetMinimumSeconds: 60,
      targetMaximumSeconds: 70,
    });
    expect(metrics.wordCount).toBe(181);
    expect(metrics.estimatedTotalSeconds).toBeCloseTo(65.33, 1);
  });

  it("blocks critical editorial issues and pre-English-ready consumers", () => {
    const scores = {
      hook: 9,
      firstTwentySeconds: 9,
      concreteSceneWriting: 9,
      escalation: 9,
      experimentQuality: 9,
      supernaturalRule: 9,
      emotionalStake: 9,
      emotionalCost: 9,
      climax: 9,
      finalReveal: 9,
      narrationNaturalness: 9,
      originality: 9,
    };
    const review: EditorialReview = {
      status: "READY",
      scores,
      issues: [
        {
          code: "META_NARRATION",
          severity: "critical",
          beatIds: ["beat-001"],
          evidence: "The episode",
          repairInstruction: "Write the action.",
        },
      ],
    };
    expect(editorialReviewCanProceed(review)).toBe(false);
    expect(() =>
      assertStoryPipelineStage("ENGLISH_REVIEWED", "ENGLISH_READY")
    ).toThrow(/ENGLISH_READY/u);
    expect(() =>
      assertStoryPipelineStage("ENGLISH_READY", "ENGLISH_READY")
    ).not.toThrow();
  });

  it("versions every editorial input in cache identity", () => {
    const base = {
      sourceContentHash: "source",
      fictionalNameMappingHash: "names",
      factSchemaVersion: "facts-v1",
      mechanicsSchemaVersion: "mechanics-v1",
      beatSchemaVersion: "beats-v1",
      rewritePromptVersion: "rewrite-v1",
      editorialPolicyVersion: "editorial-v1",
      localizationPromptVersion: "locale-v1",
      localizationPolicyVersion: "locale-policy-v1",
      shortPromptVersion: "short-v1",
      shortPolicyVersion: "short-policy-v1",
      localeProfileVersion: "profiles-v1",
      model: "model",
      reasoningEffort: "high",
      generationSettings: { maxTokens: 5000 },
    } as const;
    expect(buildProfessionalStoryCacheKey(base)).not.toBe(
      buildProfessionalStoryCacheKey({
        ...base,
        editorialPolicyVersion: "editorial-v2",
      })
    );
  });
});
