import { hashText, normalizeWhitespace } from "@mediaforge/shared";
import { z } from "zod";
import type { CanonicalStoryContract } from "./canonical-story-contract.js";
import { stableSerialize } from "./stable-json.js";
import type { StoryIR } from "./story-artifact-model.js";
import {
  hashCanonicalStoryBeats,
  hashStoryMechanicsContract,
  type CanonicalStoryBeat,
  type StoryMechanicsContract,
} from "./story-mechanics.js";

export const HORROR_AFFECT_PLAN_SCHEMA_VERSION = "horror-affect-plan-v1";
export const HORROR_AFFECT_STRATEGY_VERSION = "dark-truth-horror-strategy-v1";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const requiredText = z.string().trim().min(1);

export const horrorAffectProvenanceSchema = z.enum([
  "canonical-contract",
  "canonical-beat",
  "mechanics-contract",
  "source-inferred",
  "unknown",
]);
export type HorrorAffectProvenance = z.infer<
  typeof horrorAffectProvenanceSchema
>;

export const horrorAffectConfidenceSchema = z.enum([
  "confirmed",
  "probable",
  "unknown",
]);
export type HorrorAffectConfidence = z.infer<
  typeof horrorAffectConfidenceSchema
>;

export const horrorAffectEvidenceSchema = z
  .object({
    sourceRefs: z.array(requiredText).min(1),
    provenance: horrorAffectProvenanceSchema,
    confidence: horrorAffectConfidenceSchema,
  })
  .strict();
export type HorrorAffectEvidence = z.infer<typeof horrorAffectEvidenceSchema>;

export const horrorAffectModeSchema = z.enum([
  "suspense",
  "curiosity",
  "surprise",
  "dread",
  "release",
]);
export type HorrorAffectMode = z.infer<typeof horrorAffectModeSchema>;

export const horrorIntensityBandSchema = z.enum(["low", "medium", "high"]);
export type HorrorIntensityBand = z.infer<typeof horrorIntensityBandSchema>;

export const horrorAffectPlanIssueCodeSchema = z.enum([
  "BEAT_ORDER_INVALID",
  "PRIMARY_QUESTION_ORDER_INVALID",
  "PRIMARY_QUESTION_UNRESOLVED",
  "SURPRISE_SETUP_MISSING",
  "RESPONSE_NOT_SOURCE_SUPPORTED",
  "RESPONSE_DISAPPEARS_WITHOUT_RESULT",
  "FAILED_RESPONSE_KNOWLEDGE_MISSING",
  "CLIMAX_RULE_UNESTABLISHED",
  "CONTINUITY_CAUSE_MISSING",
  "UNSUPPORTED_FAILED_RESPONSE_OMITTED",
]);
export type HorrorAffectPlanIssueCode = z.infer<
  typeof horrorAffectPlanIssueCodeSchema
>;

export const horrorAffectPlanIssueSchema = z
  .object({
    code: horrorAffectPlanIssueCodeSchema,
    severity: z.enum(["warning", "blocking"]),
    message: requiredText,
    beatId: requiredText.optional(),
    responseId: requiredText.optional(),
  })
  .strict();
export type HorrorAffectPlanIssue = z.infer<typeof horrorAffectPlanIssueSchema>;

export const horrorOpenQuestionSchema = z
  .object({
    id: requiredText,
    question: requiredText,
    openedAtBeatId: requiredText,
    partialAnswerBeatIds: z.array(requiredText),
    dueAtBeatId: requiredText,
    resolution: z.enum(["answered", "reframed", "intentionally-residual"]),
    answerOrResidualUncertainty: requiredText,
    evidence: horrorAffectEvidenceSchema,
  })
  .strict();
export type HorrorOpenQuestion = z.infer<typeof horrorOpenQuestionSchema>;

export const horrorResponseOptionSchema = z
  .object({
    id: requiredText,
    action: requiredText,
    introducedAtBeatId: requiredText,
    resolvedAtBeatId: requiredText,
    resolution: z.enum(["failed", "worsened", "used-in-climax"]),
    observableResult: requiredText,
    informationGained: requiredText,
    evidence: horrorAffectEvidenceSchema,
  })
  .strict();
export type HorrorResponseOption = z.infer<typeof horrorResponseOptionSchema>;

