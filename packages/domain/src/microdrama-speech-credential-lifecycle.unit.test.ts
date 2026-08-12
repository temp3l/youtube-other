import { describe, expect, it } from "vitest";

import { evaluateMicrodramaSpeechCredentialAdmission } from "./microdrama-speech-credential-lifecycle.js";

describe("microdrama speech credential admission", () => {
  it("fails closed when credential handle is missing", () => {
    const result = evaluateMicrodramaSpeechCredentialAdmission({
      credential: undefined,
      provider: "openai",
      now: "2026-08-12T06:00:00.000Z",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("speech_credential_missing");
  });

  it("accepts active provider-bound credential metadata", () => {
    const result = evaluateMicrodramaSpeechCredentialAdmission({
      credential: {
        schemaVersion: "mediaforge.microdrama-speech-credential.v1",
        credentialHandle: "speech-cred.openai.microdrama.001",
        provider: "openai",
        principalId: "operator.canary",
        state: "active",
        registeredAt: "2026-08-12T05:00:00.000Z",
      },
      provider: "openai",
      now: "2026-08-12T06:00:00.000Z",
    });
    expect(result.allowed).toBe(true);
  });
});
