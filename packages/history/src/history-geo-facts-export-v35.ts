import {
  extractGeoFactsV35,
  type GeoFactV35,
  type LocationFactV35,
  type MovementFactV35,
  type SequenceFactV35,
} from "./history-geo-facts-v35.js";
import { resolveHistoryPlaceV34 } from "./history-geo-v34.js";
import type {
  HistoryEntityMentionV34,
  HistoryMapStateV34,
  HistoryRouteGeometrySemanticsV35,
  HistoryVisualPlanV35,
} from "./history-v34-contracts.js";

export interface ReviewableGeoFactV35 {
  readonly id: string;
  readonly type: "location" | "movement" | "sequence";
  readonly actorId?: string;
  readonly actorIds?: readonly string[];
  readonly actorKind?: "entity" | "entities" | "claim-expression";
  readonly actorLabel?: string;
  readonly actorSourceText?: string;
  readonly actorSourceSpan?: {
    readonly startUtf16: number;
    readonly endUtf16Exclusive: number;
  };
  readonly actorClaimIds?: readonly string[];
  readonly placeId?: string;
  readonly originPlaceId?: string;
  readonly destinationPlaceId?: string;
  readonly waypointPlaceIds?: readonly string[];
  readonly claimIds: readonly string[];
  readonly temporalScope?: readonly string[];
  readonly routeGeometrySemantics?: HistoryRouteGeometrySemanticsV35;
}

function placeIdForMention(
  mentionId: string,
  entities: readonly HistoryEntityMentionV34[]
): string | undefined {
  const entity = entities.find((item) => item.id === mentionId);
  if (!entity) return undefined;
  return resolveHistoryPlaceV34(entity.normalizedLabel)?.id;
}

function serializeGeoFactForReview(
  fact: GeoFactV35,
  entities: readonly HistoryEntityMentionV34[]
): ReviewableGeoFactV35 {
  switch (fact.type) {
    case "location":
      return {
        id: fact.id,
        type: "location",
        ...(placeIdForMention(fact.placeMentionId, entities)
          ? { placeId: placeIdForMention(fact.placeMentionId, entities) }
          : {}),
        claimIds: fact.claimIds,
      };
    case "movement": {
      const waypointPlaceIds = fact.waypointMentionIds
        .map((mentionId) => placeIdForMention(mentionId, entities))
        .filter((placeId): placeId is string => Boolean(placeId));
      const actorRef = fact.actorRef;
      return {
        id: fact.id,
        type: "movement",
        actorKind: actorRef.kind,
        actorClaimIds: actorRef.claimIds,
        ...(actorRef.kind === "entity"
          ? { actorId: actorRef.entityMentionId }
          : actorRef.kind === "entities"
            ? { actorIds: actorRef.entityMentionIds }
            : {
                actorLabel: actorRef.normalizedLabel,
                actorSourceText: actorRef.sourceText,
                ...(actorRef.sourceSpan ? { actorSourceSpan: actorRef.sourceSpan } : {}),
              }),
        ...(placeIdForMention(fact.originMentionId, entities)
          ? { originPlaceId: placeIdForMention(fact.originMentionId, entities) }
          : {}),
        ...(placeIdForMention(fact.destinationMentionId, entities)
          ? { destinationPlaceId: placeIdForMention(fact.destinationMentionId, entities) }
          : {}),
        ...(waypointPlaceIds.length ? { waypointPlaceIds } : {}),
        claimIds: fact.claimIds,
        ...(fact.temporalQualifierIds.length
          ? { temporalScope: fact.temporalQualifierIds }
          : {}),
        routeGeometrySemantics: fact.documentedPath
          ? "documented-path"
          : "schematic-progression",
      };
    }
    case "sequence": {
      const waypointPlaceIds = fact.placeMentionIds
        .map((mentionId) => placeIdForMention(mentionId, entities))
        .filter((placeId): placeId is string => Boolean(placeId));
      return {
        id: fact.id,
        type: "sequence",
        ...(waypointPlaceIds.length ? { waypointPlaceIds } : {}),
        claimIds: fact.claimIds,
      };
    }
  }
}

function scopedFactsForMapState(
  plan: HistoryVisualPlanV35,
  state: HistoryMapStateV34
): GeoFactV35[] {
  const scopeClaimIds = state.compilerResolution?.scopeClaimIds ?? [];
  if (!scopeClaimIds.length) return [];
  return extractGeoFactsV35({
    scopeClaimIds,
    claims: plan.claims,
    entities: plan.entities,
    geographicQualifiers: plan.geographicQualifiers,
    temporalQualifiers: plan.temporalQualifiers,
  });
}

export function buildReviewableGeoFactsV35(
  plan: HistoryVisualPlanV35
): ReviewableGeoFactV35[] {
  const exported = new Map<string, ReviewableGeoFactV35>();
  for (const state of plan.mapStates) {
    const wanted = new Set(state.compilerResolution?.geoFactIds ?? []);
    if (!wanted.size) continue;
    for (const fact of scopedFactsForMapState(plan, state)) {
      if (!wanted.has(fact.id)) continue;
      exported.set(fact.id, serializeGeoFactForReview(fact, plan.entities));
    }
  }
  return [...exported.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function validateGeoFactReferentialIntegrityV35(input: {
  readonly plan: HistoryVisualPlanV35;
  readonly exportedGeoFacts: readonly ReviewableGeoFactV35[];
}): string[] {
  const exportedIds = new Set(input.exportedGeoFacts.map((fact) => fact.id));
  const errors: string[] = [];
  for (const state of input.plan.mapStates) {
    for (const geoFactId of state.compilerResolution?.geoFactIds ?? []) {
      if (!exportedIds.has(geoFactId))
        errors.push(`Dangling geoFactId ${geoFactId} referenced by ${state.id}`);
    }
  }
  return errors;
}

export function collectUsedGeoFactIdsV35(input: {
  readonly geoFacts: readonly GeoFactV35[];
  readonly movement?: MovementFactV35;
  readonly sequence?: SequenceFactV35;
  readonly locatorPlaceMentionId?: string;
  readonly sequencePlaceMentionIds?: readonly string[];
}): readonly string[] {
  const ids = new Set<string>();
  if (input.movement) ids.add(input.movement.id);
  if (input.sequence) ids.add(input.sequence.id);
  for (const fact of input.geoFacts) {
    if (fact.type !== "location") continue;
    if (input.locatorPlaceMentionId && fact.placeMentionId === input.locatorPlaceMentionId)
      ids.add(fact.id);
    if (input.sequencePlaceMentionIds?.includes(fact.placeMentionId)) ids.add(fact.id);
  }
  return [...ids];
}
