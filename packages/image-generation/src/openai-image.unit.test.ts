import { mkdtempSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { scenePlanSchema } from "@mediaforge/domain";
import { generateOpenAiSceneImages, loadOpenAiImageGenerationSettings } from "./openai-image.js";

describe("OpenAI image generation settings", () => {
  it("uses curl-compatible defaults and preserves configured concurrency", () => {
    const settings = loadOpenAiImageGenerationSettings({
      OPENAI_API_KEY: "test-key",
      OPENAI_IMAGE_MODEL: "gpt-image-1-mini",
      OPENAI_IMAGE_SIZE: "1024x1024",
      OPENAI_IMAGE_QUALITY: "low"
    });
    expect(settings.model).toBe("gpt-image-1-mini");
    expect(settings.quality).toBe("low");
    expect(settings.requestedSize).toBe("1024x1024");
    expect(settings.apiSize).toBe("1024x1024");
  });

  it("uses configured concurrency for gpt-image-2 sizes divisible by 16", () => {
    const settings = loadOpenAiImageGenerationSettings({
      OPENAI_API_KEY: "test-key",
      OPENAI_IMAGE_MODEL: "gpt-image-2",
      OPENAI_IMAGE_SIZE: "1920x1088",
      OPENAI_IMAGE_CONCURRENCY: "4"
    });
    expect(settings.concurrency).toBe(4);
    expect(settings.requestedSize).toBe("1920x1088");
    expect(settings.apiSize).toBe("1920x1088");
  });

  it("rejects unsupported sizes for non-gpt-image-2 models", () => {
    expect(() =>
      loadOpenAiImageGenerationSettings({
        OPENAI_API_KEY: "test-key",
        OPENAI_IMAGE_MODEL: "gpt-image-1-mini",
        OPENAI_IMAGE_SIZE: "1920x1080"
      })
    ).toThrowError(/not supported by gpt-image-1-mini/i);
  });
});

describe("OpenAI image generation", () => {
  it("omits output_format from the default png request body", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-openai-images-request-"));
    const episodeDir = path.join(tempDir, "episode");
    await fs.mkdir(episodeDir, { recursive: true });
    const seenBodies: Array<Record<string, unknown>> = [];
    const png = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: "#00ff00"
      }
    })
      .png()
      .toBuffer();
    const client = {
      images: {
        async generate(body: Record<string, unknown>) {
          seenBodies.push(body);
          return { data: [{ b64_json: png.toString("base64") }] };
        }
      }
    };
    const plan = scenePlanSchema.parse({
      sourceId: "episode-fixture",
      scenes: [
        {
          id: "scene-001",
          sequenceNumber: 1,
          canonicalNarration: "First scene.",
          sourceSegmentIds: ["scene-001"],
          estimatedDurationSeconds: 4,
          timing: { startSeconds: 0, endSeconds: 4 },
          visualPurpose: "introduce",
          subject: "mouse",
          action: "eating",
          setting: "habitat",
          composition: "centered",
          cameraFraming: "medium shot",
          mood: "calm",
          continuityReferences: [],
          onScreenText: "",
          negativeConstraints: ["no text"],
          aspectRatios: ["16:9"],
          imagePrompt: "mouse eating in a habitat",
          expectedImageFilenames: ["scene-001__000000-000004__16x9.png"],
          qualityStatus: "draft"
        }
      ]
    });
    const settings = loadOpenAiImageGenerationSettings({
      OPENAI_API_KEY: "test-key",
      OPENAI_IMAGE_MODEL: "gpt-image-1-mini",
      OPENAI_IMAGE_SIZE: "1024x1024",
      OPENAI_IMAGE_QUALITY: "low",
      OPENAI_IMAGE_CONCURRENCY: "1",
      OPENAI_IMAGE_MAX_RETRIES: "0",
      OPENAI_IMAGE_TIMEOUT_MS: "1000"
    });

    await generateOpenAiSceneImages(
      [
        {
          scene: plan.scenes[0]!,
          prompt: plan.scenes[0]!.imagePrompt,
          episodeSlug: "episode-fixture",
          episodeDir,
          normalizedFilename: plan.scenes[0]!.expectedImageFilenames[0]!
        }
      ],
      settings,
      { client }
    );

    expect(seenBodies).toHaveLength(1);
    expect(seenBodies[0]).not.toHaveProperty("output_format");
  });

  it("stores both the raw API image and the normalized image while running jobs in parallel", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-openai-images-"));
    const episodeDir = path.join(tempDir, "episode");
    await fs.mkdir(episodeDir, { recursive: true });
    const png = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: "#ff0000"
      }
    })
      .png()
      .toBuffer();
    const b64 = png.toString("base64");
    let active = 0;
    let peak = 0;
    const client = {
      images: {
        async generate() {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 50));
          active -= 1;
          return { data: [{ b64_json: b64 }] };
        }
      }
    };
    const plan = scenePlanSchema.parse({
      sourceId: "episode-fixture",
      scenes: [
        {
          id: "scene-001",
          sequenceNumber: 1,
          canonicalNarration: "First scene.",
          sourceSegmentIds: ["scene-001"],
          estimatedDurationSeconds: 4,
          timing: { startSeconds: 0, endSeconds: 4 },
          visualPurpose: "introduce",
          subject: "mouse",
          action: "eating",
          setting: "habitat",
          composition: "centered",
          cameraFraming: "medium shot",
          mood: "calm",
          continuityReferences: [],
          onScreenText: "",
          negativeConstraints: ["no text"],
          aspectRatios: ["16:9"],
          imagePrompt: "mouse eating in a habitat",
          expectedImageFilenames: ["scene-001__000000-000004__16x9.png"],
          qualityStatus: "draft"
        },
        {
          id: "scene-002",
          sequenceNumber: 2,
          canonicalNarration: "Second scene.",
          sourceSegmentIds: ["scene-002"],
          estimatedDurationSeconds: 4,
          timing: { startSeconds: 4, endSeconds: 8 },
          visualPurpose: "continue",
          subject: "mouse",
          action: "drinking",
          setting: "habitat",
          composition: "centered",
          cameraFraming: "medium shot",
          mood: "calm",
          continuityReferences: [],
          onScreenText: "",
          negativeConstraints: ["no text"],
          aspectRatios: ["16:9"],
          imagePrompt: "mouse drinking in a habitat",
          expectedImageFilenames: ["scene-002__000004-000008__16x9.png"],
          qualityStatus: "draft"
        }
      ]
    });
    const settings = loadOpenAiImageGenerationSettings({
      OPENAI_API_KEY: "test-key",
      OPENAI_IMAGE_MODEL: "gpt-image-1-mini",
      OPENAI_IMAGE_SIZE: "1024x1024",
      OPENAI_IMAGE_QUALITY: "low",
      OPENAI_IMAGE_CONCURRENCY: "2",
      OPENAI_IMAGE_MAX_RETRIES: "0",
      OPENAI_IMAGE_TIMEOUT_MS: "1000"
    });
    const results = await generateOpenAiSceneImages(
      plan.scenes.map((scene) => ({
        scene,
        prompt: scene.imagePrompt,
        episodeSlug: "episode-fixture",
        episodeDir,
        normalizedFilename: scene.expectedImageFilenames[0]!
      })),
      settings,
      { client }
    );
    expect(peak).toBeGreaterThan(1);
    expect(results).toHaveLength(2);
    for (const result of results) {
      await expect(fs.access(result.sourcePath)).resolves.toBeUndefined();
      await expect(fs.access(result.rawPath)).resolves.toBeUndefined();
      await expect(fs.access(result.renderedPath ?? "")).resolves.toBeUndefined();
      await expect(fs.access(result.promptPath)).resolves.toBeUndefined();
      expect(result.rawPath).not.toBe(result.renderedPath);
      const rawMeta = await sharp(result.rawPath).metadata();
      const normalizedMeta = await sharp(result.renderedPath ?? "").metadata();
      expect(rawMeta.width).toBe(8);
      expect(rawMeta.height).toBe(8);
      expect(normalizedMeta.width).toBe(1024);
      expect(normalizedMeta.height).toBe(1024);
    }
  }, 20000);

  it("includes the full JSON payload when the OpenAI API returns an error", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-openai-images-error-"));
    const episodeDir = path.join(tempDir, "episode");
    await fs.mkdir(episodeDir, { recursive: true });
    const plan = scenePlanSchema.parse({
      sourceId: "episode-fixture",
      scenes: [
        {
          id: "scene-001",
          sequenceNumber: 1,
          canonicalNarration: "First scene.",
          sourceSegmentIds: ["scene-001"],
          estimatedDurationSeconds: 4,
          timing: { startSeconds: 0, endSeconds: 4 },
          visualPurpose: "introduce",
          subject: "mouse",
          action: "eating",
          setting: "habitat",
          composition: "centered",
          cameraFraming: "medium shot",
          mood: "calm",
          continuityReferences: [],
          onScreenText: "",
          negativeConstraints: ["no text"],
          aspectRatios: ["16:9"],
          imagePrompt: "mouse eating in a habitat",
          expectedImageFilenames: ["scene-001__000000-000004__16x9.png"],
          qualityStatus: "draft"
        }
      ]
    });
    const settings = loadOpenAiImageGenerationSettings({
      OPENAI_API_KEY: "test-key",
      OPENAI_IMAGE_CONCURRENCY: "1",
      OPENAI_IMAGE_MAX_RETRIES: "0",
      OPENAI_IMAGE_TIMEOUT_MS: "1000"
    });
    const client = {
      images: {
        async generate() {
          throw {
            message: "Request failed",
            status: 429,
            code: "hard_limit",
            type: "rate_limit_error",
            param: null,
            requestID: "req_test_123",
            error: {
              message: "You have hit the hard limit for image generation.",
              type: "rate_limit_error",
              code: "hard_limit",
              param: null
            }
          };
        }
      }
    };

    const generation = generateOpenAiSceneImages(
      [
        {
          scene: plan.scenes[0]!,
          prompt: plan.scenes[0]!.imagePrompt,
          episodeSlug: "episode-fixture",
          episodeDir,
          normalizedFilename: plan.scenes[0]!.expectedImageFilenames[0]!
        }
      ],
      settings,
      { client }
    );
    await expect(generation).rejects.toThrowError(/hard_limit/);
    await expect(generation).rejects.toThrowError(/hard limit/i);
  });
});
