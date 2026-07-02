import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hashText } from "@mediaforge/shared";
import { segmentNarration } from "./narration-segmentation.js";

async function createEpisode(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-segmentation-"));
  const episodeDir = path.join(root, "009-mary-gloria-the-christmas-doll");
  await fs.mkdir(episodeDir, { recursive: true });
  return episodeDir;
}

describe("deterministic narration segmentation", () => {
  it("writes stable ordered chunks with neighboring context excerpts", async () => {
    const episodeDir = await createEpisode();
    const spokenText = [
      "Mary Gloria heard the attic door click. She held her breath and counted each step above her bed.",
      "",
      "Then she found the doll sitting where no doll had been. The painted eyes were wet.",
      "",
      "By morning, the truth was waiting in the mirror. Mary never slept with the light off again.",
    ].join("\n");

    const first = await segmentNarration({
      episodeDir,
      language: "en",
      spokenText,
      spokenTextHash: hashText(spokenText),
      createdAt: "2026-01-02T03:04:05.000Z",
      config: { maxWordsPerChunk: 22, targetWordsPerChunk: 18 },
    });
    const second = await segmentNarration({
      episodeDir,
      language: "en",
      spokenText,
      spokenTextHash: hashText(spokenText),
      createdAt: "2026-01-02T03:04:05.000Z",
      config: { maxWordsPerChunk: 22, targetWordsPerChunk: 18 },
    });

    expect(first.manifest).toEqual(second.manifest);
    expect(first.manifest.chunks.map((chunk) => chunk.chunkId)).toEqual([
      "narr-chunk-001",
      "narr-chunk-002",
      "narr-chunk-003",
    ]);
    expect(first.manifest.chunks[0]?.role).toBe("hook");
    expect(first.manifest.chunks[1]?.previousContextExcerpt).toContain("above her bed.");
    expect(first.manifest.chunks[1]?.nextContextExcerpt).toContain("By morning");
    expect(JSON.parse(await fs.readFile(first.paths.chunkManifest, "utf8"))).toEqual(first.manifest);
  });

  it("falls back to sentence packing when one paragraph exceeds preferred limits", async () => {
    const episodeDir = await createEpisode();
    const spokenText = [
      "The hallway stretched farther than the house allowed.",
      "Mary counted one door, then two doors, then a third door breathing in the dark.",
      "When she touched the knob, someone on the other side touched back.",
    ].join(" ");

    const result = await segmentNarration({
      episodeDir,
      language: "en",
      spokenText,
      createdAt: "2026-01-02T03:04:05.000Z",
      config: { maxWordsPerChunk: 12, hardMaxWordsPerChunk: 20, targetWordsPerChunk: 10 },
    });

    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason).toBe("paragraph-overflow");
    expect(result.manifest.chunks.length).toBeGreaterThan(1);
    expect(result.manifest.chunks.every((chunk) => chunk.estimatedWordCount <= 20)).toBe(true);
  });
});
