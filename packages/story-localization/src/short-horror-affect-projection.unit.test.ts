import { describe, expect, it } from "vitest";
import {
  computeHorrorAffectPlanHash,
  HORROR_AFFECT_PLAN_SCHEMA_VERSION,
  HORROR_AFFECT_STRATEGY_VERSION,
  horrorAffectPlanSchema,
  type HorrorAffectPlan,
  type HorrorBeatAffect,
} from "./horror-affect-plan.js";
import {
  buildShortHorrorAffectProjectionLineage,
  explainShortHorrorAffectProjectionStaleness,
  projectShortHorrorAffectPlan,
  validateShortHorrorAffectProjection,
} from "./short-horror-affect-projection.js";

const hash = (character: string): string => character.repeat(64);

function beat(args: {
  readonly beatId: string;
  readonly order: number;
  readonly action: string;
  readonly result: string;
  readonly ruleEvidence?: readonly string[];
  readonly sourceRefs?: readonly string[];
  readonly paidOff?: boolean;
}): HorrorBeatAffect {
  return {
    beatId: args.beatId,
    order: args.order,
    mode: args.paidOff ? "surprise" : "suspense",
    intensity: args.order === 0 ? "medium" : "high",
    audienceKnowledgeBefore: `knowledge before ${args.beatId}`,
    audienceKnowledgeAfter: `knowledge after ${args.beatId}`,
    protagonistKnowledgeBefore: `protagonist before ${args.beatId}`,
    protagonistKnowledgeAfter: `protagonist after ${args.beatId}`,
    immediateThreat: "the copied voice",
    stake: "Mara must refuse her sister's real call.",
    action: args.action,
    observableResult: args.result,
    openedQuestionIds: args.order === 0 ? ["primary-question"] : [],
    advancedQuestionIds:
      args.order > 0 && !args.paidOff ? ["primary-question"] : [],
    paidOffQuestionIds: args.paidOff ? ["primary-question"] : [],
    viableResponseIdsBefore: args.beatId === "beat-003" ? ["response-001"] : [],
    viableResponseIdsAfter: [],
    continuity: {
      time: `source order ${args.beatId}`,
      space: "Mara's flat",
      protagonist: "Mara",
      cause: args.order === 0 ? "source opening" : `beat-00${args.order}`,
      goal: "Keep the copied voice from reaching her sister.",
      intentionalDiscourseJump: false,
    },
    ruleEvidence: [...(args.ruleEvidence ?? [])],
    reversalSetupBeatIds: args.paidOff ? ["beat-002", "beat-003"] : [],
    evidence: {
      sourceRefs: [...(args.sourceRefs ?? [`canonical-beat:${args.beatId}`])],
      provenance: "canonical-beat",
      confidence: "confirmed",
    },
  };
}

function buildParentPlan(
  mutate?: (body: Record<string, unknown>) => void
): HorrorAffectPlan {
  const body: Record<string, unknown> = {
    schemaVersion: HORROR_AFFECT_PLAN_SCHEMA_VERSION,
    strategyVersion: HORROR_AFFECT_STRATEGY_VERSION,
    parents: {
      storyIrHash: hash("1"),
      canonicalContractHash: hash("2"),
      mechanicsHash: hash("3"),
      canonicalBeatsHash: hash("4"),
    },
    format: "full",
    profileId: "dark-truth",
    intensityPolicy: "restrained-moderate",
    primaryAudiencePromise:
      "Reveal how the copied voice moves and what Mara pays to stop it.",
    openQuestions: [
      {
        id: "primary-question",
        question: "What lets the copied voice move?",
        openedAtBeatId: "beat-001",
        partialAnswerBeatIds: ["beat-002", "beat-003"],
        dueAtBeatId: "beat-005",
        resolution: "reframed",
        answerOrResidualUncertainty:
          "Mara's copied voice answers from the hallway.",
        evidence: {
          sourceRefs: [
            "canonical-contract:central-threat",
            "canonical-contract:final-consequence",
          ],
          provenance: "canonical-contract",
          confidence: "confirmed",
        },
      },
    ],
    beatAffects: [
      beat({
        beatId: "beat-001",
        order: 0,
        action: "Mara hears her disconnected phone ring.",
        result: "The phone speaks in Mara's own voice.",
      }),
      beat({
        beatId: "beat-002",
        order: 1,
        action: "Mara answers the disconnected phone.",
        result: "The copied voice moves to the kitchen speaker.",
        ruleEvidence: [
          "Answering lets the copied voice move to the nearest speaker.",
        ],
      }),
      beat({
        beatId: "beat-003",
        order: 2,
        action: "Mara locks the phone in a steel box.",
        result: "The steel box begins calling in Mara's voice.",
      }),
      beat({
        beatId: "beat-004",
        order: 3,
        action: "Mara destroys the phone and refuses her sister's call.",
        result: "Mara loses her last chance to answer her sister.",
        sourceRefs: ["canonical-beat:beat-004", "mechanics:climax"],
      }),
      beat({
        beatId: "beat-005",
        order: 4,
        action: "Mara listens to the silent phone.",
        result: "Mara's copied voice answers from the hallway.",
        paidOff: true,
      }),
    ],
    responseOptions: [
      {
        id: "response-001",
        action: "Mara locks the phone in a steel box.",
        introducedAtBeatId: "beat-001",
        resolvedAtBeatId: "beat-003",
        resolution: "failed",
        observableResult: "The steel box begins calling in Mara's voice.",
        informationGained:
          "Physical barriers do not stop the copied voice from moving.",
        evidence: {
          sourceRefs: ["canonical-beat:beat-003", "mechanics:failed-response"],
          provenance: "canonical-beat",
          confidence: "confirmed",
        },
      },
    ],
    tensionShape: {
      lowBeatIds: [],
      mediumBeatIds: ["beat-001"],
      highBeatIds: ["beat-002", "beat-003", "beat-004", "beat-005"],
    },
    validation: {
      valid: true,
      issues: [],
    },
  };
  mutate?.(body);
  return horrorAffectPlanSchema.parse({
    ...body,
    planHash: computeHorrorAffectPlanHash(
      body as Parameters<typeof computeHorrorAffectPlanHash>[0]
    ),
  });
}

