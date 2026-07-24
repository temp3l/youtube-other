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
  extractSemanticChalkSteps,
  renderSemanticChalkFrame,
  semanticChalkWritingFrames,
} from "./semantic-chalk.js";
import {
  assertMathMediaReady,
  validateMathMediaFile,
  type MathMediaValidation,
} from "../quality/media-qa.js";

export const MATH_REMOTION_RUNNER_VERSION = "math-semantic-keyframe-runner.v2";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function chalkboardSvg(
  markup: string,
  caption: MathSceneAsset["caption"],
  guide: ReturnType<typeof renderSemanticChalkFrame>["guide"],
  progress: number
): string {
  const recolored = markup
    .replaceAll('fill="#f8fafc"', 'fill="#102b26"')
    .replaceAll('fill="#14213d"', 'fill="#f4efd8"')
    .replaceAll("color:#14213d", "color:#f4efd8");
  const chalk = guide
    ? `<g data-semantic-chalk-writing="true"><path d="M ${guide.x1} ${guide.y} Q ${(guide.x1 + guide.x2) / 2} ${guide.y - 12} ${guide.x1 + (guide.x2 - guide.x1) * progress} ${guide.y}" fill="none" stroke="#f4efd8" stroke-width="9" stroke-linecap="round" opacity="0.9"/><circle cx="${guide.x1 + (guide.x2 - guide.x1) * progress}" cy="${guide.y}" r="10" fill="#fffbe8"/></g>`
    : "";
  const captionMarkup = caption
    ? `<g data-caption="true"><rect x="180" y="900" width="1560" height="126" rx="16" fill="#07111f" opacity="0.92"/>${caption.lines
        .map(
          (line, index) =>
            `<text x="960" y="${956 + index * 48}" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" fill="#ffffff">${escapeXml(line)}</text>`
        )
        .join("")}</g>`
    : "";
  return recolored.replace("</svg>", `${chalk}${captionMarkup}</svg>`);
}

function concatPath(filePath: string): string {
  return filePath.replaceAll("'", "'\\''");
}

export async function resolveRemotionEntryPoint(
  runnerModuleUrl = import.meta.url
): Promise<string> {
  const directory = path.dirname(fileURLToPath(runnerModuleUrl));
  const candidates = [
    path.join(directory, "remotion-entry.js"),
    path.join(directory, "remotion-entry.tsx"),
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Continue to the source fallback when the compiled entry is absent.
    }
  }
  throw new Error(
    `Math Remotion entry is unavailable: ${candidates.join(", ")}`
  );
}

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
  const entryPoint = await resolveRemotionEntryPoint();
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
      const svg = await fs.readFile(scene.svgPath, "utf8");
      return {
        sceneId: scene.sceneId,
        startFrame: frames.startFrame,
        endFrame: frames.endFrame,
        svgMarkup: svg,
        animation: scene.animation ?? {
          mode: "progressive-chalk-reveal" as const,
          rendererVersion: "math-semantic-chalk.v2" as const,
        },
        ...(scene.caption ? { caption: scene.caption } : {}),
      };
    })
  );
}

async function renderSemanticKeyframes(input: {
  props: Awaited<ReturnType<typeof sceneProps>>;
  scenes: readonly MathSceneAsset[];
  frameRanges: readonly {
    sceneId: string;
    startFrame: number;
    endFrame: number;
  }[];
  workDir: string;
  silentPath: string;
  durationInFrames: number;
}): Promise<string> {
  const keyframesRoot = path.join(input.workDir, "semantic-keyframes");
  await fs.rm(keyframesRoot, { recursive: true, force: true });
  await fs.mkdir(keyframesRoot, { recursive: true });
  const entries: Array<{ filePath: string; frames: number }> = [];
  let sequence = 0;
  for (const [sceneIndex, scene] of input.props.entries()) {
    const frameRange = input.frameRanges[sceneIndex];
    const source = input.scenes[sceneIndex];
    if (!frameRange || !source || frameRange.sceneId !== scene.sceneId)
      throw new Error(`Semantic keyframe scene mismatch at ${scene.sceneId}.`);
    const sceneFrames = frameRange.endFrame - frameRange.startFrame;
    const steps = extractSemanticChalkSteps(scene.svgMarkup);
    const writingFrames =
      steps.length > 0 ? semanticChalkWritingFrames(sceneFrames) : 0;
    const sampleCount = Math.max(1, steps.length * 12);
    const starts =
      writingFrames > 0
        ? [
            ...new Set(
              Array.from({ length: sampleCount }, (_, index) =>
                Math.floor((index * writingFrames) / sampleCount)
              )
            ),
          ]
        : [];
    for (const [sampleIndex, start] of starts.entries()) {
      const end = starts[sampleIndex + 1] ?? writingFrames;
      if (end <= start) continue;
      const frame = renderSemanticChalkFrame({
        svgMarkup: scene.svgMarkup,
        steps,
        localFrame: start,
        sceneFrames,
      });
      const filePath = path.join(
        keyframesRoot,
        `${String(sequence++).padStart(4, "0")}.svg`
      );
      await fs.writeFile(
        filePath,
        chalkboardSvg(
          frame.svgMarkup,
          source.caption,
          frame.guide,
          frame.stepProgress
        ),
        "utf8"
      );
      entries.push({ filePath, frames: end - start });
    }
    const finalFrame = renderSemanticChalkFrame({
      svgMarkup: scene.svgMarkup,
      steps,
      localFrame: writingFrames,
      sceneFrames,
    });
    const finalPath = path.join(
      keyframesRoot,
      `${String(sequence++).padStart(4, "0")}.svg`
    );
    await fs.writeFile(
      finalPath,
      chalkboardSvg(finalFrame.svgMarkup, source.caption, null, 1),
      "utf8"
    );
    entries.push({ filePath: finalPath, frames: sceneFrames - writingFrames });
  }
  if (
    entries.reduce((total, entry) => total + entry.frames, 0) !==
    input.durationInFrames
  )
    throw new Error("Semantic keyframe durations do not match the composition.");
  const rasterEntries = entries.map((entry, index) => ({
    ...entry,
    filePath: path.join(
      keyframesRoot,
      `${String(index).padStart(4, "0")}.png`
    ),
  }));
  let nextRaster = 0;
  const rasterWorkers = Array.from(
    { length: Math.min(4, rasterEntries.length) },
    async () => {
      for (;;) {
        const index = nextRaster++;
        const rasterEntry = rasterEntries[index];
        const svgEntry = entries[index];
        if (!rasterEntry || !svgEntry) return;
        await runCommand(
          "ffmpeg",
          [
            "-hide_banner", "-loglevel", "error", "-y",
            "-i", svgEntry.filePath,
            "-frames:v", "1",
            "-vf", "scale=1920:1080",
            "-update", "1",
            rasterEntry.filePath,
          ],
          { timeoutMs: 30_000 }
        );
      }
    }
  );
  await Promise.all(rasterWorkers);
  for (const entry of rasterEntries) await fs.access(entry.filePath);
  const concatFile = path.join(keyframesRoot, "frames.ffconcat");
  const lines = ["ffconcat version 1.0"];
  for (const entry of rasterEntries) {
    lines.push(`file '${concatPath(entry.filePath)}'`);
    lines.push(`duration ${(entry.frames / 30).toFixed(9)}`);
  }
  const lastEntry = rasterEntries.at(-1);
  if (!lastEntry) throw new Error("Semantic keyframe plan is empty.");
  lines.push(`file '${concatPath(lastEntry.filePath)}'`);
  await fs.writeFile(concatFile, `${lines.join("\n")}\n`, "utf8");
  await runCommand(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "concat", "-safe", "0", "-i", concatFile,
      "-an", "-vf", "fps=30,scale=1920:1080,format=yuv420p",
      "-frames:v", String(input.durationInFrames),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
      input.silentPath,
    ],
    { timeoutMs: 240_000 }
  );
  return hashText(
    JSON.stringify({
      renderer: "math-semantic-keyframe-ffmpeg.v1",
      frames: rasterEntries.map((entry) => entry.frames),
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
  const props = await sceneProps(args.scenes, args.frameRanges);
  const silentPath = path.join(workDir, "silent.mp4");
  const muxedPath = path.join(
    path.dirname(outputPath),
    `${path.basename(outputPath)}.${process.pid}.tmp.mp4`
  );
  const rendererHash = await renderSemanticKeyframes({
    props,
    scenes: args.scenes,
    frameRanges: args.frameRanges,
    workDir,
    silentPath,
    durationInFrames: args.durationInFrames,
  });
  const renderFingerprint = createRemotionRenderFingerprint({
    durationInFrames: args.durationInFrames,
    sceneHashes: args.scenes.map((scene) => scene.svgHash),
    frameRanges: args.frameRanges,
    audioHash: await hashFile(args.audioPath),
    bundleHash: rendererHash,
  });
  try {
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
