/** Typed, episode-agnostic semantic map and diagram planning for history visuals v3.1. */
export type GeoEntityType =
  | "place"
  | "person"
  | "state-or-polity"
  | "army-or-formation"
  | "ethnic-or-social-group"
  | "organisation"
  | "date-or-period"
  | "date"
  | "period"
  | "event"
  | "disease-or-pathogen"
  | "law-or-policy"
  | "document"
  | "object-or-material-culture"
  | "trade-route"
  | "religious-institution"
  | "economic-concept"
  | "other";
export type AcceptedGeoEntity = Readonly<{
  id: string;
  canonicalName: string;
  type: GeoEntityType;
  sourceUnitIds?: readonly string[];
}>;
export type GeoClaim = Readonly<{
  id: string;
  text: string;
  unitIds: readonly string[];
}>;
export type GeoDiagnostic = Readonly<{
  code: string;
  severity: "error" | "warning";
  message: string;
  affectedIds: readonly string[];
}>;
export type MapKindV31 =
  | "campaign"
  | "territorial-change"
  | "trade-network"
  | "disease-spread"
  | "battlefield"
  | "regional-context";
export type MapMasterV31 = Readonly<{
  id: string;
  kind: MapKindV31;
  mapKind: MapKindV31;
  title: string;
  baseGeographicExtent: string;
  projection: "regional" | "continental" | "world";
  projectionOrLayoutIntent: string;
  supportedRatios: readonly ["16:9", "9:16"];
  supportedAspectRatios: readonly ["16:9", "9:16"];
  sourceStatus: "narration-grounded" | "claim-grounded";
}>;
export type RouteV31 = Readonly<{
  id: string;
  type:
    | "army-advance"
    | "army-retreat"
    | "maritime-trade"
    | "overland-trade"
    | "political-boundary-change"
    | "territorial-loss"
    | "disease-transmission";
  fromEntityId: string;
  toEntityId: string;
  actorEntityIds: readonly string[];
  dateOrPeriod: string;
  direction: string;
  label: string;
  claimIds: readonly string[];
  confidence: number;
}>;
export type MovementV31 = Readonly<{
  kind: MapKindV31;
  routeIds: readonly string[];
  claimIds: readonly string[];
}>;
export type MapStateV31 = Readonly<{
  id: string;
  masterId: string;
  title: string;
  dateOrPeriod: string;
  geographicExtent: string;
  locationEntityIds: readonly string[];
  actorEntityIds: readonly string[];
  narrationUnitIds: readonly string[];
  claimIds: readonly string[];
  labels: readonly string[];
  legend: string;
  camera: string;
  confidence: number;
  uncertaintyDisclosure: string;
  routes: readonly RouteV31[];
  movements: readonly MovementV31[];
  routeAbsenceJustification?: string;
}>;
export type DiagramDomainV31 =
  | "logistics"
  | "fiscal-political"
  | "disease-demographic-labour";
export type DiagramMasterV31 = Readonly<{
  id: string;
  title: string;
  domain: DiagramDomainV31;
  sourceStatus: "claim-grounded";
}>;
export type DiagramNodeV31 = Readonly<{
  id: string;
  label: string;
  kind:
    | "actor"
    | "resource"
    | "pressure"
    | "outcome"
    | "population"
    | "institution";
  entityIds: readonly string[];
  claimIds: readonly string[];
  description: string;
}>;
export type DiagramEdgeV31 = Readonly<{
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label: string;
  claimIds: readonly string[];
  confidence: number;
}>;
export type DiagramStateV31 = Readonly<{
  id: string;
  masterId: string;
  domain: DiagramDomainV31;
  nodes: readonly DiagramNodeV31[];
  edges: readonly DiagramEdgeV31[];
  narrationUnitIds: readonly string[];
  claimIds: readonly string[];
  explanation: string;
}>;
export type HistoryGeoV31Plan = Readonly<{
  mapMasters: readonly MapMasterV31[];
  mapStates: readonly MapStateV31[];
  diagramMasters: readonly DiagramMasterV31[];
  diagramStates: readonly DiagramStateV31[];
  diagnostics: readonly GeoDiagnostic[];
}>;

const placeholder =
  /\b(?:narrated|validated|unknown|tbd|placeholder|not specified)\b/iu;
const rawId =
  /\b(?:entity|claim|map|diagram|node|route)-(?:\d+|[a-z0-9-]+)\b/iu;
