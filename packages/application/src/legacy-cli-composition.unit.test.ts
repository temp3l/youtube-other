import { describe, expect, it } from "vitest";

import { createLegacyCliProductionCallerAdapter } from "./legacy-cli-composition.js";

describe("legacy CLI production caller composition", () => {
  it("registers History tasks in the canonical caller registry", () => {
    const adapter = createLegacyCliProductionCallerAdapter();

    expect(adapter.definition("history.research-brief")).toMatchObject({
      id: "history.research-brief",
      applicableProfiles: ["history"],
    });
  });
});
