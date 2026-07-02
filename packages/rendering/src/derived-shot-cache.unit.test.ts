import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  scenePlanSchema,
  shotPlanSchema,
  type RenderShot,
  type ShotPlan,
} from "@mediaforge/domain";
import { hashFile } from "@mediaforge/shared";
import {
  buildShotPlanFingerprint,
  FFmpegVideoRenderer,
  validateRenderedVideo,
} from "./index.js";

function scenePlan() {
  return scenePlanSchema.parse({
    sourceId: "episode-fixture",
    scenes: [
      {
        id: "scene-001",
        sequenceNumber: 1,
        canonicalNarration: "A hallway appears.",
        sourceSegmentIds: ["scene-001"],
        estimatedDurationSeconds: 1,
        timing: { startSeconds: 0, endSeconds: 1 },
        visualPurpose: "establish",
        subject: "hallway",
        action: "shown",
        setting: "hallway",
        composition: "centered",
        cameraFraming: "medium",
        mood: "uneasy",
        continuityReferences: [],
        onScreenText: "",
        negativeConstraints: [],
        aspectRatios: ["9:16"],
        imagePrompt: "hallway",
        expectedImageFilenames: ["scene-001__000000-000001__9x16.png"],
        qualityStatus: "draft",
      },
    ],
  });
}

function visualBudget() {
  return {
    sourceImageCount: { min: 1, max: 1 },
    shotCount: { min: 2, max: 2 },
    shotsPerImage: { min: 2, max: 2 },
    maxConsecutiveSourceImageUses: 2,
    maxTotalSourceImageUses: 2,
    cropLimits: {
      minCropArea: 0.35,
      minFaceMargin: 0.08,
      maxCropZoom: 2,
      minOutputHeightPx: 90,
      maxAdjacentSameImageCropIou: 0.82,
    },
    motionLimits: {
      minShotDurationMs: 400,
      pushInScaleRange: { min: 1.03, max: 1.14 },
      fastPushInScaleRange: { min: 1.08, max: 1.22 },
      panTravelFractionOfImage: { min: 0.03, max: 0.12 },
      rotationDegreesRange: { min: -1, max: 1 },
      dissolveDurationMs: { minMs: 120, maxMs: 250 },
      dipToBlackDurationMs: { minMs: 100, maxMs: 500 },
    },
    effectCaps: [],
  };
}

function makeShotPlan(args: {
  readonly sourceImagePath: string;
  readonly sourceImageSha256: string;
  readonly firstCropX?: number;
  readonly secondMotionEndScale?: number;
}): ShotPlan {
  const baseShot = {
    sourceSceneId: "source-scene-001",
    sceneId: "scene-001",
    sourceImageId: "source-image-001",
    treatment: {
      family: "framing" as const,
      catalogVersion: "shot-treatment-catalog-v1",
      treatmentId: "medium-crop",
      variant: "medium-crop" as const,
    },
    overlays: [],
    transition: { kind: "hard-cut" as const, durationMs: 0 as const },
  };
  const shots: readonly RenderShot[] = [
    {
      ...baseShot,
      shotId: "scene-001-shot-001",
      startMs: 0,
      endMs: 500,
      crop: { x: args.firstCropX ?? 0, y: 0, width: 0.75, height: 1 },
    },
    {
      ...baseShot,
      shotId: "scene-001-shot-002",
      startMs: 500,
      endMs: 1000,
      crop: { x: 0.25, y: 0, width: 0.75, height: 1 },
      motion: {
        kind: "push-in",
        startScale: 1,
        endScale: args.secondMotionEndScale ?? 1.08,
        anchor: { x: 0.5, y: 0.5 },
      },
    },
  ];
  return shotPlanSchema.parse({
    schemaVersion: 1,
    sourceId: "episode-fixture",
    variant: "short",
    aspectRatio: "9:16",
    sourceScenes: [
      {
        sourceSceneId: "source-scene-001",
        sceneId: "scene-001",
        narrationStartMs: 0,
        narrationEndMs: 1000,
        sourceImageId: "source-image-001",
        sourceImagePath: args.sourceImagePath,
        sourceImageSha256: args.sourceImageSha256,
        importance: "setup",
        focalRegions: [],
      },
    ],
    shots,
    pacingProfile: {
      mode: "inline",
      profile: {
        id: "balanced",
        shotDurationMs: { minMs: 400, maxMs: 1000 },
        staticShotDurationMs: { minMs: 400, maxMs: 1000 },
        movingShotDurationMs: { minMs: 400, maxMs: 1000 },
        openingCadenceMs: { minMs: 400, maxMs: 1000 },
        climaxCadenceMs: { minMs: 400, maxMs: 1000 },
      },
    },
    visualBudget: visualBudget(),
    planningSeed: "seed",
  });
}

