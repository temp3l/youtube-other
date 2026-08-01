import { describe, expect, it } from "vitest";
import { darkTruthProfilePaths } from "../../dark-truth/src/profile-store.js";
import { mathProfilePaths } from "../../math-education/src/profile-store.js";
import { loadStrategicReinventionProfile } from "../../strategic-reinvention/src/profile.js";
import { compileResolvedProductionConfig } from "./compilers.js";
import { createNeutralCreativeBrief } from "./neutral-fallback.js";
import { dynamicGenreProfileSchema } from "./contracts.js";
import { normalizeGenreAnalysisInput } from "./canonical-input.js";

function profile(primaryGenre: "horror" | "mathematics" | "presenter-advice") {
  return dynamicGenreProfileSchema.parse({
    schemaVersion: "1.0",
    classification: {
      primaryGenre,
      secondaryGenres: [],
      confidence: 0.95,
      selectedBaseProfile:
        primaryGenre === "horror"
          ? "horror-compatible"
          : primaryGenre === "mathematics"
            ? "educational-compatible"
            : "presenter-advice-compatible",
    },
    audience: { ageBand: "adult", contentSensitivity: "low" },
    narrative: {
      tones: ["authoritative"],
      pacing: "balanced",
      emotionalArc: "steady",
      pointOfView: "instructional",
    },
    visual: {
      stylePreset:
        primaryGenre === "horror" ? "dark-cinematic" : "presenter-clean",
      lighting: "neutral",
      paletteMood: "neutral",
      cameraLanguage: "static-clear",
      continuityMode: "standard",
      sceneDensity: 0.5,
    },
    audio: {
      narrationStyle: "authoritative",
      speechRate: 1,
      expressiveness: 0.5,
      pauseDensity: 0.4,
      musicMoods: ["none"],
      soundDesignIntensity: 0.2,
    },
    thumbnail: {
      strategy: "single-subject",
      emotionalSignal: "confidence",
      textDensity: "minimal",
    },
    production: {
      durationClass: "standard",
      imageStrategy: "balanced-scenes",
      motionIntensity: 0.3,
      transitionStyle: "cut",
    },
    safety: { rating: "all-ages", flags: ["none"], requiresReview: false },
    warnings: [],
  });
}

describe("existing genre compatibility", () => {
  it("keeps dedicated Horror and Math profile stores first-class", () => {
    expect(darkTruthProfilePaths("/episode").storyBible).toBe(
      "/episode/state/dark-truth-profile/story-bible.json"
    );
    expect(mathProfilePaths("/lesson").visualStyle).toBe(
      "/lesson/state/mathematics-profile/educational-visual-style.json"
    );
  });

  it("keeps Veronica/Strategic Reinvention blocked and voice-disabled", async () => {
    const existing = await loadStrategicReinventionProfile();
    expect(existing.productionReadiness.status).toBe("PRODUCTION_BLOCKED");
    expect(existing.effectivePolicy.syntheticNarrationEnabled).toBe(false);
    expect(existing.effectivePolicy.generatedLikenessEnabled).toBe(false);
  });

  it("reuses compatible application presets without impersonating existing genres", () => {
    const input = normalizeGenreAnalysisInput({
      contentType: "completed-story",
      contentId: "compatibility",
      revision: "1",
      locale: "en",
      title: "Compatibility",
      body: "Representative content.",
    });
    const brief = createNeutralCreativeBrief(input);
    const horror = compileResolvedProductionConfig({
      profile: profile("horror"),
      brief,
      locale: "en",
      budgetTier: "standard",
    }).config;
    const math = compileResolvedProductionConfig({
      profile: profile("mathematics"),
      brief,
      locale: "en",
      budgetTier: "standard",
    }).config;
    const presenter = compileResolvedProductionConfig({
      profile: profile("presenter-advice"),
      brief,
      locale: "it",
      budgetTier: "standard",
    }).config;
    expect(horror.baseProfile).toBe("horror-compatible");
    expect(math.visual.promptTemplateId).toBe("dynamic-diagram-v1");
    expect(math.audio.narrationStyle).toBe("teacher");
    expect(presenter.baseProfile).toBe("presenter-advice-compatible");
    expect(presenter.audio.voiceSelection).toBe("system-non-personal-default");
  });
});
