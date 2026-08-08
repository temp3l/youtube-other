import type {
  HistoryClaimV34,
  HistoryEntityMentionV34,
  HistoryGeographicQualifierV34,
  HistoryMapDowngradeReasonV35,
  HistoryMapSemanticTypeV35,
  HistoryTemporalQualifierV34,
} from "./history-v34-contracts.js";
import { claimAuthorizesRouteMovement } from "./history-visual-semantics-v34.js";
import {
  claimUsesNonRouteMovementVerbOnly,
  placeIsContainedInV35,
} from "./history-map-route-semantics-v35.js";
import {
  resolveMovementActorRefV35,
} from "./history-map-actor-v35.js";
import { dedupeGeoFactsBySemanticIdentityV35 } from "./history-map-semantic-dedup-v35.js";
import type { MovementActorRefV35 } from "./history-v34-contracts.js";

export type GeoFactIdV35 = string;

export interface LocationFactV35 {
  readonly id: GeoFactIdV35;
  readonly type: "location";
  readonly placeMentionId: string;
  readonly claimIds: readonly string[];
}

export interface MovementFactV35 {
  readonly id: GeoFactIdV35;
  readonly type: "movement";
  readonly actorMentionId: string | null;
  readonly actorRef: MovementActorRefV35;
  readonly originMentionId: string;
  readonly destinationMentionId: string;
  readonly waypointMentionIds: readonly string[];
  readonly claimIds: readonly string[];
  readonly temporalQualifierIds: readonly string[];
  readonly documentedPath: boolean;
}

export interface SequenceFactV35 {
  readonly id: GeoFactIdV35;
  readonly type: "sequence";
  readonly placeMentionIds: readonly string[];
  readonly claimIds: readonly string[];
}

export type GeoFactV35 = LocationFactV35 | MovementFactV35 | SequenceFactV35;

export interface MapCapabilitiesV35 {
  readonly locator: boolean;
  readonly sequence: boolean;
  readonly movement: boolean;
  readonly territory: boolean;
  readonly battleDisposition: boolean;
}

export interface MapIntentV35 {
  readonly purpose: string;
  readonly claimIds: readonly string[];
  readonly geoFactIds?: readonly GeoFactIdV35[];
  readonly requestedMapType?: HistoryMapSemanticTypeV35;
}

const PLACE_ENTITY_TYPES = new Set([
  "place",
  "region",
  "water-body",
  "state",
  "island",
]);

const ACTOR_ENTITY_TYPES = new Set([
  "person",
  "ship",
  "military-unit",
  "organization",
]);

function scopedClaims(
  claims: readonly HistoryClaimV34[],
  scopeClaimIds: readonly string[]
): HistoryClaimV34[] {
  const scope = new Set(scopeClaimIds);
  return claims.filter((claim) => scope.has(claim.id));
}

function isPlaceEntity(entity: HistoryEntityMentionV34): boolean {
  return PLACE_ENTITY_TYPES.has(entity.entityType);
}

function isActorEntity(entity: HistoryEntityMentionV34): boolean {
  if (ACTOR_ENTITY_TYPES.has(entity.entityType)) return true;
  return ["actor", "leader"].includes(entity.semanticRole);
}

function factId(parts: readonly string[]): GeoFactIdV35 {
  return `geo-fact-${parts.join("-")}`;
}

function claimGeoQualifiers(
  claimId: string,
  geographicQualifiers: readonly HistoryGeographicQualifierV34[]
): HistoryGeographicQualifierV35[] {
  return geographicQualifiers.filter((item) => item.claimId === claimId);
}

type HistoryGeographicQualifierV35 = HistoryGeographicQualifierV34;

function claimEntities(
  claimId: string,
  entities: readonly HistoryEntityMentionV34[]
): HistoryEntityMentionV34[] {
  return entities.filter((entity) => entity.claimId === claimId);
}

