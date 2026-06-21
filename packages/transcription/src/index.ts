import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  HumanActionRequiredError,
  ProviderAuthenticationError,
  ProviderResponseError,
  sceneIdSchema,
  transcriptSchema,
  transcriptSegmentSchema,
  transcriptWordSchema,
  type EpisodeId,
  type NormalizedTranscript,
  type Transcript,
  type TranscriptSegment,
  type SentenceSegmentationOptions,
} from "@mediaforge/domain";
import { runCommand } from "@mediaforge/process-runner";
import { buildSrt, ensureDir, normalizeWhitespace, splitIntoSentences, splitIntoWords, writeJsonAtomic, writeTextAtomic } from "@mediaforge/shared";
import { z } from "zod";
import {
  DEFAULT_SEGMENTATION_OPTIONS,
  buildVisualScenesFromSubtitleSegments,
  extractRawSegmentsFromWhisperResponse,
  extractTimedWordsFromWhisperResponse,
  normalizeTranscriptFromWords,
  parseWhisperRawArtifact,
  type WhisperRawChunk,
  type WhisperRawTranscriptArtifact,
  writeNormalizedTranscriptArtifacts
} from "./segmentation.js";
import {
  AtomicWriteError,
  MissingAudioFileError,
  MissingWordTimestampsError,
  WhisperBinaryNotFoundError,
  WhisperProcessFailureError,
  WhisperTimeoutError
} from "./errors.js";

export {
  DEFAULT_SEGMENTATION_OPTIONS,
  buildSentenceSegments,
  buildVisualScenesFromSubtitleSegments,
  extractRawSegmentsFromWhisperResponse,
  extractTimedWordsFromWhisperResponse,
  normalizeTranscriptFromWords,
  parseWhisperRawArtifact,
  validateNormalizedTranscript,
  writeNormalizedTranscriptArtifacts
} from "./segmentation.js";
export type { WhisperRawTranscriptArtifact } from "./segmentation.js";
export * from "./errors.js";

export interface TranscriptionRequest {
  readonly sourceId: EpisodeId;
  readonly transcript?: Transcript;
  readonly audioPath?: string;
  readonly language?: string;
  readonly episodeDir?: string;
}

export interface TranscriptionProvider {
  transcribe(request: TranscriptionRequest, signal: AbortSignal): Promise<Transcript>;
}

export interface WhisperCppOptions {
  readonly whisperBin: string;
  readonly whisperModel: string;
  readonly language?: string | undefined;
  readonly threads?: number | undefined;
  readonly processors?: number | undefined;
  readonly timeoutMs?: number | undefined;
  readonly maxDurationSeconds?: number | undefined;
  readonly chunkDurationSeconds?: number | undefined;
  readonly chunkOverlapSeconds?: number | undefined;
}

function whisperDtwPresetFromModelPath(modelPath: string): string {
  const modelName = path.basename(modelPath);
  const match = /ggml-(?<preset>.+)\.bin$/u.exec(modelName);
  return match?.groups?.["preset"] ?? "base";
}

export interface OpenAiTranscriptionOptions {
  readonly baseUrl?: string;
  readonly apiKey: string;
  readonly model?: string;
  readonly language?: string;
  readonly prompt?: string;
  readonly responseFormat?: "verbose_json" | "json";
}

const whisperResponseSchema = z.object({
  text: z.string().optional(),
  transcription: z
    .array(
      z.object({
        timestamps: z
          .object({
            from: z.string(),
            to: z.string()
          })
          .optional(),
        offsets: z
          .object({
            from: z.number().optional(),
            to: z.number().optional()
          })
          .optional(),
        text: z.string().optional()
      })
    )
    .optional()
});

const openAiVerboseTranscriptionSchema = z.object({
  text: z.string(),
  language: z.string().optional(),
  segments: z
    .array(
      z.object({
        id: z.number().int().nonnegative(),
        start: z.number().nonnegative(),
        end: z.number().nonnegative(),
        text: z.string(),
        tokens: z.array(z.number()).default([]),
        avg_logprob: z.number().optional(),
        compression_ratio: z.number().optional(),
        no_speech_prob: z.number().optional(),
        seek: z.number().optional(),
        temperature: z.number().optional()
      })
    )
    .optional(),
  words: z
    .array(
      z.object({
        start: z.number().nonnegative(),
        end: z.number().nonnegative(),
        word: z.string()
      })
    )
    .optional(),
  duration: z.number().nonnegative().optional()
});

