import { hashText, normalizeWhitespace } from "@mediaforge/shared";
import { z } from "zod";
import {
  computeHorrorAffectPlanHash,
  HORROR_AFFECT_PLAN_SCHEMA_VERSION,
  HORROR_AFFECT_STRATEGY_VERSION,
  type HorrorAffectPlan,
  type HorrorBeatAffect,
} from "./horror-affect-plan.js";
import { stableSerialize } from "./stable-json.js";

export const SHORT_HORROR_AFFECT_PROJECTION_SCHEMA_VERSION =
  "short-horror-affect-projection-schema-v1";
export const SHORT_HORROR_AFFECT_PROJECTION_VERSION =
  "short-horror-affect-projection-v1";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const requiredText = z.string().trim().min(1);
const sourceRefsSchema = z.array(requiredText).min(1);

export const shortHorrorAffectProjectionIssueCodeSchema = z.enum([
  "PARENT_PLAN_INVALID",
  "PARENT_PLAN_HASH_MISMATCH",
  "QUESTION_UNSUPPORTED",
  "RULE_UNSUPPORTED",
  "PROOF_STEP_MISSING",
  "COST_MISSING",
  "PAYOFF_MISSING",
  "CHAIN_ORDER_INVALID",
  "IMMUTABLE_FACT_OMITTED",
  "SELECTED_IDS_HASH_MISMATCH",
  "PROJECTION_HASH_MISMATCH",
]);
export type ShortHorrorAffectProjectionIssueCode = z.infer<
  typeof shortHorrorAffectProjectionIssueCodeSchema
>;

export const shortHorrorAffectProjectionIssueSchema = z
  .object({
    code: shortHorrorAffectProjectionIssueCodeSchema,
    message: requiredText,
  })
  .strict();
export type ShortHorrorAffectProjectionIssue = z.infer<
  typeof shortHorrorAffectProjectionIssueSchema
>;

const selectedIdsSchema = z
  .object({
    questionId: requiredText,
    questionOpenBeatId: requiredText,
    questionDueBeatId: requiredText,
    ruleBeatId: requiredText,
    proofStepBeatIds: z.array(requiredText).min(1),
    proofResponseIds: z.array(requiredText),
    costBeatId: requiredText,
    payoffBeatId: requiredText,
    immutableFactIds: z.array(requiredText),
  })
  .strict();

const shortHorrorAffectProjectionBodySchema = z
  .object({
    schemaVersion: z.literal(SHORT_HORROR_AFFECT_PROJECTION_SCHEMA_VERSION),
    projectionVersion: z.literal(SHORT_HORROR_AFFECT_PROJECTION_VERSION),
    strategyVersion: z.literal(HORROR_AFFECT_STRATEGY_VERSION),
    parent: z
      .object({
        planSchemaVersion: z.literal(HORROR_AFFECT_PLAN_SCHEMA_VERSION),
        planHash: hashSchema,
        storyIrHash: hashSchema,
        canonicalContractHash: hashSchema,
        mechanicsHash: hashSchema,
        canonicalBeatsHash: hashSchema,
      })
      .strict(),
    target: z
      .object({
        format: z.literal("short"),
        durationSeconds: z
          .object({
            min: z.number().int().positive(),
            max: z.number().int().positive(),
          })
          .strict(),
      })
      .strict(),
    chain: z
      .object({
        question: z
          .object({
            id: requiredText,
            text: requiredText,
            openedAtBeatId: requiredText,
            dueAtBeatId: requiredText,
            resolution: z.enum([
              "answered",
              "reframed",
              "intentionally-residual",
            ]),
            answerOrResidualUncertainty: requiredText,
            sourceRefs: sourceRefsSchema,
          })
          .strict(),
        rule: z
          .object({
            beatId: requiredText,
            statement: requiredText,
            sourceRefs: sourceRefsSchema,
          })
          .strict(),
        proofSteps: z
          .array(
            z
              .object({
                kind: z.enum(["response", "proof"]),
                beatId: requiredText,
                responseId: requiredText.optional(),
                action: requiredText,
                observableResult: requiredText,
                informationGained: requiredText,
                sourceRefs: sourceRefsSchema,
              })
              .strict()
          )
          .min(1),
        cost: z
          .object({
            beatId: requiredText,
            stake: requiredText,
            action: requiredText,
            observableResult: requiredText,
            sourceRefs: sourceRefsSchema,
          })
          .strict(),
        payoff: z
          .object({
            beatId: requiredText,
            questionId: requiredText,
            acceptedConsequence: requiredText,
            observableResult: requiredText,
            sourceRefs: sourceRefsSchema,
          })
          .strict(),
        requiredImmutableFacts: z.array(
          z
            .object({
              id: requiredText,
              statement: requiredText,
            })
            .strict()
        ),
      })
      .strict(),
    selectedIds: selectedIdsSchema,
    selectedIdsHash: hashSchema,
    validation: z
      .object({
        valid: z.literal(true),
        issues: z.array(shortHorrorAffectProjectionIssueSchema).length(0),
      })
      .strict(),
  })
  .strict();

