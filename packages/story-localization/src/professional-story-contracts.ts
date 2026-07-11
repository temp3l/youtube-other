import {
  countSpokenWords,
  hashText,
  normalizeWhitespace,
  splitIntoSentences,
} from "@mediaforge/shared";
import { z } from "zod";
import { stableSerialize } from "./stable-json.js";

export const PROFESSIONAL_STORY_POLICY_VERSION = "professional-story-policy-v1";
export const PROFESSIONAL_MECHANICS_SCHEMA_VERSION =
  "professional-mechanics-v1";
export const PROFESSIONAL_BEAT_SCHEMA_VERSION = "professional-beats-v1";
export const PROFESSIONAL_EDITORIAL_POLICY_VERSION =
  "professional-editorial-v1";
export const PROFESSIONAL_CACHE_SCHEMA_VERSION = "professional-story-cache-v1";

const requiredText = z.string().trim().min(1);

export const canonicalStoryFactsContractSchema = z
  .object({
    storyId: requiredText,
    characters: z.array(
      z
        .object({
          id: requiredText,
          name: requiredText,
          role: requiredText,
          relationships: z.array(
            z
              .object({
                targetCharacterId: requiredText,
                type: requiredText,
              })
              .strict()
          ),
        })
        .strict()
    ),
    setting: z
      .object({
        locations: z.array(requiredText).min(1),
        period: requiredText.optional(),
        environmentalConditions: z.array(requiredText),
      })
      .strict(),
    criticalObjects: z.array(
      z
        .object({
          id: requiredText,
          description: requiredText,
          narrativeFunction: requiredText,
        })
        .strict()
    ),
    immutableEvents: z.array(requiredText).min(1),
    sourceEvidence: z.array(requiredText),
    establishedWarnings: z.array(requiredText),
    requiredEndingFacts: z.array(requiredText).min(1),
    prohibitedChanges: z.array(requiredText),
    uncertainty: z.array(
      z.object({ field: requiredText, reason: requiredText }).strict()
    ),
  })
  .strict()
  .superRefine((facts, context) => {
    const characterIds = new Set(
      facts.characters.map((character) => character.id)
    );
    if (characterIds.size !== facts.characters.length) {
      context.addIssue({
        code: "custom",
        message: "Character IDs must be unique.",
      });
    }
    for (const character of facts.characters) {
      for (const relationship of character.relationships) {
        if (!characterIds.has(relationship.targetCharacterId)) {
          context.addIssue({
            code: "custom",
            message: `Unknown relationship target ${relationship.targetCharacterId}.`,
          });
        }
      }
    }
  });
export type ProfessionalCanonicalStoryFacts = z.infer<
  typeof canonicalStoryFactsContractSchema
>;

export const storyExperimentSchema = z
  .object({
    id: requiredText,
    question: requiredText,
    physicalSetup: requiredText,
    protagonistAction: requiredText,
    observableResult: requiredText,
    ruleRefinement: requiredText,
    escalation: requiredText,
  })
  .strict();
export type StoryExperiment = z.infer<typeof storyExperimentSchema>;

export const professionalStoryMechanicsSchema = z
  .object({
    centralThreat: requiredText,
    supernaturalRule: z
      .object({
        trigger: requiredText,
        effect: requiredText,
        strengtheningConditions: z.array(requiredText),
        limitations: z.array(requiredText).min(1),
        exceptions: z.array(requiredText),
      })
      .strict(),
    protagonist: z
      .object({
        goal: requiredText,
        emotionalStake: requiredText,
        emotionalCost: requiredText,
        falseBelief: requiredText.optional(),
      })
      .strict(),
    evidenceProgression: z
      .array(
        z
          .object({
            id: requiredText,
            observation: requiredText,
            implication: requiredText,
          })
          .strict()
      )
      .min(2),
    failedExperiments: z
      .array(
        z
          .object({
            id: requiredText,
            question: requiredText,
            action: requiredText,
            physicalObjects: z.array(requiredText).min(1),
            observableResult: requiredText,
            ruleLearned: requiredText,
            escalationCaused: requiredText,
          })
          .strict()
      )
      .min(2),
    climax: z
      .object({
        protagonistAction: requiredText,
        ruleConnection: requiredText,
        foreshadowingEvidenceIds: z.array(requiredText).min(2),
        concreteCost: requiredText,
        immediateConsequence: requiredText,
      })
      .strict(),
    finalReveal: z
      .object({
        concreteImageOrSound: requiredText,
        contradiction: requiredText,
        endingConsequence: requiredText,
      })
      .strict(),
  })
  .strict();
