import { describe, expect, it } from "vitest";

import {
  canonicalGeographyByEntityIdV36,
  canonicalGeographySidecarV36,
} from "./canonical-geography-sidecar-v36.js";

describe("V3.6 canonical geography sidecar", () => {
  it("contains only the accepted canonical entity IDs", () => {
    expect(canonicalGeographySidecarV36.map((entry) => entry.canonicalPlaceId)).toEqual([
      "entity-0913aa503e79149bb3248b18",
      "entity-4361e741ab5cf8f9151d8ca9",
    ]);
    expect(canonicalGeographyByEntityIdV36("Calais")).toBeUndefined();
    expect(canonicalGeographyByEntityIdV36("unknown-place")).toBeUndefined();
  });

  it("keeps Calais distinct from the Pas-de-Calais area anchor", () => {
    const calais = canonicalGeographyByEntityIdV36(
      "entity-4361e741ab5cf8f9151d8ca9"
    )!;
    const area = canonicalGeographyByEntityIdV36(
      "entity-0913aa503e79149bb3248b18"
    )!;
    expect(calais.geometry.type).toBe("Point");
    expect(area.geometry.type).toBe("Area");
    expect(area.renderAnchor.presentationOnly).toBe(true);
    expect(area.renderAnchor).not.toEqual(calais.renderAnchor);
    expect(area.provenance.runtimeLookup).toBe(false);
  });
});
