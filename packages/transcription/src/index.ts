import fs from "node:fs/promises";
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
}

const whisperResponseSchema = z.object({
  text: z.string().optional(),
  segments: z.array(
    z.object({
      start: z.number().optional(),
      end: z.number().optional(),
      text: z.string().optional(),
      words: z.array(
        z.object({
          word: z.string().optional(),
          start: z.number().optional(),
          end: z.number().optional(),
          probability: z.number().optional()
        })
      ).optional()
    })
  ).optional()
});

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
    const outputPrefix = path.join(workingDir, "transcript");
    const args = [
      "-m",
      this.options.whisperModel,
      "-f",
      inputAudioPath,
      "-of",
      outputPrefix,
      "-oj",
      "-osrt",
      "-otxt",
      "-l",
      request.language ?? this.options.language ?? "en"
    ];
    if (this.options.threads) {
      args.push("-t", String(this.options.threads));
    }
    if (this.options.processors) {
      args.push("-p", String(this.options.processors));
    }
    await runCommand(this.options.whisperBin, args, {
      timeoutMs: this.options.timeoutMs ?? 300000,
      signal
    });
    const jsonPath = `${outputPrefix}.json`;
    if (!(await fs.stat(jsonPath).catch(() => null))) {
      throw new ProviderResponseError("whisper.cpp did not produce a JSON transcript.");
    }
    const payload = whisperResponseSchema.parse(JSON.parse(await fs.readFile(jsonPath, "utf8")) as unknown);
    const segments = (payload.segments ?? []).map((segment, index) => {
      const segmentId = sceneIdSchema.parse(`scene-${String(index + 1).padStart(3, "0")}`);
      return transcriptSegmentSchema.parse({
        id: segmentId,
        startSeconds: segment.start ?? index * 4,
        endSeconds: segment.end ?? index * 4 + 4,
        text: segment.text ?? "",
        words: (segment.words ?? []).map((word, wordIndex) =>
          transcriptWordSchema.parse({
            index: wordIndex,
            text: word.word ?? "",
            startSeconds: word.start ?? segment.start ?? 0,
            endSeconds: word.end ?? segment.end ?? 0,
            confidence: word.probability
          })
        )
      });
    });
    return transcriptSchema.parse({
      sourceId: request.sourceId,
      language: request.language ?? this.options.language ?? "en",
      text: payload.text ?? segments.map((segment) => segment.text).join(" "),
      segments,
      words: segments.flatMap((segment) => segment.words)
    });
  }
}
