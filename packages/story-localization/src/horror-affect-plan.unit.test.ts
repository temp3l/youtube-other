import { describe, expect, it } from "vitest";
import type { CanonicalStoryContract } from "./canonical-story-contract.js";
import {
  buildHorrorAffectPlan,
  validateHorrorAffectPlan,
  type HorrorAffectPlan,
} from "./horror-affect-plan.js";
import type { StoryIR } from "./story-artifact-model.js";
import type {
  CanonicalStoryBeat,
  StoryMechanicsContract,
} from "./story-mechanics.js";

const storyIr: StoryIR = {
  genre: "fictional-supernatural",
  fictionality: "fiction",
  narrativeMode: "character-led",
  entities: [
    {
      id: "character-mara",
      name: "Mara Vale",
      type: "person",
      narrativeRole: "protagonist",
    },
    {
      id: "location-flat",
      name: "Mara's flat",
      type: "location",
      narrativeRole: "setting",
    },
  ],
  immutableFacts: [
    {
      id: "ending",
      statement: "The voice remains in Mara's phone.",
      confidence: "confirmed",
      immutable: true,
    },
  ],
  chronology: [
    "Mara hears her own voice calling from a disconnected phone.",
    "Mara locks the phone in a steel box, but it calls from inside.",
    "Mara destroys the phone and hears herself answer from the hallway.",
  ],
  centralThreat: {
    type: "supernatural",
    description: "a voice that copies Mara",
    intelligent: true,
  },
  centralRuleMechanism: {
    description: "Answering lets the voice move to the nearest speaker.",
    supernatural: true,
  },
  criticalObjects: [
    {
      id: "phone",
      name: "disconnected phone",
      narrativeFunction: "carries the voice",
    },
  ],
  writtenMessages: [],
  climax: "Mara destroys the phone instead of answering it.",
  endingConsequence: "Mara's copied voice answers from the hallway.",
  allowedInventionBoundaries: {
    dialogue: true,
    internalThoughts: true,
    connectiveDetails: true,
    motives: false,
    undocumentedActions: false,
  },
};

const mechanics: StoryMechanicsContract = {
  centralThreat: "a voice that copies Mara",
  supernaturalMechanics: {
    trigger: "Mara answers the disconnected phone.",
    activationEffect: "The voice moves to the nearest working speaker.",
    interactionRequirement: "A person must answer the voice.",
    cost: "Mara loses ownership of her own voice.",
    endingInteraction: "Mara destroys the disconnected phone.",
    exceptions: [],
    limits: ["The voice can move only after someone answers."],
    threatCapabilities: ["The voice can copy Mara and move between speakers."],
    climaxUse: "Mara destroys the phone without answering.",
  },
  supernaturalRule:
    "Answering lets the voice move to the nearest working speaker.",
  ruleEvidence: [
    "The disconnected phone rings only after Mara speaks.",
    "The steel box begins speaking after Mara answers.",
  ],
  prohibitedActions: ["Do not answer the copied voice."],
  protagonistGoal: "Keep the copied voice from reaching her sister.",
  emotionalStake: "Mara promised her sister she would answer every call.",
  emotionalCost:
    "Mara must refuse her sister's real call to contain the voice.",
  failedResponses: [
    {
      action: "Mara locks the phone in a steel box.",
      failure: "The phone continues calling from inside the box.",
      informationRevealed: "Physical barriers do not stop the copied voice.",
    },
  ],
  climaxAction: "Mara destroys the phone without answering.",
  climaxRuleConnection:
    "Destroying the phone avoids the answer that lets the voice migrate.",
  finalConsequence: "Mara's copied voice answers from the hallway.",
};

const beats: readonly CanonicalStoryBeat[] = [
  {
    id: "beat-001",
    type: "HOOK",
    summary: "Mara's disconnected phone rings in her own voice.",
    requiredFacts: ["disconnected phone"],
    requiredCharacters: ["Mara Vale"],
    mechanicsReferences: [],
  },
  {
    id: "beat-002",
    type: "RULE_DISCOVERY",
    summary:
      "Mara answers once and the same voice immediately moves to the kitchen speaker.",
    requiredFacts: ["disconnected phone"],
    requiredCharacters: ["Mara Vale"],
    mechanicsReferences: [
      "Answering lets the voice move to the nearest working speaker.",
    ],
  },
  {
    id: "beat-003",
    type: "FAILED_RESPONSE",
    summary:
      "Mara locks the phone in a steel box, but the box begins calling in her voice.",
    requiredFacts: ["steel box"],
    requiredCharacters: ["Mara Vale"],
    mechanicsReferences: [],
  },
  {
    id: "beat-004",
    type: "CLIMAX",
    summary:
      "Mara destroys the phone without answering and refuses her sister's call.",
    requiredFacts: ["disconnected phone"],
    requiredCharacters: ["Mara Vale"],
    mechanicsReferences: [
      "Answering lets the voice move to the nearest working speaker.",
    ],
  },
  {
    id: "beat-005",
    type: "FINAL_REVERSAL",
    summary:
      "The phone stays silent, but Mara's copied voice answers from the hallway.",
    requiredFacts: [],
    requiredCharacters: ["Mara Vale"],
    mechanicsReferences: [],
  },
];

