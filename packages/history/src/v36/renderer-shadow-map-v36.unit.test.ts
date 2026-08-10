import { describe, expect, it } from "vitest";

import type { MapIntentV36 } from "./compiler-shadow-contract-v36.js";
import {
  adaptMapIntentToRenderSpecV36,
  renderMapSpecSvgV36,
} from "./renderer-shadow-map-v36.js";

const common = {
  schemaVersion: "history-compiler-shadow-intent.v1",
  compilerVersion: "history-compiler-shadow.v3.6.0",
  episodeId: "episode",
  relationId: "relation",
  provenance: {
    relationId: "relation",
    evidenceFingerprint: "evidence",
    supportClaimIds: ["claim"],
    structuredPropositionIds: [],
    atomicGroundingIds: [],
  },
  shadowOnly: true,
} as const;
const geography = [
  { entityId: "a", canonicalLabel: "A", latitude: 50, longitude: 10, geometrySource: "curated" },
  { entityId: "b", canonicalLabel: "B", latitude: 52, longitude: 14, geometrySource: "curated" },
];

describe("V3.6 map renderer shadow adapter", () => {
  it("renders only the explicit movement route", () => {
    const intent: MapIntentV36 = {
      ...common,
      compilerIntentId: "movement-intent",
      disposition: "MAP",
      compilerRule: "map-movement.v1",
      relationKind: "movement",
      mapSemanticType: "movement",
      from: { entityId: "a" as never, canonicalLabel: "A" },
      to: { entityId: "b" as never, canonicalLabel: "B" },
      via: [],
    };
    const result = adaptMapIntentToRenderSpecV36({ intent, geography });
    expect(result.disposition).toBe("RENDER_SPEC");
    if (result.disposition !== "RENDER_SPEC") return;
    expect(result.edges).toEqual([{ from: "a", to: "b", semanticType: "movement-route", directed: true }]);
  });

  it("keeps comparison non-route and event-location intended", () => {
    const comparison = adaptMapIntentToRenderSpecV36({
      geography,
      intent: {
        ...common,
        compilerIntentId: "comparison-intent",
        disposition: "MAP",
        compilerRule: "map-spatial-comparison.v1",
        relationKind: "spatial-comparison",
        mapSemanticType: "comparison",
        places: [
          { entityId: "a" as never, canonicalLabel: "A" },
          { entityId: "b" as never, canonicalLabel: "B" },
        ],
        unorderedSemanticSet: true,
      },
    });
    expect(comparison.disposition === "RENDER_SPEC" && comparison.edges[0]?.directed).toBe(false);
    expect(comparison.disposition === "RENDER_SPEC" && comparison.edges[0]?.semanticType).toBe("comparison-connector-not-route");

    const event = adaptMapIntentToRenderSpecV36({
      geography,
      intent: {
        ...common,
        compilerIntentId: "event-intent",
        disposition: "MAP",
        compilerRule: "map-event-location.v1",
        relationKind: "event-location",
        mapSemanticType: "event-location",
        event: { canonicalLabel: "main invasion", eventType: "operation" },
        location: { entityId: "b" as never, canonicalLabel: "Calais" },
        assertionStatus: "intended",
      },
    });
    expect(event.disposition).toBe("RENDER_SPEC");
    if (event.disposition !== "RENDER_SPEC") return;
    expect(event.edges).toHaveLength(0);
    expect(event.points[0]?.status).toBe("intended");
    expect(renderMapSpecSvgV36(event)).toContain("status: intended");
  });

  it("preserves an area anchor as presentation-only comparison metadata", () => {
    const result = adaptMapIntentToRenderSpecV36({
      geography: [
        geography[0]!,
        {
          entityId: "area",
          canonicalLabel: "Pas-de-Calais",
          latitude: 50.493,
          longitude: 2.366,
          geometrySource: "accepted-static-shadow-metadata",
          placeKind: "area",
          renderAnchorPresentationOnly: true,
        },
      ],
      intent: {
        ...common,
        compilerIntentId: "area-comparison-intent",
        disposition: "MAP",
        compilerRule: "map-spatial-comparison.v1",
        relationKind: "spatial-comparison",
        mapSemanticType: "comparison",
        places: [
          { entityId: "a" as never, canonicalLabel: "A" },
          { entityId: "area" as never, canonicalLabel: "Pas-de-Calais" },
        ],
        unorderedSemanticSet: true,
      },
    });
    expect(result.disposition).toBe("RENDER_SPEC");
    if (result.disposition !== "RENDER_SPEC") return;
    expect(result.points[1]).toMatchObject({
      role: "comparison-area-member",
      placeKind: "area",
      renderAnchorPresentationOnly: true,
    });
    expect(result.edges[0]).toMatchObject({
      directed: false,
      semanticType: "comparison-connector-not-route",
    });
  });

  it("abstains instead of resolving missing geography", () => {
    const intent: MapIntentV36 = {
      ...common,
      compilerIntentId: "area-intent",
      disposition: "MAP",
      compilerRule: "map-spatial-area.v1",
      relationKind: "spatial-area",
      mapSemanticType: "area",
      place: { entityId: "missing" as never, canonicalLabel: "Unknown" },
    };
    expect(adaptMapIntentToRenderSpecV36({ intent, geography })).toMatchObject({
      disposition: "NO_SAFE_RENDERING",
      diagnosticCode: "UNRESOLVED_GEOGRAPHY",
    });
  });
});
