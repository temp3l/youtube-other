import { describe, expect, it } from "vitest";
import {
  buildCanonicalMapEvidenceScopesV35,
  canonicalMapExplanationIdentityV35,
  canonicalMapOwnerIdentityV35,
  dedupeGeoFactsBySemanticIdentityV35,
  selectCanonicalMapWindowV35,
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

  it("collapses window-local mention ids for the same canonical geographic fact", () => {
    const facts: GeoFactV35[] = [
      { id: "geo-a", type: "location", placeMentionId: "rome-a", claimIds: ["claim-a"] },
      { id: "geo-b", type: "location", placeMentionId: "rome-b", claimIds: ["claim-b"] },
    ];
    const entities = [
      { id: "rome-a", normalizedLabel: "Rome", entityType: "place" as const },
      { id: "rome-b", normalizedLabel: "Rome", entityType: "place" as const },
    ];
    const deduped = dedupeGeoFactsBySemanticIdentityV35(facts, entities);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]!.claimIds).toEqual(["claim-a", "claim-b"]);
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

  it("selects the smallest complete canonical evidence window", () => {
    const scopes = buildCanonicalMapEvidenceScopesV35({
      orderedClaimIds: ["before", "owner", "after"],
      owningClaimIds: ["owner"],
    });
    expect(scopes).toEqual([
      ["owner"],
      ["before", "owner"],
      ["owner", "after"],
      ["before", "owner", "after"],
    ]);
    const selected = selectCanonicalMapWindowV35([
      { value: "owner-only", scopeClaimIds: scopes[0]!, complete: false, semanticConfidence: 1, stableOrder: 0 },
      { value: "left-complete", scopeClaimIds: scopes[1]!, complete: true, semanticConfidence: 3, stableOrder: 1 },
      { value: "right-complete", scopeClaimIds: scopes[2]!, complete: true, semanticConfidence: 2, stableOrder: 2 },
      { value: "wide-complete", scopeClaimIds: scopes[3]!, complete: true, semanticConfidence: 3, stableOrder: 3 },
    ]);
    expect(selected?.value).toBe("left-complete");
  });

  it("keeps canonical ownership stable when later windows add incidental geography", () => {
    const base = canonicalMapOwnerIdentityV35({
      episodeId: "napoleon",
      owningClaimIds: ["crossing-niemen"],
      relationType: "movement",
      mapType: "journey",
    });
    const expanded = canonicalMapOwnerIdentityV35({
      episodeId: "napoleon",
      owningClaimIds: ["crossing-niemen"],
      relationType: "movement",
      mapType: "journey",
    });
    expect(expanded).toBe(base);
  });

  it("preserves genuinely distinct movement stages", () => {
    const first = canonicalMapOwnerIdentityV35({
      episodeId: "expedition",
      owningClaimIds: ["stage-a-to-b"],
      relationType: "movement",
      mapType: "journey",
    });
    const second = canonicalMapOwnerIdentityV35({
      episodeId: "expedition",
      owningClaimIds: ["stage-b-to-c"],
      relationType: "movement",
      mapType: "journey",
    });
    expect(second).not.toBe(first);
  });

  it.each([
    ["napoleon", "crossing-niemen"],
    ["black-death", "messina-from-black-sea"],
    ["cuban-missile-crisis", "retaliation-spatial-proposition"],
  ] as const)("collapses overlapping %s windows by explanatory owner", (episodeId, owner) => {
    const state = (scopeClaimIds: readonly string[]) => ({
      mapPurpose: "area" as const,
      compilerResolution: {
        requestedMapType: "sequence" as const,
        resolvedMapType: "sequence" as const,
        owningClaimIds: [owner],
        scopeClaimIds,
        geoFactIds: [],
      },
    });
    expect(canonicalMapExplanationIdentityV35({ episodeId, state: state([owner]) })).toBe(
      canonicalMapExplanationIdentityV35({
        episodeId,
        state: state(["incidental-context", owner, "broader-geography"]),
      })
    );
  });

  it("preserves Franklin movement ownership while ignoring incidental Baffin Bay context", () => {
    const state = (scopeClaimIds: readonly string[]) => ({
      mapPurpose: "expedition-route" as const,
      compilerResolution: {
        requestedMapType: "movement" as const,
        resolvedMapType: "movement" as const,
        owningClaimIds: ["britain-to-northwest-passage"],
        scopeClaimIds,
        geoFactIds: ["franklin-movement"],
      },
    });
    const direct = canonicalMapExplanationIdentityV35({
      episodeId: "franklin-expedition",
      state: state(["britain-to-northwest-passage"]),
    });
    const expanded = canonicalMapExplanationIdentityV35({
      episodeId: "franklin-expedition",
      state: state(["britain-to-northwest-passage", "baffin-bay-context"]),
    });
    expect(expanded).toBe(direct);
    expect(state([]).compilerResolution.resolvedMapType).toBe("movement");
  });
});
