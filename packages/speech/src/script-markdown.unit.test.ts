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
});
