import { describe, expect, it } from "vitest";
import {
  DefaultDynamicGenreAnalyzer,
  type DynamicGenreStructuredOutputProvider,
} from "./analyzer.js";
import type {
  CanonicalGenreAnalysisInput,
  GenreAnalysisContext,
} from "./contracts.js";

const input: CanonicalGenreAnalysisInput = {
  schemaVersion: "1.0",
  contentId: "story-1",
  revision: "rev-1",
  contentType: "completed-story",
  locale: "en-US",
  title: "A calm lesson",
  sections: [{ id: "one", body: "A teacher explains a triangle." }],
  characters: [],
  sourceMetadata: {},
  contentHash: "b".repeat(64),
};
const context: GenreAnalysisContext = {
  budgetTier: "standard",
  policyVersion: "policy-v1",
};

function validResponse(): unknown {
  return {
    creativeBrief: {
      schemaVersion: "1.0",
      contentType: "completed-story",
      primaryGenre: "education",
      secondaryGenres: ["mathematics"],
      genreConfidence: 0.9,
      targetAudience: "students",
      ageBand: "teens",
      educationalLevel: "introductory",
      tones: ["authoritative"],
      emotionalPalette: ["focused"],
      narrativePacing: "measured",
      emotionalArc: "steady",
      pointOfView: "instructional",
      themes: ["geometry"],
      setting: { places: ["classroom"] },
      characters: [],
      locations: [],
      recurringObjects: [],
      continuityConstraints: ["Keep diagram state consistent."],
      sensitiveContentSignals: ["none"],
      visualMotifs: ["triangle"],
      audioMood: ["focused"],
      thumbnailGoal: "Show the triangle lesson.",
      recommendedDurationClass: "standard",
      sceneDensity: 0.5,
      warnings: [],
      evidenceReferences: [],
    },
    profile: {
      schemaVersion: "1.0",
      classification: {
        primaryGenre: "education",
        secondaryGenres: ["mathematics"],
        confidence: 0.9,
        selectedBaseProfile: "educational-compatible",
      },
      audience: {
        ageBand: "teens",
        knowledgeLevel: "introductory",
        contentSensitivity: "low",
      },
      narrative: {
        tones: ["authoritative"],
        pacing: "measured",
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
        expressiveness: 0.5,
        pauseDensity: 0.5,
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
    },
  };
}

class FakeProvider implements DynamicGenreStructuredOutputProvider {
  calls = 0;
  repairs = 0;
  constructor(
    private readonly initial: unknown,
    private readonly repaired: unknown = initial
  ) {}
  async analyze(): Promise<{
    value: unknown;
    providerMetadata: { provider: string; model: string };
  }> {
    this.calls += 1;
    return {
      value: this.initial,
      providerMetadata: { provider: "fake", model: "fixture" },
    };
  }
  async repair(): Promise<{
    value: unknown;
    providerMetadata: { provider: string; model: string };
  }> {
    this.repairs += 1;
    return {
      value: this.repaired,
      providerMetadata: { provider: "fake", model: "fixture" },
    };
  }
}

describe("DefaultDynamicGenreAnalyzer", () => {
  it("accepts a strict valid structured response", async () => {
    const provider = new FakeProvider(validResponse());
    const result = await new DefaultDynamicGenreAnalyzer(provider).analyze(
      input,
      context
    );
    expect(result.profile.classification.selectedBaseProfile).toBe(
      "educational-compatible"
    );
    expect(result.validationAttempts).toEqual([
      { attempt: 1, valid: true, issues: [] },
    ]);
    expect(result.fallbackApplied).toBe(false);
  });

  it("repairs invalid JSON once and accepts a valid repair", async () => {
    const provider = new FakeProvider(
      "{not json",
      JSON.stringify(validResponse())
    );
    const result = await new DefaultDynamicGenreAnalyzer(provider).analyze(
      input,
      context
    );
    expect(provider.repairs).toBe(1);
    expect(result.validationAttempts).toHaveLength(2);
    expect(result.fallbackApplied).toBe(false);
  });

  it("rejects invalid canonical input without a provider call", async () => {
    const provider = new FakeProvider(validResponse());
    await expect(
      new DefaultDynamicGenreAnalyzer(provider).analyze(
        { ...input, sections: [] },
        context
      )
    ).rejects.toMatchObject({ code: "invalid_analysis_input" });
    expect(provider.calls).toBe(0);
  });

  it("uses one analysis call and no repair for the economy tier", async () => {
    const provider = new FakeProvider("{invalid", validResponse());
    const result = await new DefaultDynamicGenreAnalyzer(provider).analyze(
      input,
      {
        budgetTier: "economy",
        policyVersion: "policy-v1",
      }
    );
    expect(result.fallbackApplied).toBe(true);
    expect(provider.calls).toBe(1);
    expect(provider.repairs).toBe(0);
  });

  it("does not call the provider for a pre-aborted request", async () => {
    const provider = new FakeProvider(validResponse());
    const controller = new AbortController();
    controller.abort();
    await expect(
      new DefaultDynamicGenreAnalyzer(provider).analyze(input, {
        ...context,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ code: "analysis_provider_unavailable" });
    expect(provider.calls).toBe(0);
  });
});

export { FakeProvider, context, input, validResponse };