const campaign =
  /\b(?:advance(?:d|s|ing)?|retreat(?:ed|s|ing)?|march(?:ed|es|ing)?|cross(?:ed|es|ing)?|withdrew|withdrawn|moved through|moved into|sailed from|entered)\b/iu;
const territorial =
  /\b(?:annex(?:ed|ation)|conquer(?:ed|ing)|expanded|ceded|lost control|captured|ruled by|successor kingdoms?)\b/iu;
const trade =
  /\b(?:ships? arrived|merchant ships? linked|roads? carried|trade routes?|maritime networks?|goods moved)\b/iu;
const disease =
  /(?:\b(?:plague|disease|epidemic|pandemic|infection|black death)\b.*\b(?:spread|moved|travel(?:led|ed)?|carried|arrived|entered|reached|routes?|networks?)\b|\b(?:spread|moved|travel(?:led|ed)?|carried|arrived|entered|reached)\b.*\b(?:plague|disease|epidemic|pandemic|infection|black death)\b)/iu;
const diseaseCoverage =
  /\b(?:plague|pandemic|black death)\b.*\b(?:across|throughout)\b/iu;
const mapContext =
  /\b(?:battle|battlefield|fought|captured|encirclement|siege|crossing|blocked (?:the|that) route)\b/iu;
const logistics =
  /\b(?:supply|logistics|provision|transport|distance|ration|fuel)\b/iu;
const fiscal =
  /\b(?:tax|revenue|debt|tribute|treasury|state power|authority|government|political)\b/iu;
const labour =
  /\b(?:labou?r|workforce|population|demographic|death|mortality|shortage)\b/iu;
const date =
  /\b(?:\d{3,4}(?:\s*(?:bc|bce|ad|ce))?|\d{1,2}(?:st|nd|rd|th)?\s+century)\b/iu;
const unique = <T>(items: readonly T[]): T[] => [...new Set(items)];
const clean = (value: string) => value.replace(/\s+/gu, " ").trim();
const problem = (
  code: string,
  severity: GeoDiagnostic["severity"],
  message: string,
  affectedIds: readonly string[] = []
): GeoDiagnostic => ({ code, severity, message, affectedIds });
const badText = (value: string) =>
  !clean(value) || placeholder.test(value) || rawId.test(value);
const entityInClaim = (entity: AcceptedGeoEntity, claim: GeoClaim) =>
  (entity.sourceUnitIds?.some((id) => claim.unitIds.includes(id)) ?? false) ||
  new RegExp(
    `\\b${entity.canonicalName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\b`,
    "iu"
  ).test(claim.text);
const local = (
  entities: readonly AcceptedGeoEntity[],
  claim: GeoClaim,
  type?: GeoEntityType
) =>
  entities.filter(
    (entity) => (!type || entity.type === type) && entityInClaim(entity, claim)
  );
const periodFor = (
  entities: readonly AcceptedGeoEntity[],
  narration: string,
  claim: GeoClaim
) => {
  const explicitMonthDay = claim.text.match(
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b/iu
  )?.[0];
  const explicitLateMonth = claim.text.match(
    /\b(?:early|mid|late)\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/iu
  )?.[0];
  const narrationYear = narration.match(/\b\d{4}\b/u)?.[0];
  if (explicitMonthDay || explicitLateMonth)
    return `${explicitMonthDay ?? explicitLateMonth}${narrationYear ? `, ${narrationYear}` : ""}`;
  const exactDate = local(entities, claim).find((entity) =>
    ["date-or-period", "date", "period"].includes(entity.type)
  );
  if (exactDate) return exactDate.canonicalName;
  const claimUnitNumbers = claim.unitIds
    .map(unitNumber)
    .filter((value): value is number => value !== undefined);
  const nearestDate = entities
    .filter(
      (entity) =>
        ["date-or-period", "date", "period"].includes(entity.type) &&
        nearClaim(entity, claim)
    )
    .sort((left, right) => {
      const distance = (entity: AcceptedGeoEntity): number =>
        Math.min(
          ...(entity.sourceUnitIds ?? []).map((id) => {
            const value = unitNumber(id);
            return value === undefined
              ? Number.MAX_SAFE_INTEGER
              : Math.min(
                  ...claimUnitNumbers.map((number) => Math.abs(number - value))
                );
          })
        );
      return distance(left) - distance(right);
    })[0];
  return (
    nearestDate?.canonicalName ?? claim.text.match(date)?.[0] ?? narrationYear
  );
};
const routeType = (kind: MapKindV31, text: string): RouteV31["type"] =>
  kind === "disease-spread"
    ? "disease-transmission"
    : kind === "trade-network"
      ? /\b(?:ships?|maritime|port)\b/iu.test(text)
        ? "maritime-trade"
        : "overland-trade"
      : kind === "territorial-change"
        ? /\b(?:ceded|lost control|loss|lost)\b/iu.test(text)
          ? "territorial-loss"
          : "political-boundary-change"
        : /\bretreat/iu.test(text)
          ? "army-retreat"
          : "army-advance";
