import {
  type MicrodramaSpeechCredentialRecord,
  microdramaSpeechCredentialRecordSchema,
} from "./microdrama-speech-credential-contracts.js";

export function evaluateMicrodramaSpeechCredentialAdmission(input: {
  readonly credential: MicrodramaSpeechCredentialRecord | undefined;
  readonly provider: MicrodramaSpeechCredentialRecord["provider"];
  readonly now: string;
}): { readonly allowed: boolean; readonly reason?: string } {
  if (!input.credential) {
    return { allowed: false, reason: "speech_credential_missing" };
  }
  if (input.credential.provider !== input.provider) {
    return { allowed: false, reason: "speech_credential_provider_mismatch" };
  }
  if (input.credential.state !== "active") {
    return { allowed: false, reason: "speech_credential_stale" };
  }
  const nowMs = Date.parse(input.now);
  if (Date.parse(input.credential.registeredAt) > nowMs) {
    return { allowed: false, reason: "speech_credential_stale" };
  }
  if (
    input.credential.expiresAt !== undefined &&
    Date.parse(input.credential.expiresAt) <= nowMs
  ) {
    return { allowed: false, reason: "speech_credential_stale" };
  }
  if (input.credential.revokedAt !== undefined) {
    return { allowed: false, reason: "speech_credential_stale" };
  }
  return { allowed: true };
}

export function parseMicrodramaSpeechCredentialRecord(
  value: unknown
): MicrodramaSpeechCredentialRecord {
  return microdramaSpeechCredentialRecordSchema.parse(value);
}
