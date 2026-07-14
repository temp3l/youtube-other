import { describe, expect, it } from "vitest";

import {
  MATH_TASK_IDS,
  createMathTaskRegistry,
  mathWorkflowDefinition,
} from "./task-registry.js";

describe("mathematics task registry", () => {
  it("validates the complete profile DAG with one owner per logical task", () => {
    const registry = createMathTaskRegistry();
    expect(registry.validateWorkflow(mathWorkflowDefinition)).toEqual(
      mathWorkflowDefinition
    );
    expect(registry.list("mathematics-education")).toHaveLength(
      MATH_TASK_IDS.length
    );
    expect(new Set(MATH_TASK_IDS).size).toBe(MATH_TASK_IDS.length);
    expect(
      registry
        .list("mathematics-education")
        .every((task) => task.implementationOwner.startsWith("@mediaforge/"))
    ).toBe(true);
    expect(registry.explain("math.publish")).toMatchObject({
      implementationOwner: "@mediaforge/youtube-upload",
      requiredDependencies: ["math.publish-approval"],
    });
  });
});
