import { describe, expect, it } from "vitest";
import { getLanguageProfile } from "./language-profiles.js";
import { validateLocalizationFidelity } from "./localization-fidelity.js";
import type {
  LocalizationAffectEvidence,
  LocalizationHorrorAffectProjection,
} from "./localization-horror-affect-projection.js";
import type {
  CanonicalStoryBeat,
  StoryMechanicsContract,
} from "./story-mechanics.js";

const beats: readonly CanonicalStoryBeat[] = Array.from(
  { length: 10 },
  (_, index) => ({
    id: `beat-${String(index + 1).padStart(3, "0")}`,
    type:
      index === 0
        ? "HOOK"
        : index === 8
          ? "CLIMAX"
          : index === 9
            ? "FINAL_REVERSAL"
            : "EVIDENCE",
    summary: `Scene ${index + 1}`,
    requiredFacts: [],
    requiredCharacters: index === 0 ? ["Clara"] : [],
    mechanicsReferences: [],
  })
);

const mechanics: StoryMechanicsContract = {
  centralThreat: "A voice in the walls",
  supernaturalRule: "Answering the voice lets it enter the next room.",
  ruleEvidence: [
    "The voice moved after Clara answered.",
    "The recorder answered and the locked door opened.",
  ],
  prohibitedActions: ["Do not answer the voice."],
  protagonistGoal: "Clara wants to save her sister.",
  emotionalStake: "Her sister is trapped behind the final door.",
  emotionalCost: "Clara must destroy her sister's last recording.",
  failedResponses: [
    {
      action: "Clara sealed the vent.",
      failure: "The voice moved to the radio.",
      informationRevealed: "Silence, not distance, contains it.",
    },
  ],
  climaxAction: "Clara destroys the recording without answering.",
  climaxRuleConnection: "She uses silence to deny the voice entry.",
  finalConsequence: "Her sister's real voice disappears with the recording.",
};

const affectTransitions = [
  ["primary-question", "question", "question-opened-and-paid-off"],
  ["rule:beat-004", "rule", "rule-established-unchanged"],
  ["response-001", "response", "response-keeps-established-result"],
  ["cost:beat-009", "cost", "cost-paid-by-established-action"],
  ["climax:beat-009", "climax", "climax-uses-established-rule"],
  ["payoff:beat-010", "payoff", "payoff-preserves-accepted-ending"],
] as const;
const affectProjection = {
  schemaVersion: "localization-horror-affect-projection-schema-v1",
  projectionVersion: "localization-horror-affect-projection-v1",
  strategyVersion: "dark-truth-horror-strategy-v1",
  parent: {
    planSchemaVersion: "horror-affect-plan-v1",
    planHash: "a".repeat(64),
    storyIrHash: "b".repeat(64),
    canonicalContractHash: "c".repeat(64),
    mechanicsHash: "d".repeat(64),
    canonicalBeatsHash: "e".repeat(64),
    canonicalFingerprint: "f".repeat(64),
  },
  target: { format: "localized-full", profileId: "dark-truth" },
  semanticIds: {
    questionId: "primary-question",
    ruleId: "rule:beat-004",
    responseIds: ["response-001"],
    costId: "cost:beat-009",
    climaxId: "climax:beat-009",
    payoffId: "payoff:beat-010",
  },
  transitions: affectTransitions.map(
    ([semanticId, kind, invariant], index) => ({
      semanticId,
      kind,
      beatId: `beat-${String(Math.min(index + 1, 10)).padStart(3, "0")}`,
      invariant,
      statement: `Accepted semantic meaning ${semanticId}`,
      dependsOnSemanticIds:
        index === 0 ? [] : [affectTransitions[index - 1]![0]],
      sourceRefs: [`canonical-beat:beat-${String(index + 1).padStart(3, "0")}`],
      reversalSetupBeatIds: [],
    })
  ),
  protectedFacts: [
    {
      id: "accepted-ending",
      kind: "accepted-ending",
      statement: mechanics.finalConsequence,
    },
  ],
  semanticIdsHash: "1".repeat(64),
  projectionHash: "2".repeat(64),
} as LocalizationHorrorAffectProjection;

