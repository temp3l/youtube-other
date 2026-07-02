import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, fileExists, hashFile, hashText, writeJsonAtomic } from "@mediaforge/shared";
import { runCommand } from "@mediaforge/process-runner";
import {
  NARRATION_ARTIFACT_SCHEMA_VERSION,
  narrationAssemblyManifestSchema,
  narrationChunkManifestSchema,
  narrationChunkValidationReportSchema,
  narrationDirectionSetSchema,
  type NarrationAssemblyManifest,
  type NarrationChunkManifest,
  type NarrationChunkValidationReport,
  type NarrationDirectionSet,
} from "./narration-schemas.js";
import type { NarrationChunkCacheRecord } from "./narration-cache.js";
import type { ProbeAudioMetadata } from "./audio-validation.js";

export interface NarrationAssemblyConfig {
  readonly trimLeadingSilenceMs?: number;
  readonly trimTrailingSilenceMs?: number;
  readonly retainBoundarySilenceMs?: number;
  readonly pauseScale?: number;
  readonly maxInsertedPauseMs?: number;
  readonly crossfade?: {
    readonly enabled: boolean;
    readonly durationMs: number;
    readonly equalPower?: boolean;
  };
}

export interface NarrationAssemblyEntry {
  readonly chunkId: string;
  readonly sequence: number;
  readonly inputPath: string;
  readonly durationMs: number;
  readonly leadingTrimMs: number;
  readonly trailingTrimMs: number;
  readonly retainedLeadingSilenceMs: number;
  readonly retainedTrailingSilenceMs: number;
  readonly insertedPauseMs: number;
  readonly validation: NarrationChunkValidationReport;
  readonly cacheRecord: NarrationChunkCacheRecord;
  readonly crossfadeDurationMs: number;
}

export type NarrationAssemblyResult =
  | {
      readonly status: "completed";
      readonly manifest: NarrationAssemblyManifest;
      readonly outputPath: string;
      readonly outputHash: string;
      readonly durationMs: number;
      readonly warnings: readonly string[];
    }
  | {
      readonly status: "blocked";
      readonly errors: readonly string[];
      readonly warnings: readonly string[];
      readonly previousOutputPreserved: boolean;
    };

export interface AssembleNarrationRequest {
  readonly narrationRoot: string;
  readonly chunkManifest: NarrationChunkManifest;
  readonly directionSet: NarrationDirectionSet;
  readonly cacheRecords: readonly NarrationChunkCacheRecord[];
  readonly validationReports: readonly NarrationChunkValidationReport[];
  readonly outputPath: string;
  readonly manifestPath: string;
  readonly config?: NarrationAssemblyConfig;
  readonly createdAt?: string;
  readonly runFfmpeg?: (args: readonly string[]) => Promise<void>;
  readonly probeAudio?: (filePath: string) => Promise<ProbeAudioMetadata>;
  readonly logger?: {
    info(value: Record<string, unknown>, message?: string): void;
    warn?(value: Record<string, unknown>, message?: string): void;
  };
}

const defaultAssemblyConfig = {
  trimLeadingSilenceMs: 120,
  trimTrailingSilenceMs: 160,
  retainBoundarySilenceMs: 80,
  pauseScale: 1,
  maxInsertedPauseMs: 1_250,
  crossfade: {
    enabled: false,
    durationMs: 40,
    equalPower: true,
  },
} satisfies Required<NarrationAssemblyConfig>;

function relative(root: string, target: string): string {
  return path.relative(root, target).replace(/\\/gu, "/");
}

