import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { sceneIdSchema } from "@mediaforge/domain";
import { OpenAiCompatibleSpeechProvider } from "@mediaforge/speech";

import {
  MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION,
  MICRO_033_PROVIDER_VOICE_ID,
} from "./micro-033-canary-bindings.js";
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

  const provider = new OpenAiCompatibleSpeechProvider({
    apiKey,
    model: MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION.model,
    voice: MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION.voice,
    instructions: MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION.instructions,
    responseFormat: "mp3",
    speed: MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION.speed,
  });

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
            providerVoiceId: MICRO_033_PROVIDER_VOICE_ID,
          },
          outputPath: segment.outputPath,
          instructions: MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION.instructions,
          speed: MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION.speed,
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
