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
  buildFinalAudioMuxFfmpegArguments,
  buildShotClipRenderRequest,
  buildShotRenderOperationFingerprint,
  buildSceneClipFfmpegArguments,
  buildSceneClipFilterGraph,
  buildSceneClipRenderRequest,
  buildVisualConcatFfmpegArguments,
  buildRemoteReadyMarker,
  FFmpegVideoRenderer,
  motionRenderReportFilename,
  renderManifestSchema,
  remoteAssetFileName,
  remoteAssetRemotePath,
  remoteReadyPathForClip,
  validateRenderedVideo,
} from "./index.js";

describe("render manifest motion metadata", () => {
  it("accepts additive render-motion metadata with an explicit preset", () => {
    const manifest = renderManifestSchema.parse({
      stageIdentity: {
        episodeId: "episode-fixture",
        language: "en",
        locale: "en-US",
        variant: "full",
        owner: "render",
      },
      renderFingerprint: "render-fingerprint",
      renderProfile: {
        id: "youtube",
        label: "youtube",
        width: 1920,
        height: 1080,
        fps: 30,
        aspectRatio: "16:9",
      },
      motion: {
        enabled: true,
        debug: true,
        mode: "cinematic",
        seed: "episode-022",
        allowShortsPresetsForFull: false,
        preventSamePresetBackToBack: true,
        maxSameFamilyRunLength: 2,
        preventConsecutiveHighIntensity: true,
        explicitPresetId: "doc_slow_push_in",
      },
      cleanPath: "/tmp/video.mp4",
      validation: {
        valid: true,
        width: 1920,
        height: 1080,
        durationSeconds: 10,
        videoCodec: "h264",
        audioCodec: "aac",
        pixelFormat: "yuv420p",
        issues: [],
      },
      status: "generated",
      generatedAt: "2026-07-07T00:00:00.000Z",
    });

    expect(manifest.motion?.explicitPresetId).toBe("doc_slow_push_in");
  });
});

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