function resolveUnderRoot(root: string, filePath: string): string {
  const resolved = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(root, filePath);
  const resolvedRoot = path.resolve(root);
  const relativePath = path.relative(resolvedRoot, resolved);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Narration assembly path escapes root: ${filePath}`);
  }
  return resolved;
}

function mergedConfig(config: NarrationAssemblyConfig | undefined): Required<NarrationAssemblyConfig> {
  return {
    trimLeadingSilenceMs: config?.trimLeadingSilenceMs ?? defaultAssemblyConfig.trimLeadingSilenceMs,
    trimTrailingSilenceMs: config?.trimTrailingSilenceMs ?? defaultAssemblyConfig.trimTrailingSilenceMs,
    retainBoundarySilenceMs: config?.retainBoundarySilenceMs ?? defaultAssemblyConfig.retainBoundarySilenceMs,
    pauseScale: config?.pauseScale ?? defaultAssemblyConfig.pauseScale,
    maxInsertedPauseMs: config?.maxInsertedPauseMs ?? defaultAssemblyConfig.maxInsertedPauseMs,
    crossfade: {
      enabled: config?.crossfade?.enabled ?? defaultAssemblyConfig.crossfade.enabled,
      durationMs: config?.crossfade?.durationMs ?? defaultAssemblyConfig.crossfade.durationMs,
      equalPower: config?.crossfade?.equalPower ?? defaultAssemblyConfig.crossfade.equalPower,
    },
  };
}

function indexedByChunkId<T extends { readonly chunkId: string }>(
  values: readonly T[],
  label: string,
  errors: string[]
): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    if (result.has(value.chunkId)) {
      errors.push(`Duplicate ${label} for ${value.chunkId}.`);
      continue;
    }
    result.set(value.chunkId, value);
  }
  return result;
}

function validateManifestOrder(manifest: NarrationChunkManifest, errors: string[]): void {
  const expected = [...manifest.chunks].sort((left, right) => left.sequence - right.sequence);
  for (const [index, chunk] of expected.entries()) {
    if (chunk.sequence !== index) {
      errors.push(`Chunk sequence is not contiguous at ${chunk.chunkId}.`);
    }
  }
  if (manifest.chunks.some((chunk, index) => chunk.sequence !== index)) {
    errors.push("Chunk manifest entries are not stored in explicit sequence order.");
  }
}

export function buildNarrationAssemblyEntries(input: {
  readonly narrationRoot: string;
  readonly chunkManifest: NarrationChunkManifest;
  readonly directionSet: NarrationDirectionSet;
  readonly cacheRecords: readonly NarrationChunkCacheRecord[];
  readonly validationReports: readonly NarrationChunkValidationReport[];
  readonly config?: NarrationAssemblyConfig;
}): { readonly entries: readonly NarrationAssemblyEntry[]; readonly errors: readonly string[]; readonly warnings: readonly string[] } {
  const chunkManifest = narrationChunkManifestSchema.parse(input.chunkManifest);
  const directionSet = narrationDirectionSetSchema.parse(input.directionSet);
  const validationReports = input.validationReports.map((report) => narrationChunkValidationReportSchema.parse(report));
  const config = mergedConfig(input.config);
  const errors: string[] = [];
  const warnings: string[] = [];
  validateManifestOrder(chunkManifest, errors);
  if (directionSet.manifestFingerprint !== chunkManifest.manifestFingerprint) {
    errors.push("Direction set fingerprint does not match the chunk manifest.");
  }
  const directions = indexedByChunkId(directionSet.directions, "direction", errors);
  const records = indexedByChunkId(input.cacheRecords, "cache record", errors);
  const validations = indexedByChunkId(validationReports, "validation report", errors);
  const entries: NarrationAssemblyEntry[] = [];
  for (const chunk of chunkManifest.chunks) {
    const direction = directions.get(chunk.chunkId);
    const record = records.get(chunk.chunkId);
    const validation = validations.get(chunk.chunkId);
    if (!direction) {
      errors.push(`Missing direction for ${chunk.chunkId}.`);
      continue;
    }
    if (!record) {
      errors.push(`Missing cache record for ${chunk.chunkId}.`);
      continue;
    }
    if (!validation) {
      errors.push(`Missing validation report for ${chunk.chunkId}.`);
      continue;
    }
    if (record.validationStatus === "passed" && validation.validationStatus === "warning") {
      warnings.push(`Cache record validation status is older than report status for ${chunk.chunkId}.`);
    }
    if (record.validationStatus !== validation.validationStatus) {
      errors.push(`Cache record validation status disagrees with report for ${chunk.chunkId}.`);
    }
    if (validation.validationStatus === "failed") {
      errors.push(`Chunk ${chunk.chunkId} failed audio validation.`);
    }
    if (validation.audioHash !== record.outputHash) {
      errors.push(`Validation hash disagrees with cache output for ${chunk.chunkId}.`);
    }
    if (record.chunkFingerprint !== validation.generationFingerprint) {
      errors.push(`Validation fingerprint disagrees with cache record for ${chunk.chunkId}.`);
    }
    const durationMs = validation.metrics.durationMs;
    if (durationMs === undefined || durationMs <= 0) {
      errors.push(`Chunk ${chunk.chunkId} does not have a valid measured duration.`);
      continue;
    }
    const inputPath = resolveUnderRoot(input.narrationRoot, record.outputPath);
    const leadingSilenceMs = validation.metrics.leadingSilenceMs ?? 0;
    const trailingSilenceMs = validation.metrics.trailingSilenceMs ?? 0;
    const retainedLeadingSilenceMs = Math.min(config.retainBoundarySilenceMs, leadingSilenceMs);
    const retainedTrailingSilenceMs = Math.min(config.retainBoundarySilenceMs, trailingSilenceMs);
    const leadingTrimMs = Math.min(config.trimLeadingSilenceMs, Math.max(0, leadingSilenceMs - retainedLeadingSilenceMs));
    const trailingTrimMs = Math.min(config.trimTrailingSilenceMs, Math.max(0, trailingSilenceMs - retainedTrailingSilenceMs));
    const insertedPauseMs = Math.min(
      config.maxInsertedPauseMs,
      Math.max(0, Math.round(direction.pauseAfterMs * config.pauseScale))
    );
    const crossfadeDurationMs =
      config.crossfade.enabled && insertedPauseMs === 0
        ? Math.min(config.crossfade.durationMs, retainedTrailingSilenceMs, retainedLeadingSilenceMs)
        : 0;
    entries.push({
      chunkId: chunk.chunkId,
      sequence: chunk.sequence,
      inputPath,
      durationMs,
      leadingTrimMs,
      trailingTrimMs,
      retainedLeadingSilenceMs,
      retainedTrailingSilenceMs,
      insertedPauseMs,
      validation,
      cacheRecord: record,
      crossfadeDurationMs,
    });
  }
  for (const key of directions.keys()) {
    if (!chunkManifest.chunks.some((chunk) => chunk.chunkId === key)) {
      errors.push(`Unexpected direction for ${key}.`);
    }
  }
  for (const key of records.keys()) {
    if (!chunkManifest.chunks.some((chunk) => chunk.chunkId === key)) {
      errors.push(`Unexpected cache record for ${key}.`);
    }
  }
  return { entries, errors, warnings };
}

function seconds(valueMs: number): string {
  return (valueMs / 1000).toFixed(3);
}

export function buildNarrationAssemblyFfmpegArgs(input: {
  readonly entries: readonly NarrationAssemblyEntry[];
  readonly outputPath: string;
  readonly sampleRate?: number;
  readonly crossfadeEqualPower?: boolean;
}): readonly string[] {
  const sampleRate = input.sampleRate ?? 48_000;
  const args: string[] = ["-y"];
  for (const entry of input.entries) {
    args.push("-i", entry.inputPath);
  }
  const filters: string[] = [];
  const concatInputs: string[] = [];
  for (const [index, entry] of input.entries.entries()) {
    const startMs = entry.leadingTrimMs;
    const endMs = Math.max(startMs + 1, entry.durationMs - entry.trailingTrimMs);
    filters.push(`[${index}:a]atrim=start=${seconds(startMs)}:end=${seconds(endMs)},asetpts=PTS-STARTPTS[a${index}]`);
    concatInputs.push(`[a${index}]`);
    if (entry.insertedPauseMs > 0 && index < input.entries.length - 1) {
      filters.push(`anullsrc=r=${sampleRate}:cl=mono:d=${seconds(entry.insertedPauseMs)}[s${index}]`);
      concatInputs.push(`[s${index}]`);
    }
  }
  const hasCrossfades = input.entries.some((entry) => entry.crossfadeDurationMs > 0);
  if (hasCrossfades && input.entries.length > 1 && concatInputs.length === input.entries.length) {
    let previousLabel = "a0";
    for (let index = 1; index < input.entries.length; index += 1) {
      const durationMs = Math.min(input.entries[index - 1]?.crossfadeDurationMs ?? 0, input.entries[index]?.crossfadeDurationMs ?? 0);
      const outputLabel = index === input.entries.length - 1 ? "out" : `xf${index}`;
      const curve = input.crossfadeEqualPower ? ":c1=qsin:c2=qsin" : "";
      filters.push(`[${previousLabel}][a${index}]acrossfade=d=${seconds(durationMs)}${curve}[${outputLabel}]`);
      previousLabel = outputLabel;
    }
  } else {
    filters.push(`${concatInputs.join("")}concat=n=${concatInputs.length}:v=0:a=1[out]`);
  }
  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[out]",
    "-ar",
    String(sampleRate),
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    input.outputPath
  );
  return args;
}

async function probeAudioWithFfprobe(filePath: string): Promise<ProbeAudioMetadata> {
  const result = await runCommand(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath],
    { timeoutMs: 30_000 }
  );
  const durationSeconds = Number.parseFloat(result.stdout.trim());
  return { durationSeconds };
}

export async function assembleNarration(request: AssembleNarrationRequest): Promise<NarrationAssemblyResult> {
  const built = buildNarrationAssemblyEntries(request);
  const previousOutputPreserved = await fileExists(request.outputPath);
  if (built.errors.length > 0) {
    request.logger?.warn?.({ errors: built.errors, outputPath: request.outputPath }, "Narration assembly blocked.");
    return {
      status: "blocked",
      errors: built.errors,
      warnings: built.warnings,
      previousOutputPreserved,
    };
  }
  for (const entry of built.entries) {
    if (!(await fileExists(entry.inputPath))) {
      return {
        status: "blocked",
        errors: [`Missing audio file for ${entry.chunkId}.`],
        warnings: built.warnings,
        previousOutputPreserved,
      };
    }
  }
  await ensureDir(path.dirname(request.outputPath));
  const tempPath = path.join(path.dirname(request.outputPath), `${path.basename(request.outputPath)}.${process.pid}.${Date.now()}.tmp.wav`);
  try {
    const assemblyFfmpegRequest = {
      entries: built.entries,
      outputPath: tempPath,
      ...(mergedConfig(request.config).crossfade.equalPower !== undefined
        ? { crossfadeEqualPower: mergedConfig(request.config).crossfade.equalPower }
        : {}),
    };
    const args = buildNarrationAssemblyFfmpegArgs(assemblyFfmpegRequest);
    await (request.runFfmpeg ?? ((ffmpegArgs) => runCommand("ffmpeg", ffmpegArgs, { timeoutMs: 300_000 }).then(() => undefined)))(args);
    const probed = await (request.probeAudio ?? probeAudioWithFfprobe)(tempPath);
    if (!Number.isFinite(probed.durationSeconds) || probed.durationSeconds <= 0) {
      return {
        status: "blocked",
        errors: ["Assembled narration output is not decodable."],
        warnings: built.warnings,
        previousOutputPreserved,
      };
    }
    const outputHash = await hashFile(tempPath);
    await fs.rename(tempPath, request.outputPath);
    const manifestWithoutFingerprint = {
      schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
      episodeId: request.chunkManifest.episodeId,
      locale: request.chunkManifest.locale,
      variant: request.chunkManifest.variant,
      chunkManifestFingerprint: request.chunkManifest.manifestFingerprint,
      directionSetFingerprint: request.directionSet.setFingerprint,
      entries: built.entries.map((entry) => ({
        chunkId: entry.chunkId,
        sequence: entry.sequence,
        validatedAudioPath: relative(request.narrationRoot, entry.inputPath),
        audioHash: entry.validation.audioHash,
        retainedLeadingSilenceMs: entry.retainedLeadingSilenceMs,
        retainedTrailingSilenceMs: entry.retainedTrailingSilenceMs,
        insertedPauseMs: entry.insertedPauseMs,
        ...(entry.crossfadeDurationMs > 0
          ? {
              crossfade: {
                enabled: true,
                durationMs: entry.crossfadeDurationMs,
                curve: mergedConfig(request.config).crossfade.equalPower ? "equal-power" : "linear",
              },
            }
          : {}),
        validationAcceptanceStatus: entry.validation.validationStatus === "passed" ? "accepted" : "accepted_with_warnings",
      })),
      cleanOutputPath: relative(request.narrationRoot, request.outputPath),
      assemblyFingerprint: hashText("pending"),
      createdAt: request.createdAt ?? new Date().toISOString(),
    };
    const manifest = narrationAssemblyManifestSchema.parse({
      ...manifestWithoutFingerprint,
      assemblyFingerprint: hashText(JSON.stringify({ ...manifestWithoutFingerprint, outputHash })),
    });
    await writeJsonAtomic(request.manifestPath, manifest);
    request.logger?.info(
      {
        inputChunkCount: built.entries.length,
        outputDurationMs: probed.durationSeconds * 1000,
        crossfadeCount: built.entries.filter((entry) => entry.crossfadeDurationMs > 0).length,
        insertedSilenceMs: built.entries.reduce((sum, entry) => sum + entry.insertedPauseMs, 0),
        validationStatus: "passed",
      },
      "Assembled clean narration."
    );
    return {
      status: "completed",
      manifest,
      outputPath: request.outputPath,
      outputHash,
      durationMs: probed.durationSeconds * 1000,
      warnings: built.warnings,
    };
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
}
