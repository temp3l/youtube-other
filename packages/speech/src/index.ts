import fs from "node:fs/promises";
import path from "node:path";
import {
  ProviderAuthenticationError,
  ProviderResponseError,
  type AudioSegment,
  type ContentProfileId,
  type SceneId,
  type VoiceProfile,
} from "@mediaforge/domain";
import {
  ensureDir,
  fileExists,
  serializeOpenAIError,
  writeOpenAIDebugLog,
} from "@mediaforge/shared";
import { runCurl } from "@mediaforge/process-runner";
import {
  currentExecutionTelemetry,
  estimateDurationPricing,
} from "@mediaforge/observability";
import { loadSpeechVoiceSettings } from "./voice-settings.js";
import { makeWavHeader, validateSpeechAudioPayload } from "./wav-analysis.js";
import { recordNarrationTelemetry } from "./narration-telemetry.js";
import {
  assertCreatorVoiceDispatchAllowed,
  type SpeechDispatchContext,
} from "./creator-voice-policy.js";
export {
  listEpisodeScriptLanguages,
  loadEpisodeScriptMarkdown,
  splitEpisodeScriptMarkdown,
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
export * from "./narration-quality-gate.js";
export * from "./narration-pipeline.js";
export * from "./narration-status.js";
export * from "./dark-truth-adapter.js";
export * from "./voice-benchmark.js";
export * from "./narration-telemetry.js";
export * from "./narration-pacing.js";
export {
  loadSpeechVoiceInstructionTemplate,
  loadSpeechVoiceSettings,
  resolveSpeechVoiceInstructionPath,
  speechVoiceSettings,
  DEFAULT_SPEECH_VOICE,
  type SpeechArtifactType,
  type SpeechVoicePreset,
} from "./voice-settings.js";
export * from "./audio-instructions.js";
export * from "./speech-delivery-profile.js";
export * from "./educational-speech-planning.js";
export * from "./educational-pronunciation.js";
export * from "./educational-speech-pipeline.js";
export * from "./creator-voice-policy.js";
export {
  AUDIO_MASTERING_PROFILE_VERSION,
  SPEECH_CACHE_KEY_SCHEMA_VERSION,
  elevenLabsSpeechProviderConfigurationSchema,
  elevenLabsVoiceSettingsSchema,
  openAiSpeechProviderConfigurationSchema,
  resolvedSpeechProfileSchema,
  speechCostEstimateSchema,
  speechProviderConfigurationSchema,
  speechProviderIdSchema,
  speechSynthesisRequestSchema,
  type ElevenLabsVoiceSettings,
  type ProviderSpeechResult,
  type ResolvedSpeechProfile,
  type SpeechCostEstimate,
  type SpeechProvider as PlatformSpeechProvider,
  type SpeechProviderConfiguration,
  type SpeechProviderId,
  type SpeechSynthesisRequest as PlatformSpeechSynthesisRequest,
} from "./platform/contracts.js";
export * from "./platform/cache-key.js";
export * from "./platform/chunking.js";
export * from "./platform/consent.js";
export * from "./platform/errors.js";
export * from "./platform/state-machine.js";
export * from "./platform/registry.js";
export * from "./platform/openai-provider.js";
export * from "./platform/legacy-openai-transport.js";
export * from "./platform/elevenlabs-provider.js";
export * from "./platform/profile-resolver.js";
export * from "./platform/profile-administration.js";
export * from "./platform/service.js";
export * from "./platform/filesystem-artifacts.js";
export * from "./platform/workflow-adapter.js";
export * from "./platform/quota.js";
export * from "./platform/pricing.js";

export interface SpeechSynthesisRequest {
  /** Runtime-validated before any provider, output, or temporary-file effect. */
  readonly contentProfileId: ContentProfileId;
  readonly sceneId: SceneId;
  readonly text: string;
  readonly voiceProfile: VoiceProfile;
  readonly outputPath: string;
  readonly targetDurationSeconds?: number;
  readonly instructions?: string;
  readonly speed?: number;
  readonly requestFingerprint?: string;
  readonly dispatchContext?: SpeechDispatchContext;
  readonly trace?: {
    readonly task: "educational-speech-generate";
    readonly speechProfileId: string;
    readonly speechProfileVersion: string;
    readonly language: string;
    readonly chunkId: string;
    readonly candidateIndex: number;
    readonly inputHash: string;
  };
}

export interface SpeechSynthesisResult extends AudioSegment {
  readonly sampleRate: number;
  readonly channels: number;
  /** Echoes the exact request identity so callers can reject response transplants. */
  readonly requestFingerprint?: string;
}

export interface SpeechProvider {
  synthesize(
    request: SpeechSynthesisRequest,
    signal: AbortSignal
  ): Promise<SpeechSynthesisResult>;
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
          readonly response_format?:
            | "mp3"
            | "opus"
            | "aac"
            | "flac"
            | "wav"
            | "pcm";
          readonly speed?: number;
        },
        options?: { readonly signal?: AbortSignal }
      ): Promise<Response>;
    };
  };
}

