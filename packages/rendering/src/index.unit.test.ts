import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { scenePlanSchema, shotPlanSchema, type RenderShot } from "@mediaforge/domain";
import { hashFile } from "@mediaforge/shared";
import {
  assignClipRenderers,
  buildShotClipRenderRequest,
  buildShotRenderOperationFingerprint,
  buildRemoteReadyMarker,
  FFmpegVideoRenderer,
  remoteAssetFileName,
  remoteAssetRemotePath,
  remoteReadyPathForClip,
  validateRenderedVideo,
} from "./index.js";

function makeScenePlan() {
  return scenePlanSchema.parse({
    sourceId: "episode-fixture",
    scenes: [
      {
        id: "scene-001",
        sequenceNumber: 1,
        canonicalNarration: "A quiet hallway closes around the narrator.",
        sourceSegmentIds: ["scene-001"],
        estimatedDurationSeconds: 3,
        timing: { startSeconds: 0, endSeconds: 3 },
        visualPurpose: "establish the scene",
        subject: "a quiet hallway",
        action: "shown",
        setting: "dim hallway with a single light",
        composition: "centered",
        cameraFraming: "medium shot",
        mood: "uneasy",
        continuityReferences: [],
        onScreenText: "",
        negativeConstraints: [],
        aspectRatios: ["16:9"],
        imagePrompt: "quiet hallway",
        expectedImageFilenames: ["scene-001__000000-000003__16x9.png"],
        qualityStatus: "draft",
      },
    ],
  });
}

function makeTwoScenePlan() {
  return scenePlanSchema.parse({
    sourceId: "episode-fixture",
    scenes: [
      {
        id: "scene-001",
        sequenceNumber: 1,
        canonicalNarration: "A quiet hallway closes around the narrator.",
        sourceSegmentIds: ["scene-001"],
        estimatedDurationSeconds: 1,
        timing: { startSeconds: 0, endSeconds: 1 },
        visualPurpose: "establish the scene",
        subject: "a quiet hallway",
        action: "shown",
        setting: "dim hallway with a single light",
        composition: "centered",
        cameraFraming: "medium shot",
        mood: "uneasy",
        continuityReferences: [],
        onScreenText: "",
        negativeConstraints: [],
        aspectRatios: ["16:9"],
        imagePrompt: "quiet hallway",
        expectedImageFilenames: ["scene-001__000000-000001__16x9.png"],
        qualityStatus: "draft",
      },
      {
        id: "scene-002",
        sequenceNumber: 2,
        canonicalNarration: "A locked door waits at the end.",
        sourceSegmentIds: ["scene-002"],
        estimatedDurationSeconds: 1,
        timing: { startSeconds: 1, endSeconds: 2 },
        visualPurpose: "advance the scene",
        subject: "a locked door",
        action: "shown",
        setting: "end of the dim hallway",
        composition: "centered",
        cameraFraming: "close shot",
        mood: "uneasy",
        continuityReferences: ["scene-001"],
        onScreenText: "",
        negativeConstraints: [],
        aspectRatios: ["16:9"],
        imagePrompt: "locked door",
        expectedImageFilenames: ["scene-002__000001-000002__16x9.png"],
        qualityStatus: "draft",
      },
    ],
  });
}

function makeShotPlan(args: {
  readonly sourceImagePath: string;
  readonly sourceImageSha256: string;
  readonly shots?: readonly RenderShot[];
}) {
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
    shots:
      args.shots ?? [
        {
          ...baseShot,
          shotId: "scene-001-shot-001",
          startMs: 0,
          endMs: 500,
          crop: { x: 0, y: 0, width: 0.75, height: 1 },
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
            endScale: 1.08,
            anchor: { x: 0.5, y: 0.5 },
          },
        },
      ],
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
    visualBudget: {
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
    },
    planningSeed: "seed",
  });
}

