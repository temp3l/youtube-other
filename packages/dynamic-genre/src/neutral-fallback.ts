import {
  CREATIVE_BRIEF_SCHEMA_VERSION,
  DYNAMIC_GENRE_SCHEMA_VERSION,
  creativeBriefSchema,
  dynamicGenreProfileSchema,
  type CanonicalGenreAnalysisInput,
  type CreativeBrief,
  type DynamicGenreProfile,
  type ResolutionWarning,
} from "./contracts.js";

export const NEUTRAL_FALLBACK_WARNING: ResolutionWarning = {
  code: "neutral-fallback-applied",
  message: "Dynamic analysis could not be validated; neutral profile applied.",
  field: "analysis",
};

export function createNeutralCreativeBrief(
  input: CanonicalGenreAnalysisInput
): CreativeBrief {
  return creativeBriefSchema.parse({
    schemaVersion: CREATIVE_BRIEF_SCHEMA_VERSION,
    contentType: input.contentType,
    primaryGenre: "neutral",
    secondaryGenres: [],
    genreConfidence: 0,
    targetAudience: "general audience",
    ageBand: "all-ages",
    tones: ["calm"],
    emotionalPalette: ["neutral"],
    narrativePacing: "measured",
    emotionalArc: "steady",
    pointOfView: "third-person-omniscient",
    themes: [input.title.slice(0, 240)],
    setting: { places: [] },
    characters: [],
    locations: [],
    recurringObjects: [],
    continuityConstraints: [],
    sensitiveContentSignals: ["none"],
    visualMotifs: [],
    audioMood: ["none"],
    thumbnailGoal: "Clearly communicate the topic.",
    recommendedDurationClass: "standard",
    sceneDensity: 0.4,
    warnings: [NEUTRAL_FALLBACK_WARNING],
    evidenceReferences: [],
  });
}

export function createNeutralDynamicGenreProfile(): DynamicGenreProfile {
  return dynamicGenreProfileSchema.parse({
    schemaVersion: DYNAMIC_GENRE_SCHEMA_VERSION,
    classification: {
      primaryGenre: "neutral",
      secondaryGenres: [],
      confidence: 0,
      selectedBaseProfile: "neutral-narrative",
    },
    audience: { ageBand: "all-ages", contentSensitivity: "low" },
    narrative: {
      tones: ["calm"],
      pacing: "measured",
      emotionalArc: "steady",
      pointOfView: "third-person-omniscient",
    },
    visual: {
      stylePreset: "neutral-cinematic",
      lighting: "neutral",
      paletteMood: "neutral",
      cameraLanguage: "static-clear",
      continuityMode: "light",
      sceneDensity: 0.4,
    },
    audio: {
      narrationStyle: "neutral",
      speechRate: 1,
      expressiveness: 0.25,
      pauseDensity: 0.35,
      musicMoods: ["none"],
      soundDesignIntensity: 0,
    },
    thumbnail: {
      strategy: "single-subject",
      emotionalSignal: "curiosity",
      textDensity: "minimal",
    },
    production: {
      durationClass: "standard",
      imageStrategy: "balanced-scenes",
      motionIntensity: 0.2,
      transitionStyle: "crossfade",
    },
    safety: { rating: "all-ages", flags: ["none"], requiresReview: false },
    warnings: [NEUTRAL_FALLBACK_WARNING],
  });
}

export function createNeutralDynamicGenreFallback(
  input: CanonicalGenreAnalysisInput
): {
  readonly creativeBrief: CreativeBrief;
  readonly profile: DynamicGenreProfile;
  readonly warnings: readonly ResolutionWarning[];
} {
  return {
    creativeBrief: createNeutralCreativeBrief(input),
    profile: createNeutralDynamicGenreProfile(),
    warnings: [NEUTRAL_FALLBACK_WARNING],
  };
}