export const horrorContinuityStateSchema = z
  .object({
    time: requiredText,
    space: requiredText,
    protagonist: requiredText,
    cause: requiredText,
    goal: requiredText,
    intentionalDiscourseJump: z.boolean(),
  })
  .strict();
export type HorrorContinuityState = z.infer<typeof horrorContinuityStateSchema>;

export const horrorBeatAffectSchema = z
  .object({
    beatId: requiredText,
    order: z.number().int().nonnegative(),
    mode: horrorAffectModeSchema,
    intensity: horrorIntensityBandSchema,
    audienceKnowledgeBefore: requiredText,
    audienceKnowledgeAfter: requiredText,
    protagonistKnowledgeBefore: requiredText,
    protagonistKnowledgeAfter: requiredText,
    immediateThreat: requiredText,
    stake: requiredText,
    action: requiredText,
    observableResult: requiredText,
    openedQuestionIds: z.array(requiredText),
    advancedQuestionIds: z.array(requiredText),
    paidOffQuestionIds: z.array(requiredText),
    viableResponseIdsBefore: z.array(requiredText),
    viableResponseIdsAfter: z.array(requiredText),
    continuity: horrorContinuityStateSchema,
    ruleEvidence: z.array(requiredText),
    ruleRefinement: requiredText.optional(),
    reversalSetupBeatIds: z.array(requiredText),
    evidence: horrorAffectEvidenceSchema,
  })
  .strict();
export type HorrorBeatAffect = z.infer<typeof horrorBeatAffectSchema>;

export const horrorAffectPlanValidationSchema = z
  .object({
    valid: z.boolean(),
    issues: z.array(horrorAffectPlanIssueSchema),
  })
  .strict();

const horrorAffectPlanBodySchema = z
  .object({
    schemaVersion: z.literal(HORROR_AFFECT_PLAN_SCHEMA_VERSION),
    strategyVersion: z.literal(HORROR_AFFECT_STRATEGY_VERSION),
    parents: z
      .object({
        storyIrHash: hashSchema,
        canonicalContractHash: hashSchema,
        mechanicsHash: hashSchema,
        canonicalBeatsHash: hashSchema,
      })
      .strict(),
    format: z.literal("full"),
    profileId: z.literal("dark-truth"),
    intensityPolicy: z.literal("restrained-moderate"),
    primaryAudiencePromise: requiredText,
    openQuestions: z.array(horrorOpenQuestionSchema).min(1),
    beatAffects: z.array(horrorBeatAffectSchema).min(1),
    responseOptions: z.array(horrorResponseOptionSchema),
    tensionShape: z
      .object({
        lowBeatIds: z.array(requiredText),
        mediumBeatIds: z.array(requiredText),
        highBeatIds: z.array(requiredText),
      })
      .strict(),
    validation: horrorAffectPlanValidationSchema,
  })
  .strict();

export const horrorAffectPlanSchema = horrorAffectPlanBodySchema
  .extend({
    planHash: hashSchema,
  })
  .strict();
export type HorrorAffectPlan = z.infer<typeof horrorAffectPlanSchema>;
type HorrorAffectPlanBody = z.infer<typeof horrorAffectPlanBodySchema>;

const genericFailedResponsePattern =
  /\b(?:the response does not stop the central threat|the result narrows or demonstrates the established rule)\b/iu;
const reversalPattern =
  /\b(?:but|however|instead|still|yet|another|impossible|continued|returned|remained|was already)\b/iu;
const tokenStopList = new Set([
  "about",
  "after",
  "before",
  "could",
  "from",
  "into",
  "story",
  "their",
  "there",
  "these",
  "thing",
  "threat",
  "through",
  "under",
  "with",
  "would",
]);

function meaningfulTokens(value: string): ReadonlySet<string> {
  return new Set(
    normalizeWhitespace(value)
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length >= 4 && !tokenStopList.has(token))
  );
}

function sharesMeaningfulToken(left: string, right: string): boolean {
  const rightTokens = meaningfulTokens(right);
  return [...meaningfulTokens(left)].some((token) => rightTokens.has(token));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizeWhitespace).filter(Boolean))];
}

function issueKey(issue: HorrorAffectPlanIssue): string {
  return [
    issue.code,
    issue.severity,
    issue.beatId ?? "",
    issue.responseId ?? "",
    issue.message,
  ].join("|");
}