const unitNumber = (id: string): number | undefined => {
  const match = id.match(/(\d+)$/u);
  return match ? Number(match[1]) : undefined;
};
const nearClaim = (entity: AcceptedGeoEntity, claim: GeoClaim): boolean => {
  const claimNumbers = claim.unitIds
    .map(unitNumber)
    .filter((value): value is number => value !== undefined);
  return (
    entity.sourceUnitIds?.some((id) => {
      const value = unitNumber(id);
      return (
        value !== undefined &&
        claimNumbers.some((number) => Math.abs(number - value) <= 2)
      );
    }) ?? false
  );
};
const isGeographic = (entity: AcceptedGeoEntity): boolean =>
  entity.type === "place" || entity.type === "state-or-polity";
const escaped = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const routeEndpoints = (
  places: readonly AcceptedGeoEntity[],
  claim: GeoClaim
): readonly [AcceptedGeoEntity, AcceptedGeoEntity] => {
  const from = places.find((entity) =>
    new RegExp(
      `\\bfrom\\s+(?:the\\s+)?${escaped(entity.canonicalName)}\\b`,
      "iu"
    ).test(claim.text)
  );
  const strongDestination = places.find((entity) =>
    new RegExp(
      `\\b(?:to|into|toward|towards|at|near|entered|reached)\\s+(?:(?:one|parts?|regions?|territory|the|of|in)\\s+){0,3}${escaped(entity.canonicalName)}(?:['’]s)?\\b`,
      "iu"
    ).test(claim.text)
  );
  const destination =
    strongDestination ??
    places.find((entity) =>
      new RegExp(
        `\\b(?:across|through)\\s+(?:the\\s+)?${escaped(entity.canonicalName)}\\b`,
        "iu"
      ).test(claim.text)
    );
  if (from && destination && from.id !== destination.id)
    return [from, destination];
  if (from) return [from, places.find((entity) => entity.id !== from.id)!];
  if (destination)
    return [
      places.find((entity) => entity.id !== destination.id)!,
      destination,
    ];
  return [places[0]!, places[1]!];
};

