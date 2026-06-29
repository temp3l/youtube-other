import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { ScenePlan } from "@mediaforge/domain";
import { hashFile } from "@mediaforge/shared";
import {
  buildShortsImageStrategyPlan,
  prepareShortsImageAssets,
  type ShortsImageConfig,
} from "./shorts-image-strategy.js";
import type { EpisodeImagePipelineSettings, ImageGenerator } from "./episode-image-pipeline.js";

function makeScenePlan(count: number): ScenePlan {
  const scenes = Array.from({ length: count }, (_, index) => {
    const sequenceNumber = index + 1;
    const startSeconds = index * 8;
    const endSeconds = startSeconds + 8;
    const sceneId = `scene-${String(sequenceNumber).padStart(3, "0")}`;
    return {
      id: sceneId,
      sequenceNumber,
      canonicalNarration: `Narration ${sequenceNumber}`,
      sourceSegmentIds: [sceneId],
      estimatedDurationSeconds: 8,
      timing: { startSeconds, endSeconds },
      visualPurpose: "advance the story",
      subject: `Subject ${sequenceNumber}`,
      action: "shown",
      setting: "cinematic documentary background",
      composition: "centered",
      cameraFraming: "wide shot",
      mood: "tense",
      continuityReferences: index > 0 ? [`scene-${String(index).padStart(3, "0")}`] : [],
      onScreenText: "",
      textRequirement: { required: false },
      negativeConstraints: ["no subtitles", "no watermark"],
      aspectRatios: ["16:9"],
      imagePrompt: `Prompt ${sequenceNumber}`,
      expectedImageFilenames: [
        `scene-${String(sequenceNumber).padStart(3, "0")}__${String(startSeconds).padStart(6, "0")}-${String(endSeconds).padStart(6, "0")}__16x9.png`,
      ],
      qualityStatus: "draft" as const,
    };
  });
  return { sourceId: "episode-1", scenes };
}

function createSettings(): EpisodeImagePipelineSettings {
  return {
    apiKey: "test-key",
    model: "gpt-4o-mini-tts",
    size: "1024x1536",
    resolvedSize: "1024x1536",
    quality: "low",
    concurrency: 1,
    maxRetries: 0,
    timeoutMs: 10_000,
    allowUnapprovedCharacterReferences: false,
    force: false,
  };
}

function createGenerator(): ImageGenerator {
  return {
    async generate(request) {
      await sharp({
        create: {
          width: 1088,
          height: 1920,
          channels: 4,
          background: { r: 12, g: 34, b: 56, alpha: 1 },
        },
      })
        .png()
        .toFile(request.providerRequest.outputPath);
      return {
        outputPath: request.providerRequest.outputPath,
        outputSha256: await hashFile(request.providerRequest.outputPath),
        model: "stub",
        size: "1088x1920",
        quality: "low",
        generationMode: "text-only",
        attempts: 1,
        durationMs: 1,
        providerRequestHash: request.providerRequest.providerRequestHash,
        promptHash: "prompt-hash",
        referenceHashes: [],
      };
    },
  };
}

