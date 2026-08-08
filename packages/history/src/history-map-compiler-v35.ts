import { isRejectedEntityTextV34, lookupCanonicalEntitySeedV34 } from "./history-claims-v34.js";
import type {
  HistoryClaimV34,
  HistoryEntityMentionV34,
  HistoryGeographicQualifierV34,
  HistoryMapCompilerResolutionV35,
  HistoryMapDowngradeReasonV35,
  HistoryMapIntentProposalV34,
  HistoryMapPurposeV34,
  HistoryMapSemanticTypeV35,
  HistoryMapStateV34,
  HistoryPlaceV34,
  HistoryRouteGeometrySemanticsV35,
  HistoryRouteTypeV34,
  HistoryTemporalQualifierV34,
} from "./history-v34-contracts.js";
import {
  claimAuthorizesRouteMovement,
  claimHasDiscoveryGeography,
  claimIdsSupportingMapLabelV34,
  isRouteMapPurpose,
  isSinglePlaceMapPurpose,
  normalizeMapPurposeForProposal,
} from "./history-visual-semantics-v34.js";
import {
  deriveMapCapabilitiesV35,
  downgradeReasonForMissingCapability,
  extractGeoFactsV35,
  findAnyMovementFact,
  findMovementFactForActor,
  findPrimaryLocationFact,
  findSequenceFact,
  type GeoFactV35,
  type LocationFactV35,
  type MovementFactV35,
  type SequenceFactV35,
} from "./history-geo-facts-v35.js";
import {
  validateMovementRouteSemanticsV35,
} from "./history-map-route-semantics-v35.js";
import { collectUsedGeoFactIdsV35 } from "./history-geo-facts-export-v35.js";
import {
  actorDisplayLabelV35,
  actorMentionIdsV35,
  primaryActorMentionIdV35,
} from "./history-map-actor-v35.js";
import { resolveHistoryPlaceV34 } from "./history-geo-v34.js";

function orientationLikePurpose(
  purpose: HistoryMapIntentProposalV34["mapPurpose"]
): boolean {
  return (
    isSinglePlaceMapPurpose(purpose) ||
    purpose === "search-area" ||
    purpose === "comparison"
  );
}

function isPlaceholderCoordinates(
  coordinates: readonly [number, number] | null | undefined
): boolean {
  if (!coordinates) return false;
  const [lat, lon] = coordinates;
  return (lat === 0 && lon === 0) || (lat === 1 && lon === 1);
}

function actorIsValid(text: string, entity: HistoryEntityMentionV34 | null): boolean {
  const rejection = isRejectedEntityTextV34(text);
  if (rejection.reject) return false;
  if (!entity) return false;
  if (
    ["person", "organization", "ship", "military-unit", "ethnic-or-cultural-group"].includes(
      entity.entityType
    )
  )
    return true;
  if (
    /survivors?|expedition members|crews?|searchers|Grande Armée|Napoleon'?s army|merchant ships|narrated expedition|Royal Navy expedition|search expeditions|HMS Erebus/i.test(
      text
    )
  )
    return true;
  return false;
}

function resolveMentionPlace(
  mentionId: string,
  entityById: ReadonlyMap<string, HistoryEntityMentionV34>
): HistoryPlaceV34 | null {
  const entity = entityById.get(mentionId);
  if (!entity) return null;
  if (["person", "organization", "document", "disease", "event"].includes(entity.entityType))
    return null;
  if (entity.entityType === "ship") return resolveHistoryPlaceV34("King William Island");
  return resolveHistoryPlaceV34(entity.normalizedLabel);
}

