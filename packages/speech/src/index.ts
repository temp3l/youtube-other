import fs from "node:fs/promises";
import path from "node:path";
import {
  HumanActionRequiredError,
  ProviderAuthenticationError,
  ProviderResponseError,
  type AudioSegment,
  type SceneId,
  type VoiceProfile
} from "@mediaforge/domain";
import { ensureDir, fileExists } from "@mediaforge/shared";
import { runCommand } from "@mediaforge/process-runner";

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
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly voice: string;
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
  await fs.writeFile(filePath, Buffer.concat([header, pcm]));
}

async function inspectWavDuration(filePath: string): Promise<number> {
  const buffer = await fs.readFile(filePath);
  if (buffer.byteLength < 44 || buffer.toString("ascii", 0, 4) !== "RIFF") {
    throw new ProviderResponseError(`Invalid WAV file: ${filePath}`);
  }
  const sampleRate = buffer.readUInt32LE(24);
  const dataSize = buffer.readUInt32LE(40);
  const bytesPerSample = buffer.readUInt16LE(32);
  const channels = buffer.readUInt16LE(22);
  const frames = dataSize / (channels * bytesPerSample);
  return frames / sampleRate;
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
  public constructor(private readonly options: OpenAiCompatibleSpeechOptions) {}

  public async synthesize(request: SpeechSynthesisRequest, signal: AbortSignal): Promise<SpeechSynthesisResult> {
    signal.throwIfAborted();
    if (!this.options.apiKey) {
      throw new ProviderAuthenticationError("OpenAI-compatible speech synthesis requires an API key.");
    }
    const response = await fetch(new URL("/v1/audio/speech", this.options.baseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.options.model,
        voice: this.options.voice,
        input: request.text,
        response_format: "wav"
      }),
      signal
    });
    if (!response.ok) {
      throw new ProviderResponseError(`Speech provider returned ${response.status} ${response.statusText}`);
    }
    const data = Buffer.from(await response.arrayBuffer());
    await ensureDir(path.dirname(request.outputPath));
    await fs.writeFile(request.outputPath, data);
    const durationSeconds = await inspectWavDuration(request.outputPath);
    return {
      sceneId: request.sceneId,
      filePath: request.outputPath,
      durationSeconds,
      sampleRate: 24000,
      channels: 1
    };
  }
}

export async function ensureSpeechProviderReady(filePath: string): Promise<boolean> {
  return filePath.length > 0 && (await fileExists(filePath));
}

