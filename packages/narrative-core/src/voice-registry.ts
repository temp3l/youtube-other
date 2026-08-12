import { z } from "zod";

import {
  NARRATIVE_SCHEMA_VERSION,
  computePayloadHash,
  identifierSchema,
  nonEmptyStringSchema,
  sha256Schema,
} from "./common.js";
import { characterIdSchema } from "./ids.js";
import { createRevisionEnvelopeSchema } from "./revision.js";

export const MICRODRAMA_BCP47_LOCALES = [
  "en-US",
  "de-DE",
  "es-ES",
  "pt-BR",
] as const;
export const microdramaBcp47LocaleSchema = z.enum(MICRODRAMA_BCP47_LOCALES);
export type MicrodramaBcp47Locale = z.infer<typeof microdramaBcp47LocaleSchema>;

export const CHARACTER_VOICE_PROFILE_VERSION_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "DEPRECATED",
] as const;
export const characterVoiceProfileVersionStatusSchema = z.enum(
  CHARACTER_VOICE_PROFILE_VERSION_STATUSES
);
export type CharacterVoiceProfileVersionStatus = z.infer<
  typeof characterVoiceProfileVersionStatusSchema
>;

export const CHARACTER_VOICE_BINDING_STATUSES = [
  "UNBOUND",
  "CANARY_PENDING",
  "CANARY_APPROVED",
] as const;
export const characterVoiceBindingStatusSchema = z.enum(
  CHARACTER_VOICE_BINDING_STATUSES
);
export type CharacterVoiceBindingStatus = z.infer<
  typeof characterVoiceBindingStatusSchema
>;

export const CHARACTER_VOICE_NARRATIVE_ROLES = ["narrator", "character"] as const;
export const characterVoiceNarrativeRoleSchema = z.enum(
  CHARACTER_VOICE_NARRATIVE_ROLES
);
export type CharacterVoiceNarrativeRole = z.infer<
  typeof characterVoiceNarrativeRoleSchema
>;

export const characterVoiceProfileIdSchema = identifierSchema.brand<
  "CharacterVoiceProfileId"
>();
export type CharacterVoiceProfileId = z.infer<typeof characterVoiceProfileIdSchema>;

export const characterVoiceProfileVersionIdSchema = identifierSchema.brand<
  "CharacterVoiceProfileVersionId"
>();
export type CharacterVoiceProfileVersionId = z.infer<
  typeof characterVoiceProfileVersionIdSchema
>;

export const characterVoicePronunciationRevisionIdSchema = identifierSchema.brand<
  "CharacterVoicePronunciationRevisionId"
>();
export type CharacterVoicePronunciationRevisionId = z.infer<
  typeof characterVoicePronunciationRevisionIdSchema
>;

export const characterVoiceConsentRecordIdSchema = identifierSchema.brand<
  "CharacterVoiceConsentRecordId"
>();
export type CharacterVoiceConsentRecordId = z.infer<
  typeof characterVoiceConsentRecordIdSchema
>;

export function buildCharacterVoiceProfileId(
  characterId: string,
  locale: MicrodramaBcp47Locale
): CharacterVoiceProfileId {
  const localeSlug = locale.toLowerCase();
  return characterVoiceProfileIdSchema.parse(`voice.${characterId}.${localeSlug}`);
}

export const characterVoiceDeliveryConfigurationSchema = z
  .object({
    paceWpm: z.number().int().positive().max(400),
    instructions: z.string().max(8_000).optional(),
    stability: z.number().finite().min(0).max(1).optional(),
    similarityBoost: z.number().finite().min(0).max(1).optional(),
  })
  .strict();
export type CharacterVoiceDeliveryConfiguration = z.infer<
  typeof characterVoiceDeliveryConfigurationSchema
>;

export const characterVoicePronunciationEntrySchema = z
  .object({
    entryId: identifierSchema,
    grapheme: nonEmptyStringSchema,
    spokenForm: nonEmptyStringSchema,
    scope: z.enum(["profile", "language", "global"]),
  })
  .strict();
export type CharacterVoicePronunciationEntry = z.infer<
  typeof characterVoicePronunciationEntrySchema
>;

export const characterVoiceProfilePayloadSchema = z
  .object({
    schemaVersion: z.literal(NARRATIVE_SCHEMA_VERSION),
    profileId: characterVoiceProfileIdSchema,
    characterId: characterIdSchema,
    locale: microdramaBcp47LocaleSchema,
    displayName: nonEmptyStringSchema,
    narrativeRole: characterVoiceNarrativeRoleSchema,
    speechStyleNotes: nonEmptyStringSchema,
  })
  .strict();
export type CharacterVoiceProfilePayload = z.infer<
  typeof characterVoiceProfilePayloadSchema
