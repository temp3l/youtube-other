import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import {
  THUMBNAIL_DIMENSIONS,
  buildOpenAiThumbnailRequestBody,
  compileStoryThumbnailPrompt,
  compositeStoryThumbnailText,
  generateStoryThumbnail,
  loadOpenAiThumbnailGenerationSettings,
  readThumbnailStoryFile,
  selectThumbnailEmphasisWord,
  ThumbnailArtifactConflictError,
  ThumbnailDimensionMismatchError,
  ThumbnailResponseError,
} from "./story-thumbnail.js";

function makeInput(workspaceRoot: string) {
  return {
    workspaceRoot,
    episodeSlug: "014-hachishakusama-the-eight-foot-woman",
    locale: "de-DE",
    format: "full" as const,
    hookText: "Sie rief ihren Namen",
    title: "Hachishakusama",
    summary: "A woman hears her name called before the threat closes in.",
    protagonistDescription: "an adult woman frozen in fear",
    threatDescription: "a towering supernatural woman in the distance",
    settingDescription: "a narrow village road at night",
  };
}

async function createPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#101820",
    },
  })
    .png()
    .toBuffer();
}

describe("story thumbnail prompt compiler", () => {
  it("is deterministic and differentiates full and short composition", () => {
    const settings = loadOpenAiThumbnailGenerationSettings({
      OPENAI_API_KEY: "test-key",
    });
    const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "thumb-prompt-"));
    const fullInput = makeInput(workspaceRoot);
    const shortInput = { ...fullInput, format: "short" as const };
    const first = compileStoryThumbnailPrompt(fullInput, settings);
    const second = compileStoryThumbnailPrompt(fullInput, settings);
    const shortPrompt = compileStoryThumbnailPrompt(shortInput, settings);

    expect(first).toEqual(second);
    expect(first.promptText).toContain("left text-safe area");
    expect(shortPrompt.promptText).toContain("upper-left stacked text-safe area");
    expect(first.normalizedHookText).toContain("SIE RIEF IHREN NAMEN");
  });

  it("changes source fingerprint on relevant input and ignores object key ordering", () => {
    const settings = loadOpenAiThumbnailGenerationSettings({
      OPENAI_API_KEY: "test-key",
    });
    const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "thumb-fingerprint-"));
    const input = makeInput(workspaceRoot);
    const first = compileStoryThumbnailPrompt(input, settings);
    const reordered = compileStoryThumbnailPrompt(
      {
        workspaceRoot,
        locale: "de-DE",
        episodeSlug: "014-hachishakusama-the-eight-foot-woman",
        format: "full",
        hookText: "Sie rief ihren Namen",
        summary: "A woman hears her name called before the threat closes in.",
        title: "Hachishakusama",
        threatDescription: "a towering supernatural woman in the distance",
        protagonistDescription: "an adult woman frozen in fear",
        settingDescription: "a narrow village road at night",
      },
      settings
    );
    const changed = compileStoryThumbnailPrompt(
      { ...input, hookText: "Sie kam fuer mich" },
      settings
    );

    expect(first.sourceFingerprint).toBe(reordered.sourceFingerprint);
    expect(first.sourceFingerprint).not.toBe(changed.sourceFingerprint);
  });

  it("selects a deterministic emphasis word", () => {
    expect(selectThumbnailEmphasisWord("She called her name", "en")).toBe("CALLED");
    expect(selectThumbnailEmphasisWord("Sie rief ihren Namen", "de-DE")).toBe("RIEF");
  });
});

