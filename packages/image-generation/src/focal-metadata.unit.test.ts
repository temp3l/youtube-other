import { mkdtempSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  episodeIdSchema,
  sourceImageFocalMetadataSchema,
} from "@mediaforge/domain";
import { createEpisodePathResolver } from "@mediaforge/shared";
import {
  buildConservativeFocalMetadata,
  buildSourceImageFocalMetadata,
  ensureEpisodeFocalMetadataForImages,
  loadEpisodeFocalMetadata,
  upsertEpisodeFocalMetadata,
} from "./focal-metadata.js";

async function writeFixtureImage(
  filePath: string,
  width: number,
  height: number,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#334455",
    },
  })
    .png()
    .toFile(filePath);
}

describe("focal metadata", () => {
  it("persists planner-provided focal metadata at the resolver-owned path", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-focal-metadata-"));
    const episodeId = "episode-fixture";
    const episodeDir = path.join(dir, episodeId);
    const imagePath = path.join(
      episodeDir,
      "shared",
      "images",
      "generated",
      "scene-001__000000-000004__16x9.png",
    );
    await writeFixtureImage(imagePath, 1600, 900);

    const entry = buildSourceImageFocalMetadata({
      sourceImageId: "source-image-scene-001",
      sourceImagePath: imagePath,
      sourceImageSha256: "a".repeat(64),
      imageWidth: 1600,
      imageHeight: 900,
      origin: "planner-provided",
      focalRegions: [
        {
          id: "scene-001-primary-region",
          kind: "primary-subject",
          bounds: { x: 0.2, y: 0.2, width: 0.4, height: 0.5 },
          confidence: 0.9,
          label: "planner-subject",
        },
      ],
      warnings: ["planner supplied a single focal region"],
    });

    await upsertEpisodeFocalMetadata({
      episodeDir,
      episodeId,
      entry,
      expectedSourceImagePath: imagePath,
    });

    const persisted = await loadEpisodeFocalMetadata(episodeDir, episodeId);
    const resolver = createEpisodePathResolver(dir);
    const persistedPath = resolver.focalMetadata(
      episodeIdSchema.parse(episodeId),
    );

    expect(persistedPath).toBe(
      path.join(episodeDir, "state", "visual-retention", "focal-metadata.json"),
    );
    expect(JSON.parse(await fs.readFile(persistedPath, "utf8"))).toEqual(
      persisted,
    );
    expect(persisted?.images[0]).toMatchObject({
      origin: "planner-provided",
      sourceImageSha256: "a".repeat(64),
    });
  });

  it("generates deterministic conservative fallback metadata for landscape, portrait, and square images", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-focal-fallback-"));
    const landscape = path.join(dir, "landscape.png");
    const portrait = path.join(dir, "portrait.png");
    const square = path.join(dir, "square.png");
    await writeFixtureImage(landscape, 1600, 900);
    await writeFixtureImage(portrait, 900, 1600);
    await writeFixtureImage(square, 1200, 1200);

    const landscapeA = await buildConservativeFocalMetadata({
      sourceImageId: "source-image-scene-001",
      sourceImagePath: landscape,
      sourceImageSha256: "b".repeat(64),
    });
    const landscapeB = await buildConservativeFocalMetadata({
      sourceImageId: "source-image-scene-001",
      sourceImagePath: landscape,
      sourceImageSha256: "b".repeat(64),
    });
    const portraitMetadata = await buildConservativeFocalMetadata({
      sourceImageId: "source-image-scene-002",
      sourceImagePath: portrait,
    });
    const squareMetadata = await buildConservativeFocalMetadata({
      sourceImageId: "source-image-scene-003",
      sourceImagePath: square,
    });

    expect(JSON.stringify(landscapeA)).toBe(JSON.stringify(landscapeB));
    expect(landscapeA.imageWidth).toBe(1600);
    expect(landscapeA.imageHeight).toBe(900);
    expect(landscapeA.origin).toBe("local-fallback");
    expect(landscapeA.focalRegions).toHaveLength(2);
    expect(landscapeA.focalRegions[0]?.kind).toBe("safe-crop-region");
    expect(portraitMetadata.imageHeight).toBe(1600);
    expect(squareMetadata.imageWidth).toBe(1200);
    expect(landscapeA.warnings[0]).toContain("no face or object detection");
  });

  it("rejects invalid dimensions, invalid regions, duplicate ids, malformed hashes, and invalid origins", async () => {
    expect(() =>
      buildSourceImageFocalMetadata({
        sourceImageId: "source-image-scene-001",
        sourceImagePath: "/tmp/example.png",
        imageWidth: 0,
        imageHeight: 900,
        origin: "local-fallback",
        focalRegions: [],
      }),
    ).toThrow();

    expect(
      sourceImageFocalMetadataSchema.safeParse({
        schemaVersion: 1,
        analysisVersion: "focal-metadata-v1",
        sourceImageId: "source-image-scene-001",
        sourceImagePath: "/tmp/example.png",
        sourceImageSha256: "not-a-hash",
        imageWidth: 1600,
        imageHeight: 900,
        origin: "invalid-origin",
        focalRegions: [
          {
            id: "duplicate-region",
            kind: "safe-crop-region",
            bounds: { x: 0.8, y: 0.8, width: 0.3, height: 0.3 },
          },
          {
            id: "duplicate-region",
            kind: "safe-crop-region",
            bounds: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("writes byte-stable fallback metadata once and keeps legacy entries parseable", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-focal-episode-"));
    const episodeId = "episode-fixture";
    const episodeDir = path.join(dir, episodeId);
    const outputPath = path.join(
      episodeDir,
      "shared",
      "images",
      "generated",
      "scene-001__000000-000004__16x9.png",
    );
    await writeFixtureImage(outputPath, 1600, 900);

    await ensureEpisodeFocalMetadataForImages({
      episodeDir,
      episodeId,
      images: [
        {
          sceneId: "scene-001",
          outputPath,
          outputSha256: "c".repeat(64),
        },
      ],
    });
    const resolver = createEpisodePathResolver(dir);
    const filePath = resolver.focalMetadata(episodeIdSchema.parse(episodeId));
    const first = await fs.readFile(filePath, "utf8");

    await ensureEpisodeFocalMetadataForImages({
      episodeDir,
      episodeId,
      images: [
        {
          sceneId: "scene-001",
          outputPath,
          outputSha256: "c".repeat(64),
        },
      ],
    });
    const second = await fs.readFile(filePath, "utf8");
    const loaded = await loadEpisodeFocalMetadata(episodeDir, episodeId);

    expect(second).toBe(first);
    expect(loaded?.images[0]?.sourceImageId).toBe("source-image-scene-001");
    expect(loaded?.images[0]?.sourceImagePath).toBe(outputPath);
  });
});
