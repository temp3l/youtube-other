import { describe, expect, it } from "vitest";
import type { CreativeBrief, DynamicGenreProfile } from "./contracts.js";
import {
  BUDGET_LIMITS,
  compileConfidence,
  compileResolvedProductionConfig,
  mergeOverrides,
} from "./compilers.js";

const profile = (
  primary: DynamicGenreProfile["classification"]["primaryGenre"] = "horror",
  confidence = 0.9
): DynamicGenreProfile => ({
  schemaVersion: "1.0",
  classification: {
    primaryGenre: primary,
    secondaryGenres: [],
    confidence,
    selectedBaseProfile:
      primary === "mathematics"
        ? "educational-compatible"
        : primary === "presenter-advice"
          ? "presenter-advice-compatible"
          : "horror-compatible",
  },
  audience: { ageBand: "adult", contentSensitivity: "moderate" },
  narrative: {
    tones: ["suspenseful"],
    pacing: "measured",
    emotionalArc: "rise",
    pointOfView: "third-person-limited",
  },
  visual: {
    stylePreset: "dark-cinematic",
    lighting: "low-key",
    paletteMood: "dark-muted",
    cameraLanguage: "cinematic-controlled",
    continuityMode: "strict",
    sceneDensity: 0.8,
  },
  audio: {
    narrationStyle: "suspenseful",
    speechRate: 1,
    expressiveness: 0.6,
    pauseDensity: 0.4,
    musicMoods: ["tense"],
    soundDesignIntensity: 0.7,
  },
  thumbnail: {
    strategy: "mystery",
    emotionalSignal: "tension",
    textDensity: "minimal",
  },
  production: {
    durationClass: "standard",
    imageStrategy: "balanced-scenes",
    motionIntensity: 0.5,
    transitionStyle: "crossfade",
  },
  safety: { rating: "teen", flags: ["fear"], requiresReview: false },
  warnings: [],
});
const brief: CreativeBrief = {
  schemaVersion: "1.0",
  contentType: "completed-story",
  primaryGenre: "horror",
  secondaryGenres: [],
  genreConfidence: 0.9,
  targetAudience: "Adults",
  ageBand: "adult",
  tones: ["suspenseful"],
  emotionalPalette: ["dread"],
  narrativePacing: "measured",
  emotionalArc: "rise",
  pointOfView: "third-person-limited",
  themes: ["mystery"],
  setting: { places: ["house"] },
  characters: [],
  locations: [],
  recurringObjects: [],
  continuityConstraints: [],
  sensitiveContentSignals: ["fear"],
  visualMotifs: ["fog"],
  audioMood: ["tense"],
  thumbnailGoal: "mystery",
  recommendedDurationClass: "standard",
  sceneDensity: 0.8,
  warnings: [],
  evidenceReferences: [],
};

describe("trusted dynamic genre compilers", () => {
  it("sets application-controlled budget limits", () => {
    expect(BUDGET_LIMITS.economy.maxScenes).toBeLessThan(
      BUDGET_LIMITS.premium.maxScenes
    );
  });
  it("falls back for low confidence and warns for medium confidence", () => {
    expect(compileConfidence(profile("horror", 0.4)).useFallback).toBe(true);
    expect(compileConfidence(profile("horror", 0.6)).warnings[0]?.code).toBe(
      "medium-confidence"
    );
  });
  it("rejects unsafe overrides and never selects a personal voice", () => {
    const children = {
      ...profile(),
      audience: {
        ageBand: "children" as const,
        contentSensitivity: "low" as const,
      },
    };
    expect(
      mergeOverrides(children, { baseProfile: "horror-compatible" }, "standard")
        .overrides.baseProfile
    ).toBeUndefined();
    const compiled = compileResolvedProductionConfig({
      profile: profile("mathematics"),
      brief,
      locale: "de-DE",
      budgetTier: "economy",
      overrides: { sceneDensity: 1, musicIntensity: 1 },
    });
    expect(compiled.config.audio.voiceSelection).toBe(
      "system-non-personal-default"
    );
    expect(compiled.config.visual.maxScenes).toBeLessThanOrEqual(
      BUDGET_LIMITS.economy.maxScenes
    );
    expect(compiled.config.video.rendererPreset).toBe("educational-standard");
  });
});
