import path from "node:path";
import { sceneIdSchema, voiceProfileSchema } from "@mediaforge/domain";
import {
  copyAtomic,
  ensureDir,
  hashText,
  readJsonIfExists,
  writeJsonAtomic,
} from "@mediaforge/shared";
import { z } from "zod";
import type { SpeechProvider, SpeechSynthesisResult } from "./index.js";
import {
  assembleNarration,
  type NarrationAssemblyConfig,
} from "./narration-assembly.js";
import {
  assessNarrationChunkCache,
  generateNarrationChunkWithCache,
  type NarrationChunkCacheDecision,
  type NarrationChunkCacheRecord,
} from "./narration-cache.js";
import {
  narrationChunkValidationReportSchema,
  type NarrationChunkValidationReport,
  type PronunciationDictionary,
} from "./narration-schemas.js";
import { masterNarration, type NarrationMasteringProfile } from "./mastering.js";
import {
  buildOpenAiTtsChunkRequest,
  type OpenAiTtsRequestBuildResult,
} from "./openai-tts-request.js";
import { validateChunkAudio, type ProbeAudioMetadata } from "./audio-validation.js";
import type {
  EducationalSemanticChunk,
  EducationalSpeechPlan,
} from "./educational-speech-planning.js";
import type { SpeechDeliveryProfile } from "./speech-delivery-profile.js";

export const EDUCATIONAL_SPEECH_WORKFLOW_VERSION =
  "educational-speech-workflow.v1" as const;
export const EDUCATIONAL_SPEECH_CACHE_KEY_VERSION =
  "educational-speech-cache-key.v1" as const;
export const EDUCATIONAL_SPEECH_PRODUCER_VERSION =
  "educational-speech-producer.v2" as const;

export const educationalSpeechProviderIdSchema = z.enum([
  "openai-compatible",
  "fake",
  "mock",
]);
export type EducationalSpeechProviderId = z.infer<
  typeof educationalSpeechProviderIdSchema
>;

const candidateRecordSchema = z
  .object({
    chunkId: z.string(),
    candidateIndex: z.number().int().min(1).max(3),
    selected: z.boolean(),
    status: z.enum(["completed", "failed"]),
    cacheHit: z.boolean(),
    cacheStatus: z.enum([
      "hit",
      "miss",
      "stale_metadata",
      "invalid_output",
      "validation_failure",
      "provider_failure",
    ]),
    outputPath: z.string(),
    outputHash: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
    durationMs: z.number().nonnegative().optional(),
    providerDurationMs: z.number().nonnegative(),
    attemptCount: z.number().int().positive(),
    validationStatus: z.enum(["passed", "warning", "failed"]).optional(),
    textToAudioRatio: z.number().nonnegative().optional(),
    requiredTempoRatio: z.number().positive().optional(),
    error: z.string().optional(),
  })
  .strict();

const chunkWorkflowRecordSchema = z
  .object({
    chunkId: z.string(),
    beatIds: z.array(z.string()),
    selectedCandidate: z.number().int().min(1).max(3),
    plannedPauseKind: z.string(),
    plannedPauseMs: z.number().nonnegative(),
    candidates: z.array(candidateRecordSchema),
  })
  .strict();

export const educationalSpeechWorkflowLogSchema = z
  .object({
    schemaVersion: z.literal(EDUCATIONAL_SPEECH_WORKFLOW_VERSION),
    task: z.literal("educational-speech-generate"),
    status: z.enum(["running", "completed", "failed"]),
    provider: educationalSpeechProviderIdSchema,
    model: z.string().min(1),
    modelSnapshot: z.string().min(1).optional(),
    voice: z.string().min(1),
    language: z.enum(["de", "en", "es", "fr", "pt"]),
    speechProfile: z.enum([
      "education-natural-teacher",
      "education-legacy-baseline",
    ]),
    speechProfileVersion: z.string().min(1),
    pronunciationDictionaryVersion: z.string().min(1),
    pronunciationDictionaryFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    inputHash: z.string().regex(/^[a-f0-9]{64}$/u),
    cacheHit: z.boolean(),
    cacheHitCount: z.number().int().nonnegative(),
    providerRequestCount: z.number().int().nonnegative(),
    chunkCount: z.number().int().nonnegative(),
    candidateCount: z.number().int().min(1).max(3),
    startedAt: z.string().datetime({ offset: true }),
    completedAt: z.string().datetime({ offset: true }).optional(),
    durationMs: z.number().nonnegative(),
    generatedAudioDurationMs: z.number().nonnegative().optional(),
    postProcessingDurationMs: z.number().nonnegative(),
    exitCode: z.number().int(),
    chunks: z.array(chunkWorkflowRecordSchema),
    warnings: z.array(z.string()),
    errors: z.array(z.string()),
  })
  .strict();
export type EducationalSpeechWorkflowLog = z.infer<
  typeof educationalSpeechWorkflowLogSchema
>;

