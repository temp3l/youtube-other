import {
  budgetTierSchema,
  creativeBriefSchema,
  dynamicGenreOverrideSchema,
  dynamicGenreProfileSchema,
  resolvedProductionConfigSchema,
} from "./contracts.js";
import type {
  BaseProfileId,
  CreativeBrief,
  DynamicGenreOverride,
  DynamicGenreProfile,
  ProductionBudgetTier,
  ResolvedProductionConfig,
  ResolutionWarning,
} from "./contracts.js";
import { DynamicGenreError } from "./errors.js";
import { getBaseProfile, selectBaseProfile } from "./base-profiles.js";

export interface BudgetLimits {
  readonly analysisCallLimit: 1 | 2 | 3;
  readonly maxScenes: number;
  readonly maxImages: number;
  readonly qualityPreset: "economy" | "standard" | "premium";
  readonly maximumDurationSeconds: number;
  readonly thumbnailVariants: number;
  readonly generationRetryLimit: number;
  readonly qualityReviewPasses: number;
  readonly musicComplexity: "none" | "basic" | "layered";
  readonly costCeilingUsd: number;
}

export const BUDGET_LIMITS: Readonly<
  Record<ProductionBudgetTier, BudgetLimits>
> = {
  economy: {
    analysisCallLimit: 1,
    maxScenes: 8,
    maxImages: 8,
    qualityPreset: "economy",
    maximumDurationSeconds: 300,
    thumbnailVariants: 1,
    generationRetryLimit: 1,
    qualityReviewPasses: 0,
    musicComplexity: "none",
    costCeilingUsd: 10,
  },
  standard: {
    analysisCallLimit: 2,
    maxScenes: 24,
    maxImages: 24,
    qualityPreset: "standard",
    maximumDurationSeconds: 900,
    thumbnailVariants: 2,
    generationRetryLimit: 2,
    qualityReviewPasses: 1,
    musicComplexity: "basic",
    costCeilingUsd: 50,
  },
  premium: {
    analysisCallLimit: 3,
    maxScenes: 48,
    maxImages: 48,
    qualityPreset: "premium",
    maximumDurationSeconds: 1800,
    thumbnailVariants: 4,
    generationRetryLimit: 3,
    qualityReviewPasses: 2,
    musicComplexity: "layered",
    costCeilingUsd: 150,
  },
};

export interface ConfidenceDecision {
  readonly baseProfile: BaseProfileId;
  readonly useFallback: boolean;
  readonly requiresReview: boolean;
  readonly warnings: readonly ResolutionWarning[];
}
const warning = (
  code: string,
  message: string,
  field?: string
): ResolutionWarning =>
  field === undefined ? { code, message } : { code, message, field };
export function compileConfidence(
  profile: DynamicGenreProfile
): ConfidenceDecision {
  const { confidence } = profile.classification;
  // The profile can carry the analyzer's hint for audit purposes, but only
  // application-owned genre mapping selects an executable base profile.
  const selectedBaseProfile = selectBaseProfile(
    profile.classification.primaryGenre,
    profile.classification.secondaryGenres
  );
  if (profile.safety.requiresReview)
    return {
      baseProfile: "neutral-narrative",
      useFallback: true,
      requiresReview: true,
      warnings: [
        warning(
          "critical-ambiguity",
          "Safety review requires a neutral profile.",
          "safety.requiresReview"
        ),
      ],
    };
  if (confidence >= 0.75)
    return {
      baseProfile: selectedBaseProfile,
      useFallback: false,
      requiresReview: false,
      warnings: [],
    };
  if (confidence >= 0.5)
    return {
      baseProfile: selectedBaseProfile,
      useFallback: false,
      requiresReview: false,
      warnings: [
        warning(
          "medium-confidence",
          "Conservative capability limits were applied.",
          "classification.confidence"
        ),
      ],
    };
  const nearest = selectBaseProfile(
    profile.classification.primaryGenre,
    profile.classification.secondaryGenres
  );
  return {
    baseProfile:
      nearest === "abstract-experimental" ? "neutral-narrative" : nearest,
    useFallback: true,
    requiresReview: false,
    warnings: [
      warning(
        "low-confidence-fallback",
        "Low confidence selected a safe fallback profile.",
        "classification.confidence"
      ),
    ],
  };
}

