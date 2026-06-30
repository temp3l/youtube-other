import fs from "node:fs/promises";
import path from "node:path";
import {
  ProviderAuthenticationError,
  ProviderResponseError,
  type AudioSegment,
  type SceneId,
  type VoiceProfile
} from "@mediaforge/domain";
import { ensureDir, fileExists } from "@mediaforge/shared";
import { runCurl } from "@mediaforge/process-runner";
import {
  currentExecutionTelemetry,
  estimateDurationPricing,
} from "@mediaforge/observability";
import { loadSpeechVoiceSettings } from "./voice-settings.js";
export {
  listEpisodeScriptLanguages,
  loadEpisodeScriptMarkdown,
  splitEpisodeScriptMarkdown,
  writeEpisodeScriptMarkdown,
} from "./script-markdown.js";
export { loadSpeechVoiceSettings, speechVoiceSettings } from "./voice-settings.js";
export * from "./audio-instructions.js";

export interface SpeechSynthesisRequest {
  readonly sceneId: SceneId;
  readonly text: string;
  readonly voiceProfile: VoiceProfile;
  readonly outputPath: string;
  readonly targetDurationSeconds?: number;
  readonly instructions?: string;
}

export interface SpeechSynthesisResult extends AudioSegment {
  readonly sampleRate: number;
  readonly channels: number;
}

export interface SpeechProvider {
  synthesize(request: SpeechSynthesisRequest, signal: AbortSignal): Promise<SpeechSynthesisResult>;
}

export interface OpenAiCompatibleSpeechOptions {
  readonly baseUrl?: string;
  readonly apiKey: string;
  readonly organization?: string;
  readonly project?: string;
  readonly model?: string;
  readonly fallbackModels?: ReadonlyArray<string>;
  readonly voice?: string;
  readonly instructions?: string;
  readonly speed?: number;
  readonly responseFormat?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
  readonly client?: SpeechClientLike;
}

interface SpeechClientLike {
  readonly audio: {
    readonly speech: {
      create(
        body: {
          readonly input: string;
          readonly model: string;
          readonly voice: string;
          readonly instructions?: string;
          readonly response_format?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
          readonly speed?: number;
        },
        options?: { readonly signal?: AbortSignal }
      ): Promise<Response>;
    };
  };
}

