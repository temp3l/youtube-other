import { describe, expect, it } from "vitest";
import { buildSceneInspectOutput } from "./scene-inspect-output.js";

describe("CLI scene inspect output", () => {
  it("includes a summary alongside the full visual plan when available", () => {
    const output = buildSceneInspectOutput(
      { id: "scene-001" },
      {
        previousSceneId: "scene-000",
        renderability: "mergeWithPrevious",
        reusedFromSceneId: "scene-000",
        materialDifferencesFromPrevious: ["camera angle changed"],
        validationIssues: [{ code: "ABSTRACT_VISIBLE_ACTION" }],
      }
    );

    expect(output).toMatchObject({
      scene: { id: "scene-001" },
      visualPlanSummary: {
        previousSceneId: "scene-000",
        renderability: "mergeWithPrevious",
        reusedFromSceneId: "scene-000",
        materialDifferencesFromPrevious: ["camera angle changed"],
        validationIssueCodes: ["ABSTRACT_VISIBLE_ACTION"],
      },
    });
  });

  it("falls back to the scene when no visual plan exists", () => {
    expect(buildSceneInspectOutput({ id: "scene-001" }, null)).toEqual({
      scene: { id: "scene-001" },
    });
  });
});
