import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCanonicalSourceStory } from "./source-story-parser.js";
import { extractCanonicalStoryFacts } from "./canonical-facts.service.js";
import { readStoryFacts, resolveStoryFactsPath, writeStoryFacts } from "./story-facts.persistence.js";

describe("story facts persistence", () => {
  it("writes and reads story-facts.json", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-facts-"));
    const fixture = path.resolve(
      import.meta.dirname,
      "__fixtures__/story-quality/good-english-full.md"
    );
    const sourcePath = path.join(root, "025-the-endless-backrooms", "source", "025-the-endless-backrooms-en-full.md");
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.copyFile(fixture, sourcePath);
    const parsed = await parseCanonicalSourceStory(sourcePath);
    const facts = extractCanonicalStoryFacts(parsed);

    await writeStoryFacts({
      outputRoot: root,
      episodeSlug: "025-the-endless-backrooms-en-full",
      sourceFullHash: parsed.sourceHash,
      extractionConfidence: 0.9,
      facts,
    });

    const written = JSON.parse(
      await fs.readFile(
        resolveStoryFactsPath(root, "025-the-endless-backrooms-en-full"),
        "utf8"
      )
    ) as { readonly sourceFullHash: string };
    expect(written.sourceFullHash).toBe(parsed.sourceHash);

    const loaded = await readStoryFacts({
      outputRoot: root,
      episodeSlug: "025-the-endless-backrooms-en-full",
      sourceFullHash: parsed.sourceHash,
    });
    expect(loaded?.protagonistNames).toContain("Arin Caldor");
    expect(loaded?.locationAnchors).toContain("service entrance");
  });
});
