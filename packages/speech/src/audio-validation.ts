import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  countSpokenWords,
  hashFile,
  hashText,
  writeJsonAtomic,
} from "@mediaforge/shared";
import { runCommandJson } from "@mediaforge/process-runner";
import {
  LANGUAGE_PROFILES,
  type LanguageCode,
} from "@mediaforge/story-localization";
import {
  NARRATION_ARTIFACT_SCHEMA_VERSION,
  type ChunkValidationReport,
  type NarrationVariant,
  narrationChunkValidationReportSchema,
} from "./narration-schemas.js";
import {
  analyzeWavQuality,
  parseWavMetadata,
  type WavMetadata,
} from "./wav-analysis.js";

export interface AudioValidationFinding {
  readonly code: string;
  readonly severity: "error" | "warning" | "info";
  readonly message: string;
  readonly measuredValue?: number | string | boolean;
  readonly expectedBound?: number | string | boolean;
}

export interface AudioValidationMetrics {
  readonly durationMs?: number;
  readonly expectedDurationRangeMs?: { readonly minMs: number; readonly maxMs: number };
  readonly sampleRate?: number;
  readonly channels?: number;
  readonly silencePercentage?: number;
  readonly leadingSilenceMs?: number;
  readonly trailingSilenceMs?: number;
  readonly peakDb?: number;
  readonly truePeakDb?: number;
  readonly rmsDb?: number;
  readonly decodable: boolean;
}

export interface ProbeAudioMetadata {
  readonly durationSeconds: number;
  readonly sampleRate?: number;
  readonly channels?: number;
  readonly codecName?: string;
}

export interface ValidateChunkAudioRequest {
  readonly chunkId: string;
  readonly audioPath: string;
  readonly narrationRoot: string;
  readonly expectedText?: string;
  readonly language?: string;
  readonly variant?: NarrationVariant;
  readonly expectedDurationMs?: number;
  readonly requestFingerprint?: string;
  readonly generationFingerprint?: string;
  readonly outputPath?: string;
  readonly createdAt?: string;
  readonly probeAudio?: (filePath: string) => Promise<ProbeAudioMetadata>;
  readonly logger?: {
    info(value: Record<string, unknown>, message?: string): void;
    warn?(value: Record<string, unknown>, message?: string): void;
  };
}

type MutableAudioValidationMetrics = {
  -readonly [Key in keyof AudioValidationMetrics]: AudioValidationMetrics[Key];
};

