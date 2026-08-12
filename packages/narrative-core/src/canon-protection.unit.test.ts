import { describe, expect, it } from "vitest";

import {
  CANON_PROTECTED_SURFACES,
  PLANNING_SAFE_SURFACES,
  assertPlanningOnlySurfaces,
  isCanonProtectedSurface,
} from "./canon-protection.js";

describe("canon protection", () => {
  it("identifies canon-protected surfaces", () => {
    expect(isCanonProtectedSurface("prior_truth")).toBe(true);
    expect(isCanonProtectedSurface("hook_presentation")).toBe(false);
    expect(CANON_PROTECTED_SURFACES).toContain("promise_resolution");
    expect(PLANNING_SAFE_SURFACES).toContain("metadata_variant");
  });

  it("accepts planning-only surface sets", () => {
    expect(assertPlanningOnlySurfaces(["hook_presentation", "pacing_ratio"])).toBe(
      true
    );
    expect(assertPlanningOnlySurfaces(["hook_presentation", "prior_truth"])).toBe(
      false
    );
  });
});
