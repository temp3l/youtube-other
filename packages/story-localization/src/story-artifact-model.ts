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

export const storyGenreSchema = z.enum([
  "fictional-supernatural",
  "fictional-psychological",
  "historical-mystery",
  "true-crime",
  "documentary",
  "folklore",
  "horror",
  "unknown",
]);
export type StoryGenre = z.infer<typeof storyGenreSchema>;

export const fictionalitySchema = z.enum([
  "fiction",
  "nonfiction",
  "fiction-inspired-by-folklore",
  "unknown",
]);
export type Fictionality = z.infer<typeof fictionalitySchema>;

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

export const storyFactSchema = z
  .object({
    id: z.string().trim().min(1),
    statement: z.string().trim().min(1),
    confidence: z.enum(["confirmed", "probable", "disputed", "unknown"]),
    immutable: z.boolean(),
  })
  .strict();
export type StoryFact = z.infer<typeof storyFactSchema>;

export const storyIrSchema = z
  .object({
    genre: storyGenreSchema,
    fictionality: fictionalitySchema,
    entities: z.array(storyIrEntitySchema),
    immutableFacts: z.array(storyFactSchema),
    chronology: z.array(z.string().trim().min(1)),
    centralThreat: z
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
      .strict(),
    centralRuleMechanism: z
      .object({
        description: z.string().trim().min(1),
        supernatural: z.boolean(),
      })
      .strict(),
    criticalObjects: z.array(
      z
        .object({
          id: z.string().trim().min(1),
          name: z.string().trim().min(1),
          narrativeFunction: z.string().trim().min(1),
          origin: z.string().trim().min(1).optional(),
        })
        .strict()
    ),
    writtenMessages: z.array(
      z
        .object({
          text: z.string().trim().min(1),
          preserveVerbatim: z.boolean(),
          sourceSegmentId: z.string().trim().min(1).optional(),
        })
        .strict()
    ),
    climax: z.string().trim().min(1),
    endingConsequence: z.string().trim().min(1),
    allowedInventionBoundaries: z
      .object({
        dialogue: z.boolean(),
        internalThoughts: z.boolean(),
        connectiveDetails: z.boolean(),
        notes: z.array(z.string().trim().min(1)),
      })
      .strict(),
  })
  .strict();
export type StoryIR = z.infer<typeof storyIrSchema>;

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

export const storyValidationIssueCodeSchema = z.enum([
  "LOCATION_CLASSIFIED_AS_CHARACTER",
  "EVENT_CLASSIFIED_AS_CHARACTER",
  "SUPERNATURAL_RULE_IN_NONFICTION",
  "INVALID_WORD_RANGE",
  "FULL_STORY_ROUTED_TO_SHORT_GENERATOR",
  "SHORT_STORY_ROUTED_TO_FULL_REGENERATION",
]);
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

export const storyValidationIssueSchema = z.discriminatedUnion("code", [
  locationClassifiedAsCharacterIssueSchema,
  eventClassifiedAsCharacterIssueSchema,
  supernaturalRuleInNonfictionIssueSchema,
  invalidWordRangeIssueSchema,
  fullStoryRoutedToShortGeneratorIssueSchema,
  shortStoryRoutedToFullRegenerationIssueSchema,
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
  if (disclosure.includes("nonfiction") || disclosure.includes("true")) {
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

function inferAllowedInventionBoundaries(
  facts: CanonicalStoryFacts,
  parsed?: ParsedSourceStory,
  bible?: StoryBible,
  originalityReview?: OriginalityReview
): StoryIR["allowedInventionBoundaries"] {
  const fictionality = normalizeFictionality(parsed);
  return {
    dialogue: fictionality !== "nonfiction",
    internalThoughts: fictionality !== "nonfiction",
    connectiveDetails: true,
    notes: dedupeStrings([
      ...(bible?.storyRules ?? []),
      ...(originalityReview?.notes ?? []),
      "Preserve exact written messages verbatim.",
      "Do not change the ending consequence.",
      `Retain the core threat: ${facts.threat}`,
    ]),
  };
}

function inferCentralThreat(facts: CanonicalStoryFacts): StoryIR["centralThreat"] {
  const threat = facts.threat.toLowerCase();
  const supernatural =
    threat.includes("haunt") ||
    threat.includes("ghost") ||
    threat.includes("demon") ||
    threat.includes("curse");
  return {
    type: supernatural ? "supernatural" : "unknown",
    description: facts.threat,
    intelligent: supernatural,
  };
}

function inferCentralRuleMechanism(
  facts: CanonicalStoryFacts
): StoryIR["centralRuleMechanism"] {
  const description = facts.unresolvedQuestion ?? facts.primaryReveal;
  return {
    description,
    supernatural:
      includesToken(description, supernaturalTokens) ||
      includesToken(facts.threat, supernaturalTokens),
  };
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
    genre: "horror",
    fictionality: normalizeFictionality(input.parsed),
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

const supernaturalTokens = [
  "ghost",
  "haunted",
  "demon",
  "curse",
  "supernatural",
  "possess",
  "phantom",
] as const;

function includesToken(value: string, tokens: readonly string[]): boolean {
  const normalized = value.toLowerCase();
  return tokens.some((token) => normalized.includes(token));
}

function isCharacterLike(entity: StoryIrEntity): boolean {
  return (
    entity.type === "person" ||
    entity.type === "group" ||
    entity.narrativeRole?.toLowerCase().includes("character") === true
  );
}

export function validateStoryIR(storyIr: StoryIR): readonly StoryValidationIssue[] {
  const issues: StoryValidationIssue[] = [];
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
