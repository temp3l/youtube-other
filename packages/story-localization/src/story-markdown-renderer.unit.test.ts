import { describe, expect, it } from "vitest";
import {
  renderLocalizedFullStory,
  renderLocalizedShort,
  renderNarrationOnlyStoryMarkdown,
} from "./story-markdown-renderer.js";

describe("story markdown renderer", () => {
  it("renders canonical narration-only markdown without metadata or audio sections", () => {
    const markdown = renderNarrationOnlyStoryMarkdown({
      episodeNumber: "009",
      title: "The Christmas Doll",
      narrationParagraphs: ["First paragraph.", "Second paragraph."],
      sourceSha256: "a".repeat(64),
    });
    expect(markdown).toContain("# Narration Script");
    expect(markdown).not.toContain("Audio Generation Instructions");
    expect(markdown).not.toContain("Episode Metadata");
    expect(markdown).toContain("First paragraph.");
  });

  it("preserves legacy compatibility rendering for downstream consumers", () => {
    const markdown = renderLocalizedFullStory(
      "009",
      {
        title: "The Christmas Doll",
        audioInstructions: ["Speak clearly."],
        narrationParagraphs: ["First paragraph."],
        thumbnailText: "Wet Hands",
        contentDisclosure: "Narration-only compatibility rendering.",
        seoDescription: "Description",
        tags: ["story"],
        hashtags: ["#Story"],
        targetNarrationWpm: 180,
        visualDirection: "Dim attic.",
      },
      "en"
    );
    expect(markdown).toContain("## Audio Generation Instructions");
    expect(markdown).toContain("## Episode Metadata");
    expect(markdown).toContain("# Narration Script");
    expect(markdown).toContain("Speak in natural English");
    expect(markdown).not.toContain("Speak clearly.");
    expect(markdown).toContain("**Word count:** 2");
  });

  it("renders language-specific production instructions and recalculated short duration", () => {
    const markdown = renderLocalizedShort(
      "034",
      {
        title: "Ihr Spiegelbild hörte auf",
        narrationInstructions: ["Speak in natural English."],
        narrationParagraphs: [
          "Elena hebt die Hand. Ihr Spiegelbild senkt die eigene und zeigt hinter sie.",
        ],
        thumbnailText: "NICHT ICH",
        description: "Kurzer Spiegelhorror.",
        hashtags: ["#Shorts", "#Horror"],
        targetNarrationWpm: 180,
        recommendedDurationSeconds: { min: 45, max: 55 },
        visualGuidance: "Vertikale Bilder.",
      },
      "de"
    );

    expect(markdown).toContain("In natürlichem Deutsch sprechen.");
    expect(markdown).not.toContain("Speak in natural English.");
    expect(markdown).toContain("**Word count:** 13");
    expect(markdown).toContain("**Estimated speech duration:** approximately 4 seconds");
    expect(markdown).not.toContain("45–55 seconds");
  });
});
