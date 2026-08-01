import { assertSpeechConsent, type VoiceConsentRecord } from "./consent.js";
import type { ResolvedSpeechProfile } from "./contracts.js";
import { SpeechDomainError } from "./errors.js";
import { SpeechProviderRegistry } from "./registry.js";

export interface VoiceProfileVersionAdministrationRecord {
  readonly profile: ResolvedSpeechProfile;
  readonly status: "DRAFT" | "ACTIVE" | "DEPRECATED";
  readonly consent?: VoiceConsentRecord;
}

export interface SpeechProfileAdministrationStore {
  getVersion(
    workspaceId: string,
    profileVersionId: string
  ): Promise<VoiceProfileVersionAdministrationRecord | null>;
  activateVersion(input: {
    readonly workspaceId: string;
    readonly profileVersionId: string;
    readonly expectedRevision: number;
    readonly activatedAt: string;
    readonly actorId: string;
  }): Promise<void>;
  setGenreDefault(input: {
    readonly workspaceId: string;
    readonly genreId: string;
    readonly profileVersionId: string;
    readonly expectedRevision: number;
    readonly actorId: string;
  }): Promise<void>;
}

export interface ListeningTestApprovalStore {
  approved(workspaceId: string, profileVersionId: string): Promise<boolean>;
}

/** Owns activation/default invariants; provider adapters remain mutation-free. */
export class SpeechProfileAdministrationService {
  public constructor(
    private readonly input: {
      readonly providers: SpeechProviderRegistry;
      readonly profiles: SpeechProfileAdministrationStore;
      readonly listeningTests: ListeningTestApprovalStore;
      readonly channel: string;
      readonly now?: () => Date;
    }
  ) {}

  public async activateVersion(command: {
    readonly workspaceId: string;
    readonly profileVersionId: string;
    readonly expectedRevision: number;
    readonly actorId: string;
  }): Promise<void> {
    const record = await this.required(
      command.workspaceId,
      command.profileVersionId
    );
    if (record.status !== "DRAFT")
      throw new SpeechDomainError(
        "SPEECH_PROFILE_INVALID",
        "Only a draft speech profile version can be activated."
      );
    const provider = this.input.providers.get(
      record.profile.configuration.provider
    );
    await provider.validateProfile(record.profile);
    if (
      !(await this.input.listeningTests.approved(
        command.workspaceId,
        command.profileVersionId
      ))
    ) {
      throw new SpeechDomainError(
        "SPEECH_PROFILE_INVALID",
        "A listening-test approval is required before activating a speech profile version."
      );
    }
    assertSpeechConsent({
      profile: record.profile,
      ...(record.consent ? { consent: record.consent } : {}),
      channel: this.input.channel,
      now: this.now(),
    });
    await this.input.profiles.activateVersion({
      ...command,
      activatedAt: this.now().toISOString(),
    });
  }

  public async setGenreDefault(command: {
    readonly workspaceId: string;
    readonly genreId: string;
    readonly profileVersionId: string;
    readonly expectedRevision: number;
    readonly actorId: string;
  }): Promise<void> {
    const record = await this.required(
      command.workspaceId,
      command.profileVersionId
    );
    if (record.status !== "ACTIVE")
      throw new SpeechDomainError(
        "SPEECH_PROFILE_VERSION_INACTIVE",
        "A genre default must reference an active profile version."
      );
    if (
      !(await this.input.listeningTests.approved(
        command.workspaceId,
        command.profileVersionId
      ))
    ) {
      throw new SpeechDomainError(
        "SPEECH_PROFILE_INVALID",
        "A listening-test approval is required before changing a genre default."
      );
    }
    assertSpeechConsent({
      profile: record.profile,
      ...(record.consent ? { consent: record.consent } : {}),
      channel: this.input.channel,
      now: this.now(),
    });
    await this.input.profiles.setGenreDefault(command);
  }

  private now(): Date {
    return this.input.now?.() ?? new Date();
  }
  private async required(
    workspaceId: string,
    versionId: string
  ): Promise<VoiceProfileVersionAdministrationRecord> {
    const record = await this.input.profiles.getVersion(workspaceId, versionId);
    if (!record)
      throw new SpeechDomainError(
        "SPEECH_PROFILE_NOT_FOUND",
        "Speech profile version was not found."
      );
    return record;
  }
}
