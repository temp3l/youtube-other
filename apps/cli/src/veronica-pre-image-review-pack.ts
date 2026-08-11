import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { scenePlanSchema } from "@mediaforge/domain";
import { runCommand } from "@mediaforge/process-runner";
import { assessVeronicaShortPacing, probeAudioWithFfprobe, resolveVeronicaShortPacingPolicy, veronicaShortPacingCalibrationSchema } from "@mediaforge/speech";
import { preparePositioningProductionEpisode, type PreparePositioningProductionEpisodeInput } from "@mediaforge/strategic-reinvention";
import { z } from "zod";

const PACK_SCHEMA_VERSION = "veronica-pre-image-review-pack.v9" as const;
const AUDIO_INTEGRITY_SCHEMA_VERSION = "veronica-review-audio-integrity.v1" as const;
const REVIEW_AUDIO_PREVIEW_CODEC = "opus" as const;
const REVIEW_AUDIO_PREVIEW_BITRATE_KBPS = 64;
const REVIEW_AUDIO_PREVIEW_DURATION_EPSILON_SECONDS = 0.05;
export const VERONICA_TIMING_INTEGRITY_EPSILON_SECONDS = 0.02;
const execFileAsync = promisify(execFile);
export const reviewPackModeSchema = z.enum(["compact", "listening", "forensic"]);
export type ReviewPackMode = z.infer<typeof reviewPackModeSchema>;

const audioIntegritySchema = z.strictObject({
  schemaVersion: z.literal(AUDIO_INTEGRITY_SCHEMA_VERSION),
  canonicalAudioEmbedded: z.boolean(),
  canonicalAudioPath: z.string().min(1),
  canonicalAudioSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  selectedAudioSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  decodedDurationSeconds: z.number().positive(),
  sampleRateHz: z.number().int().positive(),
  channels: z.number().int().positive(),
  codec: z.string().min(1),
  container: z.string().min(1),
  wordCount: z.number().int().nonnegative(),
  effectiveWpm: z.number().nonnegative(),
  pacingPolicyVersion: z.string().optional(),
  pacingProfile: z.string().optional(),
  pacingStatus: z.string().min(1),
  calibrationStatus: z.string().optional(),
  canonicalTimingDurationSeconds: z.number().positive(),
  finalSceneEndSeconds: z.number().positive(),
  finalEventEndSeconds: z.number().positive(),
  timingIntegrityStatus: z.enum(["PASS", "FAIL"]),
  audioPrepackageValidationStatus: z.enum(["PASS", "FAIL"]),
  reviewAudioPreview: z.object({
    embedded: z.boolean(),
    canonical: z.boolean(),
    sourceCanonicalAudioSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    codec: z.string().min(1).optional(),
    bitrateKbps: z.number().int().positive().optional(),
    durationSeconds: z.number().positive().optional(),
    durationDifferenceSeconds: z.number().nonnegative().optional(),
    encoderVersion: z.string().min(1).optional(),
  }),
});

type AudioIntegrity = z.infer<typeof audioIntegritySchema>;
const sourceGroundedQaManifestSchema = z.object({
  policyIdentity: z.string().min(1),
  revision: z.object({
    revisionId: z.string().regex(/^[a-f0-9]{64}$/u),
    sourceNarrationHash: z.string().regex(/^[a-f0-9]{64}$/u),
    semanticStateHash: z.string().regex(/^[a-f0-9]{64}$/u),
    treatmentSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
    providerProjectionSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
    timingHash: z.string().regex(/^[a-f0-9]{64}$/u),
    policyHash: z.string().regex(/^[a-f0-9]{64}$/u),
  }),
  sourceFidelityReady: z.boolean(),
  providerRequestsAllowed: z.literal(false),
  blockers: z.array(z.string()),
  aggregate: z.object({
    scenePassCount: z.number().int().nonnegative(),
    sceneReviewCount: z.number().int().nonnegative(),
    sceneBlockCount: z.number().int().nonnegative(),
    sceneUnavailableCount: z.number().int().nonnegative(),
    scenesEscalated: z.number().int().nonnegative(),
    scenesRemediated: z.number().int().nonnegative(),
    sequenceVerdict: z.enum(["PASS", "REVIEW", "BLOCK", "UNAVAILABLE"]),
    sequenceDefectCount: z.number().int().nonnegative(),
    cacheHits: z.number().int().nonnegative(),
    cacheMisses: z.number().int().nonnegative(),
    primaryApiCalls: z.number().int().nonnegative(),
    escalationApiCalls: z.number().int().nonnegative(),
    remediationApiCalls: z.number().int().nonnegative(),
    sequenceApiCalls: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cachedInputTokens: z.number().int().nonnegative(),
    totalWallClockMs: z.number().int().nonnegative(),
    queueWaitMs: z.number().int().nonnegative(),
    apiLatencyMs: z.number().int().nonnegative(),
    configuredConcurrency: z.number().int().positive(),
    effectiveConcurrency: z.number().int().positive(),
    maxObservedConcurrency: z.number().int().nonnegative(),
    throttleEvents: z.number().int().nonnegative(),
    rateLimitEvents: z.number().int().nonnegative(),
    retryCount: z.number().int().nonnegative(),
    singleFlightDeduplications: z.number().int().nonnegative(),
    advisorBypassCount: z.number().int().nonnegative(),
    noOpRemediationCount: z.number().int().nonnegative(),
    rejudgeRequestCount: z.number().int().nonnegative(),
    scenesRejudged: z.number().int().nonnegative(),
    providerCallsReserved: z.number().int().nonnegative(),
    estimatedCostUsd: z.number().nonnegative(),
    budgetStatus: z.enum(["CACHE_ONLY", "WITHIN_BUDGET", "EXHAUSTED"]),
    modelDistribution: z.record(z.string(), z.number().int().nonnegative()),
  }),
  sourceGroundedQaExecution: z.object({
    profile: z.enum(["INTERACTIVE", "COST_OPTIMIZED", "BULK"]),
    transport: z.enum(["SYNCHRONOUS_API", "BATCH"]),
    serviceTier: z.literal("flex").optional(),
    wallClockMs: z.number().int().nonnegative(),
    sceneCount: z.number().int().nonnegative(),
    cacheHits: z.number().int().nonnegative(),
    cacheMisses: z.number().int().nonnegative(),
    primaryCalls: z.number().int().nonnegative(),
    escalations: z.number().int().nonnegative(),
    advisorCalls: z.number().int().nonnegative(),
    sequenceCalls: z.number().int().nonnegative(),
    retries: z.number().int().nonnegative(),
    rateLimitEvents: z.number().int().nonnegative(),
    effectiveConcurrency: z.number().int().positive(),
    inputTokens: z.number().int().nonnegative(),
    cachedInputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    advisorBypassCount: z.number().int().nonnegative(),
    noOpRemediationCount: z.number().int().nonnegative(),
    rejudgeRequests: z.number().int().nonnegative(),
    scenesRejudged: z.number().int().nonnegative(),
    providerCallsReserved: z.number().int().nonnegative(),
    estimatedCostUsd: z.number().nonnegative(),
    budgetStatus: z.enum(["CACHE_ONLY", "WITHIN_BUDGET", "EXHAUSTED"]),
    modelDistribution: z.record(z.string(), z.number().int().nonnegative()),
  }),
  scenes: z.array(
    z.object({
      sceneId: z.string().min(1),
      judgement: z.object({
        verdict: z.enum(["PASS", "REVIEW", "BLOCK", "UNAVAILABLE"]),
        sourceFidelity: z.enum(["PASS", "UNCERTAIN", "FAIL"]),
        defectCodes: z.array(z.string()),
        earliestFaultBoundary: z.string(),
        remediationRoute: z.string(),
        reason: z.string(),
      }),
      escalationStatus: z.string(),
      modelPolicyIdentity: z.string(),
      cacheHit: z.boolean(),
      inputHash: z.string(),
      outputHash: z.string(),
    }),
  ),
  remediationHistory: z.array(
    z
      .object({
        sceneId: z.string(),
        regenerationRound: z.number().int().positive(),
        repairBoundary: z.string(),
        downstreamInvalidation: z.array(z.string()),
        exhausted: z.boolean(),
      })
      .passthrough(),
  ),
  sequence: z.object({
    verdict: z.enum(["PASS", "REVIEW", "BLOCK", "UNAVAILABLE"]),
    defectCodes: z.array(z.string()),
    repeatedGroups: z.array(z.unknown()),
    continuityProblems: z.array(z.unknown()),
    remediationTargets: z.array(z.unknown()),
    reason: z.string(),
  }),
  resultHash: z.string().regex(/^[a-f0-9]{64}$/u),
});
const reviewManifestSchema = z.strictObject({
  schemaVersion: z.literal(PACK_SCHEMA_VERSION),
  episodeId: z.string().min(1),
  language: z.string().min(1),
  variant: z.enum(["full", "short"]),
  sceneCount: z.number().int().positive(),
  narrationDurationSeconds: z.number().positive(),
  timingSource: z.string().min(1),
  selectedAudioHash: z.string().regex(/^[a-f0-9]{64}$/u),
  reviewPackMode: reviewPackModeSchema,
  canonicalAudioEmbedded: z.boolean(),
  reviewAudioPreviewEmbedded: z.boolean(),
  packagingFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  canonicalAudioSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  canonicalAudioDurationSeconds: z.number().positive(),
  audioPrepackageValidation: z.object({
    status: z.literal("PASS"),
    sourceExists: z.literal(true),
    sourceHashValidated: z.literal(true),
    sourceDurationMeasured: z.literal(true),
  }),
  providerRequestsAllowed: z.literal(false),
  sources: z
    .array(
      z.strictObject({
        name: z.string().min(1),
        path: z.string().min(1),
        sha256: z.string().regex(/^[a-f0-9]{64}$/u),
      }),
    )
    .min(1),
  artifactHashes: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/u)),
  packFileHashes: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/u)),
  packHashValidation: z.literal("PASS"),
  packCrossArtifactIntegrity: z.object({
    status: z.enum(["PASS", "FAIL"]),
    errorCode: z.literal("SELECTED_AUDIO_TIMING_MISMATCH").optional(),
    epsilonSeconds: z.number().positive(),
    checks: z.record(z.string(), z.number()),
    mismatches: z.array(z.string()),
  }),
  semanticIntegrity: z.object({
    status: z.enum(["PASS", "FAIL"]),
    blockerCount: z.number().int().nonnegative(),
    convergenceStatus: z.string().min(1),
  }),
  providerProjectionIntegrity: z.object({
    status: z.enum(["PASS", "FAIL"]),
    missingThesisCount: z.number().int().nonnegative(),
    malformedThesisCount: z.number().int().nonnegative(),
    blockedProjectionCount: z.number().int().nonnegative(),
    issueCount: z.number().int().nonnegative(),
  }),
  providerPromptQuality: z.object({
    status: z.enum(["PASS", "FAIL"]),
    blockedMarkerCount: z.number().int().nonnegative(),
    internalLanguageIssueCount: z.number().int().nonnegative(),
    lexicalCorruptionCount: z.number().int().nonnegative(),
  }),
  semanticCoherenceIntegrity: z.object({
    status: z.enum(["PASS", "FAIL"]),
    incompleteClaimCount: z.number().int().nonnegative(),
    polarityMismatchCount: z.number().int().nonnegative(),
    propositionContradictionCount: z.number().int().nonnegative(),
    treatmentIncompatibilityCount: z.number().int().nonnegative(),
    projectionMismatchCount: z.number().int().nonnegative(),
    motifLeakageCount: z.number().int().nonnegative(),
    harmfulRepetitionCount: z.number().int().nonnegative(),
  }),
  sourceGroundedVisualQa: sourceGroundedQaManifestSchema,
  semanticQuality: z.object({
    status: z.enum(["PASS", "FAIL"]),
    remediationTemplateReuseRate: z.number().min(0).max(1),
    genericFallbackSceneRate: z.number().min(0).max(1),
    repeatedActionFamilyRate: z.number().min(0).max(1),
    repeatedEnvironmentFamilyRate: z.number().min(0).max(1),
    intentionalMotifReuseRate: z.number().min(0).max(1),
    accidentalRepetitionRate: z.number().min(0).max(1),
  }),
  overallPackValidity: z.boolean(),
  narrationDiagnostic: z.discriminatedUnion("mode", [
    z.object({
      mode: z.literal("short-adaptive"),
      wordCount: z.number().int().nonnegative(),
      narrationDurationSeconds: z.number().positive(),
      approximateWordsPerMinute: z.number().nonnegative(),
      timingSource: z.string().min(1),
      initialTtsSpeed: z.number().positive(),
      ttsSpeed: z.number().positive(),
      calibrationAttemptCount: z.number().int().positive(),
      speedNormalizationApplied: z.boolean(),
      preferredDurationRangeSeconds: z.tuple([z.number().positive(), z.number().positive()]),
      preferredWpmRange: z.tuple([z.number().positive(), z.number().positive()]).optional(),
      pacingStatus: z.string().min(1),
      durationAcceptanceStatus: z.string().min(1),
      calibrationStatus: z.string().min(1),
      pacingPolicyVersion: z.string().min(1),
      calibrationPolicyVersion: z.string().min(1),
      legacyCalibrationPolicy: z.boolean(),
      editorialDurationStatus: z.enum(["NORMAL_SHORT", "LONG_SHORT_EDITORIAL_REVIEW", "SHORT_PLATFORM_DURATION_EXCEEDED"]),
    }),
    z.strictObject({
      mode: z.literal("full-current-policy"),
      wordCount: z.number().int().nonnegative(),
      narrationDurationSeconds: z.number().positive(),
      approximateWordsPerMinute: z.number().nonnegative(),
      timingSource: z.string().min(1),
      pacingStatus: z.literal("not-configured"),
      durationAcceptanceStatus: z.literal("NOT_APPLICABLE"),
    }),
  ]),
});