export type ProfessionalStoryMechanics = z.infer<
  typeof professionalStoryMechanicsSchema
>;

export const mechanicsIssueCodes = [
  "MISSING_SUPERNATURAL_RULE",
  "UNCLEAR_RULE_TRIGGER",
  "UNCLEAR_RULE_EFFECT",
  "RULE_NOT_DEMONSTRATED",
  "FAILED_EXPERIMENT_REVEALS_NOTHING",
  "GENERIC_EMOTIONAL_STAKE",
  "MISSING_EMOTIONAL_COST",
  "UNFORESHADOWED_CLIMAX_MECHANIC",
  "CLIMAX_RULE_MISMATCH",
  "ENDING_NOT_CAUSALLY_SUPPORTED",
] as const;
export type MechanicsIssueCode = (typeof mechanicsIssueCodes)[number];

export interface ContractIssue<TCode extends string> {
  readonly code: TCode;
  readonly severity: "minor" | "major" | "critical";
  readonly message: string;
}

const genericStakePattern =
  /\b(?:job|reputation|piece of evidence|someone or something|everything they cared about)\b/iu;
const normalizeTokens = (value: string): Set<string> =>
  new Set(
    normalizeWhitespace(value)
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length >= 4)
  );
function sharesMeaningfulToken(left: string, right: string): boolean {
  const rightTokens = normalizeTokens(right);
  return [...normalizeTokens(left)].some((token) => rightTokens.has(token));
}

export function validateProfessionalMechanics(
  input: ProfessionalStoryMechanics
): readonly ContractIssue<MechanicsIssueCode>[] {
  const mechanics = professionalStoryMechanicsSchema.parse(input);
  const issues: ContractIssue<MechanicsIssueCode>[] = [];
  if (normalizeWhitespace(mechanics.supernaturalRule.trigger).length < 8)
    issues.push({
      code: "UNCLEAR_RULE_TRIGGER",
      severity: "critical",
      message: "The supernatural trigger is not concrete.",
    });
  if (normalizeWhitespace(mechanics.supernaturalRule.effect).length < 8)
    issues.push({
      code: "UNCLEAR_RULE_EFFECT",
      severity: "critical",
      message: "The supernatural effect is not observable.",
    });
  if (mechanics.evidenceProgression.length < 2)
    issues.push({
      code: "RULE_NOT_DEMONSTRATED",
      severity: "critical",
      message: "At least two evidence beats must demonstrate the rule.",
    });
  if (
    mechanics.failedExperiments.some(
      (experiment) => normalizeWhitespace(experiment.ruleLearned).length < 8
    )
  )
    issues.push({
      code: "FAILED_EXPERIMENT_REVEALS_NOTHING",
      severity: "major",
      message: "Every failed experiment must refine the rule.",
    });
  if (genericStakePattern.test(mechanics.protagonist.emotionalStake))
    issues.push({
      code: "GENERIC_EMOTIONAL_STAKE",
      severity: "critical",
      message: "The emotional stake is generic.",
    });
  if (
    normalizeWhitespace(mechanics.protagonist.emotionalCost).length < 12 ||
    genericStakePattern.test(mechanics.protagonist.emotionalCost)
  )
    issues.push({
      code: "MISSING_EMOTIONAL_COST",
      severity: "critical",
      message: "The emotional cost must be specific and visible.",
    });
  const evidenceIds = new Set(
    mechanics.evidenceProgression.map((evidence) => evidence.id)
  );
  if (
    mechanics.climax.foreshadowingEvidenceIds.some((id) => !evidenceIds.has(id))
  )
    issues.push({
      code: "UNFORESHADOWED_CLIMAX_MECHANIC",
      severity: "critical",
      message: "The climax references evidence that was not established.",
    });
  const ruleText = `${mechanics.supernaturalRule.trigger} ${mechanics.supernaturalRule.effect} ${mechanics.supernaturalRule.limitations.join(" ")}`;
  if (!sharesMeaningfulToken(mechanics.climax.ruleConnection, ruleText))
    issues.push({
      code: "CLIMAX_RULE_MISMATCH",
      severity: "critical",
      message: "The climax does not use the established rule or limitation.",
    });
  if (
    !sharesMeaningfulToken(
      mechanics.finalReveal.endingConsequence,
      `${mechanics.climax.immediateConsequence} ${mechanics.finalReveal.contradiction}`
    )
  )
    issues.push({
      code: "ENDING_NOT_CAUSALLY_SUPPORTED",
      severity: "major",
      message: "The ending is not causally connected to the climax.",
    });
  return issues;
}

