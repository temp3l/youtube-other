import { describe, expect, it } from "vitest";
import {
  adaptStoryProductionQualityGate,
  executeQualityGateStage,
  qualityDecisionToFailure,
} from "./story-workflow-quality.js";
import { buildPlannedStoryWorkflowManifest } from "./story-workflow-planner.js";
import { type StoryProductionAnalysisVerdict } from "./story-production-analysis.js";
import { type ArtifactLineage } from "./story-workflow.types.js";

function analysisArtifact(stageId = "stage:quality-full:en:full"): ArtifactLineage {
  return {
    artifactId: "artifact:009-the-christmas-doll:en:full:analysis:deadbeef" as ArtifactLineage["artifactId"],
    artifactType: "story-production-analysis",
    owner: "analysis",
    locale: "en",
    format: "full",
    provenance: "generated",
    path: "en/full/analysis.json",
    fingerprint: "c".repeat(64),
    schemaVersion: "story-production-analysis-v1",
    parents: [],
    sourceStageId: stageId as ArtifactLineage["sourceStageId"],
  };
}

describe("story workflow quality adapter", () => {
  it.each([
    ["READY", true],
    ["READY_WITH_MINOR_EDITS", true],
    ["REVISION_REQUIRED", false],
    ["REWRITE_REQUIRED", false],
    ["BLOCKED", false],
  ] as const)("maps %s to pass=%s", (verdict, pass) => {
    const decision = adaptStoryProductionQualityGate({
      verdict: verdict as StoryProductionAnalysisVerdict,
      deterministicValidationStatus: "passed",
    });
    expect(decision.pass).toBe(pass);
    expect(decision.status).toBe(verdict);
  });

  it("lets deterministic validation failure take precedence", () => {
    const decision = adaptStoryProductionQualityGate({
      verdict: "READY",
      deterministicValidationStatus: "failed",
    });
    expect(decision.pass).toBe(false);
    expect(decision.failedChecks).toContain("deterministic-validation");
  });

  it("turns a blocking quality decision into a typed failure", () => {
    const decision = adaptStoryProductionQualityGate({
      verdict: "REWRITE_REQUIRED",
      deterministicValidationStatus: "passed",
      failedChecks: ["overall-score"],
    });
    const failure = qualityDecisionToFailure({
      decision,
      category: "rewrite-quality-gate-failed",
    });
    expect(failure?.category).toBe("rewrite-quality-gate-failed");
    expect(failure?.retryability).toBe("retry-after-change");
  });

  it("persists a passing full quality gate decision", async () => {
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "009-the-christmas-doll",
      locales: ["en"],
      formats: ["full"],
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    const decision = adaptStoryProductionQualityGate({
      verdict: "READY_WITH_MINOR_EDITS",
      deterministicValidationStatus: "passed",
    });
    const result = await executeQualityGateStage({
      context: {
        manifest,
        stageId: "stage:quality-full:en:full" as never,
      },
      decision,
      artifact: analysisArtifact(),
    });
    const stage = result.manifest.stages.find(
      (entry) => entry.stageId === "stage:quality-full:en:full"
    );

    expect(result.outcome.status).toBe("succeeded");
    expect(stage?.qualityDecision?.status).toBe("READY_WITH_MINOR_EDITS");
    expect(result.manifest.artifacts[0]?.owner).toBe("analysis");
  });

  it("persists a blocked short quality gate independently", async () => {
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "009-the-christmas-doll",
      locales: ["en"],
      formats: ["short"],
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    const decision = adaptStoryProductionQualityGate({
      verdict: "REWRITE_REQUIRED",
      deterministicValidationStatus: "passed",
    });
    const result = await executeQualityGateStage({
      context: {
        manifest,
        stageId: "stage:quality-short:en:short" as never,
      },
      decision,
    });

    expect(result.outcome.status).toBe("blocked");
    if (result.outcome.status === "blocked") {
      expect(result.outcome.failure.category).toBe("short-quality-gate-failed");
    }
    expect(
      result.manifest.stages.find(
        (entry) => entry.stageId === "stage:quality-full:en:full"
      )?.status
    ).toBe("planned");
  });
});
