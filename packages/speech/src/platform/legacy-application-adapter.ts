import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertCreatorVoiceDispatchAllowed } from "../creator-voice-policy.js";
import { probeAudioWithFfprobe } from "../audio-validation.js";
import {
  MockSpeechProvider,
  OpenAiCompatibleSpeechProvider,
  type OpenAiCompatibleSpeechOptions,
  type SpeechProvider as LegacySpeechProvider,
  type SpeechSynthesisRequest as LegacySpeechSynthesisRequest,
  type SpeechSynthesisResult as LegacySpeechSynthesisResult,
} from "../index.js";
import { ElevenLabsSpeechProvider } from "./elevenlabs-provider.js";
import { FileSystemSpeechArtifactService } from "./filesystem-artifacts.js";
import { LegacyOpenAiSpeechTransport } from "./legacy-openai-transport.js";
import { OpenAiSpeechProviderAdapter } from "./openai-provider.js";
import { SpeechProviderRegistry } from "./registry.js";
import {
  SpeechGenerationService,
  type SpeechGenerationResult,
  type SpeechGenerationStore,
} from "./service.js";
import type { ResolvedSpeechProfile } from "./contracts.js";
import type { ElevenLabsVoiceSettings } from "./contracts.js";
import type { VoiceConsentRecord } from "./consent.js";
import { runCommand } from "@mediaforge/process-runner";
import { ensureDir } from "@mediaforge/shared";

const LEGACY_NONCREATOR_CHANNEL = "legacy-noncreator";

const LEGACY_NONCREATOR_CONSENT: VoiceConsentRecord = {
  id: "legacy-noncreator-local-consent",
  subjectName: "Legacy CLI narration",
  evidenceArtifactId: "legacy-noncreator-local-consent",
  evidenceSha256: "0".repeat(64),
  syntheticSpeechAllowed: true,
  commercialUseAllowed: true,
  multilingualUseAllowed: true,
  permittedChannels: [LEGACY_NONCREATOR_CHANNEL],
  validFrom: new Date("2020-01-01T00:00:00Z"),
};

class SingleOwnerGenerationStore implements SpeechGenerationStore {
  public async claim() {
    return { kind: "owner" as const };
  }
  public async waitFor(): Promise<SpeechGenerationResult> {
    throw new Error(
      "A single legacy request never waits for another cache owner."
    );
  }
  public async renewLease(): Promise<void> {}
  public async transition(): Promise<void> {}
  public async recordChunk(): Promise<void> {}
  public async complete(): Promise<void> {}
  public async recordCacheHit(): Promise<SpeechGenerationResult> {
    throw new Error("A single legacy request cannot be a cache hit.");
  }
}

function codecForExtension(extension: string): readonly string[] {
  const codecs: Readonly<Record<string, readonly string[]>> = {
    ".wav": ["-c:a", "pcm_s16le"],
    ".flac": ["-c:a", "flac", "-sample_fmt", "s16"],
    ".mp3": ["-c:a", "libmp3lame"],
    ".opus": ["-c:a", "libopus"],
    ".ogg": ["-c:a", "libopus"],
    ".aac": ["-c:a", "aac"],
    ".m4a": ["-c:a", "aac"],
  };
  return codecs[extension] ?? ["-c:a", "pcm_s16le"];
}

export interface LegacyElevenLabsSpeechOptions {
  readonly apiKey: string;
  readonly voiceId: string;
  readonly modelId: string;
  readonly baseUrl?: string;
  readonly requestTimeoutMs?: number;
  readonly outputFormat?: string;
  readonly speed?: number;
  readonly settings?: Partial<ElevenLabsVoiceSettings>;
}

const DEFAULT_LEGACY_ELEVENLABS_SETTINGS: ElevenLabsVoiceSettings = {
  speed: 1,
  stability: 0.65,
  similarityBoost: 0.8,
  style: 0,
  useSpeakerBoost: true,
};

/** Compatibility facade: legacy file callers still execute through SpeechGenerationService. */
class ProviderNeutralLegacyOpenAiSpeechProvider implements LegacySpeechProvider {
  public constructor(
    private readonly input: {
      readonly options: OpenAiCompatibleSpeechOptions;
      readonly mock: boolean;
    }
  ) {}

