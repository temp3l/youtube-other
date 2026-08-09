import { describe, expect, it } from "vitest";

import {
  claimIdV36,
  createExplanatoryRelationV36,
  entityIdV36,
  episodeIdV36,
  sourceSpanIdV36,
} from "./explanatory-relation-v36.js";
import { compileMapRelationV36 } from "./compiler-shadow-map-v36.js";

const episodeId = episodeIdV36("episode-map-compiler");
const claimId = claimIdV36("claim-map");
const place = (id: string, canonicalLabel: string) => ({
  entityId: entityIdV36(id),
  canonicalLabel,
});
const provenance = {
  structuredPropositionIds: ["structured-map"],
  atomicGroundingIds: ["grounding-map"],
};

describe("History V3.6 strict shadow map compiler", () => {
  it("preserves explicit movement endpoints and via order without inventing an actor", () => {
    const relation = createExplanatoryRelationV36({
      episodeId,
      kind: "movement",
      from: place("place-origin", "Origin"),
      to: place("place-destination", "Destination"),
      via: [place("place-via-b", "Via B"), place("place-via-a", "Via A")],
      supportClaimIds: [claimId],
    });
    const compiled = compileMapRelationV36(relation, provenance);
    expect(compiled).toMatchObject({
      disposition: "MAP",
      relationKind: "movement",
      compilerRule: "map-movement.v1",
      from: relation.from,
      to: relation.to,
      via: relation.via,
      relationId: relation.id,
      shadowOnly: true,
    });
    expect(compiled).not.toHaveProperty("actor");
    expect(compiled).not.toHaveProperty("narration");
    expect(compiled.provenance.evidenceFingerprint).toBe(
      relation.evidenceFingerprint
    );
  });

  it("compiles spatial comparison as an unordered comparison, never a route", () => {
    const relation = createExplanatoryRelationV36({
      episodeId,
      kind: "spatial-comparison",
      places: [place("place-z", "Z"), place("place-a", "A")],
      supportClaimIds: [claimId],
    });
    const compiled = compileMapRelationV36(relation, provenance);
    expect(compiled).toMatchObject({
      disposition: "MAP",
      mapSemanticType: "comparison",
      unorderedSemanticSet: true,
    });
    if (compiled.disposition !== "MAP" || compiled.relationKind !== "spatial-comparison")
      throw new Error("Expected spatial comparison map intent.");
    expect(compiled.places.map((item) => item.entityId)).toEqual([
      "place-a",
      "place-z",
    ]);
    expect(compiled).not.toHaveProperty("from");
    expect(compiled).not.toHaveProperty("to");
  });

  it("keeps spatial area distinct from generic location and movement", () => {
    const relation = createExplanatoryRelationV36({
      episodeId,
      kind: "spatial-area",
      place: place("place-area", "Accepted area"),
      supportClaimIds: [claimId],
    });
    expect(compileMapRelationV36(relation, provenance)).toMatchObject({
      disposition: "MAP",
      relationKind: "spatial-area",
      mapSemanticType: "area",
      place: relation.place,
    });
  });

  it("preserves intended event-location semantics without converting to movement", () => {
    const relation = createExplanatoryRelationV36({
      episodeId,
      kind: "event-location",
      event: {
        canonicalLabel: "accepted operation",
        entityId: entityIdV36("event-operation"),
        sourceSpanIds: [sourceSpanIdV36("span-event")],
        eventType: "operation",
      },
      location: place("place-calais", "Calais"),
      assertionStatus: "intended",
      supportClaimIds: [claimId],
    });
    const compiled = compileMapRelationV36(relation, provenance);
    expect(compiled).toMatchObject({
      disposition: "MAP",
      relationKind: "event-location",
      mapSemanticType: "event-location",
      assertionStatus: "intended",
      event: relation.event,
      location: relation.location,
    });
    expect(compiled).not.toHaveProperty("from");
    expect(compiled).not.toHaveProperty("to");
  });

  it("is deterministic and fails closed for a diagram relation", () => {
    const movement = createExplanatoryRelationV36({
      episodeId,
      kind: "movement",
      from: place("place-a", "A"),
      to: place("place-b", "B"),
      via: [],
      supportClaimIds: [claimId],
    });
    expect(compileMapRelationV36(movement, provenance)).toEqual(
      compileMapRelationV36(movement, provenance)
    );

    const causal = createExplanatoryRelationV36({
      episodeId,
      kind: "causal",
      cause: { canonicalLabel: "cause" },
      effect: { canonicalLabel: "effect" },
      supportClaimIds: [claimId],
    });
    expect(compileMapRelationV36(causal, provenance)).toMatchObject({
      disposition: "NO_SAFE_COMPILATION",
      diagnosticCode: "RELATION_KIND_NOT_MAP_COMPILABLE",
      relationId: causal.id,
    });
  });
});
