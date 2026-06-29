import { describe, expect, it } from "vitest";
import {
  cleanSourceText,
  SOURCE_CLEANER_VERSION,
} from "./source-cleaning.js";

function clean(text: string) {
  return cleanSourceText({
    sourcePath: "/tmp/source.md",
    text,
    sourceRole: "raw-author-source",
    resolvedFrom: "explicit-input",
  });
}

describe("source cleaning", () => {
  it("normalizes BOM, line endings, trailing whitespace, and repeated blank lines deterministically", () => {
    const result = clean("\uFEFF# Episode 001 — Test\r\n\r\n\r\n\r\n# Narration Script  \r\nA line.  \r\n");

    expect(result.cleanedText).toBe("# Episode 001 — Test\n\n\n# Narration Script\nA line.");
    expect(result.report.cleanerVersion).toBe(SOURCE_CLEANER_VERSION);
    expect(result.report.normalizationStats.removedBom).toBe(true);
    expect(result.report.normalizationStats.normalizedLineEndings).toBeGreaterThan(0);
    expect(result.report.normalizationStats.trimmedTrailingWhitespaceLines).toBe(2);

    const second = clean(result.cleanedText);
    expect(second.cleanedText).toBe(result.cleanedText);
    expect(second.report.cleanedTextHash).toBe(result.report.cleanedTextHash);
  });

  it("removes bounded metadata, audio, thumbnail, SEO, visual, diagnostics, and internal markers", () => {
    const result = clean([
      "# Episode 011 — The Black-Eyed Children",
      "",
      "<!-- mediaforge:generated-full-story -->",
      "<!-- source-sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa -->",
      "",
      "## Audio Generation Instructions",
      "- Use a low voice.",
      "",
      "# Narration Script",
      "Mara heard the knock at the motel door.",
      "",
      "## Episode Metadata",
      "**Primary title:** The Black-Eyed Children",
      "**Suggested thumbnail text:** LET THEM IN",
      "**SEO description:** A search description.",
      "**Suggested tags:** horror, motel",
      "**Hashtags:** #horror",
      "**Visual direction:** Cold hallway.",
      "",
      "## Diagnostics",
      "Repair history: none.",
    ].join("\n"));

    expect(result.cleanedText).toContain("Mara heard the knock");
    expect(result.cleanedText).not.toContain("Audio Generation Instructions");
    expect(result.cleanedText).not.toContain("Episode Metadata");
    expect(result.cleanedText).not.toContain("LET THEM IN");
    expect(result.cleanedText).not.toContain("source-sha256");
    expect(result.report.removedSegments.map((segment) => segment.kind)).toEqual(
      expect.arrayContaining([
        "audio-instruction",
        "metadata",
        "internal-marker",
        "diagnostic",
      ])
    );
  });

  it("retains and flags structural commentary instead of deleting it", () => {
    const result = clean([
      "# Episode 012 — The Road",
      "",
      "# Narration Script",
      "The temporary silence created the most dangerous moment.",
      "Then Mara saw the red light in the snow.",
    ].join("\n"));

    expect(result.cleanedText).toContain("The temporary silence created the most dangerous moment.");
    expect(result.report.flaggedSegments).toHaveLength(1);
    expect(result.report.warnings[0]?.code).toBe("FLAGGED_STRUCTURAL_COMMENTARY");
  });

  it("preserves written messages and dialogue containing production-like words", () => {
    const result = clean([
      "# Episode 013 — The Note",
      "",
      "# Narration Script",
      "The note said, \"Use your voice only after the second bell.\"",
      "Her email subject line read: Scene 4 image proof.",
      "Mara whispered that the sound in the wall was getting closer.",
    ].join("\n"));

    expect(result.cleanedText).toContain("\"Use your voice only after the second bell.\"");
    expect(result.cleanedText).toContain("Scene 4 image proof.");
    expect(result.cleanedText).toContain("sound in the wall");
    expect(result.report.removedSegments).toHaveLength(0);
  });

  it("reports a fatal error when only removable contamination remains", () => {
    const result = clean([
      "## Episode Metadata",
      "**Suggested thumbnail text:** RUN",
      "**SEO description:** Description.",
      "",
      "## Audio Generation Instructions",
      "- Whisper.",
    ].join("\n"));

    expect(result.cleanedText).toBe("");
    expect(result.report.fatal?.code).toBe("ONLY_REMOVABLE_CONTAMINATION");
  });
});
