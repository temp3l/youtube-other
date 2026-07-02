import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hashText } from "@mediaforge/shared";
import {
  NARRATION_ARTIFACT_SCHEMA_VERSION,
  type NarrationChunkManifest,
  type PronunciationDictionary,
} from "./narration-schemas.js";
import { applyPronunciationTransforms } from "./pronunciation.js";

async function createEpisode(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-pronunciation-"));
  const episodeDir = path.join(root, "009-mary-gloria-the-christmas-doll");
  await fs.mkdir(episodeDir, { recursive: true });
  return episodeDir;
}

function manifest(): NarrationChunkManifest {
  const text = "Mary Gloria heard about Mary and the Gloria doll.";
  return {
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    episodeId: "009-mary-gloria-the-christmas-doll",
    locale: "en",
    variant: "full",
    sourceSpokenTextHash: hashText(text),
    segmentationConfig: { mode: "deterministic", version: "test-v1" },
    chunks: [
      {
        chunkId: "narr-chunk-001",
        sequence: 0,
        text,
        textHash: hashText(text),
        role: "hook",
        estimatedWordCount: 9,
        estimatedDurationMs: 3_000,
        previousContextExcerpt: "",
        nextContextExcerpt: "",
        flowIntent: "concludes",
      },
    ],
    manifestFingerprint: hashText("manifest"),
    createdAt: "2026-01-02T03:04:05.000Z",
  };
}

describe("pronunciation normalization", () => {
  it("applies longest boundary-safe replacements and writes an audit report", async () => {
    const episodeDir = await createEpisode();
    const dictionary: PronunciationDictionary = {
      language: "en",
      entries: [
        {
          entryId: "mary-gloria",
          scope: "episode",
          language: "en",
          episodeId: "009-mary-gloria-the-christmas-doll",
          phrase: "Mary Gloria",
          replacement: "MARE-ee GLOR-ee-uh",
          mandatory: true,
          enabled: true,
        },
        {
          entryId: "mary",
          scope: "language",
          language: "en",
          phrase: "Mary",
          replacement: "MARE-ee",
          mandatory: false,
          enabled: true,
        },
        {
          entryId: "unused",
          scope: "global",
          language: "global",
          phrase: "Krampus",
          replacement: "KRAHM-pus",
          mandatory: false,
          enabled: true,
        },
      ],
    };

    const result = await applyPronunciationTransforms({
      episodeDir,
      language: "en",
      manifest: manifest(),
      dictionaries: [dictionary],
      createdAt: "2026-01-02T03:04:05.000Z",
    });

    expect(result.chunks[0]?.text).toBe("MARE-ee GLOR-ee-uh heard about MARE-ee and the Gloria doll.");
    expect(result.report.appliedTransformations.map((entry) => entry.entryId)).toEqual([
      "mary-gloria",
      "mary",
    ]);
    expect(result.report.skippedEntries).toEqual([
      { entryId: "unused", reason: "unused", mandatory: false },
    ]);
    expect(JSON.parse(await fs.readFile(result.paths.pronunciationTransforms, "utf8"))).toEqual(result.report);
  });

  it("rejects unsafe arbitrary regex entries", async () => {
    await expect(
      applyPronunciationTransforms({
        episodeDir: await createEpisode(),
        language: "en",
        manifest: manifest(),
        dictionaries: [
          {
            language: "en",
            entries: [
              {
                entryId: "regex",
                scope: "language",
                language: "en",
                phrase: "Mary.*",
                replacement: "Mary",
                mandatory: false,
                enabled: true,
              },
            ],
          },
        ],
      })
    ).rejects.toThrow(/literal text|Unsafe/u);
  });
});
