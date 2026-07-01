import { describe, expect, it } from "vitest";
import { resolveVisualBranch } from "./story-workflow-visual.js";

describe("story workflow visual branch", () => {
  it("starts shared images after accepted English and quality pass", () => {
    expect(
      resolveVisualBranch({
        englishFullAccepted: true,
        englishQualityPassed: true,
        visualPrepSucceeded: true,
        localeFailures: ["de"],
      }).sharedImagesStatus
    ).toBe("ready");
  });

  it("blocks images on English rejection", () => {
    const result = resolveVisualBranch({
      englishFullAccepted: false,
      englishQualityPassed: true,
    });
    expect(result.sharedImagesStatus).toBe("blocked");
    expect(result.blockedBy).toContain("english-full");
  });
});
