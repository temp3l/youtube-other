import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sceneIdSchema, type VoiceProfile } from "@mediaforge/domain";
import type { ProviderSpeechResult } from "./contracts.js";
import type { OpenAiSpeechTransport } from "./openai-provider.js";

interface LegacyOpenAiFileProvider {
  synthesize(
    request: {
      readonly contentProfileId: "dark-truth";
      readonly sceneId: ReturnType<typeof sceneIdSchema.parse>;
      readonly text: string;
      readonly voiceProfile: VoiceProfile;
      readonly outputPath: string;
      readonly instructions?: string;
      readonly speed?: number;
      readonly dispatchContext: { readonly kind: "legacy-noncreator" };
    },
    signal: AbortSignal
  ): Promise<unknown>;
}

export interface LegacyOpenAiProviderFactory {
  create(configuration: {
    readonly model: string;
    readonly voice: string;
    readonly instructions?: string;
    readonly outputFormat: string;
    readonly speed: number;
  }): LegacyOpenAiFileProvider;
}

/** Temporary compatibility bridge; remove after legacy callers use SpeechGenerationService. */
export class LegacyOpenAiSpeechTransport implements OpenAiSpeechTransport {
  public constructor(private readonly factory: LegacyOpenAiProviderFactory) {}

  public async synthesize(
    input: Parameters<OpenAiSpeechTransport["synthesize"]>[0]
  ): Promise<ProviderSpeechResult> {
    const temporaryDirectory = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), "mediaforge-openai-speech-")
    );
    const outputPath = path.join(
      temporaryDirectory,
      `provider.${input.outputFormat}`
    );
    const signal = input.abortSignal ?? new AbortController().signal;
    const provider = this.factory.create({
      model: input.model,
      voice: input.voice,
      ...(input.instructions ? { instructions: input.instructions } : {}),
      outputFormat: input.outputFormat,
      speed: input.speed,
    });
    try {
      await provider.synthesize(
        {
          contentProfileId: "dark-truth",
          sceneId: sceneIdSchema.parse("scene-speech-provider"),
          text: input.text,
          voiceProfile: {
            id: "resolved-speech-profile",
            label: "Resolved speech profile",
            gender: "neutral",
            style: "resolved",
            paceWpm: Math.max(1, Math.round(180 * input.speed)),
            providerVoiceId: input.voice,
          },
          outputPath,
          ...(input.instructions ? { instructions: input.instructions } : {}),
          speed: input.speed,
          dispatchContext: { kind: "legacy-noncreator" },
        },
        signal
      );
      const stream = fs.createReadStream(outputPath);
      const cleanup = (): void => {
        void fsPromises.rm(temporaryDirectory, {
          recursive: true,
          force: true,
        });
      };
      stream.once("close", cleanup);
      stream.once("error", cleanup);
      return {
        rawAudio: stream,
        rawContentType: contentType(input.outputFormat),
        actualBillableCharacters: [...input.text].length,
      };
    } catch (error) {
      await fsPromises
        .rm(temporaryDirectory, { recursive: true, force: true })
        .catch(() => undefined);
      throw error;
    }
  }
}

function contentType(format: string): string {
  const types: Readonly<Record<string, string>> = {
    mp3: "audio/mpeg",
    opus: "audio/ogg",
    aac: "audio/aac",
    flac: "audio/flac",
    wav: "audio/wav",
    pcm: "audio/L16",
  };
  return types[format] ?? "application/octet-stream";
}
