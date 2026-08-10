import { describe, expect, it } from "vitest";

import { assessShadowDifferentialV36 } from "./representative-shadow-differential-v36.js";

describe("V3.6 representative shadow differential assessor", () => {
  it("does not endorse V3.5-only presence without exact claim support", () => {
    expect(assessShadowDifferentialV36({ presenceClassification: "v35-only", exactClaimSupport: false, canonicalMapping: "absent" })).toBe("unsupported-by-current-claims");
  });
  it("marks a validated exact V3.6 relation as claim-supported, not version-correct", () => {
    expect(assessShadowDifferentialV36({ presenceClassification: "v36-only", exactClaimSupport: true, canonicalMapping: "absent" })).toBe("supported-by-current-claims");
  });
  it("keeps the known-bad 1066 V3.5-only chain unsupported", () => {
    expect(assessShadowDifferentialV36({ presenceClassification: "v35-only", exactClaimSupport: false, canonicalMapping: "absent" })).toBe("unsupported-by-current-claims");
  });
  it("requires manual review for related but non-equivalent mappings", () => {
    expect(assessShadowDifferentialV36({ presenceClassification: "semantic-conflict", exactClaimSupport: true, canonicalMapping: "ambiguous" })).toBe("needs-manual-review");
  });
});