export interface EducationalSpeechCacheKeyInput {
  readonly producerVersion: string;
  readonly provider: EducationalSpeechProviderId;
  readonly providerBaseUrlIdentity: string;
  readonly model: string;
  readonly modelSnapshot?: string;
  readonly voice: string;
  readonly language: string;
  readonly normalizedSpokenText: string;
  readonly instructions: string;
  readonly speechProfileId: string;
  readonly speechProfileVersion: string;
  readonly pronunciationDictionaryVersion: string;
  readonly pronunciationDictionaryFingerprint: string;
  readonly outputFormat: string;
  readonly providerSampleRateHz: number;
  readonly assemblySampleRateHz: number;
  readonly targetWordsPerMinute: number;
  readonly providerSpeed: number;
  readonly pausePolicy: SpeechDeliveryProfile["pausePolicy"];
  readonly chunkingPolicy: SpeechDeliveryProfile["chunkingPolicy"];
  readonly postProcessingPolicy: SpeechDeliveryProfile["postProcessingPolicy"];
  readonly candidateIndex: number;
  readonly requestFingerprint: string;
}

export function buildEducationalSpeechCacheKey(
  input: EducationalSpeechCacheKeyInput
): string {
  return hashText(
    JSON.stringify({
      cacheKeyVersion: EDUCATIONAL_SPEECH_CACHE_KEY_VERSION,
      ...input,
      modelSnapshot: input.modelSnapshot ?? null,
    })
  );
}

export function assertEducationalSpeechProviderResult(input: {
  readonly result: SpeechSynthesisResult;
  readonly expectedSceneId: string;
  readonly expectedOutputPath: string;
  readonly expectedRequestFingerprint: string;
  readonly validation: NarrationChunkValidationReport;
}): void {
  const result = input.result;
  const metrics = input.validation.metrics;
  if (input.validation.validationStatus === "failed") {
    const findingCodes = input.validation.findings
      .filter((finding) => finding.severity === "error")
      .map((finding) => finding.code)
      .join(", ");
    throw new Error(
      `Provider audio validation failed${findingCodes ? `: ${findingCodes}` : "."}`
    );
  }
  if (String(result.sceneId) !== input.expectedSceneId)
    throw new Error("Provider response scene identity does not match the request.");
  if (path.resolve(result.filePath) !== path.resolve(input.expectedOutputPath))
    throw new Error("Provider response output path does not match the request.");
  if (result.requestFingerprint !== input.expectedRequestFingerprint)
    throw new Error("Provider response fingerprint does not match the request.");
  if (
    !Number.isFinite(result.durationSeconds) ||
    result.durationSeconds <= 0 ||
    !Number.isInteger(result.sampleRate) ||
    result.sampleRate < 16_000 ||
    !Number.isInteger(result.channels) ||
    result.channels < 1 ||
    result.channels > 2
  )
    throw new Error("Provider response contains invalid audio metadata.");
  if (
    metrics.durationMs === undefined ||
    Math.abs(metrics.durationMs - result.durationSeconds * 1000) >
      Math.max(100, metrics.durationMs * 0.02)
  )
    throw new Error("Provider response duration does not match decoded audio bytes.");
  if (
    metrics.sampleRate !== undefined &&
    metrics.sampleRate !== result.sampleRate
  )
    throw new Error("Provider response sample rate does not match decoded audio bytes.");
  if (metrics.channels !== undefined && metrics.channels !== result.channels)
    throw new Error("Provider response channels do not match decoded audio bytes.");
}

export type EducationalSpeechErrorClassification =
  | "authentication"
  | "rate-limit"
  | "timeout"
  | "network"
  | "provider-transient"
  | "provider-validation"
  | "invalid-input"
  | "unsupported-language"
  | "invalid-configuration"
  | "schema"
  | "provider-deterministic"
  | "unknown";

export function classifyEducationalSpeechError(error: unknown): {
  readonly classification: EducationalSpeechErrorClassification;
  readonly retryable: boolean;
} {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  const value = `${name}: ${message}`.toLowerCase();
  if (/auth|api key|unauthori[sz]ed|forbidden|\b401\b|\b403\b/u.test(value)) {
    return { classification: "authentication", retryable: false };
  }
  if (/unsupported language/u.test(value)) {
    return { classification: "unsupported-language", retryable: false };
  }
  if (/zod|schema|parse error/u.test(value)) {
    return { classification: "schema", retryable: false };
  }
  if (/invalid config|configuration|no .* configured/u.test(value)) {
    return { classification: "invalid-configuration", retryable: false };
  }
  if (/invalid input|bad request|input.*exceed|\b400\b|\b404\b|\b422\b/u.test(value)) {
    return { classification: "invalid-input", retryable: false };
  }
  if (/rate.?limit|too many requests|\b429\b/u.test(value)) {
    return { classification: "rate-limit", retryable: true };
  }
  if (/timeout|timed out|aborterror/u.test(value)) {
    return { classification: "timeout", retryable: true };
  }
  if (/econnreset|econnrefused|enotfound|network|socket|dns/u.test(value)) {
    return { classification: "network", retryable: true };
  }
  if (/\b50[0234]\b|temporar|at capacity|unavailable|overloaded/u.test(value)) {
    return { classification: "provider-transient", retryable: true };
  }
  if (/provider audio validation failed/u.test(value)) {
    return { classification: "provider-validation", retryable: true };
  }
  if (/providerresponseerror/u.test(value)) {
    return { classification: "provider-deterministic", retryable: false };
  }
  return { classification: "unknown", retryable: false };
}

