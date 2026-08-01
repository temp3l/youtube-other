import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runCommand, runCommandJson } from "@mediaforge/process-runner";
import { hashFile, hashText } from "@mediaforge/shared";
import { canonicalHash } from "@mediaforge/math-education/canonical-json.js";
import type { TimingManifest } from "@mediaforge/math-education/timing.js";
import sharp from "sharp";
import { z } from "zod";
import {
  createReadyMathComposition,
  type MathSceneAsset,
} from "./composition.js";
import {
  createSemanticChalkSchedule,
  extractSemanticChalkSteps,
  MATH_SEMANTIC_CHALK_VERSION,
  renderSemanticChalkFrame,
  semanticChalkStepSampleCount,
} from "./semantic-chalk.js";
import {
  assertMathMediaReady,
  MATH_MEDIA_QA_VERSION,
  validateMathMediaFile,
  type MathMediaValidation,
} from "../quality/media-qa.js";
import {
  mathEncodingProfiles,
  type MathEncodingProfileId,
} from "../profiles/profiles.js";
import {
  bindMathFinalAssemblyRequest,
  bindMathRenderResult,
  validateMathFinalAssemblyRequest,
  type MathFinalAssembler,
  type MathRenderResult,
} from "./portable-render-contract.js";
import {
  bindMathPortableScene,
  bindMathRenderPlan,
  bindMathSceneShardRequest,
  bindMathSceneShardResult,
  createMathFragmentEncoding,
  createMathRenderToolchainIdentity,
  mathSceneShardRequestSchema,
  resolveMathJobPath,
  validateMathSceneShardRoundTrip,
  type MathFragmentEncoding,
  type MathFragmentMetadata,
  type MathRenderPlan,
  type MathRenderToolchainIdentity,
  type MathSceneShardExecutor,
} from "./portable-scene-contract.js";
import {
  MATH_REMOTION_RUNNER_VERSION,
  MATH_REVEAL_CUE_VERSION,
} from "./renderer-versions.js";
import {
  conservativeMathSceneCostInputs,
  defaultLocalMathWorkerCapability,
  detectMathCpuSlotBudget,
  estimateMathSceneCost,
  executeMathSceneSchedule,
  scheduleMathScenes,
  type MathWorkerCapability,
} from "./scene-scheduler.js";

export { MATH_REMOTION_RUNNER_VERSION } from "./renderer-versions.js";
export const MATH_THINK_PAUSE_SECONDS = 8;
const MATH_RASTER_BATCH_SIZE = 8;
const MATH_RASTER_CACHE_VERSION = "math-semantic-raster-cache.v2";
const MATH_VIDEO_CACHE_VERSION = "math-semantic-scene-video-cache.v2";
const MATH_RASTER_WORKER_SOURCE = `
import fs from "node:fs/promises";

const [manifestPath, sharpModuleUrl] = process.argv.slice(1);
if (!manifestPath || !sharpModuleUrl) {
  throw new Error("Raster worker requires a manifest path and Sharp module URL.");
}
const { default: sharp } = await import(sharpModuleUrl);
sharp.cache(false);
sharp.concurrency(1);
const jobs = JSON.parse(await fs.readFile(manifestPath, "utf8"));
for (const [index, job] of jobs.entries()) {
  const temporary = \`\${job.targetPath}.\${process.pid}-\${index}.tmp.png\`;
  try {
    await sharp(job.sourcePath, { sequentialRead: true })
      .resize(1920, 1080, { fit: "fill" })
      .png({ compressionLevel: 6 })
      .toFile(temporary);
    await fs.rename(temporary, job.targetPath);
  } finally {
    await fs.unlink(temporary).catch(() => undefined);
  }
}
`;

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

export function createSemanticRasterBatches<
  T extends { readonly sceneId: string },
>(jobs: readonly T[], batchSize = MATH_RASTER_BATCH_SIZE): T[][] {
  if (!Number.isInteger(batchSize) || batchSize <= 0)
    throw new Error("Semantic raster batch size must be a positive integer.");
  const batches: T[][] = [];
  let batch: T[] = [];
  for (const job of jobs) {
    if (
      batch.length >= batchSize ||
      (batch.length > 0 && batch[0]!.sceneId !== job.sceneId)
    ) {
      batches.push(batch);
      batch = [];
    }
    batch.push(job);
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
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

async function sceneProps(
  scenes: readonly MathSceneAsset[],
  frameRanges: readonly {
    sceneId: string;
    startFrame: number;
    endFrame: number;
  }[],
  burnInCaptions: boolean
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
          rendererVersion: MATH_SEMANTIC_CHALK_VERSION,
          activity: "standard" as const,
        },
        ...(burnInCaptions && scene.caption ? { caption: scene.caption } : {}),
      };
    })
  );
}

function semanticRasterStarts(input: {
  readonly svgMarkup: string;
  readonly sceneFrames: number;
  readonly animation: {
    readonly activity: "standard" | "think-pause";
    readonly cues?: readonly {
      readonly factId: string;
      readonly frame: number;
    }[];
  };
}): readonly number[] {
  const steps = extractSemanticChalkSteps(input.svgMarkup);
  const isThinkPause = input.animation.activity === "think-pause";
  const countdownFrames = Math.min(
    MATH_THINK_PAUSE_SECONDS * 30,
    input.sceneFrames
  );
  const countdownStart = input.sceneFrames - countdownFrames;
  const schedule = createSemanticChalkSchedule({
    steps,
    sceneFrames: input.sceneFrames,
    ...(input.animation.cues ? { cues: input.animation.cues } : {}),
    ...(isThinkPause ? { writingEndFrame: countdownStart } : {}),
  });
  const sampledStarts = new Set<number>([0]);
  for (const timing of schedule) {
    const step = steps.find((candidate) => candidate.key === timing.stepKey);
    if (!step)
      throw new Error(
        `Semantic chalk schedule references unknown step ${timing.stepKey}.`
      );
    const sampleCount = semanticChalkStepSampleCount({
      svgMarkup: input.svgMarkup,
      step,
      durationFrames: timing.endFrame - timing.startFrame,
    });
    for (let sample = 0; sample < sampleCount; sample += 1)
      sampledStarts.add(
        Math.floor(
          timing.startFrame +
            ((timing.endFrame - timing.startFrame) * sample) / sampleCount
        )
      );
    sampledStarts.add(timing.endFrame);
  }
  if (isThinkPause)
    for (let frame = countdownStart; frame < input.sceneFrames; frame += 30)
      sampledStarts.add(frame);
  return [...sampledStarts]
    .filter((frame) => frame >= 0 && frame < input.sceneFrames)
    .sort((left, right) => left - right);
}

export function countSemanticRasterSamples(input: {
  readonly svgMarkup: string;
  readonly sceneFrames: number;
  readonly animation: {
    readonly activity: "standard" | "think-pause";
    readonly cues?: readonly {
      readonly factId: string;
      readonly frame: number;
    }[];
  };
}): number {
  return semanticRasterStarts(input).length;
}