export const professionalStoryBeatTypeSchema = z.enum([
  "HOOK",
  "SETUP",
  "WARNING",
  "EXPERIMENT",
  "EVIDENCE",
  "RULE_DISCOVERY",
  "FAILED_RESPONSE",
  "PERSONAL_ESCALATION",
  "EMOTIONAL_DILEMMA",
  "CLIMAX_PREPARATION",
  "CLIMAX",
  "COST",
  "FALSE_RELIEF",
  "FINAL_REVEAL",
]);
export const professionalStoryBeatSchema = z
  .object({
    id: z.string().regex(/^beat-\d{3}$/u),
    order: z.number().int().nonnegative(),
    type: professionalStoryBeatTypeSchema,
    purpose: requiredText,
    requiredFacts: z.array(requiredText),
    requiredCharacters: z.array(requiredText),
    requiredObjects: z.array(requiredText),
    mechanicsReferences: z.array(requiredText),
    visualAnchors: z.array(requiredText),
    sensoryAnchors: z.array(requiredText),
    entryState: requiredText,
    characterAction: requiredText,
    observableOutcome: requiredText,
    exitQuestion: requiredText.optional(),
  })
  .strict();
export type ProfessionalStoryBeat = z.infer<typeof professionalStoryBeatSchema>;

export type BeatPlanIssueCode =
  | "BEAT_ORDER_INVALID"
  | "BEAT_COUNT_OUT_OF_RANGE"
  | "BEAT_ARCHITECTURE_INCOMPLETE"
  | "EXPERIMENT_NOT_CONCRETE";
export function validateProfessionalBeatPlan(
  beats: readonly ProfessionalStoryBeat[]
): readonly ContractIssue<BeatPlanIssueCode>[] {
  const parsed = z.array(professionalStoryBeatSchema).parse(beats);
  const issues: ContractIssue<BeatPlanIssueCode>[] = [];
  if (parsed.some((beat, index) => beat.order !== index))
    issues.push({
      code: "BEAT_ORDER_INVALID",
      severity: "critical",
      message: "Beat order must be contiguous and stable.",
    });
  if (parsed.length < 12 || parsed.length > 16)
    issues.push({
      code: "BEAT_COUNT_OUT_OF_RANGE",
      severity: "major",
      message: "Full stories should contain 12-16 semantic beats.",
    });
  const types = new Set(parsed.map((beat) => beat.type));
  const required = [
    "HOOK",
    "SETUP",
    "WARNING",
    "EVIDENCE",
    "RULE_DISCOVERY",
    "FAILED_RESPONSE",
    "PERSONAL_ESCALATION",
    "EMOTIONAL_DILEMMA",
    "CLIMAX",
    "COST",
    "FINAL_REVEAL",
  ] as const;
  if (
    required.some((type) => !types.has(type)) ||
    parsed.filter((beat) => beat.type === "EXPERIMENT").length < 2
  )
    issues.push({
      code: "BEAT_ARCHITECTURE_INCOMPLETE",
      severity: "critical",
      message:
        "The beat plan is missing required professional story functions or two experiments.",
    });
  if (
    parsed
      .filter((beat) => beat.type === "EXPERIMENT")
      .some(
        (beat) =>
          beat.requiredObjects.length === 0 ||
          beat.visualAnchors.length === 0 ||
          normalizeWhitespace(beat.observableOutcome).length < 8
      )
  )
    issues.push({
      code: "EXPERIMENT_NOT_CONCRETE",
      severity: "critical",
      message:
        "Experiments require an object, visible setup, and observable outcome.",
    });
  return issues;
}

