import { z } from "zod";

const opaqueId = z
  .string()
  .min(3)
  .max(160)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u);
const language = z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/u);
const provider = z.enum(["openai", "elevenlabs"]);
const artifactId = z
  .string()
  .min(3)
  .max(500)
  .regex(/^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[a-zA-Z0-9._/-]+$/u);

export const speechGenerationStateSchema = z.enum([
  "QUEUED",
  "PREFLIGHT",
  "GENERATING",
  "POST_PROCESSING",
  "SUCCEEDED",
  "RETRYABLE_FAILURE",
  "BLOCKED_QUOTA",
  "BLOCKED_CONFIGURATION",
  "BLOCKED_CONSENT",
  "FAILED_PERMANENT",
  "CANCELLED",
]);

const profileReferenceSchema = z
  .object({ profileVersionId: opaqueId })
  .strict();
const chunkingSchema = z
  .object({
    targetCharacters: z.number().int().positive().max(100_000),
    hardMaximumCharacters: z.number().int().positive().max(100_000),
    previousContextCharacters: z.number().int().nonnegative().max(10_000),
    nextContextCharacters: z.number().int().nonnegative().max(10_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.targetCharacters > value.hardMaximumCharacters)
      context.addIssue({
        code: "custom",
        path: ["targetCharacters"],
        message: "targetCharacters must not exceed hardMaximumCharacters.",
      });
  });
const configurationSchema = z.discriminatedUnion("provider", [
  z
    .object({
      provider: z.literal("openai"),
      model: z.string().min(1).max(160),
      voice: z.string().min(1).max(160),
      instructions: z.string().max(8_000).optional(),
      outputFormat: z.string().min(1).max(80).optional(),
      speed: z.number().finite().min(0.25).max(4).default(1),
      chunking: chunkingSchema.optional(),
    })
    .strict(),
  z
    .object({
      provider: z.literal("elevenlabs"),
      modelId: z.string().min(1).max(160),
      voiceId: z.string().min(1).max(160),
      outputFormat: z.string().min(1).max(80),
      settings: z
        .object({
          speed: z.number().finite().min(0.25).max(4),
          stability: z.number().finite().min(0).max(1),
          similarityBoost: z.number().finite().min(0).max(1),
          style: z.number().finite().min(0).max(1),
          useSpeakerBoost: z.boolean(),
        })
        .strict(),
      pronunciationDictionaryVersions: z
        .array(z.string().min(1).max(160))
        .max(100)
        .default([]),
      textNormalization: z.enum(["auto", "on", "off"]).optional(),
      chunking: chunkingSchema,
    })
    .strict(),
]);

/** Text and language are optional for video-backed requests: the application resolves the canonical narration. */
export const speechEstimateInputSchema = z
  .object({
    videoId: opaqueId,
    genreId: opaqueId.optional(),
    language: language.optional(),
    text: z.string().min(1).max(200_000).optional(),
    profileVersionId: opaqueId.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.text !== undefined && value.language === undefined)
      context.addIssue({
        code: "custom",
        path: ["language"],
        message: "language is required when text is supplied.",
      });
  });
export const speechGenerationInputSchema = speechEstimateInputSchema
  .extend({
    forceRegeneration: z.boolean().optional().default(false),
    supersedesGenerationId: opaqueId.optional(),
  })
  .strict();
export const speechRetryInputSchema = z
  .object({
    text: z.string().min(1).max(200_000),
    language,
  })
  .strict();
export const voiceProfileInputSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[a-z][a-z0-9_-]*$/u),
    displayName: z.string().trim().min(1).max(160),
    consentRecordId: opaqueId.optional(),
  })
  .strict();
export const voiceProfileVersionInputSchema = z
  .object({ language, configuration: configurationSchema })
  .strict();
export const genreSpeechPolicyInputSchema = profileReferenceSchema;
export const videoSpeechOverrideInputSchema = z.discriminatedUnion(
  "useGenreDefault",
  [
    z.object({ useGenreDefault: z.literal(true) }).strict(),
    z
      .object({ useGenreDefault: z.literal(false), profileVersionId: opaqueId })
      .strict(),
  ]
);

export const speechEstimateResponseSchema = z
  .object({
    profileVersionId: opaqueId,
    provider,
    billableCharacters: z.number().int().nonnegative(),
    estimatedCredits: z.number().finite().nonnegative().optional(),
    estimatedCurrencyAmount: z.number().finite().nonnegative().optional(),
    currency: z.string().min(3).max(3).optional(),
    cacheHitExpected: z.boolean(),
    quotaImpact: z
      .object({
        allowed: z.boolean(),
        warning: z.boolean(),
        remainingCharacters: z.number().int().nonnegative().optional(),
      })
      .strict(),
  })
  .strict();
export const speechGenerationResponseSchema = z
  .object({
    generationId: opaqueId,
    revision: z.number().int().nonnegative(),
    state: speechGenerationStateSchema,
    profileVersionId: opaqueId,
    provider,
    cacheHit: z.boolean(),
    masterArtifactId: artifactId.optional(),
    failure: z
      .object({
        code: z.string().min(1).max(160),
        retryable: z.boolean(),
        message: z.string().min(1).max(2_000),
      })
      .strict()
      .optional(),
  })
  .strict();
export const speechProfileResponseSchema = z
  .object({
    profileId: opaqueId,
    key: z.string().min(1).max(160),
    displayName: z.string().min(1).max(160),
    status: z.enum(["DRAFT", "ACTIVE", "DEPRECATED"]),
    consentStatus: z.enum([
      "not_required",
      "valid",
      "missing",
      "expired",
      "revoked",
    ]),
    activeVersionId: opaqueId.optional(),
    revision: z.number().int().nonnegative(),
  })
  .strict();
export const speechProfileVersionResponseSchema = z
  .object({
    profileVersionId: opaqueId,
    profileId: opaqueId,
    version: z.number().int().positive(),
    language,
    provider,
    status: z.enum(["DRAFT", "ACTIVE", "DEPRECATED"]),
    revision: z.number().int().nonnegative(),
  })
  .strict();
export const speechPolicyResponseSchema = z
  .object({
    profileVersionId: opaqueId.nullable(),
    revision: z.number().int().nonnegative(),
  })
  .strict();

export type SpeechEstimateInput = z.infer<typeof speechEstimateInputSchema>;
export type SpeechGenerationInput = z.infer<typeof speechGenerationInputSchema>;
export type SpeechRetryInput = z.infer<typeof speechRetryInputSchema>;
export type VoiceProfileInput = z.infer<typeof voiceProfileInputSchema>;
export type VoiceProfileVersionInput = z.infer<
  typeof voiceProfileVersionInputSchema
>;
export type GenreSpeechPolicyInput = z.infer<
  typeof genreSpeechPolicyInputSchema
>;
export type VideoSpeechOverrideInput = z.infer<
  typeof videoSpeechOverrideInputSchema
>;
export type SpeechEstimateResponse = z.infer<
  typeof speechEstimateResponseSchema
>;
export type SpeechGenerationResponse = z.infer<
  typeof speechGenerationResponseSchema
>;
export type SpeechProfileResponse = z.infer<typeof speechProfileResponseSchema>;
export type SpeechProfileVersionResponse = z.infer<
  typeof speechProfileVersionResponseSchema
>;
export type SpeechPolicyResponse = z.infer<typeof speechPolicyResponseSchema>;
