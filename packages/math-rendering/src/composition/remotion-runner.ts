import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia } from "@remotion/renderer";
import { runCommand } from "@mediaforge/process-runner";
import { hashFile, hashText } from "@mediaforge/shared";
import { type TimingManifest } from "@mediaforge/math-education";
import type { VideoConfig } from "remotion/no-react";
import sharp from "sharp";
import {
  createReadyMathComposition,
  type MathSceneAsset,
} from "./composition.js";
import {
  createSemanticChalkSchedule,
  extractSemanticChalkSteps,
  renderSemanticChalkFrame,
} from "./semantic-chalk.js";
import {
  assertMathMediaReady,
  validateMathMediaFile,
  type MathMediaValidation,
} from "../quality/media-qa.js";

export const MATH_REMOTION_RUNNER_VERSION = "math-semantic-keyframe-runner.v5";
export const MATH_THINK_PAUSE_SECONDS = 8;
const MATH_REVEAL_CUE_VERSION = "math-reveal-cue.v1";

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
  thinkSecondsRemaining: number | null
): string {
  const recolored = markup
    .replaceAll('fill="#f8fafc"', 'fill="#102b26"')
    .replaceAll('fill="#14213d"', 'fill="#f4efd8"')
    .replaceAll('stroke="#14213d"', 'stroke="#f4efd8"')
    .replaceAll('stroke="#64748b"', 'stroke="#9fc4ad"')
    .replaceAll('fill="#dbeafe"', 'fill="#3f6f61"')
    .replaceAll('fill="#f59e0b"', 'fill="#f4c95d"')
    .replaceAll('stroke="#f59e0b"', 'stroke="#f4c95d"')
    .replaceAll('fill="#dc2626"', 'fill="#ef8a7b"')
    .replaceAll("color:#14213d", "color:#f4efd8")
    .replaceAll(
      'font-family="Arial, sans-serif"',
      'font-family="Segoe Print, Comic Sans MS, Arial, sans-serif"'
    );
  const boardTexture = `<g data-board-surface="true" pointer-events="none"><rect x="24" y="24" width="1872" height="1032" rx="26" fill="none" stroke="#31574d" stroke-width="4"/><path d="M80 92H1840M80 988H1840" stroke="#183a32" stroke-width="3" opacity="0.65"/><g fill="#dce8dd" opacity="0.035">${Array.from({ length: 28 }, (_, index) => `<circle cx="${70 + ((index * 173) % 1780)}" cy="${80 + ((index * 97) % 900)}" r="${2 + (index % 3)}"/>`).join("")}</g></g>`;
  const thinking =
    thinkSecondsRemaining === null
      ? ""
      : `<g data-think-pause-countdown="true"><circle cx="1690" cy="150" r="72" fill="#183a32" stroke="#f4c95d" stroke-width="7"/><text x="1690" y="172" text-anchor="middle" font-family="Arial, sans-serif" font-size="62" font-weight="700" fill="#f4efd8">${thinkSecondsRemaining}</text><text x="1690" y="252" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" fill="#f4c95d">Denkzeit</text></g>`;
  const captionMarkup = caption
    ? (() => {
        const height = 34 + caption.lines.length * 56;
        const y = 1020 - height;
        return `<g data-caption="true"><rect x="220" y="${y}" width="1480" height="${height}" rx="18" fill="#07111f" opacity="0.84"/>${caption.lines
          .map(
            (line, index) =>
              `<text x="960" y="${y + 58 + index * 56}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${caption.fontSizePx}" fill="#ffffff">${escapeXml(line)}</text>`
          )
          .join("")}</g>`;
      })()
    : "";
  return recolored.replace(
    "</svg>",
    `${boardTexture}${thinking}${captionMarkup}</svg>`
  );
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
  audioTreatment?: {
    readonly thinkPauseRangesSeconds: readonly {
      readonly start: number;
      readonly end: number;
    }[];
    readonly revealCueSeconds: number | null;
    readonly version: string;
  };
}): string {
  return hashText(
    JSON.stringify({
      version: MATH_REMOTION_RUNNER_VERSION,
      durationInFrames: args.durationInFrames,
      sceneHashes: args.sceneHashes,
      frameRanges: args.frameRanges,
      audioHash: args.audioHash,
      bundleHash: args.bundleHash,
      audioTreatment: args.audioTreatment ?? null,
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
          rendererVersion: "math-semantic-chalk.v3" as const,
          activity: "standard" as const,
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
  const rasterCacheRoot = path.join(input.workDir, "semantic-raster-cache");
  const videoCacheRoot = path.join(input.workDir, "semantic-video-cache");
  await fs.rm(keyframesRoot, { recursive: true, force: true });
  await Promise.all([
    fs.mkdir(keyframesRoot, { recursive: true }),
    fs.mkdir(rasterCacheRoot, { recursive: true }),
    fs.mkdir(videoCacheRoot, { recursive: true }),
  ]);
  const entries: Array<{
    sceneId: string;
    filePath: string;
    frames: number;
    svgHash: string;
  }> = [];
  let sequence = 0;
  for (const [sceneIndex, scene] of input.props.entries()) {
    const frameRange = input.frameRanges[sceneIndex];
    const source = input.scenes[sceneIndex];
    if (!frameRange || !source || frameRange.sceneId !== scene.sceneId)
      throw new Error(`Semantic keyframe scene mismatch at ${scene.sceneId}.`);
    const sceneFrames = frameRange.endFrame - frameRange.startFrame;
    const steps = extractSemanticChalkSteps(scene.svgMarkup);
    const isThinkPause = scene.animation.activity === "think-pause";
    const countdownFrames = Math.min(
      MATH_THINK_PAUSE_SECONDS * 30,
      sceneFrames
    );
    const countdownStart = sceneFrames - countdownFrames;
    const schedule = createSemanticChalkSchedule({
      steps,
      sceneFrames,
      ...(scene.animation.cues ? { cues: scene.animation.cues } : {}),
      ...(isThinkPause ? { writingEndFrame: countdownStart } : {}),
    });
    const sampledStarts = new Set<number>([0]);
    for (const timing of schedule) {
      for (let sample = 0; sample < 8; sample += 1)
        sampledStarts.add(
          Math.floor(
            timing.startFrame +
              ((timing.endFrame - timing.startFrame) * sample) / 8
          )
        );
      sampledStarts.add(timing.endFrame);
    }
    if (isThinkPause)
      for (let frame = countdownStart; frame < sceneFrames; frame += 30)
        sampledStarts.add(frame);
    const starts = [...sampledStarts]
      .filter((frame) => frame >= 0 && frame < sceneFrames)
      .sort((left, right) => left - right);
    for (const [sampleIndex, start] of starts.entries()) {
      const end = starts[sampleIndex + 1] ?? sceneFrames;
      if (end <= start) continue;
      const frame = renderSemanticChalkFrame({
        svgMarkup: scene.svgMarkup,
        steps,
        localFrame: start,
        sceneFrames,
        ...(scene.animation.cues ? { cues: scene.animation.cues } : {}),
        schedule,
      });
      const filePath = path.join(
        keyframesRoot,
        `${String(sequence++).padStart(4, "0")}.svg`
      );
      const svgMarkup = chalkboardSvg(
        frame.svgMarkup,
        source.caption,
        isThinkPause && start >= countdownStart
          ? Math.max(1, Math.ceil((sceneFrames - start) / 30))
          : null
      );
      await fs.writeFile(filePath, svgMarkup, "utf8");
      entries.push({
        sceneId: scene.sceneId,
        filePath,
        frames: end - start,
        svgHash: hashText(svgMarkup),
      });
    }
  }
  if (
    entries.reduce((total, entry) => total + entry.frames, 0) !==
    input.durationInFrames
  )
    throw new Error(
      "Semantic keyframe durations do not match the composition."
    );
  const rasterEntries = entries.map((entry) => ({
    ...entry,
    filePath: path.join(rasterCacheRoot, `${entry.svgHash}.png`),
  }));
  const rasterJobs = [
    ...new Map(
      rasterEntries.map((entry, index) => [
        entry.svgHash,
        { rasterEntry: entry, svgEntry: entries[index]! },
      ])
    ).values(),
  ];
  let nextRaster = 0;
  const rasterWorkers = Array.from(
    { length: Math.min(4, rasterJobs.length) },
    async () => {
      for (;;) {
        const index = nextRaster++;
        const job = rasterJobs[index];
        if (!job) return;
        try {
          const metadata = await sharp(job.rasterEntry.filePath).metadata();
          if (metadata.width === 1920 && metadata.height === 1080) continue;
        } catch {
          // Populate a missing or incomplete cache entry below.
        }
        const temporary = `${job.rasterEntry.filePath}.${process.pid}-${index}.tmp.png`;
        try {
          await sharp(job.svgEntry.filePath)
            .resize(1920, 1080, { fit: "fill" })
            .png({ compressionLevel: 6 })
            .toFile(temporary);
          await fs.rename(temporary, job.rasterEntry.filePath);
        } finally {
          await fs.unlink(temporary).catch(() => undefined);
        }
      }
    }
  );
  await Promise.all(rasterWorkers);
  for (const entry of rasterEntries) await fs.access(entry.filePath);
  const sceneVideos: Array<{
    sceneId: string;
    filePath: string;
    cacheKey: string;
    frames: number;
  }> = [];
  for (const [sceneIndex, frameRange] of input.frameRanges.entries()) {
    const sceneEntries = rasterEntries.filter(
      (entry) => entry.sceneId === frameRange.sceneId
    );
    const sceneFrames = frameRange.endFrame - frameRange.startFrame;
    if (
      sceneEntries.length === 0 ||
      sceneEntries.reduce((total, entry) => total + entry.frames, 0) !==
        sceneFrames
    )
      throw new Error(
        `Semantic keyframe durations do not match scene ${frameRange.sceneId}.`
      );
    const cacheKey = hashText(
      JSON.stringify({
        renderer: "math-semantic-scene-video-cache.v1",
        sceneId: frameRange.sceneId,
        frames: sceneEntries.map((entry) => ({
          svgHash: entry.svgHash,
          frames: entry.frames,
        })),
        encoding: "h264-yuv420p-ultrafast-crf20-stillimage",
      })
    );
    const cachedVideo = path.join(videoCacheRoot, `${cacheKey}.mp4`);
    let cacheHit = false;
    try {
      cacheHit = (await fs.stat(cachedVideo)).size > 0;
    } catch {
      // Encode a missing scene checkpoint below.
    }
    if (!cacheHit) {
      const concatFile = path.join(
        keyframesRoot,
        `scene-${String(sceneIndex).padStart(2, "0")}.ffconcat`
      );
      const lines = ["ffconcat version 1.0"];
      for (const entry of sceneEntries) {
        lines.push(`file '${concatPath(entry.filePath)}'`);
        lines.push(`duration ${(entry.frames / 30).toFixed(9)}`);
      }
      lines.push(`file '${concatPath(sceneEntries.at(-1)!.filePath)}'`);
      await fs.writeFile(concatFile, `${lines.join("\n")}\n`, "utf8");
      const temporary = `${cachedVideo}.${process.pid}-${sceneIndex}.tmp.mp4`;
      try {
        await runCommand(
          "ffmpeg",
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            concatFile,
            "-an",
            "-vf",
            "fps=30,scale=1920:1080,format=yuv420p",
            "-frames:v",
            String(sceneFrames),
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "20",
            "-tune",
            "stillimage",
            temporary,
          ],
          { timeoutMs: 60_000 }
        );
        await fs.rename(temporary, cachedVideo);
      } finally {
        await fs.unlink(temporary).catch(() => undefined);
      }
    }
    sceneVideos.push({
      sceneId: frameRange.sceneId,
      filePath: cachedVideo,
      cacheKey,
      frames: sceneFrames,
    });
  }
  const concatFile = path.join(keyframesRoot, "scenes.ffconcat");
  await fs.writeFile(
    concatFile,
    `${[
      "ffconcat version 1.0",
      ...sceneVideos.map((scene) => `file '${concatPath(scene.filePath)}'`),
    ].join("\n")}\n`,
    "utf8"
  );
  const temporarySilent = `${input.silentPath}.${process.pid}.tmp.mp4`;
  try {
    await runCommand(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatFile,
        "-map",
        "0:v:0",
        "-c",
        "copy",
        "-an",
        "-map_metadata",
        "-1",
        "-movflags",
        "+faststart",
        temporarySilent,
      ],
      { timeoutMs: 60_000 }
    );
    await fs.rename(temporarySilent, input.silentPath);
  } finally {
    await fs.unlink(temporarySilent).catch(() => undefined);
  }
  return hashText(
    JSON.stringify({
      renderer: "math-semantic-keyframe-sharp-segmented.v3",
      scenes: sceneVideos.map((scene) => ({
        sceneId: scene.sceneId,
        cacheKey: scene.cacheKey,
        frames: scene.frames,
      })),
    })
  );
}

async function createRevealCue(workDir: string): Promise<string> {
  const cuePath = path.join(workDir, `${MATH_REVEAL_CUE_VERSION}.wav`);
  try {
    if ((await fs.stat(cuePath)).size > 0) return cuePath;
  } catch {
    // Generate the deterministic local cue below.
  }
  const temporary = `${cuePath}.${process.pid}.tmp.wav`;
  try {
    await runCommand(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=659.25:duration=0.16:sample_rate=48000",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=987.77:duration=0.24:sample_rate=48000",
        "-filter_complex",
        "[0:a]volume=0.035[a0];[1:a]adelay=140|140,volume=0.035[a1];[a0][a1]amix=inputs=2:duration=longest:normalize=0,afade=t=out:st=0.22:d=0.16[aout]",
        "-map",
        "[aout]",
        "-ar",
        "48000",
        "-ac",
        "2",
        temporary,
      ],
      { timeoutMs: 30_000 }
    );
    await fs.rename(temporary, cuePath);
  } finally {
    await fs.unlink(temporary).catch(() => undefined);
  }
  return cuePath;
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
  const thinkPauseRangesSeconds = args.scenes.flatMap((scene, index) => {
    if (scene.animation?.activity !== "think-pause") return [];
    const range = args.frameRanges[index];
    if (!range || range.sceneId !== scene.sceneId)
      throw new Error(`Think-pause timing mismatch at ${scene.sceneId}.`);
    const end = range.endFrame / 30;
    return [
      {
        start: Math.max(range.startFrame / 30, end - MATH_THINK_PAUSE_SECONDS),
        end,
      },
    ];
  });
  const thinkPauseIndex = args.scenes.findIndex(
    (scene) => scene.animation?.activity === "think-pause"
  );
  const revealRange =
    thinkPauseIndex >= 0 ? args.frameRanges[thinkPauseIndex + 1] : undefined;
  const revealCueSeconds = revealRange ? revealRange.startFrame / 30 : null;
  const audioTreatment = {
    thinkPauseRangesSeconds,
    revealCueSeconds,
    version: MATH_REVEAL_CUE_VERSION,
  };
  const renderFingerprint = createRemotionRenderFingerprint({
    durationInFrames: args.durationInFrames,
    sceneHashes: args.scenes.map((scene) => scene.svgHash),
    frameRanges: args.frameRanges,
    audioHash: await hashFile(args.audioPath),
    bundleHash: rendererHash,
    audioTreatment,
  });
  try {
    const revealCuePath =
      revealCueSeconds === null ? null : await createRevealCue(workDir);
    const silenceExpression = thinkPauseRangesSeconds
      .map(
        (range) =>
          `between(t,${range.start.toFixed(6)},${range.end.toFixed(6)})`
      )
      .join("+");
    const narrationFilter =
      thinkPauseRangesSeconds.length === 0
        ? null
        : `[1:a]aresample=48000,volume=0:enable='${silenceExpression}'`;
    const audioFilter =
      narrationFilter === null
        ? null
        : revealCuePath === null || revealCueSeconds === null
          ? `${narrationFilter}[aout]`
          : `${narrationFilter}[narration];[2:a]adelay=${Math.round(
              revealCueSeconds * 1000
            )}|${Math.round(
              revealCueSeconds * 1000
            )}[cue];[narration][cue]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[aout]`;
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
        ...(revealCuePath ? ["-i", revealCuePath] : []),
        ...(audioFilter ? ["-filter_complex", audioFilter] : []),
        "-map",
        "0:v:0",
        "-map",
        audioFilter ? "[aout]" : "1:a:0",
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
