import { z } from "zod";

import { mathLanguageSchema } from "../domain/identity.js";

export const APPROVED_MATH_NARRATION_PRESET_ID =
  "math-narration-approved-v1" as const;

export const approvedMathNarrationPresetSchema = z.strictObject({
  presetId: z.literal(APPROVED_MATH_NARRATION_PRESET_ID),
  revision: z.literal(1),
  provider: z.literal("openai-compatible"),
  model: z.literal("gpt-4o-mini-tts"),
  voice: z.literal("marin"),
  providerSpeed: z.literal(0.9),
  speechProfileId: z.literal("education-natural-teacher"),
  speechProfileVersion: z.literal("education-natural-teacher.v1"),
  normalizationVersion: z.literal("education-math-normalization.v1"),
  pausePolicyVersion: z.literal("education-natural-teacher.v1"),
  chunkingPolicyVersion: z.literal("education-semantic-chunking.v1"),
  postProcessingVersion: z.literal("education-audio-post.v1"),
  punctuationStrategy: z.literal("semantic-sentence-and-question-pauses"),
  ssmlPolicy: z.literal("provider-instructions-no-inline-ssml"),
  targetDurationSeconds: z.literal(300),
  durationTolerancePercent: z.literal(3),
  integratedLoudnessTargetLufs: z.literal(-17),
  integratedLoudnessToleranceLufs: z.literal(1),
  truePeakMaximumDbtp: z.literal(-1.5),
  sampleRateHz: z.literal(48_000),
  channels: z.literal(1),
  codec: z.literal("pcm_s16le"),
});

export type ApprovedMathNarrationPreset = z.infer<
  typeof approvedMathNarrationPresetSchema
>;

export const APPROVED_MATH_NARRATION_PRESET: ApprovedMathNarrationPreset =
  approvedMathNarrationPresetSchema.parse({
    presetId: APPROVED_MATH_NARRATION_PRESET_ID,
    revision: 1,
    provider: "openai-compatible",
    model: "gpt-4o-mini-tts",
    voice: "marin",
    providerSpeed: 0.9,
    speechProfileId: "education-natural-teacher",
    speechProfileVersion: "education-natural-teacher.v1",
    normalizationVersion: "education-math-normalization.v1",
    pausePolicyVersion: "education-natural-teacher.v1",
    chunkingPolicyVersion: "education-semantic-chunking.v1",
    postProcessingVersion: "education-audio-post.v1",
    punctuationStrategy: "semantic-sentence-and-question-pauses",
    ssmlPolicy: "provider-instructions-no-inline-ssml",
    targetDurationSeconds: 300,
    durationTolerancePercent: 3,
    integratedLoudnessTargetLufs: -17,
    integratedLoudnessToleranceLufs: 1,
    truePeakMaximumDbtp: -1.5,
    sampleRateHz: 48_000,
    channels: 1,
    codec: "pcm_s16le",
  });

export const approvedMathNarrationEvidenceSchema = z.strictObject({
  language: mathLanguageSchema,
  provider: z.string().min(1),
  model: z.string().min(1),
  voice: z.string().min(1),
  providerSpeed: z.number(),
  speechProfileVersion: z.string().min(1),
  normalizationVersion: z.string().min(1),
  pronunciationDictionaryVersion: z.string().min(1),
  durationSeconds: z.number().positive(),
  integratedLoudnessLufs: z.number(),
  truePeakDbtp: z.number(),
  clippingDetected: z.boolean(),
  sampleRateHz: z.number().int().positive(),
  channels: z.number().int().positive(),
  codec: z.string().min(1),
  audioHash: z.string().regex(/^[a-f0-9]{64}$/u),
});

export type ApprovedMathNarrationEvidence = z.infer<
  typeof approvedMathNarrationEvidenceSchema
>;

export function validateApprovedMathNarration(
  input: unknown,
  preset: ApprovedMathNarrationPreset = APPROVED_MATH_NARRATION_PRESET
): ApprovedMathNarrationEvidence {
  const evidence = approvedMathNarrationEvidenceSchema.parse(input);
  const exactRegressions = [
    evidence.provider !== preset.provider ? "provider" : null,
    evidence.model !== preset.model ? "model" : null,
    evidence.voice !== preset.voice ? "voice" : null,
    evidence.providerSpeed !== preset.providerSpeed ? "providerSpeed" : null,
    evidence.speechProfileVersion !== preset.speechProfileVersion
      ? "speechProfileVersion"
      : null,
    evidence.normalizationVersion !== preset.normalizationVersion
      ? "normalizationVersion"
      : null,
    evidence.sampleRateHz !== preset.sampleRateHz ? "sampleRateHz" : null,
    evidence.channels !== preset.channels ? "channels" : null,
    evidence.codec !== preset.codec ? "codec" : null,
  ].filter((value): value is string => value !== null);
  if (exactRegressions.length > 0)
    throw new Error(
      `AUDIO_PRESET_REGRESSION: ${exactRegressions.join(", ")} changed.`
    );
  const durationTolerance =
    preset.targetDurationSeconds * (preset.durationTolerancePercent / 100);
  if (
    Math.abs(evidence.durationSeconds - preset.targetDurationSeconds) >
    durationTolerance
  )
    throw new Error("AUDIO_PRESET_REGRESSION: duration is outside tolerance.");
  if (
    Math.abs(
      evidence.integratedLoudnessLufs - preset.integratedLoudnessTargetLufs
    ) > preset.integratedLoudnessToleranceLufs
  )
    throw new Error("AUDIO_PRESET_REGRESSION: loudness is outside tolerance.");
  if (evidence.truePeakDbtp > preset.truePeakMaximumDbtp)
    throw new Error("AUDIO_PRESET_REGRESSION: true peak exceeds the limit.");
  if (evidence.clippingDetected)
    throw new Error("AUDIO_PRESET_REGRESSION: clipping was detected.");
  const expectedDictionary = `education-math-pronunciation-${evidence.language}.v1`;
  if (evidence.pronunciationDictionaryVersion !== expectedDictionary)
    throw new Error(
      "AUDIO_PRESET_REGRESSION: pronunciation dictionary is not locale-bound."
    );
  return evidence;
}