>;

export const characterVoiceProfileVersionPayloadSchema = z
  .object({
    schemaVersion: z.literal(NARRATIVE_SCHEMA_VERSION),
    profileVersionId: characterVoiceProfileVersionIdSchema,
    profileId: characterVoiceProfileIdSchema,
    versionNumber: z.number().int().positive(),
    status: characterVoiceProfileVersionStatusSchema,
    provider: z.enum(["openai", "elevenlabs"]),
    modelIntent: nonEmptyStringSchema,
    voiceBindingStatus: characterVoiceBindingStatusSchema,
    providerVoiceId: identifierSchema.optional(),
    canaryEvidenceArtifactHash: sha256Schema.optional(),
    consentRecordId: characterVoiceConsentRecordIdSchema.optional(),
    deliveryConfiguration: characterVoiceDeliveryConfigurationSchema,
    pronunciationRevisionId: characterVoicePronunciationRevisionIdSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.providerVoiceId && value.voiceBindingStatus !== "CANARY_APPROVED") {
      context.addIssue({
        code: "custom",
        message:
          "providerVoiceId requires voiceBindingStatus CANARY_APPROVED with canary evidence.",
        path: ["providerVoiceId"],
      });
    }
    if (
      value.providerVoiceId &&
      !value.canaryEvidenceArtifactHash
    ) {
      context.addIssue({
        code: "custom",
        message: "providerVoiceId requires canaryEvidenceArtifactHash.",
        path: ["canaryEvidenceArtifactHash"],
      });
    }
    if (
      value.voiceBindingStatus === "CANARY_APPROVED" &&
      !value.canaryEvidenceArtifactHash
    ) {
      context.addIssue({
        code: "custom",
        message: "CANARY_APPROVED binding requires canaryEvidenceArtifactHash.",
        path: ["canaryEvidenceArtifactHash"],
      });
    }
  });
export type CharacterVoiceProfileVersionPayload = z.infer<
  typeof characterVoiceProfileVersionPayloadSchema
>;

export const characterVoicePronunciationRevisionPayloadSchema = z
  .object({
    schemaVersion: z.literal(NARRATIVE_SCHEMA_VERSION),
    pronunciationRevisionId: characterVoicePronunciationRevisionIdSchema,
    profileId: characterVoiceProfileIdSchema,
    profileVersionNumber: z.number().int().positive(),
    locale: microdramaBcp47LocaleSchema,
    entries: z.array(characterVoicePronunciationEntrySchema),
  })
  .strict();
export type CharacterVoicePronunciationRevisionPayload = z.infer<
  typeof characterVoicePronunciationRevisionPayloadSchema
>;

export const characterVoiceConsentRecordPayloadSchema = z
  .object({
    schemaVersion: z.literal(NARRATIVE_SCHEMA_VERSION),
    consentRecordId: characterVoiceConsentRecordIdSchema,
    subjectName: nonEmptyStringSchema,
    evidenceArtifactHash: sha256Schema,
    syntheticSpeechAllowed: z.boolean(),
    commercialUseAllowed: z.boolean(),
    multilingualUseAllowed: z.boolean(),
    permittedChannels: z.array(nonEmptyStringSchema).min(1),
  })
  .strict();
export type CharacterVoiceConsentRecordPayload = z.infer<
  typeof characterVoiceConsentRecordPayloadSchema
>;

export type ResolvedCharacterVoiceProfileRecord = {
  readonly profile: CharacterVoiceProfilePayload;
  readonly activeVersion: CharacterVoiceProfileVersionPayload | null;
  readonly pronunciationRevision: CharacterVoicePronunciationRevisionPayload | null;
  readonly consent: CharacterVoiceConsentRecordPayload | null;
};

export const characterVoiceProfileRevisionSchema = createRevisionEnvelopeSchema(
  characterVoiceProfilePayloadSchema
);
export type CharacterVoiceProfileRevision = z.infer<
  typeof characterVoiceProfileRevisionSchema
>;

export const characterVoiceProfileVersionRevisionSchema =
  createRevisionEnvelopeSchema(characterVoiceProfileVersionPayloadSchema);
export type CharacterVoiceProfileVersionRevision = z.infer<
  typeof characterVoiceProfileVersionRevisionSchema
>;

export const characterVoicePronunciationRevisionSchema =
  createRevisionEnvelopeSchema(characterVoicePronunciationRevisionPayloadSchema);
export type CharacterVoicePronunciationRevision = z.infer<
  typeof characterVoicePronunciationRevisionSchema
>;

export function computeCharacterVoicePronunciationRevisionHash(
  payload: CharacterVoicePronunciationRevisionPayload
): string {
  return computePayloadHash(payload);
}
