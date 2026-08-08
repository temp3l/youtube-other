export {
  collectEpisodePlacesV34 as collectEpisodePlacesV35,
  resolveHistoryPlaceV34 as resolveHistoryPlaceV35,
} from "./history-geo-v34.js";

export {
  compileMapStateV35,
  validateCompiledMapStateV35,
} from "./history-map-compiler-v35.js";

export {
  extractGeoFactsV35,
  deriveMapCapabilitiesV35,
  type GeoFactV35,
  type MapCapabilitiesV35,
  type MapIntentV35,
} from "./history-geo-facts-v35.js";

import type {
  HistoryClaimV34,
  HistoryEntityMentionV34,
  HistoryGeographicQualifierV34,
  HistoryMapIntentProposalV34,
  HistoryTemporalQualifierV34,
} from "./history-v34-contracts.js";
import {
  claimAuthorizesRouteMovement,
  isRouteMapPurpose,
  mapIntentSignature,
  normalizeMapPurposeForProposal,
} from "./history-visual-semantics-v35.js";
import { proposeMapIntentsV34, supplementMapIntentsV34 } from "./history-geo-v34.js";

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
  return entities.find(
    (entity) =>
      entity.normalizedLabel === label && (claimId ? entity.claimId === claimId : true)
  );
}

function claimSupportsRouteEndpoints(input: {
  readonly claim: HistoryClaimV34;
  readonly proposal: HistoryMapIntentProposalV34;
  readonly entities: readonly HistoryEntityMentionV34[];
  readonly geographicQualifiers: readonly HistoryGeographicQualifierV34[];
}): boolean {
  const claimGeoMentionIds = new Set(
    input.geographicQualifiers
      .filter((item) => item.claimId === input.claim.id)
      .map((item) => item.entityMentionId)
  );
  const claimPlaceMentionIds = new Set(
    input.entities
      .filter(
        (entity) =>
          entity.claimId === input.claim.id &&
          ["place", "region", "water-body", "state", "island"].includes(entity.entityType)
      )
      .map((entity) => entity.id)
  );
  const allowedMentions = new Set([...claimGeoMentionIds, ...claimPlaceMentionIds]);
  const endpointIds = [
    ...input.proposal.originPlaceMentionIds,
    ...input.proposal.destinationPlaceMentionIds,
    ...input.proposal.waypointPlaceMentionIds,
  ];
  return endpointIds.every((mentionId) => allowedMentions.has(mentionId));
}

function downgradeProposalToLocator(
  proposal: HistoryMapIntentProposalV34,
  locationId: string
): HistoryMapIntentProposalV34 {
  return {
    ...proposal,
    mapPurpose: "location",
    originPlaceMentionIds: [locationId],
    destinationPlaceMentionIds: [locationId],
    waypointPlaceMentionIds: [],
    movingActorEntityMentionIds: [],
    routeType: "none",
  };
}

/**
 * V3.5 geo supplement: episode-scoped intents only; no invented cross-claim routes.
 */
