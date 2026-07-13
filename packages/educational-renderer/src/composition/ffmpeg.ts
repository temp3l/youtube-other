import path from "node:path";
import type { NormalizedRenderProfile } from "../contracts.js";
import { runProcess, type ProcessOptions, type ProcessResult } from "../infrastructure/process.js";

export function buildStaticSceneArgs(svgPath: string, outputPath: string, durationMs: number, profile: NormalizedRenderProfile): readonly string[] {
  return ["-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-framerate", String(profile.frameRate), "-i", svgPath, "-t", (durationMs/1000).toFixed(3), "-an", "-c:v", profile.encoder, ...(profile.encoder === "libx264" ? ["-preset", profile.preset, "-threads", "1"] : []), "-pix_fmt", profile.pixelFormat, "-r", String(profile.frameRate), "-vf", `scale=${profile.width}:${profile.height}:flags=lanczos,format=${profile.pixelFormat}`, "-map_metadata", "-1", outputPath];
}
export async function encodeStaticScene(svgPath: string, outputPath: string, durationMs: number, profile: NormalizedRenderProfile, options: ProcessOptions = {}): Promise<ProcessResult> { return runProcess("ffmpeg", buildStaticSceneArgs(svgPath, outputPath, durationMs, profile), { ...options, measureRss: true }); }
export async function composeSegments(args: { scenePaths: readonly string[]; concatPath: string; outputPath: string; durationMs: number; profile: NormalizedRenderProfile; audio?: { path: string; volume: number }; subtitles?: { path: string; mode: "embedded" | "none" }; signal?: AbortSignal }): Promise<ProcessResult> {
  const ffmpegArgs: string[] = ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", args.concatPath]; let input = 1;
  if (args.audio) { ffmpegArgs.push("-i", args.audio.path); input += 1; }
  if (args.subtitles?.mode === "embedded") { ffmpegArgs.push("-i", args.subtitles.path); }
  ffmpegArgs.push("-map", "0:v:0");
  if (args.audio) ffmpegArgs.push("-map", "1:a:0", "-filter:a", `volume=${args.audio.volume}`, "-c:a", "aac", "-ar", "48000", "-ac", "2");
  if (args.subtitles?.mode === "embedded") { const subtitleIndex = input; ffmpegArgs.push("-map", `${subtitleIndex}:s:0`, "-c:s", "mov_text"); }
  ffmpegArgs.push("-c:v", "copy", "-map_metadata", "-1", "-movflags", "+faststart", "-t", (args.durationMs/1000).toFixed(3), args.outputPath);
  return runProcess("ffmpeg", ffmpegArgs, { timeoutMs: 900_000, measureRss: true, ...(args.signal ? { signal: args.signal } : {}) });
}
export function concatFileContent(scenePaths: readonly string[]): string { return scenePaths.map((file) => `file '${path.resolve(file).replaceAll("'", "'\\''")}'`).join("\n") + "\n"; }
