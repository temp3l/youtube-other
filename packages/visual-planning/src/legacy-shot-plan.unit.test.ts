import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { scenePlanSchema } from "@mediaforge/domain";
import { fileExists, hashFile } from "@mediaforge/shared";
import { migrateLegacyEpisodeShots } from "./legacy-shot-plan.js";

async function makeEpisode() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-legacy-"));
  const episodeDir = path.join(root, "017-legacy-episode");
  await fs.mkdir(path.join(episodeDir, "canonical"), { recursive: true });
  const scenePlan = scenePlanSchema.parse({
    sourceId: "017-legacy-episode",
    scenes: [0, 1, 2].map((index) => {
      const sceneNumber = index + 1;
      const sceneId = `scene-${String(sceneNumber).padStart(3, "0")}`;
      return {
        id: sceneId,
        sequenceNumber: sceneNumber,
        canonicalNarration: `Scene ${sceneNumber} narration.`,
        sourceSegmentIds: [`segment-${String(sceneNumber).padStart(3, "0")}`],
        estimatedDurationSeconds: 6,
        timing: { startSeconds: index * 6, endSeconds: index * 6 + 6 },
        visualPurpose: "legacy migration fixture",
        textRequirement: { required: false },
        subject: "subject",
        action: "standing",
        setting: "room",
        composition: "centered",
        cameraFraming: "medium",
        mood: "tense",
        aspectRatios: ["16:9", "9:16"],
        imagePrompt: "fixture image",
        expectedImageFilenames: [`${sceneId}.png`],
        qualityStatus: "approved",
      };
    }),
  });
  await fs.writeFile(
    path.join(episodeDir, "canonical", "scenes.json"),
    `${JSON.stringify(scenePlan, null, 2)}\n`,
    "utf8"
  );
  return { episodeDir, scenePlan };
}

async function writeImage(filePath: string, width = 1600, height = 1600) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 32, g: 48, b: 64 },
    },
  })
    .png()
    .toFile(filePath);
}

async function writePerSceneManifests(episodeDir: string) {
  for (const sceneId of ["scene-001", "scene-002", "scene-003"]) {
    const imagePath = path.join(
      episodeDir,
      "shared",
      "images",
      "generated",
      `${sceneId}.png`
    );
    await writeImage(imagePath);
    const sha256 = await hashFile(imagePath);
    const manifestPath = path.join(
      episodeDir,
      "state",
      "image-generation",
      "manifests",
      `${sceneId}.json`
    );
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(
      manifestPath,
      `${JSON.stringify({ sceneId, outputPath: imagePath, outputSha256: sha256 }, null, 2)}\n`,
      "utf8"
    );
  }
}