async function writePlaceholderToneWav(
  filePath: string,
  durationSeconds: number,
  sampleRate = 24000
): Promise<void> {
  const channels = 1;
  const bitsPerSample = 16;
  const frames = Math.max(1, Math.floor(durationSeconds * sampleRate));
  const pcm = Buffer.alloc(frames * channels * 2);
  const amplitude = Math.max(1, Math.floor(0.02 * 32767));
  const frequencyHz = 220;
  for (let index = 0; index < frames; index += 1) {
    const sample = Math.round(
      Math.sin((index / sampleRate) * Math.PI * 2 * frequencyHz) * amplitude
    );
    pcm.writeInt16LE(sample, index * 2);
  }
  const header = makeWavHeader(
    sampleRate,
    channels,
    bitsPerSample,
    pcm.byteLength
  );
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, Buffer.concat([header, pcm]));
  await fs.rename(tempPath, filePath);
}

function isRetryableSpeechError(error: unknown): boolean {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /insufficient_quota|at capacity|model is at capacity|try a different model|rate limit|too many requests|temporarily unavailable|quality validation|too quiet|noise|clipped|tone or static/i.test(
    message
  );
}

function uniqueModels(models: ReadonlyArray<string>): string[] {
  return [
    ...new Set(
      models.map((model) => model.trim()).filter((model) => model.length > 0)
    ),
  ];
}

function resolveEpisodeRootFromAudioOutputPath(
  outputPath: string
): string | undefined {
  const parts = path.resolve(outputPath).split(path.sep);
  const markerIndex = parts.findIndex(
    (part, index) =>
      ["languages", "locales", "shared"].includes(part) && index > 0
  );
  if (markerIndex <= 0) {
    return undefined;
  }
  return parts.slice(0, markerIndex).join(path.sep) || path.sep;
}

export class MockSpeechProvider implements SpeechProvider {
  public async synthesize(
    request: SpeechSynthesisRequest,
    signal: AbortSignal
  ): Promise<SpeechSynthesisResult> {
    signal.throwIfAborted();
    assertCreatorVoiceDispatchAllowed(
      request.contentProfileId,
      request.dispatchContext
    );
    const words = request.text.trim().split(/\s+/u).filter(Boolean).length;
    const estimatedDuration =
      request.targetDurationSeconds ??
      Math.max(2, Math.ceil((words / request.voiceProfile.paceWpm) * 60));
    await writePlaceholderToneWav(request.outputPath, estimatedDuration);
    return {
      sceneId: request.sceneId,
      filePath: request.outputPath,
      durationSeconds: estimatedDuration,
      sampleRate: 24000,
      channels: 1,
      ...(request.requestFingerprint
        ? { requestFingerprint: request.requestFingerprint }
        : {}),
    };
  }
}

export class OpenAiCompatibleSpeechProvider implements SpeechProvider {
  private readonly client: SpeechClientLike | null;
  private readonly models: string[];
  private readonly voice: string;
  private readonly instructions: string;
  private readonly speed: number | undefined;
  private readonly responseFormat:
    | "mp3"
    | "opus"
    | "aac"
    | "flac"
    | "wav"
    | "pcm";

  public constructor(private readonly options: OpenAiCompatibleSpeechOptions) {
    this.client = options.client ?? null;
    const speechSettings = loadSpeechVoiceSettings({
      ...(options.model ? { model: options.model } : {}),
      ...(options.voice ? { voice: options.voice } : {}),
    });
    this.models = uniqueModels([
      options.model ?? speechSettings.model,
      ...(options.fallbackModels ?? []),
    ]);
    this.voice = speechSettings.voice;
    this.instructions = options.instructions ?? speechSettings.instructions;
    this.speed = options.speed;
    this.responseFormat = options.responseFormat ?? "wav";
  }

