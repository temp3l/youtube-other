import { describe, expect, it } from "vitest";
import {
  claimHasExplicitRouteEndpoints,
  claimUsesNonRouteMovementVerbOnly,
  placeIsContainedInV35,
  validateMovementRouteSemanticsV35,
} from "./history-map-route-semantics-v35.js";
import {
  claimUsesNonRouteMovementVerbOnly,
  isMacroCentroidPlace,
  placeIsContainedInV35,
  validateMovementRouteSemanticsV35,
} from "./history-map-route-semantics-v35.js";

describe("History V3.5 map route semantics", () => {
  it("detects containment conflicts for city-to-country routes", () => {
    expect(placeIsContainedInV35("Smolensk", "Russia")).toBe(true);
    expect(placeIsContainedInV35("Moscow", "Russian Empire")).toBe(true);
    expect(placeIsContainedInV35("Niemen River", "Russia")).toBe(false);
  });

  it("rejects Smolensk capture as non-route movement", () => {
    const text =
      "Napoleon captured Smolensk after heavy fighting in August, but the Russian army escaped again.";
    expect(claimUsesNonRouteMovementVerbOnly(text)).toBe(true);
    expect(claimHasExplicitRouteEndpoints(text)).toBe(false);
  });

  it("flags macro-centroid destination for Niemen crossing into Russia", () => {
    const origin = { id: "niemen", label: "Niemen River", coordinates: { latitude: 55, longitude: 24 } };
    const destination = { id: "russia", label: "Russia", coordinates: { latitude: 60, longitude: 90 } };
    expect(
      validateMovementRouteSemanticsV35({
        claimText:
          "On June 24, 1812, soldiers began crossing the Niemen River into the Russian Empire.",
        origin,
        destination,
        movingActor: "soldiers",
      })
    ).toContain("MAP_ROUTE_MACRO_CENTROID_DESTINATION");
  });

  it("flags actor mismatch when Russian army escapes but Napoleon is moving actor", () => {
    const origin = { id: "smolensk", label: "Smolensk", coordinates: { latitude: 54.78, longitude: 32.05 } };
    const destination = { id: "russia", label: "Russia", coordinates: { latitude: 60, longitude: 90 } };
    expect(
      validateMovementRouteSemanticsV35({
        claimText:
          "Napoleon captured Smolensk after heavy fighting in August, but the Russian army escaped again.",
        origin,
        destination,
        movingActor: "Napoleon Bonaparte",
      })
    ).toEqual(
      expect.arrayContaining([
        "MAP_ROUTE_SEMANTIC_CONTAINMENT_CONFLICT",
        "MAP_ROUTE_MOVEMENT_PREDICATE_MISMATCH",
        "MAP_ROUTE_ACTOR_MISMATCH",
      ])
    );
  });
});
