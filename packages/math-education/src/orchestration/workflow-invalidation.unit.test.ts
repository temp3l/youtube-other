import { describe, expect, it } from "vitest";
import { invalidateWorkflowStages } from "./workflow-invalidation.js";
import {
  MATH_STAGES,
  stageFingerprint,
  type WorkflowManifest,
} from "./workflow.js";

describe("math workflow invalidation", () => {
  it("marks only a changed stage and its transitive successors stale", () => {
    const now = "2026-07-12T00:00:00.000Z";
    let parentFingerprints: string[] = [];
    const manifest: WorkflowManifest = {
      artifactVersion: "math-workflow.v2",
      lessonId: "m5-zo-001-standard",
      curriculumReleaseId: "de-gems-5-10-v1",
      simulated: true,
      paidProviderCalled: false,
      stages: MATH_STAGES.map((stage) => {
        const fingerprint = stageFingerprint(stage, parentFingerprints, {});
        const record = {
          stage,
          status: "succeeded" as const,
          fingerprint,
          parentFingerprints,
          outputArtifacts: [],
          updatedAt: now,
        };
        parentFingerprints = [fingerprint];
        return record;
      }),
      failures: [],
    };
    const result = invalidateWorkflowStages(manifest, ["localization"], now);
    expect(
      result.stages.find((stage) => stage.stage === "scene-timing")?.status
    ).toBe("succeeded");
    expect(
      result.stages.find((stage) => stage.stage === "localization")?.status
    ).toBe("stale");
    expect(
      result.stages.find((stage) => stage.stage === "publish")?.status
    ).toBe("stale");
  });
});
