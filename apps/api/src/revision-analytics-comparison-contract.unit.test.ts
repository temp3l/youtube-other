import { describe, expect, it } from "vitest";

import { revisionAnalyticsComparisonRequestSchema } from "./revision-analytics-comparison-contract.js";

describe("revision analytics comparison API contract", () => {
  it("accepts only canonical, immutable, observational comparison requests", () => {
    const parsed = revisionAnalyticsComparisonRequestSchema.parse({
      schemaVersion: "revision-analytics-comparison-request.v1",
      contentProfileId: "strategic-reinvention",
      episodeId: "episode-1",
      metric: "views",
      comparisonDimensions: ["locale", "format"],
      cohorts: [{ observationId: "obs-it", format: "full" }, { observationId: "obs-en", format: "short" }],
      effectiveConfigurationHash: "a".repeat(64),
      dependencyIdentity: { query: "a".repeat(64) },
    });
    expect(parsed.contentProfileId).toBe("veronicabenini");
    expect(revisionAnalyticsComparisonRequestSchema.safeParse({ ...parsed, cohorts: [parsed.cohorts[0], parsed.cohorts[0]] }).success).toBe(false);
  });
});
