import fs from "node:fs/promises";
import path from "node:path";
import {
  MediaValidationError,
  type RenderProfile,
  type ScenePlan,
} from "@mediaforge/domain";
import {
  ensureDir,
  fileExists,
  hashFile,
  hashText,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import { runCommand, runCommandJson } from "@mediaforge/process-runner";

export interface VideoRenderRequest {
  readonly episodeDir: string;
  readonly scenePlan: ScenePlan;
  readonly captionsPath?: string;
  readonly outputDir: string;
  readonly renderProfile: RenderProfile;
  readonly captionBurnIn: boolean;
  readonly clipsDirName?: string;
  readonly sceneAudioDir?: string;
  readonly imageDir?: string;
  readonly outputSuffix?: string;
  readonly trailingSilenceRatio?: number;
  readonly trailingSilenceBufferSeconds?: number;
}

export interface VideoRenderResult {
  readonly cleanPath: string;
  readonly captionedPath?: string;
  readonly validation: RenderValidation;
}

export interface SceneClipRenderResult {
  readonly clipsDir: string;
  readonly clipPaths: string[];
}

interface SceneClipManifest {
  readonly schemaVersion: 1;
  readonly sceneId: string;
  readonly sceneHash: string;
  readonly imageSha256: string;
  readonly audioSha256: string;
  readonly captionsSha256?: string;
  readonly renderProfile: {
    readonly aspectRatio: string;
    readonly width: number;
    readonly height: number;
    readonly fps: number;
  };
  readonly trailingSilenceRatio: number;
  readonly trailingSilenceBufferSeconds: number;
  readonly outputSha256: string;
  readonly generatedAt: string;
}

export interface RenderValidation {
  readonly valid: boolean;
  readonly width: number;
  readonly height: number;
  readonly durationSeconds: number;
  readonly videoCodec: string;
  readonly audioCodec: string;
  readonly issues: string[];
}

export interface VideoRenderer {
  render(
    request: VideoRenderRequest,
    signal: AbortSignal
  ): Promise<VideoRenderResult>;
  renderSceneClips(
    request: VideoRenderRequest,
    signal: AbortSignal
  ): Promise<SceneClipRenderResult>;
}

async function probeMedia(filePath: string): Promise<RenderValidation> {
  const probe = await runCommandJson(
    "ffprobe",
    [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_streams",
      "-show_format",
      filePath,
    ],
    { timeoutMs: 30000 },
    (value: unknown) =>
      value as {
        streams?: Array<{
          codec_type?: string;
          codec_name?: string;
          width?: number;
          height?: number;
          duration?: string;
          sample_rate?: string;
        }>;
        format?: { duration?: string };
      }
  );
  const video = probe.streams?.find(
    (stream: { codec_type?: string }) => stream.codec_type === "video"
  );
  const audio = probe.streams?.find(
    (stream: { codec_type?: string }) => stream.codec_type === "audio"
  );
  const duration = Number.parseFloat(
    probe.format?.duration ?? video?.duration ?? "0"
  );
  const issues: string[] = [];
  if (!video) {
    issues.push("Missing video stream.");
  }
  if (!audio) {
    issues.push("Missing audio stream.");
  }
  return {
    valid: issues.length === 0,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    durationSeconds: duration,
    videoCodec: video?.codec_name ?? "",
    audioCodec: audio?.codec_name ?? "",
    issues,
  };
}

async function isReusableSceneClip(filePath: string): Promise<boolean> {
  if (!(await fileExists(filePath))) {
    return false;
  }
  const stats = await fs.stat(filePath).catch(() => null);
  if (!stats || stats.size < 1024) {
    return false;
  }
  const probe = await probeMedia(filePath).catch(() => null);
  return Boolean(probe?.valid);
}

function sceneHash(scene: ScenePlan["scenes"][number]): string {
  return hashText(
    JSON.stringify({
      id: scene.id,
      sequenceNumber: scene.sequenceNumber,
      canonicalNarration: scene.canonicalNarration,
      sourceSegmentIds: scene.sourceSegmentIds,
      timing: scene.timing,
      expectedImageFilenames: scene.expectedImageFilenames,
      visualPurpose: scene.visualPurpose,
    })
  );
}

async function loadSceneClipManifest(
  manifestPath: string
): Promise<SceneClipManifest | null> {
  if (!(await fileExists(manifestPath))) {
    return null;
  }
  const raw = JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const value = raw as Partial<SceneClipManifest>;
  if (
    value.schemaVersion !== 1 ||
    typeof value.sceneId !== "string" ||
    typeof value.sceneHash !== "string" ||
    typeof value.imageSha256 !== "string" ||
    typeof value.audioSha256 !== "string" ||
    typeof value.outputSha256 !== "string" ||
    typeof value.generatedAt !== "string" ||
    typeof value.trailingSilenceRatio !== "number" ||
    typeof value.trailingSilenceBufferSeconds !== "number" ||
    !value.renderProfile ||
    typeof value.renderProfile.aspectRatio !== "string" ||
    typeof value.renderProfile.width !== "number" ||
    typeof value.renderProfile.height !== "number" ||
    typeof value.renderProfile.fps !== "number"
  ) {
    return null;
  }
  return value as SceneClipManifest;
}

async function probeDurationSeconds(filePath: string): Promise<number> {
  const probe = await runCommandJson(
    "ffprobe",
    ["-v", "quiet", "-print_format", "json", "-show_format", filePath],
    { timeoutMs: 30000 },
    (value: unknown) => value as { format?: { duration?: string } }
  );
  const duration = Number.parseFloat(probe.format?.duration ?? "0");
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new MediaValidationError(
      `Unable to inspect duration for ${filePath}.`
    );
  }
  return duration;
}