function makeWavHeader(sampleRate: number, channels: number, bitsPerSample: number, dataSize: number): Buffer {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const buffer = Buffer.alloc(44);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

function describePayloadPrefix(buffer: Buffer): string {
  const prefix = buffer.subarray(0, Math.min(buffer.byteLength, 16));
  const ascii = prefix.toString("ascii").replace(/[^\x20-\x7E]/gu, ".");
  return `payloadPrefixAscii=${JSON.stringify(ascii)}, payloadPrefixHex=${prefix.toString("hex")}, byteLength=${buffer.byteLength}`;
}

interface WavMetadata {
  readonly sampleRate: number;
  readonly channels: number;
  readonly bitsPerSample: number;
  readonly dataOffset: number;
  readonly dataSize: number;
  readonly durationSeconds: number;
}

interface WavQualityMetrics {
  readonly peakDb: number;
  readonly rmsDb: number;
  readonly zeroCrossingsRate: number;
  readonly clippedRatio: number;
  readonly normalizedEntropy: number;
}

function parseWavMetadata(filePath: string, buffer: Buffer): WavMetadata {
  if (buffer.byteLength < 12 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new ProviderResponseError(`Invalid WAV file: ${filePath}. ${describePayloadPrefix(buffer)}`);
  }
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let blockAlign = 0;
  let dataOffset = -1;
  let dataSize = -1;
  let offset = 12;
  while (offset + 8 <= buffer.byteLength) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;
    if (chunkId === "fmt ") {
      if (chunkEnd > buffer.byteLength) {
        throw new ProviderResponseError(`Invalid WAV chunk in ${filePath}. offset=${offset}, chunkId=${JSON.stringify(chunkId)}, chunkSize=${chunkSize}, ${describePayloadPrefix(buffer)}`);
      }
      if (chunkSize < 16) {
        throw new ProviderResponseError(`Invalid WAV fmt chunk in ${filePath}. offset=${offset}, chunkId=${JSON.stringify(chunkId)}, chunkSize=${chunkSize}, ${describePayloadPrefix(buffer)}`);
      }
      const audioFormat = buffer.readUInt16LE(chunkStart);
      channels = buffer.readUInt16LE(chunkStart + 2);
      sampleRate = buffer.readUInt32LE(chunkStart + 4);
      blockAlign = buffer.readUInt16LE(chunkStart + 12);
      bitsPerSample = buffer.readUInt16LE(chunkStart + 14);
      if (audioFormat !== 1) {
        throw new ProviderResponseError(`Unsupported WAV encoding in ${filePath}. offset=${offset}, chunkId=${JSON.stringify(chunkId)}, chunkSize=${chunkSize}, ${describePayloadPrefix(buffer)}`);
      }
    } else if (chunkId === "data") {
      dataOffset = chunkStart;
      dataSize = chunkEnd > buffer.byteLength ? buffer.byteLength - chunkStart : chunkSize;
      break;
    } else if (chunkEnd > buffer.byteLength) {
      throw new ProviderResponseError(`Invalid WAV chunk in ${filePath}. offset=${offset}, chunkId=${JSON.stringify(chunkId)}, chunkSize=${chunkSize}, ${describePayloadPrefix(buffer)}`);
    }
    offset = chunkEnd + (chunkSize % 2);
  }
  if (sampleRate <= 0 || channels <= 0 || bitsPerSample !== 16 || blockAlign !== channels * 2 || dataOffset < 0 || dataSize <= 0) {
    throw new ProviderResponseError(`Invalid WAV header metadata in ${filePath}. ${describePayloadPrefix(buffer)}`);
  }
  const frames = dataSize / blockAlign;
  if (!Number.isFinite(frames) || frames <= 0 || !Number.isInteger(frames)) {
    throw new ProviderResponseError(`Invalid WAV duration metadata in ${filePath}. ${describePayloadPrefix(buffer)}`);
  }
  return {
    sampleRate,
    channels,
    bitsPerSample,
    dataOffset,
    dataSize,
    durationSeconds: frames / sampleRate
  };
}

function analyzeWavQuality(buffer: Buffer, metadata: WavMetadata): WavQualityMetrics {
  const sampleCount = metadata.dataSize / 2;
  let peak = 0;
  let sumSquares = 0;
  let zeroCrossings = 0;
  let clippedSamples = 0;
  let previousSign = 0;
  const histogram = new Array<number>(256).fill(0);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = buffer.readInt16LE(metadata.dataOffset + index * 2);
    const absSample = Math.abs(sample);
    if (absSample > peak) {
      peak = absSample;
    }
    sumSquares += sample * sample;
    if (absSample >= 32256) {
      clippedSamples += 1;
    }
    const sign = sample === 0 ? 0 : sample > 0 ? 1 : -1;
    if (sign !== 0 && previousSign !== 0 && sign !== previousSign) {
      zeroCrossings += 1;
    }
    if (sign !== 0) {
      previousSign = sign;
    }
    const histogramIndex = Math.min(255, Math.max(0, Math.floor(((sample + 32768) / 65536) * 256)));
    histogram[histogramIndex] = (histogram[histogramIndex] ?? 0) + 1;
  }
  let entropy = 0;
  for (const count of histogram) {
    if (count === 0) {
      continue;
    }
    const probability = count / sampleCount;
    entropy -= probability * Math.log2(probability);
  }
  const peakDb = peak > 0 ? 20 * Math.log10(peak / 32767) : Number.NEGATIVE_INFINITY;
  const rms = Math.sqrt(sumSquares / sampleCount);
  const rmsDb = rms > 0 ? 20 * Math.log10(rms / 32767) : Number.NEGATIVE_INFINITY;
  return {
    peakDb,
    rmsDb,
    zeroCrossingsRate: zeroCrossings / Math.max(1, sampleCount - 1),
    clippedRatio: clippedSamples / sampleCount,
    normalizedEntropy: entropy / 8
  };
}

