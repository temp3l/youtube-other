import { describe, expect, it } from "vitest";
import {
  renderLocalizedFullStory,
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
  });
});

