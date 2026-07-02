import fs from "node:fs/promises";
import path from "node:path";
import { sceneIdSchema, type VoiceProfile } from "@mediaforge/domain";
import {
  copyAtomic,
  ensureDir,
  fileExists,
  hashFile,
  hashText,
  readJsonIfExists,
  writeJsonAtomic,
} from "@mediaforge/shared";
import { z } from "zod";
import type { SpeechProvider } from "./index.js";
import { parseWavMetadata } from "./wav-analysis.js";
import { loadSpeechVoiceSettings, type SpeechArtifactType, type SpeechVoicePreset } from "./voice-settings.js";

export const VOICE_BENCHMARK_SCHEMA_VERSION = "voice-benchmark-v1" as const;
export const DEFAULT_VOICE_BENCHMARK_MAX_SAMPLES = 4;
export const DEFAULT_VOICE_BENCHMARK_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
] as const;

export const STANDARD_VOICE_BENCHMARK_PASSAGE = [
  "At 6:17 on a wet November morning, Mara Voss noticed the lighthouse was blinking in groups of three.",
  "For ninety-two years it had warned ships away from Fehmarn's eastern reef, steady as a pulse, ordinary enough to ignore.",
  "Then she found the logbook entry dated March 14, 1978: same rhythm, same fog, same name written in the margin.",
  "Mara understood the signal was not a warning from the tower. It was a reply.",
  "She had less than eight minutes before the harbor cameras turned back toward the water.",
  "Behind the final page, someone had pressed a child's blue ribbon, still damp with salt.",
  "When the light blinked again, every radio in town whispered her mother's voice.",
] as const;

export interface VoiceEvaluationScore {
  readonly naturalness: number | null;
  readonly distinctiveness: number | null;
  readonly emotionalAppropriateness: number | null;
  readonly pronunciation: number | null;
  readonly continuity: number | null;
  readonly listenerFatigue: number | null;
  readonly genericAiRecognizability: number | null;
  readonly notes: string;
  readonly selectedFor?: {
    readonly global?: boolean | undefined;
    readonly language?: readonly string[] | undefined;
    readonly channel?: readonly string[] | undefined;
    readonly variant?: readonly SpeechArtifactType[] | undefined;
  } | undefined;
}

export interface VoiceBenchmarkSample {
  readonly label: string;
  readonly voice: string;
  readonly model: string;
  readonly instructionsFingerprint: string;
  readonly speed: number;
  readonly language: string;
  readonly timestamp: string;
  readonly sourceHash: string;
  readonly requestFingerprint: string;
  readonly cacheDecision: "hit" | "miss";
  readonly audioDurationSeconds: number | null;
  readonly outputPath: string;
  readonly status: "completed" | "failed";
  readonly evaluatorScore: VoiceEvaluationScore;
  readonly errorClass?: string | undefined;
  readonly errorMessage?: string | undefined;
}

export interface VoiceBenchmarkRun {
  readonly schemaVersion: typeof VOICE_BENCHMARK_SCHEMA_VERSION;
  readonly runId: string;
  readonly createdAt: string;
  readonly labelMode: "anonymous" | "voice";
  readonly passage: string;
  readonly sourceHash: string;
  readonly outputFormat: "wav";
  readonly maxSamples: number;
  readonly decisions: {
    readonly globalVoice: string | null;
    readonly byLanguage: Record<string, string>;
    readonly byChannel: Record<string, string>;
    readonly byVariant: {
      readonly full?: string | undefined;
      readonly short?: string | undefined;
    };
  };
  readonly samples: readonly VoiceBenchmarkSample[];
}

export interface RunVoiceBenchmarkRequest {
  readonly outputDir: string;
  readonly provider: SpeechProvider;
  readonly voices?: readonly string[];
  readonly maxSamples?: number;
  readonly labelMode?: "anonymous" | "voice";
  readonly model?: string;
  readonly language?: string;
  readonly variant?: SpeechArtifactType;
  readonly preset?: SpeechVoicePreset;
  readonly instructions?: string;
  readonly speed?: number;
  readonly passage?: string;
  readonly createdAt?: string;
}

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const scoreSchema = z.object({
  naturalness: z.number().min(1).max(5).nullable(),
  distinctiveness: z.number().min(1).max(5).nullable(),
  emotionalAppropriateness: z.number().min(1).max(5).nullable(),
  pronunciation: z.number().min(1).max(5).nullable(),
  continuity: z.number().min(1).max(5).nullable(),
  listenerFatigue: z.number().min(1).max(5).nullable(),
  genericAiRecognizability: z.number().min(1).max(5).nullable(),
  notes: z.string().max(2_000),
  selectedFor: z
    .object({
      global: z.boolean().optional(),
      language: z.array(z.string().min(1)).optional(),
      channel: z.array(z.string().min(1)).optional(),
      variant: z.array(z.enum(["full", "short"])).optional(),
    })
    .strict()
    .optional(),
}).strict();