export interface EffectiveOverrides {
  readonly overrides: DynamicGenreOverride;
  readonly warnings: readonly ResolutionWarning[];
}
export function mergeOverrides(
  profile: DynamicGenreProfile,
  requested: DynamicGenreOverride,
  budgetTier: ProductionBudgetTier
): EffectiveOverrides {
  const parsed = requested;
  const warnings: ResolutionWarning[] = [];
  const effective: DynamicGenreOverride = { ...parsed };
  if (
    parsed.baseProfile === "horror-compatible" &&
    profile.audience.ageBand === "children"
  ) {
    delete effective.baseProfile;
    warnings.push(
      warning(
        "override-rejected",
        "Horror profile is unavailable for children content.",
        "baseProfile"
      )
    );
  }
  if (parsed.budgetTier !== undefined && parsed.budgetTier !== budgetTier) {
    delete effective.budgetTier;
    warnings.push(
      warning(
        "override-rejected",
        "Budget tier is selected by the production request.",
        "budgetTier"
      )
    );
  }
  if (profile.safety.requiresReview && parsed.requiresReview === false) {
    effective.requiresReview = true;
    warnings.push(
      warning(
        "policy-enforced",
        "Safety review cannot be disabled.",
        "requiresReview"
      )
    );
  }
  return { overrides: effective, warnings };
}

export function compileResolvedProductionConfig(input: {
  readonly profile: DynamicGenreProfile;
  readonly brief: CreativeBrief;
  readonly locale: string;
  readonly budgetTier: ProductionBudgetTier;
  readonly overrides?: DynamicGenreOverride;
  readonly operatorAuthorizedVoice?: boolean;
}): {
  readonly config: ResolvedProductionConfig;
  readonly warnings: readonly ResolutionWarning[];
  readonly effectiveOverrides: DynamicGenreOverride;
} {
  const profile = dynamicGenreProfileSchema.safeParse(input.profile);
  const brief = creativeBriefSchema.safeParse(input.brief);
  const budgetTier = budgetTierSchema.safeParse(input.budgetTier);
  const overrides = dynamicGenreOverrideSchema.safeParse(input.overrides ?? {});
  if (
    !profile.success ||
    !brief.success ||
    !budgetTier.success ||
    !overrides.success ||
    !/^[a-z]{2}(?:-[A-Z]{2})?$/u.test(input.locale)
  ) {
    throw new DynamicGenreError(
      "resolution_failure",
      "Dynamic genre compiler received invalid domain input."
    );
  }
  return compileTrustedProductionConfig({
    profile: profile.data,
    brief: brief.data,
    locale: input.locale,
    budgetTier: budgetTier.data,
    overrides: overrides.data,
    ...(input.operatorAuthorizedVoice === undefined
      ? {}
      : { operatorAuthorizedVoice: input.operatorAuthorizedVoice }),
  });
}