const canonicalContract: CanonicalStoryContract = {
  schemaVersion: "canonical-story-contract-v1",
  genre: "fictional-supernatural",
  fictionality: "fiction",
  narrativeMode: "character-led",
  centralThreat: mechanics.centralThreat,
  protagonistGoal: mechanics.protagonistGoal,
  emotionalStake: mechanics.emotionalStake,
  observableEmotionalCost: mechanics.emotionalCost,
  supernaturalRule: {
    trigger: mechanics.supernaturalMechanics.trigger,
    activationEffect: mechanics.supernaturalMechanics.activationEffect,
    interactionRequirement:
      mechanics.supernaturalMechanics.interactionRequirement,
    cost: mechanics.supernaturalMechanics.cost,
    exceptions: mechanics.supernaturalMechanics.exceptions,
    limits: mechanics.supernaturalMechanics.limits,
    threatCapabilities: mechanics.supernaturalMechanics.threatCapabilities,
    failedResponseDiscoveries: mechanics.failedResponses,
    climaxUse: mechanics.supernaturalMechanics.climaxUse,
    endingInteraction: mechanics.supernaturalMechanics.endingInteraction,
  },
  climaxAction: mechanics.climaxAction,
  finalConsequence: mechanics.finalConsequence,
  characters: [
    {
      id: "character-mara",
      name: "Mara Vale",
      description: "protagonist",
    },
  ],
  relationships: [],
  locations: [
    {
      id: "location-flat",
      name: "Mara's flat",
      description: "primary location",
    },
  ],
  objects: [
    {
      id: "phone",
      name: "disconnected phone",
      description: "carries the copied voice",
    },
  ],
  emotionalAttachments: [
    {
      character: "Mara Vale",
      attachment: mechanics.emotionalStake,
      observableCost: mechanics.emotionalCost,
    },
  ],
  events: storyIr.chronology.map((summary, index) => ({
    id: `event-${index + 1}`,
    summary,
    kind: "atomic-canonical-event",
  })),
  scenes: beats.map((beat) => ({
    id: beat.id,
    summary: beat.summary,
    kind: "scene-beat",
  })),
};

function buildPlan(): HorrorAffectPlan {
  return buildHorrorAffectPlan({
    storyIr,
    canonicalContract,
    mechanics,
    beats,
  });
}

describe("horror affect plan", () => {
  it("builds a stable source-grounded question, response, and payoff chain", () => {
    const first = buildPlan();
    const second = buildPlan();

    expect(first).toEqual(second);
    expect(first.planHash).toBe(second.planHash);
    expect(first.validation.valid).toBe(true);
    expect(first.openQuestions).toEqual([
      expect.objectContaining({
        id: "primary-question",
        openedAtBeatId: "beat-001",
        dueAtBeatId: "beat-005",
        resolution: "reframed",
      }),
    ]);
    expect(first.responseOptions).toEqual([
      expect.objectContaining({
        action: "Mara locks the phone in a steel box.",
        resolvedAtBeatId: "beat-003",
        observableResult: beats[2]?.summary,
        informationGained: beats[2]?.summary,
      }),
    ]);
    expect(first.beatAffects[2]).toEqual(
      expect.objectContaining({
        mode: "suspense",
        viableResponseIdsBefore: ["response-001"],
        viableResponseIdsAfter: [],
      })
    );
    expect(first.beatAffects.at(-1)).toEqual(
      expect.objectContaining({
        mode: "surprise",
        paidOffQuestionIds: ["primary-question"],
        reversalSetupBeatIds: ["beat-002", "beat-003"],
      })
    );
  });

  it("rejects an unprepared surprise", () => {
    const plan = buildPlan();
    const body = {
      ...plan,
      beatAffects: plan.beatAffects.map((beat) =>
        beat.beatId === "beat-005"
          ? { ...beat, reversalSetupBeatIds: [] }
          : beat
      ),
    };
    const { planHash: _planHash, ...candidate } = body;

    expect(validateHorrorAffectPlan(candidate)).toContainEqual(
      expect.objectContaining({
        code: "SURPRISE_SETUP_MISSING",
        beatId: "beat-005",
        severity: "blocking",
      })
    );
  });

  it("rejects response narrowing without a concrete source-backed result", () => {
    const plan = buildPlan();
    const body = {
      ...plan,
      responseOptions: plan.responseOptions.map((option) => ({
        ...option,
        observableResult: "The response does not stop the central threat.",
        informationGained:
          "The result narrows or demonstrates the established rule.",
      })),
    };
    const { planHash: _planHash, ...candidate } = body;

    expect(validateHorrorAffectPlan(candidate)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "RESPONSE_NOT_SOURCE_SUPPORTED",
          responseId: "response-001",
          severity: "blocking",
        }),
        expect.objectContaining({
          code: "FAILED_RESPONSE_KNOWLEDGE_MISSING",
          responseId: "response-001",
          severity: "blocking",
        }),
      ])
    );
  });
});
