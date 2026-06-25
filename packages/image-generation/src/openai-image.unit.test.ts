import { mkdtempSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { scenePlanSchema } from "@mediaforge/domain";
import {
  buildOpenAiImageRequestBody,
  generateOpenAiSceneImages,
  loadOpenAiImageGenerationSettings,
  redactApiKey,
} from "./openai-image.js";

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

  it("maps larger gpt-image-2 landscape sizes to a supported request size and preserves concurrency", () => {
    const settings = loadOpenAiImageGenerationSettings({
      OPENAI_API_KEY: "test-key",
      OPENAI_IMAGE_MODEL: "gpt-image-2",
      OPENAI_IMAGE_SIZE: "1920x1088",
      OPENAI_IMAGE_CONCURRENCY: "4"
    });
    expect(settings.concurrency).toBe(4);
    expect(settings.requestedSize).toBe("1920x1088");
    expect(settings.apiSize).toBe("1536x1024");
  });

  it("accepts a lower 16:9 output size and maps it to a supported API size", () => {
    const settings = loadOpenAiImageGenerationSettings({
      OPENAI_API_KEY: "test-key",
      OPENAI_IMAGE_MODEL: "gpt-image-1-mini",
      OPENAI_IMAGE_SIZE: "1280x720",
      OPENAI_IMAGE_CONCURRENCY: "2"
    });

    expect(settings.requestedSize).toBe("1280x720");
    expect(settings.apiSize).toBe("1536x1024");
  });

  it("prefers OPENAI_ORGANIZATION but still accepts the legacy org id variable", () => {
    const settings = loadOpenAiImageGenerationSettings({
      OPENAI_API_KEY: "test-key",
      OPENAI_ORGANIZATION: "org-new",
      OPENAI_ORG_ID: "org-legacy"
    });

    expect(settings.organization).toBe("org-new");
  });

  it("rejects malformed image sizes", () => {
    expect(() =>
      loadOpenAiImageGenerationSettings({
        OPENAI_API_KEY: "test-key",
        OPENAI_IMAGE_MODEL: "gpt-image-1-mini",
        OPENAI_IMAGE_SIZE: "not-a-size"
      })
    ).toThrowError(/Invalid OPENAI_IMAGE_SIZE value/i);
  });

  it("redacts API keys and keeps the request body curl-compatible", () => {
    const settings = loadOpenAiImageGenerationSettings({
      OPENAI_API_KEY: "sk-test-1234567890",
      OPENAI_IMAGE_MODEL: "gpt-image-2",
      OPENAI_IMAGE_SIZE: "1920x1088",
      OPENAI_IMAGE_QUALITY: "medium"
    });
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
    const body = buildOpenAiImageRequestBody(
      {
        scene: plan.scenes[0]!,
        prompt: "mouse eating in a habitat",
        episodeSlug: "episode-fixture",
        episodeDir: "/tmp/episode-fixture",
        normalizedFilename: "scene-001__000000-000004__16x9.png"
      },
      settings
    );
    expect(body).toEqual({
      model: "gpt-image-2",
      prompt: "mouse eating in a habitat",
      size: "1536x1024",
      quality: "medium",
      n: 1
    });
    expect(redactApiKey(settings.apiKey)).toBe("sk-t…7890");
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

  it("generates each scene independently even when prompts are similar", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-openai-images-reuse-"));
    const episodeDir = path.join(tempDir, "episode");
    await fs.mkdir(episodeDir, { recursive: true });
    const png = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: "#0000ff"
      }
    })
      .png()
      .toBuffer();
    let calls = 0;
    const client = {
      images: {
        async generate() {
          calls += 1;
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
          canonicalNarration: "A mouse studies the same memory map.",
          sourceSegmentIds: ["scene-001"],
          estimatedDurationSeconds: 4,
          timing: { startSeconds: 0, endSeconds: 4 },
          visualPurpose: "introduce",
          subject: "mouse studying a memory map",
          action: "looking closely at the same diagram",
          setting: "paper collage workspace",
          composition: "centered",
          cameraFraming: "medium shot",
          mood: "calm",
          continuityReferences: [],
          onScreenText: "",
          negativeConstraints: ["no text"],
          aspectRatios: ["16:9"],
          imagePrompt: "mouse studying a memory map in a paper collage workspace",
          expectedImageFilenames: ["scene-001__000000-000004__16x9.png"],
          qualityStatus: "draft"
        },
        {
          id: "scene-002",
          sequenceNumber: 2,
          canonicalNarration: "The mouse studies the same memory map again.",
          sourceSegmentIds: ["scene-002"],
          estimatedDurationSeconds: 4,
          timing: { startSeconds: 4, endSeconds: 8 },
          visualPurpose: "continue",
          subject: "mouse studying a memory map",
          action: "looking closely at the same diagram",
          setting: "paper collage workspace",
          composition: "centered",
          cameraFraming: "medium shot",
          mood: "calm",
          continuityReferences: [],
          onScreenText: "",
          negativeConstraints: ["no text"],
          aspectRatios: ["16:9"],
          imagePrompt: "mouse studying a memory map in a paper collage workspace, same composition",
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

    expect(calls).toBe(2);
    expect(results).toHaveLength(2);
    expect(results[0]?.renderedPath).not.toBe(results[1]?.renderedPath);
  });

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
