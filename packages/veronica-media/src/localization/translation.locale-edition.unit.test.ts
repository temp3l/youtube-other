import { describe, expect, it } from "vitest";
import { planVeronicaLocaleEdition } from "./translation.js";

describe("Veronica locale-edition adapter", () => {
  it("persists only the canonical Veronica identity", () => {
    const result = planVeronicaLocaleEdition({
      episodeId: "episode-001",
      productionRevisionId: "revision-001",
      locale: "en",
      canonicalLocale: "it",
      narrationRevisionId: "narration-001",
      narrationFingerprint: "a".repeat(64),
      visuals: [{
        artifactId: "visual-001",
        fingerprint: "b".repeat(64),
        visualSemanticRevisionId: "visual-revision-001",
        textHandling: "none",
      }],
      effectiveConfiguration: { policyVersion: "v1" },
      dependencyIdentity: { narration: "a".repeat(64) },
      approval: { state: "draft" },
      regenerationRationale: "new-locale-edition",
    });

    expect(result.edition.contentProfileId).toBe("veronicabenini");
  });
});
