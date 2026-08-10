/**
 * Small, accepted static V3.6 shadow-only geography supplement.
 * It is keyed solely by compiler-resolved entity IDs; no name lookup occurs here.
 */
export const HISTORY_CANONICAL_GEOGRAPHY_SIDECAR_SCHEMA_V36 =
  "history-canonical-geography-sidecar.v1" as const;

export type CanonicalGeographyV36 =
  | {
      readonly canonicalPlaceId: "entity-4361e741ab5cf8f9151d8ca9";
      readonly canonicalName: "Calais";
      readonly placeKind: "point";
      readonly geometry: {
        readonly type: "Point";
        readonly latitude: 50.9513;
        readonly longitude: 1.8587;
      };
      readonly renderAnchor: {
        readonly latitude: 50.9513;
        readonly longitude: 1.8587;
        readonly presentationOnly: false;
      };
      readonly crs: "EPSG:4326";
      readonly provenance: {
        readonly source: "accepted-static-shadow-metadata";
        readonly scope: "history-v3.6-renderer-shadow-phase-2.33";
        readonly runtimeLookup: false;
      };
    }
  | {
      readonly canonicalPlaceId: "entity-0913aa503e79149bb3248b18";
      readonly canonicalName: "Pas-de-Calais";
      readonly placeKind: "area";
      /** No local authoritative boundary asset exists; never substitute Calais. */
      readonly geometry: {
        readonly type: "Area";
        readonly boundary: "not-embedded";
      };
      /** Viewport/label anchor only; it is not a semantic point geometry. */
      readonly renderAnchor: {
        readonly latitude: 50.493;
        readonly longitude: 2.366;
        readonly presentationOnly: true;
      };
      readonly crs: "EPSG:4326";
      readonly provenance: {
        readonly source: "accepted-static-shadow-metadata";
        readonly scope: "history-v3.6-renderer-shadow-phase-2.33";
        readonly runtimeLookup: false;
      };
    };

export const canonicalGeographySidecarV36: readonly CanonicalGeographyV36[] = [
  {
    canonicalPlaceId: "entity-0913aa503e79149bb3248b18",
    canonicalName: "Pas-de-Calais",
    placeKind: "area",
    geometry: { type: "Area", boundary: "not-embedded" },
    renderAnchor: { latitude: 50.493, longitude: 2.366, presentationOnly: true },
    crs: "EPSG:4326",
    provenance: {
      source: "accepted-static-shadow-metadata",
      scope: "history-v3.6-renderer-shadow-phase-2.33",
      runtimeLookup: false,
    },
  },
  {
    canonicalPlaceId: "entity-4361e741ab5cf8f9151d8ca9",
    canonicalName: "Calais",
    placeKind: "point",
    geometry: { type: "Point", latitude: 50.9513, longitude: 1.8587 },
    renderAnchor: { latitude: 50.9513, longitude: 1.8587, presentationOnly: false },
    crs: "EPSG:4326",
    provenance: {
      source: "accepted-static-shadow-metadata",
      scope: "history-v3.6-renderer-shadow-phase-2.33",
      runtimeLookup: false,
    },
  },
];

const byCanonicalPlaceId = new Map(
  canonicalGeographySidecarV36.map((entry) => [entry.canonicalPlaceId, entry])
);

/** Fail closed: only the two explicit accepted entity IDs resolve here. */
export function canonicalGeographyByEntityIdV36(
  entityId: string
): CanonicalGeographyV36 | undefined {
  return byCanonicalPlaceId.get(entityId as CanonicalGeographyV36["canonicalPlaceId"]);
}
