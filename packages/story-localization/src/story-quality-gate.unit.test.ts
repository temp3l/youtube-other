import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCanonicalSourceStory } from "./source-story-parser.js";
import { extractCanonicalStoryFacts } from "./canonical-facts.service.js";
import { runStoryQualityGate } from "./story-quality-gate.js";

describe("story quality gate", () => {
  it("flags forbidden inventions and outline phrasing in bad shorts", async () => {
    const goodFixture = path.resolve(
      import.meta.dirname,
      "__fixtures__/story-quality/good-english-full.md"
    );
    const badFixture = path.resolve(
      import.meta.dirname,
      "__fixtures__/story-quality/bad-english-outline-short.md"
    );
    const parsed = await parseCanonicalSourceStory(goodFixture);
    const facts = extractCanonicalStoryFacts(parsed);
    const badText = await fs.readFile(badFixture, "utf8");
    const result = runStoryQualityGate({
      artifactKind: "short",
      language: "en",
      text: badText,
      facts,
      budget: {
        artifactKind: "short",
        language: "en",
        model: "gpt-5.4-medium",
        maxOutputTokens: 1200,
        inputMode: "facts+excerpts",
      },
      targetWordRange: { min: 150, max: 170 },
    });
    expect(result.status).toBe("REPAIRABLE");
    expect(result.findings.map((entry) => entry.code)).toContain("BANNED_OUTLINE_PHRASE");
    expect(result.findings.map((entry) => entry.code)).toContain("FORBIDDEN_INVENTION");
  });

  it("flags malformed german compounds for deterministic repair", async () => {
    const goodFixture = path.resolve(
      import.meta.dirname,
      "__fixtures__/story-quality/good-english-full.md"
    );
    const badFixture = path.resolve(
      import.meta.dirname,
      "__fixtures__/story-quality/malformed-german-full.md"
    );
    const parsed = await parseCanonicalSourceStory(goodFixture);
    const facts = extractCanonicalStoryFacts(parsed);
    const badText = await fs.readFile(badFixture, "utf8");
    const result = runStoryQualityGate({
      artifactKind: "localized-full",
      language: "de",
      text: badText,
      facts,
      budget: {
        artifactKind: "localized-full",
        language: "de",
        model: "gpt-5.4-medium",
      },
    });
    expect(result.deterministicFixes).toContain("repair-german-compounds");
  });
});
