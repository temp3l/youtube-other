import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, fileExists, hashFile, hashText, writeJsonAtomic } from "@mediaforge/shared";
import { runCommand } from "@mediaforge/process-runner";
import {
  NARRATION_ARTIFACT_SCHEMA_VERSION,
  narrationMasteringMetadataSchema,
  type NarrationMasteringMetadata,
} from "./narration-schemas.js";
import type { ProbeAudioMetadata } from "./audio-validation.js";

export interface NarrationMasteringProfile {
  readonly id: "clean" | "render-ready" | "shorts" | "full-length" | string;
  readonly version: string;
  readonly enabled: boolean;
  readonly sampleRate: number;
  readonly codec: "pcm_s16le";
  readonly targetLoudnessLufs: number;
  readonly truePeakLimitDb: number;
  readonly highPassHz?: number;
  readonly correctiveEq?: {
    readonly frequencyHz: number;
    readonly gainDb: number;
    readonly width?: number;
  };
  readonly compression?: {
    readonly thresholdDb: number;
    readonly ratio: number;
    readonly attackMs: number;
    readonly releaseMs: number;
  };
  readonly deEss?: {
    readonly enabled: boolean;
    readonly frequencyHz: number;
    readonly width: number;
    readonly reductionDb: number;
  };
}

export type NarrationMasteringResult =
  | {
      readonly status: "completed";
      readonly metadata: NarrationMasteringMetadata;
      readonly outputPath: string;
      readonly outputHash: string;
    }
  | {
      readonly status: "failed";
      readonly metadata: NarrationMasteringMetadata;
      readonly cleanNarrationPreserved: boolean;
      readonly errorMessage: string;
    };

export interface MasterNarrationRequest {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly metadataPath: string;
  readonly narrationRoot: string;
  readonly profile: NarrationMasteringProfile;
  readonly createdAt?: string;
  readonly runFfmpeg?: (args: readonly string[]) => Promise<void>;
  readonly probeAudio?: (filePath: string) => Promise<ProbeAudioMetadata>;
  readonly logger?: {
    info(value: Record<string, unknown>, message?: string): void;
    warn?(value: Record<string, unknown>, message?: string): void;
  };
}

function relative(root: string, target: string): string {
  return path.relative(root, target).replace(/\\/gu, "/");
}

export function defaultNarrationMasteringProfiles(): readonly NarrationMasteringProfile[] {
  return [
    {
      id: "clean",
      version: "mastering-clean-v1",
      enabled: false,
      sampleRate: 48_000,
      codec: "pcm_s16le",
      targetLoudnessLufs: -18,
      truePeakLimitDb: -2,
    },
    {
      id: "render-ready",
      version: "mastering-render-ready-v1",
      enabled: true,
      sampleRate: 48_000,
      codec: "pcm_s16le",
      targetLoudnessLufs: -16,
      truePeakLimitDb: -1.5,
      highPassHz: 70,
      correctiveEq: { frequencyHz: 250, gainDb: -1.5, width: 1.2 },
      compression: { thresholdDb: -18, ratio: 1.6, attackMs: 12, releaseMs: 120 },
      deEss: { enabled: false, frequencyHz: 6500, width: 0.8, reductionDb: -1.5 },
    },
    {
      id: "shorts",
      version: "mastering-shorts-v1",
      enabled: true,
      sampleRate: 48_000,
      codec: "pcm_s16le",
      targetLoudnessLufs: -15,
      truePeakLimitDb: -1.5,
      highPassHz: 80,
      correctiveEq: { frequencyHz: 220, gainDb: -1, width: 1 },
      compression: { thresholdDb: -20, ratio: 1.8, attackMs: 10, releaseMs: 100 },
      deEss: { enabled: true, frequencyHz: 6500, width: 0.7, reductionDb: -1.5 },
    },
    {
      id: "full-length",
      version: "mastering-full-length-v1",
      enabled: true,
      sampleRate: 48_000,
      codec: "pcm_s16le",
      targetLoudnessLufs: -17,
      truePeakLimitDb: -2,
      highPassHz: 65,
      correctiveEq: { frequencyHz: 260, gainDb: -1, width: 1.1 },
      compression: { thresholdDb: -18, ratio: 1.4, attackMs: 15, releaseMs: 150 },
      deEss: { enabled: false, frequencyHz: 6500, width: 0.8, reductionDb: -1 },
    },
  ];
}

function validateProfile(profile: NarrationMasteringProfile): NarrationMasteringProfile {
  if (profile.sampleRate < 16_000 || profile.sampleRate > 96_000) {
    throw new Error("Mastering profile sample rate is outside the supported narration range.");
  }
  if (profile.targetLoudnessLufs < -24 || profile.targetLoudnessLufs > -12) {
    throw new Error("Mastering target loudness must remain conservative.");
  }
  if (profile.truePeakLimitDb > -1 || profile.truePeakLimitDb < -6) {
    throw new Error("True-peak limit must remain between -6 dB and -1 dB.");
  }
  if (profile.compression && (profile.compression.ratio > 2.5 || profile.compression.ratio < 1)) {
    throw new Error("Narration compression ratio must remain light.");
  }
  return profile;
}

