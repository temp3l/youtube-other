/**
 * Provider-neutral, server-renderable administration views. Data is supplied by
 * the application/API layer; this module deliberately knows nothing about keys
 * or provider transport details.
 */
export type SpeechProviderBadge = "openai" | "elevenlabs" | "other";
export type SpeechGenerationState =
  | "QUEUED"
  | "PREFLIGHT"
  | "GENERATING"
  | "POST_PROCESSING"
  | "SUCCEEDED"
  | "RETRYABLE_FAILURE"
  | "BLOCKED_QUOTA"
  | "BLOCKED_CONFIGURATION"
  | "BLOCKED_CONSENT"
  | "FAILED_PERMANENT"
  | "CANCELLED";

export type SpeechViewStatus =
  | "ready"
  | "loading"
  | "empty"
  | "error"
  | "disabled";

export interface SpeechProfileSummary {
  readonly versionId: string;
  readonly displayName: string;
  readonly provider: SpeechProviderBadge;
  readonly version: number;
  readonly supportedLanguages: readonly string[];
  readonly consentStatus:
    | "valid"
    | "missing"
    | "expired"
    | "revoked"
    | "not-required";
}

export interface SpeechQuotaSummary {
  readonly monthlyLimitLabel: string;
  readonly currentUsageLabel: string;
  readonly warning: boolean;
}

export interface GenreSpeechSettingsViewModel {
  readonly status: SpeechViewStatus;
  readonly genreName: string;
  readonly defaultProfile?: SpeechProfileSummary;
  readonly availableProfiles: readonly SpeechProfileSummary[];
  readonly quota?: SpeechQuotaSummary;
  readonly profileHistory: readonly SpeechProfileSummary[];
  readonly message?: string;
  readonly actionsDisabled?: boolean;
}

export interface VideoSpeechGenerationViewModel {
  readonly status: SpeechViewStatus;
  readonly videoTitle: string;
  readonly useGenreDefault: boolean;
  readonly overrideProfile?: SpeechProfileSummary;
  readonly resolvedProfile?: SpeechProfileSummary;
  readonly estimate?: {
    readonly characters: number;
    readonly costLabel: string;
    readonly cacheHitExpected: boolean;
  };
  readonly quotaImpactLabel?: string;
  readonly generation?: {
    readonly id: string;
    readonly state: SpeechGenerationState;
    readonly failureReason?: string;
    readonly artifactStatus: "pending" | "available" | "unavailable";
  };
  readonly message?: string;
  readonly actionsDisabled?: boolean;
}

export function renderGenreSpeechSettings(
  model: GenreSpeechSettingsViewModel
): string {
  const content = statusContent(model.status, model.message, () => {
    const profile = model.defaultProfile;
    const profileDetails = profile
      ? `<p>Default: ${profileLabel(profile)} ${providerBadge(profile.provider)} ${consentBadge(profile.consentStatus)}</p>`
      : "<p>No default profile is configured.</p>";
    const selector =
      model.availableProfiles.length === 0
        ? "<p>No active profiles are available.</p>"
        : `<label for="genre-speech-profile">Default voice profile</label><select id="genre-speech-profile" name="voiceProfileVersionId" ${disabled(model.actionsDisabled)}>${model.availableProfiles.map(profileOption).join("")}</select>`;
    const quota = model.quota
      ? `<p${model.quota.warning ? ' role="status"' : ""}>Monthly quota: ${e(model.quota.currentUsageLabel)} of ${e(model.quota.monthlyLimitLabel)}${model.quota.warning ? " (warning threshold reached)" : ""}</p>`
      : "";
    const history =
      model.profileHistory.length === 0
        ? "<p>No profile-version history.</p>"
        : `<ul>${model.profileHistory.map((item) => `<li>${profileLabel(item)} ${providerBadge(item.provider)}</li>`).join("")}</ul>`;
    return `${profileDetails}<p>Supported languages: ${profile ? e(profile.supportedLanguages.join(", ") || "Not declared") : "Not available"}</p>${quota}${selector}<p role="note">Changing the genre default affects future generations only. Confirm the active version and consent before saving.</p><button type="button" ${disabled(model.actionsDisabled || !profile)}>Preview generation</button><h3>Profile-version history</h3>${history}`;
  });
  return `<section aria-labelledby="genre-speech-heading"><h2 id="genre-speech-heading">Speech settings — ${e(model.genreName)}</h2>${content}</section>`;
}

