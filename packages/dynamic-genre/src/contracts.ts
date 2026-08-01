import { z } from "zod";

const shortText = z.string().trim().min(1).max(240);
const id = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9._-]*$/u);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const unit = z.number().finite().min(0).max(1);
const unique = <T>(schema: z.ZodType<T>, max = 8) =>
  z
    .array(schema)
    .max(max)
    .refine(
      (values) => new Set(values).size === values.length,
      "Values must be unique."
    );

export const DYNAMIC_GENRE_SCHEMA_VERSION = "1.0" as const;
export const CREATIVE_BRIEF_SCHEMA_VERSION = "1.0" as const;
export const RESOLVED_PRODUCTION_CONFIG_SCHEMA_VERSION = "1.0" as const;
export const DYNAMIC_GENRE_POLICY_VERSION = "dynamic-genre-policy-v1" as const;
export const DYNAMIC_GENRE_ARTIFACT_NAMES = {
  creativeBrief: "creative-brief.v1.json",
  dynamicProfile: "dynamic-genre-profile.v1.json",
  resolvedProductionConfig: "resolved-production-config.v1.json",
  provenance: "dynamic-genre-provenance.v1.json",
  workflowLog: "dynamic-genre-workflow.v1.json",
  bundle: "dynamic-genre-bundle.v1.json",
} as const;

export const genreIdSchema = z.enum([
  "neutral",
  "horror",
  "suspense",
  "education",
  "mathematics",
  "presenter-advice",
  "documentary",
  "children-family",
  "comedy",
  "inspirational",
  "business",
  "historical",
  "science-technology",
  "abstract-experimental",
]);
export const baseProfileIdSchema = z.enum([
  "neutral-narrative",
  "horror-compatible",
  "educational-compatible",
  "presenter-advice-compatible",
  "documentary",
  "children-family",
  "comedy-light",
  "inspirational",
  "business-explainer",
  "historical",
  "science-technology",
  "abstract-experimental",
]);
export const budgetTierSchema = z.enum(["economy", "standard", "premium"]);
export const ageBandSchema = z.enum(["all-ages", "children", "teens", "adult"]);
export const knowledgeLevelSchema = z.enum([
  "introductory",
  "intermediate",
  "advanced",
]);
export const contentSensitivitySchema = z.enum(["low", "moderate", "high"]);
export const toneIdSchema = z.enum([
  "calm",
  "warm",
  "authoritative",
  "suspenseful",
  "energetic",
  "playful",
  "somber",
  "hopeful",
  "analytical",
]);
export const pacingIdSchema = z.enum([
  "slow",
  "measured",
  "balanced",
  "brisk",
  "urgent",
]);
export const emotionalArcIdSchema = z.enum([
  "steady",
  "rise",
  "fall",
  "rise-fall",
  "fall-rise",
  "episodic",
]);
export const pointOfViewIdSchema = z.enum([
  "first-person",
  "second-person",
  "third-person-limited",
  "third-person-omniscient",
  "instructional",
]);
export const visualStyleIdSchema = z.enum([
  "neutral-cinematic",
  "dark-cinematic",
  "warm-illustrative",
  "clean-educational",
  "documentary-realism",
  "presenter-clean",
  "playful-graphic",
  "archival",
  "technical-diagram",
]);
export const lightingIdSchema = z.enum([
  "neutral",
  "low-key",
  "high-key",
  "warm-soft",
  "naturalistic",
  "dramatic-contrast",
]);
export const paletteMoodIdSchema = z.enum([
  "neutral",
  "dark-muted",
  "warm-bright",
  "cool-clean",
  "earthy",
  "vibrant",
  "monochrome",
]);
export const cameraLanguageIdSchema = z.enum([
  "static-clear",
  "observational",
  "cinematic-controlled",
  "intimate",
  "dynamic",
  "diagrammatic",
]);
export const continuityModeIdSchema = z.enum([
  "light",
  "standard",
  "strict",
  "diagram-state",
]);
export const narrationStyleIdSchema = z.enum([
  "neutral",
  "calm",
  "authoritative",
  "warm",
  "suspenseful",
  "energetic",
  "teacher",
  "presenter",
]);
export const musicMoodIdSchema = z.enum([
  "none",
  "ambient",
  "tense",
  "warm",
  "uplifting",
  "playful",
  "documentary",
  "focused",
]);
export const thumbnailStrategyIdSchema = z.enum([
  "single-subject",
  "question",
  "contrast",
  "outcome",
  "mystery",
  "educational-proof",
  "presenter-promise",
]);
export const thumbnailEmotionIdSchema = z.enum([
  "curiosity",
  "wonder",
  "tension",
  "confidence",
  "delight",
  "urgency",
  "calm",
]);
export const thumbnailTextDensityIdSchema = z.enum([
  "none",
  "minimal",
  "short",
]);
export const durationClassIdSchema = z.enum(["short", "standard", "long"]);
export const imageStrategyIdSchema = z.enum([
  "key-scenes",
  "balanced-scenes",
  "dense-scenes",
  "diagrams-first",
  "presenter-support",
]);
export const transitionStyleIdSchema = z.enum([
  "cut",
  "crossfade",
  "gentle-pan",
  "controlled-dynamic",
]);
export const contentRatingIdSchema = z.enum([
  "all-ages",
  "parental-guidance",
  "teen",
  "mature",
]);
export const safetyFlagIdSchema = z.enum([
  "violence",
  "fear",
  "self-harm",
  "sexual-content",
  "substance-use",
  "hate",
  "medical",
  "financial",
  "minors",
  "none",
]);
const safetyFlagsSchema = unique(safetyFlagIdSchema, 8).superRefine(
  (values, context) => {
    if (values.length > 1 && values.includes("none")) {
      context.addIssue({
        code: "custom",
        message: "The none safety flag cannot be combined with other flags.",
      });
    }
  }
);
export const warningSchema = z.strictObject({
  code: id,
  message: shortText,
  field: z.string().trim().max(120).optional(),
});

