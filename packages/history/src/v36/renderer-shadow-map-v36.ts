import {
  HISTORY_RENDERER_SHADOW_SCHEMA_V36,
  HISTORY_RENDERER_SHADOW_VERSION_V36,
  renderSpecIdV36,
  type MapRenderSpecV36,
  type NoSafeRenderingV36,
  type RenderEdgeV36,
  type RenderPointV36,
  type RendererRuleV36,
  type ResolvedGeographyV36,
} from "./renderer-shadow-contract-v36.js";
import type { MapIntentV36 } from "./compiler-shadow-contract-v36.js";
import type { PlaceRefV36 } from "./explanatory-relation-v36.js";

const WIDTH = 1200 as const;
const HEIGHT = 675 as const;
const PAD = 0.12 as const;

function abstain(intent: MapIntentV36, reason: string): NoSafeRenderingV36 {
  return {
    schemaVersion: HISTORY_RENDERER_SHADOW_SCHEMA_V36,
    rendererVersion: HISTORY_RENDERER_SHADOW_VERSION_V36,
    disposition: "NO_SAFE_RENDERING",
    compilerIntentId: intent.compilerIntentId,
    relationId: intent.relationId,
    relationKind: intent.relationKind,
    episodeId: intent.episodeId,
    shadowOnly: true,
    provenance: intent.provenance,
    diagnosticCode: "UNRESOLVED_GEOGRAPHY",
    reason,
  };
}

function requiredPlaces(intent: MapIntentV36): readonly PlaceRefV36[] {
  switch (intent.relationKind) {
    case "movement":
      return [intent.from, ...intent.via, intent.to];
    case "spatial-comparison":
      return intent.places;
    case "spatial-area":
      return [intent.place];
    case "event-location":
      return [intent.location];
  }
}

function rule(intent: MapIntentV36): RendererRuleV36 {
  return `map-${intent.relationKind}-svg.v1`;
}

export function adaptMapIntentToRenderSpecV36(input: {
  readonly intent: MapIntentV36;
  readonly geography: readonly ResolvedGeographyV36[];
}): MapRenderSpecV36 | NoSafeRenderingV36 {
  const geography = new Map(input.geography.map((place) => [place.entityId, place]));
  const refs = requiredPlaces(input.intent);
  const resolved = refs.map((ref) => geography.get(ref.entityId));
  const missing = refs.filter((_, index) => !resolved[index]);
  if (missing.length > 0)
    return abstain(
      input.intent,
      `No accepted coordinates for ${missing.map((place) => place.entityId).join(", ")}.`
    );

  const places = resolved as readonly ResolvedGeographyV36[];
  const latitudes = places.map((place) => place.latitude);
  const longitudes = places.map((place) => place.longitude);
  const rawMinLat = Math.min(...latitudes);
  const rawMaxLat = Math.max(...latitudes);
  const rawMinLon = Math.min(...longitudes);
  const rawMaxLon = Math.max(...longitudes);
  const latSpan = Math.max(rawMaxLat - rawMinLat, 2);
  const lonSpan = Math.max(rawMaxLon - rawMinLon, 2);
  const viewport = {
    minLatitude: rawMinLat - latSpan * PAD,
    maxLatitude: rawMaxLat + latSpan * PAD,
    minLongitude: rawMinLon - lonSpan * PAD,
    maxLongitude: rawMaxLon + lonSpan * PAD,
    paddingRatio: PAD,
  };
  const project = (place: ResolvedGeographyV36) => ({
    x:
      90 +
      ((place.longitude - viewport.minLongitude) /
        (viewport.maxLongitude - viewport.minLongitude)) *
        (WIDTH - 180),
    y:
      80 +
      ((viewport.maxLatitude - place.latitude) /
        (viewport.maxLatitude - viewport.minLatitude)) *
        (HEIGHT - 160),
  });
  const roleAt = (index: number): string => {
    if (input.intent.relationKind === "movement") {
      if (index === 0) return "origin";
      if (index === refs.length - 1) return "destination";
      return `via-${index}`;
    }
    return input.intent.relationKind === "event-location"
      ? "event-location"
      : input.intent.relationKind === "spatial-comparison"
        ? "comparison-member"
        : "area";
  };
  const points: RenderPointV36[] = places.map((place, index) => {
    const position = project(place);
    return {
      id: refs[index]!.entityId,
      label:
        input.intent.relationKind === "event-location"
          ? `${input.intent.event.canonicalLabel} @ ${refs[index]!.canonicalLabel}`
          : refs[index]!.canonicalLabel,
      ...position,
      role: roleAt(index),
      ...(input.intent.relationKind === "event-location"
        ? { status: input.intent.assertionStatus }
        : {}),
    };
  });
  let edges: readonly RenderEdgeV36[] = [];
  if (input.intent.relationKind === "movement") {
    edges = points.slice(1).map((point, index) => ({
      from: points[index]!.id,
      to: point.id,
      semanticType: "movement-route",
      directed: true,
    }));
  } else if (input.intent.relationKind === "spatial-comparison") {
    edges = points.slice(1).map((point) => ({
      from: points[0]!.id,
      to: point.id,
      semanticType: "comparison-connector-not-route",
      directed: false,
    }));
  }
  return {
    schemaVersion: HISTORY_RENDERER_SHADOW_SCHEMA_V36,
    rendererVersion: HISTORY_RENDERER_SHADOW_VERSION_V36,
    disposition: "RENDER_SPEC",
    renderSpecId: renderSpecIdV36({
      compilerIntentId: input.intent.compilerIntentId,
      semanticPayload: input.intent,
    }),
    compilerIntentId: input.intent.compilerIntentId,
    relationId: input.intent.relationId,
    relationKind: input.intent.relationKind,
    episodeId: input.intent.episodeId,
    rendererRule: rule(input.intent),
    shadowOnly: true,
    provenance: input.intent.provenance,
    width: WIDTH,
    height: HEIGHT,
    renderTarget: "MAP_SVG",
    semanticPayload: input.intent,
    points,
    edges,
    viewport,
  };
}