export const storyQualityIssueCodes = [
  "META_NARRATION",
  "EDITORIAL_COMMENTARY_IN_NARRATION",
  "UNRESOLVED_TEMPLATE_ALTERNATIVE",
  "GENERIC_CHARACTER_REFERENCE",
  "GENERIC_EVIDENCE_REFERENCE",
  "GENERIC_EMOTIONAL_STAKE",
  "ABSTRACT_ESCALATION",
  "EXPLANATION_AFTER_FINAL_REVEAL",
] as const;
export type ProfessionalStoryQualityIssueCode =
  (typeof storyQualityIssueCodes)[number];
const antiPatterns: readonly [ProfessionalStoryQualityIssueCode, RegExp][] = [
  [
    "META_NARRATION",
    /\b(?:the episode(?:'s)?|the protagonist|the audience)\b/iu,
  ],
  [
    "EDITORIAL_COMMENTARY_IN_NARRATION",
    /\b(?:the purpose of (?:the )?sound was|the final action worked because|the story remains disturbing because|the first piece of evidence|the official explanation was incomplete)\b/iu,
  ],
  [
    "ABSTRACT_ESCALATION",
    /\b(?:the account accelerated|the discovery changed the emotional stakes)\b/iu,
  ],
  ["GENERIC_CHARACTER_REFERENCE", /\bsomeone or something\b/iu],
  [
    "GENERIC_EVIDENCE_REFERENCE",
    /\b(?:a witness,? (?:a )?recording or (?:a )?physical (?:trace|mark)|investigators,? relatives or employers|the central (?:sound|sign) or (?:sign|sound))\b/iu,
  ],
  [
    "GENERIC_EMOTIONAL_STAKE",
    /\ba job,? (?:a )?reputation or (?:a )?piece of evidence\b/iu,
  ],
];

export function detectProfessionalStoryQualityIssues(
  text: string
): readonly ContractIssue<ProfessionalStoryQualityIssueCode>[] {
  const normalized = normalizeWhitespace(text);
  const issues: ContractIssue<ProfessionalStoryQualityIssueCode>[] = [];
  for (const [code, pattern] of antiPatterns) {
    if (pattern.test(normalized))
      issues.push({
        code,
        severity: "critical",
        message: `Narration contains prohibited professional-quality pattern: ${code}.`,
      });
  }
  const sentences = splitIntoSentences(normalized);
  const alternativePattern =
    /\b(?:a|an|the|his|her|their)\s+[\p{L}-]+(?:,\s+(?:a|an|the|his|her|their)?\s*[\p{L}-]+){1,2}\s+or\s+(?:a|an|the|his|her|their)?\s*[\p{L}-]+\b/iu;
  if (sentences.some((sentence) => alternativePattern.test(sentence)))
    issues.push({
      code: "UNRESOLVED_TEMPLATE_ALTERNATIVE",
      severity: "critical",
      message: "Narration contains unresolved authoring alternatives.",
    });
  const finalRevealIndex = sentences.findIndex((sentence) =>
    /\b(?:revealed|showed|displayed|read|recording|message|photograph|voice|reflection)\b/iu.test(
      sentence
    )
  );
  if (
    finalRevealIndex >= 0 &&
    finalRevealIndex < sentences.length - 1 &&
    sentences
      .slice(finalRevealIndex + 1)
      .some((sentence) =>
        /\b(?:because|this meant|the story|the reason|in other words)\b/iu.test(
          sentence
        )
      )
  )
    issues.push({
      code: "EXPLANATION_AFTER_FINAL_REVEAL",
      severity: "critical",
      message: "Explanatory commentary follows the concrete reveal.",
    });
  return issues;
}

export interface NarrationMetrics {
  readonly wordCount: number;
  readonly estimatedSpeechSeconds: number;
  readonly estimatedTotalSeconds: number;
  readonly targetMinimumSeconds: number;
  readonly targetMaximumSeconds: number;
}
export type NarrationLengthIssueCode =
  | "NARRATION_TOO_SHORT"
  | "NARRATION_TOO_LONG"
  | "DURATION_BELOW_TARGET"
  | "DURATION_ABOVE_TARGET";
export function calculateNarrationMetrics(args: {
  readonly narration: string;
  readonly wordsPerMinute: number;
  readonly dramaticPauseSeconds: number;
  readonly targetMinimumSeconds: number;
  readonly targetMaximumSeconds: number;
}): NarrationMetrics {
  if (!Number.isFinite(args.wordsPerMinute) || args.wordsPerMinute <= 0)
    throw new Error("wordsPerMinute must be positive.");
  const wordCount = countSpokenWords(normalizeWhitespace(args.narration));
  const estimatedSpeechSeconds = (wordCount / args.wordsPerMinute) * 60;
  return {
    wordCount,
    estimatedSpeechSeconds,
    estimatedTotalSeconds:
      estimatedSpeechSeconds + Math.max(0, args.dramaticPauseSeconds),
    targetMinimumSeconds: args.targetMinimumSeconds,
    targetMaximumSeconds: args.targetMaximumSeconds,
  };
}
export function validateNarrationMetrics(
  metrics: NarrationMetrics
): readonly ContractIssue<NarrationLengthIssueCode>[] {
  if (metrics.estimatedTotalSeconds < metrics.targetMinimumSeconds)
    return [
      {
        code: "DURATION_BELOW_TARGET",
        severity: "critical",
        message: "Narration duration is below target.",
      },
    ];
  if (metrics.estimatedTotalSeconds > metrics.targetMaximumSeconds)
    return [
      {
        code: "DURATION_ABOVE_TARGET",
        severity: "critical",
        message: "Narration duration is above target.",
      },
    ];
  return [];
}

export const editorialReviewSchema = z
  .object({
    status: z.enum([
      "READY",
      "READY_WITH_MINOR_EDITS",
      "REVISION_REQUIRED",
      "REWRITE_REQUIRED",
      "BLOCKED",
    ]),
    scores: z
      .object({
        hook: z.number().min(0).max(10),
        firstTwentySeconds: z.number().min(0).max(10),
        concreteSceneWriting: z.number().min(0).max(10),
        escalation: z.number().min(0).max(10),
        experimentQuality: z.number().min(0).max(10),
        supernaturalRule: z.number().min(0).max(10),
        emotionalStake: z.number().min(0).max(10),
        emotionalCost: z.number().min(0).max(10),
        climax: z.number().min(0).max(10),
        finalReveal: z.number().min(0).max(10),
        narrationNaturalness: z.number().min(0).max(10),
        originality: z.number().min(0).max(10),
      })
      .strict(),
    issues: z.array(
      z
        .object({
          code: requiredText,
          severity: z.enum(["minor", "major", "critical"]),
          beatIds: z.array(requiredText),
          evidence: requiredText,
          repairInstruction: requiredText,
        })
        .strict()
    ),
  })
  .strict();
export type EditorialReview = z.infer<typeof editorialReviewSchema>;
export interface EditorialThresholds {
  readonly overallAverage: number;
  readonly hook: number;
  readonly firstTwentySeconds: number;
  readonly supernaturalRule: number;
  readonly emotionalCost: number;
  readonly climax: number;
  readonly finalReveal: number;
  readonly allowMinorEditsToProceed: boolean;
}
export const DEFAULT_EDITORIAL_THRESHOLDS: EditorialThresholds = {
  overallAverage: 8.3,
  hook: 8.5,
  firstTwentySeconds: 8,
  supernaturalRule: 8,
  emotionalCost: 7.8,
  climax: 8,
  finalReveal: 8.3,
  allowMinorEditsToProceed: false,
};
export function editorialReviewCanProceed(
  review: EditorialReview,
  thresholds: EditorialThresholds = DEFAULT_EDITORIAL_THRESHOLDS
): boolean {
  const parsed = editorialReviewSchema.parse(review);
  const scores = Object.values(parsed.scores);
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return (
    !parsed.issues.some((issue) => issue.severity === "critical") &&
    average >= thresholds.overallAverage &&
    parsed.scores.hook >= thresholds.hook &&
    parsed.scores.firstTwentySeconds >= thresholds.firstTwentySeconds &&
    parsed.scores.supernaturalRule >= thresholds.supernaturalRule &&
    parsed.scores.emotionalCost >= thresholds.emotionalCost &&
    parsed.scores.climax >= thresholds.climax &&
    parsed.scores.finalReveal >= thresholds.finalReveal &&
    (parsed.status === "READY" ||
      (thresholds.allowMinorEditsToProceed &&
        parsed.status === "READY_WITH_MINOR_EDITS"))
  );
}

export const storyPipelineStages = [
  "SOURCE_VALIDATED",
  "FACTS_EXTRACTED",
  "MECHANICS_APPROVED",
  "BEATS_APPROVED",
  "ENGLISH_GENERATED",
  "ENGLISH_REVIEWED",
  "ENGLISH_READY",
  "LOCALIZATIONS_GENERATED",
  "LOCALIZATIONS_READY",
  "SHORTS_GENERATED",
  "SHORTS_READY",
  "METADATA_READY",
  "PRODUCTION_READY",
] as const;
export type StoryPipelineStage = (typeof storyPipelineStages)[number];
export function assertStoryPipelineStage(
  current: StoryPipelineStage,
  required: StoryPipelineStage
): void {
  if (
    storyPipelineStages.indexOf(current) < storyPipelineStages.indexOf(required)
  )
    throw new Error(
      `Stage ${required} is required; current stage is ${current}.`
    );
}

export const shortStoryContractSchema = z
  .object({
    hookBeatId: requiredText,
    threatBeatId: requiredText,
    ruleBeatId: requiredText,
    escalationBeatIds: z.array(requiredText).min(1),
    climaxBeatId: requiredText,
    finalRevealBeatId: requiredText,
    targetDurationSeconds: z
      .object({
        minimum: z.number().positive(),
        maximum: z.number().positive(),
      })
      .strict(),
  })
  .strict()
  .refine(
    (contract) =>
      contract.targetDurationSeconds.minimum <=
      contract.targetDurationSeconds.maximum,
    { message: "Short duration range is invalid." }
  );
export type ShortStoryContract = z.infer<typeof shortStoryContractSchema>;

export type ProfessionalStoryRepairScope =
  | "HOOK"
  | "SETUP"
  | "EXPERIMENT"
  | "META_NARRATION"
  | "EMOTIONAL_STAKE"
  | "EMOTIONAL_COST"
  | "CLIMAX"
  | "ENDING"
  | "LENGTH"
  | "FULL_REWRITE";

export interface ProfessionalCacheKeyInput {
  readonly sourceContentHash: string;
  readonly fictionalNameMappingHash: string;
  readonly factSchemaVersion: string;
  readonly mechanicsSchemaVersion: string;
  readonly beatSchemaVersion: string;
  readonly rewritePromptVersion: string;
  readonly editorialPolicyVersion: string;
  readonly localizationPromptVersion: string;
  readonly localizationPolicyVersion: string;
  readonly shortPromptVersion: string;
  readonly shortPolicyVersion: string;
  readonly localeProfileVersion: string;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly generationSettings: Readonly<
    Record<string, string | number | boolean>
  >;
}
export function buildProfessionalStoryCacheKey(
  input: ProfessionalCacheKeyInput
): string {
  return hashText(
    stableSerialize({
      schemaVersion: PROFESSIONAL_CACHE_SCHEMA_VERSION,
      ...input,
    })
  );
}
