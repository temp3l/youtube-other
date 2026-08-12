import { z } from "zod";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);

export const MICRODRAMA_SPEECH_CREDENTIAL_SCHEMA_VERSION =
  "mediaforge.microdrama-speech-credential.v1" as const;

export const MICRODRAMA_SPEECH_PROVIDERS = ["openai", "elevenlabs"] as const;
export const microdramaSpeechProviderSchema = z.enum(MICRODRAMA_SPEECH_PROVIDERS);
export type MicrodramaSpeechProvider = z.infer<typeof microdramaSpeechProviderSchema>;

export const MICRODRAMA_SPEECH_CREDENTIAL_STATES = [
  "active",
  "revoked",
  "expired",
] as const;
export const microdramaSpeechCredentialStateSchema = z.enum(
  MICRODRAMA_SPEECH_CREDENTIAL_STATES
);
export type MicrodramaSpeechCredentialState = z.infer<
  typeof microdramaSpeechCredentialStateSchema
>;

export const microdramaSpeechCredentialRecordSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_SPEECH_CREDENTIAL_SCHEMA_VERSION),
    credentialHandle: identifierSchema,
    provider: microdramaSpeechProviderSchema,
    principalId: identifierSchema,
    state: microdramaSpeechCredentialStateSchema,
    registeredAt: isoDateTimeSchema,
    expiresAt: isoDateTimeSchema.optional(),
    revokedAt: isoDateTimeSchema.optional(),
  })
  .strict();
export type MicrodramaSpeechCredentialRecord = z.infer<
  typeof microdramaSpeechCredentialRecordSchema
>;
