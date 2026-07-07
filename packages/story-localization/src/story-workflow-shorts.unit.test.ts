import { describe, expect, it } from "vitest";
import {
  executeShortWorkflowStage,
  resolveShortWorkflow,
} from "./story-workflow-shorts.js";
import { buildPlannedStoryWorkflowManifest } from "./story-workflow-planner.js";
import { type ArtifactLineage } from "./story-workflow.types.js";

function artifact(format: "full" | "short"): ArtifactLineage {
  return {
    artifactId: `artifact:009-the-christmas-doll:en:${format}:narration:deadbeef` as ArtifactLineage["artifactId"],
    artifactType: `${format}-story-package`,
    owner: "narration",
    locale: "en",
    format,
    provenance: "generated",
    path: `en/${format}/script.md`,
    fingerprint: "b".repeat(64),
    schemaVersion: `${format}-story-package-v1`,
    parents: [],
    sourceStageId: `stage:rewrite-${format}:en:${format}` as ArtifactLineage["sourceStageId"],
  };
}

describe("story workflow shorts", () => {
  it("skips short generation when full is blocked", () => {
    expect(resolveShortWorkflow({ locale: "en" }).status).toBe("skipped");
  });

  it("accepts a short independently from full", () => {
    const result = resolveShortWorkflow({
      locale: "en",
      parentFull: artifact("full"),
      shortArtifact: artifact("short"),
      qualityPassed: true,
    });
    expect(result.status).toBe("accepted");
  });

  it("blocks on short quality failure without falling back to full", () => {
    const result = resolveShortWorkflow({
      locale: "en",
      parentFull: artifact("full"),
      shortArtifact: artifact("short"),
      qualityPassed: false,
    });
    expect(result.status).toBe("blocked");
    expect(result.failure?.category).toBe("short-quality-gate-failed");
  });

  it("persists accepted short outcome with parent linkage", async () => {
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "009-the-christmas-doll",
      locales: ["en"],
      formats: ["short"],
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    const result = resolveShortWorkflow({
      locale: "en",
      parentFull: artifact("full"),
      shortArtifact: artifact("short"),
      qualityPassed: true,
    });
    const persisted = await executeShortWorkflowStage({
      context: { manifest },
      result,
    });

    expect(persisted.outcome.status).toBe("succeeded");
    expect(persisted.manifest.artifacts[0]?.format).toBe("short");
    expect(
      persisted.manifest.stages.find(
        (stage) => stage.stageId === "stage:rewrite-short:en:short"
      )?.status
    ).toBe("succeeded");
  });

  it("persists independent short failure without changing full stage state", async () => {
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "009-the-christmas-doll",
      locales: ["en"],
      formats: ["short"],
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    const result = resolveShortWorkflow({
      locale: "en",
      parentFull: artifact("full"),
      generationFailure: {
        schemaVersion: "stage-failure-v1",
        category: "short-generation-failed",
        retryability: "retryable",
        message: "Short provider failed.",
        occurredAt: "2026-07-01T00:00:00.000Z",
      },
    });
    const persisted = await executeShortWorkflowStage({
      context: { manifest },
      result,
    });

    expect(persisted.outcome.status).toBe("failed");
    expect(
      persisted.manifest.stages.find(
        (stage) => stage.stageId === "stage:quality-full:en:full"
      )?.status
    ).toBe("planned");
  });
});
