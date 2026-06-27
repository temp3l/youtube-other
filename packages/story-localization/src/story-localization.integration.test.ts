import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  createStoryLocalizationConfig,
  isRetryableStoryLocalizationError,
  localizeStoryEpisode,
  type GeneratedStoryPackage,
  type LanguageCode,
} from "./index.js";
import { countWords } from "./story-localization.utils.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const sourceFile = path.join(
  repoRoot,
  "content-ideas",
  "content",
  "dark-truth-episodes-multilingual-production-pack",
  "002-even-killers-can-lick",
  "en",
  "002-even-killers-can-lick-en-full.md"
);

type MockResponse = {
  readonly output_text: string;
  readonly id?: string;
};

function makeMockClient(responses: readonly MockResponse[]) {
  const queue = [...responses];
  return {
    responses: {
      create: vi.fn(async () => {
        const next = queue.shift();
        if (!next) {
          throw new Error("No mock response left.");
        }
        return {
          id: next.id ?? "resp_mock",
          output_text: next.output_text,
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            input_tokens_details: { cached_tokens: 0 },
          },
        };
      }),
    },
  };
}

function buildShortNarration(includeNames = true, includeMessage = true, includeReveal = true): string[] {
  const hook = includeNames
    ? "Elena Ward heard Bramble licking beneath the bed while the storm hit the windows."
    : "A dog-like sound came from beneath the bed while the storm hit the windows."
  ;
  const mirror = includeMessage
    ? "By morning the dog was dead in the hallway, and HUMANS CAN LICK TOO was written on the mirror."
    : "By morning the dog was dead in the hallway, and a message was written on the mirror.";
  const reveal = includeReveal
    ? "The notebook said SHE REACHED DOWN FIRST."
    : "The notebook had one final line.";
  const filler = "The house stayed wet and silent while Elena counted each step and listened for the next breath.";
  let text = `${hook} ${mirror} She checked the kitchen, the stairs, and the attic, and every room seemed to wait for her answer. ${reveal}`;
  while (countWords(text) < 165) {
    text = `${text} ${filler}`;
  }
  const sentences = text.match(/[^.!?]+[.!?]/g) ?? [text];
  return [sentences.join(" ").trim()];
}

function buildFullNarration(language: LanguageCode): string[] {
  return [
    `${language.toUpperCase()} version: Elena Ward stayed in the house after dark and kept hearing Bramble breathe from under the bed.`,
    "She found the same wet tracks in the hallway, the same attic note, and the same impossible message on the mirror.",
    "By the time she understood the rule, the house had already learned Elena Ward's name and the final choice had become a trap.",
  ];
}

function makeLocalizedPackage(language: LanguageCode, overrides?: Partial<GeneratedStoryPackage>): GeneratedStoryPackage {
  return {
    language,
    full: {
      title: `${language.toUpperCase()} House of Licking Shadows`,
      sourceTitle: "Even Killers Can Lick",
      audioInstructions: ["Use a steady narrator.", "Keep the tone restrained."],
      soundMotif: "storm rain and a faint drip",
      narrationParagraphs: buildFullNarration(language),
      thumbnailText: "NOT THE DOG",
      contentDisclosure: "Fictional horror narration.",
      seoDescription: "A house learns the wrong name.",
      tags: ["horror", "story", "house"],
      hashtags: ["#HorrorStory", "#DarkTruthEpisodes"],
      targetNarrationWpm: 170,
      visualDirection: "Dark hallway, mirror, and attic.",
    },
    short: {
      title: `${language.toUpperCase()} Short House`,
      narrationInstructions: ["Begin immediately.", "Keep the hook visible."],
      narrationParagraphs: buildShortNarration(),
      thumbnailText: "IT WASN'T THE DOG",
      description: "A dog is not what Elena fears.",
      hashtags: ["#Shorts", "#Horror", "#DarkTruthEpisodes"],
      targetNarrationWpm: 180,
      recommendedDurationSeconds: { min: 55, max: 65 },
      visualGuidance: "Fast opening shots, mirror reveal, attic ending.",
    },
    preservationChecklist: {
      charactersPreserved: true,
      relationshipsPreserved: true,
      chronologyPreserved: true,
      criticalObjectsPreserved: true,
      cluesPreserved: true,
      writtenMessagesPreserved: true,
      primaryRevealPreserved: true,
      endingPreserved: true,
      noNewPlotElementsAdded: true,
    },
    diagnostics: {
      fullWordCount: 120,
      shortWordCount: countWords(buildShortNarration().join(" ")),
      shortEstimatedDurationSeconds: 58,
      removedGenericFiller: [],
      adaptationNotes: [],
    },
    ...overrides,
  };
}