function dedupeIssues(
  issues: readonly HorrorAffectPlanIssue[]
): HorrorAffectPlanIssue[] {
  const byKey = new Map<string, HorrorAffectPlanIssue>();
  for (const issue of issues) {
    byKey.set(issueKey(issue), issue);
  }
  return [...byKey.values()];
}

function evidence(
  sourceRefs: readonly string[],
  provenance: HorrorAffectProvenance,
  confidence: HorrorAffectConfidence
): HorrorAffectEvidence {
  return horrorAffectEvidenceSchema.parse({
    sourceRefs: unique(sourceRefs),
    provenance,
    confidence,
  });
}

function affectForBeat(
  beat: CanonicalStoryBeat,
  surpriseSupported: boolean
): {
  readonly mode: HorrorAffectMode;
  readonly intensity: HorrorIntensityBand;
} {
  switch (beat.type) {
    case "HOOK":
      return { mode: "curiosity", intensity: "high" };
    case "SETUP":
      return { mode: "dread", intensity: "low" };
    case "WARNING":
      return { mode: "suspense", intensity: "medium" };
    case "EVIDENCE":
      return { mode: "curiosity", intensity: "medium" };
    case "RULE_DISCOVERY":
      return { mode: "release", intensity: "medium" };
    case "FAILED_RESPONSE":
      return { mode: "suspense", intensity: "high" };
    case "EMOTIONAL_ESCALATION":
      return { mode: "dread", intensity: "high" };
    case "CLIMAX":
      return { mode: "suspense", intensity: "high" };
    case "AFTERMATH":
      return { mode: "release", intensity: "low" };
    case "FINAL_REVERSAL":
      return {
        mode: surpriseSupported ? "surprise" : "dread",
        intensity: "high",
      };
  }
}

function responseOptionsFromSource(args: {
  readonly beats: readonly CanonicalStoryBeat[];
  readonly mechanics: StoryMechanicsContract;
}): {
  readonly options: readonly HorrorResponseOption[];
  readonly issues: readonly HorrorAffectPlanIssue[];
} {
  const failedBeats = args.beats.filter(
    (beat) => beat.type === "FAILED_RESPONSE"
  );
  const usedBeatIds = new Set<string>();
  const options: HorrorResponseOption[] = [];
  const issues: HorrorAffectPlanIssue[] = [];
  for (const failedResponse of args.mechanics.failedResponses) {
    const sourceBeat = failedBeats.find(
      (beat) =>
        !usedBeatIds.has(beat.id) &&
        sharesMeaningfulToken(beat.summary, failedResponse.action)
    );
    if (!sourceBeat) {
      issues.push(
        horrorAffectPlanIssueSchema.parse({
          code: "UNSUPPORTED_FAILED_RESPONSE_OMITTED",
          severity: "warning",
          message: `Omitted failed response without a matching canonical beat: ${failedResponse.action}`,
        })
      );
      continue;
    }
    usedBeatIds.add(sourceBeat.id);
    const id = `response-${String(options.length + 1).padStart(3, "0")}`;
    options.push(
      horrorResponseOptionSchema.parse({
        id,
        action: failedResponse.action,
        introducedAtBeatId: args.beats[0]?.id ?? sourceBeat.id,
        resolvedAtBeatId: sourceBeat.id,
        resolution: "failed",
        observableResult: sourceBeat.summary,
        informationGained: sourceBeat.summary,
        evidence: evidence(
          [`canonical-beat:${sourceBeat.id}`, "mechanics:failed-response"],
          "canonical-beat",
          "confirmed"
        ),
      })
    );
  }
  return { options, issues };
}

function isResponseActive(args: {
  readonly option: HorrorResponseOption;
  readonly beatOrder: ReadonlyMap<string, number>;
  readonly currentOrder: number;
  readonly afterBeat: boolean;
}): boolean {
  const introducedOrder =
    args.beatOrder.get(args.option.introducedAtBeatId) ??
    Number.MAX_SAFE_INTEGER;
  const resolvedOrder =
    args.beatOrder.get(args.option.resolvedAtBeatId) ?? Number.MIN_SAFE_INTEGER;
  return (
    introducedOrder <= args.currentOrder &&
    (args.afterBeat
      ? resolvedOrder > args.currentOrder
      : resolvedOrder >= args.currentOrder)
  );
}

