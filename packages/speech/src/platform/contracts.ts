import { Readable } from "node:stream";
import { z } from "zod";

export const SPEECH_CACHE_KEY_SCHEMA_VERSION = "speech-cache-key-v1" as const;
export const AUDIO_MASTERING_PROFILE_VERSION = "speech-master-flac-v1" as const;

export const speechProviderIdSchema = z.enum(["openai", "elevenlabs"]);
export type SpeechProviderId = z.infer<typeof speechProviderIdSchema>;

const boundedString = (maximum: number) =>
  z.string().trim().min(1).max(maximum);
const speedSchema = z.number().finite().min(0.25).max(4);

export const speechChunkingConfigurationSchema = z
  .object({
    targetCharacters: z.number().int().positive().max(100_000),
    hardMaximumCharacters: z.number().int().positive().max(100_000),
    previousContextCharacters: z.number().int().nonnegative().max(10_000),
    nextContextCharacters: z.number().int().nonnegative().max(10_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.targetCharacters > value.hardMaximumCharacters) {
      context.addIssue({
        code: "custom",
        message: "targetCharacters must not exceed hardMaximumCharacters",
        path: ["targetCharacters"],
      });
    }
  });
export type SpeechChunkingConfiguration = z.infer<
  typeof speechChunkingConfigurationSchema
>;

export const openAiSpeechProviderConfigurationSchema = z
  .object({
    provider: z.literal("openai"),
    model: boundedString(200),
    voice: boundedString(200),
    instructions: z.string().max(8_000).optional(),
    outputFormat: boundedString(40).optional(),
    speed: speedSchema.default(1),
    chunking: speechChunkingConfigurationSchema.optional(),
  })
  .strict();

export const elevenLabsVoiceSettingsSchema = z
  .object({
    speed: speedSchema,
    stability: z.number().finite().min(0).max(1),
    similarityBoost: z.number().finite().min(0).max(1),
    style: z.number().finite().min(0).max(1),
    useSpeakerBoost: z.boolean(),
  })
  .strict();
export type ElevenLabsVoiceSettings = z.infer<
  typeof elevenLabsVoiceSettingsSchema
>;

export const elevenLabsSpeechProviderConfigurationSchema = z
  .object({
    provider: z.literal("elevenlabs"),
    modelId: boundedString(200),
    voiceId: boundedString(200),
    settings: elevenLabsVoiceSettingsSchema,
    pronunciationDictionaryVersions: z.array(boundedString(200)).max(100),
    outputFormat: boundedString(40),
    textNormalization: z.enum(["auto", "on", "off"]).optional(),
    chunking: speechChunkingConfigurationSchema,
  })
  .strict();

export const speechProviderConfigurationSchema = z.discriminatedUnion(
  "provider",
  [
    openAiSpeechProviderConfigurationSchema,
    elevenLabsSpeechProviderConfigurationSchema,
  ]
);
export type SpeechProviderConfiguration = z.infer<
  typeof speechProviderConfigurationSchema
>;

export const resolvedSpeechProfileSchema = z
  .object({
    profileId: boundedString(200),
    profileVersionId: boundedString(200),
    language: boundedString(35),
    configuration: speechProviderConfigurationSchema,
  })
  .strict();
export type ResolvedSpeechProfile = z.infer<typeof resolvedSpeechProfileSchema>;

export const speechSynthesisRequestSchema = z
  .object({
    generationId: boundedString(200),
    text: z.string().min(1).max(1_000_000),
    profile: resolvedSpeechProfileSchema,
    forceRegeneration: z.boolean(),
  })
  .strict();
export interface SpeechSynthesisRequest extends z.infer<
  typeof speechSynthesisRequestSchema
> {
  readonly abortSignal?: AbortSignal;
  readonly chunk?: {
    readonly index: number;
    readonly previousContext?: string;
    readonly nextContext?: string;
  };
}

export const speechCostEstimateSchema = z
  .object({
    billableCharacters: z.number().int().nonnegative(),
    estimatedCredits: z.number().finite().nonnegative().optional(),
    estimatedCurrencyAmount: z.number().finite().nonnegative().optional(),
    currency: z.string().length(3).toUpperCase().optional(),
  })
  .strict();
export type SpeechCostEstimate = z.infer<typeof speechCostEstimateSchema>;

export interface ProviderSpeechResult {
  readonly providerRequestId?: string;
  readonly rawAudio: Readable;
  readonly rawContentType: string;
  readonly actualBillableCharacters?: number;
  readonly actualCredits?: number;
  readonly seed?: number;
}

export interface SpeechProvider {
  readonly id: SpeechProviderId;
  validateProfile(profile: ResolvedSpeechProfile): Promise<void>;
  estimate(request: SpeechSynthesisRequest): Promise<SpeechCostEstimate>;
  synthesize(request: SpeechSynthesisRequest): Promise<ProviderSpeechResult>;
}
