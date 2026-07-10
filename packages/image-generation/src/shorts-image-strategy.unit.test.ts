import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { ScenePlan } from "@mediaforge/domain";
import { hashFile } from "@mediaforge/shared";
import {
  buildShortsImageStrategyPlan,
  prepareShortsImageAssets,
  type ShortsImageConfig,
} from "./shorts-image-strategy.js";
import type { EpisodeImagePipelineSettings, ImageGenerator } from "./episode-image-pipeline.js";

const shortPortraitWidth = 864;
const shortPortraitHeight = 1536;
const shortRenderWidth = 1080;
const shortRenderHeight = 1920;

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
          width: 1024,
          height: 1536,
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
        size: "1024x1536",
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
      portraitWidth: shortPortraitWidth,
      portraitHeight: shortPortraitHeight,
      finalWidth: shortRenderWidth,
      finalHeight: shortRenderHeight,
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

  it("documents current short-image classification for native regeneration, smart crop, and blurred fill", () => {
    const scenePlan = makeScenePlan(3);
    const baseConfig: ShortsImageConfig = {
      enabled: true,
      keySceneCount: 1,
      portraitWidth: shortPortraitWidth,
      portraitHeight: shortPortraitHeight,
      finalWidth: shortRenderWidth,
      finalHeight: shortRenderHeight,
      reuseLandscapeImages: true,
      enablePanAndScan: true,
      enableBlurredFallback: true,
      forceRegenerateAll: false,
      selectionMode: "first-n",
    };

    const panAndScanPlan = buildShortsImageStrategyPlan(scenePlan, baseConfig, {
      landscapeDir: "/tmp/landscape",
      outputDir: "/tmp/portrait",
    });
    expect(panAndScanPlan.map((entry) => entry.strategy)).toEqual([
      "regenerate",
      "smart-crop",
      "smart-crop",
    ]);
    expect(panAndScanPlan.map((entry) => entry.regenerateReason)).toEqual([
      "key_scene_1",
      undefined,
      undefined,
    ]);
    expect(panAndScanPlan.map((entry) => entry.motion?.mode)).toEqual([
      "none",
      "pan-and-scan",
      "pan-and-scan",
    ]);
    expect(panAndScanPlan[1]?.motion).toMatchObject({
      startZoom: 1.06,
      endZoom: 1.12,
    });

    const blurredFillPlan = buildShortsImageStrategyPlan(
      scenePlan,
      {
        ...baseConfig,
        keySceneCount: 0,
        enablePanAndScan: false,
        enableBlurredFallback: true,
      },
      {
        landscapeDir: "/tmp/landscape",
        outputDir: "/tmp/portrait",
      }
    );
    expect(blurredFillPlan.map((entry) => entry.strategy)).toEqual([
      "blurred-fill",
      "blurred-fill",
      "blurred-fill",
    ]);
    expect(blurredFillPlan.every((entry) => entry.motion?.mode === "none")).toBe(
      true
    );
  });

  it("plans one portrait image output per scene with motion as metadata only", () => {
    const scenePlan = makeScenePlan(3);
    const config: ShortsImageConfig = {
      enabled: true,
      keySceneCount: 1,
      portraitWidth: shortPortraitWidth,
      portraitHeight: shortPortraitHeight,
      finalWidth: shortRenderWidth,
      finalHeight: shortRenderHeight,
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

    expect(plan).toHaveLength(scenePlan.scenes.length);
    expect(plan.map((entry) => entry.sceneId)).toEqual([
      "scene-001",
      "scene-002",
      "scene-003",
    ]);
    expect(plan.map((entry) => path.basename(entry.outputPortraitPath))).toEqual([
      "scene-001__000000-000008__9x16.png",
      "scene-002__000008-000016__9x16.png",
      "scene-003__000016-000024__9x16.png",
    ]);
    expect(plan.map((entry) => entry.motion?.mode)).toEqual([
      "none",
      "pan-and-scan",
      "pan-and-scan",
    ]);
    expect(plan).not.toContainEqual(expect.objectContaining({ clipPath: expect.any(String) }));
  });

  it("uses importance-based selection with ratio-based coverage", () => {
    const scenePlan = makeScenePlan(10);
    const config: ShortsImageConfig = {
      enabled: true,
      keySceneCount: 3,
      keySceneRatio: 0.8,
      portraitWidth: shortPortraitWidth,
      portraitHeight: shortPortraitHeight,
      finalWidth: shortRenderWidth,
      finalHeight: shortRenderHeight,
      reuseLandscapeImages: true,
      enablePanAndScan: true,
      enableBlurredFallback: true,
      forceRegenerateAll: false,
      selectionMode: "importance-based",
    };
    const plan = buildShortsImageStrategyPlan(scenePlan, config, {
      outputDir: "/tmp/portrait",
    });
    expect(plan.filter((entry) => entry.strategy === "regenerate")).toHaveLength(8);
    expect(plan[0]?.strategy).toBe("regenerate");
    expect(plan[plan.length - 1]?.strategy).toBe("regenerate");
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
      portraitWidth: shortPortraitWidth,
      portraitHeight: shortPortraitHeight,
      finalWidth: shortRenderWidth,
      finalHeight: shortRenderHeight,
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
    expect(new Set(result.entries.map((entry) => entry.sceneId))).toEqual(
      new Set(scenePlan.scenes.map((scene) => scene.id))
    );
    expect(result.entries.map((entry) => entry.outputImagePath)).toHaveLength(scenePlan.scenes.length);
    expect(result.entries.slice(0, 5).every((entry) => entry.regenerated)).toBe(true);
    expect(result.entries[5]?.reusedExistingImage).toBe(true);
    const firstImage = await sharp(result.entries[0]!.outputImagePath).metadata();
    expect(firstImage.width).toBe(shortPortraitWidth);
    expect(firstImage.height).toBe(shortPortraitHeight);
    const tailImage = await sharp(result.entries[5]!.outputImagePath).metadata();
    expect(tailImage.width).toBe(shortPortraitWidth);
    expect(tailImage.height).toBe(shortPortraitHeight);
    const manifest = JSON.parse(await fs.readFile(result.manifestPath, "utf8")) as Array<Record<string, unknown>>;
    expect(manifest).toHaveLength(6);
    expect(manifest.map((entry) => entry["sceneId"])).toEqual(
      scenePlan.scenes.map((scene) => scene.id)
    );
    expect(result.entries[0]).toMatchObject({
      aspectRatio: "9:16",
      shortMediaRequirements: {
        aspectRatio: "9:16",
        safeVerticalComposition: true,
      },
    });
    expect(manifest[0]?.["imagePlanFingerprint"]).toMatch(/^[a-f0-9]{64}$/u);
    await fs.rm(tempDir, { recursive: true, force: true });
  }, 15_000);

  it("reuses landscape images with blurred fill when pan-and-scan is disabled", async () => {
    const tempDir = await fs.mkdtemp(path.join(process.cwd(), ".tmp-shorts-blurred-"));
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
    const scenePlan = makeScenePlan(1);
    const sourcePath = path.join(
      landscapeDir,
      scenePlan.scenes[0]?.expectedImageFilenames[0] ?? "scene-001.png"
    );
    await sharp({
      create: {
        width: 1920,
        height: 1080,
        channels: 4,
        background: { r: 40, g: 80, b: 120, alpha: 1 },
      },
    })
      .png()
      .toFile(sourcePath);
    const generator = {
      async generate() {
        throw new Error("generator should not run for blurred-fill reuse");
      },
    } satisfies ImageGenerator;

    const result = await prepareShortsImageAssets(
      episodeDir,
      "episode-1",
      scenePlan,
      createSettings(),
      {
        enabled: true,
        keySceneCount: 0,
        portraitWidth: shortPortraitWidth,
        portraitHeight: shortPortraitHeight,
        finalWidth: shortRenderWidth,
        finalHeight: shortRenderHeight,
        reuseLandscapeImages: true,
        enablePanAndScan: false,
        enableBlurredFallback: true,
        forceRegenerateAll: false,
        selectionMode: "first-n",
      },
      {
        landscapeDir,
        outputDir,
        generator,
      }
    );

    expect(result.entries[0]).toMatchObject({
      strategy: "blurred-fill",
      sourceImagePath: sourcePath,
      reusedExistingImage: true,
      regenerated: false,
      status: "success",
    });
    const image = await sharp(result.entries[0]!.outputImagePath).metadata();
    expect(image.width).toBe(shortPortraitWidth);
    expect(image.height).toBe(shortPortraitHeight);
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
        portraitWidth: shortPortraitWidth,
        portraitHeight: shortPortraitHeight,
        finalWidth: shortRenderWidth,
        finalHeight: shortRenderHeight,
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
        portraitWidth: shortPortraitWidth,
        portraitHeight: shortPortraitHeight,
        finalWidth: shortRenderWidth,
        finalHeight: shortRenderHeight,
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

  it("regenerates an existing shared Shorts image when the plan requires regeneration", async () => {
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
      portraitWidth: shortPortraitWidth,
      portraitHeight: shortPortraitHeight,
      finalWidth: shortRenderWidth,
      finalHeight: shortRenderHeight,
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
    const beforeHash = await hashFile(existingPath);
    const generator = {
      async generate(request) {
        await sharp({
          create: {
            width: 1024,
            height: 1536,
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
          size: "1024x1536",
          quality: "low",
          generationMode: "text-only",
          attempts: 1,
          durationMs: 1,
          providerRequestHash: request.providerRequest.providerRequestHash,
          promptHash: "prompt-hash",
          referenceHashes: [],
        };
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
    expect(result.entries[0]?.reusedExistingImage).toBe(false);
    expect(result.entries[0]?.regenerated).toBe(true);
    expect(result.entries[0]?.outputImagePath).toBe(existingPath);
    expect(await hashFile(existingPath)).not.toBe(beforeHash);
    await fs.rm(tempDir, { recursive: true, force: true });
  }, 15_000);

  it("reuses an existing shared Shorts image only when the cached fingerprint still matches", async () => {
    const tempDir = await fs.mkdtemp(path.join(process.cwd(), ".tmp-shorts-cache-"));
    const episodeDir = path.join(tempDir, "episode");
    const landscapeDir = path.join(tempDir, "landscape");
    const outputDir = path.join(tempDir, "shared", "short", "images", "generated");
    await fs.mkdir(episodeDir, { recursive: true });
    await fs.mkdir(landscapeDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(path.join(episodeDir, "shared"), { recursive: true });
    await fs.writeFile(
      path.join(episodeDir, "shared", "characters.json"),
      JSON.stringify({ episodeId: "episode-1", characters: [], updatedAt: new Date().toISOString() })
    );
    const scenePlan = makeScenePlan(1);
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
    const config: ShortsImageConfig = {
      enabled: true,
      keySceneCount: 0,
      portraitWidth: shortPortraitWidth,
      portraitHeight: shortPortraitHeight,
      finalWidth: shortRenderWidth,
      finalHeight: shortRenderHeight,
      reuseLandscapeImages: true,
      enablePanAndScan: true,
      enableBlurredFallback: true,
      forceRegenerateAll: false,
      selectionMode: "first-n",
    };
    const firstRun = await prepareShortsImageAssets(
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
    const reusedPath = firstRun.entries[0]?.outputImagePath;
    if (!reusedPath) {
      throw new Error("missing expected portrait path");
    }
    const reusedHash = await hashFile(reusedPath);
    const generator = {
      async generate() {
        throw new Error("generator should not run when cached portrait matches");
      },
    } satisfies ImageGenerator;

    const result = await prepareShortsImageAssets(
      episodeDir,
      "episode-1",
      scenePlan,
      createSettings(),
      config,
      {
        landscapeDir,
        outputDir,
        generator,
      }
    );

    expect(result.entries[0]?.reusedExistingImage).toBe(true);
    expect(result.entries[0]?.regenerated).toBe(false);
    expect(await hashFile(reusedPath)).toBe(reusedHash);
    await fs.rm(tempDir, { recursive: true, force: true });
  }, 15_000);

  it("reuses cached native-generated key scene portraits when the plan fingerprint is unchanged", async () => {
    const tempDir = await fs.mkdtemp(path.join(process.cwd(), ".tmp-shorts-key-cache-"));
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
      portraitWidth: shortPortraitWidth,
      portraitHeight: shortPortraitHeight,
      finalWidth: shortRenderWidth,
      finalHeight: shortRenderHeight,
      reuseLandscapeImages: true,
      enablePanAndScan: true,
      enableBlurredFallback: true,
      forceRegenerateAll: false,
      selectionMode: "first-n",
    };

    const firstRun = await prepareShortsImageAssets(
      episodeDir,
      "episode-1",
      scenePlan,
      createSettings(),
      config,
      {
        outputDir,
        generator: createGenerator(),
      }
    );
    const generatedPath = firstRun.entries[0]?.outputImagePath;
    if (!generatedPath) {
      throw new Error("missing expected portrait path");
    }
    const generatedHash = await hashFile(generatedPath);
    const generator = {
      async generate() {
        throw new Error("generator should not run when cached key-scene portrait matches");
      },
    } satisfies ImageGenerator;

    const secondRun = await prepareShortsImageAssets(
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

    expect(secondRun.entries[0]?.reusedExistingImage).toBe(true);
    expect(secondRun.entries[0]?.regenerated).toBe(false);
    expect(secondRun.entries[0]?.strategy).toBe("regenerate");
    expect(await hashFile(generatedPath)).toBe(generatedHash);
    await fs.rm(tempDir, { recursive: true, force: true });
  }, 15_000);

  it("executes short image generation with bounded concurrency from settings", async () => {
    const tempDir = await fs.mkdtemp(path.join(process.cwd(), ".tmp-shorts-concurrency-"));
    const episodeDir = path.join(tempDir, "episode");
    const outputDir = path.join(tempDir, "shared", "short", "images", "generated");
    await fs.mkdir(episodeDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(path.join(episodeDir, "shared"), { recursive: true });
    await fs.writeFile(
      path.join(episodeDir, "shared", "characters.json"),
      JSON.stringify({ episodeId: "episode-1", characters: [], updatedAt: new Date().toISOString() })
    );
    const scenePlan = makeScenePlan(3);
    const activeRequests: number[] = [];
    const observedConcurrency: number[] = [];
    const generator = {
      generate: vi.fn(async (request) => {
        activeRequests.push(1);
        observedConcurrency.push(activeRequests.length);
        await new Promise((resolve) => setTimeout(resolve, 40));
        await sharp({
          create: {
            width: 1024,
            height: 1536,
            channels: 4,
            background: { r: 22, g: 44, b: 66, alpha: 1 },
          },
        })
          .png()
          .toFile(request.providerRequest.outputPath);
        activeRequests.pop();
        return {
          outputPath: request.providerRequest.outputPath,
          outputSha256: await hashFile(request.providerRequest.outputPath),
          model: "stub",
          size: "1024x1536",
          quality: "low",
          generationMode: "text-only",
          attempts: 1,
          durationMs: 1,
          providerRequestHash: request.providerRequest.providerRequestHash,
          promptHash: "prompt-hash",
          referenceHashes: [],
        };
      }),
    } satisfies ImageGenerator;

    const result = await prepareShortsImageAssets(
      episodeDir,
      "episode-1",
      scenePlan,
      {
        ...createSettings(),
        concurrency: 2,
      },
      {
        enabled: true,
        keySceneCount: 3,
        portraitWidth: shortPortraitWidth,
        portraitHeight: shortPortraitHeight,
        finalWidth: shortRenderWidth,
        finalHeight: shortRenderHeight,
        reuseLandscapeImages: true,
        enablePanAndScan: true,
        enableBlurredFallback: true,
        forceRegenerateAll: false,
        selectionMode: "first-n",
      },
      {
        outputDir,
        generator,
      }
    );

    expect(result.entries).toHaveLength(3);
    expect(Math.max(...observedConcurrency)).toBe(2);
    expect(generator.generate).toHaveBeenCalledTimes(3);
    await fs.rm(tempDir, { recursive: true, force: true });
  }, 15_000);
});