const openAiTextTranscriptionSchema = z.object({
  text: z.string(),
  language: z.string().optional()
});

function parseWhisperTimestamp(value: string): number {
  const match = /^(?<hours>\d{2}):(?<minutes>\d{2}):(?<seconds>\d{2})[,.](?<millis>\d{3})$/u.exec(value);
  const groups = match?.groups;
  if (
    !groups ||
    typeof groups["hours"] !== "string" ||
    typeof groups["minutes"] !== "string" ||
    typeof groups["seconds"] !== "string" ||
    typeof groups["millis"] !== "string"
  ) {
    return 0;
  }
  const hours = Number.parseInt(groups["hours"], 10);
  const minutes = Number.parseInt(groups["minutes"], 10);
  const seconds = Number.parseInt(groups["seconds"], 10);
  const millis = Number.parseInt(groups["millis"], 10);
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

async function ensureWavInput(audioPath: string, workingDir: string, signal: AbortSignal): Promise<string> {
  if (audioPath.toLowerCase().endsWith(".wav")) {
    return audioPath;
  }
  const wavPath = path.join(workingDir, `${path.basename(audioPath, path.extname(audioPath))}.wav`);
  await runCommand("ffmpeg", ["-y", "-i", audioPath, "-ac", "1", "-ar", "16000", wavPath], {
    timeoutMs: 120000,
    signal
  });
  return wavPath;
}

async function inspectAudioDurationSeconds(filePath: string, signal: AbortSignal): Promise<number> {
  const result = await runCommand("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath], {
    timeoutMs: 120000,
    signal
  });
  const duration = Number.parseFloat(result.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new ProviderResponseError(`Unable to inspect audio duration for ${filePath}.`);
  }
  return duration;
}

function assignWordsToSegments(
  words: ReadonlyArray<{
    readonly start: number;
    readonly end: number;
    readonly word: string;
  }>,
  segments: ReadonlyArray<{
    readonly start: number;
    readonly end: number;
  }>
): Array<Array<{ readonly index: number; readonly text: string; readonly startSeconds: number; readonly endSeconds: number }>> {
  return segments.map((segment) =>
    words
      .filter((word) => word.start < segment.end && word.end > segment.start)
      .map((word, index) => ({
        index,
        text: word.word,
        startSeconds: word.start,
        endSeconds: word.end
      }))
  );
}

function splitTranscriptTextIntoSegments(text: string): string[] {
  const sentences = splitIntoSentences(text).map((sentence) => normalizeWhitespace(sentence)).filter((sentence) => sentence.length > 0);
  return sentences.length > 0 ? sentences : splitIntoWords(text).length > 0 ? [normalizeWhitespace(text)] : [];
}

function buildApproximateSegmentTimings(
  chunkStartSeconds: number,
  chunkDurationSeconds: number,
  segments: ReadonlyArray<string>
): Array<{ readonly startSeconds: number; readonly endSeconds: number; readonly text: string }> {
  if (segments.length === 0) {
    return [];
  }
  const weightedLengths = segments.map((segment) => Math.max(1, splitIntoWords(segment).length));
  const totalWeight = weightedLengths.reduce((sum, value) => sum + value, 0);
  let currentStart = chunkStartSeconds;
  return segments.map((segment, index) => {
    const weight = weightedLengths[index] ?? 1;
    const duration = index === segments.length - 1 ? chunkStartSeconds + chunkDurationSeconds - currentStart : (chunkDurationSeconds * weight) / totalWeight;
    const endSeconds = Math.max(currentStart + 0.1, currentStart + duration);
    const entry = {
      startSeconds: currentStart,
      endSeconds,
      text: segment
    };
    currentStart = endSeconds;
    return entry;
  });
}

async function createChunkWav(sourceAudioPath: string, workingDir: string, startSeconds: number, durationSeconds: number, signal: AbortSignal): Promise<string> {
  const chunkPath = path.join(workingDir, `chunk-${String(Math.max(0, Math.floor(startSeconds))).padStart(6, "0")}.wav`);
  await runCommand(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(startSeconds),
      "-t",
      String(durationSeconds),
      "-i",
      sourceAudioPath,
      "-ac",
      "1",
      "-ar",
      "16000",
      chunkPath
    ],
    {
      timeoutMs: 120000,
      signal
    }
  );
  return chunkPath;
}