export const voiceBenchmarkRunSchema: z.ZodType<VoiceBenchmarkRun> = z.object({
  schemaVersion: z.literal(VOICE_BENCHMARK_SCHEMA_VERSION),
  runId: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  labelMode: z.enum(["anonymous", "voice"]),
  passage: z.string().min(1).max(2_000),
  sourceHash: sha256Schema,
  outputFormat: z.literal("wav"),
  maxSamples: z.number().int().positive().max(20),
  decisions: z.object({
    globalVoice: z.string().min(1).nullable(),
    byLanguage: z.record(z.string(), z.string().min(1)),
    byChannel: z.record(z.string(), z.string().min(1)),
    byVariant: z.object({
      full: z.string().min(1).optional(),
      short: z.string().min(1).optional(),
    }).strict(),
  }).strict(),
  samples: z.array(z.object({
    label: z.string().min(1),
    voice: z.string().min(1),
    model: z.string().min(1),
    instructionsFingerprint: sha256Schema,
    speed: z.number().finite().positive(),
    language: z.string().min(1),
    timestamp: z.string().datetime({ offset: true }),
    sourceHash: sha256Schema,
    requestFingerprint: sha256Schema,
    cacheDecision: z.enum(["hit", "miss"]),
    audioDurationSeconds: z.number().finite().positive().nullable(),
    outputPath: z.string().min(1).max(500),
    status: z.enum(["completed", "failed"]),
    evaluatorScore: scoreSchema,
    errorClass: z.string().min(1).optional(),
    errorMessage: z.string().min(1).max(500).optional(),
  }).strict()),
}).strict();

function scoreTemplate(): VoiceEvaluationScore {
  return {
    naturalness: null,
    distinctiveness: null,
    emotionalAppropriateness: null,
    pronunciation: null,
    continuity: null,
    listenerFatigue: null,
    genericAiRecognizability: null,
    notes: "",
  };
}

function normalizeVoices(voices: readonly string[], maxSamples: number): string[] {
  const normalized = [...new Set(voices.map((voice) => voice.trim()).filter((voice) => voice.length > 0))];
  if (normalized.length === 0) {
    throw new Error("Voice benchmark requires at least one voice.");
  }
  if (!Number.isInteger(maxSamples) || maxSamples <= 0 || maxSamples > 20) {
    throw new Error("--max-samples must be an integer from 1 to 20.");
  }
  return normalized.slice(0, maxSamples);
}

function benchmarkFingerprint(input: {
  readonly passage: string;
  readonly model: string;
  readonly voice: string;
  readonly instructions: string;
  readonly speed: number;
  readonly language: string;
}): string {
  return hashText(JSON.stringify({ ...input, schemaVersion: VOICE_BENCHMARK_SCHEMA_VERSION, outputFormat: "wav" }));
}

function labelFor(input: { readonly labelMode: "anonymous" | "voice"; readonly voice: string; readonly index: number }): string {
  if (input.labelMode === "voice") {
    return input.voice;
  }
  return `sample-${String(input.index + 1).padStart(2, "0")}`;
}

function orderedVoices(voices: readonly string[], runId: string, labelMode: "anonymous" | "voice"): string[] {
  if (labelMode === "voice") {
    return [...voices].sort((left, right) => left.localeCompare(right));
  }
  return [...voices].sort((left, right) => hashText(`${runId}:${left}`).localeCompare(hashText(`${runId}:${right}`)));
}

function voiceProfileFor(voice: string, baseProfile: VoiceProfile): VoiceProfile {
  return {
    ...baseProfile,
    id: `openai-${voice}`,
    label: voice,
    providerVoiceId: voice,
  };
}

function classifyError(error: unknown): { readonly errorClass: string; readonly errorMessage: string } {
  if (error instanceof Error) {
    return {
      errorClass: error.name || "Error",
      errorMessage: error.message.slice(0, 500),
    };
  }
  return {
    errorClass: "UnknownError",
    errorMessage: String(error).slice(0, 500),
  };
}

async function readWavDurationSeconds(filePath: string): Promise<number | null> {
  const buffer = await fs.readFile(filePath);
  return parseWavMetadata(filePath, buffer).durationSeconds;
}

