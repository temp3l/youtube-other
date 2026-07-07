import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildPlannedStoryWorkflowManifest } from "./story-workflow-planner.js";
import {
  canUseEnglishSourceFallback,
  evaluateEnglishSourceFallback,
  executeEnglishSourceFallbackStage,
  executeEnglishRewriteStage,
} from "./story-workflow-english.js";
import { adaptStoryProductionQualityGate } from "./story-workflow-quality.js";
import { buildStoryWorkflowStatusReport } from "./story-workflow-status.js";
import { StoryWorkflowManifestStore } from "./story-workflow-store.js";
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

  it("persists successful rewrite outcome through the manifest store", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-english-stage-"));
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "009-the-christmas-doll",
      locales: ["en"],
      formats: ["full"],
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    const store = new StoryWorkflowManifestStore(root, manifest.episodeId);
    await store.create(manifest);

    const result = await executeEnglishRewriteStage({
      context: { manifest, store },
      run: async () => ({ artifact: artifact() }),
    });
    const loaded = await store.load(manifest.workflowId);

    expect(result.outcome.status).toBe("succeeded");
    expect(loaded?.attemptHistory).toHaveLength(1);
    expect(loaded?.stages.find((stage) => stage.stageId === result.outcome.stageId)?.status).toBe("succeeded");
  });

  it("does not invoke the rewrite runner when resuming a succeeded stage", async () => {
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "009-the-christmas-doll",
      locales: ["en"],
      formats: ["full"],
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    const first = await executeEnglishRewriteStage({
      context: { manifest },
      run: async () => ({ artifact: artifact() }),
    });
    const runner = vi.fn(async () => ({ artifact: artifact() }));
    const resumed = await executeEnglishRewriteStage({
      context: { manifest: first.manifest },
      run: runner,
    });

    expect(runner).not.toHaveBeenCalled();
    expect(resumed.outcome).toStrictEqual(first.outcome);
    expect(resumed.manifest.attemptHistory).toHaveLength(1);
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

  it("persists accepted source fallback as a typed outcome visible in status", async () => {
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "009-the-christmas-doll",
      locales: ["en"],
      formats: ["full"],
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    const failed = await executeEnglishRewriteStage({
      context: { manifest },
      run: async () => {
        throw failure("rewrite-provider-failure");
      },
    });
    const rewriteFailure =
      failed.outcome.status === "failed" ? failed.outcome.failure : failure("rewrite-provider-failure");
    const fallback = await executeEnglishSourceFallbackStage({
      context: { manifest: failed.manifest },
      rewriteFailure,
      sourceArtifact: artifact("source"),
      validationPassed: true,
      qualityDecision: adaptStoryProductionQualityGate({
        verdict: "READY",
        deterministicValidationStatus: "passed",
      }),
    });
    const status = buildStoryWorkflowStatusReport(fallback.manifest);

    expect(fallback.outcome.status).toBe("succeeded");
    if (fallback.outcome.status === "succeeded") {
      expect(fallback.outcome.artifact.provenance).toBe("source-fallback");
    }
    expect(status.fallbacks[0]?.provenance).toBe("source-fallback");
    expect(status.fallbacks[0]?.warningCodes).toContain("source-fallback-accepted");
  });

  it("blocks source fallback when the source artifact is missing", async () => {
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "009-the-christmas-doll",
      locales: ["en"],
      formats: ["full"],
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    const result = await executeEnglishSourceFallbackStage({
      context: { manifest },
      rewriteFailure: failure("rewrite-provider-failure"),
      validationPassed: true,
      qualityDecision: adaptStoryProductionQualityGate({
        verdict: "READY",
        deterministicValidationStatus: "passed",
      }),
    });

    expect(result.outcome.status).toBe("blocked");
    if (result.outcome.status === "blocked") {
      expect(result.outcome.failure.category).toBe("source-missing");
    }
  });

  it("does not rerun an already accepted source fallback", async () => {
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "009-the-christmas-doll",
      locales: ["en"],
      formats: ["full"],
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    const first = await executeEnglishSourceFallbackStage({
      context: { manifest },
      rewriteFailure: failure("rewrite-provider-failure"),
      sourceArtifact: artifact("source"),
      validationPassed: true,
      qualityDecision: adaptStoryProductionQualityGate({
        verdict: "READY",
        deterministicValidationStatus: "passed",
      }),
    });
    const second = await executeEnglishSourceFallbackStage({
      context: { manifest: first.manifest },
      rewriteFailure: failure("rewrite-provider-failure"),
      sourceArtifact: artifact("source"),
      validationPassed: true,
      qualityDecision: adaptStoryProductionQualityGate({
        verdict: "READY",
        deterministicValidationStatus: "passed",
      }),
    });

    expect(second.outcome).toStrictEqual(first.outcome);
    expect(second.manifest.attemptHistory).toHaveLength(1);
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