function inferRequestedSemanticType(
  proposal: HistoryMapIntentProposalV34
): HistoryMapSemanticTypeV35 {
  const distinctEndpoints =
    proposal.originPlaceMentionIds[0] &&
    proposal.destinationPlaceMentionIds[0] &&
    proposal.originPlaceMentionIds[0] !== proposal.destinationPlaceMentionIds[0];
  if (isRouteMapPurpose(proposal.mapPurpose)) return "movement";
  if (
    proposal.mapPurpose === "area" &&
    (proposal.waypointPlaceMentionIds.length > 0 || distinctEndpoints)
  )
    return "sequence";
  if (!isRouteMapPurpose(proposal.mapPurpose) && distinctEndpoints) return "sequence";
  if (isSinglePlaceMapPurpose(proposal.mapPurpose)) return "locator";
  return "movement";
}

function mapPurposeForResolvedType(
  resolved: HistoryMapSemanticTypeV35,
  fallback: HistoryMapPurposeV34
): HistoryMapPurposeV34 {
  switch (resolved) {
    case "locator":
      return isSinglePlaceMapPurpose(fallback) ? fallback : "location";
    case "sequence":
      return fallback === "area" ? "area" : "orientation";
    case "movement":
      return isRouteMapPurpose(fallback) ? fallback : "journey";
    case "no-map":
      return fallback;
    default:
      return fallback;
  }
}

function routeGeometryForMovement(
  movement: MovementFactV35 | undefined
): HistoryRouteGeometrySemanticsV35 {
  if (movement?.documentedPath) return "documented-path";
  return "schematic-progression";
}

function scopedLocationMentionIds(geoFacts: readonly GeoFactV35[]): readonly string[] {
  return [
    ...new Set(
      geoFacts
        .filter((fact): fact is LocationFactV35 => fact.type === "location")
        .map((fact) => fact.placeMentionId)
    ),
  ];
}

function semanticStrength(
  mapType: HistoryMapSemanticTypeV35 | "no-map"
): number {
  switch (mapType) {
    case "no-map":
      return -1;
    case "locator":
      return 0;
    case "sequence":
      return 1;
    case "movement":
      return 2;
    default:
      return 0;
  }
}

function inferFallbackDowngradeReason(input: {
  readonly requested: HistoryMapSemanticTypeV35;
  readonly resolved: HistoryMapSemanticTypeV35 | "no-map";
  readonly explicitReason?: HistoryMapDowngradeReasonV35;
}): HistoryMapDowngradeReasonV35 | undefined {
  if (input.resolved === "no-map") return input.explicitReason ?? "INSUFFICIENT_EVIDENCE";
  if (input.requested === input.resolved) return undefined;
  if (semanticStrength(input.resolved) > semanticStrength(input.requested)) return undefined;
  if (input.explicitReason) return input.explicitReason;
  if (input.requested === "movement" && input.resolved === "sequence")
    return "MOVEMENT_NOT_SUPPORTED";
  if (input.requested === "movement" && input.resolved === "locator")
    return "DESTINATION_NOT_SUPPORTED";
  if (input.requested === "sequence" && input.resolved === "locator")
    return "INSUFFICIENT_EVIDENCE";
  return downgradeReasonForMissingCapability({
    requested: input.requested,
    capabilities: {
      locator: input.resolved === "locator",
      sequence: input.resolved === "sequence",
      movement: input.resolved === "movement",
      territory: false,
      battleDisposition: false,
    },
    geoFacts: [],
  });
}

type SemanticResolution = {
  readonly resolved: HistoryMapSemanticTypeV35 | "no-map";
  readonly downgradeReason?: HistoryMapDowngradeReasonV35;
  readonly resolutionNotes?: readonly string[];
  readonly movement?: MovementFactV35;
  readonly sequence?: SequenceFactV35;
  readonly sequencePlaceMentionIds: readonly string[];
  readonly locatorPlaceMentionId?: string;
  readonly usedGeoFactIds: readonly string[];
};

