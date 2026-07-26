import { hashText, normalizeWhitespace } from "@mediaforge/shared";
import { z } from "zod";
import type { FullStoryContract } from "./full-story-contract.js";
import {
  computeHorrorAffectPlanHash,
  HORROR_AFFECT_PLAN_SCHEMA_VERSION,
  HORROR_AFFECT_STRATEGY_VERSION,
  type HorrorAffectPlan,
} from "./horror-affect-plan.js";
import { stableSerialize } from "./stable-json.js";

export const LOCALIZATION_HORROR_AFFECT_PROJECTION_SCHEMA_VERSION =
  "localization-horror-affect-projection-schema-v1";
export const LOCALIZATION_HORROR_AFFECT_PROJECTION_VERSION =
  "localization-horror-affect-projection-v1";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const requiredText = z.string().trim().min(1);
const sourceRefsSchema = z.array(requiredText).min(1);

export const localizationAffectInvariantSchema = z.enum([
  "question-opened-and-paid-off",
  "rule-established-unchanged",
  "response-keeps-established-result",
  "cost-paid-by-established-action",
  "climax-uses-established-rule",
  "payoff-preserves-accepted-ending",
]);
export type LocalizationAffectInvariant = z.infer<
  typeof localizationAffectInvariantSchema
>;

export const localizationAffectTransitionKindSchema = z.enum([
  "question",
  "rule",
  "response",
  "cost",
  "climax",
  "payoff",
]);
export type LocalizationAffectTransitionKind = z.infer<
  typeof localizationAffectTransitionKindSchema
>;

export const localizationAffectTransitionSchema = z
  .object({
    semanticId: requiredText,
    kind: localizationAffectTransitionKindSchema,
    beatId: requiredText,
    invariant: localizationAffectInvariantSchema,
    statement: requiredText,
    dependsOnSemanticIds: z.array(requiredText),
    sourceRefs: sourceRefsSchema,
    reversalSetupBeatIds: z.array(requiredText),
  })
  .strict();
export type LocalizationAffectTransition = z.infer<
  typeof localizationAffectTransitionSchema
>;

export const localizationAffectEvidenceSchema = z
  .object({
    projectionVersion: z.literal(LOCALIZATION_HORROR_AFFECT_PROJECTION_VERSION),
    projectionHash: hashSchema,
    parentPlanHash: hashSchema,
    transitions: z.array(
      z
        .object({
          semanticId: requiredText,
          state: z.enum(["preserved", "missing", "contradicted"]),
          evidenceRefs: z.array(requiredText),
          localizedEvidence: requiredText,
        })
        .strict()
    ),
    introducedThreatRuleIds: z.array(requiredText),
    introducedSurpriseIds: z.array(requiredText),
    introducedImmutableFactIds: z.array(requiredText),
  })
  .strict();
export type LocalizationAffectEvidence = z.infer<
  typeof localizationAffectEvidenceSchema
>;

const localizationHorrorAffectProjectionBodySchema = z
  .object({
    schemaVersion: z.literal(
      LOCALIZATION_HORROR_AFFECT_PROJECTION_SCHEMA_VERSION
    ),
    projectionVersion: z.literal(LOCALIZATION_HORROR_AFFECT_PROJECTION_VERSION),
    strategyVersion: z.literal(HORROR_AFFECT_STRATEGY_VERSION),
    parent: z
      .object({
        planSchemaVersion: z.literal(HORROR_AFFECT_PLAN_SCHEMA_VERSION),
        planHash: hashSchema,
        storyIrHash: hashSchema,
        canonicalContractHash: hashSchema,
        mechanicsHash: hashSchema,
        canonicalBeatsHash: hashSchema,
        canonicalFingerprint: hashSchema,
      })
      .strict(),
    target: z
      .object({
        format: z.literal("localized-full"),
        profileId: z.literal("dark-truth"),
      })
      .strict(),
    semanticIds: z
      .object({
        questionId: requiredText,
        ruleId: requiredText,
        responseIds: z.array(requiredText).min(1),
        costId: requiredText,
        climaxId: requiredText,
        payoffId: requiredText,
      })
      .strict(),
    transitions: z.array(localizationAffectTransitionSchema).min(6),
    protectedFacts: z.array(
      z
        .object({
          id: requiredText,
          kind: z.enum([
            "immutable-fact",
            "central-threat",
            "threat-rule",
            "accepted-ending",
          ]),
          statement: requiredText,
        })
        .strict()
    ),
    semanticIdsHash: hashSchema,
  })
  .strict();

export const localizationHorrorAffectProjectionSchema =
  localizationHorrorAffectProjectionBodySchema
    .extend({
      projectionHash: hashSchema,
    })
    .strict();