export function computeHorrorAffectPlanHash(
  plan: HorrorAffectPlanBody
): string {
  return hashText(stableSerialize(plan));
}

export function validateHorrorAffectPlan(
  input: HorrorAffectPlanBody
): readonly HorrorAffectPlanIssue[] {
  const plan = horrorAffectPlanBodySchema.parse(input);
  const issues: HorrorAffectPlanIssue[] = [];
  const beatOrder = new Map(
    plan.beatAffects.map((beat) => [beat.beatId, beat.order])
  );
  const orderedBeats = [...plan.beatAffects].sort(
    (left, right) => left.order - right.order
  );

  if (orderedBeats.some((beat, index) => beat.order !== index)) {
    issues.push({
      code: "BEAT_ORDER_INVALID",
      severity: "blocking",
      message: "Horror affect beats must use contiguous source order.",
    });
  }

  for (const question of plan.openQuestions) {
    const openedOrder = beatOrder.get(question.openedAtBeatId);
    const dueOrder = beatOrder.get(question.dueAtBeatId);
    if (
      openedOrder === undefined ||
      dueOrder === undefined ||
      openedOrder >= dueOrder
    ) {
      issues.push({
        code: "PRIMARY_QUESTION_ORDER_INVALID",
        severity: "blocking",
        message: `Question ${question.id} must open before its due beat.`,
      });
    }
    const dueBeat = plan.beatAffects.find(
      (beat) => beat.beatId === question.dueAtBeatId
    );
    if (!dueBeat?.paidOffQuestionIds.includes(question.id)) {
      issues.push({
        code: "PRIMARY_QUESTION_UNRESOLVED",
        severity: "blocking",
        message: `Question ${question.id} is not paid off at ${question.dueAtBeatId}.`,
        beatId: question.dueAtBeatId,
      });
    }
  }

  for (const beat of plan.beatAffects) {
    if (beat.order > 0 && !beat.continuity.cause.trim()) {
      issues.push({
        code: "CONTINUITY_CAUSE_MISSING",
        severity: "blocking",
        message: `Beat ${beat.beatId} has no causal predecessor or intentional transition.`,
        beatId: beat.beatId,
      });
    }
    if (beat.mode === "surprise") {
      const invalidSetup =
        beat.reversalSetupBeatIds.length === 0 ||
        beat.reversalSetupBeatIds.some(
          (setupId) =>
            (beatOrder.get(setupId) ?? Number.MAX_SAFE_INTEGER) >= beat.order
        );
      if (invalidSetup) {
        issues.push({
          code: "SURPRISE_SETUP_MISSING",
          severity: "blocking",
          message: `Surprise at ${beat.beatId} requires earlier source-supported setup.`,
          beatId: beat.beatId,
        });
      }
    }
  }

  for (const option of plan.responseOptions) {
    if (
      option.evidence.provenance === "unknown" ||
      genericFailedResponsePattern.test(option.observableResult) ||
      genericFailedResponsePattern.test(option.informationGained)
    ) {
      issues.push({
        code: "RESPONSE_NOT_SOURCE_SUPPORTED",
        severity: "blocking",
        message: `Response ${option.id} uses unsupported or generic evidence.`,
        beatId: option.resolvedAtBeatId,
        responseId: option.id,
      });
    }
    if (
      normalizeWhitespace(option.informationGained).length < 12 ||
      genericFailedResponsePattern.test(option.informationGained)
    ) {
      issues.push({
        code: "FAILED_RESPONSE_KNOWLEDGE_MISSING",
        severity: "blocking",
        message: `Response ${option.id} does not produce a concrete knowledge update.`,
        beatId: option.resolvedAtBeatId,
        responseId: option.id,
      });
    }
    const resolvedBeat = plan.beatAffects.find(
      (beat) => beat.beatId === option.resolvedAtBeatId
    );
    if (
      !resolvedBeat?.viableResponseIdsBefore.includes(option.id) ||
      resolvedBeat.viableResponseIdsAfter.includes(option.id) ||
      normalizeWhitespace(resolvedBeat.observableResult).length < 8
    ) {
      issues.push({
        code: "RESPONSE_DISAPPEARS_WITHOUT_RESULT",
        severity: "blocking",
        message: `Response ${option.id} must disappear only at a beat with an observable result.`,
        beatId: option.resolvedAtBeatId,
        responseId: option.id,
      });
    }
  }

  const climax = plan.beatAffects.find((beat) =>
    /\bclimax\b/iu.test(beat.evidence.sourceRefs.join(" "))
  );
  if (climax) {
    const establishedRule = plan.beatAffects
      .filter((beat) => beat.order < climax.order)
      .some(
        (beat) =>
          beat.ruleEvidence.length > 0 ||
          normalizeWhitespace(beat.ruleRefinement ?? "").length >= 8
      );
    if (!establishedRule) {
      issues.push({
        code: "CLIMAX_RULE_UNESTABLISHED",
        severity: "blocking",
        message:
          "The climax uses a rule that no earlier affect beat establishes.",
        beatId: climax.beatId,
      });
    }
  }

  return dedupeIssues(
    issues.map((issue) => horrorAffectPlanIssueSchema.parse(issue))
  );
}