export interface VeronicaTimingIntegrityResult {
  readonly status: "PASS" | "FAIL";
  readonly errorCode?: "SELECTED_AUDIO_TIMING_MISMATCH";
  readonly epsilonSeconds: number;
  readonly checks: Readonly<Record<string, number>>;
  readonly mismatches: readonly string[];
}

export function validateVeronicaTimingIntegrity(input: {
  readonly audioDurationSeconds: number;
  readonly calibrationDurationSeconds?: number;
  readonly canonicalDurationSeconds: number;
  readonly reviewManifestDurationSeconds?: number;
  readonly episodeManifestFinalSceneEndSeconds: number;
  readonly retimedSceneFinalEndSeconds: number;
  readonly retimedEventFinalEndSeconds: number;
  readonly cadenceDurationSeconds: number;
  readonly selectedAudioHash: string;
  readonly calibrationAudioHash?: string;
  readonly canonicalTimingAudioHash?: string | null;
  readonly epsilonSeconds?: number;
}): VeronicaTimingIntegrityResult {
  const epsilonSeconds = input.epsilonSeconds ?? VERONICA_TIMING_INTEGRITY_EPSILON_SECONDS;
  const checks = {
    decodedNarrationWav: input.audioDurationSeconds,
    ...(input.calibrationDurationSeconds !== undefined ? { pacingCalibrationSelected: input.calibrationDurationSeconds } : {}),
    canonicalTiming: input.canonicalDurationSeconds,
    ...(input.reviewManifestDurationSeconds !== undefined ? { reviewManifest: input.reviewManifestDurationSeconds } : {}),
    episodeManifestFinalSceneEnd: input.episodeManifestFinalSceneEndSeconds,
    retimedScenePlanFinalEnd: input.retimedSceneFinalEndSeconds,
    retimedVisualEventsFinalEnd: input.retimedEventFinalEndSeconds,
    cadenceDuration: input.cadenceDurationSeconds,
  };
  const mismatches = Object.entries(checks).flatMap(([name, value]) =>
    Math.abs(value - input.audioDurationSeconds) > epsilonSeconds ? [`${name}:${value.toFixed(6)}!=audio:${input.audioDurationSeconds.toFixed(6)}`] : [],
  );
  if (input.calibrationAudioHash !== undefined && input.calibrationAudioHash !== input.selectedAudioHash) mismatches.push("pacingCalibrationAudioHash!=narrationWavHash");
  if (input.canonicalTimingAudioHash !== undefined && input.canonicalTimingAudioHash !== input.selectedAudioHash) mismatches.push("canonicalTimingAudioHash!=narrationWavHash");
  return mismatches.length === 0
    ? { status: "PASS", epsilonSeconds, checks, mismatches }
    : {
        status: "FAIL",
        errorCode: "SELECTED_AUDIO_TIMING_MISMATCH",
        epsilonSeconds,
        checks,
        mismatches,
      };
}

export interface VeronicaPreImageReviewPackResult {
  readonly packDir: string;
  readonly manifestPath: string;
  readonly readmePath: string;
  readonly promptPath: string;
  readonly zipPath: string;
  readonly zipSha256: string;
  readonly generatedAtMs: number;
  readonly reviewPackMode: ReviewPackMode;
}

export interface PackInput {
  readonly episodeDir: string;
  readonly language: string;
  readonly variant: "full" | "short";
  readonly reviewPackMode?: ReviewPackMode;
  readonly sourceGroundedVisualQa?: PreparePositioningProductionEpisodeInput["sourceGroundedVisualQa"];
}

function packRoot(input: PackInput): string {
  return path.join(input.episodeDir, "review-packs", "pre-image", `${input.language}-${input.variant}`);
}

function packDir(input: PackInput, generatedAtMs: number): string {
  return path.join(packRoot(input), `run-${generatedAtMs}`);
}