export function chunkRanges(durationSeconds: number, chunkDurationSeconds: number): Array<{ readonly startSeconds: number; readonly durationSeconds: number }> {
  const ranges: Array<{ readonly startSeconds: number; readonly durationSeconds: number }> = [];
  for (let startSeconds = 0; startSeconds < durationSeconds; startSeconds += chunkDurationSeconds) {
    const remaining = durationSeconds - startSeconds;
    ranges.push({
      startSeconds,
      durationSeconds: Math.min(chunkDurationSeconds, remaining)
    });
  }
  return ranges;
}

export function mergeChunkSegments(
  chunked: ReadonlyArray<{
    readonly startSeconds: number;
    readonly transcript: Transcript;
  }>,
  sourceId: EpisodeId,
  language: string
): Transcript {
  let segmentCounter = 0;
  const segments = chunked.flatMap((chunk) =>
    chunk.transcript.segments.map((segment) => {
      segmentCounter += 1;
      return transcriptSegmentSchema.parse({
        id: `segment-${String(segmentCounter).padStart(3, "0")}`,
        startSeconds: chunk.startSeconds + segment.startSeconds,
        endSeconds: chunk.startSeconds + segment.endSeconds,
        text: segment.text,
        words: segment.words.map((word) =>
          transcriptWordSchema.parse({
            text: word.text,
            startSeconds: chunk.startSeconds + word.startSeconds,
            endSeconds: chunk.startSeconds + word.endSeconds,
            confidence: word.probability
          })
        ),
        boundaryReason: segment.boundaryReason
      });
    })
  );
  const words = segments.flatMap((segment) => segment.words);
  return transcriptSchema.parse({
    sourceId,
    language,
    text: segments.map((segment) => segment.text).join(" "),
    segments,
    words
  });
}

interface WhisperChunkResult {
  readonly chunkIndex: number;
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly raw: unknown;
  readonly rawSegments: TranscriptSegment[];
  readonly words: Array<{ readonly text: string; readonly startSeconds: number; readonly endSeconds: number; readonly probability?: number }>;
  readonly text: string;
}