export const shortHorrorAffectProjectionSchema =
  shortHorrorAffectProjectionBodySchema
    .extend({
      projectionHash: hashSchema,
    })
    .strict();
export type ShortHorrorAffectProjection = z.infer<
  typeof shortHorrorAffectProjectionSchema
>;
type ShortHorrorAffectProjectionBody = z.infer<
  typeof shortHorrorAffectProjectionBodySchema
>;

export const shortHorrorAffectProjectionLineageSchema = z
  .object({
    schemaVersion: z.literal(SHORT_HORROR_AFFECT_PROJECTION_SCHEMA_VERSION),
    projectionVersion: z.literal(SHORT_HORROR_AFFECT_PROJECTION_VERSION),
    strategyVersion: z.literal(HORROR_AFFECT_STRATEGY_VERSION),
    parentPlanHash: hashSchema,
    selectedIdsHash: hashSchema,
    projectionHash: hashSchema,
  })
  .strict();
export type ShortHorrorAffectProjectionLineage = z.infer<
  typeof shortHorrorAffectProjectionLineageSchema
>;

export const shortHorrorAffectProjectionStalenessCodeSchema = z.enum([
  "projection-schema-version-changed",
  "projection-version-changed",
  "strategy-version-changed",
  "parent-plan-hash-changed",
  "selected-chain-ids-changed",
  "projection-content-changed",
]);
export type ShortHorrorAffectProjectionStalenessCode = z.infer<
  typeof shortHorrorAffectProjectionStalenessCodeSchema
>;

export interface ShortHorrorAffectProjectionStalenessReason {
  readonly code: ShortHorrorAffectProjectionStalenessCode;
  readonly message: string;
  readonly persisted: string;
  readonly expected: string;
}

export class ShortHorrorAffectProjectionError extends Error {
  readonly issues: readonly ShortHorrorAffectProjectionIssue[];

  constructor(issues: readonly ShortHorrorAffectProjectionIssue[]) {
    super(issues.map((issue) => issue.message).join("; "));
    this.name = "ShortHorrorAffectProjectionError";
    this.issues = issues;
  }
}

const genericEvidencePattern =
  /\b(?:the result narrows|the response does not stop|something changes|the threat continues)\b/iu;

function supportedBeat(beat: HorrorBeatAffect): boolean {
  return (
    beat.evidence.confidence === "confirmed" &&
    beat.evidence.provenance !== "unknown" &&
    beat.evidence.provenance !== "source-inferred"
  );
}

function computeSelectedIdsHash(
  selectedIds: z.infer<typeof selectedIdsSchema>
): string {
  return hashText(stableSerialize(selectedIdsSchema.parse(selectedIds)));
}

export function computeShortHorrorAffectProjectionHash(
  projection: ShortHorrorAffectProjectionBody
): string {
  return hashText(
    stableSerialize(shortHorrorAffectProjectionBodySchema.parse(projection))
  );
}

export function buildShortHorrorAffectProjectionLineage(
  projection: ShortHorrorAffectProjection
): ShortHorrorAffectProjectionLineage {
  return shortHorrorAffectProjectionLineageSchema.parse({
    schemaVersion: projection.schemaVersion,
    projectionVersion: projection.projectionVersion,
    strategyVersion: projection.strategyVersion,
    parentPlanHash: projection.parent.planHash,
    selectedIdsHash: projection.selectedIdsHash,
    projectionHash: projection.projectionHash,
  });
}

