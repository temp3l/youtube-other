import { validateRenderedVideo } from "@mediaforge/rendering";
import { runCommand, runCommandJson } from "@mediaforge/process-runner";
import { hashFile } from "@mediaforge/shared";
import { z } from "zod";

export const MATH_MEDIA_QA_VERSION = "math-media-qa.v1";

const probeSchema = z.looseObject({
  streams: z.array(
    z.looseObject({
      index: z.number(),
      codec_type: z.string().optional(),
      avg_frame_rate: z.string().optional(),
      duration: z.string().optional(),
    })
  ),
  packets: z
    .array(
      z.looseObject({
        stream_index: z.number(),
        pts_time: z.string().optional(),
        dts_time: z.string().optional(),
        duration_time: z.string().optional(),
      })
    )
    .optional(),
  format: z.looseObject({ duration: z.string().optional() }),
});

export interface MathMediaValidation {
  artifactVersion: "math-media-validation.v1";
  valid: boolean;
  filePath: string;
  sha256: string | null;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  videoCodec: string;
  audioCodec: string;
  continuityChecked: boolean;
  corruptionScanPassed: boolean;
  issues: readonly string[];
}

function fraction(value: string | undefined): number {
  const [rawNumerator = "0", rawDenominator = "1"] = (value ?? "0/1").split(
    "/"
  );
  const numerator = Number(rawNumerator);
  const denominator = Number(rawDenominator);
  return denominator && Number.isFinite(numerator)
    ? numerator / denominator
    : 0;
}

export type MathMediaPacket = NonNullable<
  z.infer<typeof probeSchema>["packets"]
>[number];

export function findPacketContinuityIssues(
  packets: readonly MathMediaPacket[],
  streamIndex: number,
  maximumGapSeconds: number,
  label: string,
  durationSeconds: number
): string[] {
  const issues: string[] = [];
  const selected = packets.filter(
    (packet) => packet.stream_index === streamIndex
  );
  if (selected.length === 0)
    return [`${label} packet continuity could not be verified.`];
  let previousDecodeEnd: number | null = null;
  let firstPresentationTime = Number.POSITIVE_INFINITY;
  let lastPresentationEnd = Number.NEGATIVE_INFINITY;
  for (const [index, packet] of selected.entries()) {
    const dts = Number(packet.dts_time ?? packet.pts_time ?? "NaN");
    const pts = Number(packet.pts_time ?? packet.dts_time ?? "NaN");
    const duration = Number(packet.duration_time ?? "0");
    if (
      !Number.isFinite(dts) ||
      !Number.isFinite(pts) ||
      !Number.isFinite(duration) ||
      duration < 0
    ) {
      issues.push(`${label} contains an invalid packet timestamp.`);
      break;
    }
    if (
      index > 0 &&
      previousDecodeEnd !== null &&
      dts + 0.000_001 < previousDecodeEnd
    )
      issues.push(`${label} packet timestamps overlap or move backwards.`);
    if (
      index > 0 &&
      previousDecodeEnd !== null &&
      dts - previousDecodeEnd > maximumGapSeconds
    )
      issues.push(
        `${label} packet gap ${String(dts - previousDecodeEnd)}s exceeds continuity tolerance.`
      );
    previousDecodeEnd =
      previousDecodeEnd === null
        ? dts + duration
        : Math.max(previousDecodeEnd, dts + duration);
    firstPresentationTime = Math.min(firstPresentationTime, pts);
    lastPresentationEnd = Math.max(lastPresentationEnd, pts + duration);
  }
  if (firstPresentationTime > maximumGapSeconds)
    issues.push(`${label} packets begin after the declared media start.`);
  if (durationSeconds - lastPresentationEnd > maximumGapSeconds)
    issues.push(`${label} packets end before the declared media duration.`);
  return issues;
}

export async function validateMathMediaFile(
  filePath: string,
  options: {
    minimumDurationSeconds?: number;
    maximumDurationSeconds?: number;
    expectedDurationSeconds?: number;
    durationToleranceSeconds?: number;
  } = {}
): Promise<MathMediaValidation> {
  const minimum = options.minimumDurationSeconds ?? 180;
  const maximum = options.maximumDurationSeconds ?? 300;
  const durationTolerance = options.durationToleranceSeconds ?? 0.1;
  const issues: string[] = [];
  let width = 0;
  let height = 0;
  let durationSeconds = 0;
  let videoCodec = "";
  let audioCodec = "";
  let fps = 0;
  let continuityChecked = false;
  let corruptionScanPassed = false;
  try {
    const base = await validateRenderedVideo(filePath, {
      expectedWidth: 1920,
      expectedHeight: 1080,
      requireAudio: true,
      ...(options.expectedDurationSeconds === undefined
        ? {}
        : { expectedDurationSeconds: options.expectedDurationSeconds }),
      durationToleranceSeconds: durationTolerance,
    });
    width = base.width;
    height = base.height;
    durationSeconds = base.durationSeconds;
    videoCodec = base.videoCodec;
    audioCodec = base.audioCodec;
    issues.push(...base.issues);
    if (
      durationSeconds < minimum - durationTolerance ||
      durationSeconds > maximum + durationTolerance
    )
      issues.push(
        `Media duration ${durationSeconds.toFixed(3)}s is outside ${minimum}-${maximum} seconds.`
      );
    const probe = await runCommandJson(
      "ffprobe",
      [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_streams",
        "-show_packets",
        "-show_format",
        filePath,
      ],
      { timeoutMs: 120_000 },
      (raw) => probeSchema.parse(raw)
    );
    const video = probe.streams.find((stream) => stream.codec_type === "video");
    const audio = probe.streams.find((stream) => stream.codec_type === "audio");
    fps = fraction(video?.avg_frame_rate);
    if (Math.abs(fps - 30) > 0.001)
      issues.push(`Video frame rate ${String(fps)} is not 30fps.`);
    if (!video || !audio)
      issues.push("Both video and audio streams are required.");
    if (video && audio && probe.packets) {
      issues.push(
        ...findPacketContinuityIssues(
          probe.packets,
          video.index,
          2 / 30,
          "Video",
          durationSeconds
        ),
        ...findPacketContinuityIssues(
          probe.packets,
          audio.index,
          0.15,
          "Audio",
          durationSeconds
        )
      );
      continuityChecked = true;
    } else issues.push("Packet continuity evidence is unavailable.");
    const decode = await runCommand(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        filePath,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0",
        "-f",
        "null",
        "-",
      ],
      { timeoutMs: 300_000, allowNonZeroExit: true }
    );
    corruptionScanPassed =
      decode.exitCode === 0 && decode.stderr.trim().length === 0;
    if (!corruptionScanPassed) issues.push("FFmpeg corruption scan failed.");
  } catch (error) {
    issues.push(
      `Media probe failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return {
    artifactVersion: "math-media-validation.v1",
    valid: issues.length === 0,
    filePath,
    sha256: await hashFile(filePath).catch(() => null),
    width,
    height,
    fps,
    durationSeconds,
    videoCodec,
    audioCodec,
    continuityChecked,
    corruptionScanPassed,
    issues,
  };
}

export function assertMathMediaReady(validation: MathMediaValidation): void {
  const readinessIssues = [...validation.issues];
  if (!validation.continuityChecked)
    readinessIssues.push("Packet continuity evidence is unavailable.");
  if (!validation.corruptionScanPassed)
    readinessIssues.push("FFmpeg corruption evidence is unavailable.");
  if (!validation.valid || readinessIssues.length > 0)
    throw new Error(
      `Math media readiness blocked: ${[...new Set(readinessIssues)].join(" ")}`
    );
}