export function buildNarrationMasteringFilters(profileInput: NarrationMasteringProfile): string {
  const profile = validateProfile(profileInput);
  const filters: string[] = [];
  if (profile.highPassHz !== undefined) {
    filters.push(`highpass=f=${profile.highPassHz}`);
  }
  if (profile.correctiveEq !== undefined) {
    filters.push(
      `equalizer=f=${profile.correctiveEq.frequencyHz}:width_type=o:width=${profile.correctiveEq.width ?? 1}:g=${profile.correctiveEq.gainDb}`
    );
  }
  if (profile.deEss?.enabled) {
    filters.push(
      `equalizer=f=${profile.deEss.frequencyHz}:width_type=o:width=${profile.deEss.width}:g=${profile.deEss.reductionDb}`
    );
  }
  if (profile.compression !== undefined) {
    filters.push(
      `acompressor=threshold=${profile.compression.thresholdDb}dB:ratio=${profile.compression.ratio}:attack=${profile.compression.attackMs}:release=${profile.compression.releaseMs}:makeup=1`
    );
  }
  filters.push(`loudnorm=I=${profile.targetLoudnessLufs}:TP=${profile.truePeakLimitDb}:LRA=11`);
  filters.push(`alimiter=limit=${Math.pow(10, profile.truePeakLimitDb / 20).toFixed(4)}`);
  return filters.join(",");
}

export function buildNarrationMasteringFfmpegArgs(input: {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly profile: NarrationMasteringProfile;
}): readonly string[] {
  const profile = validateProfile(input.profile);
  const args = ["-y", "-i", input.inputPath];
  if (profile.enabled) {
    args.push("-af", buildNarrationMasteringFilters(profile));
  }
  args.push("-ar", String(profile.sampleRate), "-ac", "1", "-c:a", profile.codec, input.outputPath);
  return args;
}

async function probeAudioWithFfprobe(filePath: string): Promise<ProbeAudioMetadata> {
  const result = await runCommand(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath],
    { timeoutMs: 30_000 }
  );
  return { durationSeconds: Number.parseFloat(result.stdout.trim()) };
}

function profileFingerprint(profile: NarrationMasteringProfile): string {
  return hashText(JSON.stringify(validateProfile(profile)));
}

async function writeMetadata(input: {
  readonly request: MasterNarrationRequest;
  readonly inputHash: string;
  readonly inputDurationMs: number;
  readonly outputDurationMs?: number;
  readonly outputHash?: string;
  readonly status: "completed" | "failed";
  readonly warnings: readonly { readonly code: string; readonly message: string }[];
}): Promise<NarrationMasteringMetadata> {
  const metadata = narrationMasteringMetadataSchema.parse({
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    inputPath: relative(input.request.narrationRoot, input.request.inputPath),
    inputHash: input.inputHash,
    masteringProfileName: input.request.profile.id,
    masteringProfileVersion: input.request.profile.version,
    masteringConfigurationFingerprint: profileFingerprint(input.request.profile),
    ...(input.status === "completed"
      ? {
          outputPath: relative(input.request.narrationRoot, input.request.outputPath),
          outputHash: input.outputHash,
        }
      : {}),
    inputDurationMs: input.inputDurationMs,
    ...(input.outputDurationMs !== undefined ? { outputDurationMs: input.outputDurationMs } : {}),
    targetLoudnessLufs: input.request.profile.targetLoudnessLufs,
    truePeakTargetDb: input.request.profile.truePeakLimitDb,
    sampleRate: input.request.profile.sampleRate,
    codec: input.request.profile.codec,
    status: input.status,
    warnings: input.warnings,
    createdAt: input.request.createdAt ?? new Date().toISOString(),
  });
  await writeJsonAtomic(input.request.metadataPath, metadata);
  return metadata;
}

export async function masterNarration(request: MasterNarrationRequest): Promise<NarrationMasteringResult> {
  const profile = validateProfile(request.profile);
  const inputHash = await hashFile(request.inputPath);
  const inputProbe = await (request.probeAudio ?? probeAudioWithFfprobe)(request.inputPath);
  const inputDurationMs = Math.max(0, inputProbe.durationSeconds * 1000);
  await ensureDir(path.dirname(request.outputPath));
  const tempPath = path.join(path.dirname(request.outputPath), `${path.basename(request.outputPath)}.${process.pid}.${Date.now()}.tmp.wav`);
  try {
    const args = buildNarrationMasteringFfmpegArgs({
      inputPath: request.inputPath,
      outputPath: tempPath,
      profile,
    });
    await (request.runFfmpeg ?? ((ffmpegArgs) => runCommand("ffmpeg", ffmpegArgs, { timeoutMs: 300_000 }).then(() => undefined)))(args);
    const outputProbe = await (request.probeAudio ?? probeAudioWithFfprobe)(tempPath);
    if (!Number.isFinite(outputProbe.durationSeconds) || outputProbe.durationSeconds <= 0) {
      throw new Error("Mastered narration output is not decodable.");
    }
    const outputHash = await hashFile(tempPath);
    await fs.rename(tempPath, request.outputPath);
    const metadata = await writeMetadata({
      request,
      inputHash,
      inputDurationMs,
      outputDurationMs: outputProbe.durationSeconds * 1000,
      outputHash,
      status: "completed",
      warnings: profile.enabled ? [] : [{ code: "MASTERING_DISABLED", message: "Profile leaves clean narration unchanged." }],
    });
    request.logger?.info(
      {
        profile: profile.id,
        inputDurationMs,
        outputDurationMs: outputProbe.durationSeconds * 1000,
        targetLoudnessLufs: profile.targetLoudnessLufs,
        outputPath: request.outputPath,
      },
      "Mastered narration."
    );
    return { status: "completed", metadata, outputPath: request.outputPath, outputHash };
  } catch (error) {
    const metadata = await writeMetadata({
      request,
      inputHash,
      inputDurationMs,
      status: "failed",
      warnings: [
        {
          code: "MASTERING_FAILED",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    });
    request.logger?.warn?.({ profile: profile.id, outputPath: request.outputPath }, "Narration mastering failed.");
    return {
      status: "failed",
      metadata,
      cleanNarrationPreserved: await fileExists(request.inputPath),
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
}
