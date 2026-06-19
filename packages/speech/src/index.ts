import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import {
  ProviderAuthenticationError,
  ProviderResponseError,
  type AudioSegment,
  type SceneId,
  type VoiceProfile
} from "@mediaforge/domain";
import { ensureDir, fileExists } from "@mediaforge/shared";
import { loadSpeechVoiceSettings } from "./voice-settings.js";
export { loadEpisodeScriptMarkdown, splitEpisodeScriptMarkdown, writeEpisodeScriptMarkdown } from "./script-markdown.js";
export { loadSpeechVoiceSettings, speechVoiceSettings } from "./voice-settings.js";

export interface SpeechSynthesisRequest {
  readonly sceneId: SceneId;
  readonly text: string;
  readonly voiceProfile: VoiceProfile;
  readonly outputPath: string;
  readonly targetDurationSeconds?: number;
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
  readonly model?: string;
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

async function writeToneWav(filePath: string, durationSeconds: number, sampleRate = 24000): Promise<void> {
  const channels = 1;
  const bitsPerSample = 16;
  const frames = Math.max(1, Math.floor(durationSeconds * sampleRate));
  const pcm = Buffer.alloc(frames * channels * 2);
  for (let index = 0; index < frames; index += 1) {
    const t = index / sampleRate;
    const amplitude =
      0.12 * Math.sin(2 * Math.PI * 220 * t) * Math.min(1, t / 0.25) * Math.min(1, (durationSeconds - t) / 0.25);
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, amplitude)) * 32767), index * 2);
  }
  const header = makeWavHeader(sampleRate, channels, bitsPerSample, pcm.byteLength);
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, Buffer.concat([header, pcm]));
  await fs.rename(tempPath, filePath);
}

function inspectWavMetadata(filePath: string, buffer: Buffer): { readonly sampleRate: number; readonly channels: number; readonly durationSeconds: number } {
  if (buffer.byteLength < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new ProviderResponseError(`Invalid WAV file: ${filePath}`);
  }
  const sampleRate = buffer.readUInt32LE(24);
  const dataSize = buffer.readUInt32LE(40);
  const bitsPerSample = buffer.readUInt16LE(34);
  const channels = buffer.readUInt16LE(22);
  const bytesPerSample = bitsPerSample / 8;
  if (sampleRate <= 0 || channels <= 0 || bytesPerSample <= 0) {
    throw new ProviderResponseError(`Invalid WAV header metadata in ${filePath}`);
  }
  const frames = dataSize / (channels * bytesPerSample);
  return {
    sampleRate,
    channels,
    durationSeconds: frames / sampleRate
  };
}

export class MockSpeechProvider implements SpeechProvider {
  public async synthesize(request: SpeechSynthesisRequest, signal: AbortSignal): Promise<SpeechSynthesisResult> {
    signal.throwIfAborted();
    const words = request.text.trim().split(/\s+/u).filter(Boolean).length;
    const estimatedDuration = request.targetDurationSeconds ?? Math.max(2, Math.ceil((words / request.voiceProfile.paceWpm) * 60));
    await writeToneWav(request.outputPath, estimatedDuration);
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
  private readonly client: SpeechClientLike;
  private readonly model: string;
  private readonly voice: string;
  private readonly instructions: string;
  private readonly speed: number | undefined;
  private readonly responseFormat: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";

  public constructor(private readonly options: OpenAiCompatibleSpeechOptions) {
    this.client = options.client ?? new OpenAI(options.baseUrl ? { apiKey: options.apiKey, baseURL: options.baseUrl } : { apiKey: options.apiKey });
    const speechSettings = loadSpeechVoiceSettings({
      ...(options.model ? { model: options.model } : {}),
      ...(options.voice ? { voice: options.voice } : {})
    });
    this.model = speechSettings.model;
    this.voice = speechSettings.voice;
    this.instructions = options.instructions ?? speechSettings.instructions;
    this.speed = options.speed;
    this.responseFormat = options.responseFormat ?? "wav";
  }

  public async synthesize(request: SpeechSynthesisRequest, signal: AbortSignal): Promise<SpeechSynthesisResult> {
    signal.throwIfAborted();
    if (!this.options.apiKey) {
      throw new ProviderAuthenticationError("OpenAI TTS synthesis requires an API key.");
    }
    const speechOptions = {
      input: request.text,
      model: this.model,
      voice: request.voiceProfile.providerVoiceId ?? this.voice,
      instructions: this.instructions,
      response_format: this.responseFormat,
      ...(this.speed !== undefined ? { speed: this.speed } : {})
    } satisfies Parameters<SpeechClientLike["audio"]["speech"]["create"]>[0];
    const response = await this.client.audio.speech.create(speechOptions, { signal });
    const data = Buffer.from(await response.arrayBuffer());
    if (data.byteLength === 0) {
      throw new ProviderResponseError("OpenAI speech provider returned an empty audio payload.");
    }
    await ensureDir(path.dirname(request.outputPath));
    const tempPath = `${request.outputPath}.${process.pid}.tmp`;
    await fs.writeFile(tempPath, data);
    await fs.rename(tempPath, request.outputPath);
    const metadata = inspectWavMetadata(request.outputPath, data);
    return {
      sceneId: request.sceneId,
      filePath: request.outputPath,
      durationSeconds: metadata.durationSeconds,
      sampleRate: metadata.sampleRate,
      channels: metadata.channels
    };
  }
}

export async function ensureSpeechProviderReady(filePath: string): Promise<boolean> {
  return filePath.length > 0 && (await fileExists(filePath));
}
