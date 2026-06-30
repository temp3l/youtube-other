import { hashText, normalizeWhitespace } from "@mediaforge/shared";
import { z } from "zod";

export const AUDIO_INSTRUCTION_OWNER = "audio" as const;
export const AUDIO_INSTRUCTION_SCHEMA_VERSION =
  "audio-instruction-artifact-v1";
export const TTS_GENERATION_SCHEMA_VERSION = "tts-generation-record-v1";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/iu);

export const speechNarrationDependencySchema = z
  .object({
    episodeNumber: z.string().min(1),
    episodeSlug: z.string().min(1),
    language: z.string().min(1),
    locale: z.string().min(1),
    variant: z.enum(["full", "short"]),
    narrationText: z.string().min(1),
    narrationFingerprint: hashSchema,
  })
  .strict();
export type SpeechNarrationDependency = z.infer<
  typeof speechNarrationDependencySchema
>;

export const speechConfigSnapshotSchema = z
  .object({
    model: z.string().min(1),
    voice: z.string().min(1),
    baseInstructions: z.string().min(1),
    speed: z.number().positive().optional(),
  })
  .strict();
export type SpeechConfigSnapshot = z.infer<typeof speechConfigSnapshotSchema>;

export const audioInstructionArtifactSchema = z
  .object({
    schemaVersion: z.literal(AUDIO_INSTRUCTION_SCHEMA_VERSION),
    owner: z.literal(AUDIO_INSTRUCTION_OWNER),
    status: z.enum(["completed", "failed"]),
    identity: z
      .object({
        episodeNumber: z.string().min(1),
        episodeSlug: z.string().min(1),
        language: z.string().min(1),
        locale: z.string().min(1),
        variant: z.enum(["full", "short"]),
      })
      .strict(),
    parentNarrationFingerprint: hashSchema,
    voiceConfigFingerprint: hashSchema,
    speechModelConfigFingerprint: hashSchema,
    instructionFingerprint: hashSchema,
    instructions: z.string().min(1),
    model: z.string().min(1),
    voice: z.string().min(1),
    speed: z.number().positive().optional(),
    generatedAt: z.string().min(1),
    failureMessage: z.string().min(1).optional(),
  })
  .strict();
export type AudioInstructionArtifact = z.infer<
  typeof audioInstructionArtifactSchema
>;

export const ttsGenerationRecordSchema = z
  .object({
    schemaVersion: z.literal(TTS_GENERATION_SCHEMA_VERSION),
    owner: z.literal(AUDIO_INSTRUCTION_OWNER),
    status: z.enum(["completed", "failed"]),
    episodeSlug: z.string().min(1),
    language: z.string().min(1),
    variant: z.enum(["full", "short"]),
    narrationFingerprint: hashSchema,
    voiceConfigFingerprint: hashSchema,
    speechModelConfigFingerprint: hashSchema,
    audioInstructionFingerprint: hashSchema.optional(),
    dependencyFingerprint: hashSchema,
    narrationPath: z.string().min(1).optional(),
    segmentCount: z.number().int().nonnegative(),
    generatedAt: z.string().min(1),
    failureMessage: z.string().min(1).optional(),
  })
  .strict();
export type TtsGenerationRecord = z.infer<typeof ttsGenerationRecordSchema>;

export function computeSpeechVoiceConfigFingerprint(input: {
  readonly voice: string;
  readonly speed?: number | undefined;
}): string {
  return hashText(
    JSON.stringify({
      voice: input.voice,
      speed: input.speed ?? null,
    })
  );
}

export function computeSpeechModelConfigFingerprint(
  input: SpeechConfigSnapshot
): string {
  return hashText(
    JSON.stringify({
      model: input.model,
      voice: input.voice,
      baseInstructions: normalizeWhitespace(input.baseInstructions),
      speed: input.speed ?? null,
    })
  );
}

export function computeAudioInstructionFingerprint(instructions: string): string {
  return hashText(normalizeWhitespace(instructions));
}

export function computeTtsDependencyFingerprint(input: {
  readonly narrationFingerprint: string;
  readonly voiceConfigFingerprint: string;
  readonly speechModelConfigFingerprint: string;
  readonly audioInstructionFingerprint?: string | undefined;
}): string {
  return hashText(
    JSON.stringify({
      narrationFingerprint: input.narrationFingerprint,
      voiceConfigFingerprint: input.voiceConfigFingerprint,
      speechModelConfigFingerprint: input.speechModelConfigFingerprint,
      audioInstructionFingerprint: input.audioInstructionFingerprint ?? null,
    })
  );
}

export function buildAudioInstructionArtifact(input: {
  readonly narration: SpeechNarrationDependency;
  readonly speechConfig: SpeechConfigSnapshot;
  readonly generatedAt?: string;
}): AudioInstructionArtifact {
  speechNarrationDependencySchema.parse(input.narration);
  speechConfigSnapshotSchema.parse(input.speechConfig);
  const voiceConfigFingerprint = computeSpeechVoiceConfigFingerprint({
    voice: input.speechConfig.voice,
    speed: input.speechConfig.speed,
  });
  const speechModelConfigFingerprint = computeSpeechModelConfigFingerprint(
    input.speechConfig
  );
  const instructions = [
    input.speechConfig.baseInstructions,
    "Preserve the validated narration exactly.",
    "Do not add metadata, chapter headings, scene labels, or production notes.",
    "Apply only synthesis-safe pauses and pacing; never rewrite the narration.",
  ]
    .map((entry) => normalizeWhitespace(entry))
    .filter((entry) => entry.length > 0)
    .join(" ");
  const instructionFingerprint = computeAudioInstructionFingerprint(
    instructions
  );
  return audioInstructionArtifactSchema.parse({
    schemaVersion: AUDIO_INSTRUCTION_SCHEMA_VERSION,
    owner: AUDIO_INSTRUCTION_OWNER,
    status: "completed",
    identity: {
      episodeNumber: input.narration.episodeNumber,
      episodeSlug: input.narration.episodeSlug,
      language: input.narration.language,
      locale: input.narration.locale,
      variant: input.narration.variant,
    },
    parentNarrationFingerprint: input.narration.narrationFingerprint,
    voiceConfigFingerprint,
    speechModelConfigFingerprint,
    instructionFingerprint,
    instructions,
    model: input.speechConfig.model,
    voice: input.speechConfig.voice,
    ...(input.speechConfig.speed !== undefined
      ? { speed: input.speechConfig.speed }
      : {}),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  });
}

