import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { Capability, RendererCapabilities } from "../contracts.js";
import { RendererError, toRendererErrorData } from "../errors.js";
import { runProcess, type ProcessResult } from "./process.js";

const probeSchema = z.object({ streams: z.array(z.object({ codec_type: z.string(), codec_name: z.string().optional(), width: z.number().optional(), height: z.number().optional(), pix_fmt: z.string().optional(), r_frame_rate: z.string().optional(), duration: z.string().optional() })), format: z.object({ duration: z.string(), size: z.string().optional() }) });
export interface MediaProbe { readonly durationMs: number; readonly width: number; readonly height: number; readonly frameRate: number; readonly videoCodec: string; readonly pixelFormat?: string; readonly audioCodec?: string; }
export interface CapabilityInfrastructure { readonly run?: (executable: string, args: readonly string[], options?: { readonly timeoutMs?: number; readonly allowFailure?: boolean }) => Promise<ProcessResult>; readonly driDevices?: () => Promise<readonly string[]>; readonly temporaryDirectory?: () => Promise<string>; readonly removeTemporaryDirectory?: (directory: string) => Promise<void>; }
const rate = (value: string): number => { const [a = "0", b = "1"] = value.split("/"); return Number(a) / Number(b); };
const processRunner = (infrastructure: CapabilityInfrastructure) => infrastructure.run ?? runProcess;

export async function probeMedia(filePath: string): Promise<MediaProbe> {
  const result = await runProcess("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", filePath], { timeoutMs: 30_000 });
  return parseProbe(result.stdout, filePath);
}
export function parseProbe(stdout: string, filePath = "media"): MediaProbe {
  let parsed: z.infer<typeof probeSchema>; try { parsed = probeSchema.parse(JSON.parse(stdout)); } catch (cause) { throw new RendererError({ code: "FFPROBE_FAILED", message: `Invalid FFprobe output for ${filePath}` }, { cause }); }
  const video = parsed.streams.find((stream) => stream.codec_type === "video"); const audio = parsed.streams.find((stream) => stream.codec_type === "audio");
  if (!video?.width || !video.height || !video.codec_name || !video.r_frame_rate) throw new RendererError({ code: "OUTPUT_VALIDATION_FAILED", message: `No valid video stream in ${filePath}` });
  return { durationMs: Math.round(Number(video.duration ?? parsed.format.duration) * 1_000), width: video.width, height: video.height, frameRate: rate(video.r_frame_rate), videoCodec: video.codec_name, ...(video.pix_fmt ? { pixelFormat: video.pix_fmt } : {}), ...(audio?.codec_name ? { audioCodec: audio.codec_name } : {}) };
}
const detected = async (executable: string, args: readonly string[], infrastructure: CapabilityInfrastructure): Promise<Capability> => processRunner(infrastructure)(executable, args, { timeoutMs: 10_000, allowFailure: true }).then((result) => { const version = (result.stdout || result.stderr).split("\n")[0]; return result.exitCode === 0 ? { status: "available", ...(version ? { version } : {}), detail: "Detected; usability self-test has not run." } : { status: "unavailable", detail: result.stderr.slice(-500) || "Executable returned a non-zero status." }; }, () => ({ status: "unavailable", detail: "Executable could not be started." }));
const verify = (probe: MediaProbe): void => { if (probe.videoCodec !== "h264" || probe.width !== 64 || probe.height !== 64 || probe.pixelFormat !== "yuv420p" || Math.abs(probe.durationMs - 200) > 120) throw new RendererError({ code: "OUTPUT_VALIDATION_FAILED", message: "Capability self-test media verification failed.", details: { codec: probe.videoCodec, width: probe.width, height: probe.height, pixelFormat: probe.pixelFormat ?? null, durationMs: probe.durationMs } }); };