function project(parentPlan = buildParentPlan()) {
  return projectShortHorrorAffectPlan({
    parentPlan,
    durationSeconds: { min: 50, max: 60 },
    immutableFacts: [
      {
        id: "ending",
        statement: "Mara's copied voice answers from the hallway.",
      },
    ],
  });
}

describe("Short horror affect projection", () => {
  it("selects one deterministic, causally closed chain with stable hashes", () => {
    const first = project();
    const second = project();

    expect(first).toEqual(second);
    expect(first.projectionHash).toBe(second.projectionHash);
    expect(first.selectedIds).toEqual({
      questionId: "primary-question",
      questionOpenBeatId: "beat-001",
      questionDueBeatId: "beat-005",
      ruleBeatId: "beat-002",
      proofStepBeatIds: ["beat-003"],
      proofResponseIds: ["response-001"],
      costBeatId: "beat-004",
      payoffBeatId: "beat-005",
      immutableFactIds: ["ending"],
    });
    expect(first.chain.proofSteps).toHaveLength(1);
    expect(first.chain.payoff.acceptedConsequence).toBe(
      "Mara's copied voice answers from the hallway."
    );
    expect(validateShortHorrorAffectProjection(first)).toEqual([]);
  });

  it("fails closed for a causally incomplete chain", () => {
    const parent = buildParentPlan((body) => {
      body["responseOptions"] = [
        {
          ...(body["responseOptions"] as Record<string, unknown>[])[0],
          resolvedAtBeatId: "beat-004",
        },
      ];
    });

    expect(() => project(parent)).toThrow("causally incomplete");
  });

  it("rejects unsupported mechanics", () => {
    const parent = buildParentPlan((body) => {
      body["beatAffects"] = (body["beatAffects"] as HorrorBeatAffect[]).map(
        (entry) =>
          entry.beatId === "beat-002" ? { ...entry, ruleEvidence: [] } : entry
      );
    });

    expect(() => project(parent)).toThrow("no source-supported rule");
  });

  it("rejects a missing accepted payoff", () => {
    const parent = buildParentPlan((body) => {
      body["beatAffects"] = (body["beatAffects"] as HorrorBeatAffect[]).map(
        (entry) =>
          entry.beatId === "beat-005"
            ? { ...entry, paidOffQuestionIds: [] }
            : entry
      );
    });

    expect(() => project(parent)).toThrow(
      "no source-supported accepted consequence"
    );
  });

  it("explains parent-plan and selected-ID staleness", () => {
    const lineage = buildShortHorrorAffectProjectionLineage(project());
    const reasons = explainShortHorrorAffectProjectionStaleness({
      persisted: lineage,
      expected: {
        ...lineage,
        parentPlanHash: hash("8"),
        selectedIdsHash: hash("9"),
        projectionHash: hash("a"),
      },
    });

    expect(reasons.map((reason) => reason.code)).toEqual([
      "parent-plan-hash-changed",
      "selected-chain-ids-changed",
      "projection-content-changed",
    ]);
  });
});
