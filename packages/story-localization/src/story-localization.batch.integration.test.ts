import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  createStoryLocalizationConfig,
  downloadStoryLocalizationBatch,
  importStoryLocalizationBatch,
  prepareStoryLocalizationBatch,
  localizeStoryEpisode,
  readLocalBatchManifest,
  retryFailedStoryBatch,
  saveLocalBatchManifest,
  resolveBatchStorageLayout,
  refreshStoryLocalizationBatch,
  StoryBatchIndexService,
  submitStoryLocalizationBatch,
  toRepositoryRelativePath,
  validateImportedStoryBatch,
  type GeneratedStoryPackage,
  type LanguageCode,
} from "./index.js";
import { countWords, estimateDurationSeconds } from "./story-localization.utils.js";

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
const episode002RenamedCharacter = "Elias Wexler";

function buildShortNarration(): string[] {
  const filler =
    "The house stayed wet and silent while Elena counted each step and listened for the next breath.";
  let text =
    "Elena Ward heard Bramble licking beneath the bed while the storm hit the windows. " +
    "By morning the dog was dead in the hallway, and HUMANS CAN LICK TOO was written on the mirror. " +
    "The notebook said SHE REACHED DOWN FIRST. Did Elena Ward understand the intruder had already learned how to hide?";
  while (countWords(text) < 150) {
    text = `${text} ${filler}`;
  }
  return [text];
}

function buildFullNarration(language: LanguageCode): string[] {
  if (language === "de") {
    return [
      "Elena Ward blieb nach Einbruch der Dunkelheit im Haus und hörte Bramble unter dem Bett atmen, während draußen der Sturm gegen die Fenster schlug.",
      "Ihre Tante war wegen einer medizinischen Konferenz in Brighton fort, und Elena fand nasse Spuren an der Treppe, dieselbe Dachbodennotiz, HUMANS CAN LICK TOO auf dem Spiegel und im Notizbuch stand weiter SHE REACHED DOWN FIRST.",
      "Als der Alarm den Nachbarn nach draußen zog, floh der Eindringling durch die Dachluke. Did Elena Ward blieb als schreckliche Frage zurück, weil Elena Ward nie sicher wusste, ob der Täter wirklich verschwunden war.",
    ];
  }
  const filler =
    "The house stayed wet and silent while Elena counted each step and listened for the next breath.";
  let first =
    `${language.toUpperCase()} version: Elena Ward stayed in the house after dark and kept hearing Bramble breathe from under the bed. ` +
    "Her aunt had left for a medical conference near Brighton, a storm rolled in, the power failed, and Elena checked the stairs, the kitchen, and the attic for anything that could explain the sound.";
  let second =
    "She found the same wet tracks by the stairs, the same attic note, HUMANS CAN LICK TOO. was written on the mirror, and the notebook still said SHE REACHED DOWN FIRST. The car alarm drew the neighbour outside and the intruder fled through the loft hatch.";
  while (countWords(`${first} ${second}`) < 155) {
    second = `${second} ${filler}`;
  }
  return [
    first,
    second,
    "Did Elena Ward defeat the intruder, or did the encounter teach him how to remain hidden? The final warning is therefore simple: when the same impossible detail appears twice, do not wait for a third occurrence to prove that it is real.",
  ];
}