const anchorSchema = z.strictObject({
  id,
  name: shortText,
  description: z.string().trim().max(500),
  evidence: unique(shortText, 5).default([]),
});

export const creativeBriefSchema = z.strictObject({
  schemaVersion: z.literal(CREATIVE_BRIEF_SCHEMA_VERSION),
  contentType: z.enum(["completed-story", "structured-outline"]),
  primaryGenre: genreIdSchema,
  secondaryGenres: unique(genreIdSchema, 4),
  genreConfidence: unit,
  targetAudience: shortText,
  ageBand: ageBandSchema,
  educationalLevel: knowledgeLevelSchema.optional(),
  tones: unique(toneIdSchema, 5),
  emotionalPalette: unique(shortText, 6),
  narrativePacing: pacingIdSchema,
  emotionalArc: emotionalArcIdSchema,
  pointOfView: pointOfViewIdSchema,
  themes: unique(shortText, 12),
  setting: z.strictObject({
    places: unique(shortText, 12),
    timePeriod: shortText.optional(),
  }),
  characters: z
    .array(
      anchorSchema.extend({
        ageCategory: ageBandSchema.optional(),
        visualExclusions: unique(shortText, 8),
      })
    )
    .max(40),
  locations: z.array(anchorSchema).max(30),
  recurringObjects: z.array(anchorSchema).max(30),
  continuityConstraints: unique(shortText, 30),
  sensitiveContentSignals: safetyFlagsSchema,
  visualMotifs: unique(shortText, 12),
  audioMood: unique(musicMoodIdSchema, 5),
  thumbnailGoal: shortText,
  recommendedDurationClass: durationClassIdSchema,
  sceneDensity: unit,
  mixedGenreNotes: z.string().trim().max(600).optional(),
  warnings: z.array(warningSchema).max(20),
  evidenceReferences: z
    .array(
      z.strictObject({
        field: id,
        excerpt: z.string().trim().max(240),
        sectionId: id.optional(),
      })
    )
    .max(30),
});

export const dynamicGenreProfileSchema = z.strictObject({
  schemaVersion: z.literal(DYNAMIC_GENRE_SCHEMA_VERSION),
  classification: z.strictObject({
    primaryGenre: genreIdSchema,
    secondaryGenres: unique(genreIdSchema, 4),
    confidence: unit,
    selectedBaseProfile: baseProfileIdSchema,
  }),
  audience: z.strictObject({
    ageBand: ageBandSchema,
    knowledgeLevel: knowledgeLevelSchema.optional(),
    contentSensitivity: contentSensitivitySchema,
  }),
  narrative: z.strictObject({
    tones: unique(toneIdSchema, 5),
    pacing: pacingIdSchema,
    emotionalArc: emotionalArcIdSchema,
    pointOfView: pointOfViewIdSchema,
  }),
  visual: z.strictObject({
    stylePreset: visualStyleIdSchema,
    lighting: lightingIdSchema,
    paletteMood: paletteMoodIdSchema,
    cameraLanguage: cameraLanguageIdSchema,
    continuityMode: continuityModeIdSchema,
    sceneDensity: unit,
  }),
  audio: z.strictObject({
    narrationStyle: narrationStyleIdSchema,
    speechRate: z.number().finite().min(0.75).max(1.25),
    expressiveness: unit,
    pauseDensity: unit,
    musicMoods: unique(musicMoodIdSchema, 5),
    soundDesignIntensity: unit,
  }),
  thumbnail: z.strictObject({
    strategy: thumbnailStrategyIdSchema,
    emotionalSignal: thumbnailEmotionIdSchema,
    textDensity: thumbnailTextDensityIdSchema,
  }),
  production: z.strictObject({
    durationClass: durationClassIdSchema,
    imageStrategy: imageStrategyIdSchema,
    motionIntensity: unit,
    transitionStyle: transitionStyleIdSchema,
  }),
  safety: z.strictObject({
    rating: contentRatingIdSchema,
    flags: safetyFlagsSchema,
    requiresReview: z.boolean(),
  }),
  warnings: z.array(warningSchema).max(20),
});