function finalizeSemanticResolution(input: {
  readonly requested: HistoryMapSemanticTypeV35;
  readonly resolved: HistoryMapSemanticTypeV35 | "no-map";
  readonly geoFacts: readonly GeoFactV35[];
  readonly explicitReason?: HistoryMapDowngradeReasonV35;
  readonly resolutionNotes?: readonly string[];
  readonly movement?: MovementFactV35;
  readonly sequence?: SequenceFactV35;
  readonly sequencePlaceMentionIds?: readonly string[];
  readonly locatorPlaceMentionId?: string;
}): SemanticResolution {
  const downgradeReason = inferFallbackDowngradeReason({
    requested: input.requested,
    resolved: input.resolved,
    ...(input.explicitReason ? { explicitReason: input.explicitReason } : {}),
  });
  const sequencePlaceMentionIds =
    input.sequencePlaceMentionIds ?? input.sequence?.placeMentionIds ?? [];
  return {
    resolved: input.resolved,
    ...(downgradeReason ? { downgradeReason } : {}),
    ...(input.resolutionNotes?.length ? { resolutionNotes: input.resolutionNotes } : {}),
    ...(input.movement ? { movement: input.movement } : {}),
    ...(input.sequence ? { sequence: input.sequence } : {}),
    sequencePlaceMentionIds,
    ...(input.locatorPlaceMentionId ? { locatorPlaceMentionId: input.locatorPlaceMentionId } : {}),
    usedGeoFactIds: collectUsedGeoFactIdsV35({
      geoFacts: input.geoFacts,
      ...(input.movement ? { movement: input.movement } : {}),
      ...(input.sequence ? { sequence: input.sequence } : {}),
      ...(input.locatorPlaceMentionId ? { locatorPlaceMentionId: input.locatorPlaceMentionId } : {}),
      ...(sequencePlaceMentionIds.length ? { sequencePlaceMentionIds } : {}),
    }),
  };
}

function resolveMovementFact(input: {
  readonly geoFacts: readonly GeoFactV35[];
  readonly requestedActorId?: string;
}): MovementFactV35 | undefined {
  return (
    (input.requestedActorId
      ? findMovementFactForActor({
          geoFacts: input.geoFacts,
          actorMentionId: input.requestedActorId,
        })
      : undefined) ?? findAnyMovementFact(input.geoFacts)
  );
}

function fallbackFromStrongerSemantics(input: {
  readonly requested: HistoryMapSemanticTypeV35;
  readonly geoFacts: readonly GeoFactV35[];
  readonly capabilities: ReturnType<typeof deriveMapCapabilitiesV35>;
  readonly explicitReason?: HistoryMapDowngradeReasonV35;
}): SemanticResolution {
  if (input.capabilities.sequence) {
    const sequence = findSequenceFact(input.geoFacts);
    if (sequence) {
      return finalizeSemanticResolution({
        requested: input.requested,
        resolved: "sequence",
        explicitReason: input.explicitReason ?? "MOVEMENT_NOT_SUPPORTED",
        sequence,
        geoFacts: input.geoFacts,
      });
    }
    const locationMentionIds = scopedLocationMentionIds(input.geoFacts);
    if (locationMentionIds.length > 1) {
      return finalizeSemanticResolution({
        requested: input.requested,
        resolved: "sequence",
        explicitReason: input.explicitReason ?? "MOVEMENT_NOT_SUPPORTED",
        sequencePlaceMentionIds: locationMentionIds,
        geoFacts: input.geoFacts,
      });
    }
  }

  const locator = findPrimaryLocationFact(input.geoFacts);
  if (locator) {
    return finalizeSemanticResolution({
      requested: input.requested,
      resolved: "locator",
      explicitReason:
        input.explicitReason ??
        (input.requested === "movement"
          ? "DESTINATION_NOT_SUPPORTED"
          : input.requested === "sequence"
            ? "INSUFFICIENT_EVIDENCE"
            : "INSUFFICIENT_EVIDENCE"),
      locatorPlaceMentionId: locator.placeMentionId,
      geoFacts: input.geoFacts,
    });
  }

  return finalizeSemanticResolution({
    requested: input.requested,
    resolved: "no-map",
    explicitReason: "INSUFFICIENT_EVIDENCE",
    geoFacts: input.geoFacts,
  });
}

