import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { scenePlanSchema } from "@mediaforge/domain";
import { validateRenderedVideo, FFmpegVideoRenderer } from "./index.js";

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
    expect(secondDuration).toBeGreaterThanOrEqual(4.5);
  }, 120000);
});