export const canonicalGenreAnalysisInputSchema = z
  .strictObject({
    schemaVersion: z.literal("1.0"),
    contentId: id,
    revision: id,
    contentType: z.enum(["completed-story", "structured-outline"]),
    locale: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/u),
    canonicalLanguage: z
      .string()
      .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/u)
      .optional(),
    title: z.string().trim().min(1).max(300),
    sections: z
      .array(
        z.strictObject({
          id,
          heading: z.string().trim().max(200).optional(),
          body: z.string().trim().min(1).max(30_000),
        })
      )
      .min(1)
      .max(200),
    characters: z
      .array(
        z.strictObject({ id, name: shortText, facts: unique(shortText, 20) })
      )
      .max(50)
      .default([]),
    sourceMetadata: z
      .record(z.string(), z.string().max(500))
      .refine(
        (value) => Object.keys(value).length <= 30,
        "Source metadata must contain at most 30 entries."
      )
      .default({}),
    contentHash: hash,
  })
  .superRefine((value, ctx) => {
    if (
      value.sections.reduce((sum, section) => sum + section.body.length, 0) >
      120_000
    )
      ctx.addIssue({
        code: "custom",
        path: ["sections"],
        message: "Canonical analysis input exceeds 120000 characters.",
      });
  });

export const dynamicGenreOverrideSchema = z.strictObject({
  baseProfile: baseProfileIdSchema.optional(),
  narrationPacing: pacingIdSchema.optional(),
  visualPreset: visualStyleIdSchema.optional(),
  durationClass: durationClassIdSchema.optional(),
  sceneDensity: unit.optional(),
  imageStrategy: imageStrategyIdSchema.optional(),
  musicIntensity: unit.optional(),
  thumbnailStrategy: thumbnailStrategyIdSchema.optional(),
  budgetTier: budgetTierSchema.optional(),
  requiresReview: z.boolean().optional(),
});

export const resolvedProductionConfigSchema = z.strictObject({
  schemaVersion: z.literal(RESOLVED_PRODUCTION_CONFIG_SCHEMA_VERSION),
  baseProfile: baseProfileIdSchema,
  budgetTier: budgetTierSchema,
  audio: z.strictObject({
    providerPolicy: z.enum(["existing-genre", "system-default"]),
    voiceSelection: z.enum([
      "operator-authorized",
      "system-non-personal-default",
    ]),
    narrationStyle: narrationStyleIdSchema,
    speechRate: z.number().finite().min(0.75).max(1.25),
    expressiveness: unit,
    pauseDensity: unit,
    targetLoudnessLufs: z.number().finite().min(-24).max(-12),
  }),
  visual: z.strictObject({
    providerPolicy: z.literal("system-allowlist"),
    stylePreset: visualStyleIdSchema,
    lighting: lightingIdSchema,
    paletteMood: paletteMoodIdSchema,
    cameraLanguage: cameraLanguageIdSchema,
    continuityMode: continuityModeIdSchema,
    maxScenes: z.number().int().min(1).max(120),
    maxImages: z.number().int().min(1).max(120),
    qualityPreset: z.enum(["economy", "standard", "premium"]),
    promptTemplateId: z.enum(["dynamic-scene-v1", "dynamic-diagram-v1"]),
    negativePromptPolicyId: z.literal("system-safe-negative-v1"),
  }),
  video: z.strictObject({
    rendererPreset: z.enum([
      "story-standard",
      "educational-standard",
      "presenter-standard",
    ]),
    resolution: z.enum(["1280x720", "1920x1080"]),
    frameRate: z.union([z.literal(24), z.literal(30)]),
    motionIntensity: unit,
    transitionStyle: transitionStyleIdSchema,
    maximumDurationSeconds: z.number().int().min(15).max(3600),
  }),
  thumbnail: z.strictObject({
    rendererPreset: z.enum([
      "story-thumbnail-v1",
      "educational-thumbnail-v1",
      "presenter-thumbnail-v1",
    ]),
    strategy: thumbnailStrategyIdSchema,
    emotionalSignal: thumbnailEmotionIdSchema,
    textDensity: thumbnailTextDensityIdSchema,
    variants: z.number().int().min(1).max(5),
  }),
  execution: z.strictObject({
    analysisCallLimit: z.number().int().min(1).max(3),
    generationRetryLimit: z.number().int().min(0).max(5),
    qualityReviewPasses: z.number().int().min(0).max(3),
    musicComplexity: z.enum(["none", "basic", "layered"]),
    soundDesignIntensity: unit,
    estimatedCostCeilingUsd: z.number().finite().positive().max(500),
  }),
  locale: z.strictObject({
    locale: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/u),
    pronunciationPolicy: z.enum(["standard", "locale-aware"]),
    speechRateAdjustment: z.number().finite().min(-0.15).max(0.15),
  }),
  safety: z.strictObject({
    rating: contentRatingIdSchema,
    flags: safetyFlagsSchema,
    requiresReview: z.boolean(),
    autoPublish: z.literal(false),
  }),
});

