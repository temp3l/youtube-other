import { describe, expect, it } from "vitest";
import { HeuristicMetadataProvider, formatPublishingMetadataMarkdown, generateLocalizedPublishingMetadata } from "./index.js";
import { rewrittenScriptSchema, scenePlanSchema } from "@mediaforge/domain";

describe("metadata generation", () => {
  it("generates a readable title and description", () => {
    const script = rewrittenScriptSchema.parse({
      sourceId: "episode-fixture",
      audience: "broad audience",
      text: "This is a sample video about a local pipeline.",
      sections: [
        { sectionId: "section-001", transcriptSegmentIds: ["scene-001"], text: "This is a sample video about a local pipeline.", claims: [] }
      ],
      claims: []
    });
    const scenePlan = scenePlanSchema.parse({
      sourceId: "episode-fixture",
      scenes: [
        {
          id: "scene-001",
          sequenceNumber: 1,
          canonicalNarration: "This is a sample video about a local pipeline.",
          sourceSegmentIds: ["scene-001"],
          estimatedDurationSeconds: 4,
          timing: { startSeconds: 0, endSeconds: 4 },
          visualPurpose: "introduce the topic",
          subject: "pipeline",
          action: "presented",
          setting: "workspace",
          composition: "centered",
          cameraFraming: "medium shot",
          mood: "calm",
          continuityReferences: [],
          onScreenText: "",
          negativeConstraints: [],
          aspectRatios: ["16:9"],
          imagePrompt: "pipeline",
          expectedImageFilenames: ["scene-001__000000-000004__16x9.png"],
          qualityStatus: "draft"
        }
      ]
    });
    const metadata = new HeuristicMetadataProvider().generate(script, scenePlan, "youtube");
    expect(metadata.recommendedTitle).toContain("This is a sample video");
    expect(metadata.description).toContain("local pipeline");
  });

  it("generates localized metadata markdown chapters", () => {
    const metadata = generateLocalizedPublishingMetadata({
      sourceId: "episode-fixture",
      language: "es",
      scriptText: "Este es un video de ejemplo. Explica un flujo local.",
      platform: "youtube",
      scenePlan: scenePlanSchema.parse({
        sourceId: "episode-fixture",
        scenes: [
          {
            id: "scene-001",
            sequenceNumber: 1,
            canonicalNarration: "Este es un video de ejemplo.",
            sourceSegmentIds: ["scene-001"],
            estimatedDurationSeconds: 4,
            timing: { startSeconds: 0, endSeconds: 4 },
            visualPurpose: "introduce the topic",
            subject: "pipeline",
            action: "presented",
            setting: "workspace",
            composition: "centered",
            cameraFraming: "medium shot",
            mood: "calm",
            continuityReferences: [],
            onScreenText: "",
            negativeConstraints: [],
            aspectRatios: ["16:9"],
            imagePrompt: "pipeline",
            expectedImageFilenames: ["scene-001__000000-000004__16x9.png"],
            qualityStatus: "draft"
          }
        ]
      })
    });
    const markdown = formatPublishingMetadataMarkdown(metadata);
    expect(metadata.language).toBe("es");
    expect(markdown).toContain("00:00");
    expect(markdown).toContain("Este es un video de ejemplo");
  });
});
