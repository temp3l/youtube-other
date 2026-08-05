import { describe, expect, it } from "vitest";
import { getBaseProfile, selectBaseProfile } from "./base-profiles.js";

describe("dynamic base profiles", () => {
  it("maps existing semantic genres without changing their explicit paths", () => {
    expect(selectBaseProfile("horror")).toBe("horror-compatible");
    expect(selectBaseProfile("mathematics")).toBe("educational-compatible");
    expect(selectBaseProfile("presenter-advice")).toBe(
      "presenter-advice-compatible"
    );
    expect(selectBaseProfile("history")).toBe("historical");
  });

  it("selects a deterministic primary profile for mixed genres", () => {
    expect(selectBaseProfile("education", ["suspense"])).toBe(
      "educational-compatible"
    );
    expect(getBaseProfile("educational-compatible").rendererFamily).toBe(
      "educational"
    );
  });
});