function compileTrustedProductionConfig(input: {
  readonly profile: DynamicGenreProfile;
  readonly brief: CreativeBrief;
  readonly locale: string;
  readonly budgetTier: ProductionBudgetTier;
  readonly overrides: DynamicGenreOverride;
  readonly operatorAuthorizedVoice?: boolean;
}): {
  readonly config: ResolvedProductionConfig;
  readonly warnings: readonly ResolutionWarning[];
  readonly effectiveOverrides: DynamicGenreOverride;
} {
  const confidence = compileConfidence(input.profile);
  const merged = mergeOverrides(
    input.profile,
    input.overrides ?? {},
    input.budgetTier
  );
  const override = merged.overrides;
  const budget = BUDGET_LIMITS[input.budgetTier];
  const baseProfile = override.baseProfile ?? confidence.baseProfile;
  const base = getBaseProfile(baseProfile);
  const medium = input.profile.classification.confidence < 0.75;
  const sceneDensity = clamp(
    override.sceneDensity ?? input.profile.visual.sceneDensity,
    0,
    medium ? 0.65 : 1
  );
  const maxScenes = Math.max(
    1,
    Math.min(budget.maxScenes, Math.round(2 + sceneDensity * budget.maxScenes))
  );
  const maxImages = Math.min(
    budget.maxImages,
    Math.max(
      1,
      imageCountFor(input.profile.production.imageStrategy, maxScenes)
    )
  );
  const durationClass =
    override.durationClass ?? input.profile.production.durationClass;
  const maximumDurationSeconds = Math.min(
    budget.maximumDurationSeconds,
    durationSeconds(durationClass)
  );
  const requiresReview =
    input.profile.safety.requiresReview ||
    override.requiresReview === true ||
    confidence.requiresReview;
  const requestedVisualPreset =
    override.visualPreset ?? input.profile.visual.stylePreset;
  const visualPreset = normalizeVisualPreset(
    baseProfile,
    input.profile.classification.primaryGenre,
    requestedVisualPreset
  );
  const requestedImageStrategy =
    override.imageStrategy ?? input.profile.production.imageStrategy;
  const imageStrategy =
    input.profile.classification.primaryGenre === "mathematics"
      ? "diagrams-first"
      : requestedImageStrategy;
  const capabilityWarnings: ResolutionWarning[] = [];
  if (visualPreset !== requestedVisualPreset) {
    capabilityWarnings.push(
      warning(
        "capability-normalized",
        "Visual preset was normalized to the selected base-profile capability.",
        "visual.stylePreset"
      )
    );
  }
  if (imageStrategy !== requestedImageStrategy) {
    capabilityWarnings.push(
      warning(
        "capability-normalized",
        "Image strategy was normalized for mathematical continuity.",
        "production.imageStrategy"
      )
    );
  }
  const musicIntensity = clamp(
    override.musicIntensity ?? input.profile.audio.soundDesignIntensity,
    0,
    medium ? 0.45 : 1
  );
  const semanticSpeechRate = override.narrationPacing
    ? speechRateForPacing(override.narrationPacing)
    : input.profile.audio.speechRate;
  const locale = compileLocale(input.locale, semanticSpeechRate);
  const config = {
    schemaVersion: "1.0" as const,
    baseProfile,
    budgetTier: input.budgetTier,
    audio: {
      providerPolicy: input.operatorAuthorizedVoice
        ? ("existing-genre" as const)
        : ("system-default" as const),
      voiceSelection: input.operatorAuthorizedVoice
        ? ("operator-authorized" as const)
        : ("system-non-personal-default" as const),
      narrationStyle: narrationFor(
        baseProfile,
        input.profile.audio.narrationStyle
      ),
      speechRate: clamp(
        semanticSpeechRate + locale.speechRateAdjustment,
        0.75,
        1.25
      ),
      expressiveness: clamp(
        input.profile.audio.expressiveness,
        0,
        medium ? 0.6 : 1
      ),
      pauseDensity: clamp(input.profile.audio.pauseDensity, 0, 1),
      targetLoudnessLufs: -16,
    },
    visual: {
      providerPolicy: "system-allowlist" as const,
      stylePreset: visualPreset,
      lighting: input.profile.visual.lighting,
      paletteMood: input.profile.visual.paletteMood,
      cameraLanguage: input.profile.visual.cameraLanguage,
      continuityMode:
        input.profile.classification.primaryGenre === "mathematics"
          ? ("diagram-state" as const)
          : input.profile.visual.continuityMode,
      maxScenes,
      maxImages,
      qualityPreset: budget.qualityPreset,
      promptTemplateId:
        imageStrategy === "diagrams-first"
          ? ("dynamic-diagram-v1" as const)
          : ("dynamic-scene-v1" as const),
      negativePromptPolicyId: "system-safe-negative-v1" as const,
    },
    video: {
      rendererPreset: rendererFor(base.rendererFamily),
      resolution:
        input.budgetTier === "economy"
          ? ("1280x720" as const)
          : ("1920x1080" as const),
      frameRate: input.budgetTier === "premium" ? (30 as const) : (24 as const),
      motionIntensity: clamp(
        input.profile.production.motionIntensity,
        0,
        medium ? 0.45 : 1
      ),
      transitionStyle: input.profile.production.transitionStyle,
      maximumDurationSeconds,
    },
    thumbnail: {
      rendererPreset: thumbnailRendererFor(base.rendererFamily),
      strategy: normalizeThumbnailStrategy(
        baseProfile,
        override.thumbnailStrategy ?? input.profile.thumbnail.strategy
      ),
      emotionalSignal: input.profile.thumbnail.emotionalSignal,
      textDensity: input.profile.thumbnail.textDensity,
      variants: budget.thumbnailVariants,
    },
    execution: {
      analysisCallLimit: budget.analysisCallLimit,
      generationRetryLimit: budget.generationRetryLimit,
      qualityReviewPasses: budget.qualityReviewPasses,
      musicComplexity: budget.musicComplexity,
      soundDesignIntensity: musicIntensity,
      estimatedCostCeilingUsd: budget.costCeilingUsd,
    },
    locale,
    safety: {
      rating: input.profile.safety.rating,
      flags: input.profile.safety.flags,
      requiresReview,
      autoPublish: false as const,
    },
  } satisfies ResolvedProductionConfig;
  const parsed = resolvedProductionConfigSchema.safeParse(config);
  if (!parsed.success)
    throw new DynamicGenreError(
      "resolution_failure",
      "The trusted production configuration was invalid.",
      false,
      parsed.error.issues.map((issue) => issue.message)
    );
  return {
    config: parsed.data,
    effectiveOverrides: override,
    warnings: [
      ...confidence.warnings,
      ...merged.warnings,
      ...capabilityWarnings,
      ...(medium
        ? [
            warning(
              "conservative-compilation",
              "Medium-confidence limits were applied."
            ),
          ]
        : []),
    ],
  };
}

