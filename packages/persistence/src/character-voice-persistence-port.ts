import type {
  CharacterVoiceConsentRecordPayload,
  CharacterVoiceProfileId,
  CharacterVoiceProfilePayload,
  CharacterVoiceProfileVersionId,
  CharacterVoiceProfileVersionPayload,
  CharacterVoicePronunciationRevisionId,
  CharacterVoicePronunciationRevisionPayload,
  MicrodramaBcp47Locale,
} from "@mediaforge/narrative-core";

export type RegisterCharacterVoiceProfileInput = {
  readonly payload: CharacterVoiceProfilePayload;
  readonly createdAt: string;
};

export type RegisterCharacterVoiceConsentRecordInput = {
  readonly payload: CharacterVoiceConsentRecordPayload;
  readonly recordedAt: string;
};

export type AppendCharacterVoiceProfileVersionInput = {
  readonly payload: CharacterVoiceProfileVersionPayload;
  readonly createdAt: string;
};

export type AppendCharacterVoicePronunciationRevisionInput = {
  readonly payload: CharacterVoicePronunciationRevisionPayload;
  readonly createdAt: string;
};

export type ActivateCharacterVoiceProfileVersionInput = {
  readonly profileVersionId: CharacterVoiceProfileVersionId;
  readonly expectedRevision: number;
  readonly activatedAt: string;
};

export type {
  ResolvedCharacterVoiceProfileRecord,
} from "@mediaforge/narrative-core";

export interface CharacterVoiceRegistryPersistencePort {
  migrate(): void;
  registerProfile(input: RegisterCharacterVoiceProfileInput): CharacterVoiceProfilePayload;
  registerConsentRecord(
    input: RegisterCharacterVoiceConsentRecordInput
  ): CharacterVoiceConsentRecordPayload;
  appendProfileVersion(
    input: AppendCharacterVoiceProfileVersionInput
  ): CharacterVoiceProfileVersionPayload;
  appendPronunciationRevision(
    input: AppendCharacterVoicePronunciationRevisionInput
  ): CharacterVoicePronunciationRevisionPayload;
  activateProfileVersion(
    input: ActivateCharacterVoiceProfileVersionInput
  ): CharacterVoiceProfileVersionPayload;
  getProfile(profileId: CharacterVoiceProfileId): CharacterVoiceProfilePayload | null;
  getProfileVersion(
    profileVersionId: CharacterVoiceProfileVersionId
  ): CharacterVoiceProfileVersionPayload | null;
  resolveActiveProfile(
    characterId: string,
    locale: MicrodramaBcp47Locale
  ): ResolvedCharacterVoiceProfileRecord | null;
}

export class CharacterVoiceProfileVersionImmutableError extends Error {
  public override readonly name = "CharacterVoiceProfileVersionImmutableError";
}

export class CharacterVoiceConcurrencyError extends Error {
  public override readonly name = "CharacterVoiceConcurrencyError";
}

export class CharacterVoiceDuplicateVersionError extends Error {
  public override readonly name = "CharacterVoiceDuplicateVersionError";
}
