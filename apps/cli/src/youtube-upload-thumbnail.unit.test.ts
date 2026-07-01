import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

let workspaceRoot = "";
const thumbnailMocks = vi.hoisted(() => ({
  generateStoryThumbnail: vi.fn(),
  readThumbnailStoryFile: vi.fn(),
}));

vi.mock("@mediaforge/image-generation", () => ({
  generateStoryThumbnail: thumbnailMocks.generateStoryThumbnail,
  readThumbnailStoryFile: thumbnailMocks.readThumbnailStoryFile,
}));

const { resolveUploadThumbnailPath } = await import(
  "./youtube-upload-thumbnail.js"
);

describe("resolveUploadThumbnailPath", () => {
  beforeEach(() => {
    workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "mediaforge-upload-thumb-"));
    thumbnailMocks.generateStoryThumbnail.mockReset();
    thumbnailMocks.readThumbnailStoryFile.mockReset();
    thumbnailMocks.readThumbnailStoryFile.mockResolvedValue({
      storyTitle: "Hachishakusama",
      storySummary: "A woman hears her name called before the threat closes in.",
      protagonistDescription: "an adult woman frozen in fear",
      threatDescription: "a towering supernatural woman in the distance",
      settingDescription: "a narrow village road at night",
      emphasisWord: "CALLED",
      referenceImagePath: "episodes/ref.png",
    });
  });

  it("returns the CLI override unchanged when one is provided", async () => {
    await expect(
      resolveUploadThumbnailPath({
        workspaceRoot,
        episodeDir: path.join(workspaceRoot, "episode-fixture"),
        resolvedUpload: {
          metadata: {
            thumbnail: {
              recommendedText: "SHE CALLED HER NAME",
            },
          },
        } as never,
        overrideThumbnailPath: "custom-thumb.png",
      })
    ).resolves.toBe("custom-thumb.png");
    expect(thumbnailMocks.readThumbnailStoryFile).not.toHaveBeenCalled();
    expect(thumbnailMocks.generateStoryThumbnail).not.toHaveBeenCalled();
  });

  it("generates a short thumbnail using resolved upload metadata and variant", async () => {
    const episodeDir = path.join(workspaceRoot, "episode-fixture");
    thumbnailMocks.generateStoryThumbnail.mockResolvedValue({
      outputPath: path.join(
        workspaceRoot,
        "episode-fixture",
        "thumbnails",
        "short",
        "en.png"
      ),
    });
    const outputPath = await resolveUploadThumbnailPath({
      workspaceRoot,
      episodeDir,
      resolvedUpload: {
        metadata: {
          thumbnail: {
            recommendedText: "SHE CALLED HER NAME",
          },
        },
        resolvedLanguage: "en",
        resolvedVariant: "short",
      } as never,
      force: true,
    });

    expect(outputPath).toContain(path.join("thumbnails", "short", "en.png"));
    expect(thumbnailMocks.readThumbnailStoryFile).toHaveBeenCalledWith({
      workspaceRoot,
      storyFilePath: path.join(
        episodeDir,
        "story-production",
        "thumbnail-story.json"
      ),
    });
    expect(thumbnailMocks.generateStoryThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRoot,
        episodeSlug: "episode-fixture",
        locale: "en",
        format: "short",
        style: "cinematic-horror",
        hookText: "SHE CALLED HER NAME",
        force: true,
      })
    );
  });
});
