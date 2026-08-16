import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { sceneIdSchema } from "@mediaforge/domain";
import { OpenAiCompatibleSpeechProvider } from "@mediaforge/speech";
import type { MicrodramaVisualGenerationRequest } from "../../image-generation/src/microdrama-visual-generation/index.js";

import {
  attachPlanRegistryToVisualProductionPort,
  createMicro034MockVisualProductionPort,
  type Micro034VisualProductionPort,
} from "./micro-034-visual-production-ports.js";
import {
  resolveMicro036BatchSharedVisualPaths,
  type Micro036BatchSharedVisualPathsByEpisode,
} from "./micro-036-batch-micro-035-evidence.js";
import type {
  Micro036BatchEpisodeId,
  Micro036BatchLocale,
  Micro036NonEnLocale,
} from "./micro-036-batch-bindings.js";
import { resolveMicro036OpenAiTtsModelConfigurationForLocale } from "./micro-036-openai-tts-env.js";
import { SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_ID } from "./seven-minutes-ahead-narrator-voice-registry.js";

export type Micro036SegmentSynthesisPort = {
  synthesizeSegment(input: {
    readonly segmentId: string;
    readonly text: string;
    readonly outputPath: string;
  }): Promise<{ readonly billableCharacters: number }>;
};

export function createMicro036MockSegmentSynthesisPort(input: {
  readonly writeAudioBytes: (outputPath: string) => void;
}): Micro036SegmentSynthesisPort {
  return {
    async synthesizeSegment(segment) {
      mkdirSync(path.dirname(segment.outputPath), { recursive: true });
      input.writeAudioBytes(segment.outputPath);
      return { billableCharacters: [...segment.text].length };
    },
  };
}

export function createMicro036OpenAiSegmentSynthesisPortForLocale(
  locale: Micro036BatchLocale
): Micro036SegmentSynthesisPort {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPENAI_API_TOKEN;
  if (!apiKey) {
    throw new Error("OPENAI_SECRET_REQUIRED");
  }

  const modelConfiguration = resolveMicro036OpenAiTtsModelConfigurationForLocale(locale);
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

export type Micro036EnVisualProductionPort = Micro034VisualProductionPort;

export function createMicro036MockEnVisualProductionPort(input?: {
  readonly estimatedCostMinor?: number;
  readonly writeImageBytes?: (outputPath: string) => void;
}): Micro036EnVisualProductionPort {
  return createMicro034MockVisualProductionPort(input);
}

export { attachPlanRegistryToVisualProductionPort };

export type Micro036SharedVisualReusePort = {
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

export function buildSharedVisualReusePortFromBatchPaths(
  sharedPaths: Micro036BatchSharedVisualPathsByEpisode
): Micro036SharedVisualReusePort {
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

export function createMicro036SharedVisualReusePort(input: {
  readonly batchOutputRoot: string;
  readonly episodeIds: readonly Micro036BatchEpisodeId[];
}): Micro036SharedVisualReusePort {
  return {
    async generateSharedVisual(args) {
      const sharedPaths = resolveMicro036BatchSharedVisualPaths({
        batchOutputRoot: input.batchOutputRoot,
        episodeIds: input.episodeIds,
      });
      return buildSharedVisualReusePortFromBatchPaths(sharedPaths).generateSharedVisual(
        args
      );
    },
  };
}

export function createMicro036MockSharedVisualReusePort(input?: {
  readonly writeImageBytes?: (outputPath: string) => void;
}): Micro036SharedVisualReusePort {
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

export type Micro036SegmentSynthesisPorts = Record<
  Micro036BatchLocale,
  Micro036SegmentSynthesisPort
>;

export function createMicro036MockSegmentSynthesisPorts(input: {
  readonly writeAudioBytes: (outputPath: string) => void;
}): Micro036SegmentSynthesisPorts {
  return Object.fromEntries(
    (["en-US", "de-DE", "es-ES", "pt-BR"] as const).map((locale) => [
      locale,
      createMicro036MockSegmentSynthesisPort(input),
    ])
  ) as Micro036SegmentSynthesisPorts;
}

export type Micro036NonEnSegmentSynthesisPorts = Record<
  Micro036NonEnLocale,
  Micro036SegmentSynthesisPort
>;