function zipFileName(input: PackInput, reviewPackMode: ReviewPackMode, generatedAtMs: number): string {
  return `veronica-pre-image-review-pack-${input.language}-${input.variant}-${reviewPackMode}-${generatedAtMs}.zip`;
}

async function fileHash(filePath: string): Promise<string> {
  return createHash("sha256")
    .update(await fs.readFile(filePath))
    .digest("hex");
}

interface WavAudioMetadata {
  readonly durationSeconds: number;
  readonly sampleRateHz: number;
  readonly channels: number;
  readonly codec: "pcm" | "ieee-float";
  readonly container: "WAV";
}

function waveAudioMetadata(bytes: Buffer): WavAudioMetadata {
  if (bytes.length < 44 || bytes.subarray(0, 4).toString("ascii") !== "RIFF" || bytes.subarray(8, 12).toString("ascii") !== "WAVE") throw new Error("Invalid narration WAV header.");
  let offset = 12;
  let byteRate = 0;
  let dataSize = -1;
  let sampleRateHz = 0;
  let channels = 0;
  let formatTag = 0;
  while (offset + 8 <= bytes.length) {
    const id = bytes.subarray(offset, offset + 4).toString("ascii");
    const size = bytes.readUInt32LE(offset + 4);
    if (id === "fmt " && offset + 24 <= bytes.length) {
      formatTag = bytes.readUInt16LE(offset + 8);
      channels = bytes.readUInt16LE(offset + 10);
      sampleRateHz = bytes.readUInt32LE(offset + 12);
      byteRate = bytes.readUInt32LE(offset + 16);
    }
    if (id === "data") {
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (byteRate <= 0 || dataSize < 0 || sampleRateHz <= 0 || channels <= 0) throw new Error("Narration WAV has no measurable audio format/data chunks.");
  if (formatTag !== 1 && formatTag !== 3) throw new Error(`Unsupported narration WAV codec format tag: ${formatTag}.`);
  return {
    durationSeconds: dataSize / byteRate,
    sampleRateHz,
    channels,
    codec: formatTag === 1 ? "pcm" : "ieee-float",
    container: "WAV",
  };
}

async function requiredFile(filePath: string, label: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`Veronica pre-image review pack requires ${label}: ${filePath}`);
  }
}

async function requireCanonicalNarration(filePath: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`CANONICAL_AUDIO_UNAVAILABLE_FOR_PREPACKAGE_VALIDATION: ${filePath}`);
  }
}

async function reviewAudioPreview(input: {
  readonly outputDir: string;
  readonly narrationPath: string;
  readonly canonicalAudioSha256: string;
  readonly canonicalDurationSeconds: number;
}): Promise<NonNullable<AudioIntegrity["reviewAudioPreview"]>> {
  const previewPath = path.join(input.outputDir, "narration-review.opus");
  await runCommand(
    "ffmpeg",
    ["-y", "-i", input.narrationPath, "-map", "0:a:0", "-c:a", "libopus", "-b:a", `${REVIEW_AUDIO_PREVIEW_BITRATE_KBPS}k`, "-vbr", "off", "-application", "audio", previewPath],
    { timeoutMs: 300_000 },
  );
  const [metadata, sha256, encoder] = await Promise.all([probeAudioWithFfprobe(previewPath), fileHash(previewPath), runCommand("ffmpeg", ["-version"], { timeoutMs: 30_000 })]);
  const durationDifferenceSeconds = Math.abs(metadata.durationSeconds - input.canonicalDurationSeconds);
  if (!Number.isFinite(metadata.durationSeconds) || metadata.durationSeconds <= 0 || durationDifferenceSeconds > REVIEW_AUDIO_PREVIEW_DURATION_EPSILON_SECONDS) {
    throw new Error(
      `REVIEW_AUDIO_PREVIEW_DURATION_MISMATCH: preview=${metadata.durationSeconds}, canonical=${input.canonicalDurationSeconds}, epsilon=${REVIEW_AUDIO_PREVIEW_DURATION_EPSILON_SECONDS}`,
    );
  }
  return {
    embedded: true,
    canonical: false,
    sourceCanonicalAudioSha256: input.canonicalAudioSha256,
    sha256,
    codec: metadata.codecName ?? REVIEW_AUDIO_PREVIEW_CODEC,
    bitrateKbps: REVIEW_AUDIO_PREVIEW_BITRATE_KBPS,
    durationSeconds: metadata.durationSeconds,
    durationDifferenceSeconds,
    encoderVersion: encoder.stdout.split(/\r?\n/u)[0]?.trim() || "ffmpeg-version-unavailable",
  };
}

function promptReviewMarkdown(input: {
  readonly variant: "full" | "short";
  readonly reviewPackMode: ReviewPackMode;
  readonly narration: string;
  readonly pacingSummary: string;
  readonly scenes: ReturnType<typeof scenePlanSchema.parse>["scenes"];
  readonly findingsByScene: ReadonlyMap<string, readonly string[]>;
  readonly stateByScene: ReadonlyMap<string, string>;
  readonly actorByScene: ReadonlyMap<string, string>;
  readonly thesisByScene: ReadonlyMap<string, string>;
}): string {
  return [
    "# ChatGPT pre-image review request",
    "",
    veronicaPreImageReviewInstruction(input.variant),
    "",
    input.reviewPackMode === "compact"
      ? "Review-pack mode: **compact**. Canonical production audio was validated before packaging, but its bytes are intentionally omitted. Use the included hash/duration/timing metadata for semantic and image-prompt review; this pack cannot support audio-quality judgment."
      : input.reviewPackMode === "listening"
        ? "Review-pack mode: **listening**. `narration-review.opus` is a lossy review-only preview derived from validated canonical audio. Do not treat preview encoding artifacts as canonical WAV defects."
        : "Review-pack mode: **forensic**. `narration.wav` is the validated canonical production WAV and may be inspected directly.",
    "",
    "## English narration",
    "",
    input.narration,
    "",
    `Pacing: ${input.pacingSummary}`,
    "",
    "## Scene prompts",
    "",
    ...input.scenes.flatMap((scene) => [
      `### ${scene.id} — ${scene.timing.startSeconds.toFixed(3)}s to ${scene.timing.endSeconds.toFixed(3)}s`,
      "",
      `Narration: ${scene.canonicalNarration}`,
      "",
      `State complexity: ${input.stateByScene.get(scene.id) ?? "SINGLE_STATE"}`,
      "",
      `Action owner: ${input.actorByScene.get(scene.id) ?? "not applicable"}`,
      "",
      `Visible thesis: ${input.thesisByScene.get(scene.id) ?? "MISSING — BLOCK PROVIDER PROJECTION"}`,
      "",
      `Provider-oriented prompt: ${scene.imagePrompt}`,
      "",
      `Automated findings: ${(input.findingsByScene.get(scene.id) ?? []).join("; ") || "none"}`,
      "",
    ]),
  ].join("\n");
}

export function veronicaPreImageReviewInstruction(variant: "full" | "short"): string {
  return variant === "short"
    ? "Review this Short before any image-provider request. For each scene, answer pass/edit/block for: narration alignment; visible thesis; 1–2 second muted instant-read; action-owner correctness; buyer/customer consequence where required; cause/effect; occupation-proxy drift; abstract/decorative drift; generic stock drift; continuity; harmful repetition; text/logo risk; 9:16 readability; new information; and provider readiness. Return concise numbered edits; do not rewrite narration unless visual alignment requires it."
    : "Review this full / long-form 16:9 episode before any image-provider request. For each scene and sequence state, answer pass/edit/block for: narration alignment; visible thesis; muted instant-read where applicable; action-owner correctness; buyer/customer consequence where required; cause/effect; occupation-proxy drift; abstract/decorative drift; generic stock drift; continuity; harmful repetition; text/logo risk; 16:9 composition; multi-state representation validity; long-form scene/event sequence coherence; new information; and provider readiness. Treat valid separately prepared multi-state assets as a sequence, never as one storyboard still. Return concise numbered edits; do not rewrite narration unless visual alignment requires it.";
}

function providerPromptsMarkdown(
  scenes: ReturnType<typeof scenePlanSchema.parse>["scenes"],
  stateByScene: ReadonlyMap<string, string>,
  actorByScene: ReadonlyMap<string, string>,
  thesisByScene: ReadonlyMap<string, string>,
  assetsByScene: ReadonlyMap<string, readonly { readonly assetId: string; readonly prompt: string }[]>,
): string {
  return [
    "# UNAPPROVED — DO NOT SUBMIT",
    "",
    "These provider-oriented prompts are intentionally blocked until human pre-image approval is recorded.",
    "",
    ...scenes.flatMap((scene) => {
      const assets = assetsByScene.get(scene.id) ?? [];
      return [
        `## ${scene.id}`,
        "",
        `State complexity: ${stateByScene.get(scene.id) ?? "SINGLE_STATE"}`,
        `Action owner: ${actorByScene.get(scene.id) ?? "not applicable"}`,
        `Visible thesis: ${thesisByScene.get(scene.id) ?? "MISSING — PROVIDER PROJECTION BLOCKED"}`,
        "",
        ...(assets.length > 0 ? assets.flatMap((asset) => [`### Asset ${asset.assetId}`, "", asset.prompt, ""]) : [scene.imagePrompt, ""]),
      ];
    }),
  ].join("\n");
}