function affectEvidence(
  overrides: Partial<LocalizationAffectEvidence> = {}
): LocalizationAffectEvidence {
  return {
    projectionVersion: affectProjection.projectionVersion,
    projectionHash: affectProjection.projectionHash,
    parentPlanHash: affectProjection.parent.planHash,
    transitions: affectProjection.transitions.map((transition, index) => ({
      semanticId: transition.semanticId,
      state: "preserved",
      evidenceRefs: [`paragraph:${index + 1}`],
      localizedEvidence: `Eigenständige deutsche Formulierung ${index + 1}`,
    })),
    introducedThreatRuleIds: [],
    introducedSurpriseIds: [],
    introducedImmutableFactIds: [],
    ...overrides,
  };
}

function review(
  localizedNarration: string,
  preservedBeatIds: readonly string[] = beats.map((beat) => beat.id),
  requiredCharacterNames: readonly string[] = ["Clara"],
  affect?: LocalizationAffectEvidence
) {
  return validateLocalizationFidelity({
    sourceNarration: `Clara ${"source horror evidence ".repeat(391)}`,
    localizedNarration,
    sourceProfile: getLanguageProfile("en"),
    localizedProfile: getLanguageProfile("de"),
    requiredCharacterNames,
    canonicalBeats: beats,
    preservedBeatIds,
    mechanicsContract: mechanics,
    localizedMechanics: {
      supernaturalRule:
        "Wer der Stimme antwortet, lässt sie in den nächsten Raum.",
      emotionalCost:
        "Clara muss die letzte Aufnahme ihrer Schwester zerstören.",
      climaxRuleConnection:
        "Sie schweigt und verweigert der Stimme dadurch den Eintritt.",
      finalConsequence:
        "Mit der Aufnahme verschwindet auch die echte Stimme ihrer Schwester.",
    },
    sourceTitle: "The Voice in the Walls",
    localizedMetadata: {
      title: "Die Stimme in den Wänden",
      thumbnailText: "ANTWORTE NICHT",
      seoDescription:
        "Clara hört die Stimme ihrer Schwester hinter einer versiegelten Wand.",
      tags: ["Horror", "Stimme", "Spukhaus"],
      hashtags: ["#Horror"],
      contentDisclosure: "Fiktionalisierte Horrorgeschichte.",
    },
    ...(affect
      ? {
          affectProjection,
          affectEvidence: affect,
        }
      : {}),
  });
}