async function encoderSelfTest(name: "libx264" | "h264_vaapi" | "h264_qsv", device: string | undefined, infrastructure: CapabilityInfrastructure): Promise<Capability> {
  const temporaryDirectory = infrastructure.temporaryDirectory ?? (() => fs.mkdtemp(path.join(os.tmpdir(), "educational-renderer-capability-")));
  const removeTemporaryDirectory = infrastructure.removeTemporaryDirectory ?? ((directory: string) => fs.rm(directory, { recursive: true, force: true }));
  const directory = await temporaryDirectory(); const output = path.join(directory, `${name}.mp4`); const run = processRunner(infrastructure);
  try {
    const input = ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=64x64:rate=10", "-t", "0.2"];
    const hardware = name === "h264_vaapi" ? ["-vaapi_device", device!, "-vf", "format=nv12,hwupload"] : name === "h264_qsv" ? ["-init_hw_device", `qsv=hw:${device!}`, "-filter_hw_device", "hw", "-vf", "format=nv12,hwupload=extra_hw_frames=8"] : [];
    const encoded = await run("ffmpeg", [...hardware, ...input, "-an", "-c:v", name, "-pix_fmt", "yuv420p", output], { timeoutMs: 20_000, allowFailure: true });
    if (encoded.exitCode !== 0) throw new RendererError({ code: "FFMPEG_FAILED", message: `${name} capability self-test encode failed.`, details: { exitCode: encoded.exitCode } });
    const probed = await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", output], { timeoutMs: 10_000, allowFailure: true });
    if (probed.exitCode !== 0) throw new RendererError({ code: "FFPROBE_FAILED", message: `${name} capability self-test probe failed.`, details: { exitCode: probed.exitCode } });
    verify(parseProbe(probed.stdout, output)); return { status: "available", detail: "Detected and verified with a 64x64 0.2s H.264 encode." };
  } catch (error) { const data = toRendererErrorData(error); return { status: "failed-self-test", detail: `${data.code}: ${data.message}` }; }
  finally { await removeTemporaryDirectory(directory).catch(() => undefined); }
}

export async function inspectCapabilities(workspaceDirectory: string, infrastructure: CapabilityInfrastructure = {}): Promise<RendererCapabilities> {
  const [ffmpeg, ffprobe, graphviz, blender, font] = await Promise.all([detected("ffmpeg", ["-version"], infrastructure), detected("ffprobe", ["-version"], infrastructure), detected("dot", ["-V"], infrastructure), detected("blender", ["--version"], infrastructure), detected("fc-match", ["DejaVu Sans"], infrastructure)]);
  const run = processRunner(infrastructure); const listed = ffmpeg.status === "available" ? await run("ffmpeg", ["-hide_banner", "-encoders"], { timeoutMs: 10_000, allowFailure: true }).then((result) => result.stdout + result.stderr, () => "") : "";
  const driDevices = await (infrastructure.driDevices ?? (() => fs.readdir("/dev/dri").then((files) => files.filter((file) => file.startsWith("render")).map((file) => path.join("/dev/dri", file)))) )().then((devices) => [...devices], () => []);
  const usableDevice = driDevices.find((device) => !device.includes("\0"));
  const test = async (name: "libx264" | "h264_vaapi" | "h264_qsv", hardware: boolean): Promise<Capability> => {
    if (!listed.includes(name)) return { status: "unavailable", detail: "FFmpeg encoder is not listed." };
    if (hardware && !usableDevice) return { status: "unavailable", detail: "Encoder is listed but no accessible /dev/dri/render* device was detected." };
    return encoderSelfTest(name, usableDevice, infrastructure);
  };
  const [libx264, vaapi, qsv] = await Promise.all([test("libx264", false), test("h264_vaapi", true), test("h264_qsv", true)]);
  const freeSpaceBytes = await fs.statfs(workspaceDirectory).then((stat) => stat.bavail * stat.bsize, () => undefined);
  return { resultVersion: "1", node: { status: "available", version: process.version, detail: "Node runtime detected." }, ffmpeg, ffprobe, encoders: { libx264, h264_vaapi: vaapi, h264_qsv: qsv }, driDevices, fonts: [font.status === "available" ? { ...font, detail: "Font resolver detected; configured font is verified when the renderer is created." } : font], graphviz: graphviz.status === "available" ? { ...graphviz, detail: "Inspection-only; rendering never invokes Graphviz." } : graphviz, blender: blender.status === "available" ? { ...blender, detail: "Inspection-only; rendering never invokes Blender." } : blender, svgRenderer: ffmpeg.status === "available" && libx264.status === "available" ? { status: "available", detail: "FFmpeg SVG input and software encode verified together." } : { status: "failed-self-test", detail: "SVG input was detected but its software encode self-test did not pass." }, cpuCount: os.cpus().length, totalMemoryBytes: os.totalmem(), ...(freeSpaceBytes === undefined ? {} : { freeSpaceBytes }) };
}