export function createMathCacheNamespaces(input: {
  readonly toolchain: MathRenderToolchainIdentity;
  readonly encoding: MathFragmentEncoding;
  readonly sharpVersion: string;
  readonly ffmpegVersion: string;
}): { readonly raster: string; readonly sceneVideo: string } {
  return {
    raster: canonicalHash({
      cacheVersion: MATH_RASTER_CACHE_VERSION,
      rendererVersion: MATH_REMOTION_RUNNER_VERSION,
      semanticChalkVersion: MATH_SEMANTIC_CHALK_VERSION,
      workerImageId: input.toolchain.workerImageId,
      sharpVersion: input.sharpVersion,
      width: input.encoding.width,
      height: input.encoding.height,
      format: "png",
    }),
    sceneVideo: canonicalHash({
      cacheVersion: MATH_VIDEO_CACHE_VERSION,
      rendererVersion: MATH_REMOTION_RUNNER_VERSION,
      workerImageId: input.toolchain.workerImageId,
      ffmpegVersion: input.ffmpegVersion,
      encoding: input.encoding,
    }),
  };
}

let localFfmpegVersionPromise: Promise<string> | undefined;

async function localFfmpegVersion(signal?: AbortSignal): Promise<string> {
  localFfmpegVersionPromise ??= runCommand("ffmpeg", ["-version"], {
    timeoutMs: 30_000,
    ...(signal ? { signal } : {}),
  }).then(
    ({ stdout }) =>
      stdout.split(/\r?\n/u)[0]?.trim() ?? "ffmpeg-version-unavailable"
  );
  return localFfmpegVersionPromise;
}

async function writeAtomicJson(
  filePath: string,
  value: unknown
): Promise<void> {
  const temporary = `${filePath}.${process.pid}-${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value)}\n`, "utf8");
    await fs.rename(temporary, filePath);
  } finally {
    await fs.unlink(temporary).catch(() => undefined);
  }
}

async function validRasterCacheEntry(input: {
  readonly filePath: string;
  readonly metadataPath: string;
  readonly namespace: string;
  readonly svgHash: string;
}): Promise<boolean> {
  try {
    const [metadata, stat, image, sha256] = await Promise.all([
      fs
        .readFile(input.metadataPath, "utf8")
        .then((raw) => JSON.parse(raw) as Record<string, unknown>),
      fs.stat(input.filePath),
      sharp(input.filePath).metadata(),
      hashFile(input.filePath),
    ]);
    return (
      metadata["version"] === "math-raster-cache-entry.v1" &&
      metadata["namespace"] === input.namespace &&
      metadata["svgHash"] === input.svgHash &&
      metadata["byteLength"] === stat.size &&
      metadata["sha256"] === sha256 &&
      stat.isFile() &&
      stat.size > 0 &&
      image.width === 1920 &&
      image.height === 1080
    );
  } catch {
    return false;
  }
}

async function inspectSilentSceneVideo(input: {
  readonly filePath: string;
  readonly expectedFrameCount: number;
  readonly encoding: MathFragmentEncoding;
  readonly signal?: AbortSignal;
}): Promise<{
  readonly stat: Awaited<ReturnType<typeof fs.stat>>;
  readonly sha256: string;
  readonly codecProfile: string;
  readonly timeBase: string;
}> {
  const [probe, stat, sha256, decode] = await Promise.all([
    runCommandJson(
      "ffprobe",
      [
        "-v",
        "error",
        "-count_frames",
        "-show_streams",
        "-print_format",
        "json",
        input.filePath,
      ],
      {
        timeoutMs: 120_000,
        ...(input.signal ? { signal: input.signal } : {}),
      },
      (raw) => fragmentProbeSchema.parse(raw)
    ),
    fs.stat(input.filePath),
    hashFile(input.filePath),
    runCommand(
      "ffmpeg",
      ["-v", "error", "-i", input.filePath, "-map", "0:v:0", "-f", "null", "-"],
      {
        timeoutMs: 120_000,
        allowNonZeroExit: true,
        ...(input.signal ? { signal: input.signal } : {}),
      }
    ),
  ]);
  const videos = probe.streams.filter(
    (stream) => stream.codec_type === "video"
  );
  const audioStreamCount = probe.streams.filter(
    (stream) => stream.codec_type === "audio"
  ).length;
  const video = videos[0];
  const frameCount = Number(video?.nb_read_frames ?? "NaN");
  const fps = parseFraction(video?.avg_frame_rate);
  if (
    !stat.isFile() ||
    stat.size <= 0 ||
    videos.length !== 1 ||
    audioStreamCount !== 0 ||
    video?.codec_name !== input.encoding.codec ||
    video.width !== input.encoding.width ||
    video.height !== input.encoding.height ||
    video.pix_fmt !== input.encoding.pixelFormat ||
    Math.abs(fps - input.encoding.fps) > 0.001 ||
    !Number.isInteger(frameCount) ||
    frameCount !== input.expectedFrameCount ||
    !video.profile ||
    !video.time_base ||
    decode.exitCode !== 0 ||
    decode.stderr.trim().length > 0
  )
    throw new Error("Silent scene cache media metadata is incompatible.");
  return {
    stat,
    sha256,
    codecProfile: video.profile,
    timeBase: video.time_base,
  };
}

