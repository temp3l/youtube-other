import type { ResolvedSpeechProfile } from "./contracts.js";
import type { VoiceConsentRecord } from "./consent.js";
import { SpeechDomainError } from "./errors.js";
import type { SpeechProfileResolver } from "./service.js";

export interface SpeechProfileVersionRecord {
  readonly profile: ResolvedSpeechProfile;
  readonly status: "DRAFT" | "ACTIVE" | "DEPRECATED";
  readonly consentRecordId?: string;
}

/** Deterministic conformance resolver for adapters and focused tests. */
export class VersionedSpeechProfileResolver implements SpeechProfileResolver {
  public constructor(
    private readonly input: {
      readonly versions: ReadonlyMap<string, SpeechProfileVersionRecord>;
      readonly videoOverrides: ReadonlyMap<string, string>;
      readonly genreDefaults: ReadonlyMap<string, string>;
      readonly systemDefaultProfileVersionId: string;
      readonly consents?: ReadonlyMap<string, VoiceConsentRecord>;
    }
  ) {}

  public async resolve(request: {
    readonly workspaceId: string;
    readonly videoId?: string;
    readonly genreId?: string;
    readonly language: string;
    readonly replacementProfileVersionId?: string;
  }): Promise<ResolvedSpeechProfile> {
    const versionId =
      request.replacementProfileVersionId ??
      (request.videoId
        ? this.input.videoOverrides.get(request.videoId)
        : undefined) ??
      (request.genreId
        ? this.input.genreDefaults.get(request.genreId)
        : undefined) ??
      this.input.systemDefaultProfileVersionId;
    const record = this.input.versions.get(versionId);
    if (!record)
      throw new SpeechDomainError(
        "SPEECH_PROFILE_NOT_FOUND",
        "The resolved speech profile version was not found."
      );
    if (record.status !== "ACTIVE")
      throw new SpeechDomainError(
        "SPEECH_PROFILE_VERSION_INACTIVE",
        "The resolved speech profile version is not active."
      );
    return { ...record.profile, language: request.language };
  }

  public async consentFor(
    profile: ResolvedSpeechProfile
  ): Promise<VoiceConsentRecord | undefined> {
    const record = this.input.versions.get(profile.profileVersionId);
    const consentId = record?.consentRecordId;
    return consentId ? this.input.consents?.get(consentId) : undefined;
  }
}