function describeAudioPayload(buffer: Buffer): string {
  const prefix = buffer.subarray(0, Math.min(buffer.byteLength, 16));
  const ascii = prefix.toString("ascii").replace(/[^\x20-\x7E]/gu, ".");
  const hex = prefix.toString("hex");
  return `payloadPrefixAscii=${JSON.stringify(ascii)}, payloadPrefixHex=${hex}, byteLength=${buffer.byteLength}`;
}

function validateSpeechAudioPayload(
  filePath: string,
  buffer: Buffer,
  targetDurationSeconds?: number
): WavMetadata {
  const metadata = parseWavMetadata(filePath, buffer);
  const quality = analyzeWavQuality(buffer, metadata);
  const reasons: string[] = [];
  if (metadata.durationSeconds <= 0) {
    reasons.push("duration is zero");
  }
  if (targetDurationSeconds !== undefined) {
    if (metadata.durationSeconds < Math.max(0.5, targetDurationSeconds * 0.45)) {
      reasons.push(`duration ${metadata.durationSeconds.toFixed(3)}s is far shorter than the target ${targetDurationSeconds.toFixed(3)}s`);
    }
    if (metadata.durationSeconds > targetDurationSeconds * 2.5) {
      reasons.push(`duration ${metadata.durationSeconds.toFixed(3)}s is far longer than the target ${targetDurationSeconds.toFixed(3)}s`);
    }
  }
  if (quality.peakDb < -35 || quality.rmsDb < -40) {
    reasons.push(
      `audio is too quiet (peak ${quality.peakDb.toFixed(2)} dB, rms ${quality.rmsDb.toFixed(2)} dB)`
    );
  }
  if (quality.zeroCrossingsRate > 0.55) {
    reasons.push(
      `audio looks like noise (zero crossings rate ${quality.zeroCrossingsRate.toFixed(3)})`
    );
  }
  if (quality.normalizedEntropy < 0.3) {
    reasons.push(
      `audio looks like a synthetic tone or static (entropy ${quality.normalizedEntropy.toFixed(3)})`
    );
  }
  if (quality.clippedRatio > 0.05) {
    reasons.push(`audio is heavily clipped (${(quality.clippedRatio * 100).toFixed(1)}% of samples)`);
  }
  if (reasons.length > 0) {
    throw new ProviderResponseError(
      `OpenAI speech provider returned audio that failed quality validation for ${filePath}: ${reasons.join("; ")}. ${describeAudioPayload(buffer)}`
    );
  }
  return metadata;
}

async function writePlaceholderToneWav(filePath: string, durationSeconds: number, sampleRate = 24000): Promise<void> {
  const channels = 1;
  const bitsPerSample = 16;
  const frames = Math.max(1, Math.floor(durationSeconds * sampleRate));
  const pcm = Buffer.alloc(frames * channels * 2);
  const amplitude = Math.max(1, Math.floor(0.02 * 32767));
  const frequencyHz = 220;
  for (let index = 0; index < frames; index += 1) {
    const sample = Math.round(Math.sin((index / sampleRate) * Math.PI * 2 * frequencyHz) * amplitude);
    pcm.writeInt16LE(sample, index * 2);
  }
  const header = makeWavHeader(sampleRate, channels, bitsPerSample, pcm.byteLength);
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, Buffer.concat([header, pcm]));
  await fs.rename(tempPath, filePath);
}

function isRetryableSpeechError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /insufficient_quota|at capacity|model is at capacity|try a different model|rate limit|too many requests|temporarily unavailable|quality validation|too quiet|noise|clipped|tone or static/i.test(
    message
  );
}

