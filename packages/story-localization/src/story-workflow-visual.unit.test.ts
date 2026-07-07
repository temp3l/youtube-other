import { describe, expect, it } from "vitest";
import {
  executeVisualBranchStage,
  resolveVisualBranch,
} from "./story-workflow-visual.js";
import { buildPlannedStoryWorkflowManifest } from "./story-workflow-planner.js";
import { type ArtifactLineage } from "./story-workflow.types.js";

function visualArtifact(): ArtifactLineage {
  return {
    artifactId: "artifact:009-the-christmas-doll:en:full:scene-plan:deadbeef" as ArtifactLineage["artifactId"],
    artifactType: "visual-branch-boundary",
    owner: "scene-plan",
    locale: "en",
    format: "full",
    provenance: "generated",
    path: "en/full/visual-boundary.json",
    fingerprint: "d".repeat(64),
    schemaVersion: "visual-branch-boundary-v1",
    parents: [],
    sourceStageId: "stage:visual-model:en:full" as ArtifactLineage["sourceStageId"],
  };
}

describe("story workflow visual branch", () => {
  it("starts shared images after accepted English and quality pass", () => {
    expect(
      resolveVisualBranch({
        englishFullAccepted: true,
        englishQualityPassed: true,
        visualPrepSucceeded: true,
        localeFailures: ["de"],
      }).sharedImagesStatus
    ).toBe("ready");
  });

  it("blocks images on English rejection", () => {
    const result = resolveVisualBranch({
      englishFullAccepted: false,
      englishQualityPassed: true,
    });
    expect(result.sharedImagesStatus).toBe("blocked");
    expect(result.blockedBy).toContain("english-full");
  });

  it("plans a typed English visual boundary stage", () => {
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "009-the-christmas-doll",
      locales: ["en", "de"],
      formats: ["full"],
      createdAt: "2026-07-01T00:00:00.000Z",
    });

    expect(
      manifest.stages.some(
        (stage) => stage.stageId === "stage:visual-model:en:full"
      )
    ).toBe(true);
  });

  it("persists visual boundary readiness without executing image stages", async () => {
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "009-the-christmas-doll",
      locales: ["en", "de"],
      formats: ["full"],
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    const result = resolveVisualBranch({
      englishFullAccepted: true,
      englishQualityPassed: true,
      visualPrepSucceeded: true,
      localeFailures: ["de"],
    });
    const persisted = await executeVisualBranchStage({
      context: { manifest },
      result,
      artifact: visualArtifact(),
    });

    expect(persisted.outcome.status).toBe("succeeded");
    expect(persisted.manifest.artifacts[0]?.artifactType).toBe(
      "visual-branch-boundary"
    );
    expect(
      persisted.manifest.stages.some(
        (stage) =>
          stage.stageType === "image-generation" && stage.status === "succeeded"
      )
    ).toBe(false);
  });
});