  public async synthesize(
    request: LegacySpeechSynthesisRequest,
    signal: AbortSignal
  ): Promise<LegacySpeechSynthesisResult> {
    signal.throwIfAborted();
    assertCreatorVoiceDispatchAllowed(
      request.contentProfileId,
      request.dispatchContext
    );
    const temporaryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "mediaforge-speech-compat-")
    );
    const generationId = `legacy-${crypto.randomUUID()}`;
    const configuration = {
      provider: "openai" as const,
      model: this.input.options.model ?? "gpt-4o-mini-tts",
      voice:
        request.voiceProfile.providerVoiceId ??
        this.input.options.voice ??
        "onyx",
      instructions: request.instructions ?? this.input.options.instructions,
      outputFormat: this.input.mock
        ? "wav"
        : (this.input.options.responseFormat ?? "wav"),
      speed: request.speed ?? this.input.options.speed ?? 1,
      chunking: {
        targetCharacters: 100_000,
        hardMaximumCharacters: 100_000,
        previousContextCharacters: 0,
        nextContextCharacters: 0,
      },
    };
    const resolvedProfile: ResolvedSpeechProfile = {
      profileId: "legacy-openai-compatibility",
      profileVersionId: "legacy-openai-compatibility-v1",
      language: request.trace?.language ?? "en",
      configuration,
    };
    const transport = new LegacyOpenAiSpeechTransport({
      create: (providerConfiguration) =>
        this.input.mock
          ? new MockSpeechProvider()
          : new OpenAiCompatibleSpeechProvider({
              ...this.input.options,
              model: providerConfiguration.model,
              voice: providerConfiguration.voice,
              ...(providerConfiguration.instructions
                ? { instructions: providerConfiguration.instructions }
                : {}),
              responseFormat: providerConfiguration.outputFormat as NonNullable<
                OpenAiCompatibleSpeechOptions["responseFormat"]
              >,
              speed: providerConfiguration.speed,
              // Profile resolution pins one model. Silent provider fallback is forbidden here.
              fallbackModels: [],
            }),
    });
    const service = new SpeechGenerationService({
      providers: new SpeechProviderRegistry([
        new OpenAiSpeechProviderAdapter(transport),
      ]),
      profiles: {
        resolve: async () => resolvedProfile,
        consentFor: async () => LEGACY_NONCREATOR_CONSENT,
      },
      generations: new SingleOwnerGenerationStore(),
      quotas: {
        reserve: async () => ({
          reservationId: `legacy-reservation-${generationId}`,
        }),
        reconcile: async () => undefined,
        release: async () => undefined,
      },
      artifacts: new FileSystemSpeechArtifactService({
        rootDirectory: temporaryRoot,
      }),
      usage: { record: async () => undefined },
    });
    try {
      const result = await service.generate({
        generationId,
        workspaceId: "legacy-local",
        language: resolvedProfile.language,
        text: request.text,
        channel: LEGACY_NONCREATOR_CHANNEL,
        replacementProfileVersionId: resolvedProfile.profileVersionId,
        forceRegeneration: true,
        abortSignal: signal,
      });
      const source = path.join(temporaryRoot, result.masterArtifact.artifactId);
      await ensureDir(path.dirname(request.outputPath));
      const extension =
        path.extname(request.outputPath).toLowerCase() || ".wav";
      const temporaryOutput = `${request.outputPath}.${process.pid}.tmp${extension}`;
      try {
        await runCommand(
          "ffmpeg",
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            source,
            "-ar",
            "48000",
            "-ac",
            "1",
            ...codecForExtension(extension),
            temporaryOutput,
          ],
          { timeoutMs: 300_000 }
        );
        await fs.rename(temporaryOutput, request.outputPath);
      } finally {
        await fs.rm(temporaryOutput, { force: true }).catch(() => undefined);
      }
      const metadata = await probeAudioWithFfprobe(request.outputPath);
      return {
        sceneId: request.sceneId,
        filePath: request.outputPath,
        durationSeconds: metadata.durationSeconds,
        sampleRate: metadata.sampleRate ?? 48_000,
        channels: metadata.channels ?? 1,
        ...(request.requestFingerprint
          ? { requestFingerprint: request.requestFingerprint }
          : {}),
      };
    } finally {
      await fs
        .rm(temporaryRoot, { recursive: true, force: true })
        .catch(() => undefined);
    }
  }
}

let warned = false;
function warnLegacyFacade(): void {
  if (warned) return;
  warned = true;
  process.emitWarning(
    "The file-oriented speech provider is a compatibility facade over SpeechGenerationService and will be removed after 2026-10-01; use the speech API/CLI commands.",
    { code: "MEDIAFORGE_SPEECH_LEGACY" }
  );
}

export function createProviderNeutralLegacyOpenAiSpeechProvider(
  options: OpenAiCompatibleSpeechOptions
): LegacySpeechProvider {
  warnLegacyFacade();
  return new ProviderNeutralLegacyOpenAiSpeechProvider({ options, mock: false });
}

class ProviderNeutralLegacyElevenLabsSpeechProvider implements LegacySpeechProvider {
  public constructor(
    private readonly options: LegacyElevenLabsSpeechOptions
  ) {}

