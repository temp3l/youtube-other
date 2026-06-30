import { z } from "zod";
import { getLanguageProfile } from "./language-profiles.js";
import {
  languageCodes,
  type CanonicalStoryFacts,
  type GeneratedStoryPackage,
  type LanguageCode,
  type ParsedSourceStory,
} from "./story-localization.types.js";
import {
  type OriginalityReview,
  type RetentionBeat,
  type StoryBible,
  type StorySourceAnalysis,
} from "./story-production.js";
import {
  type ShortRewriteArtifact,
  type ShortRewriteJsonSidecar,
} from "./short-rewrite.types.js";

export const STORY_ARTIFACT_VARIANTS = ["full", "short"] as const;
export const storyArtifactVariantSchema = z.enum(STORY_ARTIFACT_VARIANTS);
export type StoryArtifactVariant = z.infer<typeof storyArtifactVariantSchema>;

export const STORY_ARTIFACT_OWNERS = [
  "narration",
  "analysis",
  "metadata",
  "audio",
  "scene-plan",
  "image-plan",
  "render",
  "publication",
] as const;
export const storyArtifactOwnerSchema = z.enum(STORY_ARTIFACT_OWNERS);
export type StoryArtifactOwner = z.infer<typeof storyArtifactOwnerSchema>;

const localePattern = /^[a-z]{2}(?:-[a-z0-9]{2,8})*$/iu;

export const storyArtifactIdentitySchema = z
  .object({
    episodeNumber: z.string().trim().min(1),
    episodeSlug: z.string().trim().min(1),
    language: z.enum(languageCodes),
    locale: z.string().trim().regex(localePattern),
    variant: storyArtifactVariantSchema,
  })
  .strict();
export type StoryArtifactIdentity = z.infer<typeof storyArtifactIdentitySchema>;

export const targetWordRangeSchema = z
  .object({
    min: z.number().int().positive().finite(),
    max: z.number().int().positive().finite(),
  })
  .strict()
  .refine((range) => range.min <= range.max, {
    message: "Target word range minimum must be less than or equal to maximum.",
    path: ["min"],
  });
export type TargetWordRange = z.infer<typeof targetWordRangeSchema>;

const targetDurationRangeSchema = z
  .object({
    minSeconds: z.number().int().positive().finite(),
    maxSeconds: z.number().int().positive().finite(),
  })
  .strict()
  .refine((range) => range.minSeconds <= range.maxSeconds, {
    message: "Target duration minimum must be less than or equal to maximum.",
    path: ["minSeconds"],
  });

export const fullStoryOutputConstraintsSchema = z
  .object({
    variant: z.literal("full"),
    targetWordRange: targetWordRangeSchema,
    targetNarrationWpm: z.number().int().min(120).max(220).finite(),
    targetDuration: targetDurationRangeSchema.optional(),
    preserveChapterScale: z.boolean().optional(),
  })
  .strict();
export type FullStoryOutputConstraints = z.infer<
  typeof fullStoryOutputConstraintsSchema
>;

export const shortStoryOutputConstraintsSchema = z
  .object({
    variant: z.literal("short"),
    targetWordRange: targetWordRangeSchema,
    targetNarrationWpm: z.number().int().min(120).max(220).finite(),
    targetDuration: targetDurationRangeSchema,
    hookDeadlineSeconds: z.number().int().positive().finite(),
    fullVideoBridgeRequired: z.boolean(),
  })
  .strict();
export type ShortStoryOutputConstraints = z.infer<
  typeof shortStoryOutputConstraintsSchema
>;

export const storyOutputConstraintsSchema = z.discriminatedUnion("variant", [
  fullStoryOutputConstraintsSchema,
  shortStoryOutputConstraintsSchema,
]);
export type StoryOutputConstraints = z.infer<typeof storyOutputConstraintsSchema>;

export const CANONICAL_STORY_GENRES = [
  "fictional-supernatural",
  "fictional-psychological",
  "historical-mystery",
  "true-crime",
  "documentary",
  "folklore",
  "unknown",
] as const;
export const storyGenreSchema = z.enum(CANONICAL_STORY_GENRES);
export type StoryGenre = z.infer<typeof storyGenreSchema>;

export const LEGACY_STORY_GENRES = [...CANONICAL_STORY_GENRES, "horror"] as const;
export const storyGenreCompatibilitySchema = z.enum(LEGACY_STORY_GENRES);
export type StoryGenreCompatibility = z.infer<typeof storyGenreCompatibilitySchema>;

export const fictionalitySchema = z.enum([
  "fiction",
  "nonfiction",
  "fiction-inspired-by-folklore",
  "unknown",
]);
export type Fictionality = z.infer<typeof fictionalitySchema>;

export const NARRATIVE_MODES = [
  "character-led",
  "evidence-led",
  "first-person",
  "documentary",
  "unknown",
] as const;
export const narrativeModeSchema = z.enum(NARRATIVE_MODES);
export type NarrativeMode = z.infer<typeof narrativeModeSchema>;

export const storyEntityTypeSchema = z.enum([
  "person",
  "group",
  "location",
  "object",
  "organization",
  "event",
  "phenomenon",
  "written-message",
  "rule",
]);
export type StoryEntityType = z.infer<typeof storyEntityTypeSchema>;

export const storyIrEntitySchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    type: storyEntityTypeSchema,
    narrativeRole: z.string().trim().min(1).optional(),
    relationship: z.string().trim().min(1).optional(),
  })
  .strict();
export type StoryIrEntity = z.infer<typeof storyIrEntitySchema>;

export const storyFactConfidenceSchema = z.enum([
  "confirmed",
  "probable",
  "disputed",
  "unknown",
]);
export type StoryFactConfidence = z.infer<typeof storyFactConfidenceSchema>;

export const storyFactSchema = z
  .object({
    id: z.string().trim().min(1),
    statement: z.string().trim().min(1),
    confidence: storyFactConfidenceSchema,
    immutable: z.boolean(),
  })
  .strict();