export async function runEducationalSpeechWithRetries<T>(input: {
  readonly operation: (attempt: number) => Promise<T>;
  readonly maxAttempts?: number;
  readonly sleep?: (durationMs: number) => Promise<void>;
  readonly onRetry?: (input: {
    readonly attempt: number;
    readonly delayMs: number;
    readonly classification: EducationalSpeechErrorClassification;
  }) => void;
}): Promise<{ readonly value: T; readonly attemptCount: number }> {
  const maxAttempts = input.maxAttempts ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
    throw new Error("Educational speech retry attempts must be between 1 and 5.");
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return { value: await input.operation(attempt), attemptCount: attempt };
    } catch (error) {
      lastError = error;
      const classified = classifyEducationalSpeechError(error);
      if (!classified.retryable || attempt === maxAttempts) throw error;
      const delayMs = 250 * 2 ** (attempt - 1);
      input.onRetry?.({ attempt, delayMs, classification: classified.classification });
      await (input.sleep ?? ((durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs))))(delayMs);
    }
  }
  throw lastError;
}

export interface EducationalSpeechDryRunChunk {
  readonly chunkId: string;
  readonly beatIds: readonly string[];
  readonly candidateIndex: number;
  readonly selected: boolean;
  readonly outputPath: string;
  readonly cacheStatus: NarrationChunkCacheDecision["reason"];
  readonly internalPlannedPauses: EducationalSemanticChunk["internalPauseCues"];
  readonly plannedPause: EducationalSemanticChunk["pauseAfter"];
  readonly inputCharacters: number;
}

export interface EducationalSpeechDryRun {
  readonly provider: EducationalSpeechProviderId;
  readonly model: string;
  readonly voice: string;
  readonly language: string;
  readonly speechProfile: string;
  readonly speechProfileVersion: string;
  readonly chunkCount: number;
  readonly candidateCount: number;
  readonly estimatedProviderRequests: number;
  readonly estimatedInputCharacters: number;
  readonly outputRoot: string;
  readonly chunks: readonly EducationalSpeechDryRunChunk[];
  readonly costNotice: string;
}

export interface GenerateEducationalSpeechRequest {
  readonly plan: EducationalSpeechPlan;
  readonly profile: SpeechDeliveryProfile;
  readonly pronunciationDictionaries: readonly PronunciationDictionary[];
  readonly providerId: EducationalSpeechProviderId;
  readonly provider?: SpeechProvider;
  readonly providerBaseUrlIdentity?: string;
  readonly outputRoot: string;
  readonly compatibilityOutputPath?: string;
  readonly candidateCount?: 1 | 2 | 3;
  readonly candidateSelection?: Readonly<Record<string, 1 | 2 | 3>>;
  readonly regenerate?: boolean;
  readonly dryRun?: boolean;
  readonly maxAttempts?: number;
  readonly signal?: AbortSignal;
  readonly createdAt?: string;
  readonly sleep?: (durationMs: number) => Promise<void>;
  readonly probeAudio?: (filePath: string) => Promise<ProbeAudioMetadata>;
  readonly runFfmpeg?: (args: readonly string[]) => Promise<void>;
  readonly logger?: {
    info(value: Record<string, unknown>, message?: string): void;
    warn?(value: Record<string, unknown>, message?: string): void;
    error?(value: Record<string, unknown>, message?: string): void;
  };
}

export type GenerateEducationalSpeechResult =
  | {
      readonly status: "dry-run";
      readonly dryRun: EducationalSpeechDryRun;
    }
  | {
      readonly status: "completed" | "failed";
      readonly workflow: EducationalSpeechWorkflowLog;
      readonly outputPath?: string;
      readonly cleanOutputPath?: string;
    };

interface PreparedCandidate {
  readonly chunk: EducationalSemanticChunk;
  readonly candidateIndex: number;
  readonly selected: boolean;
  readonly candidateRoot: string;
  readonly outputPath: string;
  readonly requestBuild: OpenAiTtsRequestBuildResult;
  readonly cacheKey: string;
}

function isHighValueChunk(chunk: EducationalSemanticChunk): boolean {
  return ["introduction", "explanation", "final-answer", "recap"].includes(
    chunk.dominantKind
  );
}

export function educationalSpeechCandidatePath(input: {
  readonly outputRoot: string;
  readonly chunkId: string;
  readonly candidateIndex: number;
  readonly extension: string;
}): string {
  return path.join(
    input.outputRoot,
    "candidates",
    `candidate-${String(input.candidateIndex).padStart(2, "0")}`,
    "chunks",
    `${input.chunkId}.${input.extension}`
  );
}