describe("FFmpegVideoRenderer", () => {
  it("assigns alternating renderers after sorting by sequence number", () => {
    const assignments = assignClipRenderers([
      {
        episodeId: "episode",
        clipId: "scene-003",
        sequenceNumber: 3,
        inputPaths: [],
        outputPath: "/tmp/scene-003.mp4",
        ffmpegArguments: [],
      },
      {
        episodeId: "episode",
        clipId: "scene-001",
        sequenceNumber: 1,
        inputPaths: [],
        outputPath: "/tmp/scene-001.mp4",
        ffmpegArguments: [],
      },
      {
        episodeId: "episode",
        clipId: "scene-002",
        sequenceNumber: 2,
        inputPaths: [],
        outputPath: "/tmp/scene-002.mp4",
        ffmpegArguments: [],
      },
    ]);

    expect(assignments.map((item) => item.clipId)).toEqual([
      "scene-001",
      "scene-002",
      "scene-003",
    ]);
    expect(assignments.map((item) => item.renderer)).toEqual([
      "local",
      "remote",
      "local",
    ]);
  });

  it("uses content hashes for remote asset filenames", () => {
    const hash = "a".repeat(64);
    expect(remoteAssetFileName(hash)).toBe(hash);
    expect(remoteAssetRemotePath("/var/mediaforge/jobs", hash)).toBe(
      "/var/mediaforge/jobs/assets/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );
    expect(
      remoteAssetRemotePath("/var/mediaforge/jobs", hash)
    ).toBe(remoteAssetRemotePath("/var/mediaforge/jobs", hash));
  });

  it("builds deterministic remote ready marker paths", () => {
    expect(remoteReadyPathForClip("/var/mediaforge/jobs/run-001", "scene-002")).toBe(
      "/var/mediaforge/jobs/run-001/ready/scene-002.json"
    );
  });

  it("captures clip dependency metadata in ready markers", () => {
    const marker = buildRemoteReadyMarker({
      clipId: "scene-002",
      inputPaths: [
        "/remote/assets/a".repeat(1),
        "/remote/assets/b".repeat(1),
      ],
      dependencies: [
        {
          sourcePath: "/tmp/image.png",
          contentHash: "a".repeat(64),
          remotePath: "/remote/assets/a",
          sizeBytes: 10,
        },
        {
          sourcePath: "/tmp/audio.wav",
          contentHash: "b".repeat(64),
          remotePath: "/remote/assets/b",
          sizeBytes: 20,
        },
      ],
    });

    expect(marker).toMatchObject({
      schemaVersion: 1,
      clipId: "scene-002",
      inputPaths: ["/remote/assets/a", "/remote/assets/b"],
      dependencyHashes: ["a".repeat(64), "b".repeat(64)],
      dependencies: [
        {
          sourcePath: "/tmp/image.png",
          contentHash: "a".repeat(64),
          remotePath: "/remote/assets/a",
          sizeBytes: 10,
        },
        {
          sourcePath: "/tmp/audio.wav",
          contentHash: "b".repeat(64),
          remotePath: "/remote/assets/b",
          sizeBytes: 20,
        },
      ],
    });
    expect(Date.parse(marker.generatedAt)).not.toBeNaN();
  });

  it("renders one scene clip and manifest per scene id in scene order", async () => {
    const baseDir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-rendering-scenes-")
    );
    const episodeDir = path.join(baseDir, "episode");
    const outputDir = path.join(episodeDir, "video");
    const imageDir = path.join(episodeDir, "images", "generated");
    const audioDir = path.join(episodeDir, "audio", "segments");
    await fs.mkdir(imageDir, { recursive: true });
    await fs.mkdir(audioDir, { recursive: true });
    const scenePlan = makeTwoScenePlan();
    for (const [index, scene] of scenePlan.scenes.entries()) {
      await fs.writeFile(
        path.join(imageDir, scene.expectedImageFilenames[0] as string),
        await sharp({
          create: {
            width: 32,
            height: 32,
            channels: 3,
            background: index === 0 ? "#334455" : "#553344",
          },
        })
          .png()
          .toBuffer()
      );
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
          path.join(audioDir, `${scene.id}.wav`),
        ],
        { stdio: "ignore" }
      );
    }

    const renderer = new FFmpegVideoRenderer();
    const result = await renderer.renderSceneClips(
      {
        episodeDir,
        scenePlan,
        outputDir,
        renderProfile: {
          id: "youtube",
          label: "youtube",
          aspectRatio: "16:9",
          width: 160,
          height: 90,
          fps: 30,
        },
        captionBurnIn: false,
        imageDir,
        sceneAudioDir: audioDir,
      },
      new AbortController().signal
    );

    expect(result.clipPaths.map((clipPath) => path.basename(clipPath))).toEqual([
      "scene-001.mp4",
      "scene-002.mp4",
    ]);
    const manifests = await Promise.all(
      scenePlan.scenes.map((scene) =>
        fs
          .readFile(path.join(result.clipsDir, `${scene.id}.json`), "utf8")
          .then((raw) => JSON.parse(raw) as Record<string, unknown>)
      )
    );
    expect(manifests.map((manifest) => manifest["sceneId"])).toEqual([
      "scene-001",
      "scene-002",
    ]);
    expect(manifests.every((manifest) => manifest["schemaVersion"] === 2)).toBe(true);
    expect(manifests.every((manifest) => manifest["renderer"] === "local")).toBe(true);
    expect(manifests.every((manifest) => typeof manifest["renderFingerprint"] === "string")).toBe(true);
    expect(manifests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          renderProfile: {
            aspectRatio: "16:9",
            width: 160,
            height: 90,
            fps: 30,
          },
          trailingSilenceRatio: 0.8,
          trailingSilenceBufferSeconds: 0,
        }),
      ])
    );
  }, 60000);

  it("renders an explicit shot plan as ordered shot clips from one source image", async () => {
    const baseDir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-rendering-shots-")
    );
    const episodeDir = path.join(baseDir, "episode");
    const outputDir = path.join(episodeDir, "video");
    const imageDir = path.join(episodeDir, "shared", "images", "generated");
    await fs.mkdir(imageDir, { recursive: true });
    const imagePath = path.join(imageDir, "source-001.png");
    await fs.writeFile(
      imagePath,
      await sharp({
        create: { width: 96, height: 96, channels: 3, background: "#223344" },
      })
        .png()
        .toBuffer()
    );
    const sourceHash = await hashFile(imagePath);
    const shotPlan = makeShotPlan({
      sourceImagePath: path.relative(episodeDir, imagePath),
      sourceImageSha256: sourceHash,
    });

    const renderer = new FFmpegVideoRenderer();
    const result = await renderer.renderSceneClips(
      {
        episodeDir,
        scenePlan: makeScenePlan(),
        shotPlan,
        outputDir,
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

    expect(result.clipPaths.map((clipPath) => path.basename(clipPath))).toEqual([
      "scene-001-shot-001.mp4",
      "scene-001-shot-002.mp4",
    ]);
    expect(result.shotRenderSummary?.renderedShotIds).toEqual([
      "scene-001-shot-001",
      "scene-001-shot-002",
    ]);
    const manifests = await Promise.all(
      ["scene-001-shot-001", "scene-001-shot-002"].map((shotId) =>
        fs
          .readFile(path.join(result.clipsDir, `${shotId}.json`), "utf8")
          .then((raw) => JSON.parse(raw) as Record<string, unknown>)
      )
    );
    expect(manifests.map((manifest) => manifest["shotId"])).toEqual([
      "scene-001-shot-001",
      "scene-001-shot-002",
    ]);
    expect(manifests.every((manifest) => manifest["sceneId"] === "scene-001")).toBe(true);
    expect(manifests.every((manifest) => manifest["sourceImageSha256"] === sourceHash)).toBe(true);
    expect(manifests[0]?.["renderOperationFingerprint"]).not.toBe(
      manifests[1]?.["renderOperationFingerprint"]
    );
    expect(JSON.stringify(manifests)).not.toContain(imagePath);
    await expect(validateRenderedVideo(result.clipPaths[0] as string, { requireAudio: false })).resolves.toMatchObject({
      valid: true,
      width: 90,
      height: 160,
    });
  }, 60000);

  it("keeps shot render-operation fingerprints stable and path independent", async () => {
    const baseDir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-rendering-shot-fingerprint-")
    );
    const episodeDir = path.join(baseDir, "episode");
    const imagePath = path.join(episodeDir, "shared", "images", "generated", "source-001.png");
    await fs.mkdir(path.dirname(imagePath), { recursive: true });
    await fs.writeFile(
      imagePath,
      await sharp({
        create: { width: 96, height: 96, channels: 3, background: "#445566" },
      })
        .png()
        .toBuffer()
    );
    const sourceHash = await hashFile(imagePath);
    const shotPlan = makeShotPlan({
      sourceImagePath: "shared/images/generated/source-001.png",
      sourceImageSha256: sourceHash,
    });
    const first = shotPlan.shots[0] as RenderShot;
    const second = shotPlan.shots[1] as RenderShot;
    const sourceImage = {
      sourceImageId: "source-image-001",
      sourceSceneId: "source-scene-001",
      sceneId: "scene-001",
      path: imagePath,
      sha256: sourceHash,
    };
    const firstRequest = await buildShotClipRenderRequest({
      episodeId: "episode-fixture",
      episodeDir,
      shot: first,
      sourceImage,
      sequenceNumber: 1,
      outputPath: path.join(episodeDir, "out-a.mp4"),
      manifestPath: path.join(episodeDir, "out-a.json"),
      fps: 10,
      width: 90,
      height: 160,
    });
    const secondRequest = await buildShotClipRenderRequest({
      episodeId: "episode-fixture",
      episodeDir,
      shot: second,
      sourceImage,
      sequenceNumber: 2,
      outputPath: path.join(episodeDir, "elsewhere", "out-b.mp4"),
      manifestPath: path.join(episodeDir, "elsewhere", "out-b.json"),
      fps: 10,
      width: 90,
      height: 160,
    });
    const recomputed = buildShotRenderOperationFingerprint({
      shot: first,
      sourceImageSha256: sourceHash,
      operations: firstRequest.operations,
      outputProfile: {
        aspectRatio: "9:16",
        width: 90,
        height: 160,
        fps: 10,
        pixelFormat: "yuv420p",
      },
      overlayHashes: [],
    });

    expect(firstRequest.renderOperationFingerprint).toBe(recomputed);
    expect(firstRequest.renderOperationFingerprint).not.toBe(
      secondRequest.renderOperationFingerprint
    );
    expect(firstRequest.renderOperationFingerprint).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("fails shot rendering for missing source images and unsupported treatments", async () => {
    const baseDir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-rendering-shot-errors-")
    );
    const episodeDir = path.join(baseDir, "episode");
    const renderer = new FFmpegVideoRenderer();
    const missingPlan = makeShotPlan({
      sourceImagePath: "shared/images/generated/missing.png",
      sourceImageSha256: "a".repeat(64),
    });

    await expect(
      renderer.renderSceneClips(
        {
          episodeDir,
          scenePlan: makeScenePlan(),
          shotPlan: missingPlan,
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
      )
    ).rejects.toThrow(/Missing source image/u);

    const imagePath = path.join(episodeDir, "shared", "images", "generated", "source-001.png");
    await fs.mkdir(path.dirname(imagePath), { recursive: true });
    await fs.writeFile(
      imagePath,
      await sharp({
        create: { width: 96, height: 96, channels: 3, background: "#665544" },
      })
        .png()
        .toBuffer()
    );
    const sourceHash = await hashFile(imagePath);
    const unsupportedShot = {
      ...(makeShotPlan({
        sourceImagePath: path.relative(episodeDir, imagePath),
        sourceImageSha256: sourceHash,
      }).shots[0] as RenderShot),
      treatment: {
        family: "depth" as const,
        catalogVersion: "shot-treatment-catalog-v1",
        treatmentId: "layered-pseudo-parallax",
        variant: "parallax" as const,
        cacheRequired: true,
      },
    };
    const unsupportedPlan = makeShotPlan({
      sourceImagePath: path.relative(episodeDir, imagePath),
      sourceImageSha256: sourceHash,
      shots: [unsupportedShot],
    });

    await expect(
      renderer.renderSceneClips(
        {
          episodeDir,
          scenePlan: makeScenePlan(),
          shotPlan: unsupportedPlan,
          outputDir: path.join(episodeDir, "video-unsupported"),
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
      )
    ).rejects.toThrow(/Unsupported shot treatment/u);
  }, 60000);

  it("composes shot clips with one global narration audio track", async () => {
    const baseDir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-rendering-shot-final-")
    );
    const episodeDir = path.join(baseDir, "episode");
    const outputDir = path.join(episodeDir, "video");
    const imageDir = path.join(episodeDir, "shared", "images", "generated");
    const audioDir = path.join(episodeDir, "audio");
    await fs.mkdir(imageDir, { recursive: true });
    await fs.mkdir(audioDir, { recursive: true });
    const imagePath = path.join(imageDir, "source-001.png");
    await fs.writeFile(
      imagePath,
      await sharp({
        create: { width: 96, height: 96, channels: 3, background: "#334422" },
      })
        .png()
        .toBuffer()
    );
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
    const sourceHash = await hashFile(imagePath);
    const renderer = new FFmpegVideoRenderer();
    const result = await renderer.render(
      {
        episodeDir,
        scenePlan: makeScenePlan(),
        shotPlan: makeShotPlan({
          sourceImagePath: path.relative(episodeDir, imagePath),
          sourceImageSha256: sourceHash,
        }),
        outputDir,
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

    expect(result.shotRenderSummary?.renderedShotIds).toEqual([
      "scene-001-shot-001",
      "scene-001-shot-002",
    ]);
    expect(result.validation.valid).toBe(true);
    expect(result.validation.audioCodec).not.toBe("");
    expect(result.validation.durationSeconds).toBeGreaterThanOrEqual(0.95);
    expect(result.validation.durationSeconds).toBeLessThan(1.6);
  }, 60000);

  it("rebuilds placeholder-sized scene clips before concat", async () => {
    const baseDir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-rendering-")
    );
    const episodeDir = path.join(baseDir, "episode");
    const outputDir = path.join(episodeDir, "video");
    const imageDir = path.join(episodeDir, "images", "generated");
    const audioDir = path.join(episodeDir, "audio", "segments");
    await fs.mkdir(imageDir, { recursive: true });
    await fs.mkdir(audioDir, { recursive: true });
    await fs.writeFile(
      path.join(imageDir, "scene-001__000000-000003__16x9.png"),
      await sharp({
        create: { width: 32, height: 32, channels: 3, background: "#334455" },
      })
        .png()
        .toBuffer()
    );
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=24000:cl=mono",
        "-t",
        "3",
        path.join(audioDir, "scene-001.wav"),
      ],
      { stdio: "ignore" }
    );
    const clipPath = path.join(outputDir, "clips", "scene-001.mp4");
    await fs.mkdir(path.dirname(clipPath), { recursive: true });
    writeFileSync(clipPath, Buffer.alloc(48));

    const renderer = new FFmpegVideoRenderer();
    const result = await renderer.renderSceneClips(
      {
        episodeDir,
        scenePlan: makeScenePlan(),
        outputDir,
        renderProfile: {
          id: "youtube",
          label: "youtube",
          aspectRatio: "16:9",
          width: 1080,
          height: 1920,
          fps: 30,
        },
        captionBurnIn: false,
        imageDir,
        sceneAudioDir: audioDir,
      },
      new AbortController().signal
    );

    expect(result.clipPaths).toHaveLength(1);
    expect((await fs.stat(result.clipPaths[0] as string)).size).toBeGreaterThan(
      48
    );
    const validation = await validateRenderedVideo(
      result.clipPaths[0] as string
    );
    expect(validation.valid).toBe(true);
  }, 60000);

  it("prefers the scene plan matching image filename when duplicates exist", async () => {
    const baseDir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-rendering-duplicate-")
    );
    const episodeDir = path.join(baseDir, "episode");
    const outputDir = path.join(episodeDir, "video");
    const imageDir = path.join(episodeDir, "images", "generated");
    const audioDir = path.join(episodeDir, "audio", "segments");
    await fs.mkdir(imageDir, { recursive: true });
    await fs.mkdir(audioDir, { recursive: true });
    const exactImage = await sharp({
      create: { width: 32, height: 32, channels: 3, background: "#335577" },
    })
      .png()
      .toBuffer();
    const staleImage = await sharp({
      create: { width: 32, height: 32, channels: 3, background: "#775533" },
    })
      .png()
      .toBuffer();
    await fs.writeFile(
      path.join(imageDir, "scene-001__000000-000003__16x9.png"),
      exactImage
    );
    await fs.writeFile(
      path.join(imageDir, "scene-001__000001-000003__16x9.png"),
      staleImage
    );
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=24000:cl=mono",
        "-t",
        "3",
        path.join(audioDir, "scene-001.wav"),
      ],
      { stdio: "ignore" }
    );

    const renderer = new FFmpegVideoRenderer();
    const result = await renderer.renderSceneClips(
      {
        episodeDir,
        scenePlan: makeScenePlan(),
        outputDir,
        renderProfile: {
          id: "youtube",
          label: "youtube",
          aspectRatio: "16:9",
          width: 1080,
          height: 1920,
          fps: 30,
        },
        captionBurnIn: false,
        imageDir,
        sceneAudioDir: audioDir,
      },
      new AbortController().signal
    );

    expect(result.clipPaths).toHaveLength(1);
    expect((await fs.stat(result.clipPaths[0] as string)).size).toBeGreaterThan(
      48
    );
    const validation = await validateRenderedVideo(
      result.clipPaths[0] as string
    );
    expect(validation.valid).toBe(true);
  }, 60000);

  it("rebuilds cached scene clips when the source audio changes", async () => {
    const baseDir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-rendering-audio-")
    );
    const episodeDir = path.join(baseDir, "episode");
    const outputDir = path.join(episodeDir, "video");
    const imageDir = path.join(episodeDir, "images", "generated");
    const audioDir = path.join(episodeDir, "audio", "segments");
    await fs.mkdir(imageDir, { recursive: true });
    await fs.mkdir(audioDir, { recursive: true });
    await fs.writeFile(
      path.join(imageDir, "scene-001__000000-000003__16x9.png"),
      await sharp({
        create: { width: 32, height: 32, channels: 3, background: "#556677" },
      })
        .png()
        .toBuffer()
    );

    const makeAudio = (seconds: number) =>
      execFileSync(
        "ffmpeg",
        [
          "-y",
          "-f",
          "lavfi",
          "-i",
          "anullsrc=r=24000:cl=mono",
          "-t",
          String(seconds),
          path.join(audioDir, "scene-001.wav"),
        ],
        { stdio: "ignore" }
      );

    makeAudio(3);
    const renderer = new FFmpegVideoRenderer();
    const request = {
      episodeDir,
      scenePlan: makeScenePlan(),
      outputDir,
      renderProfile: {
        aspectRatio: "16:9" as const,
        width: 1080,
        height: 1920,
        fps: 30,
      },
      captionBurnIn: false,
      imageDir,
      sceneAudioDir: audioDir,
    };
    const first = await renderer.renderSceneClips(
      request,
      new AbortController().signal
    );
    const firstDuration = (
      await validateRenderedVideo(first.clipPaths[0] as string)
    ).durationSeconds;

    makeAudio(5);
    const second = await renderer.renderSceneClips(
      request,
      new AbortController().signal
    );
    const secondDuration = (
      await validateRenderedVideo(second.clipPaths[0] as string)
    ).durationSeconds;

    expect(secondDuration).toBeGreaterThan(firstDuration);
  }, 120000);

  it("does not shorten a scene clip below the planned scene timing", async () => {
    const baseDir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-rendering-duration-")
    );
    const episodeDir = path.join(baseDir, "episode");
    const outputDir = path.join(episodeDir, "video");
    const imageDir = path.join(episodeDir, "images", "generated");
    const audioDir = path.join(episodeDir, "audio", "segments");
    await fs.mkdir(imageDir, { recursive: true });
    await fs.mkdir(audioDir, { recursive: true });
    await fs.writeFile(
      path.join(imageDir, "scene-001__000000-000003__16x9.png"),
      await sharp({
        create: { width: 32, height: 32, channels: 3, background: "#112233" },
      })
        .png()
        .toBuffer()
    );
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=24000:duration=2",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=24000:cl=mono",
        "-filter_complex",
        "[0:a][1:a]concat=n=2:v=0:a=1[a]",
        "-map",
        "[a]",
        "-t",
        "3",
        path.join(audioDir, "scene-001.wav"),
      ],
      { stdio: "ignore" }
    );

    const renderer = new FFmpegVideoRenderer();
    const result = await renderer.renderSceneClips(
      {
        episodeDir,
        scenePlan: makeScenePlan(),
        outputDir,
        renderProfile: {
          id: "youtube",
          label: "youtube",
          aspectRatio: "16:9",
          width: 1080,
          height: 1920,
          fps: 30,
        },
        captionBurnIn: false,
        imageDir,
        sceneAudioDir: audioDir,
        trailingSilenceRatio: 0,
        trailingSilenceBufferSeconds: 0,
      },
      new AbortController().signal
    );

    const validation = await validateRenderedVideo(
      result.clipPaths[0] as string
    );
    expect(validation.durationSeconds).toBeGreaterThanOrEqual(2.95);
  }, 120000);

  it("pads scene clips so final audio does not land on the cut point", async () => {
    const baseDir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-rendering-tail-")
    );
    const episodeDir = path.join(baseDir, "episode");
    const outputDir = path.join(episodeDir, "video");
    const imageDir = path.join(episodeDir, "images", "generated");
    const audioDir = path.join(episodeDir, "audio", "segments");
    await fs.mkdir(imageDir, { recursive: true });
    await fs.mkdir(audioDir, { recursive: true });
    await fs.writeFile(
      path.join(imageDir, "scene-001__000000-000003__16x9.png"),
      await sharp({
        create: { width: 32, height: 32, channels: 3, background: "#445566" },
      })
        .png()
        .toBuffer()
    );
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=24000:duration=11.4",
        path.join(audioDir, "scene-001.wav"),
      ],
      { stdio: "ignore" }
    );

    const renderer = new FFmpegVideoRenderer();
    const result = await renderer.renderSceneClips(
      {
        episodeDir,
        scenePlan: makeScenePlan(),
        outputDir,
        renderProfile: {
          id: "youtube",
          label: "youtube",
          aspectRatio: "16:9",
          width: 1080,
          height: 1920,
          fps: 30,
        },
        captionBurnIn: false,
        imageDir,
        sceneAudioDir: audioDir,
        trailingSilenceRatio: 0,
        trailingSilenceBufferSeconds: 0,
      },
      new AbortController().signal
    );

    const validation = await validateRenderedVideo(
      result.clipPaths[0] as string
    );
    expect(validation.durationSeconds).toBeGreaterThanOrEqual(11.36);
  }, 120000);

  it("uses an explicit output basename for final renders", async () => {
    const baseDir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-rendering-output-")
    );
    const episodeDir = path.join(baseDir, "episode");
    const outputDir = path.join(episodeDir, "video");
    const imageDir = path.join(episodeDir, "images", "generated");
    const audioDir = path.join(episodeDir, "audio", "segments");
    await fs.mkdir(imageDir, { recursive: true });
    await fs.mkdir(audioDir, { recursive: true });
    await fs.writeFile(
      path.join(imageDir, "scene-001__000000-000003__16x9.png"),
      await sharp({
        create: { width: 32, height: 32, channels: 3, background: "#223344" },
      })
        .png()
        .toBuffer()
    );
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=24000:cl=mono",
        "-t",
        "3",
        path.join(audioDir, "scene-001.wav"),
      ],
      { stdio: "ignore" }
    );

    const renderer = new FFmpegVideoRenderer();
    const result = await renderer.render(
      {
        episodeDir,
        scenePlan: makeScenePlan(),
        outputDir,
        renderProfile: {
          id: "youtube",
          label: "youtube",
          aspectRatio: "16:9",
          width: 1080,
          height: 1920,
          fps: 30,
        },
        captionBurnIn: false,
        imageDir,
        sceneAudioDir: audioDir,
        outputBasename: "episode-fixture-en-full",
      },
      new AbortController().signal
    );

    expect(path.basename(result.cleanPath)).toBe(
      "episode-fixture-en-full-clean.mp4"
    );
  }, 120000);

  it("reuses a shared clips directory during full renders", async () => {
    const baseDir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-rendering-shared-clips-")
    );
    const episodeDir = path.join(baseDir, "episode");
    const outputDir = path.join(episodeDir, "renders", "youtube");
    const sharedRenderDir = path.join(episodeDir, "renders");
    const imageDir = path.join(episodeDir, "images", "generated");
    const audioDir = path.join(episodeDir, "audio", "segments");
    await fs.mkdir(imageDir, { recursive: true });
    await fs.mkdir(audioDir, { recursive: true });
    await fs.writeFile(
      path.join(imageDir, "scene-001__000000-000003__16x9.png"),
      await sharp({
        create: { width: 32, height: 32, channels: 3, background: "#223344" },
      })
        .png()
        .toBuffer()
    );
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=24000:cl=mono",
        "-t",
        "3",
        path.join(audioDir, "scene-001.wav"),
      ],
      { stdio: "ignore" }
    );

    const renderer = new FFmpegVideoRenderer();
    await renderer.render(
      {
        episodeDir,
        scenePlan: makeScenePlan(),
        outputDir,
        clipsOutputDir: sharedRenderDir,
        renderProfile: {
          id: "youtube",
          label: "youtube",
          aspectRatio: "16:9",
          width: 1080,
          height: 1920,
          fps: 30,
        },
        captionBurnIn: false,
        imageDir,
        sceneAudioDir: audioDir,
      },
      new AbortController().signal
    );

    await expect(
      fs.access(path.join(sharedRenderDir, "clips", "scene-001.mp4"))
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(outputDir, "clips", "scene-001.mp4"))
    ).rejects.toThrow();
  }, 120000);
});