function uniqueModels(models: ReadonlyArray<string>): string[] {
  return [...new Set(models.map((model) => model.trim()).filter((model) => model.length > 0))];
}

export class MockSpeechProvider implements SpeechProvider {
  public async synthesize(request: SpeechSynthesisRequest, signal: AbortSignal): Promise<SpeechSynthesisResult> {
    signal.throwIfAborted();
    const words = request.text.trim().split(/\s+/u).filter(Boolean).length;
    const estimatedDuration = request.targetDurationSeconds ?? Math.max(2, Math.ceil((words / request.voiceProfile.paceWpm) * 60));
    await writePlaceholderToneWav(request.outputPath, estimatedDuration);
    return {
      sceneId: request.sceneId,
      filePath: request.outputPath,
      durationSeconds: estimatedDuration,
      sampleRate: 24000,
      channels: 1
    };
  }
}

export class OpenAiCompatibleSpeechProvider implements SpeechProvider {
  private readonly client: SpeechClientLike | null;
  private readonly models: string[];
  private readonly voice: string;
  private readonly instructions: string;
  private readonly speed: number | undefined;
  private readonly responseFormat: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";

  public constructor(private readonly options: OpenAiCompatibleSpeechOptions) {
    this.client = options.client ?? null;
    const speechSettings = loadSpeechVoiceSettings({
      ...(options.model ? { model: options.model } : {}),
      ...(options.voice ? { voice: options.voice } : {})
    });
    this.models = uniqueModels([
      options.model ?? speechSettings.model,
      ...(options.fallbackModels ?? [])
    ]);
    this.voice = speechSettings.voice;
    this.instructions = options.instructions ?? speechSettings.instructions;
    this.speed = options.speed;
    this.responseFormat = options.responseFormat ?? "wav";
  }

  public async synthesize(request: SpeechSynthesisRequest, signal: AbortSignal): Promise<SpeechSynthesisResult> {
    signal.throwIfAborted();
    const telemetry = currentExecutionTelemetry();
    if (!this.options.apiKey) {
      throw new ProviderAuthenticationError("OpenAI TTS synthesis requires an API key.");
    }
    await ensureDir(path.dirname(request.outputPath));
    if (this.models.length === 0) {
      throw new ProviderResponseError("No OpenAI speech model was configured.");
    }
    let lastError: unknown = null;
    for (const model of this.models) {
      const result = await this.synthesizeWithModel(request, signal, telemetry, model).catch((error: unknown) => {
        lastError = error;
        if (isRetryableSpeechError(error)) {
          return null;
        }
        throw error;
      });
      if (result) {
        return result;
      }
    }
    if (lastError) {
      throw lastError;
    }
    throw new ProviderResponseError("OpenAI speech provider failed without a specific error.");
  }

