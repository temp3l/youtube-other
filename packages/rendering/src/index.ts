import fs from "node:fs/promises";
import path from "node:path";
import {
  MediaValidationError,
  type EpisodeManifest,
  type RenderProfile,
  type ScenePlan
} from "@mediaforge/domain";
import { ensureDir, fileExists, writeTextAtomic } from "@mediaforge/shared";
import { runCommand, runCommandJson } from "@mediaforge/process-runner";

export interface VideoRenderRequest {
  readonly episodeDir: string;
  readonly scenePlan: ScenePlan;
  readonly captionsPath?: string;
  readonly outputDir: string;
  readonly renderProfile: RenderProfile;
  readonly captionBurnIn: boolean;
}

export interface VideoRenderResult {
  readonly cleanPath: string;
  readonly captionedPath?: string;
  readonly validation: RenderValidation;
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
  render(request: VideoRenderRequest, signal: AbortSignal): Promise<VideoRenderResult>;
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
      filePath
    ],
    { timeoutMs: 30000 },
    (value: unknown) =>
      value as {
        streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; duration?: string; sample_rate?: string }>;
        format?: { duration?: string };
      }
  );
  const video = probe.streams?.find((stream: { codec_type?: string }) => stream.codec_type === "video");
  const audio = probe.streams?.find((stream: { codec_type?: string }) => stream.codec_type === "audio");
  const duration = Number.parseFloat(probe.format?.duration ?? video?.duration ?? "0");
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
    issues
  };
}

async function renderSceneClip(
  imagePath: string,
  audioPath: string,
  outputPath: string,
  durationSeconds: number,
  fps: number,
  width: number,
  height: number,
  captionsPath?: string
): Promise<void> {
  const scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`;
  const filterGraph = captionsPath
    ? `subtitles=${captionsPath.replace(/:/g, "\\:")},${scaleFilter}`
    : scaleFilter;
  const args = [
    "-y",
    "-loop",
    "1",
    "-i",
    imagePath,
    "-i",
    audioPath,
    "-t",
    String(durationSeconds),
    "-vf",
    filterGraph,
    "-r",
    String(fps),
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-shortest"
  ];
  args.push(outputPath);
  await runCommand("ffmpeg", args, { timeoutMs: 600000 });
}

export class FFmpegVideoRenderer implements VideoRenderer {
  public async render(request: VideoRenderRequest, signal: AbortSignal): Promise<VideoRenderResult> {
    signal.throwIfAborted();
    await ensureDir(request.outputDir);
    const clipsDir = path.join(request.outputDir, "clips");
    await ensureDir(clipsDir);
    const clipPaths: string[] = [];
    for (const scene of request.scenePlan.scenes) {
      const imagePath = path.join(request.episodeDir, "images", "generated", scene.expectedImageFilenames[0] ?? "");
      const audioPath = path.join(request.episodeDir, "audio", "segments", `${scene.id}.wav`);
      const clipPath = path.join(clipsDir, `${scene.id}.mp4`);
      if (await fileExists(clipPath)) {
        clipPaths.push(clipPath);
        continue;
      }
      await renderSceneClip(
        imagePath,
        audioPath,
        clipPath,
        Math.max(1, scene.actualAudioDurationSeconds ?? scene.estimatedDurationSeconds),
        request.renderProfile.fps,
        request.renderProfile.width,
        request.renderProfile.height,
        request.captionBurnIn && request.captionsPath ? request.captionsPath : undefined
      );
      clipPaths.push(clipPath);
    }
    const concatListPath = path.join(request.outputDir, "concat.txt");
    await writeTextAtomic(
      concatListPath,
      clipPaths.map((clipPath) => `file '${clipPath.replace(/'/g, "'\\''")}'`).join("\n")
    );
    const cleanPath = path.join(request.outputDir, `youtube-${request.renderProfile.aspectRatio.replace(":", "x")}-clean.mp4`);
    await runCommand("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatListPath, "-c", "copy", cleanPath], {
      timeoutMs: 600000
    });
    let captionedPath: string | undefined;
    if (request.captionsPath && request.captionBurnIn) {
      captionedPath = path.join(request.outputDir, `youtube-${request.renderProfile.aspectRatio.replace(":", "x")}-captioned.mp4`);
      await runCommand(
        "ffmpeg",
        ["-y", "-i", cleanPath, "-vf", `subtitles=${request.captionsPath}`, "-c:v", "libx264", "-c:a", "copy", captionedPath],
        { timeoutMs: 600000 }
      );
    }
    const validation = await probeMedia(captionedPath ?? cleanPath);
    if (!validation.valid) {
      throw new MediaValidationError(`Rendered media failed validation: ${validation.issues.join("; ")}`);
    }
    return captionedPath
      ? {
          cleanPath,
          captionedPath,
          validation
        }
      : {
          cleanPath,
          validation
        };
  }
}

export async function validateRenderedVideo(filePath: string): Promise<RenderValidation> {
  return probeMedia(filePath);
}
