import { describe, expect, it } from "vitest";
import { buildPlannedStoryWorkflowManifest } from "./story-workflow-planner.js";
import {
  canUseEnglishSourceFallback,
  evaluateEnglishSourceFallback,
  executeEnglishRewriteStage,
} from "./story-workflow-english.js";
import { adaptStoryProductionQualityGate } from "./story-workflow-quality.js";
import { type ArtifactLineage, type StageFailure } from "./story-workflow.types.js";

function artifact(provenance: ArtifactLineage["provenance"] = "generated"): ArtifactLineage {
  return {
    artifactId: "artifact:009-the-christmas-doll:en:full:narration:deadbeef" as ArtifactLineage["artifactId"],
    artifactType: "canonical-story-package",
    owner: "narration",
    locale: "en",
    format: "full",
    provenance,
    path: "en/full/script.md",
    fingerprint: "a".repeat(64),
    schemaVersion: "canonical-story-package-v1",
    parents: [],
    sourceStageId: "stage:rewrite-full:en:full" as ArtifactLineage["sourceStageId"],
  };
}

function failure(category: StageFailure["category"]): StageFailure {
  return {
    schemaVersion: "stage-failure-v1",
    category,
    retryability: "retryable",
    message: "Provider failed.",
    occurredAt: "2026-07-01T00:00:00.000Z",
  };
}

describe("story workflow English rewrite stage", () => {
  it("records successful rewrite outcome", async () => {
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "009-the-christmas-doll",
      locales: ["en"],
      formats: ["full"],
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    const result = await executeEnglishRewriteStage({
      context: { manifest },
      run: async () => ({ artifact: artifact() }),
    });
    expect(result.outcome.status).toBe("succeeded");
    expect(result.manifest.attemptHistory).toHaveLength(1);
    expect(result.manifest.artifacts[0]?.provenance).toBe("generated");
  });

  it("records provider failure without treating it as quality failure", async () => {
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "009-the-christmas-doll",
      locales: ["en"],
      formats: ["full"],
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    const result = await executeEnglishRewriteStage({
      context: { manifest },
      run: async () => {
        throw new Error("Provider timeout");
      },
    });
    expect(result.outcome.status).toBe("failed");
    if (result.outcome.status === "failed") {
      expect(result.outcome.failure.category).toBe("rewrite-timeout");
      expect(canUseEnglishSourceFallback(result.outcome.failure)).toBe(true);
    }
  });

  it("accepts source fallback for provider failure with passing validation and quality", () => {
    const result = evaluateEnglishSourceFallback({
      rewriteFailure: failure("rewrite-provider-failure"),
      sourceArtifact: artifact("source"),
      validationPassed: true,
      qualityDecision: adaptStoryProductionQualityGate({
        verdict: "READY",
        deterministicValidationStatus: "passed",
      }),
    });
    expect(result.accepted).toBe(true);
    expect(result.artifact?.provenance).toBe("source-fallback");
    expect(result.warning?.code).toBe("source-fallback-accepted");
  });

  it("rejects source fallback for generated story quality failures", () => {
    const result = evaluateEnglishSourceFallback({
      rewriteFailure: failure("rewrite-quality-gate-failed"),
      sourceArtifact: artifact("source"),
      validationPassed: true,
      qualityDecision: adaptStoryProductionQualityGate({
        verdict: "READY",
        deterministicValidationStatus: "passed",
      }),
    });
    expect(result.accepted).toBe(false);
    expect(result.failure?.category).toBe("source-fallback-rejected");
  });
});