async function runWhisperChunk(
  options: WhisperCppOptions,
  audioPath: string,
  workingDir: string,
  startSeconds: number,
  durationSeconds: number,
  chunkIndex: number,
  language: string,
  signal: AbortSignal
): Promise<WhisperChunkResult> {
  const chunkAudioPath = await createChunkWav(audioPath, workingDir, startSeconds, durationSeconds, signal);
  const outputPrefix = path.join(workingDir, `transcript-${String(Math.max(0, Math.floor(startSeconds))).padStart(6, "0")}`);
  const availableCpuCores = Math.max(1, os.cpus().length);
  const threads = options.threads ?? availableCpuCores;
  const processors = options.processors ?? 1;
  const args = [
    "-m",
    options.whisperModel,
    "-f",
    chunkAudioPath,
    "-of",
    outputPrefix,
    "-ojf",
    "-owts",
    "-sow",
    "-dtw",
    whisperDtwPresetFromModelPath(options.whisperModel),
    "-osrt",
    "-otxt",
    "-l",
    language,
    "-bo",
    "1",
    "-bs",
    "1",
    "-nf",
    "-t",
    String(threads),
    "-p",
    String(processors)
  ];
  try {
    await runCommand(options.whisperBin, args, {
      timeoutMs: options.timeoutMs ?? 300000,
      signal
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/timed out/i.test(message)) {
      throw new WhisperTimeoutError(`whisper.cpp timed out while processing chunk at ${startSeconds}s.`, { cause: error });
    }
    if (/ENOENT|not found|Failed to start/i.test(message)) {
      throw new WhisperBinaryNotFoundError(`whisper.cpp binary is not available: ${options.whisperBin}`, { cause: error });
    }
    throw new WhisperProcessFailureError(`whisper.cpp failed while processing chunk at ${startSeconds}s.`, { cause: error });
  }
  const jsonPath = `${outputPrefix}.json`;
  if (!(await fs.stat(jsonPath).catch(() => null))) {
    throw new WhisperProcessFailureError("whisper.cpp did not produce a JSON transcript.");
  }
  const raw = JSON.parse(await fs.readFile(jsonPath, "utf8")) as unknown;
  const rawSegments = extractRawSegmentsFromWhisperResponse(raw);
  const words = extractTimedWordsFromWhisperResponse(raw, DEFAULT_SEGMENTATION_OPTIONS.timestampPrecision);
  const offsetWords = words.map((word) =>
    word.probability === undefined
      ? {
          text: word.text,
          startSeconds: word.startSeconds + startSeconds,
          endSeconds: word.endSeconds + startSeconds
        }
      : {
          text: word.text,
          startSeconds: word.startSeconds + startSeconds,
          endSeconds: word.endSeconds + startSeconds,
          probability: word.probability
        }
  );
  const offsetSegments = rawSegments.map((segment, index) =>
    transcriptSegmentSchema.parse({
      id: `segment-${String(index + 1).padStart(3, "0")}`,
      startSeconds: segment.startSeconds + startSeconds,
      endSeconds: segment.endSeconds + startSeconds,
      text: segment.text,
      words: segment.words.map((word) => ({
        text: word.text,
        startSeconds: word.startSeconds + startSeconds,
        endSeconds: word.endSeconds + startSeconds,
        probability: word.probability
      })),
      boundaryReason: segment.boundaryReason
    })
  );
  return {
    chunkIndex,
    startSeconds,
    durationSeconds,
    raw,
    rawSegments: offsetSegments,
    words: offsetWords,
    text: offsetSegments.map((segment) => segment.text).join(" ")
  };
}

function mergeWhisperChunkResults(
  chunked: ReadonlyArray<WhisperChunkResult>,
  sourceId: EpisodeId,
  language: string,
  generatedAt: string,
  model: string,
  provider: string,
  options?: Partial<SentenceSegmentationOptions>
): {
  readonly rawArtifact: WhisperRawTranscriptArtifact;
  readonly normalizedTranscript: NormalizedTranscript;
  readonly subtitleSegments: TranscriptSegment[];
  readonly visualScenes: Array<{ readonly id: string; readonly startSeconds: number; readonly endSeconds: number; readonly narration: string; readonly sourceSegmentIds: string[] }>;
} {
  const rawSegments = chunked.flatMap((chunk) => chunk.rawSegments);
  const allWords = chunked.flatMap((chunk) => chunk.words).map((word) => ({
    text: word.text,
    startSeconds: word.startSeconds,
    endSeconds: word.endSeconds,
    probability: word.probability
  }));
  if (allWords.length === 0) {
    throw new MissingWordTimestampsError("Whisper produced no usable word timestamps.");
  }
  const normalizedTranscript = normalizeTranscriptFromWords({
    sourceId,
    language,
    words: allWords,
    provider,
    model,
    generatedAt,
    ...(options ? { options } : {})
  });
  const subtitleSegments = normalizedTranscript.segments;
  const visualScenes = buildVisualScenesFromSubtitleSegments(subtitleSegments, {
    minDurationSeconds: 8,
    maxDurationSeconds: 18
  });
  const rawArtifact = parseWhisperRawArtifact({
    schemaVersion: 1,
    sourceId,
    language,
    backend: provider,
    model,
    generatedAt,
    wordTimestamps: true,
    chunks: chunked.map((chunk) => ({
      chunkIndex: chunk.chunkIndex,
      startSeconds: chunk.startSeconds,
      durationSeconds: chunk.durationSeconds,
      raw: chunk.raw
    })),
    rawSegments,
    words: allWords,
    text: normalizedTranscript.text
  });
  return {
    rawArtifact,
    normalizedTranscript,
    subtitleSegments,
    visualScenes
  };
}

async function persistWhisperArtifacts(
  episodeDir: string,
  rawArtifact: WhisperRawTranscriptArtifact,
  normalizedTranscript: NormalizedTranscript
): Promise<void> {
  const transcriptDir = path.join(episodeDir, "transcript");
  await ensureDir(transcriptDir);
  try {
    await writeJsonAtomic(path.join(episodeDir, "original-transcript.json"), rawArtifact);
    await writeTextAtomic(path.join(episodeDir, "original-transcript.srt"), buildSrt(normalizedTranscript.segments));
    await writeJsonAtomic(path.join(transcriptDir, "transcript.raw.json"), rawArtifact);
    await writeJsonAtomic(path.join(transcriptDir, "transcript.json"), normalizedTranscript);
    await writeTextAtomic(path.join(transcriptDir, "transcript.srt"), buildSrt(normalizedTranscript.segments));
  } catch (error) {
    throw new AtomicWriteError("Failed to persist Whisper transcript artifacts.", { cause: error });
  }
}

export class MockTranscriptionProvider implements TranscriptionProvider {
  public async transcribe(request: TranscriptionRequest, signal: AbortSignal): Promise<Transcript> {
    signal.throwIfAborted();
    if (!request.transcript) {
      throw new HumanActionRequiredError("No transcript was supplied for the mock transcription provider.");
    }
    return request.transcript;
  }
}

export class WhisperCppTranscriptionProvider implements TranscriptionProvider {
  public constructor(private readonly options: WhisperCppOptions) {}

  public async transcribe(request: TranscriptionRequest, signal: AbortSignal): Promise<Transcript> {
    signal.throwIfAborted();
    if (!request.audioPath) {
      throw new MissingAudioFileError("whisper.cpp transcription requires an audio file.");
    }
    if (!this.options.whisperModel) {
      throw new ProviderAuthenticationError("whisper.cpp transcription requires a model path.");
    }
    const workingDir = await fs.mkdtemp(path.join(path.dirname(request.audioPath), "whisper-"));
    const inputAudioPath = await ensureWavInput(request.audioPath, workingDir, signal);
    const language = request.language ?? this.options.language ?? "en";
    const durationSeconds = await inspectAudioDurationSeconds(inputAudioPath, signal);
    const maxDurationSeconds = this.options.maxDurationSeconds ?? durationSeconds;
    const transcriptionDuration = Math.min(durationSeconds, maxDurationSeconds);
    const chunkDurationSeconds = Math.max(10, Math.min(this.options.chunkDurationSeconds ?? 60, transcriptionDuration));
    const chunkedTranscripts: WhisperChunkResult[] = [];
    let chunkIndex = 0;
    for (const range of chunkRanges(transcriptionDuration, chunkDurationSeconds)) {
      signal.throwIfAborted();
      const transcript = await runWhisperChunk(
        this.options,
        inputAudioPath,
        workingDir,
        range.startSeconds,
        range.durationSeconds,
        chunkIndex,
        language,
        signal
      );
      chunkedTranscripts.push(transcript);
      chunkIndex += 1;
    }
    const generatedAt = new Date().toISOString();
    const merged = mergeWhisperChunkResults(
      chunkedTranscripts,
      request.sourceId,
      language,
      generatedAt,
      this.options.whisperModel,
      "whisper.cpp",
      {
        minDurationSeconds: DEFAULT_SEGMENTATION_OPTIONS.minDurationSeconds,
        maxDurationSeconds: DEFAULT_SEGMENTATION_OPTIONS.maxDurationSeconds,
        maxSilenceSeconds: DEFAULT_SEGMENTATION_OPTIONS.maxSilenceSeconds,
        timestampPrecision: DEFAULT_SEGMENTATION_OPTIONS.timestampPrecision,
        maxSingleWordDurationSeconds: DEFAULT_SEGMENTATION_OPTIONS.maxSingleWordDurationSeconds,
        boundaryLookbackWords: DEFAULT_SEGMENTATION_OPTIONS.boundaryLookbackWords
      }
    );
    if (request.episodeDir) {
      await persistWhisperArtifacts(request.episodeDir, merged.rawArtifact, merged.normalizedTranscript);
    }
    return transcriptSchema.parse({
      sourceId: merged.normalizedTranscript.sourceId,
      language: merged.normalizedTranscript.language,
      text: merged.normalizedTranscript.text,
      segments: merged.normalizedTranscript.segments,
      words: merged.normalizedTranscript.words
    });
  }
}

type CurlTranscriptionResult = {
  readonly exitCode: number;
  readonly bodyPath: string;
};

function transcriptionError(message: string, details: Record<string, unknown>): ProviderResponseError {
  const error = new ProviderResponseError(message) as ProviderResponseError & Record<string, unknown>;
  for (const [key, value] of Object.entries(details)) {
    error[key] = value;
  }
  return error;
}

async function runCurlTranscription(options: OpenAiTranscriptionOptions, audioPath: string, model: string, responseFormat: "verbose_json" | "json", language: string | undefined, prompt: string | undefined, signal: AbortSignal): Promise<CurlTranscriptionResult> {
  const workingDir = await fs.mkdtemp(path.join(path.dirname(audioPath), "openai-transcription-"));
  const bodyPath = path.join(workingDir, "response.json");
  const url = options.baseUrl ? new URL("/audio/transcriptions", options.baseUrl).toString() : "https://api.openai.com/v1/audio/transcriptions";
  const args = [
    "--silent",
    "--show-error",
    "--location",
    "--fail-with-body",
    "--request",
    "POST",
    url,
    "--header",
    `Authorization: Bearer ${options.apiKey}`,
    "--form",
    `file=@${audioPath}`,
    "--form-string",
    `model=${model}`,
    "--form-string",
    `response_format=${responseFormat}`,
    "--output",
    bodyPath
  ];
  if (language) {
    args.push("--form-string", `language=${language}`);
  }
  if (prompt) {
    args.push("--form-string", `prompt=${prompt}`);
  }
  if (responseFormat === "verbose_json") {
    args.push("--form-string", "timestamp_granularities[]=word", "--form-string", "timestamp_granularities[]=segment");
  }
  return await new Promise((resolve, reject) => {
    const child = spawn("curl", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(transcriptionError("OpenAI transcription curl request timed out.", { bodyPath }));
    }, 300000);
    const abortHandler = (): void => {
      child.kill("SIGKILL");
      reject(transcriptionError("OpenAI transcription curl request was aborted.", { bodyPath }));
    };
    signal.addEventListener("abort", abortHandler, { once: true });
    child.on("error", (error) => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abortHandler);
      reject(transcriptionError(`Failed to start curl: ${(error as Error).message}`, { bodyPath }));
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abortHandler);
      resolve({
        exitCode: exitCode ?? 0,
        bodyPath
      });
      if (stderr.trim().length > 0) {
        // stderr is available via the body file or CLI error serialization if needed.
      }
    });
  });
}