function makeEnglishShortPayload(overrides?: Partial<GeneratedStoryPackage["short"]>) {
  const shortParagraphs = buildShortNarration();
  return {
    short: {
      title: "The Killer Was Already Inside the House",
      narrationInstructions: ["Use the same narrator as the full episode."],
      narrationParagraphs: shortParagraphs,
      thumbnailText: "IT WASN'T THE DOG",
      description: "Elena hears something under the bed.",
      hashtags: ["#Shorts", "#Horror", "#DarkTruthEpisodes"],
      targetNarrationWpm: 180,
      recommendedDurationSeconds: { min: 55, max: 65 },
      visualGuidance: "Mirror, hallway, attic.",
      ...overrides,
    },
    preservationChecklist: {
      charactersPreserved: true,
      relationshipsPreserved: true,
      chronologyPreserved: true,
      criticalObjectsPreserved: true,
      cluesPreserved: true,
      writtenMessagesPreserved: true,
      primaryRevealPreserved: true,
      endingPreserved: true,
      noNewPlotElementsAdded: true,
    },
    diagnostics: {
      fullWordCount: 100,
      shortWordCount: countWords(shortParagraphs.join(" ")),
      shortEstimatedDurationSeconds: 58,
      removedGenericFiller: [],
      adaptationNotes: ["Derived from the English full story."],
    },
  };
}

function makeConfig(outputDir: string, languages: readonly Exclude<LanguageCode, "en">[]) {
  return createStoryLocalizationConfig({
    sourceDirectory: path.join(repoRoot, "content-ideas", "content", "dark-truth-episodes-multilingual-production-pack"),
    outputDirectory: outputDir,
    languages,
    includeEnglishShort: true,
    force: true,
    model: "gpt-4o-mini",
  });
}

