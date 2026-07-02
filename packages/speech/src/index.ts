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
import {
  makeWavHeader,
  validateSpeechAudioPayload,
} from "./wav-analysis.js";
export {
  listEpisodeScriptLanguages,
  loadEpisodeScriptMarkdown,
  splitEpisodeScriptMarkdown,
  writeEpisodeScriptMarkdown,
} from "./script-markdown.js";
export {
  createNarrationArtifactPaths,
  type NarrationArtifactPathContext,
  type NarrationArtifactPathSet,
  type NarrationVariant,
} from "./narration-paths.js";
export * from "./narration-schemas.js";
export * from "./spoken-narration.js";
export * from "./narration-segmentation.js";
export * from "./performance-direction.js";
export * from "./pronunciation.js";
export * from "./openai-tts-request.js";
export * from "./narration-cache.js";
export * from "./audio-validation.js";
export * from "./wav-analysis.js";
export * from "./narration-assembly.js";
export * from "./mastering.js";
export {
  loadSpeechVoiceInstructionTemplate,
  loadSpeechVoiceSettings,
  resolveSpeechVoiceInstructionPath,
  speechVoiceSettings,
  type SpeechArtifactType,
  type SpeechVoicePreset,
} from "./voice-settings.js";
export * from "./audio-instructions.js";

export interface SpeechSynthesisRequest {
  readonly sceneId: SceneId;
  readonly text: string;
  readonly voiceProfile: VoiceProfile;
  readonly outputPath: string;
  readonly targetDurationSeconds?: number;
  readonly instructions?: string;
  readonly requestFingerprint?: string;
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
