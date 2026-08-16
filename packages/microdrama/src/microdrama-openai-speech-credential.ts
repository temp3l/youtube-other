import type { MicrodramaSpeechCredentialRecord } from "@mediaforge/domain";

export const MICRO_033_OPENAI_CREDENTIAL_HANDLE =
  "speech-cred.openai.micro-033" as const;

export const MICRO_035_OPENAI_CREDENTIAL_HANDLE =
  "speech-cred.openai.micro-035" as const;

export function isOpenAiSpeechSecretConfigured(): boolean {
  const configured =
    process.env.OPENAI_API_KEY ?? process.env.OPENAI_API_TOKEN ?? "";
  return configured.trim().length > 0;
}

export function buildMicro033OpenAiSpeechCredentialRecord(input: {
  readonly registeredAt: string;
  readonly principalId?: string;
}): MicrodramaSpeechCredentialRecord {
  return {
    schemaVersion: "mediaforge.microdrama-speech-credential.v1",
    credentialHandle: MICRO_033_OPENAI_CREDENTIAL_HANDLE,
    provider: "openai",
    principalId: input.principalId ?? "principal.operator.microdrama",
    state: "active",
    registeredAt: input.registeredAt,
  };
}

export function buildMicro035OpenAiSpeechCredentialRecord(input: {
  readonly registeredAt: string;
  readonly principalId?: string;
  readonly credentialHandle?: typeof MICRO_035_OPENAI_CREDENTIAL_HANDLE;
  readonly modelConfigurations?: readonly unknown[];
}): MicrodramaSpeechCredentialRecord {
  return {
    schemaVersion: "mediaforge.microdrama-speech-credential.v1",
    credentialHandle: input.credentialHandle ?? MICRO_035_OPENAI_CREDENTIAL_HANDLE,
    provider: "openai",
    principalId: input.principalId ?? "principal.operator.microdrama",
    state: "active",
    registeredAt: input.registeredAt,
  };
}
