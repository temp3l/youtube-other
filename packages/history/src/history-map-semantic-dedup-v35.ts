import type { HistoryMapStateV34 } from "./history-v34-contracts.js";
import type { GeoFactV35 } from "./history-geo-facts-v35.js";

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function semanticGeoFactIdentityV35(fact: GeoFactV35): string {
  switch (fact.type) {
    case "location":
      return `location|${fact.placeMentionId}`;
    case "movement": {
      const actorKey =
        fact.actorRef.kind === "entity"
          ? `entity:${fact.actorRef.entityMentionId}`
          : fact.actorRef.kind === "entities"
            ? `entities:${sortedUnique(fact.actorRef.entityMentionIds).join(",")}`
            : `expr:${fact.actorRef.normalizedLabel.toLocaleLowerCase()}`;
      return [
        "movement",
        actorKey,
        fact.originMentionId,
        fact.destinationMentionId,
        sortedUnique(fact.waypointMentionIds).join(">"),
      ].join("|");
    }
    case "sequence":
      return `sequence|${sortedUnique(fact.placeMentionIds).join(">")}`;
  }
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

export function dedupeGeoFactsBySemanticIdentityV35(facts: readonly GeoFactV35[]): GeoFactV35[] {
  const byIdentity = new Map<string, GeoFactV35>();
  for (const fact of facts) {
    const identity = semanticGeoFactIdentityV35(fact);
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
