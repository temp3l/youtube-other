import { mkdtempSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { syncEpisodeSharedImageAssets } from "./episode-image-pipeline.js";

async function createPng(filePath: string, color: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await sharp({
    create: { width: 8, height: 8, channels: 3, background: color },
  })
    .png()
    .toFile(filePath);
}

describe("episode image shared sync", () => {
  it("copies state renders into shared outputs and restores character references", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "mediaforge-sync-shared-"));
    const episodeDir = path.join(root, "episode");
    const stateImagesDir = path.join(
      episodeDir,
      "state",
      "image-generation",
      "images"
    );
    const manifestsDir = path.join(
      episodeDir,
      "state",
      "image-generation",
      "manifests"
    );
    const sharedOutputDir = path.join(episodeDir, "shared", "images", "generated");
    const backupRefsDir = path.join(
      episodeDir,
      "shared",
      "images.bak",
      "character-references"
    );

    await createPng(path.join(stateImagesDir, "scene-001.png"), "#445566");
    await createPng(path.join(backupRefsDir, "noah-price.png"), "#667788");
    await fs.mkdir(manifestsDir, { recursive: true });
    await fs.writeFile(
      path.join(manifestsDir, "scene-001.json"),
      JSON.stringify(
        {
          sceneId: "scene-001",
          promptVersion: 1,
          finalPrompt: "prompt",
          promptHash: "abc",
          materialDifferencesFromPrevious: [],
          characterIds: [],
          referenceImages: [],
          model: "gpt-image-2",
          size: "1536x1024",
          quality: "low",
          outputPath: path.join(sharedOutputDir, "scene-001__000000-000003__16x9.png"),
          status: "generated",
          attempts: 0,
        },
        null,
        2
      ),
      "utf8"
    );

    const result = await syncEpisodeSharedImageAssets(episodeDir, "episode");

    expect(result.copiedGeneratedImages).toBe(1);
    expect(result.copiedCharacterReferences).toBe(1);
    expect(await fs.stat(path.join(sharedOutputDir, "scene-001__000000-000003__16x9.png"))).toBeTruthy();
    expect(await fs.stat(path.join(episodeDir, "shared", "images", "character-references", "noah-price.png"))).toBeTruthy();
  });
});
