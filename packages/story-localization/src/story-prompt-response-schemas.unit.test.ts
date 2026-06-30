import { describe, expect, it } from "vitest";
import {
  adaptNarrationOnlyFullToLegacyRendererPackage,
  fullNarrationResponseSchemaDescriptor,
  normalizeNarrationOnlyBatchResult,
  narrationOnlyFullRewriteResponseSchema,
  shortNarrationResponseSchemaDescriptor,
  shortRewriteResponseSchemaDescriptor,
} from "./story-prompt-response-schemas.js";

describe("story prompt response schemas", () => {
  it("keeps the full narration schema narration-only", () => {
    const parsed = narrationOnlyFullRewriteResponseSchema.parse({
      language: "en",
      full: {
        narrationParagraphs: ["One paragraph."],
      },
      targetNarrationWpm: 178,
      preservationChecklist: {
        charactersPreserved: true,
        relationshipsPreserved: true,
        chronologyPreserved: true,
        criticalObjectsPreserved: true,
        cluesPreserved: true,
        writtenMessagesPreserved: true,
        primaryRevealPreserved: true,
        endingPreserved: true,
        noNewPlotElementsAdded: true,
      },
      diagnostics: {
        removedGenericFiller: [],
        adaptationNotes: [],
      },
    });
    expect("title" in parsed.full).toBe(false);
    expect(fullNarrationResponseSchemaDescriptor.version).toMatch(
      /^full-narration/u
    );
    expect(shortNarrationResponseSchemaDescriptor.version).toMatch(
      /^short-narration/u
    );
  });

  it("normalizes legacy mixed and narration-only batch results to the same internal shape", () => {
    const narrationOnly = normalizeNarrationOnlyBatchResult({
      language: "en",
      full: {
        narrationParagraphs: ["Paragraph."],
      },
      targetNarrationWpm: 178,
      preservationChecklist: {
        charactersPreserved: true,
        relationshipsPreserved: true,
        chronologyPreserved: true,
        criticalObjectsPreserved: true,
        cluesPreserved: true,
        writtenMessagesPreserved: true,
        primaryRevealPreserved: true,
        endingPreserved: true,
        noNewPlotElementsAdded: true,
      },
      diagnostics: {
        removedGenericFiller: [],
        adaptationNotes: [],
      },
    });
    const legacy = normalizeNarrationOnlyBatchResult({
      language: "en",
      full: {
        title: "Legacy title",
        audioInstructions: ["steady"],
        narrationParagraphs: [
          "Paragraph one.",
          "Paragraph two.",
          "Paragraph three.",
        ],
        thumbnailText: "Legacy",
        contentDisclosure: "Legacy",
        seoDescription: "Legacy",
        tags: ["legacy", "story", "narration"],
        hashtags: ["#Legacy"],
        targetNarrationWpm: 178,
        visualDirection: "Legacy",
      },
      short: {
        title: "Legacy short",
        narrationInstructions: ["hook"],
        narrationParagraphs: ["short narration"],
        thumbnailText: "short",
        description: "short",
        hashtags: ["#Shorts"],
        targetNarrationWpm: 178,
        recommendedDurationSeconds: { min: 55, max: 65 },
        visualGuidance: "short",
      },
      preservationChecklist: {
        charactersPreserved: true,
        relationshipsPreserved: true,
        chronologyPreserved: true,
        criticalObjectsPreserved: true,
        cluesPreserved: true,
        writtenMessagesPreserved: true,
        primaryRevealPreserved: true,
        endingPreserved: true,
        noNewPlotElementsAdded: true,
      },
      diagnostics: {
        fullWordCount: 1,
        shortWordCount: 1,
        shortEstimatedDurationSeconds: 1,
        removedGenericFiller: [],
        adaptationNotes: [],
      },
    });
    expect(legacy.normalized.full.narrationParagraphs).toEqual([
      "Paragraph one.",
      "Paragraph two.",
      "Paragraph three.",
    ]);
    expect(legacy.detectedFormat).toBe("legacy-mixed");
    expect(legacy.deprecationDiagnostics).toHaveLength(1);
    expect(narrationOnly.detectedFormat).toBe("narration-only");
    expect(narrationOnly.deprecationDiagnostics).toHaveLength(0);
  });

  it("rejects malformed batch result formats before downstream processing", () => {
    expect(() =>
      normalizeNarrationOnlyBatchResult({
        language: "en",
        full: {
          narrationParagraphs: ["Paragraph."],
          thumbnailText: "metadata is not allowed here",
        },
        targetNarrationWpm: 178,
        preservationChecklist: {
          charactersPreserved: true,
          relationshipsPreserved: true,
          chronologyPreserved: true,
          criticalObjectsPreserved: true,
          cluesPreserved: true,
          writtenMessagesPreserved: true,
          primaryRevealPreserved: true,
          endingPreserved: true,
          noNewPlotElementsAdded: true,
        },
        diagnostics: {
          removedGenericFiller: [],
          adaptationNotes: [],
        },
      })
    ).toThrow(/does not match/u);
  });

  it("provides a narrow compatibility adapter outside the narration contract", () => {
    const adapted = adaptNarrationOnlyFullToLegacyRendererPackage({
      sourceStory: {
        language: "en",
        sourceFile: "story.md",
        sourceHash: "hash",
        episodeNumber: "001",
        slug: "001-story",
        title: "Story",
        audioInstructions: [],
        narrationParagraphs: ["Paragraph."],
        metadata: {
          episodeNumber: "001",
          primaryTitle: "Story",
          audioInstructions: [],
          narration: ["Paragraph."],
          tags: [],
          hashtags: [],
        },
        content: "Paragraph.",
      },
      response: {
        language: "en",
        full: {
          narrationParagraphs: ["Paragraph."],
        },
        targetNarrationWpm: 178,
        preservationChecklist: {
          charactersPreserved: true,
          relationshipsPreserved: true,
          chronologyPreserved: true,
          criticalObjectsPreserved: true,
          cluesPreserved: true,
          writtenMessagesPreserved: true,
          primaryRevealPreserved: true,
          endingPreserved: true,
          noNewPlotElementsAdded: true,
        },
        diagnostics: {
          removedGenericFiller: [],
          adaptationNotes: [],
        },
      },
    });
    expect(adapted.title).toBe("Story");
    expect(adapted.narrationParagraphs).toEqual(["Paragraph."]);
  });
});
