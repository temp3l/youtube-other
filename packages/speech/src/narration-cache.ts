import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  ensureDir,
  fileExists,
  hashFile,
  hashText,
  readJsonIfExists,
  writeJsonAtomic,
} from "@mediaforge/shared";
import {
  NARRATION_ARTIFACT_SCHEMA_VERSION,
  narrationChunkValidationReportSchema,
  type NarrationChunk,
  type NarrationChunkValidationReport,
  type NarrationDirection,
} from "./narration-schemas.js";
import type {
  OpenAiTtsRequestBuildResult,
  OpenAiSpeechOutputFormat,
} from "./openai-tts-request.js";

export const NARRATION_CHUNK_CACHE_SCHEMA_VERSION = "narration-chunk-cache-v1" as const;

export type NarrationChunkCacheDecisionReason =
  | "hit"
  | "miss"
  | "stale_metadata"
  | "invalid_output"
  | "validation_failure"
  | "provider_failure";

export interface NarrationChunkFingerprintInput {
  readonly schemaVersion: string;
  readonly promptVersion: string;
  readonly chunkId: string;
  readonly text: string;
  readonly textHash: string;
  readonly previousContext: string;
  readonly nextContext: string;
  readonly model: string;
  readonly voice: string;
  readonly speed: number;
  readonly outputFormat: OpenAiSpeechOutputFormat;
  readonly language: string;
  readonly locale: string;
  readonly instructions: string;
  readonly direction: NarrationDirection;
  readonly pronunciationHints: readonly string[];
  readonly requestFingerprint: string;
}

export interface NarrationChunkCacheRecord {
  readonly schemaVersion: typeof NARRATION_CHUNK_CACHE_SCHEMA_VERSION;
  readonly artifactSchemaVersion: typeof NARRATION_ARTIFACT_SCHEMA_VERSION;
  readonly chunkId: string;
  readonly chunkFingerprint: string;
  readonly requestFingerprint: string;
  readonly inputTextHash: string;
  readonly instructionHash: string;
  readonly model: string;
  readonly voice: string;
  readonly speed: number;
  readonly outputFormat: OpenAiSpeechOutputFormat;
  readonly language: string;
  readonly outputPath: string;
  readonly outputHash: string;
  readonly validationPath: string;
  readonly validationHash: string;
  readonly validationStatus: "passed" | "warning";
  readonly durationMs?: number | undefined;
  readonly createdAt: string;
}

export interface NarrationChunkCacheDecision {
  readonly reason: NarrationChunkCacheDecisionReason;
  readonly reusable: boolean;
  readonly chunkId: string;
  readonly chunkFingerprint: string;
  readonly record?: NarrationChunkCacheRecord;
  readonly outputPath?: string;
  readonly outputHash?: string;
  readonly message?: string;
}

export interface NarrationGenerationManifest {
  readonly schemaVersion: typeof NARRATION_CHUNK_CACHE_SCHEMA_VERSION;
  readonly records: readonly NarrationChunkCacheRecord[];
  readonly staleArtifacts: readonly NarrationChunkCacheDecision[];
  readonly generatedAt: string;
}

export interface AssessNarrationChunkCacheRequest {
  readonly narrationRoot: string;
  readonly chunkId: string;
  readonly chunkFingerprint: string;
  readonly outputPath?: string;
  readonly recordPath?: string;
}

export interface PromoteNarrationChunkRequest {
  readonly narrationRoot: string;
  readonly chunkId: string;
  readonly chunkFingerprint: string;
  readonly requestFingerprint: string;
  readonly inputTextHash: string;
  readonly instructionHash: string;
  readonly model: string;
  readonly voice: string;
  readonly speed: number;
  readonly outputFormat: OpenAiSpeechOutputFormat;
  readonly language: string;
  readonly outputPath: string;
  readonly audioData: Buffer;
  readonly validationReport: NarrationChunkValidationReport;
  readonly createdAt?: string;
}

export interface GenerateNarrationChunkWithCacheRequest {
  readonly narrationRoot: string;
  readonly chunkId: string;
  readonly chunkFingerprint: string;
  readonly requestFingerprint: string;
  readonly inputTextHash: string;
  readonly instructionHash: string;
  readonly model: string;
  readonly voice: string;
  readonly speed: number;
  readonly outputFormat: OpenAiSpeechOutputFormat;
  readonly language: string;
  readonly outputPath: string;
  readonly createdAt?: string;
  readonly synthesizeToTempFile: (tempPath: string) => Promise<{
    readonly validationReport: NarrationChunkValidationReport;
  }>;
}

