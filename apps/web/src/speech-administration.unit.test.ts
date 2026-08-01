import { describe, expect, it } from "vitest";
import {
  renderGenreSpeechSettings,
  renderVideoSpeechSettings,
} from "./speech-administration.js";

const profile = {
  versionId: "vpv_123",
  displayName: "Narration main",
  provider: "elevenlabs" as const,
  version: 2,
  supportedLanguages: ["en", "de"],
  consentStatus: "valid" as const,
};

describe("speech administration views", () => {
  it("displays the resolved video profile, estimate, cache expectation, and artifact status", () => {
    const html = renderVideoSpeechSettings({
      status: "ready",
      videoTitle: "Episode one",
      useGenreDefault: true,
      resolvedProfile: profile,
      estimate: {
        characters: 1200,
        costLabel: "$0.20",
        cacheHitExpected: true,
      },
      quotaImpactLabel: "$0.20 reserved",
      generation: {
        id: "spg_1",
        state: "SUCCEEDED",
        artifactStatus: "available",
      },
    });
    expect(html).toContain("Use genre default");
    expect(html).toContain("Resolved effective profile: Narration main v2");
    expect(html).toContain("elevenlabs");
    expect(html).toContain("A cached canonical master is expected.");
    expect(html).toContain("Artifacts: available");
  });

  it("makes blocked consent visible and prevents retry", () => {
    const html = renderVideoSpeechSettings({
      status: "ready",
      videoTitle: "Episode one",
      useGenreDefault: false,
      overrideProfile: profile,
      resolvedProfile: profile,
      generation: {
        id: "spg_2",
        state: "BLOCKED_CONSENT",
        failureReason: "Consent has expired.",
        artifactStatus: "unavailable",
      },
    });
    expect(html).toContain('role="alert">Reason: Consent has expired.');
    expect(html).toContain("Generation spg_2: BLOCKED_CONSENT");
    expect(html).toMatch(/<button type="button" disabled>Retry<\/button>/);
  });

  it("renders genre profile warning and accessible empty state", () => {
    const ready = renderGenreSpeechSettings({
      status: "ready",
      genreName: "Documentary",
      defaultProfile: profile,
      availableProfiles: [profile],
      quota: {
        currentUsageLabel: "$85",
        monthlyLimitLabel: "$100",
        warning: true,
      },
      profileHistory: [profile],
    });
    const empty = renderGenreSpeechSettings({
      status: "empty",
      genreName: "Documentary",
      availableProfiles: [],
      profileHistory: [],
    });
    expect(ready).toContain("warning threshold reached");
    expect(ready).toContain(
      "Changing the genre default affects future generations only"
    );
    expect(empty).toContain('role="status"');
  });
});