  public async synthesize(
    request: SpeechSynthesisRequest,
    signal: AbortSignal
  ): Promise<SpeechSynthesisResult> {
    signal.throwIfAborted();
    assertCreatorVoiceDispatchAllowed(
      request.contentProfileId,
      request.dispatchContext
    );
    const telemetry = currentExecutionTelemetry();
    if (!this.options.apiKey) {
      throw new ProviderAuthenticationError(
        "OpenAI TTS synthesis requires an API key."
      );
    }
    await ensureDir(path.dirname(request.outputPath));
    if (this.models.length === 0) {
      throw new ProviderResponseError("No OpenAI speech model was configured.");
    }
    let lastError: unknown = null;
    for (const model of this.models) {
      const result = await this.synthesizeWithModel(
        request,
        signal,
        telemetry,
        model
      ).catch((error: unknown) => {
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
    throw new ProviderResponseError(
      "OpenAI speech provider failed without a specific error."
    );
  }

  private async synthesizeWithModel(
    request: SpeechSynthesisRequest,
    signal: AbortSignal,
    telemetry: ReturnType<typeof currentExecutionTelemetry>,
    model: string
  ): Promise<SpeechSynthesisResult> {
    const startedAt = new Date();
    const episodeRoot = resolveEpisodeRootFromAudioOutputPath(
      request.outputPath
    );
    const headers = [
      "--header",
      `Authorization: Bearer ${this.options.apiKey}`,
      "--header",
      "Content-Type: application/json",
    ];
    if (this.options.organization) {
      headers.push(
        "--header",
        `OpenAI-Organization: ${this.options.organization}`
      );
    }
    if (this.options.project) {
      headers.push("--header", `OpenAI-Project: ${this.options.project}`);
    }
    if (this.client) {
      const tempPath = `${request.outputPath}.${process.pid}.tmp`;
      const speed = request.speed ?? this.speed;
      const speechOptions = {
        input: request.text,
        model,
        voice: request.voiceProfile.providerVoiceId ?? this.voice,
        instructions: request.instructions ?? this.instructions,
        response_format: this.responseFormat,
        ...(speed !== undefined ? { speed } : {}),
      } satisfies Parameters<SpeechClientLike["audio"]["speech"]["create"]>[0];
      try {
        await writeOpenAIDebugLog({
          ...(episodeRoot ? { episodeRoot } : {}),
          operation: "speech-generation",
          mode: "real",
          paidProviderCalled: false,
          model,
          endpoint: "/v1/audio/speech",
          request: speechOptions,
          durationMs: 0,
          attempt: 1,
          caller: {
            file: "packages/speech/src/index.ts",
            function: "OpenAiCompatibleSpeechProvider.synthesizeWithModel",
            stage: String(request.sceneId),
          },
          status: "pre-dispatch",
        }).catch(() => undefined);
        const response = await this.client.audio.speech.create(speechOptions, {
          signal,
        });
        const data = Buffer.from(await response.arrayBuffer());
        if (data.byteLength === 0) {
          throw new ProviderResponseError(
            "OpenAI speech provider returned an empty audio payload."
          );
        }
        const metadata = validateSpeechAudioPayload(
          tempPath,
          data,
          request.targetDurationSeconds
        );
        await writeOpenAIDebugLog({
          ...(episodeRoot ? { episodeRoot } : {}),
          operation: "speech-generation",
          mode: "real",
          paidProviderCalled: true,
          model,
          endpoint: "/v1/audio/speech",
          request: speechOptions,
          response: {
            byteLength: data.byteLength,
            responseFormat: this.responseFormat,
            durationSeconds: metadata.durationSeconds,
            sampleRate: metadata.sampleRate,
            channels: metadata.channels,
          },
          usage: { durationSeconds: metadata.durationSeconds },
          durationMs: Date.now() - startedAt.getTime(),
          attempt: 1,
          caller: {
            file: "packages/speech/src/index.ts",
            function: "OpenAiCompatibleSpeechProvider.synthesizeWithModel",
            stage: String(request.sceneId),
          },
          status: "success",
        }).catch(() => undefined);
        await fs.writeFile(tempPath, data);
        await fs.rename(tempPath, request.outputPath);
        const cost = telemetry
          ? estimateDurationPricing(telemetry.catalog, {
              provider: "openai",
              model,
              operation: "speech",
              durationSeconds: metadata.durationSeconds,
            })
          : {
              pricingVersion: "unconfigured",
              costMicros: null,
              warning: undefined,
            };
        telemetry?.recordApiCall({
          provider: "openai",
          model,
          operation: "speech-generation",
          startedAt: startedAt.toISOString(),
          endedAt: new Date().toISOString(),
          durationMs: Math.max(0, Date.now() - startedAt.getTime()),
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
        recordNarrationTelemetry({
          stage: "provider",
          chunkId: request.sceneId,
          model,
          voice: request.voiceProfile.providerVoiceId ?? this.voice,
          attempt: 1,
          latencyMs: Math.max(0, Date.now() - startedAt.getTime()),
          inputCharacters: request.text.length,
          outputBytes: data.byteLength,
          generatedSeconds: metadata.durationSeconds,
          validationResult: "passed",
          regeneration: false,
          fallbackUsed: false,
          details: {
            requestFingerprint: request.requestFingerprint,
            responseFormat: this.responseFormat,
          },
        });
        return {
          sceneId: request.sceneId,
          filePath: request.outputPath,
          durationSeconds: metadata.durationSeconds,
          sampleRate: metadata.sampleRate,
          channels: metadata.channels,
          ...(request.requestFingerprint
            ? { requestFingerprint: request.requestFingerprint }
            : {}),
        };
      } catch (error) {
        await writeOpenAIDebugLog({
          ...(episodeRoot ? { episodeRoot } : {}),
          operation: "speech-generation",
          mode: "real",
          paidProviderCalled: true,
          model,
          endpoint: "/v1/audio/speech",
          request: speechOptions,
          error: serializeOpenAIError(error),
          durationMs: Date.now() - startedAt.getTime(),
          attempt: 1,
          caller: {
            file: "packages/speech/src/index.ts",
            function: "OpenAiCompatibleSpeechProvider.synthesizeWithModel",
            stage: String(request.sceneId),
          },
          status: "error",
        }).catch(() => undefined);
        recordNarrationTelemetry({
          stage: "provider",
          chunkId: request.sceneId,
          model,
          voice: request.voiceProfile.providerVoiceId ?? this.voice,
          attempt: 1,
          latencyMs: Math.max(0, Date.now() - startedAt.getTime()),
          inputCharacters: request.text.length,
          outputBytes: 0,
          validationResult: "failed",
          failureClass: error instanceof Error ? error.name : "UnknownError",
          regeneration: false,
          fallbackUsed: false,
          details: {
            requestFingerprint: request.requestFingerprint,
            responseFormat: this.responseFormat,
          },
        });
        throw error;
      } finally {
        await fs.rm(tempPath, { force: true }).catch(() => {});
      }
    }
    const tempPath = `${request.outputPath}.${process.pid}.tmp`;
    try {
      await ensureDir(path.dirname(tempPath));
      await fs.writeFile(tempPath, "");
      const speed = request.speed ?? this.speed;
      const speechOptions = {
        input: request.text,
        model,
        voice: request.voiceProfile.providerVoiceId ?? this.voice,
        instructions: request.instructions ?? this.instructions,
        response_format: this.responseFormat,
        ...(speed !== undefined ? { speed } : {}),
      };
      await writeOpenAIDebugLog({
        ...(episodeRoot ? { episodeRoot } : {}),
        operation: "speech-generation",
        mode: "real",
        paidProviderCalled: false,
        model,
        endpoint: "/v1/audio/speech",
        request: {
          ...speechOptions,
          headers: {
            Authorization: `Bearer ${this.options.apiKey}`,
            ...(this.options.organization
              ? { "OpenAI-Organization": this.options.organization }
              : {}),
            ...(this.options.project
              ? { "OpenAI-Project": this.options.project }
              : {}),
          },
        },
        durationMs: 0,
        attempt: 1,
        caller: {
          file: "packages/speech/src/index.ts",
          function: "OpenAiCompatibleSpeechProvider.synthesizeWithModel",
          stage: String(request.sceneId),
        },
        status: "pre-dispatch",
      }).catch(() => undefined);
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
          JSON.stringify(speechOptions),
          new URL(
            "/v1/audio/speech",
            this.options.baseUrl ?? "https://api.openai.com"
          ).toString(),
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
        throw new ProviderResponseError(
          responseText.length > 0
            ? responseText
            : "OpenAI speech provider request failed."
        );
      }
      const data = await fs.readFile(tempPath);
      if (data.byteLength === 0) {
        throw new ProviderResponseError(
          "OpenAI speech provider returned an empty audio payload."
        );
      }
      const metadata = validateSpeechAudioPayload(
        tempPath,
        data,
        request.targetDurationSeconds
      );
      await writeOpenAIDebugLog({
        ...(episodeRoot ? { episodeRoot } : {}),
        operation: "speech-generation",
        mode: "real",
        paidProviderCalled: true,
        model,
        endpoint: "/v1/audio/speech",
        request: speechOptions,
        response: {
          byteLength: data.byteLength,
          responseFormat: this.responseFormat,
          durationSeconds: metadata.durationSeconds,
          sampleRate: metadata.sampleRate,
          channels: metadata.channels,
        },
        usage: { durationSeconds: metadata.durationSeconds },
        durationMs: Date.now() - startedAt.getTime(),
        attempt: 1,
        caller: {
          file: "packages/speech/src/index.ts",
          function: "OpenAiCompatibleSpeechProvider.synthesizeWithModel",
          stage: String(request.sceneId),
        },
        status: "success",
      }).catch(() => undefined);
      await fs.rename(tempPath, request.outputPath);
      const cost = telemetry
        ? estimateDurationPricing(telemetry.catalog, {
            provider: "openai",
            model,
            operation: "speech",
            durationSeconds: metadata.durationSeconds,
          })
        : {
            pricingVersion: "unconfigured",
            costMicros: null,
            warning: undefined,
          };
      telemetry?.recordApiCall({
        provider: "openai",
        model,
        operation: "speech-generation",
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: Math.max(0, Date.now() - startedAt.getTime()),
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
      recordNarrationTelemetry({
        stage: "provider",
        chunkId: request.sceneId,
        model,
        voice: request.voiceProfile.providerVoiceId ?? this.voice,
        attempt: 1,
        latencyMs: Math.max(0, Date.now() - startedAt.getTime()),
        inputCharacters: request.text.length,
        outputBytes: data.byteLength,
        generatedSeconds: metadata.durationSeconds,
        validationResult: "passed",
        regeneration: false,
        fallbackUsed: false,
        details: {
          requestFingerprint: request.requestFingerprint,
          responseFormat: this.responseFormat,
        },
      });
      return {
        sceneId: request.sceneId,
        filePath: request.outputPath,
        durationSeconds: metadata.durationSeconds,
        sampleRate: metadata.sampleRate,
        channels: metadata.channels,
        ...(request.requestFingerprint
          ? { requestFingerprint: request.requestFingerprint }
          : {}),
      };
    } catch (error) {
      const resolvedSpeed = request.speed ?? this.speed;
      await writeOpenAIDebugLog({
        ...(episodeRoot ? { episodeRoot } : {}),
        operation: "speech-generation",
        mode: "real",
        paidProviderCalled: true,
        model,
        endpoint: "/v1/audio/speech",
        request: {
          input: request.text,
          model,
          voice: request.voiceProfile.providerVoiceId ?? this.voice,
          instructions: request.instructions ?? this.instructions,
          response_format: this.responseFormat,
          ...(resolvedSpeed !== undefined ? { speed: resolvedSpeed } : {}),
        },
        error: serializeOpenAIError(error),
        durationMs: Date.now() - startedAt.getTime(),
        attempt: 1,
        caller: {
          file: "packages/speech/src/index.ts",
          function: "OpenAiCompatibleSpeechProvider.synthesizeWithModel",
          stage: String(request.sceneId),
        },
        status: "error",
      }).catch(() => undefined);
      recordNarrationTelemetry({
        stage: "provider",
        chunkId: request.sceneId,
        model,
        voice: request.voiceProfile.providerVoiceId ?? this.voice,
        attempt: 1,
        latencyMs: Math.max(0, Date.now() - startedAt.getTime()),
        inputCharacters: request.text.length,
        outputBytes: 0,
        validationResult: "failed",
        failureClass: error instanceof Error ? error.name : "UnknownError",
        regeneration: false,
        fallbackUsed: false,
        details: {
          requestFingerprint: request.requestFingerprint,
          responseFormat: this.responseFormat,
        },
      });
      throw error;
    } finally {
      await fs.rm(tempPath, { force: true }).catch(() => {});
    }
  }
}

export async function ensureSpeechProviderReady(
  filePath: string
): Promise<boolean> {
  return filePath.length > 0 && (await fileExists(filePath));
}