function resolveSemanticMap(input: {
  readonly requested: HistoryMapSemanticTypeV35;
  readonly capabilities: ReturnType<typeof deriveMapCapabilitiesV35>;
  readonly geoFacts: readonly GeoFactV35[];
  readonly proposal: HistoryMapIntentProposalV34;
}): SemanticResolution {
  const requestedActorId = input.proposal.movingActorEntityMentionIds[0];

  if (input.requested === "movement" && input.capabilities.movement) {
    const movement = resolveMovementFact({
      geoFacts: input.geoFacts,
      ...(requestedActorId ? { requestedActorId } : {}),
    });
    if (!movement) {
      return fallbackFromStrongerSemantics({
        requested: input.requested,
        geoFacts: input.geoFacts,
        capabilities: input.capabilities,
        explicitReason: "MOVEMENT_NOT_SUPPORTED",
      });
    }
    return finalizeSemanticResolution({
      requested: input.requested,
      resolved: "movement",
      movement,
      geoFacts: input.geoFacts,
    });
  }

  if (input.requested === "sequence" && input.capabilities.sequence) {
    const sequence = findSequenceFact(input.geoFacts);
    if (sequence) {
      return finalizeSemanticResolution({
        requested: input.requested,
        resolved: "sequence",
        sequence,
        geoFacts: input.geoFacts,
      });
    }
  }

  if (input.requested === "locator" && input.capabilities.locator) {
    const locator = findPrimaryLocationFact(input.geoFacts);
    if (locator) {
      return finalizeSemanticResolution({
        requested: input.requested,
        resolved: "locator",
        locatorPlaceMentionId: locator.placeMentionId,
        geoFacts: input.geoFacts,
      });
    }
    return finalizeSemanticResolution({
      requested: input.requested,
      resolved: "no-map",
      explicitReason: "INSUFFICIENT_EVIDENCE",
      geoFacts: input.geoFacts,
    });
  }

  if (
    input.capabilities.movement &&
    (input.requested === "movement" || input.requested === "sequence")
  ) {
    const movement = resolveMovementFact({
      geoFacts: input.geoFacts,
      ...(requestedActorId ? { requestedActorId } : {}),
    });
    if (movement) {
      return finalizeSemanticResolution({
        requested: input.requested,
        resolved: "movement",
        movement,
        geoFacts: input.geoFacts,
      });
    }
  }

  if (input.requested === "movement") {
    return fallbackFromStrongerSemantics({
      requested: input.requested,
      geoFacts: input.geoFacts,
      capabilities: input.capabilities,
    });
  }

  if (input.requested === "sequence") {
    return fallbackFromStrongerSemantics({
      requested: input.requested,
      geoFacts: input.geoFacts,
      capabilities: input.capabilities,
      explicitReason: "INSUFFICIENT_EVIDENCE",
    });
  }

  return fallbackFromStrongerSemantics({
    requested: input.requested,
    geoFacts: input.geoFacts,
    capabilities: input.capabilities,
  });
}