function normalizeVisualPreset(
  baseProfile: BaseProfileId,
  primaryGenre: DynamicGenreProfile["classification"]["primaryGenre"],
  requested: DynamicGenreProfile["visual"]["stylePreset"]
): DynamicGenreProfile["visual"]["stylePreset"] {
  if (primaryGenre === "mathematics") return "technical-diagram";
  if (baseProfile === "educational-compatible") {
    return requested === "technical-diagram" ? requested : "clean-educational";
  }
  if (
    baseProfile === "presenter-advice-compatible" ||
    baseProfile === "business-explainer"
  ) {
    return "presenter-clean";
  }
  if (baseProfile === "children-family") {
    return requested === "playful-graphic" ? requested : "warm-illustrative";
  }
  if (baseProfile === "horror-compatible") {
    return requested === "neutral-cinematic" ? requested : "dark-cinematic";
  }
  return requested;
}

function normalizeThumbnailStrategy(
  baseProfile: BaseProfileId,
  requested: DynamicGenreProfile["thumbnail"]["strategy"]
): DynamicGenreProfile["thumbnail"]["strategy"] {
  if (baseProfile === "educational-compatible") return "educational-proof";
  if (
    baseProfile === "presenter-advice-compatible" ||
    baseProfile === "business-explainer"
  ) {
    return "presenter-promise";
  }
  return requested;
}

export function compileLocale(
  locale: string,
  rate: number
): ResolvedProductionConfig["locale"] {
  const localeAware = /^(de|fr|es|it|pt|nl|ja|ko|zh)(-|$)/u.test(locale);
  return {
    locale,
    pronunciationPolicy: localeAware ? "locale-aware" : "standard",
    speechRateAdjustment: clamp(rate > 1.15 ? -0.03 : 0, -0.15, 0.15),
  };
}
function narrationFor(
  base: BaseProfileId,
  requested: DynamicGenreProfile["audio"]["narrationStyle"]
): DynamicGenreProfile["audio"]["narrationStyle"] {
  return base === "educational-compatible"
    ? "teacher"
    : base === "presenter-advice-compatible" || base === "business-explainer"
      ? "presenter"
      : requested;
}
function rendererFor(
  family: "story" | "educational" | "presenter"
): ResolvedProductionConfig["video"]["rendererPreset"] {
  return family === "educational"
    ? "educational-standard"
    : family === "presenter"
      ? "presenter-standard"
      : "story-standard";
}
function thumbnailRendererFor(
  family: "story" | "educational" | "presenter"
): ResolvedProductionConfig["thumbnail"]["rendererPreset"] {
  return family === "educational"
    ? "educational-thumbnail-v1"
    : family === "presenter"
      ? "presenter-thumbnail-v1"
      : "story-thumbnail-v1";
}
function durationSeconds(
  value: DynamicGenreProfile["production"]["durationClass"]
): number {
  return value === "short" ? 180 : value === "standard" ? 720 : 1800;
}
function imageCountFor(
  value: DynamicGenreProfile["production"]["imageStrategy"],
  scenes: number
): number {
  return value === "key-scenes"
    ? Math.ceil(scenes * 0.65)
    : value === "dense-scenes"
      ? scenes
      : value === "diagrams-first"
        ? Math.max(2, Math.ceil(scenes * 0.75))
        : Math.ceil(scenes * 0.8);
}
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function speechRateForPacing(
  pacing: NonNullable<DynamicGenreOverride["narrationPacing"]>
): number {
  switch (pacing) {
    case "slow":
      return 0.82;
    case "measured":
      return 0.92;
    case "balanced":
      return 1;
    case "brisk":
      return 1.1;
    case "urgent":
      return 1.2;
  }
}
