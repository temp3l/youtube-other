import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { sceneIdSchema } from "@mediaforge/domain";
import { OpenAiCompatibleSpeechProvider } from "@mediaforge/speech";
import type { MicrodramaVisualGenerationRequest } from "../../image-generation/src/microdrama-visual-generation/index.js";

import type { Micro034CanaryExecutionEvidence } from "./micro-035-canary-micro-034-evidence.js";
import {
  resolveMicro034SharedVisualPaths,
  type Micro034SharedVisualPathsByEpisode,
} from "./micro-035-canary-micro-034-evidence.js";
import type { Micro035CanaryLocale } from "./micro-035-canary-bindings.js";
import { resolveMicro035OpenAiTtsModelConfigurationForLocale } from "./micro-035-openai-tts-env.js";
import { SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_ID } from "./seven-minutes-ahead-narrator-voice-registry.js";

export type Micro035SegmentSynthesisPort = {
  synthesizeSegment(input: {
    readonly segmentId: string;
    readonly text: string;
    readonly outputPath: string;
  }): Promise<{ readonly billableCharacters: number }>;
};

export function createMicro035MockSegmentSynthesisPort(input: {
  readonly writeAudioBytes: (outputPath: string) => void;
}): Micro035SegmentSynthesisPort {
  return {
    async synthesizeSegment(segment) {
      mkdirSync(path.dirname(segment.outputPath), { recursive: true });
      input.writeAudioBytes(segment.outputPath);
      return { billableCharacters: [...segment.text].length };
    },
  };
}

export function createMicro035OpenAiSegmentSynthesisPortForLocale(
  locale: Micro035CanaryLocale
): Micro035SegmentSynthesisPort {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPENAI_API_TOKEN;
  if (!apiKey) {
    throw new Error("OPENAI_SECRET_REQUIRED");
  }

  const modelConfiguration = resolveMicro035OpenAiTtsModelConfigurationForLocale(locale);
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
            providerVoiceId: modelConfiguration.voice,
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

export type Micro035SharedVisualReusePort = {
  generateSharedVisual(input: {
    readonly request: MicrodramaVisualGenerationRequest;
    readonly outputPath: string;
  }): Promise<{
    readonly artifactHash: string;
    readonly estimatedCostMinor: number;
    readonly cacheHit: boolean;
    readonly providerRequestId: string;
  }>;
};

export function createMicro035SharedVisualReusePort(input: {
  readonly micro034Evidence: Micro034CanaryExecutionEvidence;
  readonly micro034OutputRoot?: string;
}): Micro035SharedVisualReusePort {
  const sharedPaths = resolveMicro034SharedVisualPaths({
    evidence: input.micro034Evidence,
    ...(input.micro034OutputRoot
      ? { micro034OutputRoot: input.micro034OutputRoot }
      : {}),
  });
  return buildSharedVisualReusePortFromPaths(sharedPaths);
}

export function buildSharedVisualReusePortFromPaths(
  sharedPaths: Micro034SharedVisualPathsByEpisode
): Micro035SharedVisualReusePort {
  return {
    async generateSharedVisual(args) {
      const episodeId = args.request.episodeId.toUpperCase();
      const semanticId = args.request.sourcePlateSemanticId;
      const sourcePath = sharedPaths[episodeId]?.[semanticId];
      if (!sourcePath) {
        throw new Error(
          `Missing approved shared visual for ${episodeId}/${semanticId}`
        );
      }
      mkdirSync(path.dirname(args.outputPath), { recursive: true });
      copyFileSync(sourcePath, args.outputPath);
      return {
        artifactHash: args.request.requestId,
        estimatedCostMinor: 0,
        cacheHit: true,
        providerRequestId: `reuse.${args.request.requestId}`,
      };
    },
  };
}

export function createMicro035MockSharedVisualReusePort(input?: {
  readonly writeImageBytes?: (outputPath: string) => void;
}): Micro035SharedVisualReusePort {
  const writeImageBytes =
    input?.writeImageBytes ??
    ((outputPath: string) => {
      mkdirSync(path.dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, Buffer.from("mock-reused-visual"), "utf8");
    });
  return {
    async generateSharedVisual(args) {
      writeImageBytes(args.outputPath);
      return {
        artifactHash: args.request.requestId,
        estimatedCostMinor: 0,
        cacheHit: true,
        providerRequestId: `reuse.mock.${args.request.requestId}`,
      };
    },
  };
}