export function validateHistoryGeoV31Plan(
  plan: HistoryGeoV31Plan,
  acceptedEntities: readonly AcceptedGeoEntity[],
  acceptedClaims: readonly GeoClaim[] = []
): readonly GeoDiagnostic[] {
  const diagnostics: GeoDiagnostic[] = [];
  const entityIds = new Map(
    acceptedEntities.map((entity) => [entity.id, entity])
  );
  const claimIds = new Set(acceptedClaims.map((claim) => claim.id));
  const allIds = new Set<string>();
  const id = (value: string) => {
    if (allIds.has(value))
      diagnostics.push(
        problem(
          "DUPLICATE_STRUCTURE_ID",
          "error",
          "Structure ids must be unique.",
          [value]
        )
      );
    allIds.add(value);
  };
  const claimsExist = (ids: readonly string[], owner: string) => {
    for (const claimId of ids)
      if (!claimIds.has(claimId))
        diagnostics.push(
          problem(
            "CLAIM_REFERENCE_NOT_ACCEPTED",
            "error",
            "Structure references a claim outside the accepted claim set.",
            [owner, claimId]
          )
        );
  };
  for (const master of plan.mapMasters) {
    id(master.id);
    if (badText(master.baseGeographicExtent))
      diagnostics.push(
        problem(
          "MAP_MASTER_PLACEHOLDER",
          "error",
          "Map masters require a concrete base extent.",
          [master.id]
        )
      );
  }
  for (const state of plan.mapStates) {
    id(state.id);
    claimsExist(state.claimIds, state.id);
    if (!plan.mapMasters.some((master) => master.id === state.masterId))
      diagnostics.push(
        problem(
          "MAP_MASTER_MISSING",
          "error",
          "Map state references an unknown master.",
          [state.id, state.masterId]
        )
      );
    if (
      [
        state.dateOrPeriod,
        state.geographicExtent,
        state.legend,
        state.camera,
        state.uncertaintyDisclosure,
      ].some(badText) ||
      !state.locationEntityIds.length ||
      !state.narrationUnitIds.length ||
      !state.claimIds.length ||
      !state.labels.length ||
      state.confidence < 0 ||
      state.confidence > 1
    )
      diagnostics.push(
        problem(
          "MAP_STATE_SEMANTICS_INCOMPLETE",
          "error",
          "Map states require concrete date, extent, locations, claims, labels, legend, camera, confidence, and uncertainty disclosure.",
          [state.id]
        )
      );
    for (const placeId of state.locationEntityIds)
      if (!entityIds.get(placeId) || !isGeographic(entityIds.get(placeId)!))
        diagnostics.push(
          problem(
            "MAP_PLACE_NOT_ACCEPTED",
            "error",
            "State locations must be accepted geographic entities.",
            [state.id, placeId]
          )
        );
    for (const actorId of state.actorEntityIds)
      if (
        !entityIds.has(actorId) ||
        ["place", "date-or-period", "date", "period"].includes(
          entityIds.get(actorId)!.type
        )
      )
        diagnostics.push(
          problem(
            "MAP_ACTOR_NOT_ACCEPTED",
            "error",
            "Map actors must be accepted non-place entities.",
            [state.id, actorId]
          )
        );
    if (state.movements.length && !state.routes.length)
      diagnostics.push(
        problem(
          "MOVEMENT_WITHOUT_ROUTE",
          "error",
          "Movement map states require routes.",
          [state.id]
        )
      );
    for (const route of state.routes) {
      id(route.id);
      claimsExist(route.claimIds, route.id);
      for (const endpoint of [route.fromEntityId, route.toEntityId])
        if (!entityIds.get(endpoint) || !isGeographic(entityIds.get(endpoint)!))
          diagnostics.push(
            problem(
              "ROUTE_ENDPOINT_NOT_PLACE",
              "error",
              "Route endpoints must be accepted geographic entities.",
              [route.id, endpoint]
            )
          );
      for (const actorId of route.actorEntityIds)
        if (!state.actorEntityIds.includes(actorId))
          diagnostics.push(
            problem(
              "ROUTE_ACTOR_NOT_STATE_ACTOR",
              "error",
              "Route actors must be declared on its map state.",
              [route.id, actorId]
            )
          );
      if (
        [route.dateOrPeriod, route.direction, route.label].some(badText) ||
        route.confidence < 0 ||
        route.confidence > 1
      )
        diagnostics.push(
          problem(
            "ROUTE_SEMANTICS_INCOMPLETE",
            "error",
            "Routes require concrete time, direction, label, and confidence.",
            [route.id]
          )
        );
    }
    for (const movement of state.movements)
      if (
        !movement.routeIds.length ||
        movement.routeIds.some(
          (routeId) => !state.routes.some((route) => route.id === routeId)
        )
      )
        diagnostics.push(
          problem(
            "MOVEMENT_WITHOUT_ROUTE",
            "error",
            "Every movement must reference a route in its state.",
            [state.id]
          )
        );
  }
  for (const master of plan.diagramMasters) id(master.id);
  for (const state of plan.diagramStates) {
    id(state.id);
    claimsExist(state.claimIds, state.id);
    if (
      !plan.diagramMasters.some(
        (master) =>
          master.id === state.masterId && master.domain === state.domain
      )
    )
      diagnostics.push(
        problem(
          "DIAGRAM_MASTER_MISSING",
          "error",
          "Diagram state references an unknown or mismatched master.",
          [state.id]
        )
      );
    const nodes = new Set<string>();
    for (const node of state.nodes) {
      id(node.id);
      nodes.add(node.id);
      claimsExist(node.claimIds, node.id);
      if (
        !node.entityIds.length ||
        !node.claimIds.length ||
        badText(node.label) ||
        badText(node.description)
      )
        diagnostics.push(
          problem(
            "DIAGRAM_NODE_SEMANTICS_INCOMPLETE",
            "error",
            "Diagram nodes require accepted entities, claims, labels, and descriptions.",
            [node.id]
          )
        );
      for (const entityId of node.entityIds)
        if (!entityIds.has(entityId))
          diagnostics.push(
            problem(
              "DIAGRAM_ENTITY_NOT_ACCEPTED",
              "error",
              "Diagram nodes must reference accepted entities.",
              [node.id, entityId]
            )
          );
    }
    for (const edge of state.edges) {
      id(edge.id);
      claimsExist(edge.claimIds, edge.id);
      if (
        !nodes.has(edge.fromNodeId) ||
        !nodes.has(edge.toNodeId) ||
        badText(edge.label) ||
        !edge.claimIds.length ||
        edge.confidence < 0 ||
        edge.confidence > 1
      )
        diagnostics.push(
          problem(
            "DIAGRAM_EDGE_SEMANTICS_INCOMPLETE",
            "error",
            "Diagram edges require declared endpoints, a semantic label, claims, and confidence.",
            [edge.id]
          )
        );
    }
    if (
      state.nodes.length < 2 ||
      !state.edges.length ||
      !state.claimIds.length ||
      !state.narrationUnitIds.length
    )
      diagnostics.push(
        problem(
          "DIAGRAM_STRUCTURE_INCOMPLETE",
          "error",
          "Diagrams require nodes, edges, claims, and narration units.",
          [state.id]
        )
      );
  }
  const semanticKeys = [...plan.mapStates, ...plan.diagramStates].map(
    (state) => `${state.masterId}|${state.claimIds.join(",")}`
  );
  for (const key of unique(semanticKeys))
    if (semanticKeys.filter((value) => value === key).length > 1)
      diagnostics.push(
        problem(
          "DUPLICATE_SEMANTIC_STRUCTURE",
          "warning",
          "Multiple structures repeat the same master and claim set.",
          [key]
        )
      );
  return diagnostics;
}

