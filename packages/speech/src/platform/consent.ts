import { z } from "zod";
import type { ResolvedSpeechProfile } from "./contracts.js";
import { SpeechDomainError } from "./errors.js";

export const voiceConsentRecordSchema = z
  .object({
    id: z.string().min(1),
    subjectName: z.string().min(1).max(500),
    evidenceArtifactId: z.string().min(1),
    evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    syntheticSpeechAllowed: z.boolean(),
    commercialUseAllowed: z.boolean(),
    multilingualUseAllowed: z.boolean(),
    permittedChannels: z.array(z.string().min(1)).min(1),
    validFrom: z.coerce.date(),
    validUntil: z.coerce.date().optional(),
    revokedAt: z.coerce.date().optional(),
  })
  .strict();
export type VoiceConsentRecord = z.infer<typeof voiceConsentRecordSchema>;

export function assertSpeechConsent(input: {
  readonly profile: ResolvedSpeechProfile;
  readonly consent?: VoiceConsentRecord;
  readonly channel: string;
  readonly now?: Date;
}): void {
  if (input.profile.configuration.provider !== "elevenlabs") return;
  const consent = input.consent;
  if (!consent)
    throw new SpeechDomainError(
      "SPEECH_CONSENT_MISSING",
      "An active consent record is required for cloned-voice synthesis."
    );
  const now = input.now ?? new Date();
  if (consent.revokedAt && consent.revokedAt <= now)
    throw new SpeechDomainError(
      "SPEECH_CONSENT_REVOKED",
      "Cloned-voice consent has been revoked."
    );
  if (
    consent.validFrom > now ||
    (consent.validUntil && consent.validUntil < now)
  )
    throw new SpeechDomainError(
      "SPEECH_CONSENT_EXPIRED",
      "Cloned-voice consent is not valid at this time."
    );
  if (
    !consent.syntheticSpeechAllowed ||
    !consent.commercialUseAllowed ||
    !consent.multilingualUseAllowed ||
    !consent.permittedChannels.includes(input.channel)
  )
    throw new SpeechDomainError(
      "SPEECH_CONSENT_MISSING",
      "Consent does not cover this synthesis request."
    );
}