export function compileMapStateV35(input: {
  readonly beatNumber: string;
  readonly proposal: HistoryMapIntentProposalV34;
  readonly scopeClaimIds: readonly string[];
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
  const scopeClaimIds = input.scopeClaimIds.length
    ? input.scopeClaimIds
    : input.proposal.claimIds;
  const scopedProposalClaimIds = input.proposal.claimIds.filter((claimId) =>
    scopeClaimIds.includes(claimId)
  );
  if (!scopedProposalClaimIds.length) return null;

  const normalizedProposal = {
    ...input.proposal,
    claimIds: scopedProposalClaimIds,
    mapPurpose: normalizeMapPurposeForProposal(input.proposal),
  };

  const geoFacts = extractGeoFactsV35({
    scopeClaimIds,
    claims: input.claims,
    entities: input.entities,
    geographicQualifiers: input.geographicQualifiers,
    temporalQualifiers: input.temporalQualifiers,
  });
  const capabilities = deriveMapCapabilitiesV35({ geoFacts });
  const requestedMapType = inferRequestedSemanticType(input.proposal);
  const entityById = new Map(input.entities.map((item) => [item.id, item] as const));
  const claimText = normalizedProposal.claimIds
    .map((id) => input.claims.find((claim) => claim.id === id)?.normalizedProposition ?? "")
    .join("\n");
  const blockers: string[] = [];

  const semantic = resolveSemanticMap({
    requested: requestedMapType,
    capabilities,
    geoFacts,
    proposal: normalizedProposal,
  });

  if (semantic.resolved === "no-map") return null;

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
  const resolvedMapPurpose = mapPurposeForResolvedType(
    semantic.resolved,
    normalizedProposal.mapPurpose
  );
  const singlePlaceMode = semantic.resolved === "locator";

  let origin: HistoryPlaceV34 | undefined;
  let destination: HistoryPlaceV34 | undefined;
  let waypointPlaces: HistoryPlaceV34[] = [];
  let movingActor = "";
  let actorMention: HistoryEntityMentionV34 | undefined;
  let actorProvenance = semantic.movement?.actorRef;
  let movingActorEntityMentionIds: string[] = [];
  let routeType: HistoryRouteTypeV34 = normalizedProposal.routeType;
  let leaders: string[] = [];

  if (semantic.resolved === "movement" && semantic.movement) {
    origin = resolveMentionPlace(semantic.movement.originMentionId, entityById) ?? undefined;
    destination =
      resolveMentionPlace(semantic.movement.destinationMentionId, entityById) ?? undefined;
    waypointPlaces = semantic.movement.waypointMentionIds
      .map((mentionId) => resolveMentionPlace(mentionId, entityById))
      .filter((item): item is HistoryPlaceV34 => Boolean(item));
    if (survivorMarch) {
      movingActor = "surviving expedition members";
      actorProvenance = {
        kind: "claim-expression",
        normalizedLabel: "surviving expedition members",
        claimIds: semantic.movement.claimIds,
        sourceText: "surviving expedition members",
      };
      movingActorEntityMentionIds = [];
      actorMention = undefined;
    } else {
      actorProvenance = semantic.movement.actorRef;
      movingActor = actorDisplayLabelV35(actorProvenance, input.entities);
      movingActorEntityMentionIds = [...actorMentionIdsV35(actorProvenance)];
      const primaryActorId = primaryActorMentionIdV35(actorProvenance);
      actorMention = primaryActorId ? entityById.get(primaryActorId) : undefined;
    }
    leaders = (normalizedProposal.leaderEntityMentionIds ?? [])
      .map((id) => entityById.get(id)?.normalizedLabel)
      .filter((item): item is string => Boolean(item));
    routeType = survivorMarch
      ? "overland"
      : normalizedProposal.routeType === "none"
        ? "conceptual"
        : normalizedProposal.routeType;
  } else if (semantic.resolved === "sequence") {
    const places = semantic.sequencePlaceMentionIds
      .map((mentionId) => resolveMentionPlace(mentionId, entityById))
      .filter((item): item is HistoryPlaceV34 => Boolean(item));
    origin = places[0];
    destination = places[places.length - 1];
    waypointPlaces = places.slice(1, -1);
    routeType = "none";
  } else if (semantic.locatorPlaceMentionId) {
    origin = resolveMentionPlace(semantic.locatorPlaceMentionId, entityById) ?? undefined;
    destination = origin;
    routeType = "none";
  }

  if (survivorMarch && !origin)
    origin = resolveHistoryPlaceV34("King William Island") ?? undefined;
  if (!origin) blockers.push("MAP_ORIGIN_UNRESOLVED");
  if (!destination && !singlePlaceMode) blockers.push("MAP_DESTINATION_UNRESOLVED");
  if (
    origin &&
    destination &&
    origin.id === destination.id &&
    !survivorMarch &&
    semantic.resolved === "movement"
  )
    blockers.push("MAP_IDENTITY_ROUTE");

  if (!survivorMarch && semantic.resolved === "movement" && actorProvenance) {
    const actorValid = actorMention
      ? actorIsValid(movingActor, actorMention)
      : actorProvenance.kind === "claim-expression" && movingActor.trim().length > 0;
    if (!actorValid) blockers.push("MAP_ACTOR_INVALID");
  } else if (
    !survivorMarch &&
    semantic.resolved === "movement" &&
    !actorIsValid(movingActor, actorMention ?? null)
  ) {
    blockers.push("MAP_ACTOR_INVALID");
  }
  if (actorMention && isRejectedEntityTextV34(actorMention.text).reject)
    blockers.push("MAP_ACTOR_STOPWORD");
  if (/^in may$/iu.test(movingActor) || origin?.label === "In May")
    blockers.push("MAP_ACTOR_TEMPORAL_FRAGMENT");
  if (destination && lookupCanonicalEntitySeedV34(destination.label)?.entityType === "organization")
    blockers.push("MAP_DESTINATION_NOT_PLACE");
  if (destination && lookupCanonicalEntitySeedV34(destination.label)?.entityType === "person")
    blockers.push("MAP_DESTINATION_PERSON");
  if (semantic.resolved === "movement" && origin && destination) {
    blockers.push(
      ...validateMovementRouteSemanticsV35({
        claimText,
        origin,
        destination,
        movingActor,
      })
    );
  }
  if (semantic.resolved === "movement" && routeType === "none") blockers.push("MAP_ROUTE_TYPE_NONE");
  if (/military/iu.test(routeType)) blockers.push("MAP_ROUTE_TYPE_INVALID");
  if (routeType === "maritime" && /\bmarch|overland|sledges?\b/iu.test(claimText))
    blockers.push("MAP_ROUTE_TYPE_CONTRADICTION");
  if (
    routeType === "overland" &&
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

  const masterId = `map-master-${input.beatNumber}`;
  const stateId = `map-state-${input.beatNumber}`;
  const labelPlaceMap = new Map<string, HistoryPlaceV34>();
  for (const place of [origin, ...waypointPlaces, destination ?? origin]) {
    if (place) labelPlaceMap.set(place.id, place);
  }
  for (const qualifier of input.geographicQualifiers) {
    if (!scopeClaimIds.includes(qualifier.claimId)) continue;
    const place = resolveMentionPlace(qualifier.entityMentionId, entityById);
    if (place) labelPlaceMap.set(place.id, place);
  }
  const labelPlaces = [...labelPlaceMap.values()];
  const effectiveDestination = destination ?? origin;
  const shouldDrawRoute =
    semantic.resolved === "movement" &&
    origin &&
    effectiveDestination &&
    origin.id !== effectiveDestination.id;
  const routeGeometrySemantics = routeGeometryForMovement(semantic.movement);
  const compilerResolution: HistoryMapCompilerResolutionV35 = {
    requestedMapType,
    resolvedMapType: semantic.resolved,
    ...(semantic.downgradeReason ? { downgradeReason: semantic.downgradeReason } : {}),
    ...(semantic.resolutionNotes?.length ? { resolutionNotes: semantic.resolutionNotes } : {}),
    scopeClaimIds,
    geoFactIds: semantic.usedGeoFactIds,
    ...(shouldDrawRoute ? { routeGeometrySemantics } : {}),
  };

  const state: HistoryMapStateV34 = {
    id: stateId,
    masterId,
    purpose: claimText.slice(0, 180) || "Narration-bound map",
    mapPurpose: resolvedMapPurpose,
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
                : routeType === "conceptual"
                  ? "conceptual"
                  : routeType,
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
              ...(movingActorEntityMentionIds.length
                ? { movingActorEntityMentionIds }
                : {}),
              ...(actorProvenance ? { actorProvenance } : {}),
              leaders,
              carrierOrVehicle: null,
              dateOrPeriod: period,
              label: `${origin.label} to ${effectiveDestination.label}`,
              uncertainty:
                routeGeometrySemantics === "schematic-progression"
                  ? "Schematic progression only; exact historical path is not evidenced."
                  : normalizedProposal.uncertainty.join("; ") ||
                    "No precision beyond trusted narration.",
              linkedClaimIds: normalizedProposal.claimIds,
            },
          ]
        : [],
    uncertainty:
      semantic.downgradeReason
        ? `Compiler downgraded from ${requestedMapType} to ${semantic.resolved}: ${semantic.downgradeReason}.`
        : semantic.resolutionNotes?.length
          ? semantic.resolutionNotes.join("; ")
          : normalizedProposal.uncertainty.join("; ") ||
            "Keep geography broad where narration is broad.",
    semanticStatus: blockers.length ? "blocked" : "valid",
    blockerCodes: blockers,
    compilerResolution,
  };
  if (blockers.length) return null;
  return {
    master: {
      id: masterId,
      purpose: singlePlaceMode
        ? `Narration-bound ${resolvedMapPurpose} at ${origin?.label ?? "narrated place"}`
        : semantic.resolved === "sequence"
          ? `Narration-bound sequence across ${labelPlaces.map((item) => item.label).join(", ")}`
          : `Narration-bound ${resolvedMapPurpose} across ${origin?.label} and ${effectiveDestination?.label}`,
      mapPurpose: resolvedMapPurpose,
      supportedRatios: ["16:9", "9:16"],
    },
    state,
  };
}

