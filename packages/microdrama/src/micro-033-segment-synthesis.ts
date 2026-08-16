import { mkdirSync } from "node:fs";
import path from "node:path";

import { sceneIdSchema } from "@mediaforge/domain";
import { OpenAiCompatibleSpeechProvider } from "@mediaforge/speech";

import {
  resolveMicro033OpenAiTtsModelConfigurationFromEnv,
  resolveMicro033ProviderVoiceIdFromEnv,
} from "./micro-033-openai-tts-env.js";
import { SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_ID } from "./seven-minutes-ahead-narrator-voice-registry.js";

export type Micro033SegmentSynthesisPort = {
  synthesizeSegment(input: {
    readonly segmentId: string;
    readonly text: string;
    readonly outputPath: string;
  }): Promise<{ readonly billableCharacters: number }>;
};

export function createMicro033MockSegmentSynthesisPort(input: {
  readonly writeAudioBytes: (outputPath: string) => void;
}): Micro033SegmentSynthesisPort {
  return {
    async synthesizeSegment(segment) {
      mkdirSync(path.dirname(segment.outputPath), { recursive: true });
      input.writeAudioBytes(segment.outputPath);
      return { billableCharacters: [...segment.text].length };
    },
  };
}

export function createMicro033OpenAiSegmentSynthesisPortFromEnv(): Micro033SegmentSynthesisPort {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPENAI_API_TOKEN;
  if (!apiKey) {
    throw new Error("OPENAI_SECRET_REQUIRED");
  }

  const modelConfiguration = resolveMicro033OpenAiTtsModelConfigurationFromEnv();
  const outputFormat =
    modelConfiguration.outputFormat === "mp3" ||
    modelConfiguration.outputFormat === "opus" ||
    modelConfiguration.outputFormat === "aac" ||
    modelConfiguration.outputFormat === "flac" ||
    modelConfiguration.outputFormat === "wav" ||
    modelConfiguration.outputFormat === "pcm"
      ? modelConfiguration.outputFormat
      : "mp3";

  const provider = new OpenAiCompatibleSpeechProvider({
    apiKey,
    model: modelConfiguration.model,
    voice: modelConfiguration.voice,
    instructions: modelConfiguration.instructions,
    responseFormat: outputFormat,
    speed: modelConfiguration.speed,
  });

  const providerVoiceId = resolveMicro033ProviderVoiceIdFromEnv();

  return {
    async synthesizeSegment(segment) {
      mkdirSync(path.dirname(segment.outputPath), { recursive: true });
      const signal = AbortSignal.timeout(180_000);
      await provider.synthesize(
        {
          contentProfileId: "dark-truth",
          sceneId: sceneIdSchema.parse("scene-000"),
          text: segment.text,
          voiceProfile: {
            id: SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_ID,
            label: "Seven Minutes Ahead narrator",
            gender: "neutral",
            style: "narration",
            paceWpm: 155,
            providerVoiceId,
          },
          outputPath: segment.outputPath,
          instructions: modelConfiguration.instructions,
          speed: modelConfiguration.speed,
          dispatchContext: { kind: "legacy-noncreator" },
        },
        signal
      );
      return { billableCharacters: [...segment.text].length };
    },
  };
}

/** @deprecated Use createMicro033OpenAiSegmentSynthesisPortFromEnv */
export function createMicro033OpenAiSpeechProviderFromEnv(): Micro033SegmentSynthesisPort {
  return createMicro033OpenAiSegmentSynthesisPortFromEnv();
}
