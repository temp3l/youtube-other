import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  createStoryLocalizationConfig,
  importStoryLocalizationBatch,
  prepareStoryLocalizationBatch,
  readLocalBatchManifest,
  retryFailedStoryBatch,
  saveLocalBatchManifest,
  resolveBatchStorageLayout,
  refreshStoryLocalizationBatch,
  StoryBatchIndexService,
  submitStoryLocalizationBatch,
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

function buildShortNarration(): string[] {
  const filler =
    "The house stayed wet and silent while Elena counted each step and listened for the next breath.";
  let text =
    "Elena Ward heard Bramble licking beneath the bed while the storm hit the windows. " +
    "By morning the dog was dead in the hallway, and HUMANS CAN LICK TOO was written on the mirror. " +
    "The notebook said SHE REACHED DOWN FIRST.";
  while (countWords(text) < 165) {
    text = `${text} ${filler}`;
  }
  return [text];
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

function makeBatchClient(outputJsonl: string) {
  return {
    responses: {
      create: vi.fn(),
    },
    files: {
      create: vi.fn(async () => ({ id: "file_input_1" })),
      content: vi.fn(async (fileId: string) => ({
        text: async () => (fileId === "file_output_1" ? outputJsonl : ""),
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
    model: "gpt-4o-mini",
  });
}

describe("story localization batch integration", () => {
  it("prepares a batch with manifest, index, and jsonl input", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-batch-prepare-"));
    const config = makeConfig(tempDir);
    const prepared = await prepareStoryLocalizationBatch([sourceFile], config);
    expect(prepared.itemCount).toBe(2);
    expect(await fs.readFile(prepared.inputFilePath, "utf8")).toContain(
      '"custom_id"'
    );
    const index = new StoryBatchIndexService(tempDir);
    const latest = await index.getLatest();
    expect(latest?.localBatchId).toBe(prepared.localBatchId);
    expect(latest?.status).toBe("prepared");
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
        custom_id: lines[0]?.custom_id,
        response: {
          status_code: 200,
          body: { output_text: JSON.stringify(makeEnglishShortPayload()) },
        },
      },
      {
        custom_id: lines[1]?.custom_id,
        response: {
          status_code: 200,
          body: { output_text: JSON.stringify(makeLocalizedPackage("de")) },
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
    const imported = await importStoryLocalizationBatch(
      prepared.localBatchId,
      config,
      client as never
    );
    expect(imported.failedItemCount).toBe(0);
    expect(
      await fs.readFile(
        path.join(tempDir, "002-even-killers-can-lick-en-short.md"),
        "utf8"
      )
    ).toContain("# Short 002");
    expect(
      await fs.readFile(
        path.join(tempDir, "002-even-killers-can-lick-de-full.md"),
        "utf8"
      )
    ).toContain("# Episode 002");
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