export type StoryFact = z.infer<typeof storyFactSchema>;

export const centralThreatSchema = z
  .object({
    type: z.enum([
      "person",
      "group",
      "supernatural",
      "environmental",
      "psychological",
      "unknown",
    ]),
    description: z.string().trim().min(1),
    intelligent: z.boolean(),
  })
  .strict();

export const centralRuleMechanismSchema = z
  .object({
    description: z.string().trim().min(1),
    supernatural: z.boolean(),
  })
  .strict();

export const criticalObjectSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    narrativeFunction: z.string().trim().min(1),
    origin: z.string().trim().min(1).optional(),
  })
  .strict();

export const writtenMessageSchema = z
  .object({
    text: z.string().trim().min(1),
    preserveVerbatim: z.boolean(),
    sourceSegmentId: z.string().trim().min(1).optional(),
  })
  .strict();

export const allowedInventionBoundariesSchema = z
  .object({
    dialogue: z.boolean(),
    internalThoughts: z.boolean(),
    connectiveDetails: z.boolean(),
    motives: z.boolean(),
    undocumentedActions: z.boolean(),
    notes: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();
export type AllowedInventionBoundaries = z.infer<
  typeof allowedInventionBoundariesSchema
>;

export const storyIrSchema = z
  .object({
    genre: storyGenreSchema,
    fictionality: fictionalitySchema,
    narrativeMode: narrativeModeSchema,
    entities: z.array(storyIrEntitySchema),
    immutableFacts: z.array(storyFactSchema),
    chronology: z.array(z.string().trim().min(1)),
    centralThreat: centralThreatSchema,
    centralRuleMechanism: centralRuleMechanismSchema,
    criticalObjects: z.array(criticalObjectSchema),
    writtenMessages: z.array(writtenMessageSchema),
    climax: z.string().trim().min(1),
    endingConsequence: z.string().trim().min(1),
    allowedInventionBoundaries: allowedInventionBoundariesSchema,
  })
  .strict();
export type StoryIR = z.infer<typeof storyIrSchema>;

const legacyAllowedInventionBoundariesSchema = z
  .object({
    dialogue: z.boolean(),
    internalThoughts: z.boolean(),
    connectiveDetails: z.boolean(),
    motives: z.boolean().optional(),
    undocumentedActions: z.boolean().optional(),
    notes: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

export const storyIrCompatibilitySchema = z
  .object({
    genre: storyGenreCompatibilitySchema,
    fictionality: fictionalitySchema,
    narrativeMode: narrativeModeSchema.optional(),
    entities: z.array(storyIrEntitySchema),
    immutableFacts: z.array(storyFactSchema),
    chronology: z.array(z.string().trim().min(1)),
    centralThreat: centralThreatSchema,
    centralRuleMechanism: centralRuleMechanismSchema,
    criticalObjects: z.array(criticalObjectSchema),
    writtenMessages: z.array(writtenMessageSchema),
    climax: z.string().trim().min(1),
    endingConsequence: z.string().trim().min(1),
    allowedInventionBoundaries: legacyAllowedInventionBoundariesSchema,
  })
  .strict();

export const storyArtifactSchema = z
  .object({
    owner: storyArtifactOwnerSchema,
    artifactType: z.enum([
      "generated-full-package",
      "short-rewrite-sidecar",
      "short-rewrite-artifact",
    ]),
    identity: storyArtifactIdentitySchema,
    constraints: storyOutputConstraintsSchema.optional(),
    title: z.string().trim().min(1).optional(),
    sourcePath: z.string().trim().min(1).optional(),
    promptVersion: z.string().trim().min(1).optional(),
    model: z.string().trim().min(1).optional(),
    generatedAt: z.string().trim().min(1).optional(),
  })
  .strict();
export type StoryArtifact = z.infer<typeof storyArtifactSchema>;

export const storyArtifactNormalizationResultSchema = z
  .object({
    artifact: storyArtifactSchema,
    warnings: z.array(z.string().trim().min(1)),
  })
  .strict();
export type StoryArtifactNormalizationResult = z.infer<
  typeof storyArtifactNormalizationResultSchema
>;

export const STORY_VALIDATION_ISSUE_CODES = [
  "LOCATION_CLASSIFIED_AS_CHARACTER",
  "EVENT_CLASSIFIED_AS_CHARACTER",
  "SUPERNATURAL_RULE_IN_NONFICTION",
  "INVALID_WORD_RANGE",
  "FULL_STORY_ROUTED_TO_SHORT_GENERATOR",
  "SHORT_STORY_ROUTED_TO_FULL_REGENERATION",
  "CONFLICTING_GENRE_AND_FICTIONALITY",
  "NARRATIVE_MODE_INCOMPATIBLE_WITH_GENRE",
  "SUPERNATURAL_RULE_IN_HISTORICAL_MYSTERY",
  "INVENTED_DIALOGUE_ENABLED_FOR_NONFICTION",
  "INVENTED_INTERNAL_THOUGHTS_ENABLED_FOR_NONFICTION",
  "INVENTED_MOTIVES_ENABLED_FOR_NONFICTION",
  "UNDOCUMENTED_ACTIONS_ENABLED_FOR_NONFICTION",
  "ENVIRONMENTAL_THREAT_MARKED_INTELLIGENT",
  "UNKNOWN_GENRE_REQUIRES_CONSERVATIVE_POLICY",
  "FICTIONALITY_UNRESOLVED_FOR_EVIDENCE_LED_GENRE",
  "GENRE_POLICY_NOT_FOUND",
  "GENRE_POLICY_VERSION_UNSUPPORTED",
  "POLICY_OVERRIDE_WEAKENS_SOURCE_BOUNDARY",
  "MISSING_REQUIRED_ENDING",
  "MISSING_NARRATIVE_CULMINATION",
  "EMPTY_OR_GENERIC_THREAT",
  "CONTRACT_SOURCE_IR_INVALID",
  "DUPLICATE_ENTITY_WITH_CONFLICTING_TYPE",
  "CONFLICTING_FACT_STATEMENTS",
  "LOCALIZED_FULL_PARENT_REQUIRED",
  "LOCALIZED_FULL_PARENT_INVALID",
  "LOCALIZED_FULL_WRONG_LANGUAGE",
  "LOCALIZED_FULL_WRONG_LOCALE",
  "LOCALIZED_FULL_LOCALE_LEAKAGE",
  "LOCALIZED_FULL_SOURCE_LANGUAGE_LEAKAGE",
  "LOCALIZED_FULL_UNTRANSLATED_BOILERPLATE",
  "LOCALIZED_FULL_METADATA_LEAKAGE",
  "LOCALIZED_FULL_DUPLICATED_SECTIONS",
  "LOCALIZED_FULL_TRUNCATED",
] as const;
export const storyValidationIssueCodeSchema = z.enum(
  STORY_VALIDATION_ISSUE_CODES
);
export type StoryValidationIssueCode = z.infer<
  typeof storyValidationIssueCodeSchema
>;

const baseIssueSchema = z
  .object({
    code: storyValidationIssueCodeSchema,
    path: z.array(z.union([z.string(), z.number()])),
    message: z.string().trim().min(1),
    severity: z.enum(["warning", "error"]),
    repairability: z.enum(["manual", "deterministic", "regenerate"]),
  })
  .strict();

export const locationClassifiedAsCharacterIssueSchema = baseIssueSchema.extend({
  code: z.literal("LOCATION_CLASSIFIED_AS_CHARACTER"),
  entityId: z.string().trim().min(1),
  entityName: z.string().trim().min(1),
});
export const eventClassifiedAsCharacterIssueSchema = baseIssueSchema.extend({
  code: z.literal("EVENT_CLASSIFIED_AS_CHARACTER"),
  entityId: z.string().trim().min(1),
  entityName: z.string().trim().min(1),
});
export const supernaturalRuleInNonfictionIssueSchema = baseIssueSchema.extend({
  code: z.literal("SUPERNATURAL_RULE_IN_NONFICTION"),
  ruleText: z.string().trim().min(1),
});
export const invalidWordRangeIssueSchema = baseIssueSchema.extend({
  code: z.literal("INVALID_WORD_RANGE"),
  range: z
    .object({
      min: z.unknown().optional(),
      max: z.unknown().optional(),
    })
    .strict(),
});
export const fullStoryRoutedToShortGeneratorIssueSchema = baseIssueSchema.extend({
  code: z.literal("FULL_STORY_ROUTED_TO_SHORT_GENERATOR"),
  requestedVariant: z.literal("full"),
  routedVariant: z.literal("short"),
});
export const shortStoryRoutedToFullRegenerationIssueSchema =
  baseIssueSchema.extend({
    code: z.literal("SHORT_STORY_ROUTED_TO_FULL_REGENERATION"),
    requestedVariant: z.literal("short"),
    routedVariant: z.literal("full"),
  });
export const conflictingGenreAndFictionalityIssueSchema =
  baseIssueSchema.extend({
    code: z.literal("CONFLICTING_GENRE_AND_FICTIONALITY"),
    genre: storyGenreSchema,
    fictionality: fictionalitySchema,
  });
export const narrativeModeIncompatibleWithGenreIssueSchema =
  baseIssueSchema.extend({
    code: z.literal("NARRATIVE_MODE_INCOMPATIBLE_WITH_GENRE"),
    genre: storyGenreSchema,
    narrativeMode: narrativeModeSchema,
  });
export const supernaturalRuleInHistoricalMysteryIssueSchema =
  baseIssueSchema.extend({
    code: z.literal("SUPERNATURAL_RULE_IN_HISTORICAL_MYSTERY"),
    ruleText: z.string().trim().min(1),
  });
export const inventedDialogueEnabledForNonfictionIssueSchema =
  baseIssueSchema.extend({
    code: z.literal("INVENTED_DIALOGUE_ENABLED_FOR_NONFICTION"),
  });
export const inventedInternalThoughtsEnabledForNonfictionIssueSchema =
  baseIssueSchema.extend({
    code: z.literal("INVENTED_INTERNAL_THOUGHTS_ENABLED_FOR_NONFICTION"),
  });
export const inventedMotivesEnabledForNonfictionIssueSchema =
  baseIssueSchema.extend({
    code: z.literal("INVENTED_MOTIVES_ENABLED_FOR_NONFICTION"),
  });
export const undocumentedActionsEnabledForNonfictionIssueSchema =
  baseIssueSchema.extend({
    code: z.literal("UNDOCUMENTED_ACTIONS_ENABLED_FOR_NONFICTION"),
  });
export const environmentalThreatMarkedIntelligentIssueSchema =
  baseIssueSchema.extend({
    code: z.literal("ENVIRONMENTAL_THREAT_MARKED_INTELLIGENT"),
    threatDescription: z.string().trim().min(1),
  });
export const unknownGenreRequiresConservativePolicyIssueSchema =
  baseIssueSchema.extend({
    code: z.literal("UNKNOWN_GENRE_REQUIRES_CONSERVATIVE_POLICY"),
  });
export const fictionalityUnresolvedForEvidenceLedGenreIssueSchema =
  baseIssueSchema.extend({
    code: z.literal("FICTIONALITY_UNRESOLVED_FOR_EVIDENCE_LED_GENRE"),
    genre: storyGenreSchema,
  });
export const genrePolicyNotFoundIssueSchema = baseIssueSchema.extend({
  code: z.literal("GENRE_POLICY_NOT_FOUND"),
  requestedPolicyId: z.string().trim().min(1).optional(),
});
export const genrePolicyVersionUnsupportedIssueSchema = baseIssueSchema.extend({
  code: z.literal("GENRE_POLICY_VERSION_UNSUPPORTED"),
  requestedPolicyVersion: z.string().trim().min(1).optional(),
  actualPolicyVersion: z.string().trim().min(1).optional(),
});
export const policyOverrideWeakensSourceBoundaryIssueSchema =
  baseIssueSchema.extend({
    code: z.literal("POLICY_OVERRIDE_WEAKENS_SOURCE_BOUNDARY"),
    boundary: z.enum([
      "dialogue",
      "internalThoughts",
      "connectiveDetails",
      "motives",
      "undocumentedActions",
    ]),
  });
export const missingRequiredEndingIssueSchema = baseIssueSchema.extend({
  code: z.literal("MISSING_REQUIRED_ENDING"),
});
export const missingNarrativeCulminationIssueSchema = baseIssueSchema.extend({
  code: z.literal("MISSING_NARRATIVE_CULMINATION"),
});
export const emptyOrGenericThreatIssueSchema = baseIssueSchema.extend({
  code: z.literal("EMPTY_OR_GENERIC_THREAT"),
});
export const contractSourceIrInvalidIssueSchema = baseIssueSchema.extend({
  code: z.literal("CONTRACT_SOURCE_IR_INVALID"),
  detail: z.string().trim().min(1).optional(),
});
export const duplicateEntityWithConflictingTypeIssueSchema =
  baseIssueSchema.extend({
    code: z.literal("DUPLICATE_ENTITY_WITH_CONFLICTING_TYPE"),
    entityName: z.string().trim().min(1),
    existingType: storyEntityTypeSchema,
    conflictingType: storyEntityTypeSchema,
  });
export const conflictingFactStatementsIssueSchema = baseIssueSchema.extend({
  code: z.literal("CONFLICTING_FACT_STATEMENTS"),
  statement: z.string().trim().min(1),
});

export const storyValidationIssueSchema = z.discriminatedUnion("code", [
  locationClassifiedAsCharacterIssueSchema,
  eventClassifiedAsCharacterIssueSchema,
  supernaturalRuleInNonfictionIssueSchema,
  invalidWordRangeIssueSchema,
  fullStoryRoutedToShortGeneratorIssueSchema,
  shortStoryRoutedToFullRegenerationIssueSchema,
  conflictingGenreAndFictionalityIssueSchema,
  narrativeModeIncompatibleWithGenreIssueSchema,
  supernaturalRuleInHistoricalMysteryIssueSchema,
  inventedDialogueEnabledForNonfictionIssueSchema,
  inventedInternalThoughtsEnabledForNonfictionIssueSchema,
  inventedMotivesEnabledForNonfictionIssueSchema,
  undocumentedActionsEnabledForNonfictionIssueSchema,
  environmentalThreatMarkedIntelligentIssueSchema,
  unknownGenreRequiresConservativePolicyIssueSchema,
  fictionalityUnresolvedForEvidenceLedGenreIssueSchema,
  genrePolicyNotFoundIssueSchema,
  genrePolicyVersionUnsupportedIssueSchema,
  policyOverrideWeakensSourceBoundaryIssueSchema,
  missingRequiredEndingIssueSchema,
  missingNarrativeCulminationIssueSchema,
  emptyOrGenericThreatIssueSchema,
  contractSourceIrInvalidIssueSchema,
  duplicateEntityWithConflictingTypeIssueSchema,
  conflictingFactStatementsIssueSchema,
]);
export type StoryValidationIssue = z.infer<typeof storyValidationIssueSchema>;

export interface StoryProductionArtifacts {
  readonly parsed: ParsedSourceStory;
  readonly facts: CanonicalStoryFacts;
  readonly analysis?: StorySourceAnalysis;
  readonly bible?: StoryBible;
  readonly originalityReview?: OriginalityReview;
  readonly retentionPlan?: readonly RetentionBeat[];
}

function inferLocale(language: LanguageCode): string {
  return getLanguageProfile(language).locale;
}

function makeIdentity(input: {
  readonly episodeNumber: string;
  readonly episodeSlug: string;
  readonly language: LanguageCode;
  readonly locale?: string;
  readonly variant: StoryArtifactVariant;
}): StoryArtifactIdentity {
  return storyArtifactIdentitySchema.parse({
    episodeNumber: input.episodeNumber,
    episodeSlug: input.episodeSlug,
    language: input.language,
    locale: input.locale ?? inferLocale(input.language),
    variant: input.variant,
  });
}

function normalizeFictionality(parsed?: ParsedSourceStory): Fictionality {
  const disclosure = parsed?.metadata.contentDisclosure?.toLowerCase() ?? "";
  if (disclosure.includes("fiction-inspired") || disclosure.includes("folklore")) {
    return "fiction-inspired-by-folklore";
  }
  if (
    disclosure.includes("nonfiction") ||
    disclosure.includes("true crime") ||
    disclosure.includes("true-crime") ||
    disclosure.includes("documentary")
  ) {
    return "nonfiction";
  }
  if (disclosure.includes("fiction")) {
    return "fiction";
  }
  return "unknown";
}

function buildEntityId(prefix: string, value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return `${prefix}:${slug || "item"}`;
}

function dedupeStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function storyFact(id: string, statement: string): StoryFact {
  return storyFactSchema.parse({
    id,
    statement,
    confidence: "confirmed",
    immutable: true,
  });
}

function buildPersonEntities(facts: CanonicalStoryFacts): StoryIrEntity[] {
  return facts.characters.map((character) =>
    storyIrEntitySchema.parse({
      id: buildEntityId("person", character.name),
      name: character.name,
      type: "person",
      narrativeRole: character.role,
      ...(character.relationship ? { relationship: character.relationship } : {}),
    })
  );
}

function buildObjectEntities(facts: CanonicalStoryFacts): StoryIrEntity[] {
  return facts.criticalObjects.map((entry) =>
    storyIrEntitySchema.parse({
      id: buildEntityId("object", entry),
      name: entry,
      type: "object",
      narrativeRole: "critical object",
    })
  );
}

function buildMessageEntities(facts: CanonicalStoryFacts): StoryIrEntity[] {
  return facts.writtenMessages.map((entry) =>
    storyIrEntitySchema.parse({
      id: buildEntityId("written-message", entry),
      name: entry,
      type: "written-message",
      narrativeRole: "written message",
    })
  );
}

function buildLocationEntity(facts: CanonicalStoryFacts): StoryIrEntity[] {
  return facts.setting
    ? [
        storyIrEntitySchema.parse({
          id: buildEntityId("location", facts.setting),
          name: facts.setting,
          type: "location",
          narrativeRole: "setting",
        }),
      ]
    : [];
}

function buildEventEntities(facts: CanonicalStoryFacts): StoryIrEntity[] {
  return facts.criticalEvents.map((entry, index) =>
    storyIrEntitySchema.parse({
      id: buildEntityId("event", `${index + 1}-${entry}`),
      name: entry,
      type: "event",
      narrativeRole: "critical event",
    })
  );
}

function buildRuleEntity(ruleText: string): StoryIrEntity[] {
  return ruleText.length > 0
    ? [
        storyIrEntitySchema.parse({
          id: buildEntityId("rule", ruleText),
          name: ruleText,
          type: "rule",
          narrativeRole: "central rule or mechanism",
        }),
      ]
    : [];
}

function inferClimax(
  facts: CanonicalStoryFacts,
  retentionPlan?: readonly RetentionBeat[]
): string {
  return retentionPlan?.find((beat) => beat.id === "reveal")?.tension ?? facts.primaryReveal;
}

function inferNarrativeMode(parsed?: ParsedSourceStory): NarrativeMode {
  const disclosure = parsed?.metadata.contentDisclosure?.toLowerCase() ?? "";
  if (disclosure.includes("documentary")) {
    return "documentary";
  }
  if (
    disclosure.includes("nonfiction") ||
    disclosure.includes("true crime") ||
    disclosure.includes("true-crime")
  ) {
    return "evidence-led";
  }
  if (disclosure.includes("first person") || disclosure.includes("first-person")) {
    return "first-person";
  }
  if (disclosure.includes("fiction")) {
    return "character-led";
  }
  return "unknown";
}

function includesToken(value: string, tokens: readonly string[]): boolean {
  const normalized = value.toLowerCase();
  return tokens.some((token) => normalized.includes(token));
}

const supernaturalTokens = [
  "ghost",
  "haunted",
  "demon",
  "curse",
  "supernatural",
  "possess",
  "phantom",
  "ritual",
  "invitation",
  "rule",
] as const;

function inferCentralThreat(facts: CanonicalStoryFacts): z.infer<typeof centralThreatSchema> {
  const threat = facts.threat.toLowerCase();
  const supernatural =
    threat.includes("haunt") ||
    threat.includes("ghost") ||
    threat.includes("demon") ||
    threat.includes("curse");
  const environmental =
    threat.includes("storm") ||
    threat.includes("cold") ||
    threat.includes("mountain") ||
    threat.includes("weather") ||
    threat.includes("sea");
  return {
    type: supernatural
      ? "supernatural"
      : environmental
        ? "environmental"
        : "unknown",
    description: facts.threat,
    intelligent: supernatural,
  };
}

function inferCentralRuleMechanism(
  facts: CanonicalStoryFacts
): z.infer<typeof centralRuleMechanismSchema> {
  const description = facts.unresolvedQuestion ?? facts.primaryReveal;
  return {
    description,
    supernatural:
      includesToken(description, supernaturalTokens) ||
      includesToken(facts.threat, supernaturalTokens),
  };
}

function inferGenre(input: {
  readonly facts: CanonicalStoryFacts;
  readonly parsed?: ParsedSourceStory;
}): StoryGenre {
  const disclosure = input.parsed?.metadata.contentDisclosure?.toLowerCase() ?? "";
  const fictionality = normalizeFictionality(input.parsed);
  const threat = input.facts.threat;
  const reveal = input.facts.primaryReveal;
  if (disclosure.includes("true crime") || disclosure.includes("true-crime")) {
    return "true-crime";
  }
  if (disclosure.includes("documentary")) {
    return "documentary";
  }
  if (disclosure.includes("historical mystery")) {
    return "historical-mystery";
  }
  if (disclosure.includes("folklore") || fictionality === "fiction-inspired-by-folklore") {
    return "folklore";
  }
  if (
    fictionality === "fiction" &&
    (includesToken(threat, supernaturalTokens) || includesToken(reveal, supernaturalTokens))
  ) {
    return "fictional-supernatural";
  }
  if (fictionality === "fiction") {
    return "fictional-psychological";
  }
  return "unknown";
}

function inferAllowedInventionBoundaries(
  facts: CanonicalStoryFacts,
  parsed?: ParsedSourceStory,
  bible?: StoryBible,
  originalityReview?: OriginalityReview
): AllowedInventionBoundaries {
  const fictionality = normalizeFictionality(parsed);
  return allowedInventionBoundariesSchema.parse({
    dialogue: fictionality === "fiction" || fictionality === "fiction-inspired-by-folklore",
    internalThoughts:
      fictionality === "fiction" || fictionality === "fiction-inspired-by-folklore",
    connectiveDetails: true,
    motives: false,
    undocumentedActions: false,
    notes: dedupeStrings([
      ...(bible?.storyRules ?? []),
      ...(originalityReview?.notes ?? []),
      "Preserve exact written messages verbatim.",
      "Do not change the ending consequence.",
      `Retain the core threat: ${facts.threat}`,
    ]),
  });
}

function buildStoryIR(input: {
  readonly facts: CanonicalStoryFacts;
  readonly parsed?: ParsedSourceStory;
  readonly analysis?: StorySourceAnalysis;
  readonly bible?: StoryBible;
  readonly originalityReview?: OriginalityReview;
  readonly retentionPlan?: readonly RetentionBeat[];
}): StoryIR {
  const { facts } = input;
  const title = input.parsed?.title ?? facts.primaryTitle;
  return storyIrSchema.parse({
    genre: inferGenre(input),
    fictionality: normalizeFictionality(input.parsed),
    narrativeMode: inferNarrativeMode(input.parsed),
    entities: [
      ...buildPersonEntities(facts),
      ...buildLocationEntity(facts),
      ...buildObjectEntities(facts),
      ...buildMessageEntities(facts),
      ...buildEventEntities(facts),
      ...buildRuleEntity(facts.unresolvedQuestion ?? facts.primaryReveal),
    ],
    immutableFacts: [
      storyFact("episode-title", `Episode ${facts.episodeNumber}: ${title}`),
      ...(facts.sourceTitle
        ? [storyFact("source-title", `Source title: ${facts.sourceTitle}`)]
        : []),
      storyFact("central-threat", `Central threat: ${facts.threat}`),
      storyFact("primary-reveal", `Primary reveal: ${facts.primaryReveal}`),
      storyFact("ending-consequence", `Ending consequence: ${facts.finalConsequence}`),
      ...(input.analysis?.summary
        ? [storyFact("analysis-summary", input.analysis.summary)]
        : []),
      ...(input.originalityReview?.protectedElements ?? []).map((element, index) =>
        storyFact(`protected-element-${index + 1}`, element)
      ),
    ],
    chronology: dedupeStrings([
      ...(input.bible?.sceneOrder ?? []),
      ...facts.criticalEvents,
    ]),
    centralThreat: inferCentralThreat(facts),
    centralRuleMechanism: inferCentralRuleMechanism(facts),
    criticalObjects: dedupeStrings(
      input.bible?.keyObjects ?? facts.criticalObjects
    ).map((name) => ({
      id: buildEntityId("object", name),
      name,
      narrativeFunction: "critical object from legacy facts",
    })),
    writtenMessages: dedupeStrings(
      input.bible?.writtenMessages ?? facts.writtenMessages
    ).map((text) => ({
      text,
      preserveVerbatim: true,
    })),
    climax: inferClimax(facts, input.retentionPlan),
    endingConsequence: input.bible?.finalConsequence ?? facts.finalConsequence,
    allowedInventionBoundaries: inferAllowedInventionBoundaries(
      facts,
      input.parsed,
      input.bible,
      input.originalityReview
    ),
  });
}

function normalizeLegacyGenre(storyIr: z.infer<typeof storyIrCompatibilitySchema>): StoryGenre {
  if (storyIr.genre !== "horror") {
    return storyIr.genre;
  }
  if (
    storyIr.fictionality === "fiction" &&
    (storyIr.centralRuleMechanism.supernatural ||
      storyIr.centralThreat.type === "supernatural")
  ) {
    return "fictional-supernatural";
  }
  if (storyIr.fictionality === "fiction") {
    return "fictional-psychological";
  }
  return "unknown";
}

export function normalizeStoryIRCompatibility(input: unknown): StoryIR {
  const parsed = storyIrCompatibilitySchema.parse(input);
  return storyIrSchema.parse({
    ...parsed,
    genre: normalizeLegacyGenre(parsed),
    narrativeMode: parsed.narrativeMode ?? "unknown",
    allowedInventionBoundaries: {
      dialogue: parsed.allowedInventionBoundaries.dialogue,
      internalThoughts: parsed.allowedInventionBoundaries.internalThoughts,
      connectiveDetails: parsed.allowedInventionBoundaries.connectiveDetails,
      motives: parsed.allowedInventionBoundaries.motives ?? false,
      undocumentedActions:
        parsed.allowedInventionBoundaries.undocumentedActions ?? false,
      ...(parsed.allowedInventionBoundaries.notes
        ? { notes: parsed.allowedInventionBoundaries.notes }
        : {}),
    },
  });
}

export function adaptCanonicalStoryFactsToStoryIR(
  facts: CanonicalStoryFacts,
  parsed?: ParsedSourceStory
): StoryIR {
  return buildStoryIR({
    facts,
    ...(parsed ? { parsed } : {}),
  });
}

export function adaptStoryProductionArtifactsToStoryIR(
  artifacts: StoryProductionArtifacts
): StoryIR {
  return buildStoryIR({
    facts: artifacts.facts,
    parsed: artifacts.parsed,
    ...(artifacts.analysis ? { analysis: artifacts.analysis } : {}),
    ...(artifacts.bible ? { bible: artifacts.bible } : {}),
    ...(artifacts.originalityReview
      ? { originalityReview: artifacts.originalityReview }
      : {}),
    ...(artifacts.retentionPlan ? { retentionPlan: artifacts.retentionPlan } : {}),
  });
}

type FullPackagePayload = GeneratedStoryPackage & {
  readonly full: NonNullable<GeneratedStoryPackage["full"]>;
};

export function adaptGeneratedFullPackageToStoryArtifact(input: {
  readonly episodeNumber: string;
  readonly episodeSlug: string;
  readonly locale?: string;
  readonly generatedPackage: FullPackagePayload;
}): StoryArtifactNormalizationResult {
  const { generatedPackage } = input;
  const identity = makeIdentity({
    episodeNumber: input.episodeNumber,
    episodeSlug: input.episodeSlug,
    language: generatedPackage.language,
    variant: "full",
    ...(input.locale ? { locale: input.locale } : {}),
  });
  return storyArtifactNormalizationResultSchema.parse({
    artifact: {
      owner: "narration",
      artifactType: "generated-full-package",
      identity,
      title: generatedPackage.full.title,
    },
    warnings: [
      "Legacy generated full packages expose target narration WPM but not a target full-story word range; constraints are intentionally left absent.",
    ],
  });
}

export function adaptShortRewriteSidecarToStoryArtifact(
  sidecar: ShortRewriteJsonSidecar
): StoryArtifactNormalizationResult {
  const profile = getLanguageProfile(sidecar.targetLanguage);
  return storyArtifactNormalizationResultSchema.parse({
    artifact: {
      owner: "narration",
      artifactType: "short-rewrite-sidecar",
      identity: makeIdentity({
        episodeNumber: sidecar.episodeId,
        episodeSlug: sidecar.episodeSlug,
        language: sidecar.targetLanguage,
        locale: profile.locale,
        variant: "short",
      }),
      constraints: {
        variant: "short",
        targetNarrationWpm: profile.shortNarrationWpm,
        targetDuration: {
          minSeconds: Math.round(sidecar.generation.estimatedDurationSecondsAt180Wpm),
          maxSeconds: Math.round(sidecar.generation.estimatedDurationSecondsAt175Wpm),
        },
        targetWordRange: {
          min: profile.shortWordRange.min,
          max: profile.shortWordRange.max,
        },
        hookDeadlineSeconds: 3,
        fullVideoBridgeRequired: true,
      },
      title: sidecar.generation.title,
      sourcePath: sidecar.sourcePath,
      promptVersion: sidecar.promptVersion,
      model: sidecar.model,
      generatedAt: sidecar.generatedAt,
    },
    warnings: [],
  });
}

export function adaptShortRewriteArtifactToStoryArtifact(
  artifact: ShortRewriteArtifact
): StoryArtifactNormalizationResult {
  const profile = getLanguageProfile(artifact.targetLanguage);
  return storyArtifactNormalizationResultSchema.parse({
    artifact: {
      owner: "publication",
      artifactType: "short-rewrite-artifact",
      identity: makeIdentity({
        episodeNumber: artifact.episodeId,
        episodeSlug: artifact.episodeSlug,
        language: artifact.targetLanguage,
        locale: profile.locale,
        variant: "short",
      }),
      constraints: {
        variant: "short",
        targetNarrationWpm: profile.shortNarrationWpm,
        targetDuration: {
          minSeconds: 30,
          maxSeconds: 90,
        },
        targetWordRange: {
          min: profile.shortWordRange.min,
          max: profile.shortWordRange.max,
        },
        hookDeadlineSeconds: 3,
        fullVideoBridgeRequired: true,
      },
      sourcePath: artifact.sourcePath,
      promptVersion: artifact.promptVersion,
      model: artifact.model,
      generatedAt: artifact.generatedAt,
    },
    warnings: [
      "Legacy short rewrite manifest artifacts do not persist generated duration; default short duration bounds are used for internal normalization only.",
    ],
  });
}

const locationTokens = [
  "house",
  "room",
  "hall",
  "hallway",
  "road",
  "motel",
  "hotel",
  "attic",
  "basement",
  "apartment",
  "forest",
  "cabin",
  "street",
  "city",
  "mountain",
  "river",
] as const;

const eventTokens = [
  "attack",
  "arrival",
  "escape",
  "murder",
  "discovery",
  "storm",
  "night",
  "ending",
  "reveal",
  "incident",
] as const;

function isCharacterLike(entity: StoryIrEntity): boolean {
  return (
    entity.type === "person" ||
    entity.type === "group" ||
    entity.narrativeRole?.toLowerCase().includes("character") === true
  );
}

export function getBlockingIssues(
  issues: readonly StoryValidationIssue[]
): readonly StoryValidationIssue[] {
  return issues.filter((issue) => issue.severity === "error");
}

export function getWarnings(
  issues: readonly StoryValidationIssue[]
): readonly StoryValidationIssue[] {
  return issues.filter((issue) => issue.severity === "warning");
}

export function hasBlockingIssues(
  issues: readonly StoryValidationIssue[]
): boolean {
  return getBlockingIssues(issues).length > 0;
}

export function validateStoryIR(storyIr: StoryIR): readonly StoryValidationIssue[] {
  const issues: StoryValidationIssue[] = [];
  const seenEntityTypesByName = new Map<string, StoryEntityType>();
  storyIr.entities.forEach((entity, index) => {
    if (!isCharacterLike(entity)) {
      return;
    }
    if (includesToken(entity.name, locationTokens)) {
      issues.push(
        locationClassifiedAsCharacterIssueSchema.parse({
          code: "LOCATION_CLASSIFIED_AS_CHARACTER",
          entityId: entity.id,
          entityName: entity.name,
          message: `Character entity "${entity.name}" appears to be a location.`,
          path: ["entities", index],
          severity: "error",
          repairability: "manual",
        })
      );
    }
    if (includesToken(entity.name, eventTokens)) {
      issues.push(
        eventClassifiedAsCharacterIssueSchema.parse({
          code: "EVENT_CLASSIFIED_AS_CHARACTER",
          entityId: entity.id,
          entityName: entity.name,
          message: `Character entity "${entity.name}" appears to be an event.`,
          path: ["entities", index],
          severity: "error",
          repairability: "manual",
        })
      );
    }
  });

  storyIr.entities.forEach((entity, index) => {
    const normalizedName = entity.name.trim().toLowerCase();
    const seenType = seenEntityTypesByName.get(normalizedName);
    if (seenType !== undefined && seenType !== entity.type) {
      issues.push(
        duplicateEntityWithConflictingTypeIssueSchema.parse({
          code: "DUPLICATE_ENTITY_WITH_CONFLICTING_TYPE",
          entityName: entity.name,
          existingType: seenType,
          conflictingType: entity.type,
          message: `Entity "${entity.name}" appears with conflicting types.`,
          path: ["entities", index],
          severity: "warning",
          repairability: "manual",
        })
      );
      return;
    }
    seenEntityTypesByName.set(normalizedName, entity.type);
  });

  if (
    storyIr.fictionality === "nonfiction" &&
    (storyIr.centralRuleMechanism.supernatural ||
      includesToken(storyIr.centralRuleMechanism.description, supernaturalTokens))
  ) {
    issues.push(
      supernaturalRuleInNonfictionIssueSchema.parse({
        code: "SUPERNATURAL_RULE_IN_NONFICTION",
        ruleText: storyIr.centralRuleMechanism.description,
        message:
          "Nonfiction StoryIR cannot declare a supernatural central rule or mechanism.",
        path: ["centralRuleMechanism"],
        severity: "error",
        repairability: "manual",
      })
    );
  }

  if (
    storyIr.centralThreat.type === "environmental" &&
    storyIr.centralThreat.intelligent
  ) {
    issues.push(
      environmentalThreatMarkedIntelligentIssueSchema.parse({
        code: "ENVIRONMENTAL_THREAT_MARKED_INTELLIGENT",
        threatDescription: storyIr.centralThreat.description,
        message:
          "Environmental threats cannot be marked intelligent without stronger structured evidence.",
        path: ["centralThreat", "intelligent"],
        severity: "error",
        repairability: "manual",
      })
    );
  }

  if (storyIr.centralThreat.description.trim().length === 0) {
    issues.push(
      emptyOrGenericThreatIssueSchema.parse({
        code: "EMPTY_OR_GENERIC_THREAT",
        message: "Central threat description must not be empty.",
        path: ["centralThreat", "description"],
        severity: "error",
        repairability: "manual",
      })
    );
  }

  if (storyIr.climax.trim().length === 0) {
    issues.push(
      missingNarrativeCulminationIssueSchema.parse({
        code: "MISSING_NARRATIVE_CULMINATION",
        message: "StoryIR must include a narrative culmination for full-story contracts.",
        path: ["climax"],
        severity: "error",
        repairability: "manual",
      })
    );
  }

  if (storyIr.endingConsequence.trim().length === 0) {
    issues.push(
      missingRequiredEndingIssueSchema.parse({
        code: "MISSING_REQUIRED_ENDING",
        message: "StoryIR must include an ending consequence for full-story contracts.",
        path: ["endingConsequence"],
        severity: "error",
        repairability: "manual",
      })
    );
  }

  if (storyIr.fictionality === "nonfiction") {
    if (storyIr.allowedInventionBoundaries.dialogue) {
      issues.push(
        inventedDialogueEnabledForNonfictionIssueSchema.parse({
          code: "INVENTED_DIALOGUE_ENABLED_FOR_NONFICTION",
          message: "Nonfiction StoryIR cannot enable invented dialogue.",
          path: ["allowedInventionBoundaries", "dialogue"],
          severity: "error",
          repairability: "manual",
        })
      );
    }
    if (storyIr.allowedInventionBoundaries.internalThoughts) {
      issues.push(
        inventedInternalThoughtsEnabledForNonfictionIssueSchema.parse({
          code: "INVENTED_INTERNAL_THOUGHTS_ENABLED_FOR_NONFICTION",
          message: "Nonfiction StoryIR cannot enable invented internal thoughts.",
          path: ["allowedInventionBoundaries", "internalThoughts"],
          severity: "error",
          repairability: "manual",
        })
      );
    }
    if (storyIr.allowedInventionBoundaries.motives) {
      issues.push(
        inventedMotivesEnabledForNonfictionIssueSchema.parse({
          code: "INVENTED_MOTIVES_ENABLED_FOR_NONFICTION",
          message: "Nonfiction StoryIR cannot enable invented motives.",
          path: ["allowedInventionBoundaries", "motives"],
          severity: "error",
          repairability: "manual",
        })
      );
    }
    if (storyIr.allowedInventionBoundaries.undocumentedActions) {
      issues.push(
        undocumentedActionsEnabledForNonfictionIssueSchema.parse({
          code: "UNDOCUMENTED_ACTIONS_ENABLED_FOR_NONFICTION",
          message: "Nonfiction StoryIR cannot enable undocumented actions.",
          path: ["allowedInventionBoundaries", "undocumentedActions"],
          severity: "error",
          repairability: "manual",
        })
      );
    }
  }

  return issues;
}

function readTargetWordRange(input: unknown): { readonly min?: unknown; readonly max?: unknown } {
  if (typeof input !== "object" || input === null) {
    return {};
  }
  if (!("targetWordRange" in input)) {
    return {};
  }
  const range = input.targetWordRange;
  if (typeof range !== "object" || range === null) {
    return {};
  }
  return {
    min: "min" in range ? range.min : undefined,
    max: "max" in range ? range.max : undefined,
  };
}

function hasValidWordRange(range: {
  readonly min?: unknown;
  readonly max?: unknown;
}): boolean {
  return (
    Number.isInteger(range.min) &&
    Number.isFinite(range.min) &&
    Number.isInteger(range.max) &&
    Number.isFinite(range.max) &&
    typeof range.min === "number" &&
    typeof range.max === "number" &&
    range.min > 0 &&
    range.max > 0 &&
    range.min <= range.max
  );
}

export function validateStoryOutputConstraints(
  constraints: unknown
): readonly StoryValidationIssue[] {
  const range = readTargetWordRange(constraints);
  if (hasValidWordRange(range)) {
    return [];
  }
  return [
    invalidWordRangeIssueSchema.parse({
      code: "INVALID_WORD_RANGE",
      range,
      message:
        "Story output constraints must include a finite positive integer target word range with min <= max.",
      path: ["targetWordRange"],
      severity: "error",
      repairability: "deterministic",
    }),
  ];
}

export function validateArtifactRouting(input: {
  readonly requestedVariant: StoryArtifactVariant;
  readonly generatorVariant: StoryArtifactVariant;
}): readonly StoryValidationIssue[] {
  if (input.requestedVariant === "full" && input.generatorVariant === "short") {
    return [
      fullStoryRoutedToShortGeneratorIssueSchema.parse({
        code: "FULL_STORY_ROUTED_TO_SHORT_GENERATOR",
        requestedVariant: "full",
        routedVariant: "short",
        message: "Full-story request was routed to the short generator.",
        path: ["variant"],
        severity: "error",
        repairability: "regenerate",
      }),
    ];
  }
  if (input.requestedVariant === "short" && input.generatorVariant === "full") {
    return [
      shortStoryRoutedToFullRegenerationIssueSchema.parse({
        code: "SHORT_STORY_ROUTED_TO_FULL_REGENERATION",
        requestedVariant: "short",
        routedVariant: "full",
        message: "Short-story request was routed to the full regeneration path.",
        path: ["variant"],
        severity: "error",
        repairability: "regenerate",
      }),
    ];
  }
  return [];
}
