import { describe, expect, it } from "vitest";
import { decideLegacyWorkflowDelegation } from "./story-workflow-legacy.js";

describe("legacy story command workflow delegation", () => {
  it("delegates when workflow mode is enabled", () => {
    expect(
      decideLegacyWorkflowDelegation({
        command: "rewrite-full",
        workflowEnabled: true,
      }).delegate
    ).toBe(true);
  });

  it("preserves legacy behavior by default", () => {
    const decision = decideLegacyWorkflowDelegation({ command: "localize" });
    expect(decision.delegate).toBe(false);
    expect(decision.reason).toContain("Legacy localize");
  });
});