const ffprobeSchema = z
  .object({
    streams: z
      .array(
        z
          .object({
            codec_type: z.string().optional(),
            codec_name: z.string().optional(),
            duration: z.string().optional(),
            sample_rate: z.string().optional(),
            channels: z.number().int().optional(),
          })
          .passthrough()
      )
      .optional(),
    format: z.object({ duration: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

function isPathUnderRoot(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function relativePath(root: string, target: string): string {
  return path.relative(root, target).replace(/\\/gu, "/");
}

async function probeAudioWithFfprobe(filePath: string): Promise<ProbeAudioMetadata> {
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
    { timeoutMs: 30_000 },
    (value: unknown) => ffprobeSchema.parse(value)
  );
  const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
  const durationSeconds = Number.parseFloat(audio?.duration ?? probe.format?.duration ?? "0");
  const sampleRate = Number.parseInt(audio?.sample_rate ?? "", 10);
  return {
    durationSeconds,
    ...(Number.isFinite(sampleRate) && sampleRate > 0 ? { sampleRate } : {}),
    ...(audio?.channels !== undefined ? { channels: audio.channels } : {}),
    ...(audio?.codec_name ? { codecName: audio.codec_name } : {}),
  };
}

function languageWpm(language: string | undefined, variant: NarrationVariant | undefined): number {
  const normalized = (language ?? "en").toLowerCase().split("-", 1)[0] ?? "en";
  if (normalized === "en" || normalized === "de" || normalized === "es" || normalized === "fr" || normalized === "pt") {
    const profile = LANGUAGE_PROFILES[normalized as LanguageCode];
    return variant === "short" ? profile.shortNarrationWpm : profile.fullNarrationWpm;
  }
  return 170;
}

function expectedRange(expectedDurationMs: number | undefined): { readonly minMs: number; readonly maxMs: number } | undefined {
  if (expectedDurationMs === undefined) {
    return undefined;
  }
  return {
    minMs: Math.max(500, expectedDurationMs * 0.45),
    maxMs: expectedDurationMs * 2.5,
  };
}

function wavSilenceMetrics(buffer: Buffer, metadata: WavMetadata): {
  readonly silencePercentage: number;
  readonly leadingSilenceMs: number;
  readonly trailingSilenceMs: number;
} {
  const sampleCount = metadata.dataSize / 2;
  const threshold = 256;
  let silentSamples = 0;
  let leading = 0;
  while (leading < sampleCount && Math.abs(buffer.readInt16LE(metadata.dataOffset + leading * 2)) <= threshold) {
    leading += 1;
  }
  let trailing = 0;
  while (trailing < sampleCount - leading && Math.abs(buffer.readInt16LE(metadata.dataOffset + (sampleCount - 1 - trailing) * 2)) <= threshold) {
    trailing += 1;
  }
  for (let index = 0; index < sampleCount; index += 1) {
    if (Math.abs(buffer.readInt16LE(metadata.dataOffset + index * 2)) <= threshold) {
      silentSamples += 1;
    }
  }
  const samplesPerMs = metadata.sampleRate * metadata.channels / 1000;
  return {
    silencePercentage: silentSamples / Math.max(1, sampleCount),
    leadingSilenceMs: leading / samplesPerMs,
    trailingSilenceMs: trailing / samplesPerMs,
  };
}

function addDurationFindings(
  findings: AudioValidationFinding[],
  durationMs: number | undefined,
  range: { readonly minMs: number; readonly maxMs: number } | undefined
): void {
  if (durationMs === undefined || range === undefined) {
    return;
  }
  if (durationMs < range.minMs || durationMs > range.maxMs) {
    findings.push({
      code: "AUDIO_DURATION_OUTSIDE_HARD_RANGE",
      severity: "error",
      message: "Audio duration is outside the hard acceptable range.",
      measuredValue: durationMs,
      expectedBound: `${range.minMs}-${range.maxMs}`,
    });
    return;
  }
  const center = (range.minMs / 0.45);
  if (Math.abs(durationMs - center) > center * 0.15) {
    findings.push({
      code: "AUDIO_DURATION_DRIFT",
      severity: "warning",
      message: "Audio duration differs from the expected duration but remains usable.",
      measuredValue: durationMs,
      expectedBound: center,
    });
  }
}

function addWpmFindings(
  findings: AudioValidationFinding[],
  text: string | undefined,
  durationMs: number | undefined,
  language: string | undefined,
  variant: NarrationVariant | undefined
): void {
  if (text === undefined || durationMs === undefined || durationMs <= 0) {
    return;
  }
  const wpm = (countSpokenWords(text) / (durationMs / 1000)) * 60;
  const expected = languageWpm(language, variant);
  if (wpm < 40 || wpm > 360) {
    findings.push({
      code: "AUDIO_WPM_IMPLAUSIBLE",
      severity: "error",
      message: "Measured words per minute is implausible for narration.",
      measuredValue: wpm,
      expectedBound: `${Math.round(expected * 0.5)}-${Math.round(expected * 1.8)}`,
    });
  } else if (wpm < expected * 0.55 || wpm > expected * 1.55) {
    findings.push({
      code: "AUDIO_WPM_UNUSUAL",
      severity: "warning",
      message: "Measured words per minute is unusual for the language profile.",
      measuredValue: wpm,
      expectedBound: expected,
    });
  }
}

function validationStatus(findings: readonly AudioValidationFinding[]): "passed" | "warning" | "failed" {
  if (findings.some((finding) => finding.severity === "error")) {
    return "failed";
  }
  if (findings.some((finding) => finding.severity === "warning")) {
    return "warning";
  }
  return "passed";
}

function reportPathFor(request: ValidateChunkAudioRequest): string {
  return request.outputPath ?? path.join(request.narrationRoot, "chunks", `${request.chunkId}.validation.json`);
}

function reportAudioPath(root: string, audioPath: string): string {
  return isPathUnderRoot(root, audioPath) ? relativePath(root, audioPath) : path.basename(audioPath);
}

export async function validateChunkAudio(
  request: ValidateChunkAudioRequest
): Promise<ChunkValidationReport> {
  const outputPath = reportPathFor(request);
  const findings: AudioValidationFinding[] = [];
  const metrics: MutableAudioValidationMetrics = { decodable: false };
  let audioHash = hashText("");

  if (!isPathUnderRoot(request.narrationRoot, request.audioPath) || !isPathUnderRoot(request.narrationRoot, outputPath)) {
    findings.push({
      code: "AUDIO_PATH_OUTSIDE_ARTIFACT_ROOT",
      severity: "error",
      message: "Audio validation paths must remain under the narration artifact root.",
    });
  } else {
    try {
      await fs.access(request.audioPath);
      audioHash = await hashFile(request.audioPath);
      const probed = await (request.probeAudio ?? probeAudioWithFfprobe)(request.audioPath);
      if (!Number.isFinite(probed.durationSeconds) || probed.durationSeconds <= 0) {
        findings.push({
          code: "AUDIO_DURATION_UNREADABLE",
          severity: "error",
          message: "Audio duration could not be decoded.",
        });
      } else {
        metrics.durationMs = probed.durationSeconds * 1000;
        metrics.decodable = true;
      }
      if (probed.sampleRate !== undefined) {
        metrics.sampleRate = probed.sampleRate;
        if (probed.sampleRate < 16_000) {
          findings.push({
            code: "AUDIO_SAMPLE_RATE_LOW",
            severity: "error",
            message: "Audio sample rate is below the hard minimum.",
            measuredValue: probed.sampleRate,
            expectedBound: 16_000,
          });
        }
      }
      if (probed.channels !== undefined) {
        metrics.channels = probed.channels;
        if (probed.channels < 1) {
          findings.push({
            code: "AUDIO_CHANNELS_INVALID",
            severity: "error",
            message: "Audio has no decodable channel.",
            measuredValue: probed.channels,
          });
        } else if (probed.channels > 2) {
          findings.push({
            code: "AUDIO_CHANNELS_UNUSUAL",
            severity: "warning",
            message: "Audio channel count is unusual for narration.",
            measuredValue: probed.channels,
            expectedBound: "1-2",
          });
        }
      }
      const range = expectedRange(request.expectedDurationMs);
      if (range) {
        metrics.expectedDurationRangeMs = range;
      }
      addDurationFindings(findings, metrics.durationMs, range);
      addWpmFindings(findings, request.expectedText, metrics.durationMs, request.language, request.variant);

      if (path.extname(request.audioPath).toLowerCase() === ".wav") {
        const buffer = await fs.readFile(request.audioPath);
        const wav = parseWavMetadata(request.audioPath, buffer);
        const quality = analyzeWavQuality(buffer, wav);
        const silence = wavSilenceMetrics(buffer, wav);
        metrics.sampleRate = wav.sampleRate;
        metrics.channels = wav.channels;
        if (Number.isFinite(quality.peakDb)) {
          metrics.peakDb = quality.peakDb;
          metrics.truePeakDb = quality.peakDb;
        }
        if (Number.isFinite(quality.rmsDb)) {
          metrics.rmsDb = quality.rmsDb;
        }
        metrics.silencePercentage = silence.silencePercentage;
        metrics.leadingSilenceMs = silence.leadingSilenceMs;
        metrics.trailingSilenceMs = silence.trailingSilenceMs;
        if (quality.clippedRatio > 0.02) {
          findings.push({
            code: "AUDIO_CLIPPING",
            severity: quality.clippedRatio > 0.05 ? "error" : "warning",
            message: "Audio contains clipped samples.",
            measuredValue: quality.clippedRatio,
            expectedBound: 0.02,
          });
        }
        if (silence.silencePercentage > 0.8) {
          findings.push({
            code: "AUDIO_MOSTLY_SILENT",
            severity: "error",
            message: "Audio is mostly silent.",
            measuredValue: silence.silencePercentage,
            expectedBound: 0.8,
          });
        }
      } else {
        findings.push({
          code: "AUDIO_WAVEFORM_SCAN_SKIPPED",
          severity: "info",
          message: "Waveform scan skipped because metadata was sufficient for a non-WAV file.",
        });
      }
    } catch (error) {
      findings.push({
        code: "AUDIO_DECODE_FAILED",
        severity: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const report = narrationChunkValidationReportSchema.parse({
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    chunkId: request.chunkId,
    ...(request.requestFingerprint ? { requestFingerprint: request.requestFingerprint } : {}),
    ...(request.generationFingerprint ? { generationFingerprint: request.generationFingerprint } : {}),
    audioPath: reportAudioPath(request.narrationRoot, request.audioPath),
    audioHash,
    validationStatus: validationStatus(findings),
    metrics,
    findings,
    createdAt: request.createdAt ?? new Date().toISOString(),
  });
  await writeJsonAtomic(outputPath, report);
  request.logger?.info(
    {
      chunkId: request.chunkId,
      validationStatus: report.validationStatus,
      durationMs: report.metrics.durationMs,
      warningCount: report.findings.filter((finding) => finding.severity === "warning").length,
      errorCount: report.findings.filter((finding) => finding.severity === "error").length,
    },
    "Validated narration chunk audio."
  );
  return report;
}
