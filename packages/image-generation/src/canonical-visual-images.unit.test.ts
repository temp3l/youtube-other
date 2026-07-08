import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CanonicalVisualManifest } from "@mediaforge/domain";
import {
  ensureCanonicalVisualManifestImages,
  type CanonicalVisualImageGenerator,
} from "./canonical-visual-images.js";

async function tempEpisodeDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "canonical-visual-images-"));
}

function makeManifest(variant: "full" | "short"): CanonicalVisualManifest {
  return {
    episodeSlug: "022-the-whistler-in-the-woods" as never,
    variant,
    canonicalLanguage: "en",
    schemaVersion: 1,
    createdAt: "2026-07-08T00:00:00.000Z",
    scenes: [
      {
        sceneId: "scene-001" as never,
        visualBeat: "A hallway under a single dim light.",
        characters: [],
        location: "hallway",
        visibleElements: ["single dim light"],
        continuityTags: ["dim hallway"],
        imagePrompt: "cinematic hallway",
        minDurationSeconds: 2,
        maxDurationSeconds: 5,
      },
    ],
  };
}

describe("canonical visual image generation", () => {
  it("generates missing images under the matching full visual image directory", async () => {
    const episodeDir = await tempEpisodeDir();
    const calls: string[] = [];
    const generator: CanonicalVisualImageGenerator = {
      async generate(input) {
        calls.push(input.outputPath);
        await fs.writeFile(input.outputPath, `fake image for ${input.scene.sceneId}`);
      },
    };

    const result = await ensureCanonicalVisualManifestImages({
      episodeDir,
      manifest: makeManifest("full"),
      imageGenerator: generator,
    });

    expect(calls).toEqual([path.join(episodeDir, "visuals/full/images/scene-001.png")]);
    expect(result.images[0]).toMatchObject({
      sceneId: "scene-001",
      imagePath: "visuals/full/images/scene-001.png",
      generated: true,
      reused: false,
    });
    expect(result.manifest.scenes[0]?.imagePath).toBe("visuals/full/images/scene-001.png");
    await expect(fs.access(path.join(episodeDir, "visuals/short/images/scene-001.png"))).rejects.toThrow();
  });

  it("reuses existing short images and never reads full image paths", async () => {
    const episodeDir = await tempEpisodeDir();
    const shortImagePath = path.join(episodeDir, "visuals/short/images/scene-001.png");
    const fullImagePath = path.join(episodeDir, "visuals/full/images/scene-001.png");
    await fs.mkdir(path.dirname(shortImagePath), { recursive: true });
    await fs.mkdir(path.dirname(fullImagePath), { recursive: true });
    await fs.writeFile(shortImagePath, "short image");
    await fs.writeFile(fullImagePath, "full image");

    const result = await ensureCanonicalVisualManifestImages({
      episodeDir,
      manifest: makeManifest("short"),
      imageGenerator: {
        async generate() {
          throw new Error("localized languages must not generate images by default");
        },
      },
    });

    expect(result.images[0]).toMatchObject({
      sceneId: "scene-001",
      imagePath: "visuals/short/images/scene-001.png",
      generated: false,
      reused: true,
    });
    expect(result.images[0]?.imagePath).not.toContain("visuals/full");
  });

  it("fails clearly for missing short images when no explicit generator is configured", async () => {
    const episodeDir = await tempEpisodeDir();
    await fs.mkdir(path.join(episodeDir, "visuals/full/images"), { recursive: true });
    await fs.writeFile(path.join(episodeDir, "visuals/full/images/scene-001.png"), "full image");

    await expect(
      ensureCanonicalVisualManifestImages({
        episodeDir,
        manifest: makeManifest("short"),
      })
    ).rejects.toThrow(
      "Missing short visual image for scene-001. Expected path: visuals/short/images/scene-001.png. Full-video image fallback is disabled for short renders."
    );
  });
});