function semanticQualityReviewMarkdown(input: {
  readonly scenes: ReturnType<typeof scenePlanSchema.parse>["scenes"];
  readonly finalScenes: readonly {
    readonly sceneId: string;
    readonly visibleThesis?: string | undefined;
    readonly stateComplexity?: string | undefined;
    readonly semanticProposition?:
      | {
          readonly narrationClaim: string;
          readonly polarity: string;
          readonly buyerInterpretation?: string | undefined;
          readonly evidenceSpans: readonly {
            readonly sentenceId: string;
            readonly startOffset: number;
            readonly endOffset: number;
          }[];
        }
      | undefined;
    readonly semanticCoherence?:
      | {
          readonly claimIntegrity: string;
          readonly polarityCoherence: string;
          readonly propositionInternalCoherence: string;
          readonly treatmentPropositionCompatibility: string;
        }
      | undefined;
    readonly treatment: {
      readonly actionOwnerRole?: string | undefined;
      readonly environment: string;
      readonly action: string;
    };
  }[];
  readonly assetsByScene: ReadonlyMap<
    string,
    readonly {
      readonly assetId: string;
      readonly projectionProvenance?:
        | {
            readonly sourceTreatmentHash: string;
            readonly sourcePropositionHash: string | null;
            readonly stateProjectionPolicyVersion: string;
          }
        | undefined;
    }[]
  >;
  readonly remediationRounds: number;
  readonly findingsByScene: ReadonlyMap<string, readonly string[]>;
}): string {
  return [
    "# Semantic quality reviewer summary",
    "",
    ...input.scenes.flatMap((scene, index) => {
      const semanticScene = input.finalScenes[index];
      return [
        `## ${scene.id}`,
        "",
        `- Narration purpose: ${semanticScene?.semanticProposition?.narrationClaim ?? scene.canonicalNarration}`,
        `- Visible thesis: ${semanticScene?.visibleThesis ?? "MISSING"}`,
        `- Polarity / contrast: ${semanticScene?.semanticProposition?.polarity ?? "not recorded"}`,
        `- Evidence spans: ${semanticScene?.semanticProposition?.evidenceSpans.map((span) => `${span.sentenceId}@${span.startOffset}-${span.endOffset}`).join(", ") || "none"}`,
        `- State complexity: ${semanticScene?.stateComplexity ?? "SINGLE_STATE"}`,
        `- Action owner: ${semanticScene?.treatment.actionOwnerRole ?? "not applicable"}`,
        `- Environment: ${semanticScene?.treatment.environment ?? "missing"}`,
        `- Concrete action: ${semanticScene?.treatment.action ?? "missing"}`,
        `- Buyer consequence: ${semanticScene?.semanticProposition?.buyerInterpretation ?? "not required"}`,
        `- Provider assets: ${(input.assetsByScene.get(scene.id) ?? []).map((asset) => asset.assetId).join(", ") || "none"}`,
        `- Remediation rounds: ${input.remediationRounds}`,
        `- Proposition / treatment compatibility: ${semanticScene?.semanticCoherence?.treatmentPropositionCompatibility ?? "not recorded"}`,
        `- Provider projection compatibility: ${(input.assetsByScene.get(scene.id) ?? []).every((asset) => asset.projectionProvenance?.sourcePropositionHash !== undefined) ? "PASS" : "FAIL"}`,
        `- Automated findings: ${(input.findingsByScene.get(scene.id) ?? []).join("; ") || "none"}`,
        "",
      ];
    }),
  ].join("\n");
}

function shortNarrationDiagnostic(narrationDurationSeconds: number, timingSource: string, calibration: ReturnType<typeof veronicaShortPacingCalibrationSchema.parse>) {
  const initial = calibration.attempts[0]!;
  const currentPolicy = resolveVeronicaShortPacingPolicy(calibration.locale);
  const editorialDurationStatus =
    narrationDurationSeconds > 180 ? ("SHORT_PLATFORM_DURATION_EXCEEDED" as const) : narrationDurationSeconds > 120 ? ("LONG_SHORT_EDITORIAL_REVIEW" as const) : ("NORMAL_SHORT" as const);
  const pacingStatus = currentPolicy
    ? assessVeronicaShortPacing({
        durationSeconds: narrationDurationSeconds,
        wordCount: calibration.wordCount,
        policy: currentPolicy,
      })
    : "NATURAL";
  return {
    mode: "short-adaptive" as const,
    wordCount: calibration.wordCount,
    narrationDurationSeconds,
    approximateWordsPerMinute: Math.round((calibration.wordCount / narrationDurationSeconds) * 60 * 10) / 10,
    timingSource,
    initialTtsSpeed: initial.requestedSpeed,
    ttsSpeed: calibration.selectedSpeed,
    calibrationAttemptCount: calibration.attempts.length,
    speedNormalizationApplied: calibration.speedNormalizationApplied,
    preferredDurationRangeSeconds: currentPolicy?.preferredDurationRangeSeconds ?? calibration.targetDurationRange,
    ...(currentPolicy?.preferredWpmRange ? { preferredWpmRange: currentPolicy.preferredWpmRange } : {}),
    pacingStatus,
    durationAcceptanceStatus: editorialDurationStatus,
    calibrationStatus: calibration.selectedDurationAcceptanceStatus,
    pacingPolicyVersion: currentPolicy?.pacingPolicyVersion ?? calibration.pacingPolicyVersion,
    calibrationPolicyVersion: calibration.pacingPolicyVersion,
    legacyCalibrationPolicy: calibration.pacingPolicyVersion !== currentPolicy?.pacingPolicyVersion,
    editorialDurationStatus,
  };
}

