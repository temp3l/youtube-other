import { describe, expect, it } from "vitest";
import { buildPlannedStoryWorkflowManifest } from "./story-workflow-planner.js";
import { decideStageInvalidation } from "./story-workflow-invalidation.js";

describe("story workflow invalidation", () => {
  it("marks stage stale when source fingerprint changes", () => {
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "009-the-christmas-doll",
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    const stage = manifest.stages[0]!;
    const decision = decideStageInvalidation(stage, {
      ...stage.fingerprintInputs,
      sourceFingerprint: "f".repeat(64),
    });
    expect(decision.status).toBe("stale");
    expect(decision.cache.invalidationReasons).toContain("sourceFingerprint");
  });
});