function pronunciationHints(
  chunk: EducationalSemanticChunk,
  dictionaries: readonly PronunciationDictionary[]
): readonly string[] {
  const selected = new Set(chunk.pronunciationEntryIds);
  return dictionaries.flatMap((dictionary) =>
    dictionary.entries
      .filter((entry) => selected.has(entry.entryId))
      .map((entry) => `${entry.phrase}: ${entry.replacement}`)
  );
}

function prepareCandidates(
  request: GenerateEducationalSpeechRequest
): readonly PreparedCandidate[] {
  const requestedCandidateCount = request.candidateCount ?? 1;
  const directionById = new Map(
    request.plan.directionSet.directions.map((direction) => [
      direction.chunkId,
      direction,
    ])
  );
  const manifestChunkById = new Map(
    request.plan.chunkManifest.chunks.map((chunk) => [chunk.chunkId, chunk])
  );
  return request.plan.chunks.flatMap((chunk) => {
    const generatedCount = isHighValueChunk(chunk)
      ? requestedCandidateCount
      : 1;
    const selectedCandidate = request.candidateSelection?.[chunk.chunkId] ?? 1;
    if (selectedCandidate > generatedCount) {
      throw new Error(
        `Selected candidate ${selectedCandidate} is not generated for ${chunk.chunkId}.`
      );
    }
    const manifestChunk = manifestChunkById.get(chunk.chunkId);
    const direction = directionById.get(chunk.chunkId);
    if (!manifestChunk || !direction) {
      throw new Error(`Speech plan is incomplete for ${chunk.chunkId}.`);
    }
    const hints = pronunciationHints(
      chunk,
      request.pronunciationDictionaries
    );
    const internalPauseGuidance = chunk.internalPauseCues.length > 0
      ? [
          "Paragraph breaks mark semantic teaching-beat boundaries; keep them audible without resetting the voice.",
          ...chunk.internalPauseCues.map(
            (cue) =>
              `After paragraph ${cue.afterParagraph}, use a ${cue.kind} pause of approximately ${cue.durationMs}ms.`
          ),
        ].join(" ")
      : "Treat this chunk as one continuous teaching beat.";
    return Array.from({ length: generatedCount }, (_unused, index) => {
      const candidateIndex = index + 1;
      const requestBuild = buildOpenAiTtsChunkRequest({
        chunk: manifestChunk,
        direction,
        transformedText: chunk.ttsText,
        preserveParagraphBreaks: true,
        pronunciationHints: hints,
        continuityGuidance: `${direction.continuityGuidance} ${internalPauseGuidance}`,
        config: {
          model: request.profile.model,
          voice: request.profile.voice,
          speed: request.profile.providerSpeed,
          outputFormat: request.profile.postProcessingPolicy.outputFormat,
          language: request.profile.language,
          locale: request.profile.language,
          variant: "full",
          baseVoiceInstructions: request.profile.instructions,
          providerBaseUrlIdentity:
            request.providerBaseUrlIdentity ?? "openai-default",
          schemaVersion: EDUCATIONAL_SPEECH_CACHE_KEY_VERSION,
          promptVersion: request.profile.version,
        },
      });
      const outputPath = educationalSpeechCandidatePath({
        outputRoot: request.outputRoot,
        chunkId: chunk.chunkId,
        candidateIndex,
        extension: request.profile.postProcessingPolicy.outputFormat,
      });
      const candidateRoot = path.dirname(path.dirname(outputPath));
      const cacheKey = buildEducationalSpeechCacheKey({
        producerVersion: EDUCATIONAL_SPEECH_PRODUCER_VERSION,
        provider: request.providerId,
        providerBaseUrlIdentity:
          request.providerBaseUrlIdentity ?? "openai-default",
        model: request.profile.model,
        ...(request.profile.modelSnapshot
          ? { modelSnapshot: request.profile.modelSnapshot }
          : {}),
        voice: request.profile.voice,
        language: request.profile.language,
        normalizedSpokenText: requestBuild.request.input,
        instructions: requestBuild.request.instructions,
        speechProfileId: request.profile.id,
        speechProfileVersion: request.profile.version,
        pronunciationDictionaryVersion:
          request.profile.pronunciationDictionaryVersion,
        pronunciationDictionaryFingerprint:
          request.plan.pronunciationDictionaryFingerprint,
        outputFormat: requestBuild.request.response_format,
        providerSampleRateHz:
          request.profile.postProcessingPolicy.providerSampleRateHz,
        assemblySampleRateHz:
          request.profile.postProcessingPolicy.assemblySampleRateHz,
        targetWordsPerMinute: request.profile.targetWordsPerMinute ?? 150,
        providerSpeed: request.profile.providerSpeed,
        pausePolicy: request.profile.pausePolicy,
        chunkingPolicy: request.profile.chunkingPolicy,
        postProcessingPolicy: request.profile.postProcessingPolicy,
        candidateIndex,
        requestFingerprint: requestBuild.requestFingerprint,
      });
      return {
        chunk,
        candidateIndex,
        selected: candidateIndex === selectedCandidate,
        candidateRoot,
        outputPath,
        requestBuild,
        cacheKey,
      };
    });
  });
}

