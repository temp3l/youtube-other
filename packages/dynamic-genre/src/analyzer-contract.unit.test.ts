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
function validResponse(): {
  readonly creativeBrief: unknown;
  readonly profile: { readonly audio: Record<string, unknown> };
} {
  return {
    creativeBrief: {
      schemaVersion: "1.0",
      contentType: "completed-story",
      primaryGenre: "education",
      secondaryGenres: [],
      genreConfidence: 0.9,
      targetAudience: "students",
      ageBand: "teens",
      tones: ["authoritative"],
      emotionalPalette: ["focused"],
      narrativePacing: "measured",
      emotionalArc: "steady",
      pointOfView: "instructional",
      themes: ["geometry"],
      setting: { places: [] },
      characters: [],
      locations: [],
      recurringObjects: [],
      continuityConstraints: [],
      sensitiveContentSignals: ["none"],
      visualMotifs: [],
      audioMood: ["focused"],
      thumbnailGoal: "Show the lesson.",
      recommendedDurationClass: "standard",
      sceneDensity: 0.5,
      warnings: [],
      evidenceReferences: [],
    },
    profile: {
      schemaVersion: "1.0",
      classification: {
        primaryGenre: "education",
        secondaryGenres: [],
        confidence: 0.9,
        selectedBaseProfile: "educational-compatible",
      },
      audience: { ageBand: "teens", contentSensitivity: "low" },
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

function malformedProfile(update: {
  readonly narrationStyle?: unknown;
  readonly speechRate?: unknown;
}): unknown {
  const response = validResponse();
  return {
    creativeBrief: response.creativeBrief,
    profile: {
      ...response.profile,
      audio: { ...response.profile.audio, ...update },
    },
  };
}

class SequenceProvider implements DynamicGenreStructuredOutputProvider {
  constructor(private readonly responses: readonly unknown[]) {}
  private position = 0;
  async analyze(): Promise<{
    value: unknown;
    providerMetadata: { provider: string; model: string };
  }> {
    return this.next();
  }
  async repair(): Promise<{
    value: unknown;
    providerMetadata: { provider: string; model: string };
  }> {
    return this.next();
  }
  private next(): {
    value: unknown;
    providerMetadata: { provider: string; model: string };
  } {
    return {
      value: this.responses[this.position++],
      providerMetadata: { provider: "fixture", model: "fixture" },
    };
  }
}

describe("dynamic genre structured-output contract", () => {
  it.each([
    ["unknown enum", malformedProfile({ narrationStyle: "personal-clone" })],
    ["out of range", malformedProfile({ speechRate: 99 })],
    ["unexpected property", { ...validResponse(), unsafeProvider: "no" }],
    ["truncated response", '{"creativeBrief":'],
  ])(
    "uses neutral fallback for %s after repair fails",
    async (_label, malformed) => {
      const result = await new DefaultDynamicGenreAnalyzer(
        new SequenceProvider([malformed, malformed])
      ).analyze(input, context);
      expect(result.fallbackApplied).toBe(true);
      expect(result.profile.classification.selectedBaseProfile).toBe(
        "neutral-narrative"
      );
      expect(result.validationAttempts).toHaveLength(2);
    }
  );

  it("does not expose partial output when repair is unavailable", async () => {
    const provider: DynamicGenreStructuredOutputProvider = {
      async analyze() {
        return {
          value: { profile: {} },
          providerMetadata: { provider: "fixture", model: "fixture" },
        };
      },
      async repair() {
        throw new Error("offline");
      },
    };
    const result = await new DefaultDynamicGenreAnalyzer(provider).analyze(
      input,
      context
    );
    expect(result.fallbackApplied).toBe(true);
    expect(result.creativeBrief.primaryGenre).toBe("neutral");
    expect(result.rawStructuredResponse).toMatchObject({ redacted: true });
  });

  it("maps provider timeout to a typed timeout error", async () => {
    const provider: DynamicGenreStructuredOutputProvider = {
      async analyze({ signal }) {
        await new Promise<void>((resolve, reject) =>
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true }
          )
        );
        return {
          value: validResponse(),
          providerMetadata: { provider: "fixture", model: "fixture" },
        };
      },
      async repair() {
        return {
          value: validResponse(),
          providerMetadata: { provider: "fixture", model: "fixture" },
        };
      },
    };
    await expect(
      new DefaultDynamicGenreAnalyzer(provider, { timeoutMs: 1 }).analyze(
        input,
        context
      )
    ).rejects.toMatchObject({ code: "analysis_timeout" });
  });
});