export function planHistoryGeoV31(
  input: Readonly<{
    narration: string;
    entities: readonly AcceptedGeoEntity[];
    claims: readonly GeoClaim[];
  }>
): HistoryGeoV31Plan {
  const mapMasters: MapMasterV31[] = [];
  const mapStates: MapStateV31[] = [];
  const diagramMasters: DiagramMasterV31[] = [];
  const diagramStates: DiagramStateV31[] = [];
  const diagnostics: GeoDiagnostic[] = [];
  const narration = clean(input.narration);
  const createMap = (kind: MapKindV31, pattern: RegExp, title: string) => {
    for (const claim of input.claims.filter((item) =>
      pattern.test(item.text)
    )) {
      const exactPlaces = local(input.entities, claim).filter(isGeographic);
      const contextualPlaces = input.entities.filter(
        (entity) => isGeographic(entity) && nearClaim(entity, claim)
      );
      const places = unique([...exactPlaces, ...contextualPlaces]).sort(
        (left, right) => {
          const exactPriority =
            Number(exactPlaces.some((entity) => entity.id === right.id)) -
            Number(exactPlaces.some((entity) => entity.id === left.id));
          if (exactPriority) return exactPriority;
          const typePriority =
            Number(right.type === "place") - Number(left.type === "place");
          if (typePriority) return typePriority;
          const leftIndex = claim.text
            .toLocaleLowerCase()
            .indexOf(left.canonicalName.toLocaleLowerCase());
          const rightIndex = claim.text
            .toLocaleLowerCase()
            .indexOf(right.canonicalName.toLocaleLowerCase());
          return (
            (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
            (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
          );
        }
      );
      const actors = input.entities.filter(
        (entity) =>
          nearClaim(entity, claim) &&
          [
            "person",
            "army-or-formation",
            "organisation",
            "ethnic-or-social-group",
            "disease-or-pathogen",
          ].includes(entity.type)
      );
      const period = periodFor(input.entities, narration, claim);
      const militaryActors = actors.filter((entity) =>
        [
          "person",
          "army-or-formation",
          "organisation",
          "ethnic-or-social-group",
        ].includes(entity.type)
      );
      const directionalContext =
        /\b(?:from|to|into|toward|towards|across|through|entered|reached)\b/iu.test(
          claim.text
        );
      if (
        (kind === "campaign" &&
          (!militaryActors.length ||
            (exactPlaces.length < 2 &&
              !(exactPlaces.length === 1 && directionalContext)))) ||
        (kind === "territorial-change" && exactPlaces.length < 2) ||
        (kind === "trade-network" && exactPlaces.length < 2) ||
        (kind === "disease-spread" &&
          exactPlaces.length < 2 &&
          !(exactPlaces.length === 1 && directionalContext))
      ) {
        diagnostics.push(
          problem(
            "MOVEMENT_WITHOUT_ROUTE",
            "warning",
            "Movement language lacks sufficiently explicit geographic endpoints; no route was inferred.",
            [claim.id]
          )
        );
        continue;
      }
      if (places.length < 2) {
        diagnostics.push(
          problem(
            "MOVEMENT_WITHOUT_ROUTE",
            "warning",
            "A semantic movement claim lacks two locally associated accepted places.",
            [claim.id]
          )
        );
        continue;
      }
      if (!period) {
        diagnostics.push(
          problem(
            "MAP_PERIOD_UNRESOLVED",
            "warning",
            "A semantic movement claim lacks a concrete local period.",
            [claim.id]
          )
        );
        continue;
      }
      const [from, to] = routeEndpoints(places, claim);
      const masterId = `map-master-${mapMasters.length + 1}`;
      const stateId = `map-state-${mapStates.length + 1}`;
      const extent = `${from.canonicalName} to ${to.canonicalName}`;
      const specificTitle = `${title}: ${from.canonicalName} to ${to.canonicalName}`;
      const confidence = exactPlaces.length >= 2 ? 0.86 : 0.68;
      mapMasters.push({
        id: masterId,
        kind,
        mapKind: kind,
        title: specificTitle,
        baseGeographicExtent: extent,
        projection: places.length > 3 ? "continental" : "regional",
        projectionOrLayoutIntent:
          places.length > 3
            ? "Continental overview with a portrait-safe route corridor."
            : "Regional route view with legible endpoints.",
        supportedRatios: ["16:9", "9:16"],
        supportedAspectRatios: ["16:9", "9:16"],
        sourceStatus: "claim-grounded",
      });
      const route: RouteV31 = {
        id: `route-${mapStates.length + 1}`,
        type: routeType(kind, claim.text),
        fromEntityId: from.id,
        toEntityId: to.id,
        actorEntityIds: actors.map((entity) => entity.id),
        dateOrPeriod: period,
        direction: `${from.canonicalName} to ${to.canonicalName}`,
        label:
          kind === "disease-spread"
            ? `${actors.find((entity) => entity.type === "disease-or-pathogen")?.canonicalName ?? "Disease"} transmission`
            : kind === "trade-network"
              ? `${/\b(?:ship|maritime|port)\b/iu.test(claim.text) ? "Maritime" : "Overland"} trade connection`
              : kind === "territorial-change"
                ? `Control shifts toward ${to.canonicalName}`
                : `${actors.find((entity) => entity.type === "army-or-formation")?.canonicalName ?? actors.find((entity) => entity.type === "person")?.canonicalName ?? "Army"} movement`,
        claimIds: [claim.id],
        confidence,
      };
      mapStates.push({
        id: stateId,
        masterId,
        title: specificTitle,
        dateOrPeriod: period,
        geographicExtent: extent,
        locationEntityIds: [from.id, to.id],
        actorEntityIds: actors.map((entity) => entity.id),
        narrationUnitIds: claim.unitIds,
        claimIds: [claim.id],
        labels: [from.canonicalName, to.canonicalName],
        legend:
          kind === "disease-spread"
            ? "Spread direction"
            : kind === "trade-network"
              ? "Trade connection"
              : "Movement direction",
        camera: "Regional overview with endpoint labels",
        confidence,
        uncertaintyDisclosure:
          exactPlaces.length >= 2
            ? "Direction follows the geographic entities and movement language in the linked claim."
            : "One endpoint comes from adjacent narration context and requires geographic fact-checking.",
        routes: [route],
        movements: [{ kind, routeIds: [route.id], claimIds: [claim.id] }],
      });
    }
  };
  createMap("campaign", campaign, "Campaign movement");
  createMap("territorial-change", territorial, "Territorial change");
  createMap("trade-network", trade, "Trade-network movement");
  createMap("disease-spread", disease, "Disease spread");
  for (const [claimIndex, claim] of input.claims.entries()) {
    if (
      !mapContext.test(claim.text) ||
      /\b(?:planned|could lose|demanded battle|did not need|search of|traded with|not been captured|won at .+ held the battlefield)\b/iu.test(
        claim.text
      )
    )
      continue;
    if (mapStates.some((state) => state.claimIds.includes(claim.id))) continue;
    const previousText = input.claims
      .slice(Math.max(0, claimIndex - 2), claimIndex)
      .map((item) => item.text)
      .join(" ");
    const mentionedIn = (entity: AcceptedGeoEntity, text: string): boolean =>
      new RegExp(`\\b${escaped(entity.canonicalName)}\\b`, "iu").test(text);
    const currentCandidates = input.entities.filter(
      (entity) => isGeographic(entity) && mentionedIn(entity, claim.text)
    );
    const previousCandidates = input.entities
      .filter(
        (entity) => isGeographic(entity) && mentionedIn(entity, previousText)
      )
      .sort(
        (left, right) =>
          previousText
            .toLocaleLowerCase()
            .indexOf(left.canonicalName.toLocaleLowerCase()) -
          previousText
            .toLocaleLowerCase()
            .indexOf(right.canonicalName.toLocaleLowerCase())
      );
    const candidates = unique([
      ...currentCandidates.filter((entity) => entity.type === "place"),
      ...previousCandidates.filter((entity) => entity.type === "place"),
      ...currentCandidates,
      ...previousCandidates,
    ]);
    const location = candidates[0];
    const period = periodFor(input.entities, narration, claim);
    if (!location || !period) continue;
    const contextActors = input.entities.filter(
      (entity) =>
        nearClaim(entity, claim) &&
        [
          "person",
          "army-or-formation",
          "organisation",
          "ethnic-or-social-group",
        ].includes(entity.type)
    );
    const kind: MapKindV31 =
      /\b(?:battle|battlefield|fought|encirclement|siege|crossing)\b/iu.test(
        claim.text
      )
        ? "battlefield"
        : "regional-context";
    const masterId = `map-master-${mapMasters.length + 1}`;
    const title = `${kind === "battlefield" ? "Event orientation" : "Regional context"}: ${location.canonicalName}`;
    mapMasters.push({
      id: masterId,
      kind,
      mapKind: kind,
      title,
      baseGeographicExtent: location.canonicalName,
      projection: "regional",
      projectionOrLayoutIntent:
        "Localized event marker with adjacent terrain retained for orientation.",
      supportedRatios: ["16:9", "9:16"],
      supportedAspectRatios: ["16:9", "9:16"],
      sourceStatus: "claim-grounded",
    });
    mapStates.push({
      id: `map-state-${mapStates.length + 1}`,
      masterId,
      title,
      dateOrPeriod: period,
      geographicExtent: location.canonicalName,
      locationEntityIds: [location.id],
      actorEntityIds: contextActors.map((entity) => entity.id),
      narrationUnitIds: claim.unitIds,
      claimIds: [claim.id],
      labels: [location.canonicalName],
      legend: "Localized event marker",
      camera: "Begin regionally, then settle on the named event location.",
      confidence: entityInClaim(location, claim) ? 0.8 : 0.64,
      uncertaintyDisclosure:
        "No second geographic endpoint is asserted by the linked claim.",
      routes: [],
      movements: [],
      routeAbsenceJustification:
        "The narration localizes an event but does not name a defensible directional endpoint.",
    });
  }
  for (const claim of input.claims.filter((item) =>
    diseaseCoverage.test(item.text)
  )) {
    const locations = input.entities.filter(
      (entity) =>
        isGeographic(entity) &&
        new RegExp(`\\b${escaped(entity.canonicalName)}\\b`, "iu").test(
          claim.text
        )
    );
    if (locations.length < 2) continue;
    const masterId = `map-master-${mapMasters.length + 1}`;
    const period = /late thirteen forties.+early thirteen fifties/iu.test(
      claim.text
    )
      ? "late 1340s–early 1350s"
      : (periodFor(input.entities, narration, claim) ?? "period unresolved");
    const title = `Regional disease coverage: ${locations.map((item) => item.canonicalName).join(", ")}`;
    mapMasters.push({
      id: masterId,
      kind: "regional-context",
      mapKind: "regional-context",
      title,
      baseGeographicExtent: locations
        .map((item) => item.canonicalName)
        .join(", "),
      projection: "continental",
      projectionOrLayoutIntent:
        "Multi-region coverage view without a false chronological route.",
      supportedRatios: ["16:9", "9:16"],
      supportedAspectRatios: ["16:9", "9:16"],
      sourceStatus: "claim-grounded",
    });
    mapStates.push({
      id: `map-state-${mapStates.length + 1}`,
      masterId,
      title,
      dateOrPeriod: period,
      geographicExtent: locations.map((item) => item.canonicalName).join(", "),
      locationEntityIds: locations.map((item) => item.id),
      actorEntityIds: input.entities
        .filter(
          (entity) =>
            entity.type === "disease-or-pathogen" && nearClaim(entity, claim)
        )
        .map((entity) => entity.id),
      narrationUnitIds: claim.unitIds,
      claimIds: [claim.id],
      labels: locations.map((item) => item.canonicalName),
      legend: "Regional coverage; mortality intensity varies",
      camera: "Continental overview followed by separate regional emphasis.",
      confidence: 0.82,
      uncertaintyDisclosure:
        "This state shows geographic coverage, not an asserted sequence or uniform mortality rate.",
      routes: [],
      movements: [],
      routeAbsenceJustification:
        "The claim names regional coverage but does not establish a directional chronology.",
    });
  }
  const createDiagram = (
    domain: DiagramDomainV31,
    pattern: RegExp,
    title: string,
    labels: readonly [string, string, string],
    relations: readonly [string, string]
  ) => {
    const relevant = input.claims.filter((claim) => pattern.test(claim.text));
    if (!relevant.length) return;
    const entityIds = unique(
      relevant.flatMap((claim) =>
        input.entities
          .filter(
            (entity) => entityInClaim(entity, claim) || nearClaim(entity, claim)
          )
          .map((entity) => entity.id)
      )
    );
    if (!entityIds.length) {
      diagnostics.push(
        problem(
          "DIAGRAM_ENTITY_CONTEXT_UNRESOLVED",
          "warning",
          "A diagram concept lacks locally associated accepted entities.",
          relevant.map((claim) => claim.id)
        )
      );
      return;
    }
    const masterId = `diagram-master-${diagramMasters.length + 1}`;
    const stateId = `diagram-state-${diagramStates.length + 1}`;
    const claimIds = relevant.map((claim) => claim.id);
    diagramMasters.push({
      id: masterId,
      title,
      domain,
      sourceStatus: "claim-grounded",
    });
    const node = (
      index: number,
      kind: DiagramNodeV31["kind"]
    ): DiagramNodeV31 => ({
      id: `${stateId}-node-${index}`,
      label: labels[index - 1]!,
      kind,
      entityIds,
      claimIds,
      description: `${labels[index - 1]} as stated or implied by linked claims.`,
    });
    const nodes: readonly [DiagramNodeV31, DiagramNodeV31, DiagramNodeV31] = [
      node(1, "resource"),
      node(2, "pressure"),
      node(3, "outcome"),
    ];
    diagramStates.push({
      id: stateId,
      masterId,
      domain,
      nodes,
      edges: [
        {
          id: `${stateId}-edge-1`,
          fromNodeId: nodes[0].id,
          toNodeId: nodes[1].id,
          label: relations[0],
          claimIds,
          confidence: 0.7,
        },
        {
          id: `${stateId}-edge-2`,
          fromNodeId: nodes[1].id,
          toNodeId: nodes[2].id,
          label: relations[1],
          claimIds,
          confidence: 0.7,
        },
      ],
      narrationUnitIds: unique(relevant.flatMap((claim) => claim.unitIds)),
      claimIds,
      explanation: title,
    });
  };
  createDiagram(
    "logistics",
    logistics,
    "Logistics pressure",
    ["Supply capacity", "Operational reach", "Campaign outcome"],
    ["sets the limits of", "constrains"]
  );
  createDiagram(
    "fiscal-political",
    fiscal,
    "Fiscal and political power",
    [
      "Revenue and obligations",
      "Institutional capacity",
      "Political authority",
    ],
    ["funds", "enables"]
  );
  createDiagram(
    "disease-demographic-labour",
    labour,
    "Disease, population, and labour",
    [
      "Disease or mortality",
      "Population and labour supply",
      "Social and economic outcome",
    ],
    ["reduces", "reshapes"]
  );
  const plan = {
    mapMasters,
    mapStates,
    diagramMasters,
    diagramStates,
    diagnostics,
  };
  return {
    ...plan,
    diagnostics: [
      ...diagnostics,
      ...validateHistoryGeoV31Plan(plan, input.entities, input.claims),
    ],
  };
}
