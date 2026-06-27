import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  buildConfigurationHash,
  buildOutputFiles,
  buildLocalizationPrompt,
  countWords,
  copyFileAtomicIfChanged,
  detectForbiddenPhrases,
  detectGenericFiller,
  discoverCanonicalSourceStories,
  estimateDurationSeconds,
  extractCanonicalStoryFacts,
  getLanguageProfile,
  createOpenAiStoryClient,
  generatedStoryPackageSchema,
  parseCanonicalSourceFilename,
  parseCanonicalSourceStory,
  resolveDefaultOutputDirectory,
  resolveDefaultSourceDirectory,
  selectSourceCandidates,
  createStoryLocalizationConfig,
  localizeStoryEpisode,
  buildStoryBible,
  analyzeStorySource,
  buildOriginalityReview,
  buildRetentionPlan,
  validateHashtags,
  validatePreservationChecklist,
  validateTitleAndThumbnail,
  validateWrittenMessagesPreserved,
  writeTextAtomicIfChanged,
} from "./index.js";

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

function buildLocalizedNarration(wordCount: number): string[] {
  const base = [
    "Elena Ward escuchó a Bramble respirar bajo la cama durante la tormenta.",
    "Por la mañana, HUMANS CAN LICK TOO estaba escrito en el espejo y SHE REACHED DOWN FIRST seguía en la habitación.",
    "La casa permaneció húmeda, silenciosa y atenta mientras Elena buscaba la salida.",
  ].join(" ");
  const filler = "silencio";
  let text = base;
  while (countWords(text) < wordCount) {
    text = `${text} ${filler}`;
  }
  return [text];
}

function makeLocalizedPackage(language: LanguageCode, shortWordCount: number): GeneratedStoryPackage {
  return {
    language,
    full: {
      title: `${language.toUpperCase()} House of Licking Shadows`,
      audioInstructions: ["Use a steady narrator.", "Keep the tone restrained."],
      narrationParagraphs: [
        `${language.toUpperCase()} version: Elena Ward stayed in the house after dark and kept hearing Bramble breathe from under the bed.`,
        "She found the same wet tracks in the hallway, the same attic note, and the same impossible message on the mirror.",
        "By the time she understood the rule, the house had already learned Elena Ward's name and the final choice had become a trap.",
      ],
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
      narrationParagraphs: buildLocalizedNarration(shortWordCount),
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
      shortWordCount: shortWordCount,
      shortEstimatedDurationSeconds: 58,
      removedGenericFiller: [],
      adaptationNotes: [],
    },
  };
}

