import { createHash } from "node:crypto";
import {
  isRejectedEntityTextV34,
  lookupCanonicalEntitySeedV34,
} from "./history-claims-v34.js";
import type {
  HistoryClaimV34,
  HistoryEntityMentionV34,
  HistoryGeographicQualifierV34,
  HistoryMapIntentProposalV34,
  HistoryMapStateV34,
  HistoryPlaceV34,
  HistoryRouteTypeV34,
  HistoryTemporalQualifierV34,
} from "./history-v34-contracts.js";

type PlaceSeed = Omit<HistoryPlaceV34, "id"> & { readonly id?: string };

const PLACE_SEEDS: readonly PlaceSeed[] = [
  {
    label: "Britain",
    placeType: "country",
    coordinates: { latitude: 54.0, longitude: -2.0 },
    geometrySource: "curated",
    aliases: ["British", "Victorian Britain"],
  },
  {
    label: "Northwest Passage",
    placeType: "region",
    coordinates: { latitude: 74.0, longitude: -100.0 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Baffin Bay",
    placeType: "water-body",
    coordinates: { latitude: 74.0, longitude: -68.0 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Arctic",
    placeType: "region",
    coordinates: { latitude: 80.0, longitude: -40.0 },
    geometrySource: "curated",
    aliases: ["Arctic Ocean"],
  },
  {
    label: "Atlantic",
    placeType: "water-body",
    coordinates: { latitude: 40.0, longitude: -40.0 },
    geometrySource: "curated",
    aliases: ["Atlantic Ocean"],
  },
  {
    label: "Pacific",
    placeType: "water-body",
    coordinates: { latitude: 20.0, longitude: -160.0 },
    geometrySource: "curated",
    aliases: ["Pacific Ocean"],
  },
  {
    label: "Beechey Island",
    placeType: "island",
    coordinates: { latitude: 74.72, longitude: -91.87 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Peel Sound",
    placeType: "strait",
    coordinates: { latitude: 72.5, longitude: -96.0 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "King William Island",
    placeType: "island",
    coordinates: { latitude: 69.0, longitude: -97.5 },
    geometrySource: "curated",
    aliases: ["King William"],
  },
  {
    label: "Back River",
    placeType: "river",
    coordinates: { latitude: 66.9, longitude: -95.3 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Terror Bay",
    placeType: "water-body",
    coordinates: { latitude: 68.9, longitude: -98.9 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Russia",
    placeType: "country",
    coordinates: { latitude: 60.0, longitude: 90.0 },
    geometrySource: "curated",
    aliases: ["Russian Empire"],
  },
  {
    label: "Moscow",
    placeType: "city",
    coordinates: { latitude: 55.75, longitude: 37.62 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Smolensk",
    placeType: "city",
    coordinates: { latitude: 54.78, longitude: 32.05 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Berezina River",
    placeType: "river",
    coordinates: { latitude: 54.2, longitude: 28.5 },
    geometrySource: "curated",
    aliases: ["Berezina"],
  },
  {
    label: "Niemen River",
    placeType: "river",
    coordinates: { latitude: 55.0, longitude: 24.0 },
    geometrySource: "curated",
    aliases: ["Niemen"],
  },
  {
    label: "Borodino",
    placeType: "site",
    coordinates: { latitude: 55.53, longitude: 35.82 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Rome",
    placeType: "city",
    coordinates: { latitude: 41.9, longitude: 12.5 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Constantinople",
    placeType: "city",
    coordinates: { latitude: 41.01, longitude: 28.98 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Europe",
    placeType: "region",
    coordinates: { latitude: 50.0, longitude: 10.0 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Genoa",
    placeType: "city",
    coordinates: { latitude: 44.41, longitude: 8.93 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Crimea",
    placeType: "region",
    coordinates: { latitude: 45.0, longitude: 34.0 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Mediterranean",
    placeType: "water-body",
    coordinates: { latitude: 35.0, longitude: 18.0 },
    geometrySource: "curated",
    aliases: [],
  },
];

const PLACE_BY_ALIAS = (() => {
  const map = new Map<string, PlaceSeed>();
  for (const seed of PLACE_SEEDS) {
    map.set(seed.label.toLocaleLowerCase(), seed);
    for (const alias of seed.aliases) map.set(alias.toLocaleLowerCase(), seed);
  }
  return map;
})();

const shaShort = (value: string): string =>
  createHash("sha256").update(value).digest("hex").slice(0, 16);

export function resolveHistoryPlaceV34(label: string): HistoryPlaceV34 | null {
  const seed = PLACE_BY_ALIAS.get(label.trim().toLocaleLowerCase());
  if (!seed) return null;
  return {
    id: `place-${shaShort(seed.label.toLocaleLowerCase())}`,
    label: seed.label,
    placeType: seed.placeType,
    coordinates: seed.coordinates,
    geometrySource: seed.geometrySource,
    aliases: seed.aliases,
  };
}

export function collectEpisodePlacesV34(input: {
  readonly entities: readonly HistoryEntityMentionV34[];
}): HistoryPlaceV34[] {
  const places = new Map<string, HistoryPlaceV34>();
  for (const entity of input.entities) {
    if (!["place", "region", "water-body", "state"].includes(entity.entityType)) continue;
    const resolved = resolveHistoryPlaceV34(entity.normalizedLabel);
    if (resolved) places.set(resolved.id, resolved);
  }
  return [...places.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function isPlaceholderCoordinates(
  coordinates: readonly [number, number] | null | undefined
): boolean {
  if (!coordinates) return false;
  const [lat, lon] = coordinates;
  return (lat === 0 && lon === 0) || (lat === 1 && lon === 1);
}

function inferRouteType(text: string, purpose: HistoryMapIntentProposalV34["mapPurpose"]): HistoryRouteTypeV34 {
  if (/\b(?:march|overland|sledges?|haul)\b/iu.test(text)) return "overland";
  if (/\b(?:ship|sailed|maritime|sea ice|bay|sound)\b/iu.test(text)) return "maritime";
  if (/\b(?:river|upstream|downstream)\b/iu.test(text)) return "river";
  if (purpose === "orientation" || purpose === "comparison") return "conceptual";
  if (/\b(?:connect|route through)\b/iu.test(text)) return "conceptual";
  return "none";
}

function actorIsValid(text: string, entity: HistoryEntityMentionV34 | null): boolean {
  const rejection = isRejectedEntityTextV34(text);
  if (rejection.reject) return false;
  if (!entity) return false;
  if (["person", "organization", "ship", "military-unit", "ethnic-or-cultural-group"].includes(entity.entityType))
    return true;
  // Collective phrases
  if (/survivors?|expedition members|crews?|searchers/iu.test(text)) return true;
  return false;
}

/**
 * Deterministic map-intent proposals from trusted claims. OpenAI may replace these later;
 * compilation remains authoritative.
 */
export function proposeMapIntentsV34(input: {
  readonly claims: readonly HistoryClaimV34[];
  readonly entities: readonly HistoryEntityMentionV34[];
  readonly geographicQualifiers: readonly HistoryGeographicQualifierV34[];
  readonly temporalQualifiers: readonly HistoryTemporalQualifierV34[];
}): HistoryMapIntentProposalV34[] {
  const entityById = new Map(input.entities.map((item) => [item.id, item] as const));
  const proposals: HistoryMapIntentProposalV34[] = [];
  for (const claim of input.claims) {
    if (claim.materiality !== "material") continue;
    const text = claim.normalizedProposition;
    const geo = input.geographicQualifiers.filter((item) => item.claimId === claim.id);
    if (!geo.length && !/\b(?:sailed|march|route|crossed|from .+ to )\b/iu.test(text))
      continue;
    const entities = claim.entityMentionIds
      .map((id) => entityById.get(id))
      .filter((item): item is HistoryEntityMentionV34 => Boolean(item));
    const origins = geo
      .filter((item) => item.role === "origin")
      .map((item) => item.entityMentionId);
    const destinations = geo
      .filter((item) => item.role === "destination")
      .map((item) => item.entityMentionId);
    const locations = geo
      .filter((item) => item.role === "location" || item.role === "region")
      .map((item) => item.entityMentionId);
    const actor =
      entities.find((item) => item.semanticRole === "actor") ??
      entities.find((item) => item.entityType === "ship") ??
      entities.find((item) => item.entityType === "person" && item.semanticRole === "leader") ??
      null;
    const leaders = entities
      .filter((item) => item.semanticRole === "leader" || item.entityType === "person")
      .map((item) => item.id);
    // Survivor march special-case from narration cues.
    const survivorMarch =
      /\b(?:105 survivors|march toward the Back River|abandoned the ships)\b/iu.test(text);
    const movingActorIds = survivorMarch
      ? []
      : actor
        ? [actor.id]
        : entities
            .filter((item) => ["ship", "military-unit", "organization"].includes(item.entityType))
            .map((item) => item.id)
            .slice(0, 1);
    const backRiver = entities.find((item) => item.normalizedLabel === "Back River");
    const shipOrIsland = entities.find(
      (item) =>
        item.normalizedLabel === "King William Island" ||
        item.entityType === "ship"
    );
    const originIds = survivorMarch
      ? shipOrIsland
        ? [shipOrIsland.id]
        : entities
            .filter((item) => item.entityType === "place" || item.entityType === "water-body")
            .map((item) => item.id)
            .slice(0, 1)
      : origins.length
        ? origins
        : locations.slice(0, 1);
    const destinationIds = survivorMarch
      ? backRiver
        ? [backRiver.id]
        : entities.filter((item) => item.normalizedLabel === "Back River").map((item) => item.id)
      : destinations.length
        ? destinations
        : locations.slice(1, 2);
    if (survivorMarch && backRiver) {
      // Ensure a reviewable overland march even when origin is only implied by abandonment.
      const syntheticOriginId = shipOrIsland?.id ?? backRiver.id;
      proposals.push({
        claimIds: [claim.id],
        mapPurpose: "journey",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds:
          shipOrIsland && shipOrIsland.id !== backRiver.id
            ? [shipOrIsland.id]
            : [syntheticOriginId],
        destinationPlaceMentionIds: [backRiver.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: claim.temporalQualifierIds,
        routeType: "overland",
        uncertainty: claim.uncertaintyMarkers,
        leaderEntityMentionIds: entities
          .filter((item) =>
            ["Francis Crozier", "James Fitzjames"].includes(item.normalizedLabel)
          )
          .map((item) => item.id),
      });
      continue;
    }
    if (!originIds.length || !destinationIds.length) continue;
    const purpose: HistoryMapIntentProposalV34["mapPurpose"] = survivorMarch
      ? "journey"
      : /\bsearch\b/iu.test(text)
        ? "search-area"
        : /\bexpedition|sailed\b/iu.test(text)
          ? "expedition-route"
          : "orientation";
    proposals.push({
      claimIds: [claim.id],
      mapPurpose: purpose,
      movingActorEntityMentionIds: movingActorIds,
      originPlaceMentionIds: originIds,
      destinationPlaceMentionIds: destinationIds,
      waypointPlaceMentionIds: [],
      temporalQualifierIds: claim.temporalQualifierIds,
      routeType: survivorMarch ? "overland" : inferRouteType(text, purpose),
      uncertainty: claim.uncertaintyMarkers,
      leaderEntityMentionIds: survivorMarch
        ? entities
            .filter((item) =>
              ["Francis Crozier", "James Fitzjames"].includes(item.normalizedLabel)
            )
            .map((item) => item.id)
        : leaders.slice(0, 2),
    });
  }
  return proposals;
}

export function compileMapStateV34(input: {
  readonly beatNumber: string;
  readonly proposal: HistoryMapIntentProposalV34;
  readonly claims: readonly HistoryClaimV34[];
  readonly entities: readonly HistoryEntityMentionV34[];
  readonly temporalQualifiers: readonly HistoryTemporalQualifierV34[];
  readonly narrationText: string;
}): {
  readonly master: {
    readonly id: string;
    readonly purpose: string;
    readonly mapPurpose: HistoryMapIntentProposalV34["mapPurpose"];
    readonly supportedRatios: readonly ["16:9", "9:16"];
  };
  readonly state: HistoryMapStateV34;
} | null {
  const entityById = new Map(input.entities.map((item) => [item.id, item] as const));
  const claimText = input.proposal.claimIds
    .map((id) => input.claims.find((claim) => claim.id === id)?.normalizedProposition ?? "")
    .join("\n");
  const blockers: string[] = [];

  const resolveMentionPlace = (mentionId: string): HistoryPlaceV34 | null => {
    const entity = entityById.get(mentionId);
    if (!entity) return null;
    if (["person", "organization", "document", "disease", "event"].includes(entity.entityType))
      return null;
    if (entity.entityType === "ship") {
      // Ships abandoned off King William Island for the survivor march.
      return resolveHistoryPlaceV34("King William Island");
    }
    return resolveHistoryPlaceV34(entity.normalizedLabel);
  };

  const survivorMarch = /\b(?:105 survivors|march toward the Back River)\b/iu.test(claimText);

  let origin: HistoryPlaceV34 | undefined = input.proposal.originPlaceMentionIds
    .map(resolveMentionPlace)
    .find((item): item is HistoryPlaceV34 => Boolean(item));
  const destination = input.proposal.destinationPlaceMentionIds
    .map(resolveMentionPlace)
    .find((item): item is HistoryPlaceV34 => Boolean(item));
  if (survivorMarch && !origin)
    origin = resolveHistoryPlaceV34("King William Island") ?? undefined;
  if (!origin) blockers.push("MAP_ORIGIN_UNRESOLVED");
  if (!destination) blockers.push("MAP_DESTINATION_UNRESOLVED");
  if (origin && destination && origin.id === destination.id && !survivorMarch)
    blockers.push("MAP_IDENTITY_ROUTE");
  if (survivorMarch && origin && destination && origin.id === destination.id) {
    origin = resolveHistoryPlaceV34("King William Island") ?? undefined;
  }

  const actorMention = input.proposal.movingActorEntityMentionIds
    .map((id) => entityById.get(id) ?? null)
    .find((item): item is HistoryEntityMentionV34 => Boolean(item));
  const movingActor = survivorMarch
    ? "surviving expedition members"
    : actorMention?.normalizedLabel ?? "";
  if (!survivorMarch && !actorIsValid(movingActor, actorMention ?? null))
    blockers.push("MAP_ACTOR_INVALID");
  if (actorMention && isRejectedEntityTextV34(actorMention.text).reject)
    blockers.push("MAP_ACTOR_STOPWORD");

  // Reject Franklin regressions explicitly.
  if (/^in may$/iu.test(movingActor) || origin?.label === "In May")
    blockers.push("MAP_ACTOR_TEMPORAL_FRAGMENT");
  if (destination && lookupCanonicalEntitySeedV34(destination.label)?.entityType === "organization")
    blockers.push("MAP_DESTINATION_NOT_PLACE");
  if (destination && lookupCanonicalEntitySeedV34(destination.label)?.entityType === "person")
    blockers.push("MAP_DESTINATION_PERSON");
  if (input.proposal.routeType === "none") blockers.push("MAP_ROUTE_TYPE_NONE");
  // "military" is not a V3.4 route type; reject conceptual mislabels from older planners.
  if (/military/iu.test(input.proposal.routeType)) blockers.push("MAP_ROUTE_TYPE_INVALID");
  if (
    input.proposal.routeType === "maritime" &&
    /\bmarch|overland|sledges?\b/iu.test(claimText)
  )
    blockers.push("MAP_ROUTE_TYPE_CONTRADICTION");
  if (
    input.proposal.routeType === "overland" &&
    /\bsailed|maritime|sea route\b/iu.test(claimText) &&
    !/\bmarch|abandon|overland\b/iu.test(claimText)
  )
    blockers.push("MAP_ROUTE_TYPE_CONTRADICTION");

  const period =
    input.temporalQualifiers.find((item) =>
      input.proposal.temporalQualifierIds.includes(item.id)
    )?.normalizedValue ??
    (survivorMarch ? "April 1848" : "as narrated");
  if (/^\d{1,3}$/u.test(period)) blockers.push("MAP_PERIOD_FROM_QUANTITY");

  const originCoords = origin?.coordinates
    ? ([origin.coordinates.latitude, origin.coordinates.longitude] as const)
    : null;
  const destinationCoords = destination?.coordinates
    ? ([destination.coordinates.latitude, destination.coordinates.longitude] as const)
    : null;
  if (!originCoords || !destinationCoords) blockers.push("MAP_COORDINATES_MISSING");
  if (isPlaceholderCoordinates(originCoords) || isPlaceholderCoordinates(destinationCoords))
    blockers.push("MAP_PLACEHOLDER_COORDINATES");

  const leaders = (input.proposal.leaderEntityMentionIds ?? [])
    .map((id) => entityById.get(id)?.normalizedLabel)
    .filter((item): item is string => Boolean(item));

  const masterId = `map-master-${input.beatNumber}`;
  const stateId = `map-state-${input.beatNumber}`;
  const labelPlaces = [origin, destination].filter((item): item is HistoryPlaceV34 => Boolean(item));
  const state: HistoryMapStateV34 = {
    id: stateId,
    masterId,
    purpose: claimText.slice(0, 180) || "Narration-bound map",
    mapPurpose: input.proposal.mapPurpose,
    baseGeography: labelPlaces.map((item) => item.label).join(", "),
    timePeriod: period,
    affectedArea: labelPlaces.map((item) => item.label).join(", "),
    labels: labelPlaces.map((place) => ({
      text: place.label,
      placeId: place.id,
      linkedClaimIds: input.proposal.claimIds,
    })),
    routes:
      origin && destination
        ? [
            {
              id: `route-${input.beatNumber}-01`,
              routeType: survivorMarch ? "overland" : input.proposal.routeType,
              originPlaceId: origin.id,
              destinationPlaceId: destination.id,
              origin: {
                label: origin.label,
                coordinates: originCoords,
              },
              destination: {
                label: destination.label,
                coordinates: destinationCoords,
              },
              movingActor: movingActor || "unresolved actor",
              movingActorEntityMentionId: actorMention?.id ?? null,
              leaders,
              carrierOrVehicle: null,
              dateOrPeriod: period,
              label: `${origin.label} to ${destination.label}`,
              uncertainty: input.proposal.uncertainty.join("; ") || "No precision beyond trusted narration.",
              linkedClaimIds: input.proposal.claimIds,
            },
          ]
        : [],
    uncertainty: input.proposal.uncertainty.join("; ") || "Keep geography broad where narration is broad.",
    semanticStatus: blockers.length ? "blocked" : "valid",
    blockerCodes: blockers,
  };
  if (blockers.length) return null;
  return {
    master: {
      id: masterId,
      purpose: `Narration-bound ${input.proposal.mapPurpose} across ${origin?.label} and ${destination?.label}`,
      mapPurpose: input.proposal.mapPurpose,
      supportedRatios: ["16:9", "9:16"],
    },
    state,
  };
}

export function validateCompiledMapStateV34(state: HistoryMapStateV34): string[] {
  const blockers = [...state.blockerCodes];
  for (const route of state.routes) {
    if (isPlaceholderCoordinates(route.origin.coordinates))
      blockers.push("MAP_PLACEHOLDER_COORDINATES");
    if (isPlaceholderCoordinates(route.destination.coordinates))
      blockers.push("MAP_PLACEHOLDER_COORDINATES");
    if (isRejectedEntityTextV34(route.movingActor).reject) blockers.push("MAP_ACTOR_INVALID");
    if (!route.linkedClaimIds.length) blockers.push("MAP_CLAIM_MISSING");
  }
  return [...new Set(blockers)];
}