describe("story localization integration", () => {
  it("generates the English short and copies the English full story", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-localization-en-"));
    const client = makeMockClient([
      {
        output_text: JSON.stringify(makeEnglishShortPayload()),
      },
    ]);
    const result = await localizeStoryEpisode(sourceFile, makeConfig(tempDir, []), { client: client as never });
    expect(result.failure).toBeUndefined();
    expect(client.responses.create).toHaveBeenCalledTimes(1);
    expect(
      await fs.readFile(
        path.join(tempDir, "002-even-killers-can-lick", "script.md"),
        "utf8"
      )
    ).toContain("The Killer Was Already Inside the House");
    expect(
      await fs.readFile(
        path.join(
          tempDir,
          "002-even-killers-can-lick",
          "en",
          "short",
          "script.md"
        ),
        "utf8"
      )
    ).toContain("# Short 002");
  });

  it("persists production artifacts and stage state", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-localization-production-"));
    const client = makeMockClient([
      {
        output_text: JSON.stringify(makeEnglishShortPayload()),
      },
    ]);
    const result = await localizeStoryEpisode(sourceFile, makeConfig(tempDir, []), { client: client as never });
    expect(result.failure).toBeUndefined();
    const productionDir = path.join(tempDir, "002-even-killers-can-lick", ".localization-cache", "production", "002", "002-even-killers-can-lick");
    const sourceAnalysis = JSON.parse(await fs.readFile(path.join(productionDir, "source-analysis.json"), "utf8")) as Record<string, unknown>;
    const bible = JSON.parse(await fs.readFile(path.join(productionDir, "story-bible.json"), "utf8")) as Record<string, unknown>;
    const originalityReview = JSON.parse(await fs.readFile(path.join(productionDir, "originality-review.json"), "utf8")) as Record<string, unknown>;
    const retentionPlan = JSON.parse(await fs.readFile(path.join(productionDir, "retention-plan.json"), "utf8")) as unknown[];
    const stage = JSON.parse(await fs.readFile(path.join(productionDir, "production-state.json"), "utf8")) as Record<string, unknown>;
    expect(sourceAnalysis).toHaveProperty("issueSummary");
    expect(bible).toHaveProperty("protagonist");
    expect(originalityReview).toHaveProperty("risk");
    expect(retentionPlan.length).toBeGreaterThan(0);
    expect(stage).toMatchObject({ stage: "completed" });
  });

  it.each(["de", "es", "fr", "pt"] as const)(
    "generates full and short outputs for %s",
    async (language) => {
      const tempDir = mkdtempSync(path.join(os.tmpdir(), `story-localization-${language}-`));
      const client = makeMockClient([
        {
          output_text: JSON.stringify(makeEnglishShortPayload()),
        },
        {
          output_text: JSON.stringify(makeLocalizedPackage(language)),
        },
      ]);
      const result = await localizeStoryEpisode(sourceFile, makeConfig(tempDir, [language]), { client: client as never });
      expect(result.failure).toBeUndefined();
      expect(client.responses.create).toHaveBeenCalledTimes(2);
      expect(
        await fs.readFile(
          path.join(
            tempDir,
            "002-even-killers-can-lick",
            language,
            "full",
            "script.md"
          ),
          "utf8"
        )
      ).toContain(`# Episode 002`);
      expect(
        await fs.readFile(
          path.join(
            tempDir,
            "002-even-killers-can-lick",
            language,
            "short",
            "script.md"
          ),
          "utf8"
        )
      ).toContain(`# Short 002`);
    }
  );

  it("persists failed localized outputs in the episode batch folder", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-localization-failed-"));
    const client = makeMockClient([
      {
        output_text: JSON.stringify(makeEnglishShortPayload()),
      },
      {
        output_text: JSON.stringify(
          makeLocalizedPackage("de", {
            short: {
              ...makeLocalizedPackage("de").short,
              narrationParagraphs: [
                "A deliberately short German localization that fails validation because it is far too brief.",
              ],
            },
          })
        ),
      },
    ]);
    const result = await localizeStoryEpisode(sourceFile, makeConfig(tempDir, ["de"]), {
      client: client as never,
    });
    expect(result.failure).toBeDefined();
    const failedDir = path.join(
      tempDir,
      "002-even-killers-can-lick",
      ".batch",
      "failed",
      "002-even-killers-can-lick",
      "de"
    );
    expect(await fs.readFile(path.join(failedDir, "002-even-killers-can-lick-de-report.json"), "utf8")).toContain(
      "\"failureMessage\""
    );
    expect(await fs.readFile(path.join(failedDir, "002-even-killers-can-lick-de-raw.json"), "utf8")).toContain(
      "\"failureMessage\""
    );
  });

  it("reports malformed JSON and keeps retry attempts bounded", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-localization-malformed-"));
    const client = makeMockClient([{ output_text: "not-json" }]);
    const result = await localizeStoryEpisode(sourceFile, makeConfig(tempDir, []), { client: client as never });
    expect(result.failure).toContain("failed via OpenAI model");
    expect(client.responses.create).toHaveBeenCalledTimes(1);
  });

  it("performs one successful repair pass", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-localization-repair-"));
    const client = makeMockClient([
      {
        output_text: JSON.stringify({
          short: {
            title: "The Killer Was Already Inside the House",
            narrationInstructions: ["Use the same narrator as the full episode."],
            narrationParagraphs: ["Too short."],
            thumbnailText: "IT WASN'T THE DOG",
            description: "Short description.",
            hashtags: ["#Shorts", "#Horror", "#DarkTruthEpisodes"],
            targetNarrationWpm: 180,
            recommendedDurationSeconds: { min: 55, max: 65 },
            visualGuidance: "Mirror.",
          },
          preservationChecklist: {
            charactersPreserved: true,
            relationshipsPreserved: true,
            chronologyPreserved: true,
            criticalObjectsPreserved: true,
            cluesPreserved: true,
            writtenMessagesPreserved: true,
            primaryRevealPreserved: true,
            endingPreserved: true,
            noNewPlotElementsAdded: true,
          },
          diagnostics: {
            fullWordCount: 1,
            shortWordCount: 2,
            shortEstimatedDurationSeconds: 1,
            removedGenericFiller: [],
            adaptationNotes: [],
          },
        }),
      },
      {
        output_text: JSON.stringify(makeEnglishShortPayload()),
      },
    ]);
    const result = await localizeStoryEpisode(sourceFile, makeConfig(tempDir, []), { client: client as never });
    expect(result.failure).toBeUndefined();
    expect(result.repairAttempts).toBe(1);
    expect(client.responses.create).toHaveBeenCalledTimes(2);
  });

  it("fails after the repair pass if the result is still broken", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-localization-repair-fail-"));
    const client = makeMockClient([
      {
        output_text: JSON.stringify({
          short: {
            title: "Broken",
            narrationInstructions: ["Broken"],
            narrationParagraphs: ["too short"],
            thumbnailText: "BROKEN",
            description: "Broken",
            hashtags: ["#Bad"],
            targetNarrationWpm: 180,
            recommendedDurationSeconds: { min: 55, max: 65 },
            visualGuidance: "Broken",
          },
          preservationChecklist: {
            charactersPreserved: true,
            relationshipsPreserved: true,
            chronologyPreserved: true,
            criticalObjectsPreserved: true,
            cluesPreserved: true,
            writtenMessagesPreserved: true,
            primaryRevealPreserved: true,
            endingPreserved: true,
            noNewPlotElementsAdded: true,
          },
          diagnostics: {
            fullWordCount: 1,
            shortWordCount: 1,
            shortEstimatedDurationSeconds: 1,
            removedGenericFiller: [],
            adaptationNotes: [],
          },
        }),
      },
      {
        output_text: JSON.stringify({
          short: {
            title: "Still Broken",
            narrationInstructions: ["Still broken"],
            narrationParagraphs: ["too short again but now with a little more text for the retry."],
            thumbnailText: "BROKEN",
            description: "Broken",
            hashtags: ["#Bad"],
            targetNarrationWpm: 180,
            recommendedDurationSeconds: { min: 55, max: 65 },
            visualGuidance: "Broken",
          },
          preservationChecklist: {
            charactersPreserved: false,
            relationshipsPreserved: true,
            chronologyPreserved: true,
            criticalObjectsPreserved: true,
            cluesPreserved: true,
            writtenMessagesPreserved: true,
            primaryRevealPreserved: true,
            endingPreserved: true,
            noNewPlotElementsAdded: true,
          },
          diagnostics: {
            fullWordCount: 1,
            shortWordCount: 1,
            shortEstimatedDurationSeconds: 1,
            removedGenericFiller: [],
            adaptationNotes: [],
          },
        }),
      },
      {
        output_text: JSON.stringify({
          short: {
            title: "Recovered",
            narrationInstructions: ["Recovered"],
            narrationParagraphs: ["This version is finally long enough to pass the retry path."],
            thumbnailText: "OK",
            description: "Recovered",
            hashtags: ["#Bad"],
            targetNarrationWpm: 180,
            recommendedDurationSeconds: { min: 55, max: 65 },
            visualGuidance: "Recovered",
          },
          preservationChecklist: {
            charactersPreserved: true,
            relationshipsPreserved: true,
            chronologyPreserved: true,
            criticalObjectsPreserved: true,
            cluesPreserved: true,
            writtenMessagesPreserved: true,
            primaryRevealPreserved: true,
            endingPreserved: true,
            noNewPlotElementsAdded: true,
          },
          diagnostics: {
            fullWordCount: 1,
            shortWordCount: 1,
            shortEstimatedDurationSeconds: 1,
            removedGenericFiller: [],
            adaptationNotes: [],
          },
        }),
      },
    ]);
    const result = await localizeStoryEpisode(sourceFile, makeConfig(tempDir, []), { client: client as never });
    expect(result.failure).toContain("Short word count");
    expect(client.responses.create).toHaveBeenCalledTimes(3);
  });

  it("flags missing character, written message, and primary reveal issues", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-localization-validation-"));
    const client = makeMockClient([
      {
      output_text: JSON.stringify({
        short: makeEnglishShortPayload({
          narrationParagraphs: buildShortNarration(false, false, false),
        }).short,
          preservationChecklist: {
            charactersPreserved: true,
            relationshipsPreserved: true,
            chronologyPreserved: true,
            criticalObjectsPreserved: true,
            cluesPreserved: true,
            writtenMessagesPreserved: true,
            primaryRevealPreserved: true,
            endingPreserved: true,
            noNewPlotElementsAdded: true,
          },
          diagnostics: {
            fullWordCount: 100,
            shortWordCount: countWords(buildShortNarration(false, false, false).join(" ")),
            shortEstimatedDurationSeconds: 58,
            removedGenericFiller: [],
            adaptationNotes: [],
          },
        }),
      },
      {
        output_text: JSON.stringify(makeEnglishShortPayload({ narrationParagraphs: buildShortNarration(false, false, false) })),
      },
    ]);
    const result = await localizeStoryEpisode(sourceFile, makeConfig(tempDir, []), { client: client as never });
    expect(result.failure).toMatch(/Character names are missing|Written messages are not preserved|Primary reveal not preserved/);
  });

  it("classifies retryable errors", () => {
    expect(isRetryableStoryLocalizationError({ retryable: true })).toBe(true);
    expect(isRetryableStoryLocalizationError({ status: 429 })).toBe(true);
    expect(isRetryableStoryLocalizationError(new Error("boom"))).toBe(false);
  });
});