describe("story localization helpers", () => {
  it("resolves the fixed default directories from the repository root", () => {
    expect(resolveDefaultSourceDirectory()).toBe(
      path.join(
        repoRoot,
        "content",
        "dark-truth-episodes-multilingual-production-pack"
      )
    );
    expect(resolveDefaultOutputDirectory()).toBe(
      path.join(repoRoot, "content-ideas", "content", "dark-truth-episodes")
    );
  });

  it("parses canonical source filenames", () => {
    expect(
      parseCanonicalSourceFilename("002-even-killers-can-lick-en-full.md")
    ).toMatchObject({
      episodeNumber: "002",
      slug: "even-killers-can-lick",
    });
  });

  it("builds episode-prefixed output filenames", () => {
    expect(buildOutputFiles("/out", "002-even-killers-can-lick", "de")).toEqual(
      {
        full: "/out/002-even-killers-can-lick/de/full/script.md",
        short: "/out/002-even-killers-can-lick/de/short/script.md",
        rootScript: "/out/002-even-killers-can-lick/script.md",
      }
    );
  });

  it("discovers only canonical English full stories", async () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "story-localization-discovery-")
    );
    const episodeDir = path.join(tempDir, "001-demo");
    await fs.mkdir(path.join(episodeDir, "en"), { recursive: true });
    await fs.mkdir(path.join(episodeDir, "de"), { recursive: true });
    await fs.writeFile(
      path.join(episodeDir, "en", "001-demo-en-full.md"),
      "# Episode 001 — Demo\n\n## Narration Script\n\nText\n\n## Episode Metadata\n**Episode number:** 001\n**Primary title:** Demo\n"
    );
    await fs.writeFile(
      path.join(episodeDir, "en", "001-demo-en-short.md"),
      "# Short 001 — Demo"
    );
    await fs.writeFile(
      path.join(episodeDir, "de", "001-demo-de-full.md"),
      "# Episode 001 — Demo"
    );
    const discovered = await discoverCanonicalSourceStories(tempDir);
    expect(discovered).toHaveLength(1);
    expect(discovered[0]?.filePath).toContain("001-demo-en-full.md");
  });

  it("matches explicit file selections against normalized absolute paths", () => {
    const selected = selectSourceCandidates(
      [
        {
          episodeNumber: "002",
          slug: "even-killers-can-lick",
          filePath: path.resolve(
            repoRoot,
            "content-ideas",
            "content",
            "dark-truth-episodes-multilingual-production-pack",
            "002-even-killers-can-lick",
            "en",
            "002-even-killers-can-lick-en-full.md"
          ),
        },
      ],
      {
        file: path.join(
          repoRoot,
          "content-ideas",
          "content",
          "dark-truth-episodes-multilingual-production-pack",
          "002-even-killers-can-lick",
          "en",
          "002-even-killers-can-lick-en-full.md"
        ),
      }
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]?.episodeNumber).toBe("002");
  });

  it("counts words and estimates spoken duration", () => {
    expect(countWords("One two three")).toBe(3);
    expect(Math.round(estimateDurationSeconds(180, 180))).toBe(60);
  });

  it("loads the language profile for Portuguese", () => {
    const profile = getLanguageProfile("pt");
    expect(profile.locale).toBe("pt-BR");
    expect(profile.shortWordRange.target).toBeGreaterThan(0);
  });

  it("adds explicit full and short guidance to the localization prompts", async () => {
    const parsed = await parseCanonicalSourceStory(sourceFile);
    const facts = extractCanonicalStoryFacts(parsed);
    const analysis = analyzeStorySource(parsed, facts);
    const bible = buildStoryBible(parsed, facts, analysis);
    const fullPrompt = buildLocalizationPrompt({
      languageProfile: getLanguageProfile("es"),
      adaptationMode: "retention-optimized",
      sourceStory: parsed,
      canonicalFacts: facts,
      target: "full",
      productionContext: {
        analysis,
        bible,
        originalityReview: buildOriginalityReview(parsed, facts, analysis),
        retentionPlan: buildRetentionPlan(parsed, bible),
      },
    });
    expect(fullPrompt.user).toContain("Full output guidance:");
    expect(fullPrompt.user).toContain("Full narration target: 1750 words.");
    expect(fullPrompt.user).toContain("Written message guidance:");
    expect(fullPrompt.user).toContain("Source analysis:");
    expect(fullPrompt.user).toContain("Story bible:");
    expect(fullPrompt.user).toContain("Originality review:");
    expect(fullPrompt.user).toContain("Retention plan:");
    expect(fullPrompt.user).not.toContain("Short output guidance:");

    const prompt = buildLocalizationPrompt({
      languageProfile: getLanguageProfile("es"),
      adaptationMode: "retention-optimized",
      sourceStory: parsed,
      canonicalFacts: facts,
      target: "short",
      productionContext: {
        analysis,
        bible,
        originalityReview: buildOriginalityReview(parsed, facts, analysis),
        retentionPlan: buildRetentionPlan(parsed, bible),
      },
    });
    expect(prompt.user).toContain("Short output guidance:");
    expect(prompt.user).toContain("Short narration target: 160 words.");
    expect(prompt.user).toContain("Hard limit: keep the short narration within 100-200 words.");
    expect(prompt.user).toContain("Aim for roughly 150-165 words.");
    expect(prompt.user).toContain("Use exactly 2-3 short paragraphs.");
    expect(prompt.user).toContain("Use 5-7 sentences total.");
    expect(prompt.user).toContain("If the draft is below the minimum, add one concrete sentence about the protagonist's next action and one sentence about the immediate consequence before ending.");
    expect(prompt.user).toContain("Exact written messages to preserve verbatim:");
    expect(prompt.user).toContain("HUMANS CAN LICK TOO");
  });

  it("retries short-length failures with a targeted short rewrite", async () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "story-localization-short-retry-")
    );
    const config = createStoryLocalizationConfig({
      outputDirectory: tempDir,
      languages: ["es"],
      includeEnglishShort: false,
      processingMode: "sync",
      force: true,
    });
    const client = makeMockClient([
      { output_text: JSON.stringify(makeLocalizedPackage("es", 80)) },
      { output_text: JSON.stringify(makeLocalizedPackage("es", 80)) },
      { output_text: JSON.stringify(makeLocalizedPackage("es", 165)) },
    ]);

    const result = await localizeStoryEpisode(sourceFile, config, {
      client: client as never,
    });

    expect(result.failure).toBeUndefined();
    expect(client.responses.create).toHaveBeenCalledTimes(3);
    expect(
      await fs.readFile(
        path.join(
          tempDir,
          "002-even-killers-can-lick",
          "es",
          "short",
          "script.md"
        ),
        "utf8"
      )
    ).toContain("# Short 002");
  });

  it("accepts OPENAI_API_TOKEN as a fallback credential alias", () => {
    const previousKey = process.env.OPENAI_API_KEY;
    const previousToken = process.env.OPENAI_API_TOKEN;
    try {
      delete process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_TOKEN = "test-token";
      expect(() => createOpenAiStoryClient()).not.toThrow();
    } finally {
      if (previousKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousKey;
      }
      if (previousToken === undefined) {
        delete process.env.OPENAI_API_TOKEN;
      } else {
        process.env.OPENAI_API_TOKEN = previousToken;
      }
    }
  });

  it("detects title, thumbnail, hashtag, and preservation issues", () => {
    expect(validateTitleAndThumbnail("", "Valid thumb").length).toBeGreaterThan(
      0
    );
    expect(validateHashtags(["#Valid", "bad tag"])).toEqual(["bad tag"]);
    expect(
      validatePreservationChecklist({
        charactersPreserved: true,
        relationshipsPreserved: false,
        chronologyPreserved: true,
        criticalObjectsPreserved: true,
        cluesPreserved: true,
        writtenMessagesPreserved: true,
        primaryRevealPreserved: true,
        endingPreserved: true,
        noNewPlotElementsAdded: true,
      })
    ).toContain("relationshipsPreserved");
  });

  it("detects generic filler and forbidden phrases", () => {
    expect(detectGenericFiller("The protagonist arrived.")).toContain(
      "The protagonist"
    );
    expect(
      detectForbiddenPhrases("Here is the translation of the story.")
    ).toContain("Here is the translation");
  });

  it("preserves written messages semantically", () => {
    const missing = validateWrittenMessagesPreserved(
      {
        episodeNumber: "002",
        primaryTitle: "Test",
        characters: [],
        criticalObjects: [],
        criticalEvents: [],
        writtenMessages: ["HUMANS CAN LICK TOO"],
        threat: "threat",
        primaryReveal: "reveal",
        finalConsequence: "ending",
      },
      "A story without the note."
    );
    expect(missing).toEqual(["HUMANS CAN LICK TOO"]);
  });

  it("keeps cache hashes stable", () => {
    expect(buildConfigurationHash(["a", "b"])).toBe(
      buildConfigurationHash(["a", "b"])
    );
    expect(buildConfigurationHash(["a", "b"])).not.toBe(
      buildConfigurationHash(["a", "c"])
    );
  });

  it("includes OpenAI status and code details when story localization fails", async () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "story-localization-openai-error-")
    );
    const config = createStoryLocalizationConfig({
      outputDirectory: tempDir,
      languages: [],
      processingMode: "sync",
    });
    const client = {
      responses: {
        create: async () => {
          throw {
            message: "quota exceeded",
            status: 429,
            code: "insufficient_quota",
          };
        },
      },
    };

    const result = await localizeStoryEpisode(sourceFile, config, {
      client: client as never,
    });

    expect(result.failure).toContain("English short story localization");
    expect(result.failure).toContain("insufficient_quota");
    expect(result.failure).toContain("status 429");
    expect(result.failure).toContain("Check API billing");
  }, 15000);

  it("labels OpenAI connectivity failures distinctly", async () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "story-localization-openai-connectivity-")
    );
    const config = createStoryLocalizationConfig({
      outputDirectory: tempDir,
      languages: [],
      processingMode: "sync",
    });
    const client = {
      responses: {
        create: async () => {
          throw {
            message: "fetch failed",
            code: "ECONNRESET",
          };
        },
      },
    };

    const result = await localizeStoryEpisode(sourceFile, config, {
      client: client as never,
    });

    expect(result.failure).toContain("Connection/transport error");
    expect(result.failure).toContain("ECONNRESET");
  }, 15000);

  it("fails fast with a clear OpenAI preflight message", async () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "story-localization-openai-preflight-")
    );
    const config = createStoryLocalizationConfig({
      outputDirectory: tempDir,
      languages: [],
      processingMode: "sync",
    });
    const client = {
      responses: {
        create: vi.fn(async () => {
          throw {
            message: "fetch failed",
            code: "ECONNRESET",
          };
        }),
      },
    };

    await expect(
      localizeStoryEpisode(sourceFile, config, {
        client: client as never,
        preflightConnectivity: true,
      })
    ).rejects.toThrow(
      "Unable to reach OpenAI before story localization started"
    );
    expect(client.responses.create).toHaveBeenCalledTimes(1);
  }, 15000);

  it("retries transient OpenAI connectivity failures before succeeding", async () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "story-localization-openai-retry-")
    );
    const config = createStoryLocalizationConfig({
      outputDirectory: tempDir,
      languages: [],
      processingMode: "sync",
    });
    const client = {
      responses: {
        create: vi
          .fn()
          .mockRejectedValueOnce({
            message: "socket hang up",
            code: "ECONNRESET",
          })
          .mockResolvedValueOnce({
            id: "resp_retry",
            output_text: JSON.stringify({
              short: {
                title: "The Killer Was Already Inside the House",
                narrationInstructions: ["Use the same narrator as the full episode."],
                narrationParagraphs: buildLocalizedNarration(165),
                thumbnailText: "IT WASN'T THE DOG",
                description: "Elena hears something under the bed.",
                hashtags: ["#Shorts", "#Horror", "#DarkTruthEpisodes"],
                targetNarrationWpm: 180,
                recommendedDurationSeconds: { min: 55, max: 65 },
                visualGuidance: "Mirror, hallway, attic.",
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
                shortWordCount: 165,
                shortEstimatedDurationSeconds: 55,
                removedGenericFiller: [],
                adaptationNotes: ["Derived from the English full story."],
              },
            }),
            usage: {
              input_tokens: 10,
              output_tokens: 10,
              input_tokens_details: { cached_tokens: 0 },
            },
          }),
      },
    };

    const result = await localizeStoryEpisode(sourceFile, config, {
      client: client as never,
    });

    expect(result.failure).toBeUndefined();
    expect(client.responses.create).toHaveBeenCalledTimes(2);
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

  it("accepts generated localized full stories without sourceTitle", () => {
    const parsed = generatedStoryPackageSchema.shape.full.parse({
      title: "Some Title",
      audioInstructions: ["Keep it tense."],
      narrationParagraphs: ["One.", "Two.", "Three."],
      thumbnailText: "Nightfall",
      contentDisclosure: "Horror content.",
      seoDescription: "A short description.",
      tags: ["tag-1", "tag-2", "tag-3"],
      hashtags: ["#Horror"],
      targetNarrationWpm: 170,
      visualDirection: "Cinematic and dark.",
    });
    expect(parsed.sourceTitle).toBeUndefined();
  });

  it("writes files atomically and skips unchanged writes", async () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "story-localization-atomic-")
    );
    const filePath = path.join(tempDir, "note.txt");
    expect(await writeTextAtomicIfChanged(filePath, "hello", false)).toBe(
      "written"
    );
    expect(await writeTextAtomicIfChanged(filePath, "hello", false)).toBe(
      "skipped"
    );
    const copyPath = path.join(tempDir, "copy.txt");
    expect(await copyFileAtomicIfChanged(filePath, copyPath, false)).toBe(
      "written"
    );
    expect(await fs.readFile(copyPath, "utf8")).toBe("hello");
  });

  it("parses the canonical English source story and extracts facts", async () => {
    const parsed = await parseCanonicalSourceStory(sourceFile);
    const facts = extractCanonicalStoryFacts(parsed);
    expect(parsed.language).toBe("en");
    expect(facts.episodeNumber).toBe("002");
    expect(
      facts.characters.some((character) => character.name.includes("Elena"))
    ).toBe(true);
    expect(facts.writtenMessages.join(" ")).toContain("HUMANS CAN LICK TOO");
  });
});
