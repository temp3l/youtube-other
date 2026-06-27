import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  createStoryLocalizationConfig,
  isRetryableStoryLocalizationError,
  localizeStoryEpisode,
  parseCanonicalSourceStory,
  readCanonicalFactsCache,
  resolveEpisodeCacheDirectory,
  type GeneratedFullStoryPackageShape,
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
  const responseFn = vi.fn(async () => {
    const next = queue.shift();
    if (!next) {
      throw new Error("No mock response left.");
    }
    return {
      id: next.id ?? "resp_mock",
      output_text: next.output_text,
      output_parsed: next.output_text ? JSON.parse(next.output_text) : null,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        input_tokens_details: { cached_tokens: 0 },
      },
    };
  });
  return {
    responses: {
      create: responseFn,
      parse: responseFn,
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
    "She found the same wet tracks in the hallway, the same attic note, HUMANS CAN LICK TOO was written on the mirror, and the notebook still said SHE REACHED DOWN FIRST.",
    "By the time she understood the rule, the house had already learned Elena Ward's name and the final choice had become a trap.",
  ];
}

function makeLocalizedPackage(language: LanguageCode, overrides?: Partial<GeneratedStoryPackage>): GeneratedStoryPackage {
  return {
    language,
    full: {
      title: `${language.toUpperCase()} House of Licking Shadows`,
      audioInstructions: ["Use a steady narrator.", "Keep the tone restrained."],
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

function makeEnglishFullPayload(overrides?: Partial<GeneratedStoryPackage["full"]>) {
  return makeLocalizedPackage("en", overrides);
}

function makeFullOnlyPayload(
  language: LanguageCode,
  overrides?: Partial<GeneratedStoryPackage["full"]>
): GeneratedFullStoryPackageShape {
  const base = makeLocalizedPackage(language, overrides);
  const full = base.full;
  if (!full) {
    throw new Error("Expected full package payload.");
  }
  return {
    language,
    full,
    preservationChecklist: base.preservationChecklist,
    diagnostics: base.diagnostics,
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

function makeFullOnlyConfig(
  outputDir: string,
  languages: readonly Exclude<LanguageCode, "en">[]
) {
  return createStoryLocalizationConfig({
    sourceDirectory: path.join(
      repoRoot,
      "content-ideas",
      "content",
      "dark-truth-episodes-multilingual-production-pack"
    ),
    outputDirectory: outputDir,
    languages,
    includeEnglishShort: false,
    includeLocalizedShorts: false,
    debugOutputs: true,
    debugPrefix: "stories-rewrite-full",
    force: true,
    model: "gpt-4o-mini",
  });
}

describe("story localization integration", () => {
  it("generates the English short and copies the English full story", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-localization-en-"));
    const client = makeMockClient([
      {
        output_text: JSON.stringify(makeEnglishFullPayload()),
      },
      {
        output_text: JSON.stringify(makeEnglishShortPayload()),
      },
    ]);
    const result = await localizeStoryEpisode(sourceFile, makeConfig(tempDir, []), { client: client as never });
    expect(result.failure).toBeUndefined();
    expect(client.responses.create).toHaveBeenCalledTimes(2);
    expect(
      await fs.readFile(
        path.join(tempDir, "002-even-killers-can-lick", "script.md"),
        "utf8"
      )
    ).toContain("EN House of Licking Shadows");
  });

  it("persists production artifacts and stage state", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-localization-production-"));
    const client = makeMockClient([
      {
        output_text: JSON.stringify(makeEnglishFullPayload()),
      },
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

  it("writes canonical facts under the generated English full hash when available", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-localization-canonical-facts-"));
    const client = makeMockClient([
      {
        output_text: JSON.stringify(makeEnglishFullPayload()),
      },
      {
        output_text: JSON.stringify(makeEnglishShortPayload()),
      },
    ]);
    const result = await localizeStoryEpisode(
      sourceFile,
      makeConfig(tempDir, []),
      { client: client as never }
    );
    expect(result.failure).toBeUndefined();
    const englishFullPath = path.join(
      tempDir,
      "002-even-killers-can-lick",
      "script.md"
    );
    const parsedEnglishFull = await parseCanonicalSourceStory(englishFullPath);
    const cacheDir = resolveEpisodeCacheDirectory(
      tempDir,
      "002-even-killers-can-lick"
    );
    const cachedFacts = await readCanonicalFactsCache(
      cacheDir,
      parsedEnglishFull.sourceHash
    );
    expect(cachedFacts).not.toBeNull();
    expect(cachedFacts?.threat).toBeDefined();
  });

  it.each(["de", "es", "fr", "pt"] as const)(
    "generates full and short outputs for %s",
    async (language) => {
      const tempDir = mkdtempSync(path.join(os.tmpdir(), `story-localization-${language}-`));
      const client = makeMockClient([
        {
          output_text: JSON.stringify(makeEnglishFullPayload()),
        },
        {
          output_text: JSON.stringify(makeEnglishShortPayload()),
        },
        {
          output_text: JSON.stringify(makeLocalizedPackage(language)),
        },
      ]);
      const result = await localizeStoryEpisode(sourceFile, makeConfig(tempDir, [language]), { client: client as never });
      expect(result.failure).toBeUndefined();
      expect(client.responses.create).toHaveBeenCalledTimes(3);
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

  it("writes only full outputs and per-language debug payloads when shorts are disabled", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-localization-full-only-"));
    const client = makeMockClient([
      {
        output_text: JSON.stringify(makeFullOnlyPayload("en")),
      },
      {
        output_text: JSON.stringify(makeFullOnlyPayload("de")),
      },
    ]);
    const result = await localizeStoryEpisode(sourceFile, makeFullOnlyConfig(tempDir, ["de"]), {
      client: client as never,
    });
    expect(result.failure).toBeUndefined();
    expect(client.responses.create).toHaveBeenCalledTimes(2);
    expect(result.generatedFiles.every((file) => !file.includes(`${path.sep}short${path.sep}`))).toBe(true);
    const debugDir = path.join(tempDir, "002-even-killers-can-lick", "debug");
    expect(
      await fs.readFile(
        path.join(debugDir, "stories-rewrite-full-en.prompt.md"),
        "utf8"
      )
    ).toContain("SYSTEM:");
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(debugDir, "stories-rewrite-full-en.request.json"),
          "utf8"
        )
      )
    ).toHaveProperty("model", "gpt-4o-mini");
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(debugDir, "stories-rewrite-full-de.response.json"),
          "utf8"
        )
      )
    ).toHaveProperty("responseId");
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(debugDir, "stories-rewrite-full-de.response-text.json"),
          "utf8"
        )
      )
    ).toHaveProperty("language", "de");
  });

  it("writes request and error debug payloads when the OpenAI call fails before response", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-localization-debug-failure-"));
    const client = {
      responses: {
        create: vi.fn(async () => {
          throw new Error("Request was aborted.");
        }),
      },
    };
    const result = await localizeStoryEpisode(sourceFile, makeFullOnlyConfig(tempDir, ["de"]), {
      client: client as never,
    });
    expect(result.failure).toContain("Request was aborted.");
    const debugDir = path.join(tempDir, "002-even-killers-can-lick", "debug");
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(debugDir, "stories-rewrite-full-en.request.json"),
          "utf8"
        )
      )
    ).toHaveProperty("model", "gpt-4o-mini");
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(debugDir, "stories-rewrite-full-en.error.json"),
          "utf8"
        )
      )
    ).toHaveProperty("error.message", "Request was aborted.");
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(debugDir, "stories-rewrite-full-en.response.json"),
          "utf8"
        )
      )
    ).toHaveProperty("status", "failed");
  });

  it("resumes completed full outputs and only generates missing languages", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-localization-resume-full-"));
    const initialClient = makeMockClient([
      {
        output_text: JSON.stringify(makeFullOnlyPayload("en")),
      },
      {
        output_text: JSON.stringify(makeFullOnlyPayload("de")),
      },
    ]);
    const initialResult = await localizeStoryEpisode(
      sourceFile,
      makeFullOnlyConfig(tempDir, ["de"]),
      { client: initialClient as never }
    );
    expect(initialResult.failure).toBeUndefined();
    expect(initialClient.responses.create).toHaveBeenCalledTimes(2);

    const resumeClient = makeMockClient([
      {
        output_text: JSON.stringify(makeFullOnlyPayload("es")),
      },
    ]);
    const resumeResult = await localizeStoryEpisode(sourceFile, createStoryLocalizationConfig({
      sourceDirectory: path.join(repoRoot, "content-ideas", "content", "dark-truth-episodes-multilingual-production-pack"),
      outputDirectory: tempDir,
      languages: ["de", "es"],
      includeEnglishShort: false,
      includeLocalizedShorts: false,
      debugOutputs: true,
      debugPrefix: "stories-rewrite-full",
      force: false,
      resume: true,
      model: "gpt-4o-mini",
    }), {
      client: resumeClient as never,
    });

    expect(resumeResult.failure).toBeUndefined();
    expect(resumeClient.responses.create).toHaveBeenCalledTimes(1);
    expect(resumeResult.generatedFiles.some((file) => file.includes(`${path.sep}es${path.sep}full${path.sep}`))).toBe(true);
    expect(resumeResult.skippedFiles.some((file) => file.includes(`${path.sep}de${path.sep}full${path.sep}`))).toBe(true);
  });

  it("persists localized outputs in the episode output folder", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-localization-failed-"));
    const client = makeMockClient([
      {
        output_text: JSON.stringify(makeEnglishFullPayload()),
      },
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
      {
        output_text: JSON.stringify(makeLocalizedPackage("de")),
      },
    ]);
    const result = await localizeStoryEpisode(sourceFile, makeConfig(tempDir, ["de"]), {
      client: client as never,
    });
    expect(result.failure).toBeUndefined();
    expect(result.generatedFiles.length).toBeGreaterThan(1);
    const localizedDir = path.join(
      tempDir,
      "002-even-killers-can-lick",
      "de"
    );
    expect(await fs.readFile(path.join(localizedDir, "full", "script.md"), "utf8")).toContain(
      "# Episode 002"
    );
    expect(await fs.readFile(path.join(localizedDir, "short", "script.md"), "utf8")).toContain(
      "# Short 002"
    );
  });

  it("reports malformed JSON and keeps retry attempts bounded", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-localization-malformed-"));
    const client = makeMockClient([{ output_text: "not-json" }]);
    const result = await localizeStoryEpisode(sourceFile, makeConfig(tempDir, []), { client: client as never });
    expect(result.failure).toContain("failed via OpenAI model");
    expect(client.responses.create).toHaveBeenCalledTimes(1);
  });

  it("classifies retryable errors", () => {
    expect(isRetryableStoryLocalizationError({ retryable: true })).toBe(true);
    expect(isRetryableStoryLocalizationError({ status: 429 })).toBe(true);
    expect(isRetryableStoryLocalizationError(new Error("boom"))).toBe(false);
  });
});
