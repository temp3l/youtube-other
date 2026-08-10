import { describe, expect, it } from "vitest";
import {
  assertCreatorVoiceDispatchAllowed,
  canonicalCreatorVoiceProfileId,
  cleanCreatorSpokenPayload,
  resolveCreatorVoiceRecovery,
} from "./creator-voice-policy.js";

describe("creator voice policy", () => {
  it("normalizes the Veronica alias before policy comparison", () => {
    expect(canonicalCreatorVoiceProfileId("strategic-reinvention")).toBe("veronicabenini");
    expect(() => assertCreatorVoiceDispatchAllowed("veronicabenini", { kind: "legacy-noncreator" })).not.toThrow();
  });

  it("cleans the provider-bound spoken payload", () => {
    expect(cleanCreatorSpokenPayload("  Ciao <em>Veronica</em>\n")).toBe("Ciao Veronica");
    expect(() => cleanCreatorSpokenPayload("<br>\u0000")).toThrow("non-empty");
  });

  it("uses only supplied-media recovery and never selects a synthetic fallback", () => {
    expect(
      resolveCreatorVoiceRecovery({
        profileId: "strategic-reinvention",
        failureClass: "retryable",
      })
    ).toEqual({ kind: "retry-supplied-media", reason: "retryable" });
    expect(
      resolveCreatorVoiceRecovery({
        profileId: "veronicabenini",
        failureClass: "uncertain",
      })
    ).toEqual({ kind: "reconcile-supplied-media", reason: "uncertain" });
    expect(
      resolveCreatorVoiceRecovery({
        profileId: "veronicabenini",
        failureClass: "permanent",
      })
    ).toEqual({ kind: "manual-source-replacement", reason: "permanent" });
  });

  it("allows only an exact, current, independently reviewed synthetic authorization", () => {
    const authorization = {
      schemaVersion: "veronicabenini.synthetic-narration-authorization.v1" as const,
      authorizationId: "authorization-001",
      contentProfileId: "veronicabenini" as const,
      creatorProfileId: "veronica-benini" as const,
      unitId: "episode-001",
      locale: "de",
      variant: "short" as const,
      provider: "openai-compatible" as const,
      voiceId: "onyx",
      syntheticNarrationAllowed: true as const,
      commercialUseAllowed: true as const,
      grantedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
      approvedBy: [
        { actor: "creator@example.test", role: "creator" as const },
        { actor: "reviewer@example.test", role: "independent-reviewer" as const },
      ],
    };
    const context = {
      kind: "creator-authorized-synthetic" as const,
      profileId: "veronicabenini" as const,
      unitId: "episode-001",
      locale: "de",
      variant: "short" as const,
      provider: "openai-compatible" as const,
      voiceId: "onyx",
      authorizationSha256: "a".repeat(64),
      authorization,
    };
    expect(() => assertCreatorVoiceDispatchAllowed("veronicabenini", context)).not.toThrow();
    expect(() =>
      assertCreatorVoiceDispatchAllowed("veronicabenini", {
        ...context,
        locale: "it",
      }),
    ).toThrow("exact production coordinate");
  });
});
