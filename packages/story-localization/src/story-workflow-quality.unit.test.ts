import { describe, expect, it } from "vitest";
import {
  adaptStoryProductionQualityGate,
  qualityDecisionToFailure,
} from "./story-workflow-quality.js";
import { type StoryProductionAnalysisVerdict } from "./story-production-analysis.js";

describe("story workflow quality adapter", () => {
  it.each([
    ["READY", true],
    ["READY_WITH_MINOR_EDITS", true],
    ["REVISION_REQUIRED", false],
    ["REWRITE_REQUIRED", false],
    ["BLOCKED", false],
  ] as const)("maps %s to pass=%s", (verdict, pass) => {
    const decision = adaptStoryProductionQualityGate({
      verdict: verdict as StoryProductionAnalysisVerdict,
      deterministicValidationStatus: "passed",
    });
    expect(decision.pass).toBe(pass);
    expect(decision.status).toBe(verdict);
  });

  it("lets deterministic validation failure take precedence", () => {
    const decision = adaptStoryProductionQualityGate({
      verdict: "READY",
      deterministicValidationStatus: "failed",
    });
    expect(decision.pass).toBe(false);
    expect(decision.failedChecks).toContain("deterministic-validation");
  });

  it("turns a blocking quality decision into a typed failure", () => {
    const decision = adaptStoryProductionQualityGate({
      verdict: "REWRITE_REQUIRED",
      deterministicValidationStatus: "passed",
      failedChecks: ["overall-score"],
    });
    const failure = qualityDecisionToFailure({
      decision,
      category: "rewrite-quality-gate-failed",
    });
    expect(failure?.category).toBe("rewrite-quality-gate-failed");
    expect(failure?.retryability).toBe("retry-after-change");
  });
});