function selectActorMention(
  claim: HistoryClaimV34,
  entities: readonly HistoryEntityMentionV34[]
): HistoryEntityMentionV34 | undefined {
  const claimEntitiesList = claimEntities(claim.id, entities);
  return (
    claimEntitiesList.find((entity) => entity.semanticRole === "actor") ??
    claimEntitiesList.find((entity) => entity.entityType === "ship") ??
    claimEntitiesList.find(
      (entity) => entity.entityType === "person" && entity.semanticRole === "leader"
    ) ??
    claimEntitiesList.find((entity) => entity.entityType === "military-unit")
  );
}

function destinationFromText(text: string): RegExpMatchArray | null {
  return text.match(
    /\b(?:to|toward|towards|into|across)\s+(?:the\s+)?([A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){0,3})/iu
  );
}

function originFromText(text: string): RegExpMatchArray | null {
  return text.match(
    /\b(?:from|leaving|left)\s+(?:the\s+)?([A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){0,3})/iu
  );
}

function findPlaceMentionByLabel(
  label: string,
  claimId: string,
  entities: readonly HistoryEntityMentionV34[]
): HistoryEntityMentionV34 | undefined {
  const normalized = label.trim().toLocaleLowerCase();
  return claimEntities(claimId, entities).find(
    (entity) =>
      isPlaceEntity(entity) && entity.normalizedLabel.toLocaleLowerCase() === normalized
  );
}

function hasExplicitRouteEndpoints(input: {
  readonly origins: readonly string[];
  readonly destinations: readonly string[];
  readonly text: string;
  readonly textOrigin: RegExpMatchArray | null;
  readonly textDestination: RegExpMatchArray | null;
}): boolean {
  return (
    (input.origins.length > 0 && input.destinations.length > 0) ||
    Boolean(input.textOrigin && input.textDestination) ||
    /\bfrom\b.+\bto\b/iu.test(input.text)
  );
}

function resolveTextEndpointMention(
  match: RegExpMatchArray | null,
  claimId: string,
  entities: readonly HistoryEntityMentionV34[]
): string | undefined {
  if (!match?.[1]) return undefined;
  return findPlaceMentionByLabel(match[1], claimId, entities)?.id;
}

function documentedPathSupported(text: string): boolean {
  return /\b(?:exact route|documented path|along the .+ road|followed the .+ route)\b/iu.test(
    text
  );
}

