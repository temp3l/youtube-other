import type {
  HistoryEntityMentionV34,
  HistoryMapPurposeV34,
  HistoryMapSemanticTypeV35,
  HistoryMapStateV34,
} from "./history-v34-contracts.js";
import type { GeoFactV35 } from "./history-geo-facts-v35.js";

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function orderedUnique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function mentionIdentity(
  mentionId: string,
  entities: readonly Pick<HistoryEntityMentionV34, "id" | "normalizedLabel" | "entityType">[]
): string {
  const entity = entities.find((item) => item.id === mentionId);
  return entity
    ? `${entity.entityType}:${entity.normalizedLabel.trim().toLocaleLowerCase()}`
    : mentionId;
}

export function semanticGeoFactIdentityV35(
  fact: GeoFactV35,
  entities: readonly Pick<HistoryEntityMentionV34, "id" | "normalizedLabel" | "entityType">[] = []
): string {
  switch (fact.type) {
    case "location":
      return `location|${mentionIdentity(fact.placeMentionId, entities)}`;
    case "movement": {
      const actorKey =
        fact.actorRef.kind === "entity"
          ? `entity:${mentionIdentity(fact.actorRef.entityMentionId, entities)}`
          : fact.actorRef.kind === "entities"
            ? `entities:${sortedUnique(
                fact.actorRef.entityMentionIds.map((id) => mentionIdentity(id, entities))
              ).join(",")}`
            : `expr:${fact.actorRef.normalizedLabel.toLocaleLowerCase()}`;
      return [
        "movement",
        actorKey,
        mentionIdentity(fact.originMentionId, entities),
        mentionIdentity(fact.destinationMentionId, entities),
        orderedUnique(fact.waypointMentionIds)
          .map((id) => mentionIdentity(id, entities))
          .join(">"),
      ].join("|");
    }
    case "sequence":
      return `sequence|${orderedUnique(fact.placeMentionIds)
        .map((id) => mentionIdentity(id, entities))
        .join(">")}`;
  }
}

export function canonicalMapOwnerIdentityV35(input: {
  readonly episodeId: string;
  readonly owningClaimIds: readonly string[];
  readonly relationType: HistoryMapSemanticTypeV35;
  readonly mapType: HistoryMapPurposeV34;
}): string {
  return [
    input.episodeId,
    sortedUnique(input.owningClaimIds).join(","),
    input.relationType,
    input.mapType,
  ].join("::");
}

export function canonicalMapExplanationIdentityV35(input: {
  readonly episodeId: string;
  readonly state: Pick<HistoryMapStateV34, "compilerResolution" | "mapPurpose">;
}): string {
  const resolution = input.state.compilerResolution;
  return canonicalMapOwnerIdentityV35({
    episodeId: input.episodeId,
    owningClaimIds: resolution?.owningClaimIds ?? resolution?.scopeClaimIds ?? [],
    relationType: resolution?.resolvedMapType ?? "locator",
    mapType: input.state.mapPurpose,
  });
}