async function buildDryRun(
  request: GenerateEducationalSpeechRequest,
  prepared: readonly PreparedCandidate[]
): Promise<EducationalSpeechDryRun> {
  const chunks = await Promise.all(
    prepared.map(async (candidate): Promise<EducationalSpeechDryRunChunk> => {
      const assessed = await assessNarrationChunkCache({
        narrationRoot: candidate.candidateRoot,
        chunkId: candidate.chunk.chunkId,
        chunkFingerprint: candidate.cacheKey,
        outputPath: candidate.outputPath,
      });
      return {
        chunkId: candidate.chunk.chunkId,
        beatIds: candidate.chunk.beatIds,
        candidateIndex: candidate.candidateIndex,
        selected: candidate.selected,
        outputPath: candidate.outputPath,
        cacheStatus: assessed.reason,
        internalPlannedPauses: candidate.chunk.internalPauseCues,
        plannedPause: candidate.chunk.pauseAfter,
        inputCharacters: candidate.requestBuild.request.input.length,
      };
    })
  );
  const misses = chunks.filter((chunk) => chunk.cacheStatus !== "hit");
  return {
    provider: request.providerId,
    model: request.profile.model,
    voice: request.profile.voice,
    language: request.profile.language,
    speechProfile: request.profile.id,
    speechProfileVersion: request.profile.version,
    chunkCount: request.plan.chunks.length,
    candidateCount: request.candidateCount ?? 1,
    estimatedProviderRequests: misses.length,
    estimatedInputCharacters: misses.reduce(
      (sum, chunk) => sum + chunk.inputCharacters,
      0
    ),
    outputRoot: request.outputRoot,
    chunks,
    costNotice:
      (request.candidateCount ?? 1) > 1
        ? "Important sections generate multiple paid TTS requests; every candidate is retained until explicitly selected."
        : "One candidate is planned per semantic chunk; cache hits do not call the provider.",
  };
}

function relative(root: string, target: string): string {
  return path.relative(root, target).replace(/\\/gu, "/");
}

