import { describe, expect, it } from "vitest";
import { normalizeRevisionAnalyticsObservation } from "./genre-production-intelligence.js";

describe("revision analytics observation", () => {
  it("binds analytics to immutable canonical revision identity without dispatch", () => {
    const observation = normalizeRevisionAnalyticsObservation({
      schemaVersion: "revision-analytics-observation.v1", observationId: "obs-1", contentProfileId: "strategic-reinvention", episodeId: "episode-1", editionRevisionId: "edition-1", publicationId: "publication-1", publicationRevision: 2, locale: "it", observedAt: "2026-08-09T00:00:00.000Z", configurationRevision: "config-1", dependencyIdentity: { delivery: "a".repeat(64) }, provenanceSha256: "b".repeat(64), metrics: { views: 12 }, providerDispatchEnabled: false, regenerationRationale: "new-observation",
    });
    expect(observation.contentProfileId).toBe("veronicabenini");
    expect(() => normalizeRevisionAnalyticsObservation({ ...observation, providerDispatchEnabled: true })).toThrow();
  });
});
