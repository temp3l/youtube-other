import { describe, expect, it } from "vitest";

import { compareRevisionAnalytics } from "./revision-analytics-comparison.js";

const hash = "a".repeat(64);
function observation(id: string, locale: "it" | "en", views: number) {
  return {
    schemaVersion: "revision-analytics-observation.v1" as const,
    observationId: id,
    contentProfileId: "strategic-reinvention",
    episodeId: "episode-1",
    editionRevisionId: `edition-${id}`,
    publicationId: `publication-${id}`,
    publicationRevision: 2,
    locale,
    observedAt: "2026-08-09T00:00:00.000Z",
    configurationRevision: "config-1",
    dependencyIdentity: { delivery: hash },
    provenanceSha256: hash,
    metrics: { views },
    providerDispatchEnabled: false as const,
    regenerationRationale: "new-observation" as const,
  };
}

describe("revision analytics comparisons", () => {
  it("creates a canonical, immutable, observational cross-locale and format comparison", () => {
    const result = compareRevisionAnalytics({
      contentProfileId: "strategic-reinvention",
      episodeId: "episode-1",
      metric: "views",
      comparisonDimensions: ["locale", "format"],
      cohorts: [{ observation: observation("obs-it", "it", 12), format: "full" }, { observation: observation("obs-en", "en", 8), format: "short" }],
      effectiveConfigurationHash: hash,
      dependencyIdentity: { query: hash },
    });
    expect(result.comparison.contentProfileId).toBe("veronicabenini");
    expect(result.comparison.interpretation).toBe("observational-non-causal");
    expect(result.comparison.profileMutationEnabled).toBe(false);
    expect(result.comparison.providerDispatchEnabled).toBe(false);
    expect(result.comparison.immutableObservationBindings).toHaveLength(2);
  });

  it("fails closed for missing metrics or indistinct cohorts", () => {
    const base = {
      contentProfileId: "veronicabenini", episodeId: "episode-1", metric: "views", comparisonDimensions: ["locale"] as const,
      effectiveConfigurationHash: hash, dependencyIdentity: { query: hash },
    };
    expect(() => compareRevisionAnalytics({ ...base, cohorts: [{ observation: observation("obs-1", "it", 1), format: "full" }, { observation: observation("obs-2", "it", 2), format: "short" }] })).toThrow("ANALYTICS_COMPARISON_COHORTS_INDISTINCT");
    expect(() => compareRevisionAnalytics({ ...base, metric: "retention", cohorts: [{ observation: observation("obs-1", "it", 1), format: "full" }, { observation: observation("obs-2", "en", 2), format: "short" }] })).toThrow("ANALYTICS_COMPARISON_METRIC_MISSING");
  });
});