function makeMotionSmokeScenePlan() {
  return scenePlanSchema.parse({
    sourceId: "episode-fixture",
    scenes: [
      {
        id: "scene-001",
        sequenceNumber: 1,
        canonicalNarration: "A hallway light flickers.",
        sourceSegmentIds: ["scene-001"],
        estimatedDurationSeconds: 0.7,
        timing: { startSeconds: 0, endSeconds: 0.7 },
        visualPurpose: "establish the location",
        subject: "a hallway",
        action: "flickers",
        setting: "dim hallway",
        composition: "centered",
        cameraFraming: "wide shot",
        mood: "uneasy",
        continuityReferences: [],
        onScreenText: "",
        negativeConstraints: [],
        aspectRatios: ["9:16"],
        imagePrompt: "dim hallway",
        expectedImageFilenames: ["scene-001__000000-000001__9x16.png"],
        qualityStatus: "draft",
      },
      {
        id: "scene-002",
        sequenceNumber: 2,
        canonicalNarration: "A door waits at the end.",
        sourceSegmentIds: ["scene-002"],
        estimatedDurationSeconds: 0.7,
        timing: { startSeconds: 0.7, endSeconds: 1.4 },
        visualPurpose: "advance the threat",
        subject: "a door",
        action: "waits",
        setting: "end of hallway",
        composition: "right weighted",
        cameraFraming: "medium shot",
        mood: "tense",
        continuityReferences: ["scene-001"],
        onScreenText: "",
        negativeConstraints: [],
        aspectRatios: ["9:16"],
        imagePrompt: "closed door",
        expectedImageFilenames: ["scene-002__000001-000001__9x16.png"],
        qualityStatus: "draft",
      },
      {
        id: "scene-003",
        sequenceNumber: 3,
        canonicalNarration: "A shadow crosses the frame.",
        sourceSegmentIds: ["scene-003"],
        estimatedDurationSeconds: 0.7,
        timing: { startSeconds: 1.4, endSeconds: 2.1 },
        visualPurpose: "heighten tension",
        subject: "a shadow",
        action: "crosses",
        setting: "hallway wall",
        composition: "left weighted",
        cameraFraming: "close shot",
        mood: "alarming",
        continuityReferences: ["scene-002"],
        onScreenText: "",
        negativeConstraints: [],
        aspectRatios: ["9:16"],
        imagePrompt: "shadow on wall",
        expectedImageFilenames: ["scene-003__000001-000002__9x16.png"],
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

function makeMotionSmokeShotPlan(
  sources: readonly {
    readonly sourceImageId: string;
    readonly sourceImagePath: string;
    readonly sourceImageSha256: string;
  }[]
) {
  return shotPlanSchema.parse({
    schemaVersion: 1,
    sourceId: "episode-fixture",
    variant: "short",
    aspectRatio: "9:16",
    sourceScenes: sources.map((source, index) => ({
      sourceSceneId: `source-scene-${String(index + 1).padStart(3, "0")}`,
      sceneId: `scene-${String(index + 1).padStart(3, "0")}`,
      narrationStartMs: index * 700,
      narrationEndMs: (index + 1) * 700,
      sourceImageId: source.sourceImageId,
      sourceImagePath: source.sourceImagePath,
      sourceImageSha256: source.sourceImageSha256,
      importance: index === 0 ? "setup" : index === 1 ? "escalation" : "climax",
      focalRegions: [],
    })),
    shots: sources.map((source, index) => ({
      shotId: `scene-${String(index + 1).padStart(3, "0")}-shot-001`,
      sourceSceneId: `source-scene-${String(index + 1).padStart(3, "0")}`,
      sceneId: `scene-${String(index + 1).padStart(3, "0")}`,
      sourceImageId: source.sourceImageId,
      startMs: index * 700,
      endMs: (index + 1) * 700,
      crop: { x: 0, y: 0, width: 1, height: 1 },
      treatment: {
        family: "framing" as const,
        catalogVersion: "shot-treatment-catalog-v1",
        treatmentId: "medium-crop",
        variant: "medium-crop" as const,
      },
      motion:
        index === 0
          ? {
              kind: "push-in" as const,
              startScale: 1,
              endScale: 1.06,
              anchor: { x: 0.5, y: 0.5 },
            }
          : index === 1
            ? {
                kind: "pan" as const,
                startCenter: { x: 0.45, y: 0.5 },
                endCenter: { x: 0.55, y: 0.5 },
                scale: 1.08,
              }
            : {
                kind: "pan-and-zoom" as const,
                startCenter: { x: 0.5, y: 0.45 },
                endCenter: { x: 0.5, y: 0.55 },
                startScale: 1,
                endScale: 1.08,
              },
      overlays: [],
      transition: { kind: "hard-cut" as const, durationMs: 0 as const },
    })),
    pacingProfile: {
      mode: "inline",
      profile: {
        id: "shorts-aggressive",
        shotDurationMs: { minMs: 500, maxMs: 900 },
        staticShotDurationMs: { minMs: 500, maxMs: 900 },
        movingShotDurationMs: { minMs: 500, maxMs: 900 },
        openingCadenceMs: { minMs: 500, maxMs: 900 },
        climaxCadenceMs: { minMs: 500, maxMs: 900 },
      },
    },
    visualBudget: {
      sourceImageCount: { min: 3, max: 3 },
      shotCount: { min: 3, max: 3 },
      shotsPerImage: { min: 1, max: 1 },
      maxConsecutiveSourceImageUses: 1,
      maxTotalSourceImageUses: 1,
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
    planningSeed: "motion-smoke-seed",
  });
}

async function writeSceneFixtureMedia(args: {
  readonly imageDir: string;
  readonly audioDir: string;
  readonly imageFilename: string;
  readonly imageSize: { readonly width: number; readonly height: number };
  readonly durationSeconds: number;
}): Promise<void> {
  await fs.mkdir(args.imageDir, { recursive: true });
  await fs.mkdir(args.audioDir, { recursive: true });
  await fs.writeFile(
    path.join(args.imageDir, args.imageFilename),
    await sharp({
      create: {
        width: args.imageSize.width,
        height: args.imageSize.height,
        channels: 3,
        background: "#223344",
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
      String(args.durationSeconds),
      path.join(args.audioDir, "scene-001.wav"),
    ],
    { stdio: "ignore" }
  );
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

  it("escapes subtitle path colons in scene clip filter graphs while preserving other current metacharacter behavior", () => {
    const captionsPath = "/tmp/render/captions:name[1],draft.srt";
    const filterGraph = buildSceneClipFilterGraph(160, 90, captionsPath);

    expect(filterGraph).toContain("subtitles=/tmp/render/captions\\:name[1],draft.srt");
    expect(filterGraph).toContain("scale=");
  });

  it("builds scene clip commands as video-only without per-clip audio encoding", () => {
    const args = buildSceneClipFfmpegArguments({
      imagePath: "/tmp/scene.png",
      outputPath: "/tmp/scene.mp4",
      width: 1920,
      height: 1080,
      fps: 30,
      durationSeconds: 3,
    });

    expect(args).toContain("-an");
    expect(args).not.toContain("-c:a");
    expect(args).not.toContain("aac");
    expect(args.filter((arg) => arg === "-i")).toHaveLength(1);
  });

  it("targets precise scene clip duration without synthetic one-frame padding", async () => {
    const baseDir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-rendering-command-")
    );
    const audioPath = path.join(baseDir, "scene.wav");
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=24000:duration=3",
        audioPath,
      ],
      { stdio: "ignore" }
    );

    const request = await buildSceneClipRenderRequest({
      episodeId: "episode-fixture",
      clipId: "scene-001",
      sequenceNumber: 1,
      imagePath: path.join(baseDir, "scene.png"),
      audioPath,
      outputPath: path.join(baseDir, "scene.mp4"),
      fps: 30,
      width: 1920,
      height: 1080,
      minimumDurationSeconds: 3,
      trailingSilenceRatio: 1,
      trailingSilenceBufferSeconds: 0,
    });

    expect(request.expectedDurationSeconds).toBe(3);
    expect(request.ffmpegArguments).toContain("-an");
    expect(request.ffmpegArguments).toEqual(
      expect.arrayContaining(["-t", "3"])
    );
  });

  it("builds final mux commands from continuous narration with normalized AAC audio", () => {
    const args = buildFinalAudioMuxFfmpegArguments({
      visualPath: "/tmp/visual.mp4",
      narrationAudioPath: "/tmp/narration.wav",
      outputPath: "/tmp/final.mp4",
    });

    expect(args).toEqual(
      expect.arrayContaining([
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-af",
        "aresample=48000:async=1:first_pts=0",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-c:a",
        "aac",
      ])
    );
    expect(args).not.toContain("silenceremove");
  });

  it("keeps visual concat as stream copy over pre-rendered video clips", () => {
    expect(
      buildVisualConcatFfmpegArguments({
        concatListPath: "/tmp/concat.txt",
        outputPath: "/tmp/visual.mp4",
      })
    ).toEqual([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "/tmp/concat.txt",
      "-c",
      "copy",
      "/tmp/visual.mp4",
    ]);
  });

  it.todo(
    "CR-002 task-08: missing scene audio must be classified as an upstream-stage failure and must not be synthesized from narration during render."
  );

  it.todo(
    "CR-012 task-08: final caption burn-in must escape FFmpeg filter metacharacters, not interpolate request.captionsPath directly."
  );

  it.todo(
    "CR-011 task-09: invalid remote job/result JSON and partial remote results need a local fake harness with explicit rejection/classification."
  );

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

  it("renders a full 16:9 scene fixture from generated image and synthetic audio", async () => {
    const baseDir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-rendering-full-fixture-")
    );
    const episodeDir = path.join(baseDir, "episode");
    const outputDir = path.join(episodeDir, "video");
    const imageDir = path.join(episodeDir, "images", "generated");
    const audioDir = path.join(episodeDir, "audio", "segments");
    await writeSceneFixtureMedia({
      imageDir,
      audioDir,
      imageFilename: "scene-001__000000-000003__16x9.png",
      imageSize: { width: 64, height: 36 },
      durationSeconds: 3,
    });

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
          width: 160,
          height: 90,
          fps: 15,
        },
        captionBurnIn: false,
        imageDir,
        sceneAudioDir: audioDir,
        outputBasename: "full-fixture",
      },
      new AbortController().signal
    );

    await expect(
      validateRenderedVideo(result.cleanPath, { requireAudio: true })
    ).resolves.toMatchObject({
      valid: true,
      width: 160,
      height: 90,
    });
  }, 60000);

  it("renders a short 9:16 scene fixture from generated image and synthetic audio", async () => {
    const baseDir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-rendering-short-fixture-")
    );
    const episodeDir = path.join(baseDir, "episode");
    const outputDir = path.join(episodeDir, "video");
    const imageDir = path.join(episodeDir, "images", "generated-short");
    const audioDir = path.join(episodeDir, "audio", "segments");
    await writeSceneFixtureMedia({
      imageDir,
      audioDir,
      imageFilename: "scene-001__000000-000003__9x16.png",
      imageSize: { width: 36, height: 64 },
      durationSeconds: 3,
    });

    const renderer = new FFmpegVideoRenderer();
    const result = await renderer.render(
      {
        episodeDir,
        scenePlan: makeScenePlan(),
        outputDir,
        renderProfile: {
          id: "short",
          label: "short",
          aspectRatio: "9:16",
          width: 90,
          height: 160,
          fps: 15,
        },
        captionBurnIn: false,
        imageDir,
        sceneAudioDir: audioDir,
        outputBasename: "short-fixture",
      },
      new AbortController().signal
    );

    await expect(
      validateRenderedVideo(result.cleanPath, { requireAudio: true })
    ).resolves.toMatchObject({
      valid: true,
      width: 90,
      height: 160,
    });
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

    expect(result.clipPaths.map((clipPath) => path.dirname(clipPath))).toEqual([
      path.join(episodeDir, "state", "render", "derived-shots"),
      path.join(episodeDir, "state", "render", "derived-shots"),
    ]);
    expect(result.shotRenderSummary?.renderedShotIds).toEqual([
      "scene-001-shot-001",
      "scene-001-shot-002",
    ]);
    expect(result.shotRenderSummary?.derivedShotCache).toMatchObject({
      hits: 0,
      misses: 2,
      writes: 2,
      renderedShots: ["scene-001-shot-001", "scene-001-shot-002"],
    });
    const manifests = await Promise.all(
      result.clipPaths.map((clipPath) =>
        fs
          .readFile(clipPath.replace(/\.mp4$/u, ".json"), "utf8")
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
    await expect(
      validateRenderedVideo(result.clipPaths[0] as string, {
        requireAudio: false,
        disallowAudio: true,
      })
    ).resolves.toMatchObject({
      valid: true,
      width: 90,
      height: 160,
    });
  }, 60000);

  it("writes a motion report only when motion debug is enabled", async () => {
    const baseDir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-rendering-motion-report-")
    );
    const episodeDir = path.join(baseDir, "episode");
    const outputDir = path.join(episodeDir, "video");
    const imagePath = path.join(episodeDir, "shared", "images", "generated", "source-001.png");
    await fs.mkdir(path.dirname(imagePath), { recursive: true });
    await fs.writeFile(
      imagePath,
      await sharp({
        create: { width: 96, height: 96, channels: 3, background: "#334455" },
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

    await renderer.renderSceneClips(
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
    await expect(
      fs.access(path.join(outputDir, motionRenderReportFilename))
    ).rejects.toThrow();

    const debugOutputDir = path.join(episodeDir, "video-debug");
    await renderer.renderSceneClips(
      {
        episodeDir,
        scenePlan: makeScenePlan(),
        shotPlan,
        outputDir: debugOutputDir,
        renderProfile: {
          id: "short",
          label: "short",
          aspectRatio: "9:16",
          width: 90,
          height: 160,
          fps: 10,
        },
        captionBurnIn: false,
        motion: { debug: true, seed: "debug-seed" },
      },
      new AbortController().signal
    );

    const report = JSON.parse(
      await fs.readFile(path.join(debugOutputDir, motionRenderReportFilename), "utf8")
    ) as {
      readonly schemaVersion: number;
      readonly outputDir: string;
      readonly shots: readonly {
        readonly shotId: string;
        readonly selectedPreset: {
          readonly id: string;
          readonly family: string;
          readonly intensity: string;
        };
        readonly durationMs: number;
        readonly inputImage: string;
        readonly outputSegment: string;
        readonly seed: string;
        readonly reason: string;
        readonly filterSummary: string;
        readonly cache?: { readonly status: string };
      }[];
    };
    expect(report.schemaVersion).toBe(1);
    expect(report.outputDir).toBe(".");
    expect(report.shots).toHaveLength(2);
    expect(report.shots[1]).toMatchObject({
      shotId: "scene-001-shot-002",
      selectedPreset: {
        id: "doc_slow_push_in",
        family: "documentary",
        intensity: "low",
      },
      durationMs: 500,
      inputImage: "shared/images/generated/source-001.png",
      seed: "debug-seed:scene-001-shot-002",
      reason: "shot-plan-motion:push-in",
      cache: { status: "hit" },
    });
    expect(report.shots[1]?.filterSummary).toContain("zoompan");
    expect(report.shots[1]?.outputSegment).toMatch(/^state\/render\/derived-shots\//u);
  }, 60000);

  it("renders shot clips when a later scene reuses an earlier source image id", async () => {
    const baseDir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-rendering-shots-reuse-")
    );
    const episodeDir = path.join(baseDir, "episode");
    const outputDir = path.join(episodeDir, "video");
    const imageDir = path.join(episodeDir, "shared", "images", "generated");
    await fs.mkdir(imageDir, { recursive: true });

    const imagePathA = path.join(imageDir, "source-001.png");
    await fs.writeFile(
      imagePathA,
      await sharp({
        create: { width: 96, height: 96, channels: 3, background: "#223344" },
      })
        .png()
        .toBuffer()
    );
    const imagePathB = path.join(imageDir, "source-002.png");
    await fs.writeFile(
      imagePathB,
      await sharp({
        create: { width: 96, height: 96, channels: 3, background: "#553322" },
      })
        .png()
        .toBuffer()
    );

    const sourceHashA = await hashFile(imagePathA);
    const sourceHashB = await hashFile(imagePathB);
    const shotPlan = shotPlanSchema.parse({
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
          sourceImagePath: path.relative(episodeDir, imagePathA),
          sourceImageSha256: sourceHashA,
          importance: "setup",
          focalRegions: [],
        },
        {
          sourceSceneId: "source-scene-002",
          sceneId: "scene-002",
          narrationStartMs: 1000,
          narrationEndMs: 2000,
          sourceImageId: "source-image-002",
          sourceImagePath: path.relative(episodeDir, imagePathB),
          sourceImageSha256: sourceHashB,
          importance: "setup",
          focalRegions: [],
        },
      ],
      shots: [
        {
          sourceSceneId: "source-scene-001",
          sceneId: "scene-001",
          sourceImageId: "source-image-001",
          shotId: "scene-001-shot-001",
          startMs: 0,
          endMs: 1000,
          treatment: {
            family: "framing",
            catalogVersion: "shot-treatment-catalog-v1",
            treatmentId: "medium-crop",
            variant: "medium-crop",
          },
          crop: { x: 0, y: 0, width: 0.75, height: 1 },
          overlays: [],
          transition: { kind: "hard-cut", durationMs: 0 },
        },
        {
          sourceSceneId: "source-scene-002",
          sceneId: "scene-002",
          sourceImageId: "source-image-001",
          shotId: "scene-002-shot-001",
          startMs: 1000,
          endMs: 2000,
          treatment: {
            family: "framing",
            catalogVersion: "shot-treatment-catalog-v1",
            treatmentId: "medium-crop",
            variant: "medium-crop",
          },
          crop: { x: 0.25, y: 0, width: 0.75, height: 1 },
          overlays: [],
          transition: { kind: "hard-cut", durationMs: 0 },
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
        sourceImageCount: { min: 1, max: 2 },
        shotCount: { min: 2, max: 2 },
        shotsPerImage: { min: 1, max: 2 },
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

    const renderer = new FFmpegVideoRenderer();
    const result = await renderer.renderSceneClips(
      {
        episodeDir,
        scenePlan: makeTwoScenePlan(),
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

    expect(result.clipPaths).toHaveLength(2);
    expect(result.shotRenderSummary?.renderedShotIds).toEqual([
      "scene-001-shot-001",
      "scene-002-shot-001",
    ]);
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
    const withoutMotion = await buildShotClipRenderRequest({
      episodeId: "episode-fixture",
      episodeDir,
      shot: { ...second, motion: { kind: "none" } },
      sourceImage,
      sequenceNumber: 3,
      outputPath: path.join(episodeDir, "without-motion.mp4"),
      manifestPath: path.join(episodeDir, "without-motion.json"),
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
    expect(secondRequest.operations.some((operation) => operation.kind === "zoompan")).toBe(
      true
    );
    expect(secondRequest.clipRequest.ffmpegArguments.join(" ")).toContain("zoompan=");
    expect(firstRequest.renderOperationFingerprint).not.toBe(
      secondRequest.renderOperationFingerprint
    );
    expect(secondRequest.renderOperationFingerprint).not.toBe(
      withoutMotion.renderOperationFingerprint
    );
    expect(firstRequest.renderOperationFingerprint).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("covers absolute external shot source images before clip rendering", async () => {
    const baseDir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-rendering-absolute-shot-")
    );
    const episodeDir = path.join(baseDir, "episode");
    const renderer = new FFmpegVideoRenderer();
    const plan = makeShotPlan({
      sourceImagePath: path.join(baseDir, "outside", "source.png"),
      sourceImageSha256: "a".repeat(64),
    });

    await expect(
      renderer.renderSceneClips(
        {
          episodeDir,
          scenePlan: makeScenePlan(),
          shotPlan: plan,
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
  });

  it.todo(
    "CR-013 task-08: existing absolute external shot source images must be rejected as containment violations instead of accepted after hash validation."
  );

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
          motion: { debug: true },
        },
        new AbortController().signal
      )
    ).rejects.toThrow(/Unsupported shot treatment/u);
    const failureReport = JSON.parse(
      await fs.readFile(
        path.join(episodeDir, "video-unsupported", motionRenderReportFilename),
        "utf8"
      )
    ) as {
      readonly shots: readonly {
        readonly shotId: string;
        readonly failure?: { readonly stage: string; readonly message: string };
      }[];
    };
    expect(failureReport.shots).toHaveLength(1);
    expect(failureReport.shots[0]).toMatchObject({
      shotId: "scene-001-shot-001",
      failure: {
        stage: "prepare",
        message: expect.stringContaining("Unsupported shot treatment"),
      },
    });
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
    expect(result.validation.audioSampleRateHz).toBe(48000);
    expect(result.validation.audioChannels).toBe(2);
    expect(result.audioAssembly).toMatchObject({
      strategy: "video-only-clips-continuous-narration",
      finalAudioSampleRateHz: 48000,
      finalAudioChannels: 2,
    });
    expect(result.audioAssembly?.clips).toHaveLength(2);
    expect(result.validation.durationSeconds).toBeGreaterThanOrEqual(0.95);
    expect(result.validation.durationSeconds).toBeLessThan(1.6);
  }, 60000);

  it("smoke renders FFmpeg motion presets from temp fixtures and synthetic audio", async () => {
    const baseDir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-rendering-motion-smoke-")
    );
    const episodeDir = path.join(baseDir, "episode");
    const outputDir = path.join(episodeDir, "video");
    const imageDir = path.join(episodeDir, "shared", "images", "generated");
    const audioDir = path.join(episodeDir, "audio");
    await fs.mkdir(imageDir, { recursive: true });
    await fs.mkdir(audioDir, { recursive: true });

    const sourceImages = await Promise.all(
      ["#223344", "#443322", "#334422"].map(async (background, index) => {
        const imagePath = path.join(imageDir, `motion-smoke-${index + 1}.png`);
        await fs.writeFile(
          imagePath,
          await sharp({
            create: {
              width: 96,
              height: 160,
              channels: 3,
              background,
            },
          })
            .png()
            .toBuffer()
        );
        return {
          sourceImageId: `source-image-${String(index + 1).padStart(3, "0")}`,
          sourceImagePath: path.relative(episodeDir, imagePath),
          sourceImageSha256: await hashFile(imagePath),
        };
      })
    );
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=330:sample_rate=24000:duration=2.1",
        path.join(audioDir, "narration.wav"),
      ],
      { stdio: "ignore" }
    );

    const renderer = new FFmpegVideoRenderer();
    const result = await renderer.render(
      {
        episodeDir,
        scenePlan: makeMotionSmokeScenePlan(),
        shotPlan: makeMotionSmokeShotPlan(sourceImages),
        outputDir,
        renderProfile: {
          id: "short-smoke",
          label: "short smoke",
          aspectRatio: "9:16",
          width: 96,
          height: 160,
          fps: 10,
        },
        captionBurnIn: false,
        outputBasename: "motion-smoke",
        motion: { debug: true, seed: "motion-smoke-seed" },
      },
      new AbortController().signal
    );

    expect(result.shotRenderSummary?.renderedShotIds).toEqual([
      "scene-001-shot-001",
      "scene-002-shot-001",
      "scene-003-shot-001",
    ]);
    await expect(
      validateRenderedVideo(result.cleanPath, {
        expectedDurationSeconds: 2.1,
        expectedWidth: 96,
        expectedHeight: 160,
        requireAudio: true,
      })
    ).resolves.toMatchObject({
      valid: true,
      width: 96,
      height: 160,
    });
    expect(result.validation.durationSeconds).toBeGreaterThanOrEqual(1.85);
    expect(result.validation.durationSeconds).toBeLessThan(2.5);
    const report = JSON.parse(
      await fs.readFile(path.join(outputDir, motionRenderReportFilename), "utf8")
    ) as {
      readonly shots: readonly {
        readonly selectedPreset: { readonly id: string };
        readonly seed: string;
      }[];
    };
    expect(report.shots).toHaveLength(3);
    expect(report.shots.map((shot) => shot.seed)).toEqual([
      "motion-smoke-seed:scene-001-shot-001",
      "motion-smoke-seed:scene-002-shot-001",
      "motion-smoke-seed:scene-003-shot-001",
    ]);
    expect(report.shots.map((shot) => shot.selectedPreset.id)).toEqual([
      "doc_slow_push_in",
      "reveal_pan_to_subject",
      "reveal_zoom_to_detail",
    ]);
  }, 60000);

  it("composes scene clips with one global narration audio track", async () => {
    const baseDir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-rendering-scene-final-")
    );
    const episodeDir = path.join(baseDir, "episode");
    const outputDir = path.join(episodeDir, "video");
    const imageDir = path.join(episodeDir, "images", "generated");
    const audioDir = path.join(episodeDir, "audio");
    const segmentDir = path.join(audioDir, "segments");
    await fs.mkdir(imageDir, { recursive: true });
    await fs.mkdir(segmentDir, { recursive: true });
    await Promise.all(
      [
        "scene-001__000000-000001__16x9.png",
        "scene-002__000001-000002__16x9.png",
      ].map(async (fileName) =>
          fs.writeFile(
            path.join(imageDir, fileName),
            await sharp({
              create: {
                width: 96,
                height: 54,
                channels: 3,
                background: "#334455",
              },
            })
              .png()
              .toBuffer()
          )
      )
    );
    for (const sceneId of ["scene-001", "scene-002"]) {
      execFileSync(
        "ffmpeg",
        [
          "-y",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:sample_rate=24000:duration=1",
          path.join(segmentDir, `${sceneId}.wav`),
        ],
        { stdio: "ignore" }
      );
    }
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
        scenePlan: makeTwoScenePlan(),
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
        sceneAudioDir: segmentDir,
        imageDir,
      },
      new AbortController().signal
    );

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
      result.clipPaths[0] as string,
      { requireAudio: false }
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
      path.join(imageDir, "scene-001__000001-000003__16x9.png"),
      exactImage
    );
    await fs.writeFile(
      path.join(imageDir, "scene-001__000002-000003__16x9.png"),
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
    await expect(
      renderer.renderSceneClips(
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
      )
    ).rejects.toThrow(/Ambiguous image assets found/u);
  }, 60000);

  it("uses canonical shared full-image paths when no imageDir override is provided", async () => {
    const baseDir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-rendering-shared-full-"));
    const episodeDir = path.join(baseDir, "episode");
    const outputDir = path.join(episodeDir, "video");
    const imageDir = path.join(episodeDir, "shared", "images", "generated");
    const audioDir = path.join(episodeDir, "audio", "segments");
    await fs.mkdir(imageDir, { recursive: true });
    await fs.mkdir(audioDir, { recursive: true });
    await fs.writeFile(
      path.join(imageDir, "scene-001__000000-000003__16x9.png"),
      await sharp({
        create: { width: 32, height: 32, channels: 3, background: "#335577" },
      }).png().toBuffer()
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
        sceneAudioDir: audioDir,
      },
      new AbortController().signal
    );

    expect(result.clipPaths).toHaveLength(1);
  }, 60000);

  it("uses canonical shared short-image paths when no imageDir override is provided", async () => {
    const baseDir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-rendering-shared-short-"));
    const episodeDir = path.join(baseDir, "episode");
    const outputDir = path.join(episodeDir, "video");
    const imageDir = path.join(episodeDir, "shared", "short", "images", "generated");
    const audioDir = path.join(episodeDir, "audio", "segments");
    await fs.mkdir(imageDir, { recursive: true });
    await fs.mkdir(audioDir, { recursive: true });
    await fs.writeFile(
      path.join(imageDir, "scene-001__000000-000003__9x16.png"),
      await sharp({
        create: { width: 32, height: 32, channels: 3, background: "#335577" },
      }).png().toBuffer()
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
          id: "shorts",
          label: "shorts",
          aspectRatio: "9:16",
          width: 1080,
          height: 1920,
          fps: 30,
        },
        captionBurnIn: false,
        sceneAudioDir: audioDir,
      },
      new AbortController().signal
    );

    expect(result.clipPaths).toHaveLength(1);
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
      await validateRenderedVideo(first.clipPaths[0] as string, {
        requireAudio: false,
      })
    ).durationSeconds;

    makeAudio(5);
    const second = await renderer.renderSceneClips(
      request,
      new AbortController().signal
    );
    const secondDuration = (
      await validateRenderedVideo(second.clipPaths[0] as string, {
        requireAudio: false,
      })
    ).durationSeconds;

    expect(secondDuration).toBeGreaterThan(firstDuration);
  }, 120000);

  it("rebuilds legacy cached scene clips that still contain embedded audio", async () => {
    const baseDir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-rendering-legacy-audio-")
    );
    const episodeDir = path.join(baseDir, "episode");
    const outputDir = path.join(episodeDir, "video");
    const imageDir = path.join(episodeDir, "images", "generated");
    const audioDir = path.join(episodeDir, "audio", "segments");
    await writeSceneFixtureMedia({
      imageDir,
      audioDir,
      imageFilename: "scene-001__000000-000003__16x9.png",
      imageSize: { width: 32, height: 32 },
      durationSeconds: 3,
    });

    const renderer = new FFmpegVideoRenderer();
    const request = {
      episodeDir,
      scenePlan: makeScenePlan(),
      outputDir,
      renderProfile: {
        id: "youtube",
        label: "youtube",
        aspectRatio: "16:9" as const,
        width: 160,
        height: 90,
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
    const clipPath = first.clipPaths[0] as string;
    const manifestPath = clipPath.replace(/\.mp4$/u, ".json");
    const manifest = JSON.parse(
      await fs.readFile(manifestPath, "utf8")
    ) as Record<string, unknown>;

    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-loop",
        "1",
        "-i",
        path.join(imageDir, "scene-001__000000-000003__16x9.png"),
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=24000:cl=mono",
        "-t",
        "3",
        "-r",
        "30",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        clipPath,
      ],
      { stdio: "ignore" }
    );

    const staleOutputSha256 = await hashFile(clipPath);
    delete manifest["renderFingerprint"];
    manifest["outputSha256"] = staleOutputSha256;
    manifest["generatedAt"] = new Date().toISOString();
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await renderer.renderSceneClips(request, new AbortController().signal);

    await expect(
      validateRenderedVideo(clipPath, {
        requireAudio: false,
        disallowAudio: true,
      })
    ).resolves.toMatchObject({
      valid: true,
      audioCodec: "",
    });
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
      result.clipPaths[0] as string,
      { requireAudio: false }
    );
    expect(validation.durationSeconds).toBeGreaterThanOrEqual(2.95);
  }, 120000);

  it("does not add synthetic silence padding to scene clips", async () => {
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
      result.clipPaths[0] as string,
      { requireAudio: false }
    );
    expect(validation.durationSeconds).toBeGreaterThanOrEqual(11.3);
    expect(validation.durationSeconds).toBeLessThan(11.5);
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