export function supplementMapIntentsV35(input: {
  readonly proposals: HistoryMapIntentProposalV34[];
  readonly claims: readonly HistoryClaimV34[];
  readonly entities: readonly HistoryEntityMentionV34[];
  readonly geographicQualifiers: readonly HistoryGeographicQualifierV34[];
  readonly temporalQualifiers: readonly HistoryTemporalQualifierV34[];
}): HistoryMapIntentProposalV34[] {
  const proposals: HistoryMapIntentProposalV34[] = supplementMapIntentsV34(input)
    .map((proposal) => {
      const claim = input.claims.find((item) => proposal.claimIds.includes(item.id));
      if (!claim) return proposal;
      const claimText = claim.normalizedProposition;
      const authorizesMovement = claimAuthorizesRouteMovement(claimText);
      const distinctEndpoints =
        proposal.originPlaceMentionIds[0] &&
        proposal.destinationPlaceMentionIds[0] &&
        proposal.originPlaceMentionIds[0] !== proposal.destinationPlaceMentionIds[0];

      if (
        distinctEndpoints &&
        !claimSupportsRouteEndpoints({
          claim,
          proposal,
          entities: input.entities,
          geographicQualifiers: input.geographicQualifiers,
        })
      ) {
        const scopedLocation =
          input.geographicQualifiers.find((item) => item.claimId === claim.id)?.entityMentionId ??
          input.entities.find(
            (entity) =>
              entity.claimId === claim.id &&
              ["place", "region", "water-body", "state", "island"].includes(entity.entityType)
          )?.id;
        if (scopedLocation) return downgradeProposalToLocator(proposal, scopedLocation);
        return {
          ...proposal,
          mapPurpose: "location" as const,
          originPlaceMentionIds: [],
          destinationPlaceMentionIds: [],
          waypointPlaceMentionIds: [],
          movingActorEntityMentionIds: [],
          routeType: "none" as const,
        };
      }

      if (
        !authorizesMovement &&
        distinctEndpoints &&
        (isRouteMapPurpose(proposal.mapPurpose) || proposal.mapPurpose === "comparison")
      ) {
        const locationId =
          proposal.originPlaceMentionIds[0] ??
          proposal.destinationPlaceMentionIds[0] ??
          proposal.waypointPlaceMentionIds[0];
        if (!locationId) return proposal;
        return downgradeProposalToLocator(proposal, locationId);
      }
      return proposal;
    })
    .filter((proposal) => {
      const claim = input.claims.find((item) => proposal.claimIds.includes(item.id));
      if (!claim) return true;
      if (proposal.routeType === "none") return true;
      return claimSupportsRouteEndpoints({
        claim,
        proposal,
        entities: input.entities,
        geographicQualifiers: input.geographicQualifiers,
      });
    });

  const claimIdsWithIntent = new Set(proposals.flatMap((item) => item.claimIds));
  const pushIntent = (intent: HistoryMapIntentProposalV34): void => {
    const signature = mapIntentSignature(intent);
    if (proposals.some((item) => mapIntentSignature(item) === signature)) return;
    proposals.push({
      ...intent,
      mapPurpose: normalizeMapPurposeForProposal(intent),
    });
    for (const claimId of intent.claimIds) claimIdsWithIntent.add(claimId);
  };

  const britainDeclineClaim = findClaimByPattern(
    input.claims,
    /\bBritain\b.*\b(?:imperial government|coin use|urban administration|long-distance supply)\b/iu
  );
  if (britainDeclineClaim && !claimIdsWithIntent.has(britainDeclineClaim.id)) {
    const britain =
      findEntityMention(input.entities, "Britain", britainDeclineClaim.id) ??
      findEntityMention(input.entities, "Britain");
    if (britain) {
      pushIntent({
        claimIds: [britainDeclineClaim.id],
        mapPurpose: "location",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [britain.id],
        destinationPlaceMentionIds: [britain.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: britainDeclineClaim.temporalQualifierIds,
        routeType: "none",
        uncertainty: britainDeclineClaim.uncertaintyMarkers,
      });
    }
  }

  const odoacerClaim = findClaimByPattern(input.claims, /\bOdoacer\b/iu);
  if (odoacerClaim && !claimIdsWithIntent.has(odoacerClaim.id)) {
    const rome =
      findEntityMention(input.entities, "Rome", odoacerClaim.id) ??
      findEntityMention(input.entities, "Rome");
    const italy =
      findEntityMention(input.entities, "Italy", odoacerClaim.id) ??
      findEntityMention(input.entities, "Europe");
    const location = rome ?? italy;
    if (location) {
      pushIntent({
        claimIds: [odoacerClaim.id],
        mapPurpose: "location",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [location.id],
        destinationPlaceMentionIds: [location.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: odoacerClaim.temporalQualifierIds,
        routeType: "none",
        uncertainty: odoacerClaim.uncertaintyMarkers,
      });
    }
  }

  return proposals.filter((proposal) => {
    const claimText = proposal.claimIds
      .map((id) => input.claims.find((claim) => claim.id === id)?.normalizedProposition ?? "")
      .join("\n");
    if (!claimAuthorizesRouteMovement(claimText) && proposal.routeType !== "none") {
      return proposal.originPlaceMentionIds[0] === proposal.destinationPlaceMentionIds[0];
    }
    return true;
  });
}

export function proposeMapIntentsV35(input: {
  readonly claims: readonly HistoryClaimV34[];
  readonly entities: readonly HistoryEntityMentionV34[];
  readonly geographicQualifiers: readonly HistoryGeographicQualifierV34[];
  readonly temporalQualifiers: readonly HistoryTemporalQualifierV34[];
}): HistoryMapIntentProposalV34[] {
  const base = proposeMapIntentsV34(input).map((proposal) => {
    const claim = input.claims.find((item) => proposal.claimIds.includes(item.id));
    if (!claim) return proposal;
    const claimText = claim.normalizedProposition;
    if (claimAuthorizesRouteMovement(claimText)) return proposal;
    if (proposal.waypointPlaceMentionIds.length > 0) return proposal;
    const locationIds = [
      ...new Set(
        input.geographicQualifiers
          .filter((item) => item.claimId === claim.id)
          .map((item) => item.entityMentionId)
      ),
    ];
    if (locationIds.length <= 1) return proposal;
    return {
      ...proposal,
      mapPurpose: "area" as const,
      originPlaceMentionIds: [locationIds[0]!],
      destinationPlaceMentionIds: [locationIds[0]!],
      waypointPlaceMentionIds: locationIds.slice(1),
      routeType: "none" as const,
      movingActorEntityMentionIds: [],
    };
  });
  return supplementMapIntentsV35({
    proposals: base,
    ...input,
  });
}