describe("shorts image strategy", () => {
  it("regenerates only the leading hook scenes", () => {
    const scenePlan = makeScenePlan(6);
    const config: ShortsImageConfig = {
      enabled: true,
      keySceneCount: 5,
      portraitWidth: 1088,
      portraitHeight: 1920,
      finalWidth: 1080,
      finalHeight: 1920,
      reuseLandscapeImages: true,
      enablePanAndScan: true,
      enableBlurredFallback: true,
      forceRegenerateAll: false,
      selectionMode: "first-n",
    };
    const plan = buildShortsImageStrategyPlan(scenePlan, config, {
      landscapeDir: "/tmp/landscape",
      outputDir: "/tmp/portrait",
    });
    expect(plan.slice(0, 5).every((entry) => entry.strategy === "regenerate")).toBe(true);
    expect(plan[5]?.strategy).toBe("smart-crop");
    expect(plan[5]?.motion?.mode).toBe("pan-and-scan");
  });

  it("prepares native vertical openings and reuses landscape tail scenes", async () => {
    const tempDir = await fs.mkdtemp(path.join(process.cwd(), ".tmp-shorts-"));
    const episodeDir = path.join(tempDir, "episode");
    const landscapeDir = path.join(tempDir, "landscape");
    const outputDir = path.join(tempDir, "short", "images", "generated");
    await fs.mkdir(episodeDir, { recursive: true });
    await fs.mkdir(landscapeDir, { recursive: true });
    await fs.mkdir(path.join(episodeDir, "shared"), { recursive: true });
    await fs.writeFile(
      path.join(episodeDir, "shared", "characters.json"),
      JSON.stringify({ episodeId: "episode-1", characters: [], updatedAt: new Date().toISOString() })
    );
    const scenePlan = makeScenePlan(6);
    for (const scene of scenePlan.scenes) {
      await sharp({
        create: {
          width: 1920,
          height: 1080,
          channels: 4,
          background: {
            r: scene.sequenceNumber * 20,
            g: 30,
            b: 60,
            alpha: 1,
          },
        },
      })
        .png()
        .toFile(path.join(landscapeDir, scene.expectedImageFilenames[0] ?? `${scene.id}.png`));
    }
    const config: ShortsImageConfig = {
      enabled: true,
      keySceneCount: 5,
      portraitWidth: 1088,
      portraitHeight: 1920,
      finalWidth: 1080,
      finalHeight: 1920,
      reuseLandscapeImages: true,
      enablePanAndScan: true,
      enableBlurredFallback: true,
      forceRegenerateAll: false,
      selectionMode: "first-n",
    };
    const result = await prepareShortsImageAssets(
      episodeDir,
      "episode-1",
      scenePlan,
      createSettings(),
      config,
      {
        landscapeDir,
        outputDir,
        generator: createGenerator(),
      }
    );
    expect(result.entries).toHaveLength(6);
    expect(result.entries.slice(0, 5).every((entry) => entry.regenerated)).toBe(true);
    expect(result.entries[5]?.reusedExistingImage).toBe(true);
    const firstImage = await sharp(result.entries[0]!.outputImagePath).metadata();
    expect(firstImage.width).toBe(1080);
    expect(firstImage.height).toBe(1920);
    const tailImage = await sharp(result.entries[5]!.outputImagePath).metadata();
    expect(tailImage.width).toBe(1080);
    expect(tailImage.height).toBe(1920);
    const manifest = JSON.parse(await fs.readFile(result.manifestPath, "utf8")) as unknown[];
    expect(manifest).toHaveLength(6);
    await fs.rm(tempDir, { recursive: true, force: true });
  }, 15_000);

  it("prefers the landscape image recorded in scene metadata when duplicates exist", async () => {
    const tempDir = await fs.mkdtemp(path.join(process.cwd(), ".tmp-shorts-metadata-"));
    const episodeDir = path.join(tempDir, "episode");
    const landscapeDir = path.join(tempDir, "landscape");
    const outputDir = path.join(tempDir, "short", "images", "generated");
    await fs.mkdir(episodeDir, { recursive: true });
    await fs.mkdir(landscapeDir, { recursive: true });
    await fs.mkdir(path.join(landscapeDir, "metadata"), { recursive: true });
    await fs.mkdir(path.join(episodeDir, "shared"), { recursive: true });
    await fs.writeFile(
      path.join(episodeDir, "shared", "characters.json"),
      JSON.stringify({ episodeId: "episode-1", characters: [], updatedAt: new Date().toISOString() })
    );
    const scenePlan = makeScenePlan(1);
    const scene = scenePlan.scenes[0]!;
    const olderName = scene.expectedImageFilenames[0]!;
    const newerName = "scene-001__000000-000010__16x9.png";
    scene.expectedImageFilenames = ["scene-001__000000-000020__16x9.png"];
    for (const [index, fileName] of [olderName, newerName].entries()) {
      await sharp({
        create: {
          width: 1920,
          height: 1080,
          channels: 4,
          background: { r: 40 + index * 30, g: 20, b: 60, alpha: 1 },
        },
      })
        .png()
        .toFile(path.join(landscapeDir, fileName));
    }
    await fs.writeFile(
      path.join(landscapeDir, "metadata", `${scene.id}.json`),
      JSON.stringify({
        sceneId: scene.id,
        normalizedImagePath: path.join(landscapeDir, newerName),
      })
    );
    const result = await prepareShortsImageAssets(
      episodeDir,
      "episode-1",
      scenePlan,
      createSettings(),
      {
        enabled: true,
        keySceneCount: 0,
        portraitWidth: 1088,
        portraitHeight: 1920,
        finalWidth: 1080,
        finalHeight: 1920,
        reuseLandscapeImages: true,
        enablePanAndScan: true,
        enableBlurredFallback: true,
        forceRegenerateAll: false,
        selectionMode: "first-n",
      },
      {
        landscapeDir,
        outputDir,
        generator: createGenerator(),
      }
    );
    expect(result.entries[0]?.sourceImagePath).toBe(path.join(landscapeDir, newerName));
    await fs.rm(tempDir, { recursive: true, force: true });
  }, 15_000);

  it("removes stale portrait assets before regenerating shorts images", async () => {
    const tempDir = await fs.mkdtemp(path.join(process.cwd(), ".tmp-shorts-cleanup-"));
    const episodeDir = path.join(tempDir, "episode");
    const landscapeDir = path.join(tempDir, "landscape");
    const outputDir = path.join(tempDir, "short", "images", "generated");
    await fs.mkdir(episodeDir, { recursive: true });
    await fs.mkdir(landscapeDir, { recursive: true });
    await fs.mkdir(path.join(episodeDir, "shared"), { recursive: true });
    await fs.writeFile(
      path.join(episodeDir, "shared", "characters.json"),
      JSON.stringify({ episodeId: "episode-1", characters: [], updatedAt: new Date().toISOString() })
    );
    const scenePlan = makeScenePlan(2);
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, "stale.png"), Buffer.from("stale"));
    for (const scene of scenePlan.scenes) {
      await sharp({
        create: {
          width: 1920,
          height: 1080,
          channels: 4,
          background: { r: 20, g: 40, b: 60, alpha: 1 },
        },
      })
        .png()
        .toFile(path.join(landscapeDir, scene.expectedImageFilenames[0] ?? `${scene.id}.png`));
    }
    await prepareShortsImageAssets(
      episodeDir,
      "episode-1",
      scenePlan,
      createSettings(),
      {
        enabled: true,
        keySceneCount: 1,
        portraitWidth: 1088,
        portraitHeight: 1920,
        finalWidth: 1080,
        finalHeight: 1920,
        reuseLandscapeImages: true,
        enablePanAndScan: true,
        enableBlurredFallback: true,
        forceRegenerateAll: false,
        selectionMode: "first-n",
      },
      {
        landscapeDir,
        outputDir,
        generator: createGenerator(),
      }
    );
    expect(await fs.readdir(outputDir)).not.toContain("stale.png");
    await fs.rm(tempDir, { recursive: true, force: true });
  }, 15_000);

  it("reuses an existing shared Shorts image instead of regenerating it", async () => {
    const tempDir = await fs.mkdtemp(path.join(process.cwd(), ".tmp-shorts-reuse-"));
    const episodeDir = path.join(tempDir, "episode");
    const outputDir = path.join(tempDir, "shared", "short", "images", "generated");
    await fs.mkdir(episodeDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(path.join(episodeDir, "shared"), { recursive: true });
    await fs.writeFile(
      path.join(episodeDir, "shared", "characters.json"),
      JSON.stringify({ episodeId: "episode-1", characters: [], updatedAt: new Date().toISOString() })
    );
    const scenePlan = makeScenePlan(1);
    const config: ShortsImageConfig = {
      enabled: true,
      keySceneCount: 1,
      portraitWidth: 1088,
      portraitHeight: 1920,
      finalWidth: 1080,
      finalHeight: 1920,
      reuseLandscapeImages: true,
      enablePanAndScan: true,
      enableBlurredFallback: true,
      forceRegenerateAll: true,
      selectionMode: "first-n",
    };
    const existingPath = buildShortsImageStrategyPlan(scenePlan, config, {
      outputDir,
    })[0]?.outputPortraitPath;
    if (!existingPath) {
      throw new Error("missing expected portrait path");
    }
    await sharp({
      create: {
        width: 1080,
        height: 1920,
        channels: 4,
        background: { r: 80, g: 40, b: 20, alpha: 1 },
      },
    })
      .png()
      .toFile(existingPath);
    const generator = {
      async generate() {
        throw new Error("generator should not be called for existing images");
      },
    } satisfies ImageGenerator;

    const result = await prepareShortsImageAssets(
      episodeDir,
      "episode-1",
      scenePlan,
      createSettings(),
      config,
      {
        outputDir,
        generator,
      }
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.reusedExistingImage).toBe(true);
    expect(result.entries[0]?.regenerated).toBe(false);
    expect(result.entries[0]?.outputImagePath).toBe(existingPath);
    await fs.rm(tempDir, { recursive: true, force: true });
  }, 15_000);
});