export function buildHorrorAffectPlan(args: {
  readonly storyIr: StoryIR;
  readonly canonicalContract: CanonicalStoryContract;
  readonly mechanics: StoryMechanicsContract;
  readonly beats: readonly CanonicalStoryBeat[];
}): HorrorAffectPlan {
  if (args.beats.length < 2) {
    throw new Error(
      "Horror affect planning requires at least two canonical beats."
    );
  }

  const storyIrHash = hashText(stableSerialize(args.storyIr));
  const canonicalContractHash = hashText(
    stableSerialize(args.canonicalContract)
  );
  const mechanicsHash = hashStoryMechanicsContract(args.mechanics);
  const canonicalBeatsHash = hashCanonicalStoryBeats(args.beats);
  const protagonist =
    args.canonicalContract.characters[0]?.name ?? "the protagonist";
  const firstBeat = args.beats[0]!;
  const lastBeat = args.beats.at(-1)!;
  const reversalSetupBeatIds = args.beats
    .slice(0, -1)
    .filter((beat) =>
      ["EVIDENCE", "RULE_DISCOVERY", "FAILED_RESPONSE"].includes(beat.type)
    )
    .slice(-3)
    .map((beat) => beat.id);
  const surpriseSupported =
    reversalPattern.test(lastBeat.summary) && reversalSetupBeatIds.length > 0;
  const questionId = "primary-question";
  const question = horrorOpenQuestionSchema.parse({
    id: questionId,
    question: `What governs ${args.mechanics.centralThreat}, and what will ${protagonist} have to sacrifice to survive it?`,
    openedAtBeatId: firstBeat.id,
    partialAnswerBeatIds: args.beats
      .filter((beat) =>
        ["WARNING", "EVIDENCE", "RULE_DISCOVERY", "FAILED_RESPONSE"].includes(
          beat.type
        )
      )
      .map((beat) => beat.id),
    dueAtBeatId: lastBeat.id,
    resolution: surpriseSupported ? "reframed" : "answered",
    answerOrResidualUncertainty: args.canonicalContract.finalConsequence,
    evidence: evidence(
      [
        "canonical-contract:central-threat",
        "canonical-contract:protagonist-goal",
        "canonical-contract:final-consequence",
      ],
      "canonical-contract",
      "confirmed"
    ),
  });
  const responseResult = responseOptionsFromSource({
    beats: args.beats,
    mechanics: args.mechanics,
  });
  const beatOrder = new Map(args.beats.map((beat, index) => [beat.id, index]));
  let previousAudienceKnowledge = `The audience knows only that ${args.mechanics.centralThreat} is present.`;
  let previousProtagonistKnowledge = `${protagonist} has not yet understood the governing rule.`;

  const beatAffects = args.beats.map((beat, order) => {
    const sourceResponse = responseResult.options.find(
      (option) => option.resolvedAtBeatId === beat.id
    );
    const ruleEvidence = unique([
      ...beat.mechanicsReferences,
      ...(beat.type === "RULE_DISCOVERY"
        ? args.mechanics.ruleEvidence.filter((entry) =>
            sharesMeaningfulToken(entry, beat.summary)
          )
        : []),
    ]);
    const ruleRefinement =
      beat.type === "RULE_DISCOVERY" || beat.type === "FAILED_RESPONSE"
        ? beat.summary
        : undefined;
    const audienceKnowledgeAfter = ruleRefinement ?? beat.summary;
    const protagonistKnowledgeAfter = ruleRefinement ?? beat.summary;
    const affect = affectForBeat(beat, surpriseSupported);
    const beforeResponses = responseResult.options
      .filter((option) =>
        isResponseActive({
          option,
          beatOrder,
          currentOrder: order,
          afterBeat: false,
        })
      )
      .map((option) => option.id);
    const afterResponses = responseResult.options
      .filter((option) =>
        isResponseActive({
          option,
          beatOrder,
          currentOrder: order,
          afterBeat: true,
        })
      )
      .map((option) => option.id);
    const result = horrorBeatAffectSchema.parse({
      beatId: beat.id,
      order,
      mode: affect.mode,
      intensity: affect.intensity,
      audienceKnowledgeBefore: previousAudienceKnowledge,
      audienceKnowledgeAfter,
      protagonistKnowledgeBefore: previousProtagonistKnowledge,
      protagonistKnowledgeAfter,
      immediateThreat: args.mechanics.centralThreat,
      stake: args.mechanics.emotionalStake,
      action:
        sourceResponse?.action ??
        (beat.type === "CLIMAX" ? args.mechanics.climaxAction : beat.summary),
      observableResult: beat.summary,
      openedQuestionIds: order === 0 ? [questionId] : [],
      advancedQuestionIds: question.partialAnswerBeatIds.includes(beat.id)
        ? [questionId]
        : [],
      paidOffQuestionIds: beat.id === question.dueAtBeatId ? [questionId] : [],
      viableResponseIdsBefore: beforeResponses,
      viableResponseIdsAfter: afterResponses,
      continuity: {
        time: `Preserve source order at ${beat.id}.`,
        space:
          args.canonicalContract.locations[0]?.name ??
          "Use only the source-established location.",
        protagonist:
          beat.requiredCharacters[0] ??
          args.canonicalContract.characters[0]?.name ??
          protagonist,
        cause: order === 0 ? "source opening" : args.beats[order - 1]!.id,
        goal: args.canonicalContract.protagonistGoal,
        intentionalDiscourseJump: false,
      },
      ruleEvidence,
      ...(ruleRefinement ? { ruleRefinement } : {}),
      reversalSetupBeatIds:
        beat.id === lastBeat.id && surpriseSupported
          ? reversalSetupBeatIds
          : [],
      evidence: evidence(
        [
          `canonical-beat:${beat.id}`,
          ...(beat.type === "CLIMAX" ? ["mechanics:climax"] : []),
        ],
        "canonical-beat",
        "confirmed"
      ),
    });
    previousAudienceKnowledge = audienceKnowledgeAfter;
    previousProtagonistKnowledge = protagonistKnowledgeAfter;
    return result;
  });

  const initialBody: HorrorAffectPlanBody = horrorAffectPlanBodySchema.parse({
    schemaVersion: HORROR_AFFECT_PLAN_SCHEMA_VERSION,
    strategyVersion: HORROR_AFFECT_STRATEGY_VERSION,
    parents: {
      storyIrHash,
      canonicalContractHash,
      mechanicsHash,
      canonicalBeatsHash,
    },
    format: "full",
    profileId: "dark-truth",
    intensityPolicy: "restrained-moderate",
    primaryAudiencePromise: `The narration will reveal how ${args.mechanics.centralThreat} works through observable choices, failed responses, and the concrete cost paid by ${protagonist}.`,
    openQuestions: [question],
    beatAffects,
    responseOptions: responseResult.options,
    tensionShape: {
      lowBeatIds: beatAffects
        .filter((beat) => beat.intensity === "low")
        .map((beat) => beat.beatId),
      mediumBeatIds: beatAffects
        .filter((beat) => beat.intensity === "medium")
        .map((beat) => beat.beatId),
      highBeatIds: beatAffects
        .filter((beat) => beat.intensity === "high")
        .map((beat) => beat.beatId),
    },
    validation: {
      valid: true,
      issues: [],
    },
  });
  const issues = dedupeIssues([
    ...responseResult.issues,
    ...validateHorrorAffectPlan(initialBody),
  ]);
  const body = horrorAffectPlanBodySchema.parse({
    ...initialBody,
    validation: {
      valid: !issues.some((issue) => issue.severity === "blocking"),
      issues,
    },
  });
  return horrorAffectPlanSchema.parse({
    ...body,
    planHash: computeHorrorAffectPlanHash(body),
  });
}
