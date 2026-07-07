import { describe, expect, it } from "vitest";
import {
  executeLocaleWorkflowStage,
  localeFailureBlocksOnlyLocale,
  resolveLocaleWorkflowBranch,
} from "./story-workflow-locales.js";
import { buildPlannedStoryWorkflowManifest } from "./story-workflow-planner.js";
import { buildStoryWorkflowStatusReport } from "./story-workflow-status.js";
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

  it("persists same-locale fallback without corrupting another locale", async () => {
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "009-the-christmas-doll",
      locales: ["en", "de", "es"],
      formats: ["full"],
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    const es = resolveLocaleWorkflowBranch({
      locale: "es",
      canonicalFingerprint: "canon",
      fallbackCandidates: [
        { artifact: artifact("es"), canonicalFingerprint: "canon", qualityPassed: true },
      ],
    });
    const withEs = await executeLocaleWorkflowStage({
      context: { manifest },
      result: es,
    });
    const de = resolveLocaleWorkflowBranch({
      locale: "de",
      canonicalFingerprint: "canon",
      fallbackCandidates: [],
    });
    const withDe = await executeLocaleWorkflowStage({
      context: { manifest: withEs.manifest },
      result: de,
    });
    const status = buildStoryWorkflowStatusReport(withDe.manifest);

    expect(status.fallbacks[0]?.locale).toBe("es");
    expect(status.fallbacks[0]?.provenance).toBe("localized-fallback");
    expect(
      withDe.manifest.stages.find(
        (stage) => stage.stageId === "stage:localize-full:es:full"
      )?.status
    ).toBe("succeeded");
    expect(
      withDe.manifest.stages.find(
        (stage) => stage.stageId === "stage:localize-full:de:full"
      )?.status
    ).toBe("blocked");
  });
});
