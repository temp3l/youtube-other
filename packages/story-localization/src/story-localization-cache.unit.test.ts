import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  readCanonicalFactsCache,
  readLocalizationCacheEntry,
  writeCanonicalFactsCache,
  writeLocalizationCacheEntry,
} from "./story-localization-cache.js";
import type { CanonicalStoryFacts } from "./story-localization.types.js";

const sourceHash = "a".repeat(64);
const configurationHash = "b".repeat(64);

function makeFacts(): CanonicalStoryFacts {
  return {
    episodeNumber: "027",
    primaryTitle: "They Found a Hook Hanging From the Car Door",
    characters: [{ name: "Noah Brooks", role: "main protagonist" }],
    setting: "wooded reservoir, parked car",
    criticalObjects: ["hook", "car door", "radio"],
    criticalEvents: ["A hook scraped the car door."],
    writtenMessages: [],
    threat:
      "An impossible hook and duplicate-Noah phenomenon manipulates who belongs inside the car.",
    primaryReveal:
      "Dashcam footage shows Noah outside the car while another Noah remains behind the wheel.",
    finalConsequence:
      "Noah realizes the warning was about keeping the wrong person from getting out.",
    protagonistNames: ["Noah Brooks"],
    concreteLocations: ["wooded reservoir", "parked car"],
    keyObjects: ["hook", "car door", "radio"],
    threatMechanism:
      "An impossible hook and duplicate-Noah phenomenon manipulates who belongs inside the car.",
    supernaturalRule:
      "Do not unlock the car or respond to familiar voices outside.",
    protagonistAttachment: "Noah wants to trust the familiar voice outside.",
    emotionalCost: "Noah must refuse the familiar voice to survive.",
    finalDecision: "Noah refuses to unlock the car.",
  };
}

describe("story localization cache identity", () => {
  it("invalidates stale facts cache entries that lack dependency identity", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-cache-"));
    const cachePath = path.join(root, "facts", `${sourceHash}.json`);
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(
      cachePath,
      JSON.stringify({
        sourceHash,
        facts: makeFacts(),
        generatedAt: new Date().toISOString(),
      }),
      "utf8"
    );

    await expect(readCanonicalFactsCache(root, sourceHash)).resolves.toBeNull();
  });

  it("round-trips fresh facts cache entries with dependency identity", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-cache-"));
    await writeCanonicalFactsCache(root, sourceHash, makeFacts(), {
      model: "fixture-model",
      reasoningEffort: "none",
      locale: "en-US",
      variant: "full",
    });

    await expect(
      readCanonicalFactsCache(root, sourceHash)
    ).resolves.toMatchObject({
      protagonistNames: ["Noah Brooks"],
      keyObjects: expect.arrayContaining(["hook", "car door"]),
    });
  });

  it("invalidates stale localization cache entries missing quality identity", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-cache-"));
    const entryPath = path.join(
      root,
      "entries",
      `${sourceHash}.${configurationHash}.json`
    );
    await fs.mkdir(path.dirname(entryPath), { recursive: true });
    await fs.writeFile(
      entryPath,
      JSON.stringify({
        sourceFile: "source.md",
        sourceHash,
        configurationHash,
        promptVersion: "old",
        model: "fixture",
        language: "en",
        generatedAt: new Date().toISOString(),
        outputFiles: ["out.md"],
      }),
      "utf8"
    );

    await expect(
      readLocalizationCacheEntry(root, sourceHash, configurationHash)
    ).resolves.toBeNull();
  });

  it("writes fresh localization cache entries with required identity", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-cache-"));
    await writeLocalizationCacheEntry(root, {
      sourceFile: "source.md",
      sourceHash,
      configurationHash,
      promptVersion: "prompt-v3",
      model: "fixture",
      language: "en",
      reasoningEffort: "none",
      locale: "en-US",
      variant: "full",
      generatedAt: new Date().toISOString(),
      outputFiles: ["out.md"],
    });

    await expect(
      readLocalizationCacheEntry(root, sourceHash, configurationHash)
    ).resolves.toMatchObject({
      sourceNarrationHash: sourceHash,
      extractorImplementationVersion: expect.any(String),
      qualityGateVersion: expect.any(String),
      protectedElementsVersion: expect.any(String),
    });
  });

  it("round-trips enforced localization affect lineage without changing legacy identity", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-cache-"));
    await writeLocalizationCacheEntry(root, {
      sourceFile: "source.md",
      sourceHash,
      configurationHash,
      promptVersion: "prompt-v3",
      model: "fixture",
      language: "de",
      reasoningEffort: "none",
      locale: "de-DE",
      variant: "full",
      generatedAt: new Date().toISOString(),
      outputFiles: ["out.md"],
      localizationAffectProjectionVersion:
        "localization-horror-affect-projection-v1",
      parentHorrorAffectPlanHash: "c".repeat(64),
      localizationAffectProjectionHash: "d".repeat(64),
      localizationAffectSemanticIdsHash: "e".repeat(64),
      localizationAffectFidelityPolicyVersion:
        "localization-affect-fidelity-v1",
    });

    await expect(
      readLocalizationCacheEntry(root, sourceHash, configurationHash)
    ).resolves.toMatchObject({
      localizationAffectProjectionVersion:
        "localization-horror-affect-projection-v1",
      parentHorrorAffectPlanHash: "c".repeat(64),
      localizationAffectProjectionHash: "d".repeat(64),
      localizationAffectSemanticIdsHash: "e".repeat(64),
    });
  });
});
