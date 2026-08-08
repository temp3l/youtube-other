import { describe, expect, it } from "vitest";
import {
  dedupeGeoFactsBySemanticIdentityV35,
  semanticMapStateIdentityV35,
} from "./history-map-semantic-dedup-v35.js";
import type { GeoFactV35 } from "./history-geo-facts-v35.js";
import type { HistoryMapStateV34 } from "./history-v34-contracts.js";

describe("History V3.5 map semantic dedup", () => {
  it("collapses duplicate geo facts from overlapping claim windows", () => {
    const facts: GeoFactV35[] = [
      {
        id: "geo-fact-location-claim-a-place-1",
        type: "location",
        placeMentionId: "entity-rome",
        claimIds: ["claim-a"],
      },
      {
        id: "geo-fact-location-claim-b-place-1",
        type: "location",
        placeMentionId: "entity-rome",
        claimIds: ["claim-b"],
      },
    ];
    const deduped = dedupeGeoFactsBySemanticIdentityV35(facts);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]!.claimIds).toEqual(expect.arrayContaining(["claim-a", "claim-b"]));
  });

  it("preserves distinct sequence relations with different place order", () => {
    const baseState = (placeMentionIds: readonly string[]): HistoryMapStateV34 => ({
      id: "map-state-1",
      masterId: "map-master-1",
      mapPurpose: "area",
      semanticStatus: "valid",
      blockerCodes: [],
      fallbackDecision: null,
      affectedArea: "Mediterranean",
      baseGeography: "Mediterranean",
      labels: placeMentionIds.map((placeId, index) => ({
        text: `Place ${index + 1}`,
        placeId,
        linkedClaimIds: ["claim-1"],
        provenance: "narration-claim",
      })),
      routes: [],
      timePeriod: "ancient",
      compilerResolution: {
        requestedMapType: "sequence",
        resolvedMapType: "sequence",
        scopeClaimIds: ["claim-1"],
        geoFactIds: [`geo-${placeMentionIds.join("-")}`],
      },
    });
    const left = semanticMapStateIdentityV35(
      baseState(["entity-rome", "entity-spain"])
    );
    const right = semanticMapStateIdentityV35(
      baseState(["entity-carthage", "entity-italy"])
    );
    expect(left).not.toEqual(right);
  });
});