export type LocalizationHorrorAffectProjection = z.infer<
  typeof localizationHorrorAffectProjectionSchema
>;
type LocalizationHorrorAffectProjectionBody = z.infer<
  typeof localizationHorrorAffectProjectionBodySchema
>;

export const localizationHorrorAffectProjectionLineageSchema = z
  .object({
    schemaVersion: z.literal(
      LOCALIZATION_HORROR_AFFECT_PROJECTION_SCHEMA_VERSION
    ),
    projectionVersion: z.literal(LOCALIZATION_HORROR_AFFECT_PROJECTION_VERSION),
    strategyVersion: z.literal(HORROR_AFFECT_STRATEGY_VERSION),
    parentPlanHash: hashSchema,
    parentCanonicalFingerprint: hashSchema,
    semanticIdsHash: hashSchema,
    projectionHash: hashSchema,
  })
  .strict();
export type LocalizationHorrorAffectProjectionLineage = z.infer<
  typeof localizationHorrorAffectProjectionLineageSchema
>;

export const localizationHorrorAffectProjectionStalenessCodeSchema = z.enum([
  "projection-schema-version-changed",
  "projection-version-changed",
  "strategy-version-changed",
  "parent-plan-hash-changed",
  "parent-canonical-fingerprint-changed",
  "semantic-ids-changed",
  "projection-content-changed",
]);
export type LocalizationHorrorAffectProjectionStalenessCode = z.infer<
  typeof localizationHorrorAffectProjectionStalenessCodeSchema
>;

export interface LocalizationHorrorAffectProjectionStalenessReason {
  readonly code: LocalizationHorrorAffectProjectionStalenessCode;
  readonly message: string;
  readonly persisted: string;
  readonly expected: string;
}

function computeSemanticIdsHash(
  semanticIds: LocalizationHorrorAffectProjectionBody["semanticIds"]
): string {
  return hashText(stableSerialize(semanticIds));
}

export function computeLocalizationHorrorAffectProjectionHash(
  projection: LocalizationHorrorAffectProjectionBody
): string {
  return hashText(
    stableSerialize(
      localizationHorrorAffectProjectionBodySchema.parse(projection)
    )
  );
}

export function buildLocalizationHorrorAffectProjectionLineage(
  projection: LocalizationHorrorAffectProjection
): LocalizationHorrorAffectProjectionLineage {
  return localizationHorrorAffectProjectionLineageSchema.parse({
    schemaVersion: projection.schemaVersion,
    projectionVersion: projection.projectionVersion,
    strategyVersion: projection.strategyVersion,
    parentPlanHash: projection.parent.planHash,
    parentCanonicalFingerprint: projection.parent.canonicalFingerprint,
    semanticIdsHash: projection.semanticIdsHash,
    projectionHash: projection.projectionHash,
  });
}

export function explainLocalizationHorrorAffectProjectionStaleness(args: {
  readonly persisted: LocalizationHorrorAffectProjectionLineage;
  readonly expected: LocalizationHorrorAffectProjectionLineage;
}): readonly LocalizationHorrorAffectProjectionStalenessReason[] {
  const reasons: LocalizationHorrorAffectProjectionStalenessReason[] = [];
  const compare = (
    code: LocalizationHorrorAffectProjectionStalenessCode,
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
    "Localization affect projection schema version",
    args.persisted.schemaVersion,
    args.expected.schemaVersion
  );
  compare(
    "projection-version-changed",
    "Localization affect projection version",
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
    "Parent horror affect plan hash",
    args.persisted.parentPlanHash,
    args.expected.parentPlanHash
  );
  compare(
    "parent-canonical-fingerprint-changed",
    "Accepted canonical full fingerprint",
    args.persisted.parentCanonicalFingerprint,
    args.expected.parentCanonicalFingerprint
  );
  compare(
    "semantic-ids-changed",
    "Localization affect semantic IDs",
    args.persisted.semanticIdsHash,
    args.expected.semanticIdsHash
  );
  compare(
    "projection-content-changed",
    "Localization affect projection content",
    args.persisted.projectionHash,
    args.expected.projectionHash
  );
  return reasons;
}

