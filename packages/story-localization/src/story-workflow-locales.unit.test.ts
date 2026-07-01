import { describe, expect, it } from "vitest";
import {
  localeFailureBlocksOnlyLocale,
  resolveLocaleWorkflowBranch,
} from "./story-workflow-locales.js";
import { type ArtifactLineage } from "./story-workflow.types.js";

function artifact(locale: "en" | "de" | "es" | "fr" | "pt"): ArtifactLineage {
  return {
    artifactId: `artifact:009-the-christmas-doll:${locale}:full:narration:deadbeef` as ArtifactLineage["artifactId"],
    artifactType: "localized-story-package",
    owner: "narration",
    locale,
    format: "full",
    provenance: "generated",
    path: `${locale}/full/script.md`,
    fingerprint: "a".repeat(64),
    schemaVersion: "localized-story-package-v1",
    parents: [],
    sourceStageId: `stage:localize-full:${locale}:full` as ArtifactLineage["sourceStageId"],
  };
}

describe("story workflow locale branches", () => {
  it("accepts generated localized artifacts", () => {
    const result = resolveLocaleWorkflowBranch({
      locale: "es",
      canonicalFingerprint: "canon",
      generatedArtifact: artifact("es"),
    });
    expect(result.status).toBe("accepted");
    expect(result.fallbackUsed).toBe(false);
  });

  it("uses accepted same-locale fallback only", () => {
    const result = resolveLocaleWorkflowBranch({
      locale: "es",
      canonicalFingerprint: "canon",
      fallbackCandidates: [
        { artifact: artifact("de"), canonicalFingerprint: "canon", qualityPassed: true },
        { artifact: artifact("es"), canonicalFingerprint: "canon", qualityPassed: true },
      ],
    });
    expect(result.status).toBe("fallback-accepted");
    expect(result.artifact?.provenance).toBe("localized-fallback");
  });

  it("keeps locale failures isolated", () => {
    const es = resolveLocaleWorkflowBranch({
      locale: "es",
      canonicalFingerprint: "canon",
      fallbackCandidates: [],
    });
    const de = resolveLocaleWorkflowBranch({
      locale: "de",
      canonicalFingerprint: "canon",
      generatedArtifact: artifact("de"),
    });
    expect(localeFailureBlocksOnlyLocale([es, de], "es")).toBe(true);
  });
});