  public async synthesize(
    request: LegacySpeechSynthesisRequest,
    signal: AbortSignal
  ): Promise<LegacySpeechSynthesisResult> {
    signal.throwIfAborted();
    assertCreatorVoiceDispatchAllowed(
      request.contentProfileId,
      request.dispatchContext
    );
    const temporaryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "mediaforge-speech-compat-")
    );
    const generationId = `legacy-${crypto.randomUUID()}`;
    const speed = request.speed ?? this.options.speed ?? 1;
    const configuration = {
      provider: "elevenlabs" as const,
      modelId: this.options.modelId,
      voiceId:
        request.voiceProfile.providerVoiceId ?? this.options.voiceId,
      outputFormat: this.options.outputFormat ?? "mp3_44100_128",
      settings: {
        ...DEFAULT_LEGACY_ELEVENLABS_SETTINGS,
        ...this.options.settings,
        speed,
      },
      pronunciationDictionaryVersions: [] as string[],
      textNormalization: "auto" as const,
      chunking: {
        targetCharacters: 4_000,
        hardMaximumCharacters: 8_000,
        previousContextCharacters: 400,
        nextContextCharacters: 400,
      },
    };
    const resolvedProfile: ResolvedSpeechProfile = {
      profileId: "legacy-elevenlabs-compatibility",
      profileVersionId: "legacy-elevenlabs-compatibility-v1",
      language: request.trace?.language ?? "en",
      configuration,
    };
    const service = new SpeechGenerationService({
      providers: new SpeechProviderRegistry([
        new ElevenLabsSpeechProvider({
          apiKey: this.options.apiKey,
          featureEnabled: true,
          ...(this.options.baseUrl ? { baseUrl: this.options.baseUrl } : {}),
          ...(this.options.requestTimeoutMs
            ? { requestTimeoutMs: this.options.requestTimeoutMs }
            : {}),
        }),
      ]),
      profiles: {
        resolve: async () => resolvedProfile,
        consentFor: async () => LEGACY_NONCREATOR_CONSENT,
      },
      generations: new SingleOwnerGenerationStore(),
      quotas: {
        reserve: async () => ({
          reservationId: `legacy-reservation-${generationId}`,
        }),
        reconcile: async () => undefined,
        release: async () => undefined,
      },
      artifacts: new FileSystemSpeechArtifactService({
        rootDirectory: temporaryRoot,
      }),
      usage: { record: async () => undefined },
    });
    try {
      const result = await service.generate({
        generationId,
        workspaceId: "legacy-local",
        language: resolvedProfile.language,
        text: request.text,
        channel: LEGACY_NONCREATOR_CHANNEL,
        replacementProfileVersionId: resolvedProfile.profileVersionId,
        forceRegeneration: true,
        abortSignal: signal,
      });
      const source = path.join(temporaryRoot, result.masterArtifact.artifactId);
      await ensureDir(path.dirname(request.outputPath));
      const extension =
        path.extname(request.outputPath).toLowerCase() || ".mp3";
      const temporaryOutput = `${request.outputPath}.${process.pid}.tmp${extension}`;
      try {
        await runCommand(
          "ffmpeg",
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            source,
            "-ar",
            "48000",
            "-ac",
            "1",
            ...codecForExtension(extension),
            temporaryOutput,
          ],
          { timeoutMs: 300_000 }
        );
        await fs.rename(temporaryOutput, request.outputPath);
      } finally {
        await fs.rm(temporaryOutput, { force: true }).catch(() => undefined);
      }
      const metadata = await probeAudioWithFfprobe(request.outputPath);
      return {
        sceneId: request.sceneId,
        filePath: request.outputPath,
        durationSeconds: metadata.durationSeconds,
        sampleRate: metadata.sampleRate ?? 48_000,
        channels: metadata.channels ?? 1,
        ...(request.requestFingerprint
          ? { requestFingerprint: request.requestFingerprint }
          : {}),
      };
    } finally {
      await fs
        .rm(temporaryRoot, { recursive: true, force: true })
        .catch(() => undefined);
    }
  }
}

export function createProviderNeutralLegacyElevenLabsSpeechProvider(
  options: LegacyElevenLabsSpeechOptions
): LegacySpeechProvider {
  warnLegacyFacade();
  return new ProviderNeutralLegacyElevenLabsSpeechProvider(options);
}

export function createProviderNeutralLegacyMockSpeechProvider(): LegacySpeechProvider {
  warnLegacyFacade();
  return new ProviderNeutralLegacyOpenAiSpeechProvider({
    options: { apiKey: "mock-no-network", responseFormat: "wav" },
    mock: true,
  });
}