describe("localization fidelity", () => {
  it("rejects a roughly 340-word localization of a roughly 1176-word source", () => {
    const result = review(`Clara ${"kurzes dunkles wort ".repeat(113)}`);
    expect(result.durationRatio).toBeLessThan(0.4);
    expect(result.issues.map((issue) => issue.code)).toContain(
      "LOCALIZATION_SEVERE_ABRIDGEMENT"
    );
    expect(result.repairStrategy).toBe("FULL_STAGE_REGENERATION");
  });

  it("uses semantic beat IDs instead of paragraph alignment", () => {
    const result = review(
      `Clara ${"öffnete die Tür und sah konkrete Spuren im dunklen Flur. ".repeat(105)}`
    );
    expect(result.sceneCoverageRatio).toBe(1);
    expect(result.missingSceneIds).toEqual([]);
    expect(result.issues.map((issue) => issue.code)).not.toContain(
      "LOCALIZATION_SCENE_COVERAGE_LOW"
    );
  });

  it("rejects correct-length output that omits climax and final mechanics", () => {
    const base = review(
      `Clara ${"öffnete die Tür und sah konkrete Spuren im dunklen Flur. ".repeat(105)}`
    );
    const result = validateLocalizationFidelity({
      sourceNarration: `Clara ${"source horror evidence ".repeat(391)}`,
      localizedNarration: `Clara ${"öffnete die Tür und sah konkrete Spuren im dunklen Flur. ".repeat(105)}`,
      sourceProfile: getLanguageProfile("en"),
      localizedProfile: getLanguageProfile("de"),
      requiredCharacterNames: ["Clara"],
      canonicalBeats: beats,
      preservedBeatIds: base.preservedSceneIds,
      mechanicsContract: mechanics,
      localizedMetadata: {
        title: "Die Stimme",
        thumbnailText: "NICHT ANTWORTEN",
        seoDescription: "Eine lange Beschreibung.",
        tags: ["a", "b", "c"],
        hashtags: ["#Horror"],
        contentDisclosure: "Fiktion.",
      },
    });
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "LOCALIZATION_MECHANICS_MISSING",
        "LOCALIZATION_CLIMAX_MECHANICS_MISSING",
        "LOCALIZATION_FINAL_CONSEQUENCE_MISSING",
      ])
    );
  });

  it("rejects copied English production instructions", () => {
    const result = review(
      `Clara Speak in natural English. ${"öffnete die Tür und sah konkrete Spuren. ".repeat(140)}`
    );
    expect(result.issues.map((issue) => issue.code)).toContain(
      "LOCALIZATION_ENGLISH_INSTRUCTION_LEAKAGE"
    );
  });

  it("recognizes a required multi-word name next to punctuation", () => {
    const result = review(
      `Clara Vale, ${"öffnete die Tür und sah konkrete Spuren im dunklen Flur. ".repeat(105)}`,
      beats.map((beat) => beat.id),
      ["Clara Vale"]
    );
    expect(result.missingCharacters).toEqual([]);
    expect(result.issues.map((issue) => issue.code)).not.toContain(
      "LOCALIZATION_CHARACTER_MISSING"
    );
  });

  it("preserves semantic affect IDs with substantially different localized wording", () => {
    const result = review(
      `Clara ${"Im finsteren Flur folgt aus jedem Schweigen eine neue, konkrete Handlung. ".repeat(105)}`,
      beats.map((beat) => beat.id),
      ["Clara"],
      affectEvidence()
    );
    expect(result.affectCausalityPreserved).toBe(true);
    expect(
      result.issues.filter((issue) => issue.domain === "affect-causality")
    ).toEqual([]);
  });

  it.each([
    {
      name: "missing response",
      evidence: affectEvidence({
        transitions: affectEvidence().transitions.map((transition) =>
          transition.semanticId === "response-001"
            ? { ...transition, state: "missing" as const }
            : transition
        ),
      }),
      code: "LOCALIZATION_AFFECT_RESPONSE_MISSING",
      semanticId: "response-001",
    },
    {
      name: "changed rule",
      evidence: affectEvidence({
        transitions: affectEvidence().transitions.map((transition) =>
          transition.semanticId === "rule:beat-004"
            ? { ...transition, state: "contradicted" as const }
            : transition
        ),
      }),
      code: "LOCALIZATION_AFFECT_RULE_CHANGED",
      semanticId: "rule:beat-004",
    },
    {
      name: "unearned surprise",
      evidence: affectEvidence({
        introducedSurpriseIds: ["surprise:new-ending"],
      }),
      code: "LOCALIZATION_AFFECT_UNEARNED_SURPRISE",
      semanticId: "surprise:new-ending",
    },
    {
      name: "altered payoff",
      evidence: affectEvidence({
        transitions: affectEvidence().transitions.map((transition) =>
          transition.semanticId === "payoff:beat-010"
            ? { ...transition, state: "contradicted" as const }
            : transition
        ),
      }),
      code: "LOCALIZATION_AFFECT_PAYOFF_ALTERED",
      semanticId: "payoff:beat-010",
    },
  ])(
    "rejects $name with owning IDs and evidence",
    ({ evidence, code, semanticId }) => {
      const result = review(
        `Clara ${"Im finsteren Flur folgt aus jedem Schweigen eine neue, konkrete Handlung. ".repeat(105)}`,
        beats.map((beat) => beat.id),
        ["Clara"],
        evidence
      );
      expect(result.affectCausalityPreserved).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code,
          semanticIds: expect.arrayContaining([semanticId]),
          evidenceRefs: expect.any(Array),
        })
      );
    }
  );
});