export function renderVideoSpeechSettings(
  model: VideoSpeechGenerationViewModel
): string {
  const content = statusContent(model.status, model.message, () => {
    const resolved = model.resolvedProfile;
    const override = model.overrideProfile;
    const estimate = model.estimate
      ? `<p>Estimate: ${model.estimate.characters.toLocaleString("en-US")} characters, ${e(model.estimate.costLabel)}. ${model.estimate.cacheHitExpected ? "A cached canonical master is expected." : "A provider call may be required."}</p>`
      : "<p>Estimate unavailable.</p>";
    const generation = model.generation
      ? generationDetails(model.generation)
      : "<p>No speech generation has been requested.</p>";
    return `<fieldset ${disabled(model.actionsDisabled)}><legend>Voice profile selection</legend><label><input type="radio" name="speech-profile-source" value="genre-default" ${model.useGenreDefault ? "checked" : ""}> Use genre default</label><label><input type="radio" name="speech-profile-source" value="override" ${model.useGenreDefault ? "" : "checked"}> Explicit profile override</label></fieldset><p>Override: ${override ? profileLabel(override) : "None"}</p><p>Resolved effective profile: ${resolved ? `${profileLabel(resolved)} ${providerBadge(resolved.provider)} ${consentBadge(resolved.consentStatus)}` : "None"}</p>${estimate}<p>Quota impact: ${e(model.quotaImpactLabel ?? "Not available")}</p>${generation}<button type="button" ${disabled(model.actionsDisabled || !resolved)}>Generate speech</button> <button type="button" ${disabled(model.actionsDisabled || !canRetry(model.generation?.state))}>Retry</button> <button type="button" ${disabled(model.actionsDisabled || !resolved)}>Use replacement profile</button>`;
  });
  return `<section aria-labelledby="video-speech-heading"><h2 id="video-speech-heading">Speech generation — ${e(model.videoTitle)}</h2>${content}</section>`;
}

function statusContent(
  status: SpeechViewStatus,
  message: string | undefined,
  ready: () => string
): string {
  if (status === "ready") return ready();
  const defaultMessage: Record<Exclude<SpeechViewStatus, "ready">, string> = {
    loading: "Loading speech settings…",
    empty: "No speech configuration is available.",
    error: "Speech settings could not be loaded.",
    disabled: "Speech generation is disabled by configuration.",
  };
  return `<p role="${status === "error" ? "alert" : "status"}">${e(message ?? defaultMessage[status])}</p>`;
}

function generationDetails(
  generation: NonNullable<VideoSpeechGenerationViewModel["generation"]>
): string {
  const blocked = generation.state.startsWith("BLOCKED_");
  const failure = generation.failureReason
    ? `<p role="${blocked ? "alert" : "status"}">Reason: ${e(generation.failureReason)}</p>`
    : "";
  return `<p aria-live="polite">Generation ${e(generation.id)}: ${e(generation.state)}</p>${failure}<p>Artifacts: ${e(generation.artifactStatus)}</p>`;
}

function profileOption(profile: SpeechProfileSummary): string {
  return `<option value="${e(profile.versionId)}">${profileLabel(profile)} (${e(profile.provider)})</option>`;
}

function profileLabel(profile: SpeechProfileSummary): string {
  return `${e(profile.displayName)} v${profile.version}`;
}
function providerBadge(provider: SpeechProviderBadge): string {
  return `<span class="speech-provider-badge" data-provider="${e(provider)}">${e(provider)}</span>`;
}
function consentBadge(consent: SpeechProfileSummary["consentStatus"]): string {
  return `<span class="speech-consent" data-status="${e(consent)}">Consent: ${e(consent)}</span>`;
}
function canRetry(state: SpeechGenerationState | undefined): boolean {
  return state === "RETRYABLE_FAILURE";
}
function disabled(value: boolean | undefined): string {
  return value ? "disabled" : "";
}
function e(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character
  );
}
