import { describe, expect, it } from "vitest";
import {
  buildImagePromptArtifact,
  buildScenePlanArtifact,
  executeImagePromptStage,
  executeVisualBranchStage,
  resolveVisualBranch,
} from "./story-workflow-visual.js";
import { buildPlannedStoryWorkflowManifest } from "./story-workflow-planner.js";
import { type ArtifactLineage } from "./story-workflow.types.js";

function visualArtifact(): ArtifactLineage {
  return buildScenePlanArtifact({
    episodeId: "009-the-christmas-doll",
    locale: "en",
    format: "full",
    path: "state/image-generation/visual-plans/index.en.full.json",
    fingerprint: "d".repeat(64),
  });
}

function promptArtifact(
  parentArtifactId: ArtifactLineage["artifactId"]
): ArtifactLineage {
  return buildImagePromptArtifact({
    episodeId: "009-the-christmas-doll",
    locale: "en",
    format: "full",
    path: "state/image-generation/prompts/index.en.full.json",
    fingerprint: "e".repeat(64),
    parents: [parentArtifactId],
  });
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
    expect(
      manifest.stages.some(
        (stage) => stage.stageId === "stage:image-prompt:en:full"
      )
    ).toBe(true);
    expect(
      manifest.stages.some(
        (stage) => stage.stageId === "stage:image-generation:en:full"
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
    expect(persisted.manifest.artifacts[0]?.artifactType).toBe("scene-plan-batch");
    expect(
      persisted.manifest.stages.some(
        (stage) =>
          stage.stageType === "image-generation" && stage.status === "succeeded"
      )
    ).toBe(false);
  });

  it("persists a typed image prompt artifact after the scene-plan stage", async () => {
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "009-the-christmas-doll",
      locales: ["en"],
      formats: ["full"],
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    const scenePlan = visualArtifact();
    const withScenePlan = await executeVisualBranchStage({
      context: { manifest },
      result: resolveVisualBranch({
        englishFullAccepted: true,
        englishQualityPassed: true,
        visualPrepSucceeded: true,
      }),
      artifact: scenePlan,
    });

    const persisted = await executeImagePromptStage({
      context: { manifest: withScenePlan.manifest },
      artifact: promptArtifact(scenePlan.artifactId),
    });

    expect(persisted.outcome.status).toBe("succeeded");
    expect(persisted.manifest.artifacts.at(-1)?.artifactType).toBe(
      "image-prompt-batch"
    );
    expect(persisted.manifest.artifacts.at(-1)?.parents).toEqual([
      scenePlan.artifactId,
    ]);
  });
});