export async function createVeronicaPreImageReviewPack(input: PackInput): Promise<VeronicaPreImageReviewPackResult> {
  const reviewPackMode = reviewPackModeSchema.parse(input.reviewPackMode ?? "compact");
  const packagingFingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: PACK_SCHEMA_VERSION,
        reviewPackMode,
        previewCodec: reviewPackMode === "listening" ? REVIEW_AUDIO_PREVIEW_CODEC : null,
        previewBitrateKbps: reviewPackMode === "listening" ? REVIEW_AUDIO_PREVIEW_BITRATE_KBPS : null,
      }),
    )
    .digest("hex");
  const narrationPathBeforePreparation = path.join(input.episodeDir, "locales", input.language, input.variant, "audio", "narration.wav");
  await requireCanonicalNarration(narrationPathBeforePreparation);
  // Planning is prepared only when its canonical artifact does not already
  // exist. Packaging-mode changes must not re-run semantic remediation.
  const existingSourcePlanPath = path.join(input.episodeDir, "source", "pre-image-semantic-plan.v1.json");
  const sourcePlanExists = await fs
    .access(existingSourcePlanPath)
    .then(() => true)
    .catch(() => false);
  if (!sourcePlanExists) {
    await preparePositioningProductionEpisode({
      workspaceRoot: path.dirname(input.episodeDir),
      episodeId: path.basename(input.episodeDir),
      language: input.language as "en" | "de" | "es" | "fr" | "pt" | "it",
      variant: input.variant,
      ...(input.sourceGroundedVisualQa ? { sourceGroundedVisualQa: input.sourceGroundedVisualQa } : {}),
    });
  }
  const localeRoot = path.join(input.episodeDir, "locales", input.language, input.variant);
  const sourcePlanPath = path.join(input.episodeDir, "source", "pre-image-semantic-plan.v1.json");
  const narrationPath = path.join(localeRoot, "audio", "narration.wav");
  const scriptPath = path.join(localeRoot, "script.md");
  const scenePlanPath = path.join(localeRoot, "scene-plan.json");
  const manifestPath = path.join(input.episodeDir, "manifest.json");
  const timingPath = path.join(localeRoot, "canonical-timing.v1.json");
  const eventPath = path.join(localeRoot, "retimed-visual-events.json");
  const semanticReviewPath = path.join(input.episodeDir, "shared", "pre-image-semantic-reviews.v1.json");
  const sourceGroundedQaPath = path.join(input.episodeDir, "shared", "source-grounded-visual-qa.v1.json");
  const pacingCalibrationPath = path.join(localeRoot, "audio", "narration", "pacing-calibration.v1.json");
  await Promise.all([
    requiredFile(sourcePlanPath, "the canonical visual plan"),
    requireCanonicalNarration(narrationPath),
    requiredFile(scriptPath, "the English script"),
    requiredFile(scenePlanPath, "the retimed scene plan"),
    requiredFile(manifestPath, "the episode manifest"),
    requiredFile(timingPath, "canonical locale timing"),
    requiredFile(eventPath, "retimed visual events"),
    requiredFile(semanticReviewPath, "semantic gate reviews"),
    requiredFile(sourceGroundedQaPath, "source-grounded visual QA"),
    ...(input.variant === "short" ? [requiredFile(pacingCalibrationPath, "adaptive pacing calibration")] : []),
  ]);
  const [narration, narrationBytes, scenePlanRaw, semanticReviewRaw, pacingCalibrationRaw, timingRaw, eventRaw, episodeManifestRaw, finalPlanRaw] = await Promise.all([
    fs.readFile(scriptPath, "utf8"),
    fs.readFile(narrationPath),
    fs.readFile(scenePlanPath, "utf8"),
    fs.readFile(semanticReviewPath, "utf8"),
    input.variant === "short" ? fs.readFile(pacingCalibrationPath, "utf8") : Promise.resolve(null),
    fs.readFile(timingPath, "utf8"),
    fs.readFile(eventPath, "utf8"),
    fs.readFile(manifestPath, "utf8"),
    fs.readFile(sourcePlanPath, "utf8"),
  ]);
  const scenePlan = scenePlanSchema.parse(JSON.parse(scenePlanRaw) as unknown);
  const timing = JSON.parse(timingRaw) as {
    readonly timingSource?: unknown;
    readonly narrationDurationSeconds?: unknown;
    readonly selectedAudioHash?: unknown;
  };
  if (typeof timing.timingSource !== "string" || typeof timing.narrationDurationSeconds !== "number") throw new Error(`Invalid canonical locale timing artifact: ${timingPath}`);
  const audioMetadata = waveAudioMetadata(narrationBytes);
  const audioDurationSeconds = audioMetadata.durationSeconds;
  const selectedAudioHash = createHash("sha256").update(narrationBytes).digest("hex");
  const pacingCalibration = input.variant === "short" ? veronicaShortPacingCalibrationSchema.parse(JSON.parse(pacingCalibrationRaw ?? "") as unknown) : undefined;
  const diagnostic =
    input.variant === "short"
      ? shortNarrationDiagnostic(audioDurationSeconds, timing.timingSource, pacingCalibration!)
      : {
          mode: "full-current-policy" as const,
          wordCount: narration.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)?/gu)?.length ?? 0,
          narrationDurationSeconds: audioDurationSeconds,
          approximateWordsPerMinute: Math.round(((narration.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)?/gu)?.length ?? 0) / audioDurationSeconds) * 60 * 10) / 10,
          timingSource: timing.timingSource,
          pacingStatus: "not-configured" as const,
          durationAcceptanceStatus: "NOT_APPLICABLE" as const,
        };
  const semanticQualitySchema = z.object({
    status: z.enum(["PASS", "FAIL"]),
    remediationTemplateReuseRate: z.number(),
    genericFallbackSceneRate: z.number(),
    repeatedActionFamilyRate: z.number(),
    repeatedEnvironmentFamilyRate: z.number(),
    intentionalMotifReuseRate: z.number(),
    accidentalRepetitionRate: z.number(),
  });
  const providerReadinessSchema = z.object({
    status: z.enum(["PASS", "FAIL"]),
    missingThesisCount: z.number().int().nonnegative(),
    malformedThesisCount: z.number().int().nonnegative(),
    blockedProjectionCount: z.number().int().nonnegative(),
    internalLanguageIssueCount: z.number().int().nonnegative(),
    incompleteClaimCount: z.number().int().nonnegative(),
    polarityMismatchCount: z.number().int().nonnegative(),
    propositionContradictionCount: z.number().int().nonnegative(),
    treatmentIncompatibilityCount: z.number().int().nonnegative(),
    projectionMismatchCount: z.number().int().nonnegative(),
    lexicalCorruptionCount: z.number().int().nonnegative(),
    motifLeakageCount: z.number().int().nonnegative(),
    harmfulRepetitionCount: z.number().int().nonnegative(),
    issues: z.array(z.object({ sceneId: z.string(), code: z.string(), reason: z.string() })),
  });
  const evidenceSpanSchema = z.object({
    sentenceId: z.string(),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().positive(),
  });
  const projectionSchema = z.object({
    sourceTreatmentHash: z.string(),
    sourcePropositionHash: z.string().nullable(),
    stateProjectionPolicyVersion: z.string(),
  });
  const finalPlan = z
    .object({
      continuity: z.object({ mode: z.string() }).optional(),
      selectedRecurringMotif: z
        .object({
          concept: z.string(),
          motifId: z.string().optional(),
          episodeContentId: z.string().optional(),
          evidenceSpans: z.array(evidenceSpanSchema).optional(),
        })
        .optional(),
      semanticRemediation: z
        .object({
          convergenceStatus: z.string(),
          rounds: z.number().int().nonnegative(),
        })
        .optional(),
      cadenceMetrics: z.object({ durationMs: z.number().nonnegative() }),
      validation: z
        .object({
          status: z.enum(["pass", "fail"]),
          failures: z.array(z.string()),
        })
        .optional(),
      semanticQuality: semanticQualitySchema,
      providerReadiness: providerReadinessSchema,
      sourceGroundedVisualQa: sourceGroundedQaManifestSchema,
      hierarchicalReadiness: z.object({
        sourceFidelityReady: z.boolean(),
        visualReady: z.boolean(),
        technicalReady: z.boolean(),
        providerCandidate: z.boolean(),
        providerRequestsAllowed: z.literal(false),
        blockers: z.array(z.string()),
      }),
      scenes: z.array(
        z.object({
          sceneId: z.string(),
          visibleThesis: z.string().optional(),
          stateComplexity: z.enum(["SINGLE_STATE", "DECISIVE_TRANSITION_MOMENT", "MULTI_STATE_REQUIRED"]).optional(),
          semanticProposition: z
            .object({
              narrationClaim: z.string(),
              polarity: z.string(),
              buyerInterpretation: z.string().optional(),
              evidenceSpans: z.array(evidenceSpanSchema),
            })
            .optional(),
          semanticCoherence: z
            .object({
              claimIntegrity: z.string(),
              polarityCoherence: z.string(),
              propositionInternalCoherence: z.string(),
              treatmentPropositionCompatibility: z.string(),
            })
            .optional(),
          treatment: z.object({
            actionOwnerRole: z.enum(["expert", "buyer", "shared", "none"]).optional(),
            environment: z.string(),
            action: z.string(),
          }),
        }),
      ),
      assets: z.array(
        z.object({
          assetId: z.string(),
          sceneId: z.string(),
          prompt: z.string(),
          projectionProvenance: projectionSchema.optional(),
        }),
      ),
    })
    .parse(JSON.parse(finalPlanRaw) as unknown);
  const stateByScene = new Map(scenePlan.scenes.map((scene, index) => [scene.id, finalPlan.scenes[index]?.stateComplexity ?? "SINGLE_STATE"] as const));
  const actorByScene = new Map(scenePlan.scenes.map((scene, index) => [scene.id, finalPlan.scenes[index]?.treatment.actionOwnerRole ?? "not applicable"] as const));
  const thesisByScene = new Map(
    scenePlan.scenes.flatMap((scene, index) => {
      const thesis = finalPlan.scenes[index]?.visibleThesis?.trim();
      return thesis ? [[scene.id, thesis] as const] : [];
    }),
  );
  const assetsByScene = new Map(
    scenePlan.scenes.map((scene, index) => {
      const semanticSceneId = finalPlan.scenes[index]?.sceneId;
      return [scene.id, semanticSceneId ? finalPlan.assets.filter((asset) => asset.sceneId === semanticSceneId) : []] as const;
    }),
  );
  const semanticReviews = z
    .object({
      convergenceStatus: z.string().optional(),
      remediationRounds: z.number().int().nonnegative().optional(),
      providerReadiness: providerReadinessSchema.optional(),
      semanticQuality: semanticQualitySchema.optional(),
      sourceGroundedVisualQa: sourceGroundedQaManifestSchema,
      reviews: z.array(
        z.object({
          sceneId: z.string(),
          findings: z.array(
            z.object({
              code: z.string(),
              severity: z.string(),
              message: z.string(),
            }),
          ),
        }),
      ),
    })
    .parse(JSON.parse(semanticReviewRaw) as unknown);
  const findingsByScene = new Map(
    scenePlan.scenes.map((scene, index) => [scene.id, (semanticReviews.reviews[index]?.findings ?? []).map((finding) => `${finding.severity}:${finding.code} — ${finding.message}`)] as const),
  );
  const allFindings = semanticReviews.reviews.flatMap((review) => review.findings);
  const warningCount = allFindings.filter((finding) => finding.severity === "warning" || finding.severity === "info").length;
  const blockerCount = allFindings.filter((finding) => finding.severity === "blocker" || finding.severity === "error").length;
  const canonicalConvergenceStatus = blockerCount === 0 && finalPlan.validation?.status !== "fail" && finalPlan.providerReadiness.status === "PASS" ? "CONVERGED" : "SEMANTIC_REMEDIATION_EXHAUSTED";
  const eventArtifact = z
    .object({
      events: z.array(z.object({ startMs: z.number(), durationMs: z.number() })),
    })
    .parse(JSON.parse(eventRaw) as unknown);
  const episodeManifest = z
    .object({
      scenePlan: z.object({
        scenes: z.array(z.object({ timing: z.object({ endSeconds: z.number() }) })),
      }),
    })
    .parse(JSON.parse(episodeManifestRaw) as unknown);
  const finalEvent = eventArtifact.events.at(-1);
  const integrity = validateVeronicaTimingIntegrity({
    audioDurationSeconds,
    ...(pacingCalibration
      ? {
          calibrationDurationSeconds: pacingCalibration.selectedDurationSeconds,
          calibrationAudioHash: pacingCalibration.selectedAudioHash,
        }
      : {}),
    canonicalDurationSeconds: timing.narrationDurationSeconds,
    episodeManifestFinalSceneEndSeconds: episodeManifest.scenePlan.scenes.at(-1)?.timing.endSeconds ?? 0,
    retimedSceneFinalEndSeconds: scenePlan.scenes.at(-1)?.timing.endSeconds ?? 0,
    retimedEventFinalEndSeconds: finalEvent ? (finalEvent.startMs + finalEvent.durationMs) / 1_000 : 0,
    cadenceDurationSeconds: finalPlan.cadenceMetrics.durationMs / 1_000,
    selectedAudioHash,
    ...(typeof timing.selectedAudioHash === "string" ? { canonicalTimingAudioHash: timing.selectedAudioHash } : {}),
  });
  if (integrity.status === "FAIL") throw new Error(`SELECTED_AUDIO_TIMING_MISMATCH: ${integrity.mismatches.join(", ")}`);
  const generatedAtMs = Date.now();
  const outputDir = packDir(input, generatedAtMs);
  await fs.mkdir(outputDir, { recursive: true });
  const canonicalAudioEmbedded = reviewPackMode === "forensic";
  const files: Array<readonly [string, string]> = [
    ...(canonicalAudioEmbedded ? [["narration.wav", narrationPath] as const] : []),
    ["script.md", scriptPath],
    ["retimed-scene-plan.json", scenePlanPath],
    ["canonical-locale-timing.v1.json", timingPath],
    ["retimed-visual-events.json", eventPath],
    ["visual-plan.json", sourcePlanPath],
    ["episode-manifest.json", manifestPath],
    ["pre-image-semantic-reviews.v1.json", semanticReviewPath],
    ["source-grounded-visual-qa.v1.json", sourceGroundedQaPath],
    ...(input.variant === "short" ? [["pacing-calibration.v1.json", pacingCalibrationPath] as const] : []),
  ];
  await Promise.all(files.map(([fileName, sourcePath]) => fs.copyFile(sourcePath, path.join(outputDir, fileName))));
  const preview =
    reviewPackMode === "listening"
      ? await reviewAudioPreview({
          outputDir,
          narrationPath,
          canonicalAudioSha256: selectedAudioHash,
          canonicalDurationSeconds: audioDurationSeconds,
        })
      : { embedded: false, canonical: false };
  const audioIntegrity: AudioIntegrity = audioIntegritySchema.parse({
    schemaVersion: AUDIO_INTEGRITY_SCHEMA_VERSION,
    canonicalAudioEmbedded,
    canonicalAudioPath: path.relative(input.episodeDir, narrationPath).replace(/\\/gu, "/"),
    canonicalAudioSha256: selectedAudioHash,
    selectedAudioSha256: selectedAudioHash,
    decodedDurationSeconds: audioDurationSeconds,
    sampleRateHz: audioMetadata.sampleRateHz,
    channels: audioMetadata.channels,
    codec: audioMetadata.codec,
    container: audioMetadata.container,
    wordCount: diagnostic.wordCount,
    effectiveWpm: diagnostic.approximateWordsPerMinute,
    ...(diagnostic.mode === "short-adaptive"
      ? {
          pacingPolicyVersion: diagnostic.pacingPolicyVersion,
          pacingProfile: "short-adaptive",
          calibrationStatus: diagnostic.calibrationStatus,
        }
      : { pacingProfile: "full-current-policy" }),
    pacingStatus: diagnostic.pacingStatus,
    canonicalTimingDurationSeconds: timing.narrationDurationSeconds,
    finalSceneEndSeconds: scenePlan.scenes.at(-1)?.timing.endSeconds ?? 0,
    finalEventEndSeconds: finalEvent ? (finalEvent.startMs + finalEvent.durationMs) / 1_000 : 0,
    timingIntegrityStatus: integrity.status,
    audioPrepackageValidationStatus: "PASS",
    reviewAudioPreview: preview,
  });
  const audioIntegrityPath = path.join(outputDir, "audio-integrity.json");
  await fs.writeFile(audioIntegrityPath, `${JSON.stringify(audioIntegrity, null, 2)}\n`, "utf8");
  const promptPath = path.join(outputDir, "chatgpt-pre-image-review-request.md");
  const promptsPath = path.join(outputDir, "provider-image-prompts.md");
  const qualityReviewPath = path.join(outputDir, "semantic-quality-review.md");
  const pacingSummary =
    diagnostic.mode === "short-adaptive"
      ? `${diagnostic.wordCount} words; ${diagnostic.narrationDurationSeconds.toFixed(3)}s; ${diagnostic.approximateWordsPerMinute} WPM; natural-pacing status ${diagnostic.pacingStatus}; editorial duration ${diagnostic.editorialDurationStatus}; selected speed ${diagnostic.ttsSpeed}; cached calibration ${diagnostic.calibrationStatus}${diagnostic.legacyCalibrationPolicy ? " under legacy policy" : ""}.`
      : `${diagnostic.wordCount} words; ${diagnostic.narrationDurationSeconds.toFixed(3)}s; ${diagnostic.approximateWordsPerMinute} WPM; full-form pacing policy not configured.`;
  const promptMarkdown = promptReviewMarkdown({
    variant: input.variant,
    reviewPackMode,
    narration,
    pacingSummary,
    scenes: scenePlan.scenes,
    findingsByScene,
    stateByScene,
    actorByScene,
    thesisByScene,
  });
  const providerMarkdown = providerPromptsMarkdown(scenePlan.scenes, stateByScene, actorByScene, thesisByScene, assetsByScene);
  const blockedMarkerCount = providerMarkdown.match(/MISSING\s+[—-]\s+PROVIDER PROJECTION BLOCKED/giu)?.length ?? 0;
  const providerPromptQuality = {
    status:
      blockedMarkerCount === 0 && finalPlan.providerReadiness.internalLanguageIssueCount === 0 && finalPlan.providerReadiness.lexicalCorruptionCount === 0 ? ("PASS" as const) : ("FAIL" as const),
    blockedMarkerCount,
    internalLanguageIssueCount: finalPlan.providerReadiness.internalLanguageIssueCount,
    lexicalCorruptionCount: finalPlan.providerReadiness.lexicalCorruptionCount,
  };
  const semanticCoherenceIntegrity = {
    status:
      finalPlan.providerReadiness.incompleteClaimCount === 0 &&
      finalPlan.providerReadiness.polarityMismatchCount === 0 &&
      finalPlan.providerReadiness.propositionContradictionCount === 0 &&
      finalPlan.providerReadiness.treatmentIncompatibilityCount === 0 &&
      finalPlan.providerReadiness.projectionMismatchCount === 0 &&
      finalPlan.providerReadiness.motifLeakageCount === 0 &&
      finalPlan.providerReadiness.harmfulRepetitionCount === 0
        ? ("PASS" as const)
        : ("FAIL" as const),
    incompleteClaimCount: finalPlan.providerReadiness.incompleteClaimCount,
    polarityMismatchCount: finalPlan.providerReadiness.polarityMismatchCount,
    propositionContradictionCount: finalPlan.providerReadiness.propositionContradictionCount,
    treatmentIncompatibilityCount: finalPlan.providerReadiness.treatmentIncompatibilityCount,
    projectionMismatchCount: finalPlan.providerReadiness.projectionMismatchCount,
    motifLeakageCount: finalPlan.providerReadiness.motifLeakageCount,
    harmfulRepetitionCount: finalPlan.providerReadiness.harmfulRepetitionCount,
  };
  await Promise.all([
    fs.writeFile(promptPath, promptMarkdown, "utf8"),
    fs.writeFile(promptsPath, providerMarkdown, "utf8"),
    fs.writeFile(
      qualityReviewPath,
      semanticQualityReviewMarkdown({
        scenes: scenePlan.scenes,
        finalScenes: finalPlan.scenes,
        assetsByScene,
        findingsByScene,
        remediationRounds: semanticReviews.remediationRounds ?? 0,
      }),
      "utf8",
    ),
  ]);
  const artifactFiles: readonly (readonly [string, string])[] = [
    ["chatgpt-pre-image-review-request.md", promptPath],
    ["provider-image-prompts.md", promptsPath],
    ["semantic-quality-review.md", qualityReviewPath],
    ["audio-integrity.json", audioIntegrityPath],
  ];
  const artifactHashes = Object.fromEntries(await Promise.all(artifactFiles.map(async ([name, artifactPath]) => [name, await fileHash(artifactPath)] as const)));
  const sourceFiles: readonly (readonly [string, string])[] = [
    ["narration.wav", narrationPath],
    ["script.md", scriptPath],
    ["retimed-scene-plan.json", scenePlanPath],
    ["canonical-locale-timing.v1.json", timingPath],
    ["retimed-visual-events.json", eventPath],
    ["visual-plan.json", sourcePlanPath],
    ["episode-manifest.json", manifestPath],
    ["pre-image-semantic-reviews.v1.json", semanticReviewPath],
    ["source-grounded-visual-qa.v1.json", sourceGroundedQaPath],
    ...(input.variant === "short" ? [["pacing-calibration.v1.json", pacingCalibrationPath] as const] : []),
  ];
  const sources = await Promise.all(
    sourceFiles.map(async ([name, sourcePath]) => ({
      name,
      path: path.relative(input.episodeDir, sourcePath).replace(/\\/gu, "/"),
      sha256: await fileHash(sourcePath),
    })),
  );
  const packFileHashes = Object.fromEntries(
    await Promise.all([
      ...files.map(async ([name]) => [name, await fileHash(path.join(outputDir, name))] as const),
      ["audio-integrity.json", await fileHash(audioIntegrityPath)] as const,
      ...(preview.embedded ? [["narration-review.opus", await fileHash(path.join(outputDir, "narration-review.opus"))] as const] : []),
      ["chatgpt-pre-image-review-request.md", await fileHash(promptPath)] as const,
      ["provider-image-prompts.md", await fileHash(promptsPath)] as const,
      ["semantic-quality-review.md", await fileHash(qualityReviewPath)] as const,
    ]),
  );
  const reviewManifestPath = path.join(outputDir, "review-manifest.json");
  await fs.writeFile(
    reviewManifestPath,
    `${JSON.stringify(
      reviewManifestSchema.parse({
        schemaVersion: PACK_SCHEMA_VERSION,
        episodeId: path.basename(input.episodeDir),
        language: input.language,
        variant: input.variant,
        sceneCount: scenePlan.scenes.length,
        narrationDurationSeconds: audioDurationSeconds,
        timingSource: timing.timingSource,
        selectedAudioHash,
        reviewPackMode,
        canonicalAudioEmbedded,
        reviewAudioPreviewEmbedded: preview.embedded,
        packagingFingerprint,
        canonicalAudioSha256: selectedAudioHash,
        canonicalAudioDurationSeconds: audioDurationSeconds,
        audioPrepackageValidation: {
          status: "PASS",
          sourceExists: true,
          sourceHashValidated: true,
          sourceDurationMeasured: true,
        },
        providerRequestsAllowed: false,
        sources,
        artifactHashes,
        packFileHashes,
        packHashValidation: "PASS",
        packCrossArtifactIntegrity: integrity,
        semanticIntegrity: {
          status: blockerCount === 0 && finalPlan.validation?.status !== "fail" ? "PASS" : "FAIL",
          blockerCount: blockerCount + (finalPlan.validation?.status === "fail" ? 1 : 0),
          convergenceStatus: canonicalConvergenceStatus,
        },
        providerProjectionIntegrity: {
          status: finalPlan.providerReadiness.status,
          missingThesisCount: finalPlan.providerReadiness.missingThesisCount,
          malformedThesisCount: finalPlan.providerReadiness.malformedThesisCount,
          blockedProjectionCount: finalPlan.providerReadiness.blockedProjectionCount,
          issueCount: finalPlan.providerReadiness.issues.length,
        },
        providerPromptQuality,
        semanticCoherenceIntegrity,
        sourceGroundedVisualQa: finalPlan.sourceGroundedVisualQa,
        semanticQuality: finalPlan.semanticQuality,
        overallPackValidity:
          integrity.status === "PASS" &&
          blockerCount === 0 &&
          finalPlan.validation?.status !== "fail" &&
          finalPlan.providerReadiness.status === "PASS" &&
          providerPromptQuality.status === "PASS" &&
          semanticCoherenceIntegrity.status === "PASS" &&
          finalPlan.semanticQuality.status === "PASS" &&
          finalPlan.sourceGroundedVisualQa.sourceFidelityReady,
        narrationDiagnostic: diagnostic,
      }),
      null,
      2,
    )}\n`,
    "utf8",
  );
  const readmePath = path.join(outputDir, "README.md");
  await fs.writeFile(
    readmePath,
    `# Veronica pre-image review pack\n\n- Episode: \`${path.basename(input.episodeDir)}\`
- Locale / variant: \`${input.language}/${input.variant}\`
- Review-pack mode: \`${reviewPackMode}\`
- ${reviewPackMode === "compact" ? "Canonical production audio validated before packaging; WAV intentionally omitted from this review archive." : reviewPackMode === "listening" ? "Canonical production audio validated before packaging; compressed review-only narration preview included; production WAV omitted." : "Canonical production WAV included for forensic review."}
- CANONICAL_AUDIO_EMBEDDED: **${canonicalAudioEmbedded}**.
- CANONICAL_AUDIO_PREPACKAGE_VALIDATION: **PASS**.
- Narration duration: \`${audioDurationSeconds.toFixed(3)}s\`
- Word count / approximate WPM: \`${diagnostic.wordCount}\` / \`${diagnostic.approximateWordsPerMinute}\`${diagnostic.mode === "short-adaptive" ? ` (natural-pacing \`${diagnostic.pacingStatus}\`${diagnostic.preferredWpmRange ? `; locale/profile WPM guidance \`${diagnostic.preferredWpmRange.join("–")}\`` : ""}; editorial duration \`${diagnostic.editorialDurationStatus}\`)\n- TTS pacing: initial \`${diagnostic.initialTtsSpeed}\`, selected \`${diagnostic.ttsSpeed}\`, \`${diagnostic.calibrationAttemptCount}\` cached measured attempt(s), normalization \`${diagnostic.speedNormalizationApplied}\`, calibration \`${diagnostic.calibrationStatus}\`; policy \`${diagnostic.calibrationPolicyVersion}\`${diagnostic.legacyCalibrationPolicy ? " (legacy cached audio reused; future generation uses current natural-pacing policy)" : ""}` : "\n- TTS pacing: full-form current policy preserved; no Short adaptive calibration."}
- Canonical timing source: \`${timing.timingSource}\`
- Scene count: \`${scenePlan.scenes.length}\`
- Selected recurring motif: \`${finalPlan.selectedRecurringMotif?.concept ?? "none"}\`
- Continuity strategy: \`${finalPlan.continuity?.mode ?? "not recorded"}\`
- Automated semantic gate: review-required (\`${warningCount}\` warnings; \`${blockerCount}\` blockers); human pre-image approval is not recorded.
- Semantic remediation: \`${semanticReviews.convergenceStatus ?? "LEGACY_UNKNOWN"}\` after \`${semanticReviews.remediationRounds ?? 0}\` round(s).
- Provider projection readiness: **${finalPlan.providerReadiness.status}** (missing theses \`${finalPlan.providerReadiness.missingThesisCount}\`; malformed theses \`${finalPlan.providerReadiness.malformedThesisCount}\`; blocked projections \`${finalPlan.providerReadiness.blockedProjectionCount}\`).
- Provider prompt quality: **${providerPromptQuality.status}** (blocked markers \`${providerPromptQuality.blockedMarkerCount}\`; internal-language findings \`${providerPromptQuality.internalLanguageIssueCount}\`; lexical corruptions \`${providerPromptQuality.lexicalCorruptionCount}\`).
- Semantic coherence integrity: **${semanticCoherenceIntegrity.status}** (incomplete claims \`${semanticCoherenceIntegrity.incompleteClaimCount}\`; polarity mismatches \`${semanticCoherenceIntegrity.polarityMismatchCount}\`; proposition contradictions \`${semanticCoherenceIntegrity.propositionContradictionCount}\`; treatment incompatibilities \`${semanticCoherenceIntegrity.treatmentIncompatibilityCount}\`; projection mismatches \`${semanticCoherenceIntegrity.projectionMismatchCount}\`; motif leakage \`${semanticCoherenceIntegrity.motifLeakageCount}\`; harmful repetition \`${semanticCoherenceIntegrity.harmfulRepetitionCount}\`).
- Source-grounded scene QA: **${finalPlan.sourceGroundedVisualQa.sourceFidelityReady ? "PASS" : "BLOCKED"}** (PASS \`${finalPlan.sourceGroundedVisualQa.aggregate.scenePassCount}\`; REVIEW \`${finalPlan.sourceGroundedVisualQa.aggregate.sceneReviewCount}\`; BLOCK \`${finalPlan.sourceGroundedVisualQa.aggregate.sceneBlockCount}\`; UNAVAILABLE \`${finalPlan.sourceGroundedVisualQa.aggregate.sceneUnavailableCount}\`; escalated \`${finalPlan.sourceGroundedVisualQa.aggregate.scenesEscalated}\`; remediated \`${finalPlan.sourceGroundedVisualQa.aggregate.scenesRemediated}\`).
- Source-grounded sequence QA: **${finalPlan.sourceGroundedVisualQa.aggregate.sequenceVerdict}** (defects \`${finalPlan.sourceGroundedVisualQa.aggregate.sequenceDefectCount}\`).
- Source-grounded QA execution: \`${finalPlan.sourceGroundedVisualQa.sourceGroundedQaExecution.profile}\` / \`${finalPlan.sourceGroundedVisualQa.sourceGroundedQaExecution.transport}\`; wall \`${finalPlan.sourceGroundedVisualQa.sourceGroundedQaExecution.wallClockMs}ms\`; concurrency configured/effective/max \`${finalPlan.sourceGroundedVisualQa.aggregate.configuredConcurrency}/${finalPlan.sourceGroundedVisualQa.aggregate.effectiveConcurrency}/${finalPlan.sourceGroundedVisualQa.aggregate.maxObservedConcurrency}\`; primary/escalation/advisor/sequence \`${finalPlan.sourceGroundedVisualQa.aggregate.primaryApiCalls}/${finalPlan.sourceGroundedVisualQa.aggregate.escalationApiCalls}/${finalPlan.sourceGroundedVisualQa.aggregate.remediationApiCalls}/${finalPlan.sourceGroundedVisualQa.aggregate.sequenceApiCalls}\`; advisor bypass/no-op/rejudge requests/scenes \`${finalPlan.sourceGroundedVisualQa.aggregate.advisorBypassCount}/${finalPlan.sourceGroundedVisualQa.aggregate.noOpRemediationCount}/${finalPlan.sourceGroundedVisualQa.aggregate.rejudgeRequestCount}/${finalPlan.sourceGroundedVisualQa.aggregate.scenesRejudged}\`; hits/misses \`${finalPlan.sourceGroundedVisualQa.aggregate.cacheHits}/${finalPlan.sourceGroundedVisualQa.aggregate.cacheMisses}\`; retries/rate-limits \`${finalPlan.sourceGroundedVisualQa.aggregate.retryCount}/${finalPlan.sourceGroundedVisualQa.aggregate.rateLimitEvents}\`; budget \`${finalPlan.sourceGroundedVisualQa.aggregate.budgetStatus}\` with \`${finalPlan.sourceGroundedVisualQa.aggregate.providerCallsReserved}\` calls / \`$${finalPlan.sourceGroundedVisualQa.aggregate.estimatedCostUsd.toFixed(4)}\` estimated; tokens input/cached/output \`${finalPlan.sourceGroundedVisualQa.aggregate.inputTokens}/${finalPlan.sourceGroundedVisualQa.aggregate.cachedInputTokens}/${finalPlan.sourceGroundedVisualQa.aggregate.outputTokens}\`.
- Remediation template quality: **${finalPlan.semanticQuality.status}** (fallback \`${finalPlan.semanticQuality.genericFallbackSceneRate}\`; action-family reuse \`${finalPlan.semanticQuality.repeatedActionFamilyRate}\`; environment-family reuse \`${finalPlan.semanticQuality.repeatedEnvironmentFamilyRate}\`).
- Provider request allowed: **false** — \`BLOCKED_PENDING_HUMAN_PRE_IMAGE_APPROVAL\`.
- PACK_HASH_VALIDATION: **PASS**.
- PACK_CROSS_ARTIFACT_INTEGRITY: **${integrity.status}** (technical epsilon \`${integrity.epsilonSeconds}s\`).

Review \`chatgpt-pre-image-review-request.md\`, \`semantic-quality-review.md\`, \`visual-plan.json\`, \`retimed-scene-plan.json\`, \`canonical-locale-timing.v1.json\`, and \`retimed-visual-events.json\`; respond scene-by-scene, then record human approval through the normal workflow. \`provider-image-prompts.md\` is **UNAPPROVED / DO NOT SUBMIT**.\n`,
    "utf8",
  );
  await fs.writeFile(path.join(packRoot(input), "latest.json"), `${JSON.stringify({ schemaVersion: "veronica-pre-image-review-pack-latest.v1", packDir: path.basename(outputDir) })}\n`, "utf8");
  const zipPath = path.resolve(packRoot(input), zipFileName(input, reviewPackMode, generatedAtMs));
  await execFileAsync("zip", ["-X", "-q", "-r", zipPath, path.basename(outputDir)], {
    cwd: packRoot(input),
  });
  await execFileAsync("unzip", ["-t", zipPath], { cwd: packRoot(input) });
  return {
    packDir: outputDir,
    manifestPath: reviewManifestPath,
    readmePath,
    promptPath,
    zipPath,
    zipSha256: await fileHash(zipPath),
    generatedAtMs,
    reviewPackMode,
  };
}