describe("legacy shot migration", () => {
  it("dry-runs canonical scene plans with legacy image manifests without writes", async () => {
    const { episodeDir } = await makeEpisode();
    await writePerSceneManifests(episodeDir);

    const result = await migrateLegacyEpisodeShots({
      episodeWorkspace: episodeDir,
      variant: "short",
      locale: "en",
      dryRun: true,
    });

    expect(result.status).toBe("migrated");
    expect(result.sourceFormat).toBe("canonical-scene-plan-image-manifests");
    expect(result.scenesFound).toBe(3);
    expect(result.imagesFound).toBe(3);
    expect(result.plannedShotCount).toBeGreaterThanOrEqual(3);
    expect(result.requiresImageRegeneration).toBe(false);
    expect(result.validation.valid).toBe(true);
    expect(await fileExists(path.join(episodeDir, "state", "visual-retention"))).toBe(
      false
    );
  });

  it("persists canonical artifacts and reruns as already-current", async () => {
    const { episodeDir } = await makeEpisode();
    await writePerSceneManifests(episodeDir);

    const first = await migrateLegacyEpisodeShots({
      episodeWorkspace: episodeDir,
      variant: "short",
      locale: "en",
    });
    const second = await migrateLegacyEpisodeShots({
      episodeWorkspace: episodeDir,
      variant: "short",
      locale: "en",
    });

    expect(first.status).toBe("migrated");
    expect(first.artifactsWritten).toEqual([
      path.join(episodeDir, "state", "visual-retention", "source-scenes.json"),
      path.join(episodeDir, "state", "visual-retention", "focal-metadata.json"),
      path.join(episodeDir, "state", "visual-retention", "validation.short.en.json"),
      path.join(episodeDir, "state", "visual-retention", "shot-plan.short.en.json"),
    ]);
    expect(second.status).toBe("already-current");
    const focal = JSON.parse(
      await fs.readFile(
        path.join(episodeDir, "state", "visual-retention", "focal-metadata.json"),
        "utf8"
      )
    ) as { readonly images: readonly { readonly origin: string }[] };
    expect(focal.images.every((image) => image.origin === "local-fallback")).toBe(
      true
    );
  });

  it("recognizes Dark Truth full and short manifests", async () => {
    const full = await makeEpisode();
    await fs.mkdir(path.join(full.episodeDir, "shared", "images", "generated"), {
      recursive: true,
    });
    const assets = [];
    for (const sceneId of ["scene-001", "scene-002", "scene-003"]) {
      const imagePath = path.join(
        full.episodeDir,
        "shared",
        "images",
        "generated",
        `${sceneId}.png`
      );
      await writeImage(imagePath);
      assets.push({
        canonicalSceneId: sceneId,
        relativePath: path.join("images", "generated", `${sceneId}.png`),
        sha256: await hashFile(imagePath),
      });
    }
    await fs.writeFile(
      path.join(full.episodeDir, "shared", "image-manifest.json"),
      `${JSON.stringify({ assets }, null, 2)}\n`,
      "utf8"
    );

    const short = await makeEpisode();
    const entries = [];
    for (const sceneId of ["scene-001", "scene-002", "scene-003"]) {
      const imagePath = path.join(
        short.episodeDir,
        "shared",
        "short",
        "images",
        `${sceneId}.png`
      );
      await writeImage(imagePath, 1200, 1800);
      entries.push({
        sceneId,
        status: "success",
        outputImagePath: imagePath,
        outputImageSha256: await hashFile(imagePath),
      });
    }
    await fs.writeFile(
      path.join(short.episodeDir, "shared", "short", "images", "shorts-image-manifest.json"),
      `${JSON.stringify({ entries }, null, 2)}\n`,
      "utf8"
    );

    await expect(
      migrateLegacyEpisodeShots({
        episodeWorkspace: full.episodeDir,
        variant: "full",
        locale: "en",
        dryRun: true,
      })
    ).resolves.toMatchObject({ sourceFormat: "dark-truth-full-image-manifest" });
    await expect(
      migrateLegacyEpisodeShots({
        episodeWorkspace: short.episodeDir,
        variant: "short",
        locale: "en",
        dryRun: true,
      })
    ).resolves.toMatchObject({ sourceFormat: "dark-truth-short-image-manifest" });
  });

  it("preserves structurally valid historical focal hints", async () => {
    const { episodeDir } = await makeEpisode();
    await writePerSceneManifests(episodeDir);
    const manifestPath = path.join(
      episodeDir,
      "state",
      "image-generation",
      "manifests",
      "scene-001.json"
    );
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
      readonly sceneId: string;
      readonly outputPath: string;
      readonly outputSha256: string;
    };
    await fs.writeFile(
      manifestPath,
      `${JSON.stringify(
        {
          ...manifest,
          focalRegions: [
            {
              id: "source-image-scene-001-imported-safe",
              kind: "safe-crop-region",
              bounds: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
              confidence: 0.8,
            },
          ],
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const result = await migrateLegacyEpisodeShots({
      episodeWorkspace: episodeDir,
      variant: "short",
      locale: "en",
    });
    const focal = JSON.parse(
      await fs.readFile(
        path.join(episodeDir, "state", "visual-retention", "focal-metadata.json"),
        "utf8"
      )
    ) as {
      readonly images: readonly {
        readonly sourceImageId: string;
        readonly origin: string;
        readonly focalRegions: readonly { readonly id: string }[];
      }[];
    };
    const imported = focal.images.find(
      (image) => image.sourceImageId === "source-image-scene-001"
    );

    expect(result.status).toBe("migrated");
    expect(imported?.origin).toBe("imported");
    expect(imported?.focalRegions[0]?.id).toBe(
      "source-image-scene-001-imported-safe"
    );
  });

  it("blocks missing images and ambiguous manifests without partial artifacts", async () => {
    const missing = await makeEpisode();
    await writePerSceneManifests(missing.episodeDir);
    await fs.rm(
      path.join(missing.episodeDir, "shared", "images", "generated", "scene-002.png")
    );
    const missingResult = await migrateLegacyEpisodeShots({
      episodeWorkspace: missing.episodeDir,
      variant: "short",
      locale: "en",
    });
    expect(missingResult.status).toBe("blocked");
    expect(missingResult.warnings.map((warning) => warning.code)).toContain(
      "LEGACY_IMAGE_MISSING"
    );
    expect(await fileExists(path.join(missing.episodeDir, "state", "visual-retention"))).toBe(
      false
    );

    const ambiguous = await makeEpisode();
    await fs.mkdir(path.join(ambiguous.episodeDir, "shared", "short", "images"), {
      recursive: true,
    });
    await fs.mkdir(path.join(ambiguous.episodeDir, "shared"), { recursive: true });
    await fs.writeFile(
      path.join(ambiguous.episodeDir, "shared", "image-manifest.json"),
      `${JSON.stringify({ assets: [] })}\n`,
      "utf8"
    );
    await fs.writeFile(
      path.join(ambiguous.episodeDir, "shared", "short", "images", "shorts-image-manifest.json"),
      `${JSON.stringify({ entries: [] })}\n`,
      "utf8"
    );
    const ambiguousResult = await migrateLegacyEpisodeShots({
      episodeWorkspace: ambiguous.episodeDir,
      variant: "short",
      locale: "en",
      dryRun: true,
    });
    expect(ambiguousResult.status).toBe("blocked");
    expect(ambiguousResult.warnings.map((warning) => warning.code)).toContain(
      "LEGACY_MANIFEST_AMBIGUOUS"
    );
  });
});