export function validateLocalizationHorrorAffectProjection(
  input: LocalizationHorrorAffectProjection
): readonly string[] {
  const projection = localizationHorrorAffectProjectionSchema.parse(input);
  const issues: string[] = [];
  if (
    projection.semanticIdsHash !==
    computeSemanticIdsHash(projection.semanticIds)
  ) {
    issues.push(
      "Localization affect projection semantic-ID hash does not match its IDs."
    );
  }
  const { projectionHash: _projectionHash, ...body } = projection;
  if (
    projection.projectionHash !==
    computeLocalizationHorrorAffectProjectionHash(body)
  ) {
    issues.push(
      "Localization affect projection hash does not match its canonical content."
    );
  }
  const transitionsById = new Map(
    projection.transitions.map((transition) => [
      transition.semanticId,
      transition,
    ])
  );
  if (transitionsById.size !== projection.transitions.length) {
    issues.push("Localization affect transition semantic IDs must be unique.");
  }
  const expectedIds = [
    projection.semanticIds.questionId,
    projection.semanticIds.ruleId,
    ...projection.semanticIds.responseIds,
    projection.semanticIds.costId,
    projection.semanticIds.climaxId,
    projection.semanticIds.payoffId,
  ];
  for (const id of expectedIds) {
    if (!transitionsById.has(id)) {
      issues.push(`Localization affect transition ${id} is missing.`);
    }
  }
  for (const transition of projection.transitions) {
    for (const dependencyId of transition.dependsOnSemanticIds) {
      const dependencyIndex = projection.transitions.findIndex(
        (candidate) => candidate.semanticId === dependencyId
      );
      const transitionIndex = projection.transitions.findIndex(
        (candidate) => candidate.semanticId === transition.semanticId
      );
      if (dependencyIndex < 0 || dependencyIndex >= transitionIndex) {
        issues.push(
          `Localization affect transition ${transition.semanticId} has invalid dependency ${dependencyId}.`
        );
      }
    }
  }
  return [...new Set(issues)];
}

function sourceRefs(...groups: readonly (readonly string[])[]): string[] {
  return [
    ...new Set(
      groups
        .flat()
        .map(normalizeWhitespace)
        .filter((entry) => entry.length > 0)
    ),
  ];
}