export function explainShortHorrorAffectProjectionStaleness(args: {
  readonly persisted: ShortHorrorAffectProjectionLineage;
  readonly expected: ShortHorrorAffectProjectionLineage;
}): readonly ShortHorrorAffectProjectionStalenessReason[] {
  const reasons: ShortHorrorAffectProjectionStalenessReason[] = [];
  const compare = (
    code: ShortHorrorAffectProjectionStalenessCode,
    label: string,
    persisted: string,
    expected: string
  ): void => {
    if (persisted !== expected) {
      reasons.push({
        code,
        message: `${label} changed from ${persisted} to ${expected}.`,
        persisted,
        expected,
      });
    }
  };
  compare(
    "projection-schema-version-changed",
    "Short affect projection schema version",
    args.persisted.schemaVersion,
    args.expected.schemaVersion
  );
  compare(
    "projection-version-changed",
    "Short affect projection version",
    args.persisted.projectionVersion,
    args.expected.projectionVersion
  );
  compare(
    "strategy-version-changed",
    "Horror strategy version",
    args.persisted.strategyVersion,
    args.expected.strategyVersion
  );
  compare(
    "parent-plan-hash-changed",
    "Parent full-story affect plan hash",
    args.persisted.parentPlanHash,
    args.expected.parentPlanHash
  );
  compare(
    "selected-chain-ids-changed",
    "Selected Short affect chain IDs",
    args.persisted.selectedIdsHash,
    args.expected.selectedIdsHash
  );
  compare(
    "projection-content-changed",
    "Short affect projection hash",
    args.persisted.projectionHash,
    args.expected.projectionHash
  );
  return reasons;
}

export function validateShortHorrorAffectProjection(
  input: ShortHorrorAffectProjection
): readonly ShortHorrorAffectProjectionIssue[] {
  const projection = shortHorrorAffectProjectionSchema.parse(input);
  const issues: ShortHorrorAffectProjectionIssue[] = [];
  if (
    projection.selectedIdsHash !==
    computeSelectedIdsHash(projection.selectedIds)
  ) {
    issues.push({
      code: "SELECTED_IDS_HASH_MISMATCH",
      message:
        "The Short affect projection selected-ID hash does not match its chain IDs.",
    });
  }
  const { projectionHash: _projectionHash, ...body } = projection;
  if (
    projection.projectionHash !== computeShortHorrorAffectProjectionHash(body)
  ) {
    issues.push({
      code: "PROJECTION_HASH_MISMATCH",
      message:
        "The Short affect projection hash does not match its canonical content.",
    });
  }
  const beatOrder = new Map<string, number>();
  [
    projection.chain.question.openedAtBeatId,
    projection.chain.rule.beatId,
    ...projection.chain.proofSteps.map((step) => step.beatId),
    projection.chain.cost.beatId,
    projection.chain.payoff.beatId,
  ].forEach((beatId, index) => beatOrder.set(beatId, index));
  if (
    projection.chain.question.id !== projection.chain.payoff.questionId ||
    projection.chain.question.dueAtBeatId !== projection.chain.payoff.beatId ||
    projection.selectedIds.questionId !== projection.chain.question.id ||
    projection.selectedIds.questionOpenBeatId !==
      projection.chain.question.openedAtBeatId ||
    projection.selectedIds.questionDueBeatId !==
      projection.chain.question.dueAtBeatId ||
    projection.selectedIds.ruleBeatId !== projection.chain.rule.beatId ||
    projection.selectedIds.costBeatId !== projection.chain.cost.beatId ||
    projection.selectedIds.payoffBeatId !== projection.chain.payoff.beatId ||
    beatOrder.size < 4
  ) {
    issues.push({
      code: "CHAIN_ORDER_INVALID",
      message:
        "The Short affect projection IDs do not form one closed question-to-payoff chain.",
    });
  }
  const requiredFactIds = projection.chain.requiredImmutableFacts.map(
    (fact) => fact.id
  );
  if (
    stableSerialize(requiredFactIds) !==
    stableSerialize(projection.selectedIds.immutableFactIds)
  ) {
    issues.push({
      code: "IMMUTABLE_FACT_OMITTED",
      message:
        "The Short affect projection selected IDs omit required immutable facts.",
    });
  }
  return issues.map((issue) =>
    shortHorrorAffectProjectionIssueSchema.parse(issue)
  );
}