export const dynamicGenreProvenanceSchema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  inputContentHash: hash,
  canonicalContentRevision: id,
  analyzerSchemaVersion: z.literal(DYNAMIC_GENRE_SCHEMA_VERSION),
  promptVersion: id,
  analyzerImplementationVersion: id,
  policyVersion: id,
  providerMetadata: z.strictObject({
    provider: id,
    model: id,
    requestId: id.optional(),
  }),
  analysisTimestamp: z.string().datetime(),
  rawStructuredResponse: z.unknown().optional(),
  parsedProfile: dynamicGenreProfileSchema,
  validationAttempts: z
    .array(
      z.strictObject({
        attempt: z.number().int().min(1).max(3),
        valid: z.boolean(),
        issues: z.array(shortText).max(30),
      })
    )
    .max(3),
  confidence: unit,
  warnings: z.array(warningSchema).max(30),
  selectedBaseProfile: baseProfileIdSchema,
  appliedPolicyConstraints: unique(id, 30),
  requestedOverrides: dynamicGenreOverrideSchema,
  effectiveOverrides: dynamicGenreOverrideSchema,
  resolvedProductionConfigHash: hash,
  budgetTier: budgetTierSchema,
  locale: z.string().min(2).max(20),
  cacheKey: hash,
  fallbackApplied: z.boolean(),
});

export type GenreId = z.infer<typeof genreIdSchema>;
export type BaseProfileId = z.infer<typeof baseProfileIdSchema>;
export type ProductionBudgetTier = z.infer<typeof budgetTierSchema>;
export type CreativeBrief = z.infer<typeof creativeBriefSchema>;
export type DynamicGenreProfile = z.infer<typeof dynamicGenreProfileSchema>;
export type CanonicalGenreAnalysisInput = z.infer<
  typeof canonicalGenreAnalysisInputSchema
>;
export type DynamicGenreOverride = z.infer<typeof dynamicGenreOverrideSchema>;
export type ResolvedProductionConfig = z.infer<
  typeof resolvedProductionConfigSchema
>;
export type DynamicGenreProvenance = z.infer<
  typeof dynamicGenreProvenanceSchema
>;
export type ResolutionWarning = z.infer<typeof warningSchema>;

export interface GenreAnalysisContext {
  readonly budgetTier: ProductionBudgetTier;
  readonly policyVersion: string;
  readonly forceRefresh?: boolean;
  readonly signal?: AbortSignal;
}
export interface GenreAnalysisResult {
  readonly creativeBrief: CreativeBrief;
  readonly profile: DynamicGenreProfile;
  readonly providerMetadata: {
    readonly provider: string;
    readonly model: string;
    readonly requestId?: string;
  };
  readonly rawStructuredResponse?: unknown;
  readonly validationAttempts: readonly {
    readonly attempt: number;
    readonly valid: boolean;
    readonly issues: readonly string[];
  }[];
  readonly fallbackApplied: boolean;
  readonly warnings: readonly ResolutionWarning[];
}
export interface DynamicGenreAnalyzer {
  analyze(
    input: CanonicalGenreAnalysisInput,
    context: GenreAnalysisContext
  ): Promise<GenreAnalysisResult>;
}
export interface ResolvedDynamicGenre {
  readonly creativeBrief: CreativeBrief;
  readonly dynamicProfile: DynamicGenreProfile;
  readonly productionConfig: ResolvedProductionConfig;
  readonly provenance: DynamicGenreProvenance;
  readonly warnings: readonly ResolutionWarning[];
}
