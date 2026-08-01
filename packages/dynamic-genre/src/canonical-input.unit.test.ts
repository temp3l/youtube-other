import { describe, expect, it } from "vitest";

import {
  buildDynamicGenreCacheKey,
  normalizeGenreAnalysisInput,
} from "./canonical-input.js";

const story = {
  contentType: "completed-story" as const,
  contentId: "story-1",
  revision: "revision-1",
  locale: "en-US",
  canonicalLanguage: "en-US",
  title: "Café at midnight",
  body: "A visitor enters a café.",
  characters: [{ id: "visitor", name: "Ari", facts: ["wears a blue coat"] }],
  sourceMetadata: { source: "fixture" },
};

describe("normalizeGenreAnalysisInput", () => {
  it("normalizes NFC and keeps the content hash independent from translation locale", () => {
    const english = normalizeGenreAnalysisInput(story);
    const localized = normalizeGenreAnalysisInput({
      ...story,
      locale: "de-DE",
      canonicalLanguage: "en-US",
    });
    expect(english.title).toBe("Café at midnight");
    expect(english.contentHash).toBe(localized.contentHash);
  });

  it("rejects empty, unexpected, and oversized source fields", () => {
    const unsafeInput = { ...story, unsafe: "provider=evil" };
    expect(() => normalizeGenreAnalysisInput({ ...story, body: "" })).toThrow(
      "Genre analysis input"
    );
    expect(() =>
      normalizeGenreAnalysisInput({ ...story, body: "x".repeat(120_001) })
    ).toThrow("Genre analysis input");
    expect(() => normalizeGenreAnalysisInput(unsafeInput)).toThrow(
      "Genre analysis input"
    );
  });

  it("changes cache identity only for analysis-relevant dependencies", () => {
    const input = normalizeGenreAnalysisInput(story);
    const key = buildDynamicGenreCacheKey({
      canonicalContentHash: input.contentHash,
      analyzerSchemaVersion: "1.0",
      promptVersion: "prompt-v1",
      policyVersion: "policy-v1",
      budgetTier: "standard",
    });
    expect(key).toBe(
      buildDynamicGenreCacheKey({
        canonicalContentHash: input.contentHash,
        analyzerSchemaVersion: "1.0",
        promptVersion: "prompt-v1",
        policyVersion: "policy-v1",
        budgetTier: "standard",
      })
    );
    expect(key).not.toBe(
      buildDynamicGenreCacheKey({
        canonicalContentHash: input.contentHash,
        analyzerSchemaVersion: "1.0",
        promptVersion: "prompt-v2",
        policyVersion: "policy-v1",
        budgetTier: "standard",
      })
    );
  });
});
