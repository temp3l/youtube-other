import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadEpisodeScriptMarkdown, splitEpisodeScriptMarkdown } from "./script-markdown.js";

describe("loadEpisodeScriptMarkdown", () => {
  it("requires an explicit language instead of defaulting to English", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-script-"));
    await fs.mkdir(path.join(tempDir, "languages"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "languages", "script-en.md"), "English script");
    await expect(loadEpisodeScriptMarkdown(tempDir)).rejects.toThrow(
      "Pass an explicit language"
    );
  });

  it("loads a canonical localized script when a language is specified", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-script-"));
    await fs.mkdir(path.join(tempDir, "languages"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "languages", "script-es.md"),
      "# Episode 009\n\n# Narration Script\n\nGuion en español.\n\n## Episode Metadata\n**Episode number:** 009\n"
    );
    const script = await loadEpisodeScriptMarkdown(tempDir, "es");
    expect(script.filePath).toBe(path.join(tempDir, "languages", "script-es.md"));
    expect(script.text).toContain("Guion en español.");
  });

  it("extracts the narration script section when requested", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-script-"));
    await fs.mkdir(path.join(tempDir, "languages"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "languages", "script-en.md"),
      "# Episode 009\n\n## Audio Generation Instructions\n- Speak clearly.\n\n# Narration Script\n\nFirst paragraph.\n\nSecond paragraph.\n\n## Episode Metadata\n**Episode number:** 009\n"
    );
    const script = await loadEpisodeScriptMarkdown(tempDir, "en", "Narration Script");
    expect(script.filePath).toBe(path.join(tempDir, "languages", "script-en.md"));
    expect(script.text).toBe("First paragraph.\n\nSecond paragraph.");
  });

  it("loads the canonical short script when the short variant is requested", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-script-"));
    await fs.mkdir(path.join(tempDir, "languages", "short"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "languages", "script-en.md"),
      "# Narration Script\n\nFull narration."
    );
    await fs.writeFile(
      path.join(tempDir, "languages", "short", "script-en.md"),
      "# Narration Script\n\nShort narration."
    );

    const script = await loadEpisodeScriptMarkdown(
      tempDir,
      "en",
      "Narration Script",
      "short"
    );

    expect(script.filePath).toBe(
      path.join(tempDir, "languages", "short", "script-en.md")
    );
    expect(script.text).toBe("Short narration.");
  });

  it("extracts localized narration headings when the canonical heading is requested", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-script-"));
    await fs.mkdir(path.join(tempDir, "languages"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "languages", "script-de.md"),
      "# Episode 025\n\n## Anweisungen zur Audiogenerierung\nNicht vorlesen.\n\n# Sprechtext\n\nNur dieser Teil.\n\n## Episoden-Metadaten\nNicht verwenden.\n"
    );

    const script = await loadEpisodeScriptMarkdown(tempDir, "de", "Narration Script");

    expect(script.text).toBe("Nur dieser Teil.");
  });

  it("keeps narration readable when canonical markdown contains only narration", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-script-"));
    await fs.mkdir(path.join(tempDir, "languages"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "languages", "script-en.md"),
      "# Episode 009\n\n# Narration Script\n\nNarration only."
    );
    const script = await loadEpisodeScriptMarkdown(tempDir, "en", "Narration Script");
    expect(script.text).toBe("Narration only.");
  });

  it("rejects stale localized script layouts with an actionable canonical path", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-script-"));
    await fs.mkdir(path.join(tempDir, "es", "full"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "es", "full", "script.md"), "Stale script");
    await expect(loadEpisodeScriptMarkdown(tempDir, "es")).rejects.toThrow(
      "Expected languages/script-es.md"
    );
  });
});

describe("splitEpisodeScriptMarkdown", () => {
  it("removes markdown noise and splits paragraphs", () => {
    const chunks = splitEpisodeScriptMarkdown(`# Heading\n\n- First block with a [link](https://example.com).\n\nSecond block with \`code\`.`);
    expect(chunks).toEqual([
      "Heading",
      "First block with a link.",
      "Second block with code."
    ]);
  });

  it("splits long narration into speech-safe chunks", () => {
    const longSentence = "This is a sentence with enough repeated content to force a smaller OpenAI speech chunk. ".repeat(80);
    const chunks = splitEpisodeScriptMarkdown(longSentence);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 3200)).toBe(true);
  });
});