function buildRenamedFullNarration(language: LanguageCode): string[] {
  if (language === "de") {
    return [
      `${episode002RenamedCharacter} blieb nach Einbruch der Dunkelheit im Haus und hörte Bramble unter dem Bett atmen, während draußen der Sturm gegen die Fenster schlug.`,
      "Ihre Tante war wegen einer medizinischen Konferenz in Brighton fort, und Elias fand nasse Spuren an der Treppe, dieselbe Dachbodennotiz, HUMANS CAN LICK TOO auf dem Spiegel und im Notizbuch stand weiter SHE REACHED DOWN FIRST.",
      `Als der Alarm den Nachbarn nach draußen zog, floh der Eindringling durch die Dachluke. Did ${episode002RenamedCharacter}, Dara Quill und Dara Elias Wexler blieben als schreckliche Frage zurück, weil Elias nie sicher wusste, ob der Täter wirklich verschwunden war.`,
    ];
  }
  const filler =
    "The house stayed wet and silent while Elias counted each step and listened for the next breath.";
  let first =
    `${language.toUpperCase()} version: ${episode002RenamedCharacter} stayed in the house after dark and kept hearing Bramble breathe from under the bed. ` +
    "Her aunt had left for a medical conference near Brighton, a storm rolled in, the power failed, and Elias checked the stairs, the kitchen, and the attic for anything that could explain the sound.";
  let second =
    "She found the same wet tracks by the stairs, the same attic note, HUMANS CAN LICK TOO. was written on the mirror, and the notebook still said SHE REACHED DOWN FIRST. The car alarm drew the neighbour outside and the intruder fled through the loft hatch.";
  while (countWords(`${first} ${second}`) < 155) {
    second = `${second} ${filler}`;
  }
  return [
    first,
    second,
    `Did ${episode002RenamedCharacter} defeat the intruder, or did Dara Quill and Dara Elias Wexler learn how to remain hidden? The final warning is therefore simple: when the same impossible detail appears twice, do not wait for a third occurrence to prove that it is real.`,
  ];
}

function makeEnglishShortPayload() {
  return {
    short: {
      title: "The Killer Was Already Inside the House",
      narrationInstructions: ["Use the same narrator as the full episode."],
      narrationParagraphs: buildShortNarration(),
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
      shortWordCount: countWords(buildShortNarration().join(" ")),
      shortEstimatedDurationSeconds: 58,
      removedGenericFiller: [],
      adaptationNotes: ["Derived from the English full story."],
    },
  };
}

function makeShortRewritePayload() {
  const hook =
    "Elena Ward heard Bramble licking beneath the bed while the storm hit the windows.";
  const filler =
    "She kept replaying the dripping stairs and the attic warning.";
  let narration =
    `${hook} ` +
    "Her aunt was away near Brighton, and by morning the dog was dead by the stairs, HUMANS CAN LICK TOO was written on the mirror, and the notebook still said SHE REACHED DOWN FIRST. " +
    "When the car alarm pulled the neighbour outside, the intruder fled through the loft hatch and every step toward the attic made the breathing sound seem closer than before. Did Elena Ward escape, or did the encounter teach him how to remain hidden?";
  while (countWords(narration) < 155) {
    narration = `${narration} ${filler}`;
  }
  return {
    title: "The Killer Was Already Inside the House",
    hook,
    narration,
    wordCount: countWords(narration),
    estimatedDurationSecondsAt175Wpm: estimateDurationSeconds(
      countWords(narration),
      175
    ),
    estimatedDurationSecondsAt180Wpm: estimateDurationSeconds(
      countWords(narration),
      180
    ),
    thumbnailText: "IT WASN'T THE DOG",
    fullVideoBridge: "Watch the full episode for the complete story.",
  };
}

function makeRenamedShortRewritePayload() {
  const hook =
    `${episode002RenamedCharacter} heard Bramble licking beneath the bed while the storm hit the windows.`;
  const filler =
    "Elias kept replaying the dripping stairs and the attic warning.";
  let narration =
    `${hook} ` +
    "Her aunt was away near Brighton, and by morning the dog was dead by the stairs, HUMANS CAN LICK TOO was written on the mirror, and the notebook still said SHE REACHED DOWN FIRST. " +
    `When the car alarm pulled the neighbour outside, the intruder fled through the loft hatch and every step toward the attic made the breathing sound seem closer than before. Did ${episode002RenamedCharacter} escape, or did Dara Quill and Dara Elias Wexler learn how to remain hidden?`;
  while (countWords(narration) < 155) {
    narration = `${narration} ${filler}`;
  }
  return {
    title: "The Killer Was Already Inside the House",
    hook,
    narration,
    wordCount: countWords(narration),
    estimatedDurationSecondsAt175Wpm: estimateDurationSeconds(
      countWords(narration),
      175
    ),
    estimatedDurationSecondsAt180Wpm: estimateDurationSeconds(
      countWords(narration),
      180
    ),
    thumbnailText: "IT WASN'T THE DOG",
    fullVideoBridge: "Watch the full episode for the complete story.",
  };
}

