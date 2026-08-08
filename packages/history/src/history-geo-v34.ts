import { createHash } from "node:crypto";
import {
  isCredibleGeographicCandidateV35,
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
import {
  claimAuthorizesRouteMovement,
  claimHasDiscoveryGeography,
  claimIdsSupportingMapLabelV34,
  deriveLongTextOnlyRemediationV34,
  isRouteMapPurpose,
  isSinglePlaceMapPurpose,
  mapIntentSignature,
  normalizeMapPurposeForProposal,
} from "./history-visual-semantics-v34.js";

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
    label: "Middle East",
    placeType: "region",
    coordinates: { latitude: 31.0, longitude: 41.0 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "North Atlantic",
    placeType: "water-body",
    coordinates: { latitude: 45.0, longitude: -40.0 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Mamluk Egypt",
    placeType: "region",
    coordinates: { latitude: 30.0, longitude: 31.2 },
    geometrySource: "curated",
    aliases: ["Mamluks", "Mamluk"],
  },
  {
    label: "Ptolemaic Egypt",
    placeType: "region",
    coordinates: { latitude: 30.0, longitude: 31.2 },
    geometrySource: "curated",
    aliases: ["Ptolemaic"],
  },
  {
    label: "Soviet Union",
    placeType: "region",
    coordinates: { latitude: 55.75, longitude: 37.62 },
    geometrySource: "curated",
    aliases: ["USSR", "Soviets"],
  },
  {
    label: "United States",
    placeType: "country",
    coordinates: { latitude: 38.9, longitude: -77.0 },
    geometrySource: "curated",
    aliases: ["U.S.", "US", "America"],
  },
  {
    label: "Cuba",
    placeType: "country",
    coordinates: { latitude: 23.1, longitude: -82.4 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Khwarazmian Empire",
    placeType: "region",
    coordinates: { latitude: 41.0, longitude: 61.0 },
    geometrySource: "curated",
    aliases: ["Khwarazm"],
  },
  {
    label: "Poland",
    placeType: "region",
    coordinates: { latitude: 52.0, longitude: 19.0 },
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
    aliases: ["Eastern Mediterranean"],
  },
  {
    label: "Black Sea",
    placeType: "water-body",
    coordinates: { latitude: 43.0, longitude: 34.0 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Messina",
    placeType: "city",
    coordinates: { latitude: 38.19, longitude: 15.55 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Egypt",
    placeType: "region",
    coordinates: { latitude: 26.8, longitude: 30.8 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Anatolia",
    placeType: "region",
    coordinates: { latitude: 39.0, longitude: 35.0 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Aegean",
    placeType: "water-body",
    coordinates: { latitude: 38.0, longitude: 25.0 },
    geometrySource: "curated",
    aliases: ["the Aegean"],
  },
  {
    label: "Levant",
    placeType: "region",
    coordinates: { latitude: 33.5, longitude: 36.0 },
    geometrySource: "curated",
    aliases: ["the Levant"],
  },
  {
    label: "Cyprus",
    placeType: "island",
    coordinates: { latitude: 35.0, longitude: 33.0 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Hattusa",
    placeType: "city",
    coordinates: { latitude: 40.02, longitude: 34.62 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Hittite Empire",
    placeType: "region",
    coordinates: { latitude: 39.5, longitude: 35.5 },
    geometrySource: "curated",
    aliases: ["Hittite"],
  },
  {
    label: "Mycenae",
    placeType: "city",
    coordinates: { latitude: 37.73, longitude: 22.76 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Pylos",
    placeType: "city",
    coordinates: { latitude: 36.96, longitude: 21.69 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Medinet Habu",
    placeType: "city",
    coordinates: { latitude: 25.72, longitude: 32.61 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Eastern Europe",
    placeType: "region",
    coordinates: { latitude: 52.0, longitude: 25.0 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "North America",
    placeType: "region",
    coordinates: { latitude: 45.0, longitude: -100.0 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Austria",
    placeType: "country",
    coordinates: { latitude: 47.5, longitude: 14.5 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "France",
    placeType: "country",
    coordinates: { latitude: 46.0, longitude: 2.0 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Carthage",
    placeType: "city",
    coordinates: { latitude: 36.85, longitude: 10.32 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Gaul",
    placeType: "region",
    coordinates: { latitude: 46.0, longitude: 2.5 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Danube",
    placeType: "river",
    coordinates: { latitude: 48.0, longitude: 20.0 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Friedland",
    placeType: "city",
    coordinates: { latitude: 54.45, longitude: 21.02 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Maloyaroslavets",
    placeType: "city",
    coordinates: { latitude: 55.01, longitude: 36.46 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Alexandria",
    placeType: "city",
    coordinates: { latitude: 31.2, longitude: 29.92 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Pompeii",
    placeType: "city",
    coordinates: { latitude: 40.75, longitude: 14.49 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Stabiae",
    placeType: "city",
    coordinates: { latitude: 40.7, longitude: 14.48 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Mount Vesuvius",
    placeType: "site",
    coordinates: { latitude: 40.82, longitude: 14.43 },
    geometrySource: "curated",
    aliases: ["Vesuvius"],
  },
  {
    label: "Cannae",
    placeType: "site",
    coordinates: { latitude: 41.3, longitude: 16.15 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Lake Trasimene",
    placeType: "water-body",
    coordinates: { latitude: 43.07, longitude: 12.13 },
    geometrySource: "curated",
    aliases: ["Trasimene"],
  },
  {
    label: "Trebia River",
    placeType: "river",
    coordinates: { latitude: 45.06, longitude: 9.7 },
    geometrySource: "curated",
    aliases: ["Trebia"],
  },
  {
    label: "Gaugamela",
    placeType: "site",
    coordinates: { latitude: 36.37, longitude: 43.15 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Babylon",
    placeType: "city",
    coordinates: { latitude: 32.54, longitude: 44.42 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "East Anglia",
    placeType: "region",
    coordinates: { latitude: 52.5, longitude: 1.0 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Wessex",
    placeType: "region",
    coordinates: { latitude: 51.0, longitude: -1.5 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Normandy",
    placeType: "region",
    coordinates: { latitude: 49.0, longitude: 0.5 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Stamford Bridge",
    placeType: "site",
    coordinates: { latitude: 53.99, longitude: -0.91 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "York",
    placeType: "city",
    coordinates: { latitude: 53.96, longitude: -1.08 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Adrianople",
    placeType: "city",
    coordinates: { latitude: 41.68, longitude: 26.56 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Halicarnassus",
    placeType: "city",
    coordinates: { latitude: 37.04, longitude: 27.43 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Mytilene",
    placeType: "city",
    coordinates: { latitude: 39.11, longitude: 26.56 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Plataea",
    placeType: "site",
    coordinates: { latitude: 38.22, longitude: 23.25 },
    geometrySource: "curated",
    aliases: [],
  },
  {
    label: "Sparta",
    placeType: "city",
    coordinates: { latitude: 37.08, longitude: 22.43 },
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
  if (
    /survivors?|expedition members|crews?|searchers|Grande Armée|Napoleon'?s army|merchant ships|narrated expedition|Royal Navy expedition|search expeditions|HMS Erebus/i.test(
      text
    )
  )
    return true;
  return false;
}

function findClaimByPattern(
  claims: readonly HistoryClaimV34[],
  pattern: RegExp
): HistoryClaimV34 | undefined {
  return claims.find((claim) => pattern.test(claim.normalizedProposition));
}

function findEntityMention(
  entities: readonly HistoryEntityMentionV34[],
  label: string,
  claimId?: string
): HistoryEntityMentionV34 | undefined {
  const matches = entities.filter((item) => item.normalizedLabel === label);
  if (claimId) return matches.find((item) => item.claimId === claimId) ?? matches[0];
  return matches[0];
}

function collectiveMapActor(claimText: string): string {
  if (/\b(?:105 survivors|surviving expedition members)\b/iu.test(claimText))
    return "surviving expedition members";
  if (/\bGrande Armée\b/iu.test(claimText)) return "Grande Armée";
  if (/\bNapoleon(?:'s)? army\b/iu.test(claimText)) return "Napoleon's army";
  if (/\b(?:Canadian search|searchers?)\b/iu.test(claimText)) return "search expeditions";
  if (/\b(?:merchant ships|ships arrived)\b/iu.test(claimText)) return "merchant ships";
  if (/\b(?:Erebus|Terror|Royal Navy ships|two Royal Navy ships)\b/iu.test(claimText))
    return "HMS Erebus and HMS Terror";
  if (/\bRoyal Navy\b/iu.test(claimText)) return "Royal Navy expedition";
  return "narrated expedition";
}

function orientationLikePurpose(
  purpose: HistoryMapIntentProposalV34["mapPurpose"]
): boolean {
  return (
    isSinglePlaceMapPurpose(purpose) ||
    purpose === "search-area" ||
    purpose === "comparison"
  );
}

function proposalSignature(proposal: HistoryMapIntentProposalV34): string {
  return mapIntentSignature(proposal);
}

export function supplementMapIntentsV34(input: {
  readonly proposals: readonly HistoryMapIntentProposalV34[];
  readonly claims: readonly HistoryClaimV34[];
  readonly entities: readonly HistoryEntityMentionV34[];
  readonly geographicQualifiers: readonly HistoryGeographicQualifierV34[];
  readonly temporalQualifiers: readonly HistoryTemporalQualifierV34[];
}): HistoryMapIntentProposalV34[] {
  const proposals = [...input.proposals];
  const claimIdsWithIntent = new Set(proposals.flatMap((item) => item.claimIds));
  const pushIntent = (proposal: HistoryMapIntentProposalV34): void => {
    const signature = proposalSignature(proposal);
    if (proposals.some((item) => proposalSignature(item) === signature)) return;
    proposals.push(proposal);
    for (const claimId of proposal.claimIds) claimIdsWithIntent.add(claimId);
  };

  const outboundClaim = findClaimByPattern(
    input.claims,
    /\bsailed from Britain\b.*\bNorthwest Passage\b/iu
  );
  const baffinClaim = findClaimByPattern(input.claims, /\bBaffin Bay\b/iu);
  if (outboundClaim) {
    const britain = findEntityMention(input.entities, "Britain", outboundClaim.id);
    const passage = findEntityMention(input.entities, "Northwest Passage", outboundClaim.id);
    const baffin = baffinClaim
      ? findEntityMention(input.entities, "Baffin Bay", baffinClaim.id)
      : findEntityMention(input.entities, "Baffin Bay");
    if (britain && passage) {
      pushIntent({
        claimIds: [outboundClaim.id],
        mapPurpose: "expedition-route",
        movingActorEntityMentionIds: input.entities
          .filter(
            (item) =>
              item.claimId === outboundClaim.id &&
              ["HMS Erebus", "HMS Terror", "Royal Navy"].includes(item.normalizedLabel)
          )
          .map((item) => item.id)
          .slice(0, 2),
        originPlaceMentionIds: [britain.id],
        destinationPlaceMentionIds: [passage.id],
        waypointPlaceMentionIds: baffin ? [baffin.id] : [],
        temporalQualifierIds: outboundClaim.temporalQualifierIds,
        routeType: "maritime",
        uncertainty: outboundClaim.uncertaintyMarkers,
      });
    }
  }

  const baffinOnlyClaim = baffinClaim;
  if (baffinOnlyClaim && !claimIdsWithIntent.has(baffinOnlyClaim.id)) {
    const baffin = findEntityMention(input.entities, "Baffin Bay", baffinOnlyClaim.id);
    if (baffin) {
      pushIntent({
        claimIds: [baffinOnlyClaim.id],
        mapPurpose: "location",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [baffin.id],
        destinationPlaceMentionIds: [baffin.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: baffinOnlyClaim.temporalQualifierIds,
        routeType: "none",
        uncertainty: baffinOnlyClaim.uncertaintyMarkers,
      });
    }
  }

  const beecheyClaim = findClaimByPattern(input.claims, /\bBeechey Island\b/iu);
  if (beecheyClaim && !claimIdsWithIntent.has(beecheyClaim.id)) {
    const beechey = findEntityMention(input.entities, "Beechey Island", beecheyClaim.id);
    const peel = findEntityMention(input.entities, "Peel Sound");
    const arctic = findEntityMention(input.entities, "Arctic");
    if (beechey) {
      pushIntent({
        claimIds: [beecheyClaim.id],
        mapPurpose: "location",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [beechey.id],
        destinationPlaceMentionIds: [beechey.id],
        waypointPlaceMentionIds: [peel?.id, arctic?.id].filter(
          (id): id is string => Boolean(id)
        ),
        temporalQualifierIds: beecheyClaim.temporalQualifierIds,
        routeType: "none",
        uncertainty: beecheyClaim.uncertaintyMarkers,
      });
    }
  }

  const entrapmentClaim = findClaimByPattern(
    input.claims,
    /\btrapped in the ice off King William Island\b/iu
  );
  if (entrapmentClaim && !claimIdsWithIntent.has(entrapmentClaim.id)) {
    const island = findEntityMention(
      input.entities,
      "King William Island",
      entrapmentClaim.id
    );
    const arctic = findEntityMention(input.entities, "Arctic");
    if (island) {
      pushIntent({
        claimIds: [entrapmentClaim.id],
        mapPurpose: "location",
        movingActorEntityMentionIds: input.entities
          .filter(
            (item) =>
              item.claimId === entrapmentClaim.id &&
              ["HMS Erebus", "HMS Terror"].includes(item.normalizedLabel)
          )
          .map((item) => item.id),
        originPlaceMentionIds: [island.id],
        destinationPlaceMentionIds: [island.id],
        waypointPlaceMentionIds: arctic ? [arctic.id] : [],
        temporalQualifierIds: entrapmentClaim.temporalQualifierIds,
        routeType: "none",
        uncertainty: entrapmentClaim.uncertaintyMarkers,
      });
    }
  }

  const erebusClaim = findClaimByPattern(input.claims, /\b2014\b.*\bErebus\b/iu);
  const terrorClaim = findClaimByPattern(
    input.claims,
    /\b2016\b.*\bTerror\b|\bTerror Bay\b/iu
  );
  const pushDiscoveryIntent = (
    claim: HistoryClaimV34,
    placeMentionId: string,
    temporalQualifierIds: readonly string[]
  ): void => {
    if (claimIdsWithIntent.has(claim.id)) return;
    if (
      !claimHasDiscoveryGeography({
        claim,
        entities: input.entities,
        geographicQualifiers: input.geographicQualifiers,
      })
    )
      return;
    pushIntent({
      claimIds: [claim.id],
      mapPurpose: "discovery-location",
      movingActorEntityMentionIds: [],
      originPlaceMentionIds: [placeMentionId],
      destinationPlaceMentionIds: [placeMentionId],
      waypointPlaceMentionIds: [],
      temporalQualifierIds,
      routeType: "none",
      uncertainty: claim.uncertaintyMarkers,
    });
  };
  if (erebusClaim) {
    const kingWilliam = findEntityMention(input.entities, "King William Island", erebusClaim.id);
    const arctic = findEntityMention(input.entities, "Arctic", erebusClaim.id);
    const place = kingWilliam ?? arctic;
    if (place)
      pushDiscoveryIntent(erebusClaim, place.id, erebusClaim.temporalQualifierIds);
  }
  if (terrorClaim) {
    const terrorBay = findEntityMention(input.entities, "Terror Bay", terrorClaim.id);
    if (terrorBay)
      pushDiscoveryIntent(terrorClaim, terrorBay.id, terrorClaim.temporalQualifierIds);
  }

  const niemenCrossingClaim = findClaimByPattern(
    input.claims,
    /\b(?:crossing|crossed)\b.*\bNiemen\b/iu
  );
  if (niemenCrossingClaim) {
    const niemen =
      findEntityMention(input.entities, "Niemen River", niemenCrossingClaim.id) ??
      findEntityMention(input.entities, "Niemen River");
    const russia =
      findEntityMention(input.entities, "Russia", niemenCrossingClaim.id) ??
      findEntityMention(input.entities, "Russia");
    const grandeArmee = findEntityMention(input.entities, "Grande Armée", niemenCrossingClaim.id);
    if (niemen && russia) {
      pushIntent({
        claimIds: [niemenCrossingClaim.id],
        mapPurpose: "area",
        movingActorEntityMentionIds: grandeArmee ? [grandeArmee.id] : [],
        originPlaceMentionIds: [niemen.id],
        destinationPlaceMentionIds: [niemen.id],
        waypointPlaceMentionIds: [russia.id],
        temporalQualifierIds: niemenCrossingClaim.temporalQualifierIds,
        routeType: "none",
        uncertainty: niemenCrossingClaim.uncertaintyMarkers,
      });
    }
  }

  const advanceClaim =
    findClaimByPattern(input.claims, /\bSmolensk\b/iu) ??
    findClaimByPattern(input.claims, /\badvanced\b.*\bMoscow\b/iu);
  const moscowClaim =
    findClaimByPattern(input.claims, /\b(?:entered|reached) Moscow\b/iu) ?? advanceClaim;
  if (advanceClaim && moscowClaim) {
    const niemen =
      findEntityMention(input.entities, "Niemen River") ??
      findEntityMention(input.entities, "Niemen River", advanceClaim.id);
    const moscow =
      findEntityMention(input.entities, "Moscow", moscowClaim.id) ??
      findEntityMention(input.entities, "Moscow");
    const smolensk = findEntityMention(input.entities, "Smolensk", advanceClaim.id);
    const borodino = findEntityMention(input.entities, "Borodino");
    const grandeArmee = findEntityMention(input.entities, "Grande Armée", advanceClaim.id);
    const napoleon = findEntityMention(input.entities, "Napoleon Bonaparte", advanceClaim.id);
    if (niemen && moscow) {
      pushIntent({
        claimIds: [advanceClaim.id, ...(moscowClaim.id !== advanceClaim.id ? [moscowClaim.id] : [])],
        mapPurpose: "campaign",
        movingActorEntityMentionIds: grandeArmee ? [grandeArmee.id] : [],
        originPlaceMentionIds: [niemen.id],
        destinationPlaceMentionIds: [moscow.id],
        waypointPlaceMentionIds: [smolensk?.id, borodino?.id].filter(
          (id): id is string => Boolean(id)
        ),
        temporalQualifierIds: [
          ...advanceClaim.temporalQualifierIds,
          ...moscowClaim.temporalQualifierIds,
        ],
        routeType: "overland",
        uncertainty: advanceClaim.uncertaintyMarkers,
        leaderEntityMentionIds: napoleon ? [napoleon.id] : [],
      });
    }
  }

  const retreatClaim =
    findClaimByPattern(input.claims, /\b(?:began the retreat|retreat from Moscow)\b/iu) ??
    findClaimByPattern(input.claims, /\bBerezina River\b/iu);
  if (retreatClaim) {
    const moscow =
      findEntityMention(input.entities, "Moscow", retreatClaim.id) ??
      findEntityMention(input.entities, "Moscow");
    const berezina =
      findEntityMention(input.entities, "Berezina River", retreatClaim.id) ??
      findEntityMention(input.entities, "Berezina River");
    const grandeArmee = findEntityMention(input.entities, "Grande Armée", retreatClaim.id);
    const napoleon = findEntityMention(input.entities, "Napoleon Bonaparte", retreatClaim.id);
    if (moscow && berezina) {
      pushIntent({
        claimIds: [retreatClaim.id],
        mapPurpose: "journey",
        movingActorEntityMentionIds: grandeArmee ? [grandeArmee.id] : [],
        originPlaceMentionIds: [moscow.id],
        destinationPlaceMentionIds: [berezina.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: retreatClaim.temporalQualifierIds,
        routeType: "overland",
        uncertainty: retreatClaim.uncertaintyMarkers,
        leaderEntityMentionIds: napoleon ? [napoleon.id] : [],
      });
    }
  }

  const romeOrientationClaim =
    findClaimByPattern(input.claims, /\bConstantinople\b.*\b(?:eastern Roman|emperor)\b/iu) ??
    findClaimByPattern(input.claims, /\bWestern Roman Empire\b/iu);
  if (romeOrientationClaim) {
    const rome =
      findEntityMention(input.entities, "Rome", romeOrientationClaim.id) ??
      findEntityMention(input.entities, "Rome");
    const constantinople =
      findEntityMention(input.entities, "Constantinople", romeOrientationClaim.id) ??
      findEntityMention(input.entities, "Constantinople");
    if (rome && constantinople) {
      pushIntent({
        claimIds: [romeOrientationClaim.id],
        mapPurpose: "orientation",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [rome.id],
        destinationPlaceMentionIds: [constantinople.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: romeOrientationClaim.temporalQualifierIds,
        routeType: "conceptual",
        uncertainty: romeOrientationClaim.uncertaintyMarkers,
      });
    }
  }

  const bronzeTradeClaim = findClaimByPattern(
    input.claims,
    /\btrade routes?\b.*\b(?:Mediterranean|Aegean|Anatolia|Cyprus|Egypt)\b/iu
  );
  if (bronzeTradeClaim) {
    const mediterranean =
      findEntityMention(input.entities, "Mediterranean", bronzeTradeClaim.id) ??
      findEntityMention(input.entities, "Mediterranean");
    const aegean =
      findEntityMention(input.entities, "Aegean", bronzeTradeClaim.id) ??
      findEntityMention(input.entities, "Aegean");
    const anatolia =
      findEntityMention(input.entities, "Anatolia", bronzeTradeClaim.id) ??
      findEntityMention(input.entities, "Anatolia");
    const cyprus =
      findEntityMention(input.entities, "Cyprus", bronzeTradeClaim.id) ??
      findEntityMention(input.entities, "Cyprus");
    const egypt =
      findEntityMention(input.entities, "Egypt", bronzeTradeClaim.id) ??
      findEntityMention(input.entities, "Egypt");
    const anchors = [mediterranean, aegean, anatolia, cyprus, egypt].filter(
      (item): item is NonNullable<typeof item> => Boolean(item)
    );
    if (anchors.length >= 2) {
      pushIntent({
        claimIds: [bronzeTradeClaim.id],
        mapPurpose: "orientation",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [anchors[0]!.id],
        destinationPlaceMentionIds: [anchors[1]!.id],
        waypointPlaceMentionIds: anchors.slice(2).map((item) => item.id),
        temporalQualifierIds: bronzeTradeClaim.temporalQualifierIds,
        routeType: "conceptual",
        uncertainty: bronzeTradeClaim.uncertaintyMarkers,
      });
    }
  }

  const hittiteCollapseClaim = findClaimByPattern(
    input.claims,
    /\bHattusa\b|\bHittite\b.*\bcollapse/iu
  );
  if (hittiteCollapseClaim) {
    const hattusa =
      findEntityMention(input.entities, "Hattusa", hittiteCollapseClaim.id) ??
      findEntityMention(input.entities, "Hattusa");
    const anatolia =
      findEntityMention(input.entities, "Anatolia", hittiteCollapseClaim.id) ??
      findEntityMention(input.entities, "Anatolia");
    if (hattusa && anatolia) {
      pushIntent({
        claimIds: [hittiteCollapseClaim.id],
        mapPurpose: "area",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [hattusa.id],
        destinationPlaceMentionIds: [anatolia.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: hittiteCollapseClaim.temporalQualifierIds,
        routeType: "none",
        uncertainty: hittiteCollapseClaim.uncertaintyMarkers,
      });
    }
  }

  const fragmentationClaim =
    findClaimByPattern(input.claims, /\bOdoacer\b/iu) ??
    findClaimByPattern(input.claims, /\bWestern Roman Empire\b.*\b(?:end|fell|collapsed)\b/iu);
  if (fragmentationClaim) {
    const rome =
      findEntityMention(input.entities, "Rome", fragmentationClaim.id) ??
      findEntityMention(input.entities, "Rome");
    const europe =
      findEntityMention(input.entities, "Europe", fragmentationClaim.id) ??
      findEntityMention(input.entities, "Europe");
    if (rome && europe) {
      pushIntent({
        claimIds: [fragmentationClaim.id],
        mapPurpose: "comparison",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [rome.id],
        destinationPlaceMentionIds: [europe.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: fragmentationClaim.temporalQualifierIds,
        routeType: "conceptual",
        uncertainty: fragmentationClaim.uncertaintyMarkers,
      });
    }
  }

  const plagueArrivalClaim = findClaimByPattern(
    input.claims,
    /\bMessina\b.*\bBlack Sea\b|\bBlack Sea\b.*\bMessina\b/iu
  );
  if (plagueArrivalClaim) {
    const blackSea =
      findEntityMention(input.entities, "Black Sea", plagueArrivalClaim.id) ??
      findEntityMention(input.entities, "Black Sea");
    const messina =
      findEntityMention(input.entities, "Messina", plagueArrivalClaim.id) ??
      findEntityMention(input.entities, "Messina");
    if (blackSea && messina) {
      pushIntent({
        claimIds: [plagueArrivalClaim.id],
        mapPurpose: "migration",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [blackSea.id],
        destinationPlaceMentionIds: [messina.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: plagueArrivalClaim.temporalQualifierIds,
        routeType: "maritime",
        uncertainty: plagueArrivalClaim.uncertaintyMarkers,
      });
    }
  }

  const plagueSpreadClaim =
    findClaimByPattern(input.claims, /\btrade routes?\b.*\bEurope\b/iu) ??
    findClaimByPattern(input.claims, /\bplague\b.*\bEurope\b/iu);
  if (plagueSpreadClaim) {
    const mediterranean =
      findEntityMention(input.entities, "Mediterranean", plagueSpreadClaim.id) ??
      findEntityMention(input.entities, "Mediterranean");
    const europe =
      findEntityMention(input.entities, "Europe", plagueSpreadClaim.id) ??
      findEntityMention(input.entities, "Europe");
    if (mediterranean && europe) {
      pushIntent({
        claimIds: [plagueSpreadClaim.id],
        mapPurpose: "area",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [mediterranean.id],
        destinationPlaceMentionIds: [europe.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: plagueSpreadClaim.temporalQualifierIds,
        routeType: "conceptual",
        uncertainty: plagueSpreadClaim.uncertaintyMarkers,
      });
    }
  }

  return proposals;
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
    const hasGeoCue =
      geo.length > 0 ||
      /\b(?:sailed|march|route|crossed|crossing|advanced|advancing|retreat|retreated|entered|reached|from .+ to |bay|island|trapped|saw|located|found in|arrived)\b/iu.test(
        text
      );
    if (!hasGeoCue) continue;
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
      const kingWilliam = input.entities.find(
        (item) => item.normalizedLabel === "King William Island"
      );
      const originEntityId =
        shipOrIsland && shipOrIsland.id !== backRiver.id
          ? shipOrIsland.id
          : kingWilliam?.id ?? shipOrIsland?.id;
      if (!originEntityId || originEntityId === backRiver.id) continue;
      proposals.push({
        claimIds: [claim.id],
        mapPurpose: "journey",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [originEntityId],
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
    const authorizesMovement = claimAuthorizesRouteMovement(text);
    if (!authorizesMovement) {
      const locationId = locations[0] ?? origins[0] ?? destinations[0];
      if (!locationId) continue;
      proposals.push({
        claimIds: [claim.id],
        mapPurpose: "location",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [locationId],
        destinationPlaceMentionIds: [locationId],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: claim.temporalQualifierIds,
        routeType: "none",
        uncertainty: claim.uncertaintyMarkers,
      });
      continue;
    }
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
  return supplementMapIntentsV34({
    proposals,
    claims: input.claims,
    entities: input.entities,
    geographicQualifiers: input.geographicQualifiers,
    temporalQualifiers: input.temporalQualifiers,
  });
}

export function compileMapStateV34(input: {
  readonly beatNumber: string;
  readonly proposal: HistoryMapIntentProposalV34;
  readonly claims: readonly HistoryClaimV34[];
  readonly entities: readonly HistoryEntityMentionV34[];
  readonly geographicQualifiers: readonly HistoryGeographicQualifierV34[];
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
  const normalizedProposal = {
    ...input.proposal,
    mapPurpose: normalizeMapPurposeForProposal(input.proposal),
  };
  const entityById = new Map(input.entities.map((item) => [item.id, item] as const));
  const claimText = normalizedProposal.claimIds
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

  if (normalizedProposal.mapPurpose === "discovery-location") {
    const grounded = normalizedProposal.claimIds.every((claimId) => {
      const claim = input.claims.find((item) => item.id === claimId);
      return (
        claim &&
        claimHasDiscoveryGeography({
          claim,
          entities: input.entities,
          geographicQualifiers: input.geographicQualifiers,
        })
      );
    });
    if (!grounded) blockers.push("DISCOVERY_LOCATION_UNGROUNDED");
  }

  const survivorMarch = /\b(?:105 survivors|march toward the Back River)\b/iu.test(claimText);
  const orientationLike = orientationLikePurpose(normalizedProposal.mapPurpose);
  const singlePlaceMode =
    isSinglePlaceMapPurpose(normalizedProposal.mapPurpose) ||
    (!survivorMarch &&
      isRouteMapPurpose(normalizedProposal.mapPurpose) === false &&
      normalizedProposal.originPlaceMentionIds.length === 1 &&
      normalizedProposal.destinationPlaceMentionIds.length === 1 &&
      normalizedProposal.originPlaceMentionIds[0] ===
        normalizedProposal.destinationPlaceMentionIds[0]);

  let origin: HistoryPlaceV34 | undefined = normalizedProposal.originPlaceMentionIds
    .map(resolveMentionPlace)
    .find((item): item is HistoryPlaceV34 => Boolean(item));
  const destination = normalizedProposal.destinationPlaceMentionIds
    .map(resolveMentionPlace)
    .find((item): item is HistoryPlaceV34 => Boolean(item));
  const waypointPlaces = normalizedProposal.waypointPlaceMentionIds
    .map(resolveMentionPlace)
    .filter((item): item is HistoryPlaceV34 => Boolean(item));
  if (survivorMarch && !origin)
    origin = resolveHistoryPlaceV34("King William Island") ?? undefined;
  if (!origin) blockers.push("MAP_ORIGIN_UNRESOLVED");
  if (!destination && !singlePlaceMode) blockers.push("MAP_DESTINATION_UNRESOLVED");
  if (
    origin &&
    destination &&
    origin.id === destination.id &&
    !survivorMarch &&
    isRouteMapPurpose(normalizedProposal.mapPurpose)
  )
    blockers.push("MAP_IDENTITY_ROUTE");
  if (survivorMarch && origin && destination && origin.id === destination.id) {
    origin = resolveHistoryPlaceV34("King William Island") ?? undefined;
  }

  const actorMention = normalizedProposal.movingActorEntityMentionIds
    .map((id) => entityById.get(id) ?? null)
    .find((item): item is HistoryEntityMentionV34 => Boolean(item));
  let movingActor = survivorMarch
    ? "surviving expedition members"
    : actorMention?.normalizedLabel ?? "";
  if (!survivorMarch && !actorIsValid(movingActor, actorMention ?? null)) {
    if (
      orientationLike ||
      normalizedProposal.routeType === "conceptual" ||
      singlePlaceMode ||
      (normalizedProposal.routeType === "maritime" && /\bships?\b/iu.test(claimText))
    ) {
      movingActor = collectiveMapActor(claimText);
    } else {
      blockers.push("MAP_ACTOR_INVALID");
    }
  }
  if (actorMention && isRejectedEntityTextV34(actorMention.text).reject)
    blockers.push("MAP_ACTOR_STOPWORD");

  // Reject Franklin regressions explicitly.
  if (/^in may$/iu.test(movingActor) || origin?.label === "In May")
    blockers.push("MAP_ACTOR_TEMPORAL_FRAGMENT");
  if (destination && lookupCanonicalEntitySeedV34(destination.label)?.entityType === "organization")
    blockers.push("MAP_DESTINATION_NOT_PLACE");
  if (destination && lookupCanonicalEntitySeedV34(destination.label)?.entityType === "person")
    blockers.push("MAP_DESTINATION_PERSON");
  if (normalizedProposal.routeType === "none" && !singlePlaceMode)
    blockers.push("MAP_ROUTE_TYPE_NONE");
  // "military" is not a V3.4 route type; reject conceptual mislabels from older planners.
  if (/military/iu.test(normalizedProposal.routeType)) blockers.push("MAP_ROUTE_TYPE_INVALID");
  if (
    normalizedProposal.routeType === "maritime" &&
    /\bmarch|overland|sledges?\b/iu.test(claimText)
  )
    blockers.push("MAP_ROUTE_TYPE_CONTRADICTION");
  if (
    normalizedProposal.routeType === "overland" &&
    /\bsailed|maritime|sea route\b/iu.test(claimText) &&
    !/\bmarch|abandon|overland\b/iu.test(claimText)
  )
    blockers.push("MAP_ROUTE_TYPE_CONTRADICTION");

  const period =
    input.temporalQualifiers.find((item) =>
      normalizedProposal.temporalQualifierIds.includes(item.id)
    )?.normalizedValue ??
    (survivorMarch ? "April 1848" : "as narrated");
  if (/^\d{1,2}$/u.test(period)) blockers.push("MAP_PERIOD_FROM_QUANTITY");

  const originCoords = origin?.coordinates
    ? ([origin.coordinates.latitude, origin.coordinates.longitude] as const)
    : null;
  const destinationCoords = (destination ?? origin)?.coordinates
    ? ([(destination ?? origin)!.coordinates!.latitude, (destination ?? origin)!.coordinates!.longitude] as const)
    : null;
  if (!originCoords) blockers.push("MAP_COORDINATES_MISSING");
  if (!singlePlaceMode && !destinationCoords) blockers.push("MAP_COORDINATES_MISSING");
  if (isPlaceholderCoordinates(originCoords) || isPlaceholderCoordinates(destinationCoords))
    blockers.push("MAP_PLACEHOLDER_COORDINATES");

  const leaders = (normalizedProposal.leaderEntityMentionIds ?? [])
    .map((id) => entityById.get(id)?.normalizedLabel)
    .filter((item): item is string => Boolean(item));

  const masterId = `map-master-${input.beatNumber}`;
  const stateId = `map-state-${input.beatNumber}`;
  const labelPlaceMap = new Map<string, HistoryPlaceV34>();
  for (const place of [origin, ...waypointPlaces, destination ?? origin]) {
    if (place) labelPlaceMap.set(place.id, place);
  }
  const labelPlaces = [...labelPlaceMap.values()];
  const effectiveDestination = destination ?? origin;
  const shouldDrawRoute =
    !singlePlaceMode &&
    origin &&
    effectiveDestination &&
    origin.id !== effectiveDestination.id;
  const state: HistoryMapStateV34 = {
    id: stateId,
    masterId,
    purpose: claimText.slice(0, 180) || "Narration-bound map",
    mapPurpose: normalizedProposal.mapPurpose,
    baseGeography: labelPlaces.map((item) => item.label).join(", "),
    timePeriod: period,
    affectedArea: labelPlaces.map((item) => item.label).join(", "),
    labels: labelPlaces.map((place) => {
      const supportedClaimIds = claimIdsSupportingMapLabelV34({
        placeLabel: place.label,
        claimIds: normalizedProposal.claimIds,
        claims: input.claims,
        entities: input.entities,
      });
      const isContextOnly = supportedClaimIds.length === 0;
      return {
        text: place.label,
        placeId: place.id,
        linkedClaimIds: supportedClaimIds,
        provenance: isContextOnly ? ("episode-context" as const) : ("narration-claim" as const),
      };
    }),
    routes:
      shouldDrawRoute && origin && effectiveDestination
        ? [
            {
              id: `route-${input.beatNumber}-01`,
              routeType: survivorMarch
                ? "overland"
                : input.proposal.routeType === "conceptual"
                  ? "conceptual"
                  : normalizedProposal.routeType === "none"
                    ? "conceptual"
                    : normalizedProposal.routeType,
              originPlaceId: origin.id,
              destinationPlaceId: effectiveDestination.id,
              origin: {
                label: origin.label,
                coordinates: originCoords,
              },
              destination: {
                label: effectiveDestination.label,
                coordinates: destinationCoords,
              },
              movingActor: movingActor || "unresolved actor",
              movingActorEntityMentionId: actorMention?.id ?? null,
              leaders,
              carrierOrVehicle: null,
              dateOrPeriod: period,
              label: `${origin.label} to ${effectiveDestination.label}`,
              uncertainty: normalizedProposal.uncertainty.join("; ") || "No precision beyond trusted narration.",
              linkedClaimIds: normalizedProposal.claimIds,
            },
          ]
        : [],
    uncertainty: normalizedProposal.uncertainty.join("; ") || "Keep geography broad where narration is broad.",
    semanticStatus: blockers.length ? "blocked" : "valid",
    blockerCodes: blockers,
  };
  if (blockers.length) return null;
  return {
    master: {
      id: masterId,
      purpose: singlePlaceMode
        ? `Narration-bound ${normalizedProposal.mapPurpose} at ${origin?.label ?? "narrated place"}`
        : `Narration-bound ${normalizedProposal.mapPurpose} across ${origin?.label} and ${effectiveDestination?.label}`,
      mapPurpose: normalizedProposal.mapPurpose,
      supportedRatios: ["16:9", "9:16"],
    },
    state,
  };
}

export function validateCompiledMapStateV34(state: HistoryMapStateV34): string[] {
  const blockers = [...state.blockerCodes];
  for (const route of state.routes) {
    if (route.originPlaceId === route.destinationPlaceId && !isSinglePlaceMapPurpose(state.mapPurpose))
      blockers.push("MAP_IDENTITY_ROUTE");
    if (isPlaceholderCoordinates(route.origin.coordinates))
      blockers.push("MAP_PLACEHOLDER_COORDINATES");
    if (isPlaceholderCoordinates(route.destination.coordinates))
      blockers.push("MAP_PLACEHOLDER_COORDINATES");
    if (isRejectedEntityTextV34(route.movingActor).reject) blockers.push("MAP_ACTOR_INVALID");
    if (!route.linkedClaimIds.length) blockers.push("MAP_CLAIM_MISSING");
  }
  return [...new Set(blockers)];
}