export class OpenAiCompatibleTranscriptionProvider implements TranscriptionProvider {
  public constructor(private readonly options: OpenAiTranscriptionOptions) {}

  public async transcribe(request: TranscriptionRequest, signal: AbortSignal): Promise<Transcript> {
    signal.throwIfAborted();
    if (!request.audioPath) {
      throw new HumanActionRequiredError("OpenAI transcription requires an audio file.");
    }
    if (!this.options.apiKey) {
      throw new ProviderAuthenticationError("OpenAI transcription requires an API key.");
    }
    const model = this.options.model ?? "gpt-4o-mini-transcribe";
    const responseFormat = this.options.responseFormat ?? "verbose_json";
    const language = request.language ?? this.options.language ?? "en";
    const targetDurationSeconds = await inspectAudioDurationSeconds(request.audioPath, signal);
    const chunkDurationSeconds = Math.max(20, Math.min(60, targetDurationSeconds / 8));
    const workingDir = await fs.mkdtemp(path.join(path.dirname(request.audioPath), "openai-transcription-"));
    const chunkedTranscripts: Array<{ readonly startSeconds: number; readonly text: string }> = [];
    const timedWords: Array<{ readonly text: string; readonly startSeconds: number; readonly endSeconds: number }> = [];
    for (const range of chunkRanges(targetDurationSeconds, chunkDurationSeconds)) {
      signal.throwIfAborted();
      const chunkAudioPath = await createChunkWav(request.audioPath, workingDir, range.startSeconds, range.durationSeconds, signal);
      const curlResult = await runCurlTranscription(this.options, chunkAudioPath, model, responseFormat, language, this.options.prompt, signal);
      const responseText = await fs.readFile(curlResult.bodyPath, "utf8");
      const trimmed = responseText.trim();
      if (curlResult.exitCode !== 0) {
        throw transcriptionError(`OpenAI transcription curl request failed: ${trimmed}`, {
          bodyPath: curlResult.bodyPath,
          responseBody: trimmed,
          model,
          responseFormat,
          language
        });
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed) as unknown;
      } catch (error) {
        throw transcriptionError("OpenAI transcription returned non-JSON output.", {
          bodyPath: curlResult.bodyPath,
          responseBody: trimmed,
          model,
          responseFormat,
          language,
          cause: error instanceof Error ? error.message : String(error)
        });
      }
      if (responseFormat === "verbose_json") {
        const payload = openAiVerboseTranscriptionSchema.parse(parsed);
        if (payload.words && payload.words.length > 0) {
          for (const word of payload.words) {
            timedWords.push({
              text: word.word,
              startSeconds: range.startSeconds + word.start,
              endSeconds: range.startSeconds + word.end
            });
          }
          continue;
        }
        if (payload.segments && payload.segments.length > 0) {
          for (const segment of payload.segments) {
            const text = normalizeWhitespace(segment.text);
            if (text.length === 0) {
              continue;
            }
            chunkedTranscripts.push({
              startSeconds: range.startSeconds + segment.start,
              text
            });
          }
          continue;
        }
        const segmentTexts = splitTranscriptTextIntoSegments(payload.text);
        if (segmentTexts.length === 0) {
          continue;
        }
        const timings = buildApproximateSegmentTimings(range.startSeconds, range.durationSeconds, segmentTexts);
        for (const timing of timings) {
          chunkedTranscripts.push({
            startSeconds: timing.startSeconds,
            text: timing.text
          });
        }
        continue;
      }
      const payload = openAiTextTranscriptionSchema.parse(parsed);
      const segmentTexts = splitTranscriptTextIntoSegments(payload.text);
      if (segmentTexts.length === 0) {
        continue;
      }
      const timings = buildApproximateSegmentTimings(range.startSeconds, range.durationSeconds, segmentTexts);
      for (const timing of timings) {
        chunkedTranscripts.push({
          startSeconds: timing.startSeconds,
          text: timing.text
        });
      }
    }
    if (timedWords.length > 0) {
      const normalized = normalizeTranscriptFromWords({
        sourceId: request.sourceId,
        language,
        words: timedWords.map((word) => ({
          text: word.text,
          startSeconds: word.startSeconds,
          endSeconds: word.endSeconds
        })),
        provider: "openai-compatible",
        model,
        generatedAt: new Date().toISOString(),
        options: {
          minDurationSeconds: DEFAULT_SEGMENTATION_OPTIONS.minDurationSeconds,
          maxDurationSeconds: DEFAULT_SEGMENTATION_OPTIONS.maxDurationSeconds,
          maxSilenceSeconds: DEFAULT_SEGMENTATION_OPTIONS.maxSilenceSeconds,
          timestampPrecision: DEFAULT_SEGMENTATION_OPTIONS.timestampPrecision,
          maxSingleWordDurationSeconds: DEFAULT_SEGMENTATION_OPTIONS.maxSingleWordDurationSeconds,
          boundaryLookbackWords: DEFAULT_SEGMENTATION_OPTIONS.boundaryLookbackWords
        }
      });
      if (request.episodeDir) {
        const rawArtifact: WhisperRawTranscriptArtifact = {
          schemaVersion: 1,
          sourceId: request.sourceId,
          language,
          backend: "openai-compatible",
          model,
          generatedAt: new Date().toISOString(),
          wordTimestamps: true,
          chunks: [],
          rawSegments: normalized.segments,
          words: normalized.words,
          text: normalized.text
        };
        await persistWhisperArtifacts(request.episodeDir, rawArtifact, normalized);
      }
      return transcriptSchema.parse({
        sourceId: normalized.sourceId,
        language: normalized.language,
        text: normalized.text,
        segments: normalized.segments,
        words: normalized.words
      });
    }
    if (chunkedTranscripts.length === 0) {
      throw new ProviderResponseError("OpenAI transcription returned no usable transcript text.");
    }
    const segments = chunkedTranscripts.map((entry, index) =>
      transcriptSegmentSchema.parse({
        id: sceneIdSchema.parse(`scene-${String(index + 1).padStart(3, "0")}`),
        startSeconds: entry.startSeconds,
        endSeconds: index + 1 < chunkedTranscripts.length ? chunkedTranscripts[index + 1]?.startSeconds ?? entry.startSeconds + 0.1 : entry.startSeconds + 0.1,
        text: entry.text,
        words: []
      })
    );
    return transcriptSchema.parse({
      sourceId: request.sourceId,
      language,
      text: segments.map((segment) => segment.text).join(" "),
      segments,
      words: []
    });
  }
}
