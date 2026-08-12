import { describe, expect, it } from "vitest";

import {
  MicrodramaArtifactTrustError,
  validateArtifactReferenceForRegistration,
} from "./microdrama-artifact-trust.js";

const artifactRoot = "/var/microdrama/artifacts";
const validHash = "c".repeat(64);

describe("microdrama artifact trust registration gate", () => {
  it("blocks malformed artifact identity before repository registration", () => {
    expect(() =>
      validateArtifactReferenceForRegistration({
        correlationId: "corr.register",
        evaluatedAt: "2026-08-12T00:00:00.000Z",
        artifactRoot,
        artifactHash: "bad",
        mimeType: "video/mp4",
        byteSize: 100,
        storageUri: "renders/aa/render.mp4",
      })
    ).toThrow(MicrodramaArtifactTrustError);
  });

  it("blocks untrusted provenance that selects provider controls", () => {
    expect(() =>
      validateArtifactReferenceForRegistration({
        correlationId: "corr.register",
        evaluatedAt: "2026-08-12T00:00:00.000Z",
        artifactRoot,
        artifactHash: validHash,
        mimeType: "video/mp4",
        byteSize: 100,
        storageUri: "renders/aa/render.mp4",
        untrustedProvenance: { providerId: "tiktok-primary" },
      })
    ).toThrow(/Untrusted payload cannot select control field providerId/);
  });

  it("allows a valid artifact reference to proceed to registration", () => {
    expect(() =>
      validateArtifactReferenceForRegistration({
        correlationId: "corr.register",
        evaluatedAt: "2026-08-12T00:00:00.000Z",
        artifactRoot,
        artifactHash: validHash,
        mimeType: "video/mp4",
        byteSize: 100,
        storageUri: "renders/aa/render.mp4",
        observedContentHash: validHash,
      })
    ).not.toThrow();
  });
});
