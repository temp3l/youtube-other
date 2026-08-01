import { describe, expect, it } from "vitest";
import {
  SUPPORTED_LANGUAGE_CODES,
  canonicalVisualManifestSchema,
  localizedAlignmentManifestSchema,
  localizedVisualValidationReportSchema,
} from "./index.js";

describe("shared visual domain contracts", () => {
  it("defines the strict supported language registry", () => {
    expect(SUPPORTED_LANGUAGE_CODES).toEqual(["en", "de", "es", "fr", "pt", "it"]);
    expect(() =>
      canonicalVisualManifestSchema.parse({
        episodeSlug: "022-the-whistler-in-the-woods",
        variant: "full",
        canonicalLanguage: "sp",
        scenes: [],
        createdAt: "2026-07-08T00:00:00.000Z",
        schemaVersion: 1,
      })
    ).toThrow();
  });

  it("accepts Italian wherever shared visual contracts accept a locale", () => {
    expect(
      localizedVisualValidationReportSchema.parse({
        episodeSlug: "022-the-whistler-in-the-woods",
        language: "it",
        variant: "full",
        status: "safe",
        issues: [],
        createdAt: "2026-07-08T00:00:00.000Z",
      }).language
    ).toBe("it");
  });

  it("accepts canonical visual, alignment, and validation manifests", () => {
    const visualManifest = canonicalVisualManifestSchema.parse({
      episodeSlug: "022-the-whistler-in-the-woods",
      variant: "short",
      canonicalLanguage: "en",
      scenes: [
        {
          sceneId: "scene-001",
          visualBeat: "A hand reaches for the door.",
          characters: [],
          location: "hallway",
          visibleElements: ["door"],
          continuityTags: ["hallway"],
          imagePath: "visuals/short/images/scene-001.png",
          minDurationSeconds: 2,
          maxDurationSeconds: 5,
        },
      ],
      createdAt: "2026-07-08T00:00:00.000Z",
      schemaVersion: 1,
    });
    const alignment = localizedAlignmentManifestSchema.parse({
      episodeSlug: "022-the-whistler-in-the-woods",
      language: "pt",
      variant: "short",
      canonicalVisualManifestPath: "visuals/short/scene-plan.json",
      alignments: [
        {
          language: "pt",
          variant: "short",
          sceneId: "scene-001",
          narrationText: "A mao alcanca a porta.",
          audioStartSeconds: 0,
          audioEndSeconds: 3,
        },
      ],
      createdAt: "2026-07-08T00:00:00.000Z",
      schemaVersion: 1,
    });
    const validation = localizedVisualValidationReportSchema.parse({
      episodeSlug: "022-the-whistler-in-the-woods",
      language: "pt",
      variant: "short",
      status: "safe",
      issues: [],
      createdAt: "2026-07-08T00:00:00.000Z",
    });

    expect(visualManifest.variant).toBe("short");
    expect(alignment.language).toBe("pt");
    expect(validation.status).toBe("safe");
  });
});
