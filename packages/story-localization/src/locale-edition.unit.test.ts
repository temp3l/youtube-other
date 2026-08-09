import { describe, expect, it } from "vitest";
import {
  LOCALE_EDITION_MISSING_TRANSLATED_OVERLAY,
  planLocaleEdition,
  redactLocaleEditionFailure,
} from "./locale-edition.js";

const digest = "a".repeat(64);
const sharedInput = {
  contentProfileId: "strategic-reinvention" as const,
  episodeId: "episode-001",
  productionRevisionId: "revision-001",
  locale: "en",
  canonicalLocale: "it",
  narrationRevisionId: "narration-001",
  narrationFingerprint: digest,
  visuals: [{
    artifactId: "visual-001",
    fingerprint: "b".repeat(64),
    visualSemanticRevisionId: "visual-revision-001",
    textHandling: "none" as const,
  }],
  effectiveConfiguration: { policyVersion: "v1", localeStrategy: "text-first" },
  dependencyIdentity: { narration: digest, visualPlan: "b".repeat(64) },
  approval: { state: "review" as const },
  regenerationRationale: "new-locale-edition" as const,
};

describe("revision-bound locale editions", () => {
  it("normalizes the alias and reuses language-independent visual identities", () => {
    const first = planLocaleEdition(sharedInput);
    const second = planLocaleEdition({ ...sharedInput, previousEdition: first.edition });

    expect(first.edition.contentProfileId).toBe("veronicabenini");
    expect(first.edition.sharedVisuals[0]).toMatchObject({
      artifactId: "visual-001",
      reuseRationale: "language-independent-visual",
    });
    expect(first.edition.regeneratedVisuals).toEqual([]);
    expect(second.reused).toBe(true);
    expect(second.edition.reuseRationale).toBe("content-hash-match");
  });

  it("requires an explicit translated overlay before reusing text-bearing imagery", () => {
    expect(() => planLocaleEdition({
      ...sharedInput,
      visuals: [{ ...sharedInput.visuals[0]!, textHandling: "translated-overlay" }],
    })).toThrow(LOCALE_EDITION_MISSING_TRANSLATED_OVERLAY);
  });

  it("records only hashes for translated overlays and redacts failures", () => {
    const result = planLocaleEdition({
      ...sharedInput,
      translatedOverlays: [{
        overlayId: "overlay-001",
        sourceVisualArtifactId: "visual-001",
        sourceText: "Riservato",
        translatedText: "Confidential",
        layoutRevision: "layout-001",
      }],
      visuals: [{ ...sharedInput.visuals[0]!, textHandling: "translated-overlay" }],
      regenerationRationale: "translated-overlay-changed",
    });
    const overlay = result.edition.translatedOverlays[0]!;

    expect(overlay.translatedTextFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(result.edition)).not.toContain("Confidential");
    expect(redactLocaleEditionFailure(new Error("source body must not leak"))).toEqual({
      code: "LOCALE_EDITION_INVALID",
      message: "Locale edition planning was blocked; inspect revision, overlay, and visual lineage identifiers.",
    });
  });
});