export function buildLocalizationHorrorAffectProjection(args: {
  readonly plan: HorrorAffectPlan;
  readonly contract: FullStoryContract;
  readonly canonicalFingerprint: string;
}): LocalizationHorrorAffectProjection {
  const parsedPlan = args.plan;
  const { planHash: _planHash, ...planBody } = parsedPlan;
  if (
    !parsedPlan.validation.valid ||
    parsedPlan.planHash !== computeHorrorAffectPlanHash(planBody)
  ) {
    throw new Error(
      "Localization affect projection requires a valid accepted parent plan."
    );
  }
  const question = parsedPlan.openQuestions[0];
  const climax =
    parsedPlan.beatAffects.find((beat) =>
      beat.evidence.sourceRefs.includes("mechanics:climax")
    ) ?? parsedPlan.beatAffects.at(-2);
  const payoff = parsedPlan.beatAffects.find(
    (beat) => beat.beatId === question?.dueAtBeatId
  );
  const rule = parsedPlan.beatAffects.find(
    (beat) =>
      beat.order < (climax?.order ?? Number.MAX_SAFE_INTEGER) &&
      (beat.ruleEvidence.length > 0 || Boolean(beat.ruleRefinement))
  );
  if (!question || !rule || !climax || !payoff) {
    throw new Error(
      "Localization affect projection requires accepted question, rule, climax, and payoff transitions."
    );
  }

  const questionId = question.id;
  const ruleId = `rule:${rule.beatId}`;
  const responseEntries =
    parsedPlan.responseOptions.length > 0
      ? parsedPlan.responseOptions.map((option) => ({
          semanticId: option.id,
          beatId: option.resolvedAtBeatId,
          statement: `${option.action} -> ${option.observableResult}; ${option.informationGained}`,
          sourceRefs: option.evidence.sourceRefs,
        }))
      : [
          {
            semanticId: `response:${climax.beatId}`,
            beatId: climax.beatId,
            statement: `${climax.action} -> ${climax.observableResult}`,
            sourceRefs: climax.evidence.sourceRefs,
          },
        ];
  const costId = `cost:${climax.beatId}`;
  const climaxId = `climax:${climax.beatId}`;
  const payoffId = `payoff:${payoff.beatId}`;
  const semanticIds = {
    questionId,
    ruleId,
    responseIds: responseEntries.map((entry) => entry.semanticId),
    costId,
    climaxId,
    payoffId,
  };
  const transitions: LocalizationAffectTransition[] = [
    {
      semanticId: questionId,
      kind: "question",
      beatId: question.openedAtBeatId,
      invariant: "question-opened-and-paid-off",
      statement: `${question.question} -> ${question.answerOrResidualUncertainty}`,
      dependsOnSemanticIds: [],
      sourceRefs: question.evidence.sourceRefs,
      reversalSetupBeatIds: [],
    },
    {
      semanticId: ruleId,
      kind: "rule",
      beatId: rule.beatId,
      invariant: "rule-established-unchanged",
      statement:
        rule.ruleRefinement ??
        args.contract.sourceTruth.centralRuleOrMechanism?.description ??
        rule.ruleEvidence.join(" | "),
      dependsOnSemanticIds: [questionId],
      sourceRefs: sourceRefs(rule.evidence.sourceRefs, rule.ruleEvidence, [
        "full-story-contract:central-rule",
      ]),
      reversalSetupBeatIds: [],
    },
    ...responseEntries.map(
      (entry): LocalizationAffectTransition => ({
        semanticId: entry.semanticId,
        kind: "response",
        beatId: entry.beatId,
        invariant: "response-keeps-established-result",
        statement: entry.statement,
        dependsOnSemanticIds: [ruleId],
        sourceRefs: sourceRefs(entry.sourceRefs),
        reversalSetupBeatIds: [],
      })
    ),
    {
      semanticId: costId,
      kind: "cost",
      beatId: climax.beatId,
      invariant: "cost-paid-by-established-action",
      statement: `${climax.stake}; ${climax.action} -> ${climax.observableResult}`,
      dependsOnSemanticIds: [...semanticIds.responseIds],
      sourceRefs: sourceRefs(climax.evidence.sourceRefs, [
        "full-story-contract:narrative-culmination",
      ]),
      reversalSetupBeatIds: [],
    },
    {
      semanticId: climaxId,
      kind: "climax",
      beatId: climax.beatId,
      invariant: "climax-uses-established-rule",
      statement: `${climax.action} -> ${climax.observableResult}`,
      dependsOnSemanticIds: [ruleId, costId],
      sourceRefs: sourceRefs(climax.evidence.sourceRefs, climax.ruleEvidence, [
        "mechanics:climax",
      ]),
      reversalSetupBeatIds: [],
    },
    {
      semanticId: payoffId,
      kind: "payoff",
      beatId: payoff.beatId,
      invariant: "payoff-preserves-accepted-ending",
      statement: args.contract.sourceTruth.endingConsequence,
      dependsOnSemanticIds: [questionId, climaxId],
      sourceRefs: sourceRefs(
        payoff.evidence.sourceRefs,
        question.evidence.sourceRefs,
        ["full-story-contract:accepted-ending"]
      ),
      reversalSetupBeatIds: payoff.reversalSetupBeatIds,
    },
  ].map((transition) => localizationAffectTransitionSchema.parse(transition));
  const body = localizationHorrorAffectProjectionBodySchema.parse({
    schemaVersion: LOCALIZATION_HORROR_AFFECT_PROJECTION_SCHEMA_VERSION,
    projectionVersion: LOCALIZATION_HORROR_AFFECT_PROJECTION_VERSION,
    strategyVersion: parsedPlan.strategyVersion,
    parent: {
      planSchemaVersion: parsedPlan.schemaVersion,
      planHash: parsedPlan.planHash,
      storyIrHash: parsedPlan.parents.storyIrHash,
      canonicalContractHash: parsedPlan.parents.canonicalContractHash,
      mechanicsHash: parsedPlan.parents.mechanicsHash,
      canonicalBeatsHash: parsedPlan.parents.canonicalBeatsHash,
      canonicalFingerprint: args.canonicalFingerprint,
    },
    target: {
      format: "localized-full",
      profileId: parsedPlan.profileId,
    },
    semanticIds,
    transitions,
    protectedFacts: [
      ...args.contract.sourceTruth.immutableFacts
        .filter((fact) => fact.immutable)
        .map((fact) => ({
          id: fact.id,
          kind: "immutable-fact" as const,
          statement: fact.statement,
        })),
      {
        id: "central-threat",
        kind: "central-threat" as const,
        statement: args.contract.sourceTruth.centralThreat.description,
      },
      ...(args.contract.sourceTruth.centralRuleOrMechanism
        ? [
            {
              id: "central-rule",
              kind: "threat-rule" as const,
              statement:
                args.contract.sourceTruth.centralRuleOrMechanism.description,
            },
          ]
        : []),
      {
        id: "accepted-ending",
        kind: "accepted-ending" as const,
        statement: args.contract.sourceTruth.endingConsequence,
      },
    ],
    semanticIdsHash: computeSemanticIdsHash(semanticIds),
  });
  const projection = localizationHorrorAffectProjectionSchema.parse({
    ...body,
    projectionHash: computeLocalizationHorrorAffectProjectionHash(body),
  });
  const issues = validateLocalizationHorrorAffectProjection(projection);
  if (issues.length > 0) {
    throw new Error(issues.join("; "));
  }
  return projection;
}