async function detectTrailingSilenceSeconds(filePath: string): Promise<number> {
  const result = await runCommand(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      filePath,
      "-af",
      "silencedetect=n=-40dB:d=0.25",
      "-f",
      "null",
      "-",
    ],
    { timeoutMs: 120000 }
  );
  const matches = [
    ...result.stderr.matchAll(/silence_start:\s*([0-9]+(?:\.[0-9]+)?)/gu),
  ];
  if (matches.length === 0) {
    return 0;
  }
  const lastMatch = matches[matches.length - 1];
  const silenceStart = Number.parseFloat(lastMatch?.[1] ?? "0");
  if (!Number.isFinite(silenceStart) || silenceStart < 0) {
    return 0;
  }
  const duration = await probeDurationSeconds(filePath);
  return Math.max(0, duration - silenceStart);
}

async function calculateClipDurationSeconds(
  filePath: string,
  trailingSilenceRatio: number,
  trailingSilenceBufferSeconds: number
): Promise<number> {
  const duration = await probeDurationSeconds(filePath);
  if (trailingSilenceRatio >= 1) {
    return duration;
  }
  const trailingSilence = await detectTrailingSilenceSeconds(filePath);
  if (trailingSilence <= 0) {
    return duration;
  }
  const preservedSilence = trailingSilence * Math.max(0, trailingSilenceRatio);
  const trimmedDuration =
    duration -
    trailingSilence +
    preservedSilence +
    Math.max(0, trailingSilenceBufferSeconds);
  return Math.max(0.1, Math.min(duration, trimmedDuration));
}