  private async synthesizeWithModel(
    request: SpeechSynthesisRequest,
    signal: AbortSignal,
    telemetry: ReturnType<typeof currentExecutionTelemetry>,
    model: string
  ): Promise<SpeechSynthesisResult> {
    const headers = [
      "--header",
      `Authorization: Bearer ${this.options.apiKey}`,
      "--header",
      "Content-Type: application/json"
    ];
    if (this.options.organization) {
      headers.push("--header", `OpenAI-Organization: ${this.options.organization}`);
    }
    if (this.options.project) {
      headers.push("--header", `OpenAI-Project: ${this.options.project}`);
    }
    if (this.client) {
      const tempPath = `${request.outputPath}.${process.pid}.tmp`;
      const speechOptions = {
        input: request.text,
        model,
        voice: request.voiceProfile.providerVoiceId ?? this.voice,
        instructions: request.instructions ?? this.instructions,
        response_format: this.responseFormat,
        ...(this.speed !== undefined ? { speed: this.speed } : {})
      } satisfies Parameters<SpeechClientLike["audio"]["speech"]["create"]>[0];
      try {
        const response = await this.client.audio.speech.create(speechOptions, { signal });
        const data = Buffer.from(await response.arrayBuffer());
        if (data.byteLength === 0) {
          throw new ProviderResponseError("OpenAI speech provider returned an empty audio payload.");
        }
        const metadata = validateSpeechAudioPayload(tempPath, data, request.targetDurationSeconds);
        await fs.writeFile(tempPath, data);
        await fs.rename(tempPath, request.outputPath);
        const cost = telemetry
          ? estimateDurationPricing(telemetry.catalog, {
              provider: "openai",
              model,
              operation: "speech",
              durationSeconds: metadata.durationSeconds,
            })
          : { pricingVersion: "unconfigured", costMicros: null, warning: undefined };
        telemetry?.recordApiCall({
          provider: "openai",
          model,
          operation: "speech-generation",
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          durationMs: 0,
          attempt: 1,
          success: true,
          usage: { durationSeconds: metadata.durationSeconds },
        });
        telemetry?.recordCost({
          provider: "openai",
          model,
          operation: "speech-generation",
          costMicros: cost.costMicros,
          warning: cost.warning,
        });
        return {
          sceneId: request.sceneId,
          filePath: request.outputPath,
          durationSeconds: metadata.durationSeconds,
          sampleRate: metadata.sampleRate,
          channels: metadata.channels
        };
      } finally {
        await fs.rm(tempPath, { force: true }).catch(() => {});
      }
    }
    const tempPath = `${request.outputPath}.${process.pid}.tmp`;
    try {
      await ensureDir(path.dirname(tempPath));
      await fs.writeFile(tempPath, "");
      const result = await runCurl(
        [
          "--fail-with-body",
          "--silent",
          "--show-error",
          "--request",
          "POST",
          ...headers,
          "--output",
          tempPath,
          "--data-binary",
          JSON.stringify({
            input: request.text,
            model,
            voice: request.voiceProfile.providerVoiceId ?? this.voice,
            instructions: request.instructions ?? this.instructions,
            response_format: this.responseFormat,
            ...(this.speed !== undefined ? { speed: this.speed } : {})
          }),
          new URL("/v1/audio/speech", this.options.baseUrl ?? "https://api.openai.com").toString()
        ],
        { signal }
      );
      if (result.exitCode !== 0) {
        let responseText = "";
        try {
          responseText = await fs.readFile(tempPath, "utf8");
        } catch {
          responseText = result.stderr.trim();
        }
        throw new ProviderResponseError(responseText.length > 0 ? responseText : "OpenAI speech provider request failed.");
      }
      const data = await fs.readFile(tempPath);
      if (data.byteLength === 0) {
        throw new ProviderResponseError("OpenAI speech provider returned an empty audio payload.");
      }
      const metadata = validateSpeechAudioPayload(tempPath, data, request.targetDurationSeconds);
      await fs.rename(tempPath, request.outputPath);
      const cost = telemetry
        ? estimateDurationPricing(telemetry.catalog, {
            provider: "openai",
            model,
            operation: "speech",
            durationSeconds: metadata.durationSeconds,
          })
        : { pricingVersion: "unconfigured", costMicros: null, warning: undefined };
      telemetry?.recordApiCall({
        provider: "openai",
        model,
        operation: "speech-generation",
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: 0,
        attempt: 1,
        success: true,
        usage: { durationSeconds: metadata.durationSeconds },
      });
      telemetry?.recordCost({
        provider: "openai",
        model,
        operation: "speech-generation",
        costMicros: cost.costMicros,
        warning: cost.warning,
      });
      return {
        sceneId: request.sceneId,
        filePath: request.outputPath,
        durationSeconds: metadata.durationSeconds,
        sampleRate: metadata.sampleRate,
        channels: metadata.channels
      };
    } finally {
      await fs.rm(tempPath, { force: true }).catch(() => {});
    }
  }
}

export async function ensureSpeechProviderReady(filePath: string): Promise<boolean> {
  return filePath.length > 0 && (await fileExists(filePath));
}
