import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { Capability, RendererCapabilities } from "../contracts.js";
import { RendererError } from "../errors.js";
import { runProcess } from "./process.js";

const probeSchema = z.object({ streams: z.array(z.object({ codec_type: z.string(), codec_name: z.string().optional(), width: z.number().optional(), height: z.number().optional(), pix_fmt: z.string().optional(), r_frame_rate: z.string().optional(), duration: z.string().optional() })), format: z.object({ duration: z.string(), size: z.string().optional() }) });
export interface MediaProbe { readonly durationMs: number; readonly width: number; readonly height: number; readonly frameRate: number; readonly videoCodec: string; readonly pixelFormat?: string; readonly audioCodec?: string; }
const rate = (value: string): number => { const [a = "0", b = "1"] = value.split("/"); return Number(a) / Number(b); };
export async function probeMedia(filePath: string): Promise<MediaProbe> {
  const result = await runProcess("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", filePath], { timeoutMs: 30_000 });
  let parsed: z.infer<typeof probeSchema>; try { parsed = probeSchema.parse(JSON.parse(result.stdout)); } catch (cause) { throw new RendererError({ code: "FFPROBE_FAILED", message: `Invalid FFprobe output for ${filePath}` }, { cause }); }
  const video = parsed.streams.find((stream) => stream.codec_type === "video"); const audio = parsed.streams.find((stream) => stream.codec_type === "audio");
  if (!video?.width || !video.height || !video.codec_name || !video.r_frame_rate) throw new RendererError({ code: "OUTPUT_VALIDATION_FAILED", message: `No valid video stream in ${filePath}` });
  return { durationMs: Math.round(Number(video.duration ?? parsed.format.duration) * 1_000), width: video.width, height: video.height, frameRate: rate(video.r_frame_rate), videoCodec: video.codec_name, ...(video.pix_fmt ? { pixelFormat: video.pix_fmt } : {}), ...(audio?.codec_name ? { audioCodec: audio.codec_name } : {}) };
}
const capability = async (executable: string, args: readonly string[] = ["-version"]): Promise<Capability> => runProcess(executable, args, { timeoutMs: 10_000, allowFailure: true }).then((r) => { const version = (r.stdout || r.stderr).split("\n")[0]; return r.exitCode === 0 ? { status: "available", ...(version ? { version } : {}) } : { status: "unavailable", detail: r.stderr.slice(-500) }; }, () => ({ status: "unavailable" }));
export async function inspectCapabilities(workspaceDirectory: string): Promise<RendererCapabilities> {
  const [ffmpeg, ffprobe, graphviz, blender, font] = await Promise.all([capability("ffmpeg"), capability("ffprobe"), capability("dot", ["-V"]), capability("blender", ["--version"]), capability("fc-match", ["DejaVu Sans"])]);
  const encodersText = ffmpeg.status === "available" ? await runProcess("ffmpeg", ["-hide_banner", "-encoders"], { allowFailure: true }).then((r) => r.stdout + r.stderr) : "";
  const driDevices = await fs.readdir("/dev/dri").then((files) => files.filter((f) => f.startsWith("render")).map((f) => path.join("/dev/dri", f)), () => []);
  const encoder = (name: string, hardware: boolean): Capability => !encodersText.includes(name) ? { status: "unavailable" } : hardware ? (driDevices.length ? { status: "untested", detail: "Encoder and device detected; use benchmark self-test." } : { status: "unavailable", detail: "Encoder listed but no render device detected." }) : { status: "available" };
  const freeSpaceBytes = await fs.statfs(workspaceDirectory).then((stat) => stat.bavail * stat.bsize, () => undefined);
  return { resultVersion: "1", node: { status: "available", version: process.version }, ffmpeg, ffprobe, encoders: { libx264: encoder("libx264", false), h264_vaapi: encoder("h264_vaapi", true), h264_qsv: encoder("h264_qsv", true) }, driDevices, fonts: [font.status === "available" ? { ...font, ...(font.version ? { detail: font.version } : {}) } : font], graphviz, blender, svgRenderer: ffmpeg.status === "available" ? { status: "available", detail: "FFmpeg librsvg input" } : { status: "unavailable" }, cpuCount: os.cpus().length, totalMemoryBytes: os.totalmem(), ...(freeSpaceBytes === undefined ? {} : { freeSpaceBytes }) };
}