async function renderSceneClip(
  imagePath: string,
  audioPath: string,
  outputPath: string,
  fps: number,
  width: number,
  height: number,
  captionsPath?: string,
  trailingSilenceRatio = 0.8,
  trailingSilenceBufferSeconds = 0.5
): Promise<void> {
  const scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`;
  const filterGraph = captionsPath
    ? `subtitles=${captionsPath.replace(/:/g, "\\:")},${scaleFilter}`
    : scaleFilter;
  const clipDurationSeconds = await calculateClipDurationSeconds(
    audioPath,
    trailingSilenceRatio,
    trailingSilenceBufferSeconds
  );
  const args = [
    "-y",
    "-loop",
    "1",
    "-i",
    imagePath,
    "-i",
    audioPath,
    "-vf",
    filterGraph,
    "-t",
    String(clipDurationSeconds),
    "-r",
    String(fps),
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
  ];
  args.push(outputPath);
  await runCommand("ffmpeg", args, { timeoutMs: 600000 });
}

async function resolveSceneImagePath(
  episodeDir: string,
  scenePlan: ScenePlan,
  sceneIndex: number,
  imageDir: string
): Promise<string> {
  const scene = scenePlan.scenes[sceneIndex];
  if (!scene) {
    throw new MediaValidationError(`Missing scene at index ${sceneIndex}.`);
  }
  const expectedFilename = scene.expectedImageFilenames[0];
  if (expectedFilename) {
    const expected = path.join(imageDir, expectedFilename);
    if (await fileExists(expected)) {
      return expected;
    }
  }
  const candidates = (await fs.readdir(imageDir).catch(() => [])).filter(
    (entry) => entry.startsWith(`${scene.id}__`) && entry.endsWith(".png")
  );
  if (candidates.length === 1) {
    return path.join(imageDir, candidates[0] ?? "");
  }
  if (candidates.length > 1) {
    throw new MediaValidationError(
      `Multiple image assets found for ${scene.id} in ${imageDir}: ${candidates.join(", ")}`
    );
  }
  throw new MediaValidationError(
    `Missing image asset for ${scene.id} in ${episodeDir}.`
  );
}

async function resolveSceneAudioPath(
  episodeDir: string,
  scenePlan: ScenePlan,
  sceneIndex: number,
  audioDir: string
): Promise<string> {
  const scene = scenePlan.scenes[sceneIndex];
  if (!scene) {
    throw new MediaValidationError(`Missing scene at index ${sceneIndex}.`);
  }
  const candidates = [path.join(audioDir, `${scene.id}.wav`)];
  const segmentMatch = scene.id.match(/^scene-(\d{3})$/u);
  if (segmentMatch?.[1]) {
    candidates.push(path.join(audioDir, `segment-${segmentMatch[1]}.wav`));
  }
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  const narrationCandidates = [
    path.join(path.dirname(audioDir), "narration.wav"),
    path.join(path.dirname(audioDir), "narration-en.wav"),
  ];
  for (const candidate of narrationCandidates) {
    if (await fileExists(candidate)) {
      const targetPath =
        candidates[0] ?? path.join(audioDir, `${scene.id}.wav`);
      await ensureDir(path.dirname(targetPath));
      await runCommand(
        "ffmpeg",
        [
          "-y",
          "-ss",
          String(scene.timing.startSeconds),
          "-t",
          String(
            Math.max(0.1, scene.timing.endSeconds - scene.timing.startSeconds)
          ),
          "-i",
          candidate,
          "-vn",
          "-acodec",
          "pcm_s16le",
          targetPath,
        ],
        { timeoutMs: 600000 }
      );
      return targetPath;
    }
  }
  throw new MediaValidationError(
    `Missing scene audio for ${scene.id} in ${audioDir} and no narration source was found.`
  );
}

export class FFmpegVideoRenderer implements VideoRenderer {
  public async renderSceneClips(
    request: VideoRenderRequest,
    signal: AbortSignal
  ): Promise<SceneClipRenderResult> {
    signal.throwIfAborted();
    await ensureDir(request.outputDir);
    const clipsDir = path.join(
      request.outputDir,
      request.clipsDirName ?? "clips"
    );
    await ensureDir(clipsDir);
    const imageDir =
      request.imageDir ?? path.join(request.episodeDir, "images", "generated");
    const audioDir =
      request.sceneAudioDir ??
      path.join(request.episodeDir, "audio", "segments");
    const clipPaths: string[] = Array.from(
      { length: request.scenePlan.scenes.length },
      () => ""
    );
    let nextIndex = 0;
    const takeIndex = (): number | null => {
      if (nextIndex >= request.scenePlan.scenes.length) {
        return null;
      }
      const current = nextIndex;
      nextIndex += 1;
      return current;
    };
    const workerCount = Math.min(2, request.scenePlan.scenes.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = takeIndex();
        if (index === null) {
          return;
        }
        const scene = request.scenePlan.scenes[index];
        if (!scene) {
          continue;
        }
        const clipPath = path.join(clipsDir, `${scene.id}.mp4`);
        const imagePath = await resolveSceneImagePath(
          request.episodeDir,
          request.scenePlan,
          index,
          imageDir
        );
        const audioPath = await resolveSceneAudioPath(
          request.episodeDir,
          request.scenePlan,
          index,
          audioDir
        );
        const manifestPath = path.join(clipsDir, `${scene.id}.json`);
        const existingManifest = await loadSceneClipManifest(manifestPath);
        const currentSceneHash = sceneHash(scene);
        const currentImageSha256 = await hashFile(imagePath).catch(() => "");
        const currentAudioSha256 = await hashFile(audioPath).catch(() => "");
        const currentCaptionsSha256 =
          request.captionBurnIn && request.captionsPath
            ? await hashFile(request.captionsPath).catch(() => "")
            : undefined;
        const clipIsReusable =
          existingManifest &&
          existingManifest.sceneId === scene.id &&
          existingManifest.sceneHash === currentSceneHash &&
          existingManifest.imageSha256 === currentImageSha256 &&
          existingManifest.audioSha256 === currentAudioSha256 &&
          (existingManifest.captionsSha256 ?? undefined) ===
            (currentCaptionsSha256 ?? undefined) &&
          existingManifest.renderProfile.aspectRatio ===
            request.renderProfile.aspectRatio &&
          existingManifest.renderProfile.width ===
            request.renderProfile.width &&
          existingManifest.renderProfile.height ===
            request.renderProfile.height &&
          existingManifest.renderProfile.fps === request.renderProfile.fps &&
          existingManifest.trailingSilenceRatio ===
            (request.trailingSilenceRatio ?? 0.8) &&
          existingManifest.trailingSilenceBufferSeconds ===
            (request.trailingSilenceBufferSeconds ?? 0.5) &&
          (await isReusableSceneClip(clipPath)) &&
          (await hashFile(clipPath).catch(() => "")) ===
            existingManifest.outputSha256;
        if (clipIsReusable) {
          clipPaths[index] = clipPath;
          continue;
        }
        await renderSceneClip(
          imagePath,
          audioPath,
          clipPath,
          request.renderProfile.fps,
          request.renderProfile.width,
          request.renderProfile.height,
          request.captionBurnIn && request.captionsPath
            ? request.captionsPath
            : undefined,
          request.trailingSilenceRatio ?? 0.8,
          request.trailingSilenceBufferSeconds ?? 0.5
        );
        const outputSha256 = await hashFile(clipPath);
        const sceneClipManifest: SceneClipManifest = {
          schemaVersion: 1,
          sceneId: scene.id,
          sceneHash: currentSceneHash,
          imageSha256: currentImageSha256,
          audioSha256: currentAudioSha256,
          ...(currentCaptionsSha256
            ? { captionsSha256: currentCaptionsSha256 }
            : {}),
          renderProfile: {
            aspectRatio: request.renderProfile.aspectRatio,
            width: request.renderProfile.width,
            height: request.renderProfile.height,
            fps: request.renderProfile.fps,
          },
          trailingSilenceRatio: request.trailingSilenceRatio ?? 0.8,
          trailingSilenceBufferSeconds:
            request.trailingSilenceBufferSeconds ?? 0.5,
          outputSha256,
          generatedAt: new Date().toISOString(),
        };
        await writeJsonAtomic(manifestPath, sceneClipManifest);
        clipPaths[index] = clipPath;
      }
    });
    await Promise.all(workers);
    return {
      clipsDir,
      clipPaths: clipPaths.filter((clipPath) => clipPath.length > 0),
    };
  }

  public async render(
    request: VideoRenderRequest,
    signal: AbortSignal
  ): Promise<VideoRenderResult> {
    signal.throwIfAborted();
    const { clipPaths } = await this.renderSceneClips(request, signal);
    const concatListPath = path.join(request.outputDir, "concat.txt");
    await writeTextAtomic(
      concatListPath,
      clipPaths
        .map((clipPath) => `file '${clipPath.replace(/'/g, "'\\''")}'`)
        .join("\n")
    );
    const suffix = request.outputSuffix ?? "";
    const cleanPath = path.join(
      request.outputDir,
      `youtube-${request.renderProfile.aspectRatio.replace(":", "x")}${suffix}-clean.mp4`
    );
    await runCommand(
      "ffmpeg",
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatListPath,
        "-c",
        "copy",
        cleanPath,
      ],
      {
        timeoutMs: 600000,
      }
    );
    let captionedPath: string | undefined;
    if (request.captionsPath && request.captionBurnIn) {
      captionedPath = path.join(
        request.outputDir,
        `youtube-${request.renderProfile.aspectRatio.replace(":", "x")}${suffix}-captioned.mp4`
      );
      await runCommand(
        "ffmpeg",
        [
          "-y",
          "-i",
          cleanPath,
          "-vf",
          `subtitles=${request.captionsPath}`,
          "-c:v",
          "libx264",
          "-c:a",
          "copy",
          captionedPath,
        ],
        { timeoutMs: 600000 }
      );
    }
    const validation = await probeMedia(captionedPath ?? cleanPath);
    if (!validation.valid) {
      throw new MediaValidationError(
        `Rendered media failed validation: ${validation.issues.join("; ")}`
      );
    }
    return captionedPath
      ? {
          cleanPath,
          captionedPath,
          validation,
        }
      : {
          cleanPath,
          validation,
        };
  }
}

export async function validateRenderedVideo(
  filePath: string
): Promise<RenderValidation> {
  return probeMedia(filePath);
}