async function writeImage(filePath: string, color: string): Promise<string> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    await sharp({
      create: { width: 96, height: 96, channels: 3, background: color },
    })
      .png()
      .toBuffer()
  );
  return hashFile(filePath);
}

async function renderShots(args: {
  readonly episodeDir: string;
  readonly shotPlan: ShotPlan;
}) {
  const renderer = new FFmpegVideoRenderer();
  return renderer.renderSceneClips(
    {
      episodeDir: args.episodeDir,
      scenePlan: scenePlan(),
      shotPlan: args.shotPlan,
      outputDir: path.join(args.episodeDir, "video"),
      renderProfile: {
        id: "short",
        label: "short",
        aspectRatio: "9:16",
        width: 90,
        height: 160,
        fps: 10,
      },
      captionBurnIn: false,
    },
    new AbortController().signal
  );
}

describe("derived shot cache", () => {
  it("builds stable shot-plan fingerprints without path or time inputs", async () => {
    const baseDir = mkdtempSync(path.join(os.tmpdir(), "derived-shot-plan-"));
    const imagePath = path.join(baseDir, "episode", "shared", "images", "source.png");
    const imageHash = await writeImage(imagePath, "#223344");
    const first = makeShotPlan({
      sourceImagePath: "shared/images/source.png",
      sourceImageSha256: imageHash,
    });
    const second = shotPlanSchema.parse(JSON.parse(JSON.stringify(first)) as unknown);

    expect(buildShotPlanFingerprint({ shotPlan: first })).toBe(
      buildShotPlanFingerprint({ shotPlan: second })
    );
    expect(buildShotPlanFingerprint({ shotPlan: first })).not.toContain(baseDir);
    expect(
      buildShotPlanFingerprint({
        shotPlan: makeShotPlan({
          sourceImagePath: "/different/root/source.png",
          sourceImageSha256: imageHash,
        }),
      })
    ).toBe(buildShotPlanFingerprint({ shotPlan: first }));
  });

  it("reuses valid cached shot clips without rerendering them", async () => {
    const baseDir = mkdtempSync(path.join(os.tmpdir(), "derived-shot-hit-"));
    const episodeDir = path.join(baseDir, "episode");
    const imagePath = path.join(episodeDir, "shared", "images", "source.png");
    const imageHash = await writeImage(imagePath, "#334455");
    const plan = makeShotPlan({
      sourceImagePath: path.relative(episodeDir, imagePath),
      sourceImageSha256: imageHash,
    });

    const first = await renderShots({ episodeDir, shotPlan: plan });
    const firstStats = await Promise.all(
      first.clipPaths.map((clipPath) => fs.stat(clipPath))
    );
    const second = await renderShots({ episodeDir, shotPlan: plan });

    expect(first.shotRenderSummary?.derivedShotCache).toMatchObject({
      hits: 0,
      misses: 2,
      writes: 2,
    });
    expect(second.shotRenderSummary?.derivedShotCache).toMatchObject({
      hits: 2,
      misses: 0,
      writes: 0,
      resumedShots: ["scene-001-shot-001", "scene-001-shot-002"],
    });
    const secondStats = await Promise.all(
      second.clipPaths.map((clipPath) => fs.stat(clipPath))
    );
    expect(secondStats.map((stat) => stat.mtimeMs)).toEqual(
      firstStats.map((stat) => stat.mtimeMs)
    );
  }, 60000);

  it("invalidates only the changed shot when crop metadata changes", async () => {
    const baseDir = mkdtempSync(path.join(os.tmpdir(), "derived-shot-crop-"));
    const episodeDir = path.join(baseDir, "episode");
    const imagePath = path.join(episodeDir, "shared", "images", "source.png");
    const imageHash = await writeImage(imagePath, "#445566");
    const firstPlan = makeShotPlan({
      sourceImagePath: path.relative(episodeDir, imagePath),
      sourceImageSha256: imageHash,
    });
    const first = await renderShots({ episodeDir, shotPlan: firstPlan });
    const second = await renderShots({
      episodeDir,
      shotPlan: makeShotPlan({
        sourceImagePath: path.relative(episodeDir, imagePath),
        sourceImageSha256: imageHash,
        firstCropX: 0.1,
      }),
    });

    expect(second.shotRenderSummary?.derivedShotCache).toMatchObject({
      hits: 1,
      misses: 1,
      writes: 1,
      resumedShots: ["scene-001-shot-002"],
      renderedShots: ["scene-001-shot-001"],
    });
    expect(second.clipPaths[0]).not.toBe(first.clipPaths[0]);
    expect(second.clipPaths[1]).toBe(first.clipPaths[1]);
    expect(await hashFile(imagePath)).toBe(imageHash);
  }, 60000);

  it("rerenders a corrupt cache entry while preserving valid siblings", async () => {
    const baseDir = mkdtempSync(path.join(os.tmpdir(), "derived-shot-corrupt-"));
    const episodeDir = path.join(baseDir, "episode");
    const imagePath = path.join(episodeDir, "shared", "images", "source.png");
    const imageHash = await writeImage(imagePath, "#556677");
    const plan = makeShotPlan({
      sourceImagePath: path.relative(episodeDir, imagePath),
      sourceImageSha256: imageHash,
    });
    const first = await renderShots({ episodeDir, shotPlan: plan });
    const siblingHash = await hashFile(first.clipPaths[1] as string);
    await fs.writeFile(first.clipPaths[0] as string, Buffer.from("corrupt"));

    const second = await renderShots({ episodeDir, shotPlan: plan });

    expect(second.shotRenderSummary?.derivedShotCache).toMatchObject({
      hits: 1,
      misses: 1,
      writes: 1,
      invalidEntries: 1,
      resumedShots: ["scene-001-shot-002"],
      renderedShots: ["scene-001-shot-001"],
    });
    expect(
      second.shotRenderSummary?.derivedShotCache?.missReasons.map(
        (reason) => reason.reason
      )
    ).toContain("OUTPUT_HASH_MISMATCH");
    await expect(
      validateRenderedVideo(second.clipPaths[0] as string, { requireAudio: false })
    ).resolves.toMatchObject({ valid: true });
    expect(await hashFile(second.clipPaths[1] as string)).toBe(siblingHash);
  }, 60000);

  it("treats unsupported cache manifest schema versions as misses", async () => {
    const baseDir = mkdtempSync(path.join(os.tmpdir(), "derived-shot-schema-"));
    const episodeDir = path.join(baseDir, "episode");
    const imagePath = path.join(episodeDir, "shared", "images", "source.png");
    const imageHash = await writeImage(imagePath, "#776655");
    const plan = makeShotPlan({
      sourceImagePath: path.relative(episodeDir, imagePath),
      sourceImageSha256: imageHash,
    });
    const first = await renderShots({ episodeDir, shotPlan: plan });
    const manifestPath = (first.clipPaths[0] as string).replace(/\.mp4$/u, ".json");
    const raw = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>;
    await fs.writeFile(
      manifestPath,
      `${JSON.stringify({ ...raw, schemaVersion: 2 }, null, 2)}\n`,
      "utf8"
    );

    const second = await renderShots({ episodeDir, shotPlan: plan });

    expect(
      second.shotRenderSummary?.derivedShotCache?.missReasons.map(
        (reason) => reason.reason
      )
    ).toContain("UNSUPPORTED_SCHEMA_VERSION");
    expect(second.shotRenderSummary?.derivedShotCache).toMatchObject({
      hits: 1,
      misses: 1,
      writes: 1,
      invalidEntries: 1,
    });
  }, 60000);

  it("waits for every required shot before final composition", async () => {
    const baseDir = mkdtempSync(path.join(os.tmpdir(), "derived-shot-final-"));
    const episodeDir = path.join(baseDir, "episode");
    const imagePath = path.join(episodeDir, "shared", "images", "source.png");
    const audioDir = path.join(episodeDir, "audio");
    const imageHash = await writeImage(imagePath, "#667788");
    await fs.mkdir(audioDir, { recursive: true });
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=24000:cl=mono",
        "-t",
        "1",
        path.join(audioDir, "narration.wav"),
      ],
      { stdio: "ignore" }
    );
    const renderer = new FFmpegVideoRenderer();
    const result = await renderer.render(
      {
        episodeDir,
        scenePlan: scenePlan(),
        shotPlan: makeShotPlan({
          sourceImagePath: path.relative(episodeDir, imagePath),
          sourceImageSha256: imageHash,
        }),
        outputDir: path.join(episodeDir, "video"),
        renderProfile: {
          id: "short",
          label: "short",
          aspectRatio: "9:16",
          width: 90,
          height: 160,
          fps: 10,
        },
        captionBurnIn: false,
      },
      new AbortController().signal
    );

    expect(result.validation.valid).toBe(true);
    expect(result.shotRenderSummary?.derivedShotCache?.writes).toBe(2);
  }, 60000);
});
