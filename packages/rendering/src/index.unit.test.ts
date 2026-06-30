import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { scenePlanSchema } from "@mediaforge/domain";
import {
  assignClipRenderers,
  FFmpegVideoRenderer,
  remoteAssetFileName,
  remoteAssetRemotePath,
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
