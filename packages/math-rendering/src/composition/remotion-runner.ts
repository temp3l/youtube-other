import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia } from "@remotion/renderer";
import { runCommand } from "@mediaforge/process-runner";
import { hashFile, hashText } from "@mediaforge/shared";
import { type TimingManifest } from "@mediaforge/math-education";
import type { VideoConfig } from "remotion/no-react";
import {
  createReadyMathComposition,
  type MathSceneAsset,
} from "./composition.js";
import {
  assertMathMediaReady,
  validateMathMediaFile,
  type MathMediaValidation,
} from "../quality/media-qa.js";

export const MATH_REMOTION_RUNNER_VERSION = "math-remotion-runner.v1";

export function createRemotionRenderFingerprint(args: {
  durationInFrames: number;
  sceneHashes: readonly string[];
  frameRanges: readonly {
    sceneId: string;
    startFrame: number;
    endFrame: number;
  }[];
  audioHash: string;
  bundleHash: string;
}): string {
  return hashText(
    JSON.stringify({
      version: MATH_REMOTION_RUNNER_VERSION,
      durationInFrames: args.durationInFrames,
      sceneHashes: args.sceneHashes,
      frameRanges: args.frameRanges,
      audioHash: args.audioHash,
      bundleHash: args.bundleHash,
      codec: "h264-yuv420p-aac",
    })
  );
}

async function bundleRemotion(bundleDir: string): Promise<string> {
  await fs.rm(bundleDir, { recursive: true, force: true });
  const entryPoint = fileURLToPath(
    new URL("./remotion-entry.tsx", import.meta.url)
  );
  return bundle({
    entryPoint,
    outDir: bundleDir,
    enableCaching: false,
    publicDir: null,
    rootDir: path.resolve(fileURLToPath(new URL("../..", import.meta.url))),
    ignoreRegisterRootWarning: false,
  });
}

function videoConfig(
  durationInFrames: number,
  props: Record<string, unknown>
): VideoConfig {
  return {
    id: "MathLesson",
    width: 1920,
    height: 1080,
    fps: 30,
    durationInFrames,
    defaultProps: props,
    props,
    defaultCodec: "h264",
    defaultOutName: null,
    defaultVideoImageFormat: "png",
    defaultPixelFormat: "yuv420p",
    defaultProResProfile: null,
    defaultSampleRate: 48_000,
  };
}

async function sceneProps(
  scenes: readonly MathSceneAsset[],
  frameRanges: readonly {
    sceneId: string;
    startFrame: number;
    endFrame: number;
  }[]
) {
  return Promise.all(
    scenes.map(async (scene, index) => {
      const frames = frameRanges[index];
      if (!frames || frames.sceneId !== scene.sceneId)
        throw new Error(`Remotion scene order mismatch at ${scene.sceneId}.`);
      if ((await hashFile(scene.svgPath)) !== scene.svgHash)
        throw new Error(`Semantic SVG hash mismatch: ${scene.sceneId}`);
      const svg = await fs.readFile(scene.svgPath);
      return {
        sceneId: scene.sceneId,
        startFrame: frames.startFrame,
        endFrame: frames.endFrame,
        svgDataUrl: `data:image/svg+xml;base64,${svg.toString("base64")}`,
      };
    })
  );
}

export async function renderLocalRemotionVideo(args: {
  durationInFrames: number;
  scenes: readonly MathSceneAsset[];
  frameRanges: readonly {
    sceneId: string;
    startFrame: number;
    endFrame: number;
  }[];
  audioPath: string;
  outputPath: string;
  workDir: string;
  browserExecutable?: string;
  validationDurationRange?: { minimum: number; maximum: number };
}): Promise<{ validation: MathMediaValidation; renderFingerprint: string }> {
  if (!Number.isInteger(args.durationInFrames) || args.durationInFrames <= 0)
    throw new Error(
      "Remotion duration must contain a positive whole number of frames."
    );
  const workDir = path.resolve(args.workDir);
  const outputPath = path.resolve(args.outputPath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const bundleDir = path.join(workDir, "bundle");
  const serveUrl = await bundleRemotion(bundleDir);
  const bundlePath = path.join(serveUrl, "bundle.js");
  const props = await sceneProps(args.scenes, args.frameRanges);
  const silentPath = path.join(workDir, "silent.mp4");
  const muxedPath = path.join(
    path.dirname(outputPath),
    `${path.basename(outputPath)}.${process.pid}.tmp.mp4`
  );
  const renderFingerprint = createRemotionRenderFingerprint({
    durationInFrames: args.durationInFrames,
    sceneHashes: args.scenes.map((scene) => scene.svgHash),
    frameRanges: args.frameRanges,
    audioHash: await hashFile(args.audioPath),
    bundleHash: await hashFile(bundlePath),
  });
  const inputProps = {
    durationInFrames: args.durationInFrames,
    scenes: props,
  };
  try {
    await renderMedia({
      composition: videoConfig(args.durationInFrames, inputProps),
      serveUrl,
      codec: "h264",
      pixelFormat: "yuv420p",
      crf: 23,
      x264Preset: "veryfast",
      outputLocation: silentPath,
      inputProps,
      browserExecutable: args.browserExecutable ?? "/usr/bin/chromium",
      chromeMode: "chrome-for-testing",
      chromiumOptions: { disableWebSecurity: false },
      concurrency: 1,
      overwrite: true,
      muted: true,
      enforceAudioTrack: false,
      logLevel: "error",
      timeoutInMilliseconds: 60_000,
    });
    await runCommand(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        silentPath,
        "-i",
        args.audioPath,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-shortest",
        "-map_metadata",
        "-1",
        "-movflags",
        "+faststart",
        muxedPath,
      ],
      { timeoutMs: 300_000 }
    );
    await fs.rename(muxedPath, outputPath);
  } finally {
    await fs.unlink(muxedPath).catch(() => undefined);
  }
  const expectedDurationSeconds = args.durationInFrames / 30;
  const validation = await validateMathMediaFile(outputPath, {
    minimumDurationSeconds:
      args.validationDurationRange?.minimum ?? expectedDurationSeconds,
    maximumDurationSeconds:
      args.validationDurationRange?.maximum ?? expectedDurationSeconds,
    expectedDurationSeconds,
    durationToleranceSeconds: 0.1,
  });
  assertMathMediaReady(validation);
  return { validation, renderFingerprint };
}

export async function renderProviderFreeMathMedia(args: {
  id: string;
  timing: TimingManifest;
  profile: "grades-5-7-v1" | "grades-8-10-v1";
  scenes: readonly MathSceneAsset[];
  audioPath: string;
  outputPath: string;
  workDir: string;
  browserExecutable?: string;
}) {
  const composition = createReadyMathComposition(
    args.id,
    args.timing,
    args.profile,
    args.scenes
  );
  if (
    composition.durationInFrames < 5_400 ||
    composition.durationInFrames > 9_000
  )
    throw new Error("Production math media must be 180-300 seconds at 30fps.");
  const result = await renderLocalRemotionVideo({
    durationInFrames: composition.durationInFrames,
    scenes: composition.scenes,
    frameRanges: composition.timing.scenes,
    audioPath: args.audioPath,
    outputPath: args.outputPath,
    workDir: args.workDir,
    ...(args.browserExecutable
      ? { browserExecutable: args.browserExecutable }
      : {}),
    validationDurationRange: { minimum: 180, maximum: 300 },
  });
  return { composition, ...result };
}
