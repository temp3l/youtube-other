import { describe, expect, it } from "vitest";

import {
  DARK_TRUTH_TASK_IDS,
  createDarkTruthTaskRegistry,
  darkTruthWorkflowDefinition,
} from "./task-registry.js";

describe("Dark Truth task registry", () => {
  it("validates the complete profile DAG with one owner per logical task", () => {
    const registry = createDarkTruthTaskRegistry();
    expect(registry.validateWorkflow(darkTruthWorkflowDefinition)).toEqual(
      darkTruthWorkflowDefinition
    );
    expect(registry.list("dark-truth")).toHaveLength(
      DARK_TRUTH_TASK_IDS.length
    );
    expect(new Set(DARK_TRUTH_TASK_IDS).size).toBe(DARK_TRUTH_TASK_IDS.length);
    expect(
      registry
        .list("dark-truth")
        .every((task) => task.implementationOwner.startsWith("@mediaforge/"))
    ).toBe(true);
    expect(registry.explain("darktruth.publish")).toMatchObject({
      implementationOwner: "@mediaforge/youtube-upload",
      requiredDependencies: ["darktruth.publish-approval"],
    });
  });
});
