import { describe, expect, it } from "vitest";
import { reconcileWorkflowCost } from "./story-workflow-cost.js";

describe("story workflow cost budgets", () => {
  it("allows cost within budget", () => {
    const result = reconcileWorkflowCost({
      cost: {
        inputTokens: 10,
        cachedInputTokens: 0,
        outputTokens: 10,
        reasoningTokens: 0,
        estimatedCostMicros: 100,
        actualCostMicros: null,
      },
      cache: { status: "miss", invalidationReasons: [] },
      budget: { maxEstimatedCostMicros: 200 },
    });
    expect(result.allowed).toBe(true);
  });

  it("blocks with typed failure when budget is exceeded", () => {
    const result = reconcileWorkflowCost({
      cost: {
        inputTokens: 10,
        cachedInputTokens: 0,
        outputTokens: 10,
        reasoningTokens: 0,
        estimatedCostMicros: 300,
        actualCostMicros: null,
      },
      cache: { status: "miss", invalidationReasons: [] },
      budget: { maxEstimatedCostMicros: 200 },
    });
    expect(result.allowed).toBe(false);
    expect(result.failure?.category).toBe("budget-exceeded");
  });
});
