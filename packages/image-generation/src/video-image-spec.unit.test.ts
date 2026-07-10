import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  assertGeneratedImageFileMatchesSpec,
  resolveImageGenerationSizeSpec,
  resolveMediaProfileSpec,
  assertVideoImageFileMatchesSpec,
  resolveVideoImageSpec,
} from "./video-image-spec.js";

async function writePng(
  filePath: string,
  width: number,
  height: number
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#445566",
    },
  })
    .png()
    .toFile(filePath);
}

describe("video image spec", () => {
  it("resolves canonical full and short generation and render specs from one typed source", () => {
    expect(resolveMediaProfileSpec("full")).toMatchObject({
      videoKind: "full",
      aspectRatio: "16:9",
      imageGenerationSize: {
        width: 1536,
        height: 864,
        size: "1536x864",
      },
      renderSize: {
        width: 1920,
        height: 1080,
        size: "1920x1080",
      },
    });
    expect(resolveMediaProfileSpec("short")).toMatchObject({
      videoKind: "short",
      aspectRatio: "9:16",
      imageGenerationSize: {
        width: 864,
        height: 1536,
        size: "864x1536",
      },
      renderSize: {
        width: 1080,
        height: 1920,
        size: "1080x1920",
      },
    });
    expect(resolveVideoImageSpec("full")).toEqual({
      videoKind: "full",
      width: 1920,
      height: 1080,
      aspectRatio: "16:9",
    });
    expect(resolveVideoImageSpec("short")).toEqual({
      videoKind: "short",
      width: 1080,
      height: 1920,
      aspectRatio: "9:16",
    });
  });

  it("rejects a render-sized file for full image-generation assets", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "video-image-spec-full-"));
    const filePath = path.join(root, "scene.png");
    await writePng(filePath, 1920, 1080);

    await expect(
      assertGeneratedImageFileMatchesSpec({
        episodeId: "025-the-endless-backrooms",
        language: "en",
        videoKind: "full",
        imagePath: filePath,
      })
    ).rejects.toThrow(/actual=1920x1080 expected=1536x864/);
  });

  it("rejects a render-sized file for short image-generation assets", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "video-image-spec-short-"));
    const filePath = path.join(root, "scene.png");
    await writePng(filePath, 1080, 1920);

    await expect(
      assertGeneratedImageFileMatchesSpec({
        episodeId: "025-the-endless-backrooms",
        language: "en",
        videoKind: "short",
        imagePath: filePath,
      })
    ).rejects.toThrow(/actual=1080x1920 expected=864x1536/);
  });

  it("still allows 1920x1080 as the final full render size", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "video-image-render-full-"));
    const filePath = path.join(root, "render.png");
    await writePng(filePath, 1920, 1080);

    await expect(
      assertVideoImageFileMatchesSpec({
        episodeId: "025-the-endless-backrooms",
        language: "en",
        videoKind: "full",
        imagePath: filePath,
      })
    ).resolves.toMatchObject({
      width: 1920,
      height: 1080,
    });
  });

  it("would catch the episode 025 full-image regression before manifest acceptance", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "video-image-episode-025-"));
    const filePath = path.join(root, "scene-025.png");
    const expected = resolveImageGenerationSizeSpec("full");
    await writePng(filePath, expected.width + 384, expected.height + 216);

    await expect(
      assertGeneratedImageFileMatchesSpec({
        episodeId: "025-the-endless-backrooms",
        language: "en",
        videoKind: "full",
        imagePath: filePath,
      })
    ).rejects.toThrow(/episode=025-the-endless-backrooms/);
  });
});
