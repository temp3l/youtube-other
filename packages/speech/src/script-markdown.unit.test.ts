import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadEpisodeScriptMarkdown, splitEpisodeScriptMarkdown } from "./script-markdown.js";

describe("loadEpisodeScriptMarkdown", () => {
  it("prefers the root script.md file", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-script-"));
    await fs.mkdir(path.join(tempDir, "script"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "script.md"), "Root script");
    await fs.writeFile(path.join(tempDir, "script", "rewritten-script.md"), "Fallback script");
    const script = await loadEpisodeScriptMarkdown(tempDir);
    expect(script.filePath).toBe(path.join(tempDir, "script.md"));
    expect(script.text).toBe("Root script");
  });

  it("loads a localized script when a language is specified", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-script-"));
    await fs.mkdir(path.join(tempDir, "es", "full"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "es", "full", "script.md"),
      "# Episode 009\n\n# Narration Script\n\nGuion en español.\n\n## Episode Metadata\n**Episode number:** 009\n"
    );
    const script = await loadEpisodeScriptMarkdown(tempDir, "es");
    expect(script.filePath).toBe(path.join(tempDir, "es", "full", "script.md"));
    expect(script.text).toContain("Guion en español.");
  });

  it("extracts the narration script section when requested", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-script-"));
    await fs.mkdir(path.join(tempDir, "en", "full"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "en", "full", "script.md"),
      "# Episode 009\n\n## Audio Generation Instructions\n- Speak clearly.\n\n# Narration Script\n\nFirst paragraph.\n\nSecond paragraph.\n\n## Episode Metadata\n**Episode number:** 009\n"
    );
    const script = await loadEpisodeScriptMarkdown(tempDir, "en", "Narration Script");
    expect(script.filePath).toBe(path.join(tempDir, "en", "full", "script.md"));
    expect(script.text).toBe("First paragraph.\n\nSecond paragraph.");
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