export interface StaleNarrationArtifactReport {
  readonly staleArtifacts: readonly NarrationChunkCacheDecision[];
  readonly deletedPaths: readonly string[];
}

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const portablePathSchema = z.string().min(1).max(500);
const outputFormatSchema = z.enum(["mp3", "opus", "aac", "flac", "wav", "pcm"]);

export const narrationChunkCacheRecordSchema = z
  .object({
    schemaVersion: z.literal(NARRATION_CHUNK_CACHE_SCHEMA_VERSION),
    artifactSchemaVersion: z.literal(NARRATION_ARTIFACT_SCHEMA_VERSION),
    chunkId: z.string().min(1),
    chunkFingerprint: sha256Schema,
    requestFingerprint: sha256Schema,
    inputTextHash: sha256Schema,
    instructionHash: sha256Schema,
    model: z.string().min(1),
    voice: z.string().min(1),
    speed: z.number().finite().positive(),
    outputFormat: outputFormatSchema,
    language: z.string().min(1),
    outputPath: portablePathSchema,
    outputHash: sha256Schema,
    validationPath: portablePathSchema,
    validationHash: sha256Schema,
    validationStatus: z.enum(["passed", "warning"]),
    durationMs: z.number().finite().nonnegative().optional(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

function relative(root: string, target: string): string {
  return path.relative(root, target).replace(/\\/gu, "/");
}

function resolveUnderRoot(root: string, filePath: string): string {
  const resolved = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(root, filePath);
  const resolvedRoot = path.resolve(root);
  const relativePath = path.relative(resolvedRoot, resolved);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Narration cache path escapes root: ${filePath}`);
  }
  return resolved;
}

export function narrationChunkCacheRecordPath(narrationRoot: string, chunkId: string): string {
  return path.join(narrationRoot, "chunks", `${chunkId}.cache.json`);
}

export function computeNarrationChunkFingerprint(input: NarrationChunkFingerprintInput): string {
  return hashText(
    JSON.stringify({
      schemaVersion: input.schemaVersion,
      promptVersion: input.promptVersion,
      chunkId: input.chunkId,
      text: input.text,
      textHash: input.textHash,
      previousContext: input.previousContext,
      nextContext: input.nextContext,
      model: input.model,
      voice: input.voice,
      speed: input.speed,
      outputFormat: input.outputFormat,
      language: input.language,
      locale: input.locale,
      instructions: input.instructions,
      direction: input.direction,
      pronunciationHints: input.pronunciationHints,
      requestFingerprint: input.requestFingerprint,
    })
  );
}

export function computeNarrationChunkFingerprintFromRequest(input: {
  readonly chunk: NarrationChunk;
  readonly direction: NarrationDirection;
  readonly requestBuildResult: OpenAiTtsRequestBuildResult;
  readonly pronunciationHints?: readonly string[];
}): string {
  const request = input.requestBuildResult.request;
  const fingerprintInput = input.requestBuildResult.fingerprintInput;
  return computeNarrationChunkFingerprint({
    schemaVersion: fingerprintInput.schemaVersion,
    promptVersion: fingerprintInput.promptVersion,
    chunkId: input.chunk.chunkId,
    text: request.input,
    textHash: input.chunk.textHash,
    previousContext: input.chunk.previousContextExcerpt,
    nextContext: input.chunk.nextContextExcerpt,
    model: request.model,
    voice: request.voice,
    speed: request.speed ?? 1,
    outputFormat: request.response_format,
    language: fingerprintInput.language,
    locale: fingerprintInput.locale,
    instructions: request.instructions,
    direction: input.direction,
    pronunciationHints: input.pronunciationHints ?? [],
    requestFingerprint: input.requestBuildResult.requestFingerprint,
  });
}

function decision(input: {
  readonly reason: NarrationChunkCacheDecisionReason;
  readonly reusable?: boolean;
  readonly chunkId: string;
  readonly chunkFingerprint: string;
  readonly record?: NarrationChunkCacheRecord;
  readonly outputPath?: string;
  readonly outputHash?: string;
  readonly message?: string;
}): NarrationChunkCacheDecision {
  return {
    reason: input.reason,
    reusable: input.reusable ?? input.reason === "hit",
    chunkId: input.chunkId,
    chunkFingerprint: input.chunkFingerprint,
    ...(input.record ? { record: input.record } : {}),
    ...(input.outputPath ? { outputPath: input.outputPath } : {}),
    ...(input.outputHash ? { outputHash: input.outputHash } : {}),
    ...(input.message ? { message: input.message } : {}),
  };
}

async function loadCacheRecord(recordPath: string): Promise<NarrationChunkCacheRecord | null> {
  return readJsonIfExists(recordPath, (value) => narrationChunkCacheRecordSchema.parse(value));
}

export async function assessNarrationChunkCache(
  request: AssessNarrationChunkCacheRequest
): Promise<NarrationChunkCacheDecision> {
  const recordPath = request.recordPath ?? narrationChunkCacheRecordPath(request.narrationRoot, request.chunkId);
  let record: NarrationChunkCacheRecord | null = null;
  try {
    record = await loadCacheRecord(recordPath);
  } catch (error) {
    return decision({
      reason: "stale_metadata",
      chunkId: request.chunkId,
      chunkFingerprint: request.chunkFingerprint,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  if (record === null) {
    return decision({
      reason: "miss",
      chunkId: request.chunkId,
      chunkFingerprint: request.chunkFingerprint,
    });
  }
  if (record.chunkId !== request.chunkId || record.chunkFingerprint !== request.chunkFingerprint) {
    return decision({
      reason: "stale_metadata",
      chunkId: request.chunkId,
      chunkFingerprint: request.chunkFingerprint,
      record,
    });
  }
  const outputPath = resolveUnderRoot(request.narrationRoot, request.outputPath ?? record.outputPath);
  if (!(await fileExists(outputPath))) {
    return decision({
      reason: "invalid_output",
      chunkId: request.chunkId,
      chunkFingerprint: request.chunkFingerprint,
      record,
      outputPath,
      message: "Cached output file is missing.",
    });
  }
  const outputHash = await hashFile(outputPath).catch(() => "");
  if (outputHash !== record.outputHash) {
    return decision({
      reason: "invalid_output",
      chunkId: request.chunkId,
      chunkFingerprint: request.chunkFingerprint,
      record,
      outputPath,
      outputHash,
      message: "Cached output hash does not match metadata.",
    });
  }
  const validationPath = resolveUnderRoot(request.narrationRoot, record.validationPath);
  let validationReport: NarrationChunkValidationReport | null = null;
  try {
    validationReport = await readJsonIfExists(validationPath, (value) =>
      narrationChunkValidationReportSchema.parse(value)
    );
  } catch (error) {
    return decision({
      reason: "validation_failure",
      chunkId: request.chunkId,
      chunkFingerprint: request.chunkFingerprint,
      record,
      outputPath,
      outputHash,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  if (validationReport === null || validationReport.validationStatus === "failed") {
    return decision({
      reason: "validation_failure",
      chunkId: request.chunkId,
      chunkFingerprint: request.chunkFingerprint,
      record,
      outputPath,
      outputHash,
      message: "Cached validation report is missing or failed.",
    });
  }
  const validationHash = await hashFile(validationPath).catch(() => "");
  if (
    validationHash !== record.validationHash ||
    validationReport.chunkId !== request.chunkId ||
    validationReport.audioHash !== outputHash ||
    validationReport.requestFingerprint !== record.requestFingerprint ||
    validationReport.generationFingerprint !== record.chunkFingerprint
  ) {
    return decision({
      reason: "validation_failure",
      chunkId: request.chunkId,
      chunkFingerprint: request.chunkFingerprint,
      record,
      outputPath,
      outputHash,
      message: "Cached validation metadata does not agree with the output and fingerprint.",
    });
  }
  return decision({
    reason: "hit",
    chunkId: request.chunkId,
    chunkFingerprint: request.chunkFingerprint,
    record,
    outputPath,
    outputHash,
  });
}

async function writeBufferAtomic(filePath: string, value: Buffer): Promise<string> {
  await ensureDir(path.dirname(filePath));
  const tempPath = path.join(path.dirname(filePath), `${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    await fs.writeFile(tempPath, value);
    const outputHash = await hashFile(tempPath);
    await fs.rename(tempPath, filePath);
    return outputHash;
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function promoteNarrationChunk(
  request: PromoteNarrationChunkRequest
): Promise<NarrationChunkCacheRecord> {
  const outputPath = resolveUnderRoot(request.narrationRoot, request.outputPath);
  const validationReport = narrationChunkValidationReportSchema.parse(request.validationReport);
  if (validationReport.validationStatus === "failed") {
    throw new Error(`Cannot cache failed validation for chunk ${request.chunkId}.`);
  }
  const outputHash = await writeBufferAtomic(outputPath, request.audioData);
  if (validationReport.audioHash !== outputHash) {
    throw new Error(`Validation audio hash does not match promoted output for chunk ${request.chunkId}.`);
  }
  const validationPath = path.join(path.dirname(outputPath), `${request.chunkId}.validation.json`);
  await writeJsonAtomic(validationPath, validationReport);
  const validationHash = await hashFile(validationPath);
  const record = narrationChunkCacheRecordSchema.parse({
    schemaVersion: NARRATION_CHUNK_CACHE_SCHEMA_VERSION,
    artifactSchemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    chunkId: request.chunkId,
    chunkFingerprint: request.chunkFingerprint,
    requestFingerprint: request.requestFingerprint,
    inputTextHash: request.inputTextHash,
    instructionHash: request.instructionHash,
    model: request.model,
    voice: request.voice,
    speed: request.speed,
    outputFormat: request.outputFormat,
    language: request.language,
    outputPath: relative(request.narrationRoot, outputPath),
    outputHash,
    validationPath: relative(request.narrationRoot, validationPath),
    validationHash,
    validationStatus: validationReport.validationStatus,
    ...(validationReport.metrics.durationMs !== undefined ? { durationMs: validationReport.metrics.durationMs } : {}),
    createdAt: request.createdAt ?? new Date().toISOString(),
  });
  await writeJsonAtomic(narrationChunkCacheRecordPath(request.narrationRoot, request.chunkId), record);
  return record;
}

export async function generateNarrationChunkWithCache(
  request: GenerateNarrationChunkWithCacheRequest
): Promise<NarrationChunkCacheDecision> {
  const existing = await assessNarrationChunkCache({
    narrationRoot: request.narrationRoot,
    chunkId: request.chunkId,
    chunkFingerprint: request.chunkFingerprint,
    outputPath: request.outputPath,
  });
  if (existing.reusable) {
    return existing;
  }
  const outputPath = resolveUnderRoot(request.narrationRoot, request.outputPath);
  await ensureDir(path.dirname(outputPath));
  const tempPath = path.join(path.dirname(outputPath), `${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    const result = await request.synthesizeToTempFile(tempPath);
    const audioData = await fs.readFile(tempPath);
    const promoteRequest = {
      narrationRoot: request.narrationRoot,
      chunkId: request.chunkId,
      chunkFingerprint: request.chunkFingerprint,
      requestFingerprint: request.requestFingerprint,
      inputTextHash: request.inputTextHash,
      instructionHash: request.instructionHash,
      model: request.model,
      voice: request.voice,
      speed: request.speed,
      outputFormat: request.outputFormat,
      language: request.language,
      outputPath,
      audioData,
      validationReport: result.validationReport,
      ...(request.createdAt !== undefined ? { createdAt: request.createdAt } : {}),
    } satisfies PromoteNarrationChunkRequest;
    const record = await promoteNarrationChunk(promoteRequest);
    return decision({
      reason: existing.reason === "miss" ? "miss" : existing.reason,
      reusable: false,
      chunkId: request.chunkId,
      chunkFingerprint: request.chunkFingerprint,
      record,
      outputPath,
      outputHash: record.outputHash,
    });
  } catch (error) {
    return decision({
      reason: "provider_failure",
      reusable: false,
      chunkId: request.chunkId,
      chunkFingerprint: request.chunkFingerprint,
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
}

export async function reportStaleNarrationArtifacts(input: {
  readonly narrationRoot: string;
  readonly expectedFingerprints: ReadonlyMap<string, string>;
  readonly cleanup?: boolean;
}): Promise<StaleNarrationArtifactReport> {
  const chunksDir = path.join(input.narrationRoot, "chunks");
  const staleArtifacts: NarrationChunkCacheDecision[] = [];
  const deletedPaths: string[] = [];
  let entries: string[] = [];
  try {
    entries = await fs.readdir(chunksDir);
  } catch {
    return { staleArtifacts, deletedPaths };
  }
  for (const entry of entries.filter((name) => name.endsWith(".cache.json")).sort()) {
    const chunkId = entry.replace(/\.cache\.json$/u, "");
    const expected = input.expectedFingerprints.get(chunkId);
    if (!expected) {
      staleArtifacts.push(
        decision({
          reason: "stale_metadata",
          chunkId,
          chunkFingerprint: hashText("missing-expected-fingerprint"),
          message: "No expected fingerprint was supplied for this cache record.",
        })
      );
      continue;
    }
    const assessed = await assessNarrationChunkCache({
      narrationRoot: input.narrationRoot,
      chunkId,
      chunkFingerprint: expected,
    });
    if (assessed.reason !== "hit") {
      staleArtifacts.push(assessed);
      if (input.cleanup && assessed.record) {
        const recordPath = narrationChunkCacheRecordPath(input.narrationRoot, chunkId);
        const outputPath = resolveUnderRoot(input.narrationRoot, assessed.record.outputPath);
        const validationPath = resolveUnderRoot(input.narrationRoot, assessed.record.validationPath);
        for (const stalePath of [recordPath, outputPath, validationPath]) {
          await fs.rm(stalePath, { force: true });
          deletedPaths.push(stalePath);
        }
      }
    }
  }
  return { staleArtifacts, deletedPaths };
}
