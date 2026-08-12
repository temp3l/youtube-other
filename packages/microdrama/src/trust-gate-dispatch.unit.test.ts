import { describe, expect, it } from "vitest";

import {
  assertDispatchTrustGateAllowed,
  evaluateMediaDispatchTrustGate,
  evaluatePublicationDispatchTrustGate,
} from "./trust-gate-dispatch.js";

const validHash = "d".repeat(64);
const artifactRoot = "/var/microdrama/artifacts";

describe("microdrama trust gate dispatch", () => {
  it("blocks media dispatch when untrusted payload selects a provider", () => {
    const result = evaluateMediaDispatchTrustGate({
      correlationId: "corr.media",
      evaluatedAt: "2026-08-12T00:00:00.000Z",
      untrustedPayload: {
        script: "Scene narration.",
        providerId: "elevenlabs",
      },
      artifact: {
        identity: {
          artifactHash: validHash,
          mimeType: "audio/mpeg",
          byteSize: 4096,
          storageUri: "audio/aa/track.mp3",
        },
        artifactRoot,
        observedContentHash: validHash,
      },
    });
    expect(result.decision.allowed).toBe(false);
    expect(result.auditRecord.correlationId).toBe("corr.media");
    expect(result.auditRecord.issueCodes).toContain("untrusted_control_field");
  });

  it("blocks publication dispatch for malformed artifact identity before provider dispatch", () => {
    const result = evaluatePublicationDispatchTrustGate({
      correlationId: "corr.publication",
      evaluatedAt: "2026-08-12T00:00:00.000Z",
      artifact: {
        identity: {
          artifactHash: "bad-hash",
          mimeType: "video/mp4",
          byteSize: 100,
          storageUri: "../escape/render.mp4",
        },
        artifactRoot,
      },
    });
    expect(result.decision.allowed).toBe(false);
    expect(result.auditRecord.gate).toBe("publication_dispatch");
    expect(() => assertDispatchTrustGateAllowed(result)).toThrow(/invalid_artifact_hash|storage_uri_escape/);
  });

  it("allows a fully validated media dispatch and preserves correlation in audit output", () => {
    const result = evaluateMediaDispatchTrustGate({
      correlationId: "corr.media.ok",
      evaluatedAt: "2026-08-12T00:00:00.000Z",
      untrustedPayload: { script: "Safe narration." },
      artifact: {
        identity: {
          artifactHash: validHash,
          mimeType: "video/mp4",
          byteSize: 8192,
          storageUri: "renders/aa/render.mp4",
        },
        artifactRoot,
        observedContentHash: validHash,
      },
    });
    expect(result.decision.allowed).toBe(true);
    expect(result.auditRecord.correlationId).toBe("corr.media.ok");
    expect(() => assertDispatchTrustGateAllowed(result)).not.toThrow();
  });
});