export function extractGeoFactsV35(input: {
  readonly scopeClaimIds: readonly string[];
  readonly claims: readonly HistoryClaimV34[];
  readonly entities: readonly HistoryEntityMentionV34[];
  readonly geographicQualifiers: readonly HistoryGeographicQualifierV34[];
  readonly temporalQualifiers: readonly HistoryTemporalQualifierV34[];
}): GeoFactV35[] {
  const facts: GeoFactV35[] = [];
  const seen = new Set<string>();

  const pushFact = (fact: GeoFactV35): void => {
    if (seen.has(fact.id)) return;
    seen.add(fact.id);
    facts.push(fact);
  };

  for (const claim of scopedClaims(input.claims, input.scopeClaimIds)) {
    const text = claim.normalizedProposition;
    const geo = claimGeoQualifiers(claim.id, input.geographicQualifiers);
    const origins = geo
      .filter((item) => item.role === "origin")
      .map((item) => item.entityMentionId);
    const destinations = geo
      .filter((item) => item.role === "destination")
      .map((item) => item.entityMentionId);
    const locations = geo
      .filter((item) => item.role === "location" || item.role === "region")
      .map((item) => item.entityMentionId);
    const placeMentions = [
      ...new Set(
        claimEntities(claim.id, input.entities)
          .filter((entity) => isPlaceEntity(entity))
          .map((entity) => entity.id)
      ),
    ];

    const textOrigin = originFromText(text);
    const textDestination = destinationFromText(text);
    if (textOrigin) {
      const mention = findPlaceMentionByLabel(textOrigin[1]!, claim.id, input.entities);
      if (mention && !origins.includes(mention.id)) origins.push(mention.id);
    }
    if (textDestination) {
      const mention = findPlaceMentionByLabel(textDestination[1]!, claim.id, input.entities);
      if (mention && !destinations.includes(mention.id)) destinations.push(mention.id);
    }

    const allPlaceIds = [...new Set([...origins, ...destinations, ...locations, ...placeMentions])];
    for (const placeMentionId of allPlaceIds) {
      pushFact({
        id: factId(["location", claim.id, placeMentionId]),
        type: "location",
        placeMentionId,
        claimIds: [claim.id],
      });
    }

    const movementAuthorized =
      claimAuthorizesRouteMovement(text) && !claimUsesNonRouteMovementVerbOnly(text);
    const explicitEndpoints = hasExplicitRouteEndpoints({
      origins,
      destinations,
      text,
      textOrigin,
      textDestination,
    });
    let originId =
      origins[0] ??
      resolveTextEndpointMention(textOrigin, claim.id, input.entities) ??
      undefined;
    let destinationId =
      destinations[0] ??
      resolveTextEndpointMention(textDestination, claim.id, input.entities) ??
      undefined;

    if (movementAuthorized && /\bcross(?:ing|ed)\b/iu.test(text)) {
      const waterBody = claimEntities(claim.id, input.entities).find(
        (entity) => entity.entityType === "water-body"
      );
      const region = claimEntities(claim.id, input.entities).find(
        (entity) =>
          ["place", "state", "region", "country"].includes(entity.entityType) &&
          entity.id !== waterBody?.id
      );
      if (waterBody && region) {
        const crossingPlaces = [waterBody.id, region.id];
        pushFact({
          id: factId(["sequence", "crossing", claim.id, ...crossingPlaces]),
          type: "sequence",
          placeMentionIds: crossingPlaces,
          claimIds: [claim.id],
        });
        originId = undefined;
        destinationId = undefined;
      }
    }

    if (
      movementAuthorized &&
      explicitEndpoints &&
      originId &&
      destinationId &&
      originId !== destinationId
    ) {
      const originEntity = input.entities.find((entity) => entity.id === originId);
      const destinationEntity = input.entities.find((entity) => entity.id === destinationId);
      if (
        originEntity &&
        destinationEntity &&
        placeIsContainedInV35(originEntity.normalizedLabel, destinationEntity.normalizedLabel)
      ) {
        originId = undefined;
        destinationId = undefined;
      }
    }

    if (movementAuthorized && explicitEndpoints && originId && destinationId && originId !== destinationId) {
      const actorResolution = resolveMovementActorRefV35({
        movementClaim: claim,
        scopeClaimIds: input.scopeClaimIds,
        claims: input.claims,
        entities: input.entities,
      });
      if (actorResolution.status === "resolved") {
        const actorRef = actorResolution.actorRef;
        pushFact({
          id: factId([
            "movement",
            claim.id,
            actorRef.kind === "entity"
              ? actorRef.entityMentionId
              : actorRef.kind === "entities"
                ? actorRef.entityMentionIds.join("-")
                : actorRef.normalizedLabel,
            originId,
            destinationId,
          ]),
          type: "movement",
          actorMentionId:
            actorRef.kind === "entity"
              ? actorRef.entityMentionId
              : actorRef.kind === "entities"
                ? (actorRef.entityMentionIds[0] ?? null)
                : null,
          actorRef,
          originMentionId: originId,
          destinationMentionId: destinationId,
          waypointMentionIds: locations.filter(
            (id) => id !== originId && id !== destinationId
          ),
          claimIds: [claim.id],
          temporalQualifierIds: claim.temporalQualifierIds,
          documentedPath: documentedPathSupported(text),
        });
      } else if (allPlaceIds.length >= 2) {
        pushFact({
          id: factId(["sequence", claim.id, ...allPlaceIds]),
          type: "sequence",
          placeMentionIds: allPlaceIds,
          claimIds: [claim.id],
        });
      }
    } else if (allPlaceIds.length >= 2) {
      pushFact({
        id: factId(["sequence", claim.id, ...allPlaceIds]),
        type: "sequence",
        placeMentionIds: allPlaceIds,
        claimIds: [claim.id],
      });
    }
  }

  if (input.scopeClaimIds.length > 1) {
    const orderedPlaces: string[] = [];
    const claimIds: string[] = [];
    for (const claimId of input.scopeClaimIds) {
      const claimFacts = facts.filter(
        (fact) => fact.type === "location" && fact.claimIds.includes(claimId)
      ) as LocationFactV35[];
      for (const fact of claimFacts) {
        if (!orderedPlaces.includes(fact.placeMentionId)) orderedPlaces.push(fact.placeMentionId);
        if (!claimIds.includes(claimId)) claimIds.push(claimId);
      }
    }
    if (orderedPlaces.length >= 2) {
      pushFact({
        id: factId(["segment-sequence", ...claimIds, ...orderedPlaces]),
        type: "sequence",
        placeMentionIds: orderedPlaces,
        claimIds,
      });
    }

    const movementFacts = facts.filter((fact) => fact.type === "movement") as MovementFactV35[];
    if (movementFacts.length >= 2) {
      const chainPlaces = movementFacts.flatMap((fact) => [
        fact.originMentionId,
        fact.destinationMentionId,
      ]);
      const uniqueChain = [...new Set(chainPlaces)];
      if (uniqueChain.length >= 2) {
        pushFact({
          id: factId(["segment-movement-chain", ...claimIds, ...uniqueChain]),
          type: "sequence",
          placeMentionIds: uniqueChain,
          claimIds,
        });
      }
    }
  }

  return dedupeGeoFactsBySemanticIdentityV35(facts, input.entities);
}