export async function runVoiceBenchmark(request: RunVoiceBenchmarkRequest): Promise<VoiceBenchmarkRun> {
  const createdAt = request.createdAt ?? new Date().toISOString();
  const labelMode = request.labelMode ?? "anonymous";
  const maxSamples = request.maxSamples ?? DEFAULT_VOICE_BENCHMARK_MAX_SAMPLES;
  const language = request.language ?? "en";
  const variant = request.variant ?? "full";
  const settings = loadSpeechVoiceSettings({
    preset: request.preset ?? "fast",
    language,
    artifactType: variant,
    ...(request.model ? { model: request.model } : {}),
    ...(request.speed !== undefined ? { speed: request.speed } : {}),
  });
  const passage = request.passage ?? STANDARD_VOICE_BENCHMARK_PASSAGE.join(" ");
  const sourceHash = hashText(passage);
  const model = request.model ?? settings.model;
  const instructions = request.instructions ?? settings.instructions;
  const instructionsFingerprint = hashText(instructions);
  const speed = request.speed ?? settings.speed ?? 1;
  const selectedVoices = orderedVoices(
    normalizeVoices(request.voices ?? DEFAULT_VOICE_BENCHMARK_VOICES, maxSamples),
    hashText(`${createdAt}:${sourceHash}`),
    labelMode
  );
  const runId = hashText(JSON.stringify({ createdAt, sourceHash, selectedVoices, model, instructionsFingerprint, speed, language })).slice(0, 16);
  const root = path.resolve(request.outputDir);
  const samplesDir = path.join(root, "samples");
  const cacheDir = path.join(root, "cache");
  await ensureDir(samplesDir);
  await ensureDir(cacheDir);

  const samples: VoiceBenchmarkSample[] = [];
  for (const [index, voice] of selectedVoices.entries()) {
    const label = labelFor({ labelMode, voice, index });
    const requestFingerprint = benchmarkFingerprint({ passage, model, voice, instructions, speed, language });
    const cachePath = path.join(cacheDir, `${requestFingerprint}.wav`);
    const outputPath = path.join(samplesDir, `${label}.wav`);
    let cacheDecision: "hit" | "miss" = "hit";
    try {
      if (!(await fileExists(cachePath))) {
        cacheDecision = "miss";
        await request.provider.synthesize(
          {
            sceneId: sceneIdSchema.parse("scene-001"),
            text: passage,
            voiceProfile: voiceProfileFor(voice, settings.profile),
            outputPath: cachePath,
            instructions,
          },
          new AbortController().signal
        );
      }
      await copyAtomic(cachePath, outputPath);
      const audioDurationSeconds = await readWavDurationSeconds(outputPath);
      samples.push({
        label,
        voice,
        model,
        instructionsFingerprint,
        speed,
        language,
        timestamp: createdAt,
        sourceHash,
        requestFingerprint,
        cacheDecision,
        audioDurationSeconds,
        outputPath: path.relative(root, outputPath).replace(/\\/gu, "/"),
        status: "completed",
        evaluatorScore: scoreTemplate(),
      });
    } catch (error) {
      const classified = classifyError(error);
      samples.push({
        label,
        voice,
        model,
        instructionsFingerprint,
        speed,
        language,
        timestamp: createdAt,
        sourceHash,
        requestFingerprint,
        cacheDecision,
        audioDurationSeconds: null,
        outputPath: path.relative(root, outputPath).replace(/\\/gu, "/"),
        status: "failed",
        evaluatorScore: scoreTemplate(),
        errorClass: classified.errorClass,
        errorMessage: classified.errorMessage,
      });
    }
  }

  const run = voiceBenchmarkRunSchema.parse({
    schemaVersion: VOICE_BENCHMARK_SCHEMA_VERSION,
    runId,
    createdAt,
    labelMode,
    passage,
    sourceHash,
    outputFormat: "wav",
    maxSamples,
    decisions: {
      globalVoice: null,
      byLanguage: {},
      byChannel: {},
      byVariant: {},
    },
    samples,
  });
  await writeJsonAtomic(path.join(root, "voice-benchmark.json"), run);
  return run;
}

export async function loadVoiceBenchmarkRun(filePath: string): Promise<VoiceBenchmarkRun | null> {
  return readJsonIfExists(filePath, (value) => voiceBenchmarkRunSchema.parse(value));
}

export async function verifyVoiceBenchmarkArtifact(root: string, run: VoiceBenchmarkRun): Promise<readonly string[]> {
  const issues: string[] = [];
  if (hashText(run.passage) !== run.sourceHash) {
    issues.push("Benchmark passage hash does not match sourceHash.");
  }
  for (const sample of run.samples) {
    if (sample.status !== "completed") {
      continue;
    }
    const absolutePath = path.resolve(root, sample.outputPath);
    if (!(await fileExists(absolutePath))) {
      issues.push(`Missing sample output: ${sample.outputPath}`);
      continue;
    }
    const actualHash = await hashFile(absolutePath).catch(() => "");
    if (actualHash.length !== 64) {
      issues.push(`Unable to hash sample output: ${sample.outputPath}`);
    }
  }
  return issues;
}
