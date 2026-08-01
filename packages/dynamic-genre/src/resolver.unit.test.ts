import { describe, expect, it } from "vitest";
import type { CreativeBrief, DynamicGenreProfile } from "./contracts.js";
import { createDynamicGenreCacheKey, resolveDynamicGenre } from "./resolver.js";

const brief: CreativeBrief = {
  schemaVersion: "1.0",
  contentType: "structured-outline",
  primaryGenre: "education",
  secondaryGenres: [],
  genreConfidence: 0.8,
  targetAudience: "learners",
  ageBand: "teens",
  educationalLevel: "introductory",
  tones: ["authoritative"],
  emotionalPalette: ["focus"],
  narrativePacing: "balanced",
  emotionalArc: "steady",
  pointOfView: "instructional",
  themes: ["algebra"],
  setting: { places: ["board"] },
  characters: [],
  locations: [],
  recurringObjects: [],
  continuityConstraints: ["preserve diagram state"],
  sensitiveContentSignals: ["none"],
  visualMotifs: ["equations"],
  audioMood: ["focused"],
  thumbnailGoal: "solve",
  recommendedDurationClass: "standard",
  sceneDensity: 0.5,
  warnings: [],
  evidenceReferences: [],
};
const profile: DynamicGenreProfile = {
  schemaVersion: "1.0",
  classification: {
    primaryGenre: "mathematics",
    secondaryGenres: [],
    confidence: 0.8,
    selectedBaseProfile: "educational-compatible",
  },
  audience: {
    ageBand: "teens",
    knowledgeLevel: "introductory",
    contentSensitivity: "low",
  },
  narrative: {
    tones: ["authoritative"],
    pacing: "balanced",
    emotionalArc: "steady",
    pointOfView: "instructional",
  },
  visual: {
    stylePreset: "clean-educational",
    lighting: "high-key",
    paletteMood: "cool-clean",
    cameraLanguage: "diagrammatic",
    continuityMode: "diagram-state",
    sceneDensity: 0.5,
  },
  audio: {
    narrationStyle: "teacher",
    speechRate: 1,
    expressiveness: 0.3,
    pauseDensity: 0.3,
    musicMoods: ["focused"],
    soundDesignIntensity: 0.1,
  },
  thumbnail: {
    strategy: "educational-proof",
    emotionalSignal: "confidence",
    textDensity: "short",
  },
  production: {
    durationClass: "standard",
    imageStrategy: "diagrams-first",
    motionIntensity: 0.2,
    transitionStyle: "cut",
  },
  safety: { rating: "all-ages", flags: ["none"], requiresReview: false },
  warnings: [],
};
const args = {
  creativeBrief: brief,
  dynamicProfile: profile,
  contentHash: "a".repeat(64),
  revision: "rev-1",
  locale: "en-US",
  budgetTier: "standard" as const,
  promptVersion: "dynamic-prompt-v1",
  analyzerImplementationVersion: "analyzer-v1",
  policyVersion: "policy-v1",
  providerMetadata: { provider: "fixture", model: "fixture-model" },
  validationAttempts: [{ attempt: 1, valid: true, issues: [] }],
  analysisTimestamp: "2026-01-01T00:00:00.000Z",
};

describe("dynamic genre resolver", () => {
  it("creates a stable cache and trusted configuration", () => {
    expect(
      createDynamicGenreCacheKey({
        contentHash: args.contentHash,
        schemaVersion: "1.0",
        promptVersion: args.promptVersion,
        policyVersion: args.policyVersion,
        budgetTier: "standard",
      })
    ).toBe(
      createDynamicGenreCacheKey({
        contentHash: args.contentHash,
        schemaVersion: "1.0",
        promptVersion: args.promptVersion,
        policyVersion: args.policyVersion,
        budgetTier: "standard",
      })
    );
    const result = resolveDynamicGenre(args);
    expect(result.productionConfig.visual.promptTemplateId).toBe(
      "dynamic-diagram-v1"
    );
    expect(result.provenance.resolvedProductionConfigHash).toMatch(
      /^[a-f0-9]{64}$/u
    );
  });
});