export function projectShortHorrorAffectPlan(args: {
  readonly parentPlan: HorrorAffectPlan;
  readonly durationSeconds: {
    readonly min: number;
    readonly max: number;
  };
  readonly immutableFacts: readonly {
    readonly id: string;
    readonly statement: string;
  }[];
}): ShortHorrorAffectProjection {
  const parentPlan = args.parentPlan;
  const { planHash: _parentPlanHash, ...parentBody } = parentPlan;
  const parentIssues: ShortHorrorAffectProjectionIssue[] = [];
  if (
    !parentPlan.validation.valid ||
    parentPlan.validation.issues.some((issue) => issue.severity === "blocking")
  ) {
    parentIssues.push({
      code: "PARENT_PLAN_INVALID",
      message:
        "Short affect projection requires an accepted full-story affect plan without blocking issues.",
    });
  }
  if (parentPlan.planHash !== computeHorrorAffectPlanHash(parentBody)) {
    parentIssues.push({
      code: "PARENT_PLAN_HASH_MISMATCH",
      message:
        "Short affect projection requires a current full-story plan with a valid plan hash.",
    });
  }
  if (parentIssues.length > 0) {
    throw new ShortHorrorAffectProjectionError(parentIssues);
  }

  const beatOrder = new Map(
    parentPlan.beatAffects.map((beat) => [beat.beatId, beat.order])
  );
  const question = parentPlan.openQuestions[0];
  if (
    !question ||
    question.evidence.confidence !== "confirmed" ||
    question.evidence.provenance === "unknown"
  ) {
    throw new ShortHorrorAffectProjectionError([
      {
        code: "QUESTION_UNSUPPORTED",
        message:
          "The parent affect plan does not contain one supported central question with an accepted payoff.",
      },
    ]);
  }
  const openedOrder = beatOrder.get(question.openedAtBeatId);
  const payoffOrder = beatOrder.get(question.dueAtBeatId);
  const payoffBeat = parentPlan.beatAffects.find(
    (beat) => beat.beatId === question.dueAtBeatId
  );
  if (
    openedOrder === undefined ||
    payoffOrder === undefined ||
    !payoffBeat ||
    !supportedBeat(payoffBeat) ||
    !payoffBeat.paidOffQuestionIds.includes(question.id) ||
    normalizeWhitespace(question.answerOrResidualUncertainty).length < 3
  ) {
    throw new ShortHorrorAffectProjectionError([
      {
        code: "PAYOFF_MISSING",
        message:
          "The selected Short affect question has no source-supported accepted consequence or payoff.",
      },
    ]);
  }

  const ruleBeat = parentPlan.beatAffects
    .filter(
      (beat) =>
        beat.order >= openedOrder &&
        beat.order < payoffOrder &&
        supportedBeat(beat) &&
        beat.ruleEvidence.some(
          (entry) =>
            normalizeWhitespace(entry).length >= 8 &&
            !genericEvidencePattern.test(entry)
        )
    )
    .sort((left, right) => left.order - right.order)[0];
  const ruleStatement = ruleBeat?.ruleEvidence.find(
    (entry) =>
      normalizeWhitespace(entry).length >= 8 &&
      !genericEvidencePattern.test(entry)
  );
  if (!ruleBeat || !ruleStatement) {
    throw new ShortHorrorAffectProjectionError([
      {
        code: "RULE_UNSUPPORTED",
        message:
          "The selected Short affect chain has no source-supported rule or mechanic established before its payoff.",
      },
    ]);
  }

  const responseProof = parentPlan.responseOptions
    .filter((option) => {
      const order = beatOrder.get(option.resolvedAtBeatId);
      return (
        order !== undefined &&
        order >= ruleBeat.order &&
        order < payoffOrder &&
        option.evidence.confidence === "confirmed" &&
        option.evidence.provenance !== "unknown" &&
        option.evidence.provenance !== "source-inferred" &&
        !genericEvidencePattern.test(option.observableResult) &&
        !genericEvidencePattern.test(option.informationGained)
      );
    })
    .sort(
      (left, right) =>
        (beatOrder.get(left.resolvedAtBeatId) ?? 0) -
        (beatOrder.get(right.resolvedAtBeatId) ?? 0)
    )[0];
  const proofBeat = responseProof
    ? parentPlan.beatAffects.find(
        (beat) => beat.beatId === responseProof.resolvedAtBeatId
      )
    : ruleBeat;
  if (!proofBeat || !supportedBeat(proofBeat)) {
    throw new ShortHorrorAffectProjectionError([
      {
        code: "PROOF_STEP_MISSING",
        message:
          "The selected Short affect chain has no credible response or observable proof step.",
      },
    ]);
  }

  const costBeat = parentPlan.beatAffects
    .filter(
      (beat) =>
        beat.order >= proofBeat.order &&
        beat.order < payoffOrder &&
        supportedBeat(beat) &&
        beat.evidence.sourceRefs.includes("mechanics:climax") &&
        normalizeWhitespace(beat.stake).length >= 3 &&
        normalizeWhitespace(beat.action).length >= 3 &&
        normalizeWhitespace(beat.observableResult).length >= 3
    )
    .sort((left, right) => right.order - left.order)[0];
  if (!costBeat) {
    throw new ShortHorrorAffectProjectionError([
      {
        code: "COST_MISSING",
        message:
          "The selected Short affect chain has no source-supported costly climax before its payoff.",
      },
    ]);
  }
  if (
    !(
      openedOrder <= ruleBeat.order &&
      ruleBeat.order <= proofBeat.order &&
      proofBeat.order < costBeat.order &&
      costBeat.order < payoffOrder
    )
  ) {
    throw new ShortHorrorAffectProjectionError([
      {
        code: "CHAIN_ORDER_INVALID",
        message:
          "The selected Short affect chain is causally incomplete or out of source order.",
      },
    ]);
  }

  const requiredImmutableFacts = args.immutableFacts.map((fact) => ({
    id: normalizeWhitespace(fact.id),
    statement: normalizeWhitespace(fact.statement),
  }));
  if (requiredImmutableFacts.some((fact) => !fact.id || !fact.statement)) {
    throw new ShortHorrorAffectProjectionError([
      {
        code: "IMMUTABLE_FACT_OMITTED",
        message:
          "The Short affect projection cannot preserve an immutable fact without both its source ID and statement.",
      },
    ]);
  }
  const proofStep = {
    kind: responseProof ? ("response" as const) : ("proof" as const),
    beatId: proofBeat.beatId,
    ...(responseProof ? { responseId: responseProof.id } : {}),
    action: responseProof?.action ?? proofBeat.action,
    observableResult:
      responseProof?.observableResult ?? proofBeat.observableResult,
    informationGained:
      responseProof?.informationGained ?? proofBeat.audienceKnowledgeAfter,
    sourceRefs: responseProof
      ? [...responseProof.evidence.sourceRefs, ...proofBeat.evidence.sourceRefs]
      : proofBeat.evidence.sourceRefs,
  };
  const selectedIds = selectedIdsSchema.parse({
    questionId: question.id,
    questionOpenBeatId: question.openedAtBeatId,
    questionDueBeatId: question.dueAtBeatId,
    ruleBeatId: ruleBeat.beatId,
    proofStepBeatIds: [proofBeat.beatId],
    proofResponseIds: responseProof ? [responseProof.id] : [],
    costBeatId: costBeat.beatId,
    payoffBeatId: payoffBeat.beatId,
    immutableFactIds: requiredImmutableFacts.map((fact) => fact.id),
  });
  const body = shortHorrorAffectProjectionBodySchema.parse({
    schemaVersion: SHORT_HORROR_AFFECT_PROJECTION_SCHEMA_VERSION,
    projectionVersion: SHORT_HORROR_AFFECT_PROJECTION_VERSION,
    strategyVersion: parentPlan.strategyVersion,
    parent: {
      planSchemaVersion: parentPlan.schemaVersion,
      planHash: parentPlan.planHash,
      storyIrHash: parentPlan.parents.storyIrHash,
      canonicalContractHash: parentPlan.parents.canonicalContractHash,
      mechanicsHash: parentPlan.parents.mechanicsHash,
      canonicalBeatsHash: parentPlan.parents.canonicalBeatsHash,
    },
    target: {
      format: "short",
      durationSeconds: args.durationSeconds,
    },
    chain: {
      question: {
        id: question.id,
        text: question.question,
        openedAtBeatId: question.openedAtBeatId,
        dueAtBeatId: question.dueAtBeatId,
        resolution: question.resolution,
        answerOrResidualUncertainty: question.answerOrResidualUncertainty,
        sourceRefs: question.evidence.sourceRefs,
      },
      rule: {
        beatId: ruleBeat.beatId,
        statement: ruleStatement,
        sourceRefs: ruleBeat.evidence.sourceRefs,
      },
      proofSteps: [proofStep],
      cost: {
        beatId: costBeat.beatId,
        stake: costBeat.stake,
        action: costBeat.action,
        observableResult: costBeat.observableResult,
        sourceRefs: costBeat.evidence.sourceRefs,
      },
      payoff: {
        beatId: payoffBeat.beatId,
        questionId: question.id,
        acceptedConsequence: question.answerOrResidualUncertainty,
        observableResult: payoffBeat.observableResult,
        sourceRefs: payoffBeat.evidence.sourceRefs,
      },
      requiredImmutableFacts,
    },
    selectedIds,
    selectedIdsHash: computeSelectedIdsHash(selectedIds),
    validation: {
      valid: true,
      issues: [],
    },
  });
  const projection = shortHorrorAffectProjectionSchema.parse({
    ...body,
    projectionHash: computeShortHorrorAffectProjectionHash(body),
  });
  const validationIssues = validateShortHorrorAffectProjection(projection);
  if (validationIssues.length > 0) {
    throw new ShortHorrorAffectProjectionError(validationIssues);
  }
  return projection;
}