export function deriveMapCapabilitiesV35(input: {
  readonly geoFacts: readonly GeoFactV35[];
}): MapCapabilitiesV35 {
  const hasLocation = input.geoFacts.some((fact) => fact.type === "location");
  const hasSequence = input.geoFacts.some((fact) => fact.type === "sequence");
  const hasMovement = input.geoFacts.some((fact) => fact.type === "movement");
  return {
    locator: hasLocation,
    sequence: hasSequence,
    movement: hasMovement,
    territory: false,
    battleDisposition: false,
  };
}

export function requestedMapTypeFromIntent(intent: MapIntentV35): HistoryMapSemanticTypeV35 {
  return intent.requestedMapType ?? "movement";
}

export function downgradeReasonForMissingCapability(input: {
  readonly requested: HistoryMapSemanticTypeV35;
  readonly capabilities: MapCapabilitiesV35;
  readonly geoFacts: readonly GeoFactV35[];
}): HistoryMapDowngradeReasonV35 | undefined {
  if (input.requested === "movement" && !input.capabilities.movement) {
    const hasScopedLocation = input.geoFacts.some((fact) => fact.type === "location");
    if (hasScopedLocation) return "DESTINATION_NOT_SUPPORTED";
    if (!input.capabilities.locator) return "INSUFFICIENT_EVIDENCE";
    return "DESTINATION_NOT_SUPPORTED";
  }
  if (input.requested === "sequence" && !input.capabilities.sequence) {
    if (input.capabilities.locator) return "MOVEMENT_NOT_SUPPORTED";
    return "INSUFFICIENT_EVIDENCE";
  }
  if (input.requested === "locator" && !input.capabilities.locator)
    return "INSUFFICIENT_EVIDENCE";
  return undefined;
}

export function findMovementFactForActor(input: {
  readonly geoFacts: readonly GeoFactV35[];
  readonly actorMentionId: string;
}): MovementFactV35 | undefined {
  return input.geoFacts.find(
    (fact): fact is MovementFactV35 =>
      fact.type === "movement" &&
      (fact.actorRef.kind === "entity"
        ? fact.actorRef.entityMentionId === input.actorMentionId
        : fact.actorRef.kind === "entities"
          ? fact.actorRef.entityMentionIds.includes(input.actorMentionId)
          : false)
  );
}

export function findAnyMovementFact(
  geoFacts: readonly GeoFactV35[]
): MovementFactV35 | undefined {
  return geoFacts.find((fact): fact is MovementFactV35 => fact.type === "movement");
}

export function findPrimaryLocationFact(
  geoFacts: readonly GeoFactV35[]
): LocationFactV35 | undefined {
  return geoFacts.find((fact): fact is LocationFactV35 => fact.type === "location");
}

export function findSequenceFact(
  geoFacts: readonly GeoFactV35[]
): SequenceFactV35 | undefined {
  return geoFacts.find((fact): fact is SequenceFactV35 => fact.type === "sequence");
}
