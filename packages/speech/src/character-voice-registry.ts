import type {
  CharacterVoiceConsentRecordPayload,
  CharacterVoiceProfileVersionPayload,
  CharacterVoicePronunciationRevisionPayload,
  MicrodramaBcp47Locale,
  ResolvedCharacterVoiceProfileRecord,
} from "@mediaforge/narrative-core";
import type { ResolvedSpeechProfile } from "./platform/contracts.js";
import { SpeechDomainError } from "./platform/errors.js";

export type ResolvedCharacterVoice = {
  readonly profileId: string;
  readonly profileVersionId: string;
  readonly characterId: string;
  readonly locale: MicrodramaBcp47Locale;
  readonly provider: CharacterVoiceProfileVersionPayload["provider"];
  readonly modelIntent: string;
  readonly voiceBindingStatus: CharacterVoiceProfileVersionPayload["voiceBindingStatus"];
  readonly providerVoiceId?: string;
  readonly consentRecordId?: string;
  readonly pronunciationRevisionId?: string;
  readonly deliveryConfiguration: CharacterVoiceProfileVersionPayload["deliveryConfiguration"];
  readonly speechProfile: ResolvedSpeechProfile;
};

export interface CharacterVoiceRegistryStore {
  resolveActiveProfile(
    characterId: string,
    locale: MicrodramaBcp47Locale
  ): Promise<ResolvedCharacterVoiceProfileRecord | null>;
}

export class CharacterVoiceRegistryResolver {
  public constructor(private readonly store: CharacterVoiceRegistryStore) {}

  public async resolve(input: {
    readonly characterId: string;
    readonly locale: MicrodramaBcp47Locale;
  }): Promise<ResolvedCharacterVoice> {
    const record = await this.store.resolveActiveProfile(
      input.characterId,
      input.locale
    );
    if (!record?.activeVersion) {
      throw new SpeechDomainError(
        "SPEECH_PROFILE_NOT_FOUND",
        `No active character voice profile for ${input.characterId} in ${input.locale}.`
      );
    }

    const version = record.activeVersion;
    this.assertBindingPolicy(version);

    const speechProfile: ResolvedSpeechProfile = {
      profileId: record.profile.profileId,
      profileVersionId: version.profileVersionId,
      language: record.profile.locale,
      configuration:
        version.provider === "openai"
          ? {
              provider: "openai",
              model: version.modelIntent,
              voice: version.providerVoiceId ?? "unbound",
              instructions: version.deliveryConfiguration.instructions,
              speed: 1,
            }
          : {
              provider: "elevenlabs",
              modelId: version.modelIntent,
              voiceId: version.providerVoiceId ?? "unbound",
              settings: {
                speed: 1,
                stability: version.deliveryConfiguration.stability ?? 0.5,
                similarityBoost:
                  version.deliveryConfiguration.similarityBoost ?? 0.75,
                style: 0,
                useSpeakerBoost: true,
              },
              pronunciationDictionaryVersions: record.pronunciationRevision
                ? [record.pronunciationRevision.pronunciationRevisionId]
                : [],
              outputFormat: "pcm_44100",
              chunking: {
                targetCharacters: 900,
                hardMaximumCharacters: 1_200,
                previousContextCharacters: 200,
                nextContextCharacters: 200,
              },
            },
    };

    return {
      profileId: record.profile.profileId,
      profileVersionId: version.profileVersionId,
      characterId: record.profile.characterId,
      locale: record.profile.locale,
      provider: version.provider,
      modelIntent: version.modelIntent,
      voiceBindingStatus: version.voiceBindingStatus,
      ...(version.providerVoiceId ? { providerVoiceId: version.providerVoiceId } : {}),
      ...(version.consentRecordId ? { consentRecordId: version.consentRecordId } : {}),
      ...(version.pronunciationRevisionId
        ? { pronunciationRevisionId: version.pronunciationRevisionId }
        : {}),
      deliveryConfiguration: version.deliveryConfiguration,
      speechProfile,
    };
  }

  public async consentFor(
    resolved: ResolvedCharacterVoice
  ): Promise<CharacterVoiceConsentRecordPayload | undefined> {
    const record = await this.store.resolveActiveProfile(
      resolved.characterId,
      resolved.locale
    );
    return record?.consent ?? undefined;
  }

  public async pronunciationFor(
    resolved: ResolvedCharacterVoice
  ): Promise<CharacterVoicePronunciationRevisionPayload | undefined> {
    const record = await this.store.resolveActiveProfile(
      resolved.characterId,
      resolved.locale
    );
    return record?.pronunciationRevision ?? undefined;
  }

  private assertBindingPolicy(
    version: CharacterVoiceProfileVersionPayload
  ): void {
    if (
      version.providerVoiceId &&
      (version.voiceBindingStatus !== "CANARY_APPROVED" ||
        !version.canaryEvidenceArtifactHash)
    ) {
      throw new SpeechDomainError(
        "SPEECH_PROFILE_INVALID",
        "Provider voice binding requires approved canary evidence."
      );
    }
  }
}