export async function assertVeronicaPreImageReviewPackCurrent(input: PackInput): Promise<void> {
  const latestPath = path.join(packRoot(input), "latest.json");
  const latest = z
    .object({
      schemaVersion: z.literal("veronica-pre-image-review-pack-latest.v1"),
      packDir: z.string().regex(/^run-\d+$/u),
    })
    .parse(JSON.parse(await fs.readFile(latestPath, "utf8")) as unknown);
  const manifestPath = path.join(packRoot(input), latest.packDir, "review-manifest.json");
  let stored: z.infer<typeof reviewManifestSchema>;
  try {
    stored = reviewManifestSchema.parse(JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown);
  } catch {
    throw new Error(
      `Veronica image generation requires a current pre-image review pack. Run: mediaforge veronica-media images review-pack --workspace ${path.dirname(input.episodeDir)} --episode-id ${path.basename(input.episodeDir)} --language ${input.language} --variant ${input.variant}`,
    );
  }
  if (
    !stored.overallPackValidity ||
    stored.providerProjectionIntegrity.status !== "PASS" ||
    stored.providerPromptQuality.status !== "PASS" ||
    stored.semanticCoherenceIntegrity.status !== "PASS" ||
    stored.semanticQuality.status !== "PASS" ||
    !stored.sourceGroundedVisualQa.sourceFidelityReady
  ) {
    throw new Error("Veronica image generation is blocked: semantic/provider prompt readiness integrity failed; regenerate and review the pack.");
  }
  if (!stored.providerRequestsAllowed) {
    throw new Error("Veronica image generation is blocked: this pack is awaiting explicit human pre-image approval.");
  }
  if (!stored.sources.some((source) => source.name === "pre-image-semantic-reviews.v1.json")) {
    throw new Error(
      "Veronica image generation requires a review pack containing current semantic-gate evidence. Regenerate the Veronica pre-image review pack, obtain human approval, then retry image generation.",
    );
  }
  if (!stored.sources.some((source) => source.name === "source-grounded-visual-qa.v1.json")) {
    throw new Error("Veronica image generation requires current source-grounded scene and sequence adjudication evidence.");
  }
  for (const source of stored.sources) {
    const fileName = source.name;
    const sourcePath =
      fileName === "narration.wav"
        ? path.join(input.episodeDir, "locales", input.language, input.variant, "audio", "narration.wav")
        : fileName === "script.md"
          ? path.join(input.episodeDir, "locales", input.language, input.variant, "script.md")
          : fileName === "retimed-scene-plan.json"
            ? path.join(input.episodeDir, "locales", input.language, input.variant, "scene-plan.json")
            : fileName === "visual-plan.json"
              ? path.join(input.episodeDir, "source", "pre-image-semantic-plan.v1.json")
              : fileName === "episode-manifest.json"
                ? path.join(input.episodeDir, "manifest.json")
                : fileName === "canonical-locale-timing.v1.json" || fileName === "retimed-visual-events.json"
                  ? path.join(input.episodeDir, "locales", input.language, input.variant, fileName)
                  : fileName === "pacing-calibration.v1.json"
                    ? path.join(input.episodeDir, "locales", input.language, input.variant, "audio", "narration", fileName)
                    : path.join(input.episodeDir, "shared", fileName);
    if ((await fileHash(sourcePath)) !== source.sha256) {
      throw new Error(`Veronica pre-image review pack is stale because ${fileName} changed. Recreate it before image generation.`);
    }
  }
}