function makeCanonicalEnglishFullPayload(options: { readonly renamed?: boolean } = {}) {
  return {
    language: "en",
    full: {
      narrationParagraphs: options.renamed
        ? buildRenamedFullNarration("en")
        : buildFullNarration("en"),
    },
    targetNarrationWpm: 170,
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
      removedGenericFiller: [],
      adaptationNotes: ["Derived from the English full story."],
    },
  };
}

function makeLocalizedPackage(language: LanguageCode): GeneratedStoryPackage {
  return {
    language,
    full: {
      title: `${language.toUpperCase()} House of Licking Shadows`,
      sourceTitle: "Even Killers Can Lick",
      audioInstructions: [
        "Use a steady narrator.",
        "Keep the tone restrained.",
      ],
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
  };
}

function makeRenamedLocalizedPackage(language: LanguageCode): GeneratedStoryPackage {
  return {
    ...makeLocalizedPackage(language),
    full: {
      ...makeLocalizedPackage(language).full!,
      narrationParagraphs: buildRenamedFullNarration(language),
    },
    short: {
      ...makeLocalizedPackage(language).short,
      narrationParagraphs: [makeRenamedShortRewritePayload().narration],
    },
  };
}

function makeRenamedLocalizedFullPayload(language: LanguageCode) {
  return {
    language,
    full: {
      narrationParagraphs: buildRenamedFullNarration(language),
    },
    targetNarrationWpm: 170,
    preservationChecklist: makeLocalizedPackage(language).preservationChecklist,
    diagnostics: {
      removedGenericFiller: [],
      adaptationNotes: ["Derived from the English full story."],
    },
  };
}

function makeBatchClient(outputJsonl: string, errorJsonl = "") {
  return {
    responses: {
      create: vi.fn(),
    },
    files: {
      create: vi.fn(async () => ({ id: "file_input_1" })),
      content: vi.fn(async (fileId: string) => ({
        text: async () =>
          fileId === "file_output_1"
            ? outputJsonl
            : fileId === "file_error_1"
              ? errorJsonl
              : "",
      })),
    },
    batches: {
      create: vi.fn(async () => ({
        id: "batch_1",
        status: "validating",
        endpoint: "/v1/responses",
        input_file_id: "file_input_1",
        completion_window: "24h",
        created_at: 1,
        object: "batch",
      })),
      retrieve: vi.fn(async () => ({
        id: "batch_1",
        status: "completed",
        endpoint: "/v1/responses",
        input_file_id: "file_input_1",
        output_file_id: "file_output_1",
        ...(errorJsonl ? { error_file_id: "file_error_1" } : {}),
        completion_window: "24h",
        created_at: 1,
        completed_at: 2,
        request_counts: {
          total: 2,
          completed: 2,
          failed: 0,
        },
        object: "batch",
      })),
      cancel: vi.fn(),
    },
  };
}

function makeStoryClient(responses: readonly unknown[]) {
  const queue = [...responses];
  const responseFn = vi.fn(async () => {
    const next = queue.shift();
    if (!next) {
      throw new Error("No mock response left.");
    }
    return {
      id: "resp_mock",
      output_text: JSON.stringify(next),
      output_parsed: next,
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

function makeConfig(outputDir: string) {
  return createStoryLocalizationConfig({
    sourceDirectory: path.join(
      repoRoot,
      "content-ideas",
      "content",
      "dark-truth-episodes-multilingual-production-pack"
    ),
    outputDirectory: outputDir,
    languages: ["de"],
    includeEnglishShort: true,
    processingMode: "batch",
    force: true,
    model: "gpt-5.5",
  });
}

function makeSyncWarmConfig(
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
    processingMode: "sync",
    force: true,
    model: "gpt-5.5",
  });
}

describe("story localization batch integration", () => {
  it("prepares a batch with manifest, index, and jsonl input", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-batch-prepare-"));
    const config = makeConfig(tempDir);
    const prepared = await prepareStoryLocalizationBatch([sourceFile], config);
    expect(prepared.itemCount).toBe(3);
    expect(await fs.readFile(prepared.inputFilePath, "utf8")).toContain(
      '"custom_id"'
    );
    const requestLines = (await fs.readFile(prepared.inputFilePath, "utf8"))
      .trim()
      .split("\n")
      .map(
        (line) =>
          JSON.parse(line) as {
            body: { text?: { format?: { name?: string; schema?: unknown } } };
          }
      );
    const localizationRequest = requestLines.find(
      (line) => line.body.text?.format?.name === "full_narration_story_package"
    );
    expect(localizationRequest?.body.text?.format?.name).toBe(
      "full_narration_story_package"
    );
    expect(
      JSON.stringify(localizationRequest?.body.text?.format?.schema)
    ).not.toContain("thumbnailText");
    const index = new StoryBatchIndexService(tempDir);
    const latest = await index.getLatest();
    expect(latest?.localBatchId).toBe(prepared.localBatchId);
    expect(latest?.status).toBe("prepared");
    const layout = resolveBatchStorageLayout(tempDir);
    const manifest = await readLocalBatchManifest(
      layout,
      prepared.localBatchId
    );
    expect(manifest?.items[0]?.sourcePath).toBe(
      toRepositoryRelativePath(
        path.join(
          tempDir,
          "002-even-killers-can-lick",
          "source",
          "002-even-killers-can-lick-en-full.md"
        )
      )
    );
    const localizationItem = manifest?.items.find(
      (item) => item.operation === "localization"
    );
    expect(
      manifest?.items.find((item) => item.operation === "canonical-english-full")
    ).toBeDefined();
    expect(localizationItem?.promptFingerprint).toBeTruthy();
    expect(localizationItem?.responseSchemaName).toBe(
      "full_narration_story_package"
    );
    expect(localizationItem?.parentArtifact).toMatchObject({
      kind: "canonical-english-full",
      language: "en",
      locale: "en-US",
      variant: "full",
    });
    expect(localizationItem?.parentArtifact?.fingerprint).toHaveLength(64);
    expect(localizationItem?.parentArtifact?.storyIrHash).toHaveLength(64);
    expect(localizationItem?.parentArtifact?.contractHash).toHaveLength(64);
    expect(
      await fs.readFile(
        path.join(
          tempDir,
          "002-even-killers-can-lick",
          "source",
          "002-even-killers-can-lick-en-full.md"
        ),
        "utf8"
      )
    ).toContain("Bramble");
  });

  it("records preflight-failed batch items without JSONL request lines", async () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "story-batch-preflight-")
    );
    const config = createStoryLocalizationConfig({
      outputDirectory: tempDir,
      languages: ["es"],
      includeEnglishShort: false,
      processingMode: "batch",
      submit: false,
      model: "gpt-3.5-turbo",
      force: true,
    });

    const prepared = await prepareStoryLocalizationBatch(
      [sourceFile],
      config
    );
    const layout = resolveBatchStorageLayout(tempDir);
    const manifest = await readLocalBatchManifest(
      layout,
      prepared.localBatchId
    );
    const jsonl = await fs.readFile(prepared.inputFilePath, "utf8");

    expect(prepared.itemCount).toBe(0);
    expect(jsonl.trim()).toBe("");
    expect(manifest?.items).toHaveLength(2);
    expect(manifest?.items.every((item) => item.status === "preflight-failed")).toBe(true);
    expect(manifest?.items.every((item) => item.preflight?.status === "blocked")).toBe(true);
  });

  it("persists production artifacts during batch preparation", async () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "story-batch-production-")
    );
    const config = makeConfig(tempDir);
    await prepareStoryLocalizationBatch([sourceFile], config);
    const productionDir = path.join(
      tempDir,
      "002-even-killers-can-lick",
      ".localization-cache",
      "production",
      "002",
      "002-even-killers-can-lick"
    );
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(productionDir, "source-analysis.json"),
          "utf8"
        )
      )
    ).toHaveProperty("issueSummary");
    expect(
      JSON.parse(
        await fs.readFile(path.join(productionDir, "story-bible.json"), "utf8")
      )
    ).toHaveProperty("protagonist");
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(productionDir, "originality-review.json"),
          "utf8"
        )
      )
    ).toHaveProperty("risk");
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(productionDir, "production-state.json"),
          "utf8"
        )
      )
    ).toMatchObject({ stage: "retention-plan" });
  });

  it("plans missing multilingual work after a warm sync attempt", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-batch-warm-"));
    const storyClient = makeStoryClient([
      makeCanonicalEnglishFullPayload({ renamed: true }),
      makeRenamedLocalizedFullPayload("de"),
    ]);
    await localizeStoryEpisode(sourceFile, makeSyncWarmConfig(tempDir, ["de"]), {
      client: storyClient as never,
    });
    await fs.rm(path.join(tempDir, "002-even-killers-can-lick", "source"), {
      recursive: true,
      force: true,
    });
    const prepared = await prepareStoryLocalizationBatch(
      [sourceFile],
      createStoryLocalizationConfig({
        sourceDirectory: path.join(
          repoRoot,
          "content-ideas",
          "content",
          "dark-truth-episodes-multilingual-production-pack"
        ),
      outputDirectory: tempDir,
      languages: ["de", "es"],
      includeEnglishShort: true,
      processingMode: "batch",
      force: false,
      model: "gpt-5.5",
    })
    );
    expect(prepared.itemCount).toBe(4);
    const manifest = await readLocalBatchManifest(
      resolveBatchStorageLayout(tempDir),
      prepared.localBatchId
    );
    expect(manifest?.items).toHaveLength(4);
    expect(manifest?.items.map((item) => item.language)).toEqual([
      "en",
      "en",
      "de",
      "es",
    ]);
  });

  it("re-enqueues canonical English full work when prompt settings become stale", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-batch-stale-"));
    const storyClient = makeStoryClient([
      makeCanonicalEnglishFullPayload({ renamed: true }),
      makeRenamedLocalizedFullPayload("de"),
    ]);
    await localizeStoryEpisode(sourceFile, makeSyncWarmConfig(tempDir, ["de"]), {
      client: storyClient as never,
    });
    await fs.rm(path.join(tempDir, "002-even-killers-can-lick", "source"), {
      recursive: true,
      force: true,
    });
    const prepared = await prepareStoryLocalizationBatch(
      [sourceFile],
      createStoryLocalizationConfig({
        sourceDirectory: path.join(
          repoRoot,
          "content-ideas",
          "content",
          "dark-truth-episodes-multilingual-production-pack"
        ),
      outputDirectory: tempDir,
      languages: ["de"],
      includeEnglishShort: true,
      processingMode: "batch",
      force: false,
      model: "gpt-5.5",
      promptVersion: "story-localization-v2",
    })
    );
    expect(prepared.itemCount).toBeGreaterThan(0);
    const manifest = await readLocalBatchManifest(
      resolveBatchStorageLayout(tempDir),
      prepared.localBatchId
    );
    expect(
      manifest?.items.some((item) => item.operation === "canonical-english-full")
    ).toBe(true);
  });

  it("submits, refreshes, and imports a completed batch", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-batch-import-"));
    const config = makeConfig(tempDir);
    const prepared = await prepareStoryLocalizationBatch([sourceFile], config);
    const input = await fs.readFile(prepared.inputFilePath, "utf8");
    const lines = input
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { custom_id: string });
    const outputJsonl = [
      {
        custom_id: lines[2]?.custom_id,
        response: {
          status_code: 200,
          body: {
            output_text: JSON.stringify({
              language: "de",
              full: {
                narrationParagraphs: [
                  "Elena Ward blieb nach Einbruch der Dunkelheit im Haus und hörte Bramble unter dem Bett atmen, während draußen der Sturm gegen die Fenster schlug.",
                  'Im Flur sah sie dieselben nassen Spuren wieder, auf dem Spiegel stand weiter HUMANS CAN LICK TOO, und im Notizbuch stand noch immer SHE REACHED DOWN FIRST.',
                  "Am Ende verstand Elena Ward endlich, dass der Eindringling schon die ganze Nacht im Haus gewesen war. Did Elena Ward blieb als letzte Frage zurück, und diese Gewissheit ließ sie ohne sicheren Ausweg zurück.",
                ],
              },
              targetNarrationWpm: 170,
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
                removedGenericFiller: [],
                adaptationNotes: ["Derived from the English full story."],
              },
            }),
          },
        },
      },
      {
        custom_id: lines[0]?.custom_id,
        response: {
          status_code: 200,
          body: { output_text: JSON.stringify(makeCanonicalEnglishFullPayload()) },
        },
      },
      {
        custom_id: lines[1]?.custom_id,
        response: {
          status_code: 200,
          body: { output_text: JSON.stringify(makeEnglishShortPayload()) },
        },
      },
    ]
      .map((line) => JSON.stringify(line))
      .join("\n");
    const client = makeBatchClient(outputJsonl);
    const submitted = await submitStoryLocalizationBatch(
      prepared.localBatchId,
      config,
      client as never
    );
    expect(submitted.openAIBatchId).toBe("batch_1");
    const refreshed = await refreshStoryLocalizationBatch(
      prepared.localBatchId,
      config,
      client as never
    );
    expect(refreshed.status).toBe("completed");
    const downloaded = await downloadStoryLocalizationBatch(
      prepared.localBatchId,
      config,
      client as never
    );
    expect(downloaded.resultFilePath).toBeTruthy();
    expect(
      await fs
        .readFile(
          path.join(
            tempDir,
            "002-even-killers-can-lick",
            "de",
            "full",
            "script.md"
          ),
          "utf8"
        )
        .catch(() => "")
    ).toBe("");
    expect(
      await fs.readFile(
        path.join(tempDir, "batches", prepared.localBatchId, "input.jsonl"),
        "utf8"
      )
    ).toContain('"custom_id"');
    const imported = await importStoryLocalizationBatch(
      prepared.localBatchId,
      config,
      client as never
    );
    expect(imported.failedItemCount).toBe(0);
    const reimported = await importStoryLocalizationBatch(
      prepared.localBatchId,
      config,
      client as never
    );
    expect(reimported.failedItemCount).toBe(0);
    const validation = await validateImportedStoryBatch(
      prepared.localBatchId,
      config
    );
    expect(validation.failedItemCount).toBe(0);
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(tempDir, "batches", prepared.localBatchId, "retry-plan.json"),
          "utf8"
        )
      )
    ).toMatchObject({ candidateCount: 0 });
    expect(
      await fs.readFile(
        path.join(tempDir, "002-even-killers-can-lick", "script.md"),
        "utf8"
      )
    ).toContain("# Episode 002");
    expect(
      await fs.readFile(
        path.join(
          tempDir,
          "002-even-killers-can-lick",
          "en",
          "full",
          "script.md"
        ),
        "utf8"
      )
    ).toContain("# Episode 002");
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
    expect(
      await fs.readFile(
        path.join(
          tempDir,
          "002-even-killers-can-lick",
          "de",
          "full",
          "script.md"
        ),
        "utf8"
      )
    ).toContain("# Episode 002");
    const canonicalResult = JSON.parse(
      await fs.readFile(
        path.join(
          tempDir,
          "002-even-killers-can-lick",
          ".localization-cache",
          "production",
          "002",
          "002-even-killers-can-lick",
          "de-full-narration-result.json"
        ),
        "utf8"
      )
    ) as {
      sourceFormat: string;
      result: { full: Record<string, unknown> };
      deprecationDiagnostics: readonly string[];
      lineage: {
        kind: string;
        language: string;
        locale: string;
        variant: string;
        fingerprint: string;
      };
    };
    expect(canonicalResult.sourceFormat).toBe("narration-only");
    expect(canonicalResult.deprecationDiagnostics.length).toBe(0);
    expect(canonicalResult.lineage).toMatchObject({
      kind: "canonical-english-full",
      language: "en",
      locale: "en-US",
      variant: "full",
    });
    expect(canonicalResult.lineage.fingerprint).toHaveLength(64);
    expect(canonicalResult.result.full).toHaveProperty("narrationParagraphs");
    expect(canonicalResult.result.full).not.toHaveProperty("thumbnailText");
  });

  it("imports successful siblings and records provider failure retry candidates", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-batch-partial-"));
    const config = makeConfig(tempDir);
    const prepared = await prepareStoryLocalizationBatch([sourceFile], config);
    const lines = (await fs.readFile(prepared.inputFilePath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { custom_id: string });
    const outputJsonl = [
      {
        custom_id: lines[0]?.custom_id,
        response: {
          status_code: 200,
          body: { output_text: JSON.stringify(makeCanonicalEnglishFullPayload()) },
        },
      },
      {
        custom_id: lines[1]?.custom_id,
        response: {
          status_code: 200,
          body: { output_text: JSON.stringify(makeEnglishShortPayload()) },
        },
      },
    ]
      .map((line) => JSON.stringify(line))
      .join("\n");
    const errorJsonl = JSON.stringify({
      custom_id: lines[2]?.custom_id,
      error: { code: "rate_limit_exceeded", message: "try later" },
    });
    const client = makeBatchClient(outputJsonl, errorJsonl);
    await submitStoryLocalizationBatch(prepared.localBatchId, config, client as never);
    await downloadStoryLocalizationBatch(prepared.localBatchId, config, client as never);
    const imported = await importStoryLocalizationBatch(
      prepared.localBatchId,
      config,
      client as never
    );
    expect(imported.failedItemCount).toBe(1);
    expect(
      await fs.readFile(
        path.join(tempDir, "002-even-killers-can-lick", "en", "short", "script.md"),
        "utf8"
      )
    ).toContain("# Short 002");
    const retryPlan = JSON.parse(
      await fs.readFile(
        path.join(tempDir, "batches", prepared.localBatchId, "retry-plan.json"),
        "utf8"
      )
    ) as { candidateCount: number; candidates: readonly { status: string }[] };
    expect(retryPlan.candidateCount).toBe(1);
    expect(retryPlan.candidates[0]?.status).toBe("api-failed");
  });

  it("blocks approved artifact overwrite without force and records validation retry candidates", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-batch-approved-"));
    const config = createStoryLocalizationConfig({
      sourceDirectory: path.join(
        repoRoot,
        "content-ideas",
        "content",
        "dark-truth-episodes-multilingual-production-pack"
      ),
      outputDirectory: tempDir,
      languages: ["de"],
      includeEnglishShort: true,
      processingMode: "batch",
      force: false,
      model: "gpt-5.5",
    });
    const protectedPath = path.join(
      tempDir,
      "002-even-killers-can-lick",
      "de",
      "full",
      "script.md"
    );
    await fs.mkdir(path.dirname(protectedPath), { recursive: true });
    await fs.writeFile(protectedPath, "APPROVED STORY\n", "utf8");
    const approvalDir = path.join(
      tempDir,
      "002-even-killers-can-lick",
      "reviews",
      "de",
      "full"
    );
    await fs.mkdir(approvalDir, { recursive: true });
    await fs.writeFile(
      path.join(approvalDir, "approval.json"),
      JSON.stringify({ approvalState: "human-approved", decision: "approved" }),
      "utf8"
    );
    const prepared = await prepareStoryLocalizationBatch([sourceFile], config);
    const lines = (await fs.readFile(prepared.inputFilePath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { custom_id: string });
    const outputJsonl = [
      {
        custom_id: lines[0]?.custom_id,
        response: {
          status_code: 200,
          body: { output_text: JSON.stringify(makeCanonicalEnglishFullPayload()) },
        },
      },
      {
        custom_id: lines[1]?.custom_id,
        response: {
          status_code: 200,
          body: { output_text: JSON.stringify(makeEnglishShortPayload()) },
        },
      },
      {
        custom_id: lines[2]?.custom_id,
        response: {
          status_code: 200,
          body: {
            output_text: JSON.stringify({
              language: "de",
              full: { narrationParagraphs: buildFullNarration("de") },
              targetNarrationWpm: 170,
              preservationChecklist: makeLocalizedPackage("de").preservationChecklist,
              diagnostics: {
                removedGenericFiller: [],
                adaptationNotes: ["Derived from the English full story."],
              },
            }),
          },
        },
      },
    ]
      .map((line) => JSON.stringify(line))
      .join("\n");
    const client = makeBatchClient(outputJsonl);
    await submitStoryLocalizationBatch(prepared.localBatchId, config, client as never);
    await downloadStoryLocalizationBatch(prepared.localBatchId, config, client as never);
    const imported = await importStoryLocalizationBatch(
      prepared.localBatchId,
      config,
      client as never
    );
    expect(imported.failedItemCount).toBe(1);
    expect(await fs.readFile(protectedPath, "utf8")).toBe("APPROVED STORY\n");
    const manifest = await readLocalBatchManifest(
      resolveBatchStorageLayout(tempDir),
      prepared.localBatchId
    );
    expect(
      manifest?.items.find((item) => item.operation === "localization")?.status
    ).toBe("validation-failed");
    const retryPlan = JSON.parse(
      await fs.readFile(
        path.join(tempDir, "batches", prepared.localBatchId, "retry-plan.json"),
        "utf8"
      )
    ) as { candidates: readonly { status: string }[] };
    expect(retryPlan.candidates.map((candidate) => candidate.status)).toEqual([
      "validation-failed",
    ]);
  });

  it("rebuilds and verifies the batch index from manifests", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-batch-rebuild-"));
    const config = makeConfig(tempDir);
    await prepareStoryLocalizationBatch([sourceFile], config);
    const index = new StoryBatchIndexService(tempDir);
    const rebuilt = await index.rebuild();
    expect(rebuilt.entriesRebuilt).toBe(1);
    const verification = await index.verify();
    expect(verification.ok).toBe(true);
  });

  it("retries only failed manifest items and adds a deterministic retry suffix", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-batch-retry-"));
    const config = makeConfig(tempDir);
    const prepared = await prepareStoryLocalizationBatch([sourceFile], config);
    const layout = resolveBatchStorageLayout(tempDir);
    const manifest = await readLocalBatchManifest(
      layout,
      prepared.localBatchId
    );
    expect(manifest).toBeDefined();
    if (!manifest) {
      return;
    }
    await saveLocalBatchManifest(layout, {
      ...manifest,
      items: manifest.items.map((item) =>
        item.operation === "localization"
          ? { ...item, status: "content-invalid" as const }
          : { ...item, status: "persisted" as const }
      ),
    });
    const retried = await retryFailedStoryBatch(prepared.localBatchId, config);
    const retryManifest = await readLocalBatchManifest(
      layout,
      retried.localBatchId
    );
    expect(retried.itemCount).toBe(1);
    expect(retryManifest?.parentLocalBatchId).toBe(prepared.localBatchId);
    expect(retryManifest?.retryNumber).toBe(1);
    expect(retryManifest?.items).toHaveLength(1);
    expect(retryManifest?.items[0]?.customId.endsWith(":r2")).toBe(true);
    expect(retryManifest?.items[0]?.language).toBe("de");
  });
});