function workflowBase(input: {
  readonly request: GenerateEducationalSpeechRequest;
  readonly startedAt: string;
  readonly status: "running" | "completed" | "failed";
  readonly records: readonly z.infer<typeof candidateRecordSchema>[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly postProcessingDurationMs: number;
  readonly generatedAudioDurationMs?: number;
}): EducationalSpeechWorkflowLog {
  const grouped = input.request.plan.chunks.map((chunk) => {
    const candidates = input.records.filter(
      (record) => record.chunkId === chunk.chunkId
    );
    return {
      chunkId: chunk.chunkId,
      beatIds: [...chunk.beatIds],
      selectedCandidate:
        input.request.candidateSelection?.[chunk.chunkId] ?? 1,
      plannedPauseKind: chunk.pauseAfter.kind,
      plannedPauseMs: chunk.pauseAfter.durationMs,
      candidates,
    };
  });
  const now = new Date();
  const durationMs = Math.max(
    0,
    now.getTime() - Date.parse(input.startedAt)
  );
  return educationalSpeechWorkflowLogSchema.parse({
    schemaVersion: EDUCATIONAL_SPEECH_WORKFLOW_VERSION,
    task: "educational-speech-generate",
    status: input.status,
    provider: input.request.providerId,
    model: input.request.profile.model,
    ...(input.request.profile.modelSnapshot
      ? { modelSnapshot: input.request.profile.modelSnapshot }
      : {}),
    voice: input.request.profile.voice,
    language: input.request.profile.language,
    speechProfile: input.request.profile.id,
    speechProfileVersion: input.request.profile.version,
    pronunciationDictionaryVersion:
      input.request.profile.pronunciationDictionaryVersion,
    pronunciationDictionaryFingerprint:
      input.request.plan.pronunciationDictionaryFingerprint,
    inputHash: input.request.plan.planFingerprint,
    cacheHit:
      input.records.length > 0 &&
      input.records.every((record) => record.cacheHit),
    cacheHitCount: input.records.filter((record) => record.cacheHit).length,
    providerRequestCount: input.records.filter((record) => !record.cacheHit)
      .length,
    chunkCount: input.request.plan.chunks.length,
    candidateCount: input.request.candidateCount ?? 1,
    startedAt: input.startedAt,
    ...(input.status === "running"
      ? {}
      : { completedAt: now.toISOString() }),
    durationMs,
    ...(input.generatedAudioDurationMs !== undefined
      ? { generatedAudioDurationMs: input.generatedAudioDurationMs }
      : {}),
    postProcessingDurationMs: input.postProcessingDurationMs,
    exitCode: input.status === "failed" ? 1 : 0,
    chunks: grouped,
    warnings: [...input.warnings],
    errors: [...input.errors],
  });
}

async function readValidation(
  candidate: PreparedCandidate,
  record: NarrationChunkCacheRecord
): Promise<NarrationChunkValidationReport> {
  const validationPath = path.resolve(
    candidate.candidateRoot,
    record.validationPath
  );
  const report = await readJsonIfExists(validationPath, (value) =>
    narrationChunkValidationReportSchema.parse(value)
  );
  if (!report) {
    throw new Error(
      `Missing validation report for ${candidate.chunk.chunkId} candidate ${candidate.candidateIndex}.`
    );
  }
  return report;
}

function assemblyRecord(
  outputRoot: string,
  candidateRoot: string,
  record: NarrationChunkCacheRecord
): NarrationChunkCacheRecord {
  return {
    ...record,
    outputPath: relative(
      outputRoot,
      path.resolve(candidateRoot, record.outputPath)
    ),
    validationPath: relative(
      outputRoot,
      path.resolve(candidateRoot, record.validationPath)
    ),
  };
}

function educationalAssemblyConfig(
  profile: SpeechDeliveryProfile
): NarrationAssemblyConfig {
  return {
    sampleRate: profile.postProcessingPolicy.assemblySampleRateHz,
    channels: profile.postProcessingPolicy.channels,
    trimLeadingSilenceMs: 80,
    trimTrailingSilenceMs: 100,
    retainBoundarySilenceMs: 70,
    pauseScale: 1,
    maxInsertedPauseMs: Math.max(
      ...Object.values(profile.pausePolicy).map((range) => range.maxMs)
    ),
    appendFinalPause: true,
    crossfade: {
      enabled: profile.postProcessingPolicy.crossfadeMs > 0,
      durationMs: profile.postProcessingPolicy.crossfadeMs,
      equalPower: true,
    },
  };
}

function masteringProfile(profile: SpeechDeliveryProfile): NarrationMasteringProfile {
  return {
    id: profile.id,
    version: profile.postProcessingPolicy.version,
    enabled: true,
    sampleRate: profile.postProcessingPolicy.assemblySampleRateHz,
    codec: "pcm_s16le",
    targetLoudnessLufs:
      profile.postProcessingPolicy.targetLoudnessLufs,
    truePeakLimitDb: profile.postProcessingPolicy.truePeakLimitDb,
    highPassHz: 65,
    compression: {
      thresholdDb: -18,
      ratio: 1.35,
      attackMs: 15,
      releaseMs: 150,
    },
  };
}

export async function generateEducationalSpeech(
  request: GenerateEducationalSpeechRequest
): Promise<GenerateEducationalSpeechResult> {
  if (request.plan.speechProfileId !== request.profile.id) {
    throw new Error("Educational speech plan/profile mismatch.");
  }
  if (request.plan.language !== request.profile.language) {
    throw new Error("Educational speech plan/language mismatch.");
  }
  const candidateCount = request.candidateCount ?? 1;
  if (![1, 2, 3].includes(candidateCount)) {
    throw new Error("Educational speech candidate count must be 1, 2, or 3.");
  }
  const prepared = prepareCandidates(request);
  if (request.dryRun) {
    return { status: "dry-run", dryRun: await buildDryRun(request, prepared) };
  }
  if (!request.provider) {
    throw new Error("Educational speech generation requires a configured provider.");
  }
  const provider = request.provider;
  const startedAt = request.createdAt ?? new Date().toISOString();
  const workflowPath = path.join(request.outputRoot, "workflow-log.json");
  const planPath = path.join(request.outputRoot, "speech-plan.json");
  const records: z.infer<typeof candidateRecordSchema>[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  let postProcessingDurationMs = 0;
  await ensureDir(request.outputRoot);
  await writeJsonAtomic(planPath, request.plan);
  await writeJsonAtomic(
    workflowPath,
    workflowBase({
      request,
      startedAt,
      status: "running",
      records,
      warnings,
      errors,
      postProcessingDurationMs,
    })
  );
  const selectedRecords = new Map<string, NarrationChunkCacheRecord>();
  const selectedValidations = new Map<string, NarrationChunkValidationReport>();
  const signal = request.signal ?? new AbortController().signal;

  for (const candidate of prepared) {
    const providerStarted = Date.now();
    let attemptCount = 1;
    const outputPath = candidate.outputPath;
    const decision = await generateNarrationChunkWithCache({
      narrationRoot: candidate.candidateRoot,
      chunkId: candidate.chunk.chunkId,
      chunkFingerprint: candidate.cacheKey,
      requestFingerprint: candidate.requestBuild.requestFingerprint,
      inputTextHash: candidate.requestBuild.promptLogMetadata.inputTextHash,
      instructionHash:
        candidate.requestBuild.promptLogMetadata.instructionHash,
      model: request.profile.model,
      voice: request.profile.voice,
      speed: request.profile.providerSpeed,
      outputFormat: request.profile.postProcessingPolicy.outputFormat,
      language: request.profile.language,
      outputPath,
      reuse: !request.regenerate,
      synthesizeToTempFile: async (tempPath) => {
        const generated = await runEducationalSpeechWithRetries({
          ...(request.maxAttempts !== undefined
            ? { maxAttempts: request.maxAttempts }
            : {}),
          ...(request.sleep ? { sleep: request.sleep } : {}),
          onRetry: ({ attempt, delayMs, classification }) => {
            attemptCount = attempt + 1;
            request.logger?.warn?.(
              {
                task: "educational-speech-generate",
                chunkId: candidate.chunk.chunkId,
                candidateIndex: candidate.candidateIndex,
                attempt,
                delayMs,
                classification,
              },
              "Retrying transient educational TTS failure."
            );
          },
          operation: async (attempt) => {
            attemptCount = attempt;
            const providerResult = await provider.synthesize(
              {
                sceneId: sceneIdSchema.parse(
                  `scene-${String(candidate.chunk.sequence + 1).padStart(3, "0")}`
                ),
                text: candidate.requestBuild.request.input,
                voiceProfile: voiceProfileSchema.parse({
                  id: request.profile.id,
                  label: "Natural teacher",
                  gender: "neutral",
                  style: "calm conversational mathematics teacher",
                  paceWpm: request.profile.targetWordsPerMinute ?? 150,
                  providerVoiceId: request.profile.voice,
                }),
                outputPath: tempPath,
                targetDurationSeconds:
                  candidate.chunk.estimatedDurationMs / 1000,
                instructions: candidate.requestBuild.request.instructions,
                speed: request.profile.providerSpeed,
                requestFingerprint:
                  candidate.requestBuild.requestFingerprint,
                trace: {
                  task: "educational-speech-generate",
                  speechProfileId: request.profile.id,
                  speechProfileVersion: request.profile.version,
                  language: request.profile.language,
                  chunkId: candidate.chunk.chunkId,
                  candidateIndex: candidate.candidateIndex,
                  inputHash:
                    candidate.requestBuild.promptLogMetadata.inputTextHash,
                },
              },
              signal
            );
            const validationReport = await validateChunkAudio({
              chunkId: candidate.chunk.chunkId,
              audioPath: tempPath,
              narrationRoot: candidate.candidateRoot,
              expectedText: candidate.requestBuild.request.input,
              language: request.profile.language,
              variant: "full",
              expectedDurationMs: candidate.chunk.estimatedDurationMs,
              requestFingerprint: candidate.requestBuild.requestFingerprint,
              generationFingerprint: candidate.cacheKey,
              ...(request.probeAudio
                ? { probeAudio: request.probeAudio }
                : {}),
              ...(request.logger ? { logger: request.logger } : {}),
            });
            assertEducationalSpeechProviderResult({
              result: providerResult,
              expectedSceneId: `scene-${String(candidate.chunk.sequence + 1).padStart(3, "0")}`,
              expectedOutputPath: tempPath,
              expectedRequestFingerprint:
                candidate.requestBuild.requestFingerprint,
              validation: validationReport,
            });
            return { providerResult, validationReport };
          },
        });
        attemptCount = generated.attemptCount;
        return { validationReport: generated.value.validationReport };
      },
    });
    const providerDurationMs = Math.max(0, Date.now() - providerStarted);
    if (!decision.record || decision.reason === "provider_failure") {
      const error =
        decision.message ??
        `Speech generation failed for ${candidate.chunk.chunkId} candidate ${candidate.candidateIndex}.`;
      records.push({
        chunkId: candidate.chunk.chunkId,
        candidateIndex: candidate.candidateIndex,
        selected: candidate.selected,
        status: "failed",
        cacheHit: false,
        cacheStatus: decision.reason,
        outputPath: relative(request.outputRoot, outputPath),
        providerDurationMs,
        attemptCount,
        error,
      });
      errors.push(error);
    } else {
      const validation = await readValidation(candidate, decision.record);
      const durationMs = validation.metrics.durationMs;
      const requiredTempoRatio =
        durationMs && candidate.chunk.estimatedDurationMs > 0
          ? durationMs / candidate.chunk.estimatedDurationMs
          : undefined;
      if (
        requiredTempoRatio !== undefined &&
        (requiredTempoRatio <
          request.profile.postProcessingPolicy.tempoCorrection.safeRatio.min ||
          requiredTempoRatio >
            request.profile.postProcessingPolicy.tempoCorrection.safeRatio.max)
      ) {
        warnings.push(
          `${candidate.chunk.chunkId} candidate ${candidate.candidateIndex} would require tempo ratio ${requiredTempoRatio.toFixed(3)}; no tempo correction was applied.`
        );
      }
      records.push({
        chunkId: candidate.chunk.chunkId,
        candidateIndex: candidate.candidateIndex,
        selected: candidate.selected,
        status: "completed",
        cacheHit: decision.reason === "hit",
        cacheStatus: decision.reason,
        outputPath: relative(request.outputRoot, outputPath),
        outputHash: decision.record.outputHash,
        ...(durationMs !== undefined ? { durationMs } : {}),
        providerDurationMs,
        attemptCount,
        validationStatus: validation.validationStatus,
        ...(durationMs !== undefined && durationMs > 0
          ? {
              textToAudioRatio:
                candidate.requestBuild.request.input.length /
                (durationMs / 1000),
            }
          : {}),
        ...(requiredTempoRatio !== undefined ? { requiredTempoRatio } : {}),
      });
      if (candidate.selected) {
        selectedRecords.set(
          candidate.chunk.chunkId,
          assemblyRecord(
            request.outputRoot,
            candidate.candidateRoot,
            decision.record
          )
        );
        selectedValidations.set(candidate.chunk.chunkId, validation);
      }
    }
    await writeJsonAtomic(
      workflowPath,
      workflowBase({
        request,
        startedAt,
        status: errors.length > 0 ? "failed" : "running",
        records,
        warnings,
        errors,
        postProcessingDurationMs,
      })
    );
    if (errors.length > 0) break;
  }

  if (errors.length > 0) {
    const workflow = workflowBase({
      request,
      startedAt,
      status: "failed",
      records,
      warnings,
      errors,
      postProcessingDurationMs,
    });
    await writeJsonAtomic(workflowPath, workflow);
    return { status: "failed", workflow };
  }

  const cleanOutputPath = path.join(request.outputRoot, "narration-clean.wav");
  const assemblyStarted = Date.now();
  const assembly = await assembleNarration({
    narrationRoot: request.outputRoot,
    chunkManifest: request.plan.chunkManifest,
    directionSet: request.plan.directionSet,
    cacheRecords: request.plan.chunks.map((chunk) => {
      const record = selectedRecords.get(chunk.chunkId);
      if (!record) throw new Error(`Selected speech candidate missing for ${chunk.chunkId}.`);
      return record;
    }),
    validationReports: request.plan.chunks.map((chunk) => {
      const validation = selectedValidations.get(chunk.chunkId);
      if (!validation) throw new Error(`Selected speech validation missing for ${chunk.chunkId}.`);
      return validation;
    }),
    outputPath: cleanOutputPath,
    manifestPath: path.join(request.outputRoot, "assembly-manifest.json"),
    config: educationalAssemblyConfig(request.profile),
    ...(request.runFfmpeg ? { runFfmpeg: request.runFfmpeg } : {}),
    ...(request.probeAudio ? { probeAudio: request.probeAudio } : {}),
    ...(request.logger ? { logger: request.logger } : {}),
  });
  postProcessingDurationMs += Math.max(0, Date.now() - assemblyStarted);
  if (assembly.status === "blocked") {
    errors.push(...assembly.errors);
    warnings.push(...assembly.warnings);
    const workflow = workflowBase({
      request,
      startedAt,
      status: "failed",
      records,
      warnings,
      errors,
      postProcessingDurationMs,
    });
    await writeJsonAtomic(workflowPath, workflow);
    return { status: "failed", workflow, cleanOutputPath };
  }
  warnings.push(...assembly.warnings);
  const finalOutputPath = path.join(request.outputRoot, "narration.wav");
  const masteringStarted = Date.now();
  const mastered = await masterNarration({
    inputPath: cleanOutputPath,
    outputPath: finalOutputPath,
    metadataPath: path.join(request.outputRoot, "mastering-metadata.json"),
    narrationRoot: request.outputRoot,
    profile: masteringProfile(request.profile),
    ...(request.runFfmpeg ? { runFfmpeg: request.runFfmpeg } : {}),
    ...(request.probeAudio ? { probeAudio: request.probeAudio } : {}),
    ...(request.logger ? { logger: request.logger } : {}),
  });
  postProcessingDurationMs += Math.max(0, Date.now() - masteringStarted);
  if (mastered.status === "failed") {
    errors.push(mastered.errorMessage);
    const workflow = workflowBase({
      request,
      startedAt,
      status: "failed",
      records,
      warnings,
      errors,
      postProcessingDurationMs,
      generatedAudioDurationMs: assembly.durationMs,
    });
    await writeJsonAtomic(workflowPath, workflow);
    return { status: "failed", workflow, cleanOutputPath };
  }
  if (request.compatibilityOutputPath) {
    await copyAtomic(finalOutputPath, request.compatibilityOutputPath);
  }
  await writeJsonAtomic(path.join(request.outputRoot, "candidate-selection.json"), {
    schemaVersion: "educational-speech-candidate-selection.v1",
    speechPlanFingerprint: request.plan.planFingerprint,
    selections: request.plan.chunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      candidateIndex: request.candidateSelection?.[chunk.chunkId] ?? 1,
    })),
  });
  const workflow = workflowBase({
    request,
    startedAt,
    status: "completed",
    records,
    warnings,
    errors,
    postProcessingDurationMs,
    generatedAudioDurationMs: assembly.durationMs,
  });
  await writeJsonAtomic(workflowPath, workflow);
  request.logger?.info(
    {
      task: workflow.task,
      status: workflow.status,
      provider: workflow.provider,
      model: workflow.model,
      voice: workflow.voice,
      language: workflow.language,
      speechProfile: workflow.speechProfile,
      speechProfileVersion: workflow.speechProfileVersion,
      inputHash: workflow.inputHash,
      cacheHit: workflow.cacheHit,
      chunkCount: workflow.chunkCount,
      candidateCount: workflow.candidateCount,
      durationMs: workflow.durationMs,
      postProcessingDurationMs: workflow.postProcessingDurationMs,
      warnings: workflow.warnings,
      errors: workflow.errors,
    },
    "Completed educational speech generation."
  );
  return {
    status: "completed",
    workflow,
    outputPath: finalOutputPath,
    cleanOutputPath,
  };
}
