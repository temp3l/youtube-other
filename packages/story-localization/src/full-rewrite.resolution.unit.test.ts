import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveFullRewriteInput } from "./full-rewrite.resolution.js";

function buildEpisodeSource(content: string): string {
  return [
    "# Episode 011 — The Black-Eyed Children",
    "",
    "## Audio Generation Instructions",
    "- Use one consistent adult male narrator.",
    "",
    "## Episode Metadata",
    "**Primary title:** The Black-Eyed Children",
    "",
    "## Narration Script",
    content,
  ].join("\n");
}

describe("full rewrite resolution", () => {
  it("preserves the canonical episode folder for optimized source filenames", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "full-rewrite-resolution-"));
    const inputPath = path.join(
      tempRoot,
      "content-ideas",
      "content",
      "dark-truth-episodes-optimized",
      "011-the-black-eyed-children-en-full-optimized.md"
    );
    await fs.mkdir(path.dirname(inputPath), { recursive: true });
    await fs.writeFile(
      inputPath,
      buildEpisodeSource("Mara heard the knock at the hotel room door."),
      "utf8"
    );

    const resolved = await resolveFullRewriteInput({
      inputPath,
      episode: undefined,
      episodeSlug: "011-the-black-eyed-children",
      outputRoot: path.join(tempRoot, "episodes"),
    });

    expect(resolved.episodeId).toBe("011");
    expect(resolved.episodeSlug).toBe("011-the-black-eyed-children");
    expect(resolved.sourcePath).toBe(path.resolve(inputPath));
    expect(resolved.resolvedFrom).toBe("explicit-input");
  });

  it("derives the slug from an optimized filename when no explicit slug is provided", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "full-rewrite-resolution-slug-"));
    const inputPath = path.join(
      tempRoot,
      "011-the-black-eyed-children-en-full-optimized.md"
    );
    await fs.writeFile(inputPath, buildEpisodeSource("Mara saw the children in the hallway."), "utf8");

    const resolved = await resolveFullRewriteInput({
      inputPath,
      episode: undefined,
      outputRoot: tempRoot,
    });

    expect(resolved.episodeSlug).toBe("011-the-black-eyed-children");
    expect(resolved.episodeId).toBe("011");
  });

  it("resolves canonical source files from the episode search root", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "full-rewrite-resolution-search-"));
    const episodeSource = path.join(
      tempRoot,
      "episodes",
      "011-the-black-eyed-children",
      "source",
      "011-the-black-eyed-children-en-full.md"
    );
    await fs.mkdir(path.dirname(episodeSource), { recursive: true });
    await fs.writeFile(episodeSource, buildEpisodeSource("Mara heard the cart wheels outside."), "utf8");

    const resolved = await resolveFullRewriteInput({
      inputPath: undefined,
      episode: "011",
      outputRoot: tempRoot,
    });

    expect(resolved.sourcePath).toBe(episodeSource);
    expect(resolved.episodeSlug).toBe("011-the-black-eyed-children");
    expect(resolved.resolvedFrom).toBe("canonical-search");
  });
});
