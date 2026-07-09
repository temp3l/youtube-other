import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCanonicalSourceStory } from "./source-story-parser.js";
import {
  extractCanonicalStoryFacts,
  validateCanonicalStoryFacts,
} from "./canonical-facts.service.js";
import { runStoryQualityGate } from "./story-quality-gate.js";
import type { ParsedSourceStory } from "./story-localization.types.js";

function episode027Parsed(): ParsedSourceStory {
  const narration = [
    "Noah Brooks parked at the wooded reservoir on lovers' lane when the radio warned that an escaped killer had a metal hook for a hand.",
    "A metallic scrape crossed the car door, the door locks clicked, and Noah's phone lit with a call from his own number.",
    "At the petrol station, the dashcam footage showed Noah outside the car scraping the door while another Noah remained behind the wheel.",
    "The hook vanished from the evidence bag and later hung from Noah's bedroom door.",
  ];
  return {
    language: "en",
    sourceFile: "027-the-hook-on-the-car-door.md",
    sourceHash: "a".repeat(64),
    episodeNumber: "027",
    slug: "027-the-hook-on-the-car-door",
    title: "They Found a Hook Hanging From the Car Door",
    audioInstructions: [],
    narrationParagraphs: narration,
    metadata: {
      episodeNumber: "027",
      primaryTitle: "They Found a Hook Hanging From the Car Door",
      audioInstructions: [],
      narration,
      tags: [],
      hashtags: [],
    },
    content: narration.join("\n\n"),
  };
}

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

  it("extracts concrete Episode 027 facts instead of title or scaffold text", () => {
    const facts = extractCanonicalStoryFacts(episode027Parsed());
    expect(facts.protagonistNames).toContain("Noah Brooks");
    expect(facts.setting).not.toBe("They Found a Hook Hanging From the Car Door");
    expect(facts.concreteLocations).toEqual(
      expect.arrayContaining(["wooded reservoir", "parked car", "lovers' lane", "petrol station", "bedroom door"])
    );
    expect(facts.keyObjects).toEqual(
      expect.arrayContaining(["hook", "car door", "radio", "door locks", "phone", "dashcam", "evidence bag", "bedroom door"])
    );
    expect(facts.threatMechanism).toContain("duplicate-Noah");
    expect(facts.supernaturalRule).toContain("Do not unlock");
    expect(facts.primaryReveal).toContain("Dashcam footage shows Noah outside");
    expect(facts.emotionalCost).toContain("refuse a familiar voice");
    expect(validateCanonicalStoryFacts(facts)).toEqual([]);
  });

  it("rejects bad Episode 027 extracted fact shapes", () => {
    const base = extractCanonicalStoryFacts(episode027Parsed());
    expect(
      validateCanonicalStoryFacts({
        ...base,
        setting: base.primaryTitle,
      })
    ).toContain("FACT_SETTING_EQUALS_TITLE");
    expect(
      validateCanonicalStoryFacts({
        ...base,
        keyObjects: [],
        criticalObjects: [],
      })
    ).toContain("FACT_OBJECT_DRIVEN_KEY_OBJECTS_EMPTY");
    expect(
      validateCanonicalStoryFacts({
        ...base,
        threat: base.criticalEvents[0] ?? "",
      })
    ).toContain("FACT_THREAT_COPIED_OPENING_SENTENCE");
    expect(
      validateCanonicalStoryFacts({
        ...base,
        primaryReveal: "The only remaining plan depended on the rule revealed by the earlier evidence.",
      })
    ).toContain("FACT_primaryReveal_SCAFFOLD");
  });

  it("rejects duplicate paragraphs, generic German filler, and outline shorts", async () => {
    const facts = extractCanonicalStoryFacts(episode027Parsed());
    const duplicate = await fs.readFile(
      path.resolve(import.meta.dirname, "__fixtures__/story-quality/episode-027-duplicate-late-paragraphs.md"),
      "utf8"
    );
    const german = await fs.readFile(
      path.resolve(import.meta.dirname, "__fixtures__/story-quality/episode-027-german-generic-filler.md"),
      "utf8"
    );
    const outline = await fs.readFile(
      path.resolve(import.meta.dirname, "__fixtures__/story-quality/episode-027-outline-short.md"),
      "utf8"
    );

    expect(
      runStoryQualityGate({
        artifactKind: "canonical-english-full",
        language: "en",
        text: duplicate,
        facts,
        budget: { artifactKind: "canonical-english-full", language: "en", model: "fixture" },
      }).findings.map((entry) => entry.code)
    ).toContain("DUPLICATE_NARRATIVE_PARAGRAPH");

    expect(
      runStoryQualityGate({
        artifactKind: "localized-full",
        language: "de",
        text: german,
        facts,
        budget: { artifactKind: "localized-full", language: "de", model: "fixture" },
      }).findings.map((entry) => entry.code)
    ).toContain("BANNED_OUTLINE_PHRASE");

    const outlineCodes = runStoryQualityGate({
      artifactKind: "short",
      language: "en",
      text: outline,
      facts,
      budget: { artifactKind: "short", language: "en", model: "fixture", inputMode: "facts+excerpts" },
    }).findings.map((entry) => entry.code);
    expect(outlineCodes).toContain("BANNED_OUTLINE_PHRASE");
    expect(outlineCodes).toContain("FORBIDDEN_INVENTION");
    expect(outlineCodes).toContain("CANONICAL_NAME_MISSING");
    expect(outlineCodes).toContain("EMOTIONAL_COST_MISSING");
  });
});
