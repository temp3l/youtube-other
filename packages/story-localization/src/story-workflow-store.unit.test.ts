import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPlannedStoryWorkflowManifest,
} from "./story-workflow-planner.js";
import {
  StoryWorkflowManifestStore,
  StoryWorkflowStoreError,
  appendStageOutcome,
  resolveStoryWorkflowManifestPath,
} from "./story-workflow-store.js";
import {
  stageOutcomeSchemaVersion,
  workflowSchemaVersion,
} from "./story-workflow.types.js";

async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "story-workflow-store-"));
}

function makeManifest() {
  return buildPlannedStoryWorkflowManifest({
    episodeId: "009-the-christmas-doll",
    locales: ["en", "es"],
    formats: ["full"],
    createdAt: "2026-07-01T00:00:00.000Z",
    dryRun: true,
  });
}

function makeOutcome(manifest: ReturnType<typeof makeManifest>) {
  const stage = manifest.stages[0]!;
  return {
    schemaVersion: stageOutcomeSchemaVersion,
    status: "succeeded",
    stageId: stage.stageId,
    executionId: manifest.executionId,
    artifact: {
      artifactId: "artifact:009-the-christmas-doll:en:full:narration:deadbeef",
      artifactType: "canonical-story-package",
      owner: "narration",
      locale: "en",
      format: "full",
      provenance: "generated",
      path: "locales/en/full/script.md",
      fingerprint: "a".repeat(64),
      schemaVersion: "canonical-story-package-v1",
      parents: [],
      sourceStageId: stage.stageId,
    },
    provenance: "generated",
    fingerprintInputs: stage.fingerprintInputs,
    cache: stage.cache,
    warnings: [],
    cost: {
      inputTokens: 1,
      cachedInputTokens: 0,
      outputTokens: 1,
      reasoningTokens: 0,
      estimatedCostMicros: null,
      actualCostMicros: null,
    },
    startedAt: "2026-07-01T00:00:00.000Z",
    completedAt: "2026-07-01T00:00:01.000Z",
    observability: {
      attemptNumber: 1,
      durationMs: 1000,
    },
  } as const;
}

describe("story workflow manifest store", () => {
  it("creates, loads, and updates a validated manifest", async () => {
    const root = await makeTempRoot();
    const manifest = makeManifest();
    const store = new StoryWorkflowManifestStore(root, manifest.episodeId);

    await store.create(manifest);
    const loaded = await store.load(manifest.workflowId);
    expect(loaded?.workflowId).toBe(manifest.workflowId);

    const outcome = makeOutcome(manifest);
    const updated = await store.appendOutcome({
      workflowId: manifest.workflowId,
      outcome,
    });

    expect(updated.attemptHistory).toHaveLength(1);
    expect(updated.stages[0]?.status).toBe("succeeded");
    expect(updated.artifacts[0]?.artifactId).toBe(outcome.artifact.artifactId);
  });

  it("updates stage attempts without the store helper", () => {
    const manifest = makeManifest();
    const updated = appendStageOutcome(manifest, makeOutcome(manifest));
    expect(updated.plannedStageCount).toBe(manifest.plannedStageCount);
    expect(updated.stages[0]?.latestOutcome?.status).toBe("succeeded");
  });

  it("quarantines corrupt JSON", async () => {
    const root = await makeTempRoot();
    const manifest = makeManifest();
    const manifestPath = resolveStoryWorkflowManifestPath({
      episodesRoot: root,
      episodeId: manifest.episodeId,
      workflowId: manifest.workflowId,
    });
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(manifestPath, "{not-json", "utf8");

    const store = new StoryWorkflowManifestStore(root, manifest.episodeId);
    await expect(store.load(manifest.workflowId)).rejects.toMatchObject({
      failure: { category: "cache-corrupt" },
    });
    const quarantined = await fs.readdir(store.paths.quarantineDir);
    expect(quarantined.some((entry) => entry.includes(".corrupt"))).toBe(true);
  });

  it("rejects incompatible schema versions", async () => {
    const root = await makeTempRoot();
    const manifest = makeManifest();
    const manifestPath = resolveStoryWorkflowManifestPath({
      episodesRoot: root,
      episodeId: manifest.episodeId,
      workflowId: manifest.workflowId,
    });
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(
      manifestPath,
      JSON.stringify({ ...manifest, schemaVersion: "story-workflow-manifest-v0" }),
      "utf8"
    );

    const store = new StoryWorkflowManifestStore(root, manifest.episodeId);
    await expect(store.load(manifest.workflowId)).rejects.toBeInstanceOf(
      StoryWorkflowStoreError
    );
    await expect(store.load(manifest.workflowId)).rejects.toMatchObject({
      failure: { category: "manifest-version-incompatible" },
    });
    expect(workflowSchemaVersion).toBe("story-workflow-manifest-v1");
  });
});