describe("story thumbnail adapter and compositor", () => {
  it("sends configured model, exact dimensions, quality, output format, and one image", () => {
    const settings = loadOpenAiThumbnailGenerationSettings({
      OPENAI_API_KEY: "test-key",
      OPENAI_THUMBNAIL_MODEL: "gpt-image-2",
      OPENAI_THUMBNAIL_QUALITY: "high",
    });
    const body = buildOpenAiThumbnailRequestBody({
      input: makeInput("/tmp/workspace"),
      settings,
      promptText: "Prompt",
    });
    expect(body).toEqual({
      model: "gpt-image-2",
      prompt: "Prompt",
      size: "1536x864",
      quality: "high",
      output_format: "png",
      background: "opaque",
      n: 1,
    });
  });

  it("renders exact text onto a full-size thumbnail and preserves dimensions", async () => {
    const imageBuffer = await createPng(1536, 864);
    const output = await compositeStoryThumbnailText({
      input: {
        format: "full",
        locale: "de-DE",
        hookText: "Sie rief ihren Namen",
        emphasisWord: "RIEF",
      },
      imageBuffer,
    });
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toBe(1536);
    expect(metadata.height).toBe(864);
  });

  it("rejects invalid payloads and exact dimension mismatches", async () => {
    const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "thumb-invalid-"));
    const settings = loadOpenAiThumbnailGenerationSettings({
      OPENAI_API_KEY: "test-key",
      OPENAI_THUMBNAIL_MAX_RETRIES: "0",
    });
    await expect(
      generateStoryThumbnail(makeInput(workspaceRoot), {
        settings,
        client: {
          images: {
            generate: async () => ({
              data: [{ b64_json: "not-base64" }],
            }),
          },
        },
      })
    ).rejects.toBeInstanceOf(ThumbnailResponseError);

    const wrongImage = await createPng(1024, 1024);
    await expect(
      generateStoryThumbnail(makeInput(workspaceRoot), {
        settings,
        client: {
          images: {
            generate: async () => ({
              data: [{ b64_json: wrongImage.toString("base64") }],
            }),
          },
        },
      })
    ).rejects.toBeInstanceOf(ThumbnailDimensionMismatchError);
  });

  it("retries transient failures and stops on permanent ones", async () => {
    const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "thumb-retry-"));
    const settings = loadOpenAiThumbnailGenerationSettings({
      OPENAI_API_KEY: "test-key",
      OPENAI_THUMBNAIL_MAX_RETRIES: "1",
    });
    const goodImage = await createPng(1536, 864);
    const transientClient = {
      images: {
        generate: vi
          .fn()
          .mockRejectedValueOnce({ status: 429, message: "rate limited" })
          .mockResolvedValueOnce({
            data: [{ b64_json: goodImage.toString("base64") }],
            request_id: "req_123",
          }),
      },
    };
    const transient = await generateStoryThumbnail(makeInput(workspaceRoot), {
      settings,
      client: transientClient,
    });
    expect(transient.generated).toBe(true);
    expect(transientClient.images.generate).toHaveBeenCalledTimes(2);

    const permanentClient = {
      images: {
        generate: vi.fn().mockRejectedValue({ status: 401, message: "bad key" }),
      },
    };
    await expect(
      generateStoryThumbnail(
        { ...makeInput(workspaceRoot), format: "short" },
        { settings, client: permanentClient }
      )
    ).rejects.toThrow(/bad key/i);
    expect(permanentClient.images.generate).toHaveBeenCalledTimes(1);
  });
});

describe("story thumbnail persistence and story input", () => {
  it("reads the story file schema and writes a manifest, then reuses matching artifacts", async () => {
    const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "thumb-persist-"));
    const storyPath = path.join(workspaceRoot, "story.json");
    await fs.writeFile(
      storyPath,
      JSON.stringify({
        title: "Hachishakusama",
        summary: "A woman hears her name called before the threat closes in.",
        protagonist: "an adult woman frozen in fear",
        threat: "a towering supernatural woman in the distance",
        setting: "a narrow village road at night",
      })
    );
    const story = await readThumbnailStoryFile({
      workspaceRoot,
      storyFilePath: storyPath,
    });
    expect(story.protagonistDescription).toBe("an adult woman frozen in fear");

    const imageBuffer = await createPng(1536, 864);
    const settings = loadOpenAiThumbnailGenerationSettings({
      OPENAI_API_KEY: "test-key",
      OPENAI_THUMBNAIL_MAX_RETRIES: "0",
    });
    const input = makeInput(workspaceRoot);
    const first = await generateStoryThumbnail(input, {
      settings,
      client: {
        images: {
          generate: async () => ({
            data: [{ b64_json: imageBuffer.toString("base64") }],
            request_id: "req_456",
          }),
        },
      },
    });
    expect(first.generated).toBe(true);
    expect(first.reused).toBe(false);
    expect(await fs.stat(first.outputPath)).toBeTruthy();
    expect(await fs.stat(first.manifestPath)).toBeTruthy();

    const second = await generateStoryThumbnail(input, {
      settings,
      client: {
        images: {
          generate: vi.fn(async () => ({
            data: [{ b64_json: imageBuffer.toString("base64") }],
          })),
        },
      },
    });
    expect(second.reused).toBe(true);
    expect(second.generated).toBe(false);
  });

  it("throws a conflict when an existing artifact differs without force", async () => {
    const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "thumb-conflict-"));
    const settings = loadOpenAiThumbnailGenerationSettings({
      OPENAI_API_KEY: "test-key",
      OPENAI_THUMBNAIL_MAX_RETRIES: "0",
    });
    const imageBuffer = await createPng(THUMBNAIL_DIMENSIONS.full.width, THUMBNAIL_DIMENSIONS.full.height);
    await generateStoryThumbnail(makeInput(workspaceRoot), {
      settings,
      client: {
        images: {
          generate: async () => ({
            data: [{ b64_json: imageBuffer.toString("base64") }],
          }),
        },
      },
    });
    await expect(
      generateStoryThumbnail(
        { ...makeInput(workspaceRoot), hookText: "Sie kam zurueck" },
        { settings }
      )
    ).rejects.toBeInstanceOf(ThumbnailArtifactConflictError);
  });
});
