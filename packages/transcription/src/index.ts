import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  HumanActionRequiredError,
  ProviderAuthenticationError,
  ProviderResponseError,
  sceneIdSchema,
  transcriptSegmentSchema,
  transcriptWordSchema,
  type EpisodeId,
  type Transcript,
  transcriptSchema
} from "@mediaforge/domain";
import { runCommand } from "@mediaforge/process-runner";
import { z } from "zod";

export interface TranscriptionRequest {
  readonly sourceId: EpisodeId;
  readonly transcript?: Transcript;
  readonly audioPath?: string;
  readonly language?: string;
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

async function inspectDurationSeconds(filePath: string, signal: AbortSignal): Promise<number> {
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
        id: sceneIdSchema.parse(`scene-${String(segmentCounter).padStart(3, "0")}`),
        startSeconds: chunk.startSeconds + segment.startSeconds,
        endSeconds: chunk.startSeconds + segment.endSeconds,
        text: segment.text,
        words: segment.words.map((word, wordIndex) =>
          transcriptWordSchema.parse({
            index: wordIndex,
            text: word.text,
            startSeconds: chunk.startSeconds + word.startSeconds,
            endSeconds: chunk.startSeconds + word.endSeconds,
            confidence: word.confidence
          })
        )
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

async function runWhisperChunk(
  options: WhisperCppOptions,
  audioPath: string,
  workingDir: string,
  startSeconds: number,
  durationSeconds: number,
  sourceId: EpisodeId,
  language: string,
  signal: AbortSignal
): Promise<Transcript> {
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
    "-oj",
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
  await runCommand(options.whisperBin, args, {
    timeoutMs: options.timeoutMs ?? 300000,
    signal
  });
  const jsonPath = `${outputPrefix}.json`;
  if (!(await fs.stat(jsonPath).catch(() => null))) {
    throw new ProviderResponseError("whisper.cpp did not produce a JSON transcript.");
  }
  const payload = whisperResponseSchema.parse(JSON.parse(await fs.readFile(jsonPath, "utf8")) as unknown);
  const chunks = payload.transcription ?? [];
  const segments = chunks.map((segment, index) => {
    const segmentId = sceneIdSchema.parse(`scene-${String(index + 1).padStart(3, "0")}`);
    const startSeconds = segment.offsets?.from !== undefined ? segment.offsets.from / 1000 : segment.timestamps ? parseWhisperTimestamp(segment.timestamps.from) : index * 4;
    const endSeconds = segment.offsets?.to !== undefined ? segment.offsets.to / 1000 : segment.timestamps ? parseWhisperTimestamp(segment.timestamps.to) : index * 4 + 4;
    return transcriptSegmentSchema.parse({
      id: segmentId,
      startSeconds,
      endSeconds,
      text: segment.text ?? ""
    });
  });
  return transcriptSchema.parse({
    sourceId,
    language,
    text: payload.text ?? segments.map((segment) => segment.text).join(" "),
    segments,
    words: segments.flatMap((segment) => segment.words)
  });
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
      throw new HumanActionRequiredError("whisper.cpp transcription requires an audio file.");
    }
    if (!this.options.whisperModel) {
      throw new ProviderAuthenticationError("whisper.cpp transcription requires a model path.");
    }
    const workingDir = await fs.mkdtemp(path.join(path.dirname(request.audioPath), "whisper-"));
    const inputAudioPath = await ensureWavInput(request.audioPath, workingDir, signal);
    const language = request.language ?? this.options.language ?? "en";
    const durationSeconds = await inspectDurationSeconds(inputAudioPath, signal);
    const maxDurationSeconds = this.options.maxDurationSeconds ?? durationSeconds;
    const transcriptionDuration = Math.min(durationSeconds, maxDurationSeconds);
    const chunkDurationSeconds = Math.max(10, Math.min(this.options.chunkDurationSeconds ?? 60, transcriptionDuration));
    const chunkedTranscripts: Array<{ readonly startSeconds: number; readonly transcript: Transcript }> = [];
    for (const range of chunkRanges(transcriptionDuration, chunkDurationSeconds)) {
      signal.throwIfAborted();
      const transcript = await runWhisperChunk(
        this.options,
        inputAudioPath,
        workingDir,
        range.startSeconds,
        range.durationSeconds,
        request.sourceId,
        language,
        signal
      );
      chunkedTranscripts.push({
        startSeconds: range.startSeconds,
        transcript
      });
    }
    return mergeChunkSegments(chunkedTranscripts, request.sourceId, language);
  }
}
