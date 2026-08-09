import { describe, expect, it } from "vitest";

import { BULK_PRODUCTION_MAX_ITEMS, preflightBulkProduction, retryableBulkItems } from "./bulk-production-preflight.js";

const item = { projectId: "project-1", episodeId: "episode-1", expectedRevision: 2, locale: "en" as const, variant: "full" as const };

describe("bulk production preflight", () => {
  it("returns every mixed selection outcome without admitting stale, forbidden, or duplicate items", () => {
    const result = preflightBulkProduction({ workspaceId: "workspace-1", probes: [
      { item, authorized: true, currentRevision: 2, configurationAvailable: true, quotaAvailable: true },
      { item, authorized: true, currentRevision: 2, configurationAvailable: true, quotaAvailable: true },
      { item: { ...item, episodeId: "episode-2" }, authorized: false, currentRevision: 3, configurationAvailable: false, quotaAvailable: false },
    ] });
    expect(result.eligibleCount).toBe(1);
    expect(result.items[0]?.reasons).toEqual(["authorized"]);
    expect(result.items[1]?.reasons).toContain("duplicate_selection");
    expect(result.items[2]?.reasons).toEqual(expect.arrayContaining(["forbidden", "stale_revision", "configuration_unavailable", "quota_unavailable"]));
    expect(result.selectionFingerprint).toHaveLength(64);
  });

  it("bounds selection and retries only unsuccessful item states", () => {
    const result = preflightBulkProduction({ workspaceId: "workspace-1", probes: Array.from({ length: BULK_PRODUCTION_MAX_ITEMS + 1 }, (_, index) => ({ item: { ...item, episodeId: `episode-${index}` }, authorized: true, currentRevision: 2, configurationAvailable: true, quotaAvailable: true })) });
    expect(result.items.at(-1)?.reasons).toContain("selection_limit");
    expect(retryableBulkItems([{ status: "succeeded", id: "one" }, { status: "failed-retryable", id: "two" }, { status: "failed-permanent", id: "three" }, { status: "cancelled", id: "four" }]).map((value) => value.id)).toEqual(["two", "four"]);
  });
});
