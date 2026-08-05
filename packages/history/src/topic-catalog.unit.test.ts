import { describe, expect, it } from "vitest";

import { historyStarterTopicCatalog } from "./topic-catalog.js";

describe("history starter topic catalog", () => {
  it("contains exactly the 50 typed starter topics with unique stable IDs", () => {
    expect(historyStarterTopicCatalog).toHaveLength(50);
    expect(new Set(historyStarterTopicCatalog.map((topic) => topic.id)).size).toBe(50);
  });

  it("preserves the Bronze Age pilot's deterministic media recommendations", () => {
    expect(historyStarterTopicCatalog.find((topic) => topic.id === "bronze-age-collapse")).toMatchObject({
      presetId: "civilization-rise-fall",
      period: "ancient",
      format: "standard",
      mapsRequired: true,
      timelineRequired: true,
    });
  });
});