export function buildCanonicalMapEvidenceScopesV35(input: {
  readonly orderedClaimIds: readonly string[];
  readonly owningClaimIds: readonly string[];
}): readonly (readonly string[])[] {
  const ordered = orderedUnique(input.orderedClaimIds);
  const ownerSet = new Set(input.owningClaimIds);
  const ownerIndexes = ordered
    .map((claimId, index) => (ownerSet.has(claimId) ? index : -1))
    .filter((index) => index >= 0);
  if (!ownerIndexes.length) return [orderedUnique(input.owningClaimIds)];

  const first = Math.min(...ownerIndexes);
  const last = Math.max(...ownerIndexes);
  const ownerWindow = ordered.slice(first, last + 1);
  const preceding = ordered[first - 1];
  const following = ordered[last + 1];
  const scopes: string[][] = [ownerWindow];
  if (preceding) scopes.push([preceding, ...ownerWindow]);
  if (following) scopes.push([...ownerWindow, following]);
  if (preceding && following) scopes.push([preceding, ...ownerWindow, following]);
  const seen = new Set<string>();
  return scopes.filter((scope) => {
    const key = scope.join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type CanonicalMapWindowCandidateV35<T> = {
  readonly value: T;
  readonly scopeClaimIds: readonly string[];
  readonly complete: boolean;
  readonly semanticConfidence: number;
  readonly stableOrder: number;
};

export function selectCanonicalMapWindowV35<T>(
  candidates: readonly CanonicalMapWindowCandidateV35<T>[]
): CanonicalMapWindowCandidateV35<T> | undefined {
  return [...candidates].sort((left, right) => {
    if (left.complete !== right.complete) return left.complete ? -1 : 1;
    if (left.scopeClaimIds.length !== right.scopeClaimIds.length)
      return left.scopeClaimIds.length - right.scopeClaimIds.length;
    if (left.semanticConfidence !== right.semanticConfidence)
      return right.semanticConfidence - left.semanticConfidence;
    const scopeOrder = left.scopeClaimIds.join("|").localeCompare(right.scopeClaimIds.join("|"));
    return scopeOrder || left.stableOrder - right.stableOrder;
  })[0];
}

export function semanticMapStateIdentityV35(
  state: Pick<
    HistoryMapStateV34,
    "compilerResolution" | "labels" | "routes" | "mapPurpose" | "affectedArea" | "baseGeography"
  >
): string {
  const resolution = state.compilerResolution;
  const geoFactIds = sortedUnique(resolution?.geoFactIds ?? []).join(",");
  const labelKey = [...state.labels]
    .map((label) => `${label.placeId ?? label.text.trim().toLocaleLowerCase()}:${label.provenance ?? ""}`)
    .sort()
    .join("|");
  const routeKey = [...state.routes]
    .map(
      (route) =>
        `${route.originPlaceId ?? route.origin.label.trim().toLocaleLowerCase()}>${route.destinationPlaceId ?? route.destination.label.trim().toLocaleLowerCase()}:${route.routeType}`
    )
    .sort()
    .join("|");
  return [
    resolution?.resolvedMapType ?? "unknown",
    state.mapPurpose ?? "",
    geoFactIds,
    labelKey,
    routeKey,
    state.affectedArea?.trim().toLocaleLowerCase() ?? "",
    state.baseGeography?.trim().toLocaleLowerCase() ?? "",
  ].join("::");
}

export function mergeMapCompilerScopeV35(
  existing: HistoryMapStateV34["compilerResolution"],
  incoming: HistoryMapStateV34["compilerResolution"]
): HistoryMapStateV34["compilerResolution"] {
  if (!existing) return incoming;
  if (!incoming) return existing;
  const scopeClaimIds = sortedUnique([
    ...(existing.scopeClaimIds ?? []),
    ...(incoming.scopeClaimIds ?? []),
  ]);
  const geoFactIds = sortedUnique([
    ...(existing.geoFactIds ?? []),
    ...(incoming.geoFactIds ?? []),
  ]);
  return {
    ...existing,
    ...incoming,
    scopeClaimIds,
    geoFactIds,
    requestedMapType: existing.requestedMapType ?? incoming.requestedMapType,
    resolvedMapType: existing.resolvedMapType ?? incoming.resolvedMapType,
    ...(existing.downgradeReason
      ? { downgradeReason: existing.downgradeReason }
      : incoming.downgradeReason
        ? { downgradeReason: incoming.downgradeReason }
        : {}),
  };
}

export function dedupeGeoFactsBySemanticIdentityV35(
  facts: readonly GeoFactV35[],
  entities: readonly Pick<HistoryEntityMentionV34, "id" | "normalizedLabel" | "entityType">[] = []
): GeoFactV35[] {
  const byIdentity = new Map<string, GeoFactV35>();
  for (const fact of facts) {
    const identity = semanticGeoFactIdentityV35(fact, entities);
    const existing = byIdentity.get(identity);
    if (!existing) {
      byIdentity.set(identity, fact);
      continue;
    }
    const claimIds = sortedUnique([...existing.claimIds, ...fact.claimIds]);
    byIdentity.set(identity, { ...existing, claimIds });
  }
  return [...byIdentity.values()];
}