export function validateCompiledMapStateV35(state: HistoryMapStateV34): string[] {
  const blockers = [...state.blockerCodes];
  if (state.compilerResolution) {
    const { requestedMapType, resolvedMapType, downgradeReason } = state.compilerResolution;
    if (requestedMapType === resolvedMapType && downgradeReason)
      blockers.push("MAP_COMPILER_INVALID_DOWNGRADE");
    if (resolvedMapType === "no-map") blockers.push("MAP_COMPILER_NO_MAP_STATE");
  }
  for (const route of state.routes) {
    if (!route.actorProvenance) blockers.push("MAP_ACTOR_PROVENANCE_MISSING");
    if (route.originPlaceId === route.destinationPlaceId && !isSinglePlaceMapPurpose(state.mapPurpose))
      blockers.push("MAP_IDENTITY_ROUTE");
    if (isPlaceholderCoordinates(route.origin.coordinates))
      blockers.push("MAP_PLACEHOLDER_COORDINATES");
    if (isPlaceholderCoordinates(route.destination.coordinates))
      blockers.push("MAP_PLACEHOLDER_COORDINATES");
    if (isRejectedEntityTextV34(route.movingActor).reject) blockers.push("MAP_ACTOR_INVALID");
    if (!route.linkedClaimIds.length) blockers.push("MAP_CLAIM_MISSING");
    for (const label of state.labels) {
      if (label.provenance === "episode-context" && route.destination.label === label.text)
        blockers.push("MAP_EPISODE_CONTEXT_DESTINATION");
    }
  }
  if (
    state.compilerResolution?.requestedMapType === "movement" &&
    state.compilerResolution.resolvedMapType === "movement" &&
    state.routes.length === 0
  )
    blockers.push("MAP_COMPILER_MOVEMENT_WITHOUT_ROUTE");
  return [...new Set(blockers)];
}

export { claimAuthorizesRouteMovement };
