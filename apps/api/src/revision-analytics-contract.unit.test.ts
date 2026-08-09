import { describe, expect, it } from "vitest";
import { revisionAnalyticsIngestRequestSchema } from "./revision-analytics-contract.js";

describe("revision analytics API contract", () => {
  it("accepts only immutable, provider-disabled analytics observations", () => {
    expect(revisionAnalyticsIngestRequestSchema.parse({ observation: { schemaVersion: "revision-analytics-observation.v1", observationId: "obs-1", contentProfileId: "strategic-reinvention", episodeId: "episode-1", editionRevisionId: "edition-1", publicationId: "publication-1", publicationRevision: 2, locale: "it", observedAt: "2026-08-09T00:00:00.000Z", configurationRevision: "config-1", dependencyIdentity: { delivery: "a".repeat(64) }, provenanceSha256: "b".repeat(64), metrics: { views: 1 }, providerDispatchEnabled: false } }).observation.contentProfileId).toBe("veronicabenini");
  });
});