async function validVideoCacheEntry(input: {
  readonly filePath: string;
  readonly metadataPath: string;
  readonly namespace: string;
  readonly cacheKey: string;
  readonly expectedFrameCount: number;
  readonly encoding: MathFragmentEncoding;
  readonly signal?: AbortSignal;
}): Promise<boolean> {
  try {
    const [metadata, inspected] = await Promise.all([
      fs
        .readFile(input.metadataPath, "utf8")
        .then((raw) => JSON.parse(raw) as Record<string, unknown>),
      inspectSilentSceneVideo(input),
    ]);
    return (
      metadata["version"] === "math-video-cache-entry.v1" &&
      metadata["namespace"] === input.namespace &&
      metadata["cacheKey"] === input.cacheKey &&
      metadata["byteLength"] === inspected.stat.size &&
      metadata["sha256"] === inspected.sha256 &&
      metadata["expectedFrameCount"] === input.expectedFrameCount &&
      metadata["encodingHash"] === canonicalHash(input.encoding)
    );
  } catch {
    return false;
  }
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
  burnInCaptions: boolean;
  encodingProfile: MathEncodingProfileId;
  cacheRoot: string;
  toolchain: MathRenderToolchainIdentity;
  ffmpegThreads: number;
  workerId: string;
  predictedCostMs: number;
  queueWaitMs: number;
  peakActiveWork: number;
  signal?: AbortSignal;
}): Promise<{
  rendererHash: string;
  cacheHitCount: number;
  cacheMissCount: number;
  phases: {
    readonly svgGenerationMs: number;
    readonly rasterizationMs: number;
    readonly sceneEncodingMs: number;
  };
  cache: {
    readonly rasterHits: number;
    readonly rasterMisses: number;
    readonly videoHits: number;
    readonly videoMisses: number;
  };
}> {
  const keyframesRoot = path.join(input.workDir, "semantic-keyframes");
  const encoding = mathEncodingProfiles[input.encodingProfile];
  const encodingIdentity = createMathFragmentEncoding(input.encodingProfile);
  const namespaces = createMathCacheNamespaces({
    toolchain: input.toolchain,
    encoding: encodingIdentity,
    sharpVersion: sharp.versions.sharp,
    ffmpegVersion: await localFfmpegVersion(input.signal),
  });
  const rasterCacheRoot = path.join(
    input.cacheRoot,
    "semantic-raster",
    namespaces.raster
  );
  const videoCacheRoot = path.join(
    input.cacheRoot,
    "semantic-video",
    namespaces.sceneVideo
  );
  const svgStartedAt = Date.now();
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
    const starts = semanticRasterStarts({
      svgMarkup: scene.svgMarkup,
      sceneFrames,
      animation: {
        activity: scene.animation.activity ?? "standard",
        ...(scene.animation.cues ? { cues: scene.animation.cues } : {}),
      },
    });
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
        input.burnInCaptions ? source.caption : undefined,
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
  const svgGenerationMs = Math.max(0, Date.now() - svgStartedAt);
  const rasterEntries = entries.map((entry) => ({
    ...entry,
    filePath: path.join(rasterCacheRoot, `${entry.svgHash}.png`),
    metadataPath: path.join(rasterCacheRoot, `${entry.svgHash}.json`),
  }));
  const rasterJobs = [
    ...new Map(
      rasterEntries.map((entry, index) => [
        entry.svgHash,
        { rasterEntry: entry, svgEntry: entries[index]! },
      ])
    ).values(),
  ];
  const completedHashes = new Set<string>();
  const pendingRasterJobs: typeof rasterJobs = [];
  for (const job of rasterJobs) {
    if (
      await validRasterCacheEntry({
        filePath: job.rasterEntry.filePath,
        metadataPath: job.rasterEntry.metadataPath,
        namespace: namespaces.raster,
        svgHash: job.rasterEntry.svgHash,
      })
    )
      completedHashes.add(job.rasterEntry.svgHash);
    else {
      await Promise.all([
        fs.unlink(job.rasterEntry.filePath).catch(() => undefined),
        fs.unlink(job.rasterEntry.metadataPath).catch(() => undefined),
      ]);
      pendingRasterJobs.push(job);
    }
  }
  const rasterCacheHitCount = completedHashes.size;
  const rasterStartedAt = Date.now();
  const progressPath = path.join(
    input.workDir,
    "semantic-raster-progress.json"
  );
  const batchManifestPath = path.join(
    keyframesRoot,
    "semantic-raster-batch.json"
  );
  const writeRasterProgress = async (args: {
    state: "in-progress" | "complete";
    currentSceneId: string | null;
  }): Promise<void> => {
    const scenes = input.frameRanges.map(({ sceneId }) => {
      const sceneJobs = rasterJobs.filter(
        (job) => job.rasterEntry.sceneId === sceneId
      );
      return {
        sceneId,
        completed: sceneJobs.filter((job) =>
          completedHashes.has(job.rasterEntry.svgHash)
        ).length,
        total: sceneJobs.length,
      };
    });
    const temporary = `${progressPath}.${process.pid}.tmp`;
    await fs.writeFile(
      temporary,
      `${JSON.stringify(
        {
          version: "math-semantic-raster-progress.v1",
          runnerVersion: MATH_REMOTION_RUNNER_VERSION,
          state: args.state,
          total: rasterJobs.length,
          completed: completedHashes.size,
          remaining: rasterJobs.length - completedHashes.size,
          currentSceneId: args.currentSceneId,
          assignedWorker: input.workerId,
          predictedCostMs: input.predictedCostMs,
          activeWorkers: args.state === "in-progress" ? 1 : 0,
          cache: {
            rasterHits: rasterCacheHitCount,
            rasterMisses: pendingRasterJobs.length,
          },
          peakActiveWork: input.peakActiveWork,
          scenes,
          updatedAt: new Date().toISOString(),
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    await fs.rename(temporary, progressPath);
  };
  await writeRasterProgress({
    state: pendingRasterJobs.length === 0 ? "complete" : "in-progress",
    currentSceneId: pendingRasterJobs[0]?.rasterEntry.sceneId ?? null,
  });
  const batches = createSemanticRasterBatches(
    pendingRasterJobs.map((job) => ({
      ...job,
      sceneId: job.rasterEntry.sceneId,
    }))
  );
  const sharpModuleUrl = pathToFileURL(
    createRequire(import.meta.url).resolve("sharp")
  ).href;
  for (const batch of batches) {
    if (input.signal?.aborted)
      throw input.signal.reason ?? new Error("Math render cancelled.");
    const temporaryRasters = batch.map((job) => ({
      job,
      filePath: `${job.rasterEntry.filePath}.${process.pid}.tmp.png`,
    }));
    await fs.writeFile(
      batchManifestPath,
      `${JSON.stringify(
        temporaryRasters.map(({ job, filePath }) => ({
          sourcePath: job.svgEntry.filePath,
          targetPath: filePath,
        }))
      )}\n`,
      "utf8"
    );
    try {
      await runCommand(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          MATH_RASTER_WORKER_SOURCE,
          batchManifestPath,
          sharpModuleUrl,
        ],
        {
          timeoutMs: 120_000,
          ...(input.signal ? { signal: input.signal } : {}),
        }
      );
      for (const { job, filePath } of temporaryRasters) {
        const [metadata, stat, sha256] = await Promise.all([
          sharp(filePath).metadata(),
          fs.stat(filePath),
          hashFile(filePath),
        ]);
        if (
          !stat.isFile() ||
          stat.size <= 0 ||
          metadata.width !== 1920 ||
          metadata.height !== 1080
        )
          throw new Error(
            `Semantic raster worker produced an invalid checkpoint for ${job.rasterEntry.sceneId}.`
          );
        await fs.rename(filePath, job.rasterEntry.filePath);
        await writeAtomicJson(job.rasterEntry.metadataPath, {
          version: "math-raster-cache-entry.v1",
          namespace: namespaces.raster,
          svgHash: job.rasterEntry.svgHash,
          byteLength: stat.size,
          sha256,
        });
        completedHashes.add(job.rasterEntry.svgHash);
      }
    } finally {
      await Promise.all(
        temporaryRasters.map(({ filePath }) =>
          fs.unlink(filePath).catch(() => undefined)
        )
      );
    }
    await writeRasterProgress({
      state:
        completedHashes.size === rasterJobs.length ? "complete" : "in-progress",
      currentSceneId:
        completedHashes.size === rasterJobs.length
          ? null
          : batch.at(-1)!.sceneId,
    });
  }
  const rasterizationMs = Math.max(0, Date.now() - rasterStartedAt);
  for (const entry of rasterEntries) await fs.access(entry.filePath);
  const sceneVideos: Array<{
    sceneId: string;
    filePath: string;
    cacheKey: string;
    frames: number;
  }> = [];
  let videoCacheHitCount = 0;
  let videoCacheMissCount = 0;
  const encodingStartedAt = Date.now();
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
        renderer: MATH_VIDEO_CACHE_VERSION,
        namespace: namespaces.sceneVideo,
        sceneId: frameRange.sceneId,
        frames: sceneEntries.map((entry) => ({
          svgHash: entry.svgHash,
          frames: entry.frames,
        })),
        encoding: encodingIdentity,
      })
    );
    const cachedVideo = path.join(videoCacheRoot, `${cacheKey}.mp4`);
    const videoMetadataPath = path.join(videoCacheRoot, `${cacheKey}.json`);
    const cacheHit = await validVideoCacheEntry({
      filePath: cachedVideo,
      metadataPath: videoMetadataPath,
      namespace: namespaces.sceneVideo,
      cacheKey,
      expectedFrameCount: sceneFrames,
      encoding: encodingIdentity,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    if (cacheHit) videoCacheHitCount += 1;
    else {
      videoCacheMissCount += 1;
      await Promise.all([
        fs.unlink(cachedVideo).catch(() => undefined),
        fs.unlink(videoMetadataPath).catch(() => undefined),
      ]);
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
            encoding.preset,
            "-crf",
            String(encoding.crf),
            "-tune",
            "stillimage",
            "-threads",
            String(input.ffmpegThreads),
            temporary,
          ],
          {
            timeoutMs: 300_000,
            ...(input.signal ? { signal: input.signal } : {}),
          }
        );
        const inspected = await inspectSilentSceneVideo({
          filePath: temporary,
          expectedFrameCount: sceneFrames,
          encoding: encodingIdentity,
          ...(input.signal ? { signal: input.signal } : {}),
        });
        await fs.rename(temporary, cachedVideo);
        await writeAtomicJson(videoMetadataPath, {
          version: "math-video-cache-entry.v1",
          namespace: namespaces.sceneVideo,
          cacheKey,
          byteLength: inspected.stat.size,
          sha256: inspected.sha256,
          expectedFrameCount: sceneFrames,
          encodingHash: canonicalHash(encodingIdentity),
        });
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
  const sceneEncodingMs = Math.max(0, Date.now() - encodingStartedAt);
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
      {
        timeoutMs: 60_000,
        ...(input.signal ? { signal: input.signal } : {}),
      }
    );
    await fs.rename(temporarySilent, input.silentPath);
  } finally {
    await fs.unlink(temporarySilent).catch(() => undefined);
  }
  return {
    rendererHash: hashText(
      JSON.stringify({
        renderer: "math-semantic-keyframe-sharp-segmented.v4",
        scenes: sceneVideos.map((scene) => ({
          sceneId: scene.sceneId,
          cacheKey: scene.cacheKey,
          frames: scene.frames,
        })),
      })
    ),
    cacheHitCount: rasterCacheHitCount + videoCacheHitCount,
    cacheMissCount: pendingRasterJobs.length + videoCacheMissCount,
    phases: {
      svgGenerationMs,
      rasterizationMs,
      sceneEncodingMs,
    },
    cache: {
      rasterHits: rasterCacheHitCount,
      rasterMisses: pendingRasterJobs.length,
      videoHits: videoCacheHitCount,
      videoMisses: videoCacheMissCount,
    },
  };
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

function createMathAudioTreatment(
  scenes: readonly Pick<MathSceneAsset, "sceneId" | "animation">[],
  frameRanges: readonly {
    readonly sceneId: string;
    readonly startFrame: number;
    readonly endFrame: number;
  }[]
): {
  readonly thinkPauseRangesSeconds: readonly {
    readonly start: number;
    readonly end: number;
  }[];
  readonly revealCueSeconds: number | null;
  readonly version: typeof MATH_REVEAL_CUE_VERSION;
} {
  const thinkPauseRangesSeconds = scenes.flatMap((scene, index) => {
    if (scene.animation?.activity !== "think-pause") return [];
    const range = frameRanges[index];
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
  const thinkPauseIndex = scenes.findIndex(
    (scene) => scene.animation?.activity === "think-pause"
  );
  const revealRange =
    thinkPauseIndex >= 0 ? frameRanges[thinkPauseIndex + 1] : undefined;
  return {
    thinkPauseRangesSeconds,
    revealCueSeconds: revealRange ? revealRange.startFrame / 30 : null,
    version: MATH_REVEAL_CUE_VERSION,
  };
}

async function muxMathNarration(input: {
  readonly silentPath: string;
  readonly audioPath: string;
  readonly outputPath: string;
  readonly workDir: string;
  readonly audioTreatment: ReturnType<typeof createMathAudioTreatment>;
  readonly encodingProfile: MathEncodingProfileId;
}): Promise<void> {
  const muxedPath = path.join(
    path.dirname(input.outputPath),
    `${path.basename(input.outputPath)}.${process.pid}.tmp.mp4`
  );
  try {
    const revealCuePath =
      input.audioTreatment.revealCueSeconds === null
        ? null
        : await createRevealCue(input.workDir);
    const silenceExpression = input.audioTreatment.thinkPauseRangesSeconds
      .map(
        (range) =>
          `between(t,${range.start.toFixed(6)},${range.end.toFixed(6)})`
      )
      .join("+");
    const narrationFilter =
      input.audioTreatment.thinkPauseRangesSeconds.length === 0
        ? null
        : `[1:a]aresample=48000,volume=0:enable='${silenceExpression}'`;
    const audioFilter =
      narrationFilter === null
        ? null
        : revealCuePath === null ||
            input.audioTreatment.revealCueSeconds === null
          ? `${narrationFilter}[aout]`
          : `${narrationFilter}[narration];[2:a]adelay=${Math.round(
              input.audioTreatment.revealCueSeconds * 1000
            )}|${Math.round(
              input.audioTreatment.revealCueSeconds * 1000
            )}[cue];[narration][cue]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[aout]`;
    await runCommand(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        input.silentPath,
        "-i",
        input.audioPath,
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
        "-b:a",
        mathEncodingProfiles[input.encodingProfile].audioBitrate,
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
    await fs.rename(muxedPath, input.outputPath);
  } finally {
    await fs.unlink(muxedPath).catch(() => undefined);
  }
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
  /** Debug/review only. Production captions are emitted as separate tracks. */
  burnInCaptions?: boolean;
  encodingProfile?: MathEncodingProfileId;
  cacheRoot?: string;
  cpuSlotBudget?: number;
  signal?: AbortSignal;
}): Promise<{
  validation: MathMediaValidation;
  renderFingerprint: string;
  cacheHitCount: number;
  cacheMissCount: number;
}> {
  if (!Number.isInteger(args.durationInFrames) || args.durationInFrames <= 0)
    throw new Error(
      "Remotion duration must contain a positive whole number of frames."
    );
  const workDir = path.resolve(args.workDir);
  const outputPath = path.resolve(args.outputPath);
  const cpuSlotBudget = args.cpuSlotBudget ?? (await detectMathCpuSlotBudget());
  if (!Number.isInteger(cpuSlotBudget) || cpuSlotBudget <= 0)
    throw new Error("Math render CPU-slot budget must be a positive integer.");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const burnInCaptions = args.burnInCaptions ?? false;
  const encodingProfile = args.encodingProfile ?? "publish";
  const props = await sceneProps(args.scenes, args.frameRanges, burnInCaptions);
  const silentPath = path.join(workDir, "silent.mp4");
  const renderer = await renderSemanticKeyframes({
    props,
    scenes: args.scenes,
    frameRanges: args.frameRanges,
    workDir,
    silentPath,
    durationInFrames: args.durationInFrames,
    burnInCaptions,
    encodingProfile,
    cacheRoot: path.resolve(
      args.cacheRoot ?? path.join(path.dirname(workDir), ".math-render-cache")
    ),
    toolchain: createMathRenderToolchainIdentity(),
    ffmpegThreads: cpuSlotBudget,
    workerId: "local",
    predictedCostMs: 0,
    queueWaitMs: 0,
    peakActiveWork: 1,
    ...(args.signal ? { signal: args.signal } : {}),
  });
  const audioTreatment = createMathAudioTreatment(
    args.scenes,
    args.frameRanges
  );
  const renderFingerprint = createRemotionRenderFingerprint({
    durationInFrames: args.durationInFrames,
    sceneHashes: args.scenes.map((scene) => scene.svgHash),
    frameRanges: args.frameRanges,
    audioHash: await hashFile(args.audioPath),
    bundleHash: renderer.rendererHash,
    audioTreatment,
  });
  await muxMathNarration({
    silentPath,
    audioPath: args.audioPath,
    outputPath,
    workDir,
    audioTreatment,
    encodingProfile,
  });
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
  return {
    validation,
    renderFingerprint,
    cacheHitCount: renderer.cacheHitCount,
    cacheMissCount: renderer.cacheMissCount,
  };
}

const fragmentProbeSchema = z.looseObject({
  streams: z.array(
    z.looseObject({
      codec_type: z.string().optional(),
      codec_name: z.string().optional(),
      profile: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      pix_fmt: z.string().optional(),
      avg_frame_rate: z.string().optional(),
      time_base: z.string().optional(),
      nb_read_frames: z.string().optional(),
    })
  ),
});

function parseFraction(value: string | undefined): number {
  const [numerator = "0", denominator = "1"] = (value ?? "0/1").split("/");
  const parsedNumerator = Number(numerator);
  const parsedDenominator = Number(denominator);
  return parsedDenominator > 0 &&
    Number.isFinite(parsedNumerator) &&
    Number.isFinite(parsedDenominator)
    ? parsedNumerator / parsedDenominator
    : 0;
}

async function inspectMathSceneFragment(input: {
  readonly filePath: string;
  readonly scene: MathRenderPlan["scenes"][number];
  readonly renderDurationMs: number;
  readonly cacheHitCount: number;
  readonly cacheMissCount: number;
  readonly execution?: NonNullable<MathFragmentMetadata["execution"]>;
  readonly signal?: AbortSignal;
}): Promise<MathFragmentMetadata> {
  const inspected = await inspectSilentSceneVideo({
    filePath: input.filePath,
    expectedFrameCount: input.scene.expectedFrameCount,
    encoding: input.scene.encoding,
    ...(input.signal ? { signal: input.signal } : {}),
  }).catch((error) => {
    throw new Error(
      `Scene fragment media metadata is incompatible for ${input.scene.sceneId}.`,
      { cause: error }
    );
  });
  return {
    sceneId: input.scene.sceneId,
    order: input.scene.order,
    sceneHash: input.scene.sceneHash,
    svgHash: input.scene.svgHash,
    relativePath: input.scene.fragmentRelativePath,
    sha256: inspected.sha256,
    byteLength: Number(inspected.stat.size),
    frameCount: input.scene.expectedFrameCount,
    width: 1920,
    height: 1080,
    fps: 30,
    pixelFormat: "yuv420p",
    codec: "h264",
    codecProfile: inspected.codecProfile,
    timeBase: inspected.timeBase,
    audioStreamCount: 0,
    encoding: input.scene.encoding,
    toolchain: input.scene.toolchain,
    renderDurationMs: input.renderDurationMs,
    cacheHitCount: input.cacheHitCount,
    cacheMissCount: input.cacheMissCount,
    ...(input.execution ? { execution: input.execution } : {}),
  };
}

export async function validateMathSceneFragmentFile(input: {
  readonly filePath: string;
  readonly scene: MathRenderPlan["scenes"][number];
  readonly renderDurationMs: number;
  readonly cacheHitCount: number;
  readonly cacheMissCount: number;
  readonly execution?: NonNullable<MathFragmentMetadata["execution"]>;
  readonly signal?: AbortSignal;
}): Promise<MathFragmentMetadata> {
  return inspectMathSceneFragment(input);
}

function portablePathFromJobRoot(
  jobRoot: string,
  absolutePath: string
): string {
  const root = path.resolve(jobRoot);
  const resolved = path.resolve(absolutePath);
  const relative = path.relative(root, resolved).split(path.sep).join("/");
  resolveMathJobPath(root, relative);
  return relative;
}

function commonMathJobRoot(absolutePaths: readonly string[]): string {
  const resolved = absolutePaths.map((value) => path.resolve(value));
  let candidate = path.dirname(resolved[0]!);
  while (
    resolved.some((value) => {
      const relation = path.relative(candidate, value);
      return relation.startsWith("..") || path.isAbsolute(relation);
    })
  ) {
    const parent = path.dirname(candidate);
    if (parent === candidate)
      throw new Error(
        "Math render inputs do not share a contained non-root job directory."
      );
    candidate = parent;
  }
  if (path.dirname(candidate) === candidate)
    throw new Error("Math render job root cannot be a filesystem root.");
  return candidate;
}

export function createProviderFreeMathRenderPlan(input: {
  readonly jobRoot: string;
  readonly id: string;
  readonly durationInFrames: number;
  readonly scenes: readonly MathSceneAsset[];
  readonly frameRanges: readonly {
    readonly sceneId: string;
    readonly startFrame: number;
    readonly endFrame: number;
  }[];
  readonly workDir: string;
  readonly encodingProfile?: MathEncodingProfileId;
  readonly toolchainImageId?: string;
}): MathRenderPlan {
  if (input.scenes.length !== 9 || input.frameRanges.length !== 9)
    throw new Error("Portable math render plans require exactly nine scenes.");
  const encoding = createMathFragmentEncoding(
    input.encodingProfile ?? "publish"
  );
  const toolchain = input.toolchainImageId
    ? createMathRenderToolchainIdentity(input.toolchainImageId)
    : createMathRenderToolchainIdentity();
  const workRelativePath = portablePathFromJobRoot(
    input.jobRoot,
    input.workDir
  );
  const scenes = input.scenes.map((scene, index) => {
    const range = input.frameRanges[index];
    if (!range || range.sceneId !== scene.sceneId)
      throw new Error(
        `Portable render scene order mismatch at ${scene.sceneId}.`
      );
    return bindMathPortableScene({
      sceneId: scene.sceneId,
      order: index,
      startFrame: range.startFrame,
      endFrame: range.endFrame,
      expectedFrameCount: range.endFrame - range.startFrame,
      svgRelativePath: portablePathFromJobRoot(input.jobRoot, scene.svgPath),
      svgHash: scene.svgHash,
      minimumGlyphPx: scene.minimumGlyphPx,
      bounds: scene.bounds,
      animation: {
        mode: "progressive-chalk-reveal",
        rendererVersion: MATH_SEMANTIC_CHALK_VERSION,
        cues: scene.animation?.cues ?? [],
        activity: scene.animation?.activity ?? "standard",
      },
      ...(scene.caption ? { caption: scene.caption } : {}),
      fragmentRelativePath: `${workRelativePath}/fragments/${scene.sceneId}.mp4`,
      encoding,
      toolchain,
    });
  });
  return bindMathRenderPlan({
    artifactVersion: "math-render-plan.v1",
    jobId: input.id,
    compositionId: input.id,
    durationInFrames: input.durationInFrames,
    scenes,
  });
}

export function createLocalMathSceneShardExecutor(
  options: {
    readonly cacheRoot?: string;
    readonly cpuSlotBudget?: number;
    readonly capability?: MathWorkerCapability;
    readonly signal?: AbortSignal;
    readonly activeWorkTracker?: { active: number; peak: number };
  } = {}
): MathSceneShardExecutor {
  return {
    async execute(rawRequest, context) {
      const request = mathSceneShardRequestSchema.parse(rawRequest);
      const signals = [options.signal, context.signal].filter(
        (signal): signal is AbortSignal => signal !== undefined
      );
      const signal =
        signals.length === 0
          ? undefined
          : signals.length === 1
            ? signals[0]
            : AbortSignal.any(signals);
      const prepared: Array<{
        readonly scene: MathRenderPlan["scenes"][number];
        readonly svgPath: string;
        readonly fragmentPath: string;
        readonly semanticRasterSampleCount: number;
      }> = [];
      for (const scene of request.scenes) {
        const svgPath = resolveMathJobPath(
          context.jobRoot,
          scene.svgRelativePath
        );
        if ((await hashFile(svgPath)) !== scene.svgHash)
          throw new Error(`Semantic SVG hash mismatch: ${scene.sceneId}`);
        const svgMarkup = await fs.readFile(svgPath, "utf8");
        prepared.push({
          scene,
          svgPath,
          fragmentPath: resolveMathJobPath(
            context.jobRoot,
            scene.fragmentRelativePath
          ),
          semanticRasterSampleCount: countSemanticRasterSamples({
            svgMarkup,
            sceneFrames: scene.expectedFrameCount,
            animation: scene.animation,
          }),
        });
      }
      const cpuSlots =
        options.capability?.cpuSlots ??
        options.cpuSlotBudget ??
        (await detectMathCpuSlotBudget());
      if (!Number.isInteger(cpuSlots) || cpuSlots <= 0)
        throw new Error(
          "Math render CPU-slot budget must be a positive integer."
        );
      const worker =
        options.capability ??
        defaultLocalMathWorkerCapability({
          workerImageId: request.scenes[0]!.toolchain.workerImageId,
          cpuSlots,
        });
      if (
        request.scenes.some(
          (scene) => scene.toolchain.workerImageId !== worker.workerImageId
        )
      )
        throw new Error(
          "Math scene is incompatible with the local worker image."
        );
      const inputs = prepared.map((item) => ({
        scene: item.scene,
        costsByWorkerId: {
          [worker.workerId]: estimateMathSceneCost(
            conservativeMathSceneCostInputs(
              item.scene,
              item.semanticRasterSampleCount
            ),
            worker
          ),
        },
      }));
      const assignments = scheduleMathScenes(inputs, [worker]);
      const cacheRoot = path.resolve(
        options.cacheRoot ?? path.join(context.jobRoot, ".math-render-cache")
      );
      const scheduledAt = Date.now();
      const activeWorkTracker = options.activeWorkTracker ?? {
        active: 0,
        peak: 0,
      };
      const execution = await executeMathSceneSchedule({
        assignments,
        ...(signal ? { signal } : {}),
        execute: async (assignment, executionSignal) => {
          const item = prepared.find(
            (candidate) => candidate.scene.sceneId === assignment.scene.sceneId
          )!;
          const queueWaitMs = Math.max(0, Date.now() - scheduledAt);
          activeWorkTracker.active += 1;
          activeWorkTracker.peak = Math.max(
            activeWorkTracker.peak,
            activeWorkTracker.active
          );
          const startedAt = Date.now();
          try {
            const sceneWorkDir = resolveMathJobPath(
              context.jobRoot,
              `${request.workRelativePath}/${item.scene.sceneId}`
            );
            await fs.mkdir(path.dirname(item.fragmentPath), {
              recursive: true,
            });
            const sceneAsset: MathSceneAsset = {
              sceneId: item.scene.sceneId,
              svgPath: item.svgPath,
              svgHash: item.scene.svgHash,
              minimumGlyphPx: item.scene.minimumGlyphPx,
              bounds: item.scene.bounds,
              ...(item.scene.caption ? { caption: item.scene.caption } : {}),
              animation: item.scene.animation,
            };
            const props = await sceneProps(
              [sceneAsset],
              [
                {
                  sceneId: item.scene.sceneId,
                  startFrame: item.scene.startFrame,
                  endFrame: item.scene.endFrame,
                },
              ],
              false
            );
            const rendered = await renderSemanticKeyframes({
              props,
              scenes: [sceneAsset],
              frameRanges: [
                {
                  sceneId: item.scene.sceneId,
                  startFrame: item.scene.startFrame,
                  endFrame: item.scene.endFrame,
                },
              ],
              workDir: sceneWorkDir,
              silentPath: item.fragmentPath,
              durationInFrames: item.scene.expectedFrameCount,
              burnInCaptions: false,
              encodingProfile: item.scene.encoding.profileId,
              cacheRoot,
              toolchain: item.scene.toolchain,
              ffmpegThreads: 1,
              workerId: worker.workerId,
              predictedCostMs: assignment.predictedCost.totalMs,
              queueWaitMs,
              peakActiveWork: activeWorkTracker.peak,
              signal: executionSignal,
            });
            const validationStartedAt = Date.now();
            const fragment = await inspectMathSceneFragment({
              filePath: item.fragmentPath,
              scene: item.scene,
              renderDurationMs: 0,
              cacheHitCount: rendered.cacheHitCount,
              cacheMissCount: rendered.cacheMissCount,
              signal: executionSignal,
            });
            const validationMs = Math.max(0, Date.now() - validationStartedAt);
            const actualCostMs = Math.max(0, Date.now() - startedAt);
            return {
              ...fragment,
              renderDurationMs: actualCostMs,
              execution: {
                workerId: worker.workerId,
                predictedCostMs: assignment.predictedCost.totalMs,
                actualCostMs,
                queueWaitMs,
                peakActiveWork: activeWorkTracker.peak,
                phases: {
                  ...rendered.phases,
                  validationMs,
                },
                cache: rendered.cache,
              },
            };
          } finally {
            activeWorkTracker.active -= 1;
          }
        },
      });
      const fragments = execution.orderedResults.map((fragment) =>
        fragment.execution
          ? {
              ...fragment,
              execution: {
                ...fragment.execution,
                peakActiveWork: Math.max(
                  execution.peakActiveWork,
                  activeWorkTracker.peak
                ),
              },
            }
          : fragment
      );
      const result = bindMathSceneShardResult({
        artifactVersion: "math-scene-shard-result.v1",
        jobId: request.jobId,
        planHash: request.planHash,
        assignmentId: request.assignmentId,
        requestHash: request.requestHash,
        fragments,
      });
      return validateMathSceneShardRoundTrip(request, result).result;
    },
  };
}

export function createLocalMathFinalAssembler(): MathFinalAssembler {
  return {
    async assemble(rawRequest, context): Promise<MathRenderResult> {
      const request = validateMathFinalAssemblyRequest(rawRequest);
      const orderedFragments = request.shards.flatMap(
        ({ result }) => result.fragments
      );
      const narrationPath = resolveMathJobPath(
        context.jobRoot,
        request.narrationRelativePath
      );
      const outputPath = resolveMathJobPath(
        context.jobRoot,
        request.outputRelativePath
      );
      const workDir = resolveMathJobPath(
        context.jobRoot,
        request.workRelativePath
      );
      if ((await hashFile(narrationPath)) !== request.narrationSha256)
        throw new Error("Final assembly narration hash does not match.");
      for (const [index, fragment] of orderedFragments.entries()) {
        const scene = request.plan.scenes[index]!;
        const filePath = resolveMathJobPath(
          context.jobRoot,
          fragment.relativePath
        );
        const stat = await fs.stat(filePath);
        if (
          !stat.isFile() ||
          stat.size !== fragment.byteLength ||
          (await hashFile(filePath)) !== fragment.sha256
        )
          throw new Error(
            `Scene fragment hash or byte length is invalid: ${fragment.sceneId}.`
          );
        const inspected = await inspectMathSceneFragment({
          filePath,
          scene,
          renderDurationMs: fragment.renderDurationMs,
          cacheHitCount: fragment.cacheHitCount,
          cacheMissCount: fragment.cacheMissCount,
          ...(fragment.execution ? { execution: fragment.execution } : {}),
        });
        if (
          canonicalHash(inspected) !== canonicalHash(fragment) ||
          inspected.audioStreamCount !== 0
        )
          throw new Error(
            `Scene fragment validated metadata is invalid: ${fragment.sceneId}.`
          );
      }
      const startedAt = Date.now();
      await Promise.all([
        fs.mkdir(workDir, { recursive: true }),
        fs.mkdir(path.dirname(outputPath), { recursive: true }),
      ]);
      const concatFile = path.join(workDir, "portable-scenes.ffconcat");
      const silentPath = path.join(workDir, "portable-silent.mp4");
      await fs.writeFile(
        concatFile,
        `${[
          "ffconcat version 1.0",
          ...orderedFragments.map(
            (fragment) =>
              `file '${concatPath(
                resolveMathJobPath(context.jobRoot, fragment.relativePath)
              )}'`
          ),
        ].join("\n")}\n`,
        "utf8"
      );
      const temporarySilent = `${silentPath}.${process.pid}.tmp.mp4`;
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
        await fs.rename(temporarySilent, silentPath);
      } finally {
        await fs.unlink(temporarySilent).catch(() => undefined);
      }
      const audioTreatment = createMathAudioTreatment(
        request.plan.scenes,
        request.plan.scenes
      );
      const encodingProfile = request.plan.scenes[0]!.encoding.profileId;
      const bundleHash = canonicalHash({
        runnerVersion: MATH_REMOTION_RUNNER_VERSION,
        assignments: request.shards.map((shard) => shard.request.assignmentId),
        fragments: orderedFragments.map((fragment) => ({
          sceneId: fragment.sceneId,
          sha256: fragment.sha256,
          sceneHash: fragment.sceneHash,
          toolchain: fragment.toolchain,
          encoding: fragment.encoding,
        })),
      });
      const renderFingerprint = createRemotionRenderFingerprint({
        durationInFrames: request.plan.durationInFrames,
        sceneHashes: request.plan.scenes.map((scene) => scene.svgHash),
        frameRanges: request.plan.scenes,
        audioHash: request.narrationSha256,
        bundleHash,
        audioTreatment,
      });
      await muxMathNarration({
        silentPath,
        audioPath: narrationPath,
        outputPath,
        workDir,
        audioTreatment,
        encodingProfile,
      });
      const expectedDurationSeconds = request.plan.durationInFrames / 30;
      const validation = await validateMathMediaFile(outputPath, {
        minimumDurationSeconds: 180,
        maximumDurationSeconds: 300,
        expectedDurationSeconds,
        durationToleranceSeconds: 0.1,
      });
      assertMathMediaReady(validation);
      const stat = await fs.stat(outputPath);
      const outputHash = await hashFile(outputPath);
      const sceneCacheHitCount = orderedFragments.reduce(
        (total, fragment) => total + fragment.cacheHitCount,
        0
      );
      const sceneCacheMissCount = orderedFragments.reduce(
        (total, fragment) => total + fragment.cacheMissCount,
        0
      );
      return bindMathRenderResult({
        artifactVersion: "math-render-result.v1",
        jobId: request.jobId,
        planHash: request.plan.contentHash,
        assemblyRequestHash: request.requestHash,
        outputRelativePath: request.outputRelativePath,
        renderFingerprint,
        scenes: orderedFragments,
        assignments: request.shards.flatMap(({ request: shard }) =>
          shard.scenes.map((scene) => ({
            sceneId: scene.sceneId,
            assignmentId: shard.assignmentId,
          }))
        ),
        assembly: {
          durationMs: Math.max(0, Date.now() - startedAt),
          cacheHitCount: 0,
          cacheMissCount: 0,
          narrationMuxCount: 1,
          revealCueVersion: MATH_REVEAL_CUE_VERSION,
          mediaQaVersion: MATH_MEDIA_QA_VERSION,
        },
        cacheHitCount: sceneCacheHitCount,
        cacheMissCount: sceneCacheMissCount,
        validation: {
          valid: true,
          sha256: outputHash,
          byteLength: stat.size,
          width: 1920,
          height: 1080,
          fps: 30,
          durationSeconds: validation.durationSeconds,
          videoCodec: "h264",
          audioCodec: validation.audioCodec,
          continuityChecked: true,
          corruptionScanPassed: true,
        },
      });
    },
  };
}

export function createMathSceneShardRequests(
  plan: MathRenderPlan,
  workRelativePath: string
) {
  return plan.scenes.map((scene) =>
    bindMathSceneShardRequest({
      artifactVersion: "math-scene-shard-request.v1",
      jobId: plan.jobId,
      planHash: plan.contentHash,
      assignmentId: `local-${scene.sceneId}`,
      workRelativePath: `${workRelativePath}/shards`,
      scenes: [scene],
    })
  );
}

export async function executeCompatibleMathRenderPlan(input: {
  readonly plan: MathRenderPlan;
  readonly jobRoot: string;
  readonly narrationRelativePath: string;
  readonly outputRelativePath: string;
  readonly workRelativePath: string;
  readonly sceneShardExecutor?: MathSceneShardExecutor;
  readonly cacheRoot?: string;
  readonly cpuSlotBudget?: number;
  readonly signal?: AbortSignal;
}): Promise<MathRenderResult> {
  const requests = createMathSceneShardRequests(
    input.plan,
    input.workRelativePath
  );
  const shardRoundTrips = [];
  if (input.sceneShardExecutor) {
    const executionContext = {
      jobRoot: input.jobRoot,
      ...(input.signal ? { signal: input.signal } : {}),
    };
    if (input.sceneShardExecutor.executeBatch) {
      const results = await input.sceneShardExecutor.executeBatch(
        requests,
        executionContext
      );
      if (results.length !== requests.length)
        throw new Error("Math shard batch returned an incomplete result set.");
      for (const [index, request] of requests.entries()) {
        shardRoundTrips.push(
          validateMathSceneShardRoundTrip(request, results[index])
        );
      }
    } else
      for (const request of requests) {
        if (input.signal?.aborted)
          throw input.signal.reason ?? new Error("Math render cancelled.");
        const result = await input.sceneShardExecutor.execute(request, {
          jobRoot: input.jobRoot,
          ...(input.signal ? { signal: input.signal } : {}),
        });
        shardRoundTrips.push(validateMathSceneShardRoundTrip(request, result));
      }
  } else {
    const cpuSlots = input.cpuSlotBudget ?? (await detectMathCpuSlotBudget());
    const worker = defaultLocalMathWorkerCapability({
      workerImageId: input.plan.scenes[0]!.toolchain.workerImageId,
      cpuSlots,
    });
    const activeWorkTracker = { active: 0, peak: 0 };
    const executor = createLocalMathSceneShardExecutor({
      cacheRoot:
        input.cacheRoot ?? path.join(input.jobRoot, ".math-render-cache"),
      capability: worker,
      activeWorkTracker,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    const scheduleInputs = [];
    for (const scene of input.plan.scenes) {
      const svgPath = resolveMathJobPath(input.jobRoot, scene.svgRelativePath);
      const svgMarkup = await fs.readFile(svgPath, "utf8");
      const semanticRasterSampleCount = countSemanticRasterSamples({
        svgMarkup,
        sceneFrames: scene.expectedFrameCount,
        animation: scene.animation,
      });
      scheduleInputs.push({
        scene,
        costsByWorkerId: {
          [worker.workerId]: estimateMathSceneCost(
            conservativeMathSceneCostInputs(scene, semanticRasterSampleCount),
            worker
          ),
        },
      });
    }
    const assignments = scheduleMathScenes(scheduleInputs, [worker]);
    const execution = await executeMathSceneSchedule({
      assignments,
      ...(input.signal ? { signal: input.signal } : {}),
      execute: async (assignment, signal) => {
        const request = requests.find(
          (candidate) =>
            candidate.scenes[0]?.sceneId === assignment.scene.sceneId
        )!;
        const result = await executor.execute(request, {
          jobRoot: input.jobRoot,
          signal,
        });
        return validateMathSceneShardRoundTrip(request, result);
      },
    });
    shardRoundTrips.push(...execution.orderedResults);
  }
  const narrationPath = resolveMathJobPath(
    input.jobRoot,
    input.narrationRelativePath
  );
  const assemblyRequest = bindMathFinalAssemblyRequest({
    artifactVersion: "math-final-assembly-request.v1",
    jobId: input.plan.jobId,
    plan: input.plan,
    shards: shardRoundTrips,
    narrationRelativePath: input.narrationRelativePath,
    narrationSha256: await hashFile(narrationPath),
    outputRelativePath: input.outputRelativePath,
    workRelativePath: input.workRelativePath,
  });
  return createLocalMathFinalAssembler().assemble(assemblyRequest, {
    jobRoot: input.jobRoot,
  });
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
  jobRoot?: string;
  sceneShardExecutor?: MathSceneShardExecutor;
  cacheRoot?: string;
  cpuSlotBudget?: number;
  signal?: AbortSignal;
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
  const jobRoot =
    args.jobRoot ??
    commonMathJobRoot([
      args.audioPath,
      args.outputPath,
      args.workDir,
      ...args.scenes.map((scene) => scene.svgPath),
    ]);
  const workRelativePath = portablePathFromJobRoot(jobRoot, args.workDir);
  const plan = createProviderFreeMathRenderPlan({
    jobRoot,
    id: args.id,
    durationInFrames: composition.durationInFrames,
    scenes: composition.scenes,
    frameRanges: composition.timing.scenes,
    workDir: args.workDir,
    encodingProfile: "publish",
    ...(args.sceneShardExecutor?.workerImageId
      ? { toolchainImageId: args.sceneShardExecutor.workerImageId }
      : {}),
  });
  const renderExecution = await executeCompatibleMathRenderPlan({
    plan,
    jobRoot,
    narrationRelativePath: portablePathFromJobRoot(jobRoot, args.audioPath),
    outputRelativePath: portablePathFromJobRoot(jobRoot, args.outputPath),
    workRelativePath,
    ...(args.sceneShardExecutor
      ? { sceneShardExecutor: args.sceneShardExecutor }
      : {}),
    ...(args.cacheRoot ? { cacheRoot: args.cacheRoot } : {}),
    ...(args.cpuSlotBudget ? { cpuSlotBudget: args.cpuSlotBudget } : {}),
    ...(args.signal ? { signal: args.signal } : {}),
  });
  const validation: MathMediaValidation = {
    artifactVersion: "math-media-validation.v1",
    valid: true,
    filePath: path.resolve(args.outputPath),
    sha256: renderExecution.validation.sha256,
    width: renderExecution.validation.width,
    height: renderExecution.validation.height,
    fps: renderExecution.validation.fps,
    durationSeconds: renderExecution.validation.durationSeconds,
    videoCodec: renderExecution.validation.videoCodec,
    audioCodec: renderExecution.validation.audioCodec,
    continuityChecked: renderExecution.validation.continuityChecked,
    corruptionScanPassed: renderExecution.validation.corruptionScanPassed,
    issues: [],
  };
  return {
    composition,
    plan,
    validation,
    renderFingerprint: renderExecution.renderFingerprint,
    renderExecution,
  };
}