function escape(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

export function renderMapSpecSvgV36(spec: MapRenderSpecV36): string {
  const byId = new Map(spec.points.map((point) => [point.id, point]));
  const edges = spec.edges
    .map((edge) => {
      const from = byId.get(edge.from)!;
      const to = byId.get(edge.to)!;
      const comparison = edge.semanticType === "comparison-connector-not-route";
      return `<line x1="${from.x.toFixed(2)}" y1="${from.y.toFixed(2)}" x2="${to.x.toFixed(2)}" y2="${to.y.toFixed(2)}" stroke="${comparison ? "#766b5e" : "#9e3f35"}" stroke-width="${comparison ? 3 : 5}" ${comparison ? 'stroke-dasharray="12 10"' : 'marker-end="url(#arrow)"'}/>`;
    })
    .join("");
  const points = spec.points
    .map((point) => {
      const intended = point.status === "intended";
      return `<g><circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${intended ? 15 : 12}" fill="${intended ? "#fff4ce" : "#244f5a"}" stroke="${intended ? "#b47812" : "#fff"}" stroke-width="4" ${intended ? 'stroke-dasharray="5 4"' : ""}/><text x="${(point.x + 18).toFixed(2)}" y="${(point.y - 10).toFixed(2)}" font-size="24" font-family="system-ui,sans-serif" fill="#17130f">${escape(point.label)}</text>${point.status ? `<text x="${(point.x + 18).toFixed(2)}" y="${(point.y + 17).toFixed(2)}" font-size="18" font-family="system-ui,sans-serif" fill="#81550c">status: ${escape(point.status)}</text>` : ""}</g>`;
    })
    .join("");
  const legend =
    spec.relationKind === "spatial-comparison"
      ? "comparison connector — not movement"
      : spec.relationKind === "event-location"
        ? "event-location status preserved — no route"
        : spec.relationKind === "movement"
          ? "accepted movement route"
          : "accepted spatial area";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#9e3f35"/></marker></defs><rect width="100%" height="100%" fill="#f4f1e8"/><path d="M70 110 C250 40 360 170 530 95 S850 70 1130 145 L1130 560 C900 630 680 530 470 600 S180 560 70 610 Z" fill="#d9dfcc" stroke="#b2baa6" stroke-width="3"/>${edges}${points}<rect x="28" y="22" width="700" height="50" rx="8" fill="#17130f"/><text x="48" y="55" font-size="24" font-family="system-ui,sans-serif" fill="#f4f1e8">${escape(spec.relationKind)} · ${escape(legend)}</text></svg>\n`;
}
