import type {
  HistoryClaimV34,
  HistoryEntityMentionV34,
  MovementActorRefV35,
} from "./history-v34-contracts.js";

export type { MovementActorRefV35 } from "./history-v34-contracts.js";

export type MovementActorResolutionFailureV35 =
  | "NO_SCOPED_EVIDENCE"
  | "ACTOR_NOT_IN_CLAIM_TEXT";

export type MovementActorResolutionV35 =
  | {
      readonly status: "resolved";
      readonly actorRef: MovementActorRefV35;
    }
  | {
      readonly status: "unresolved";
      readonly reason: MovementActorResolutionFailureV35;
    };

function claimEntities(
  claimId: string,
  entities: readonly HistoryEntityMentionV34[]
): HistoryEntityMentionV34[] {
  return entities.filter((entity) => entity.claimId === claimId);
}

function scopedClaims(
  claims: readonly HistoryClaimV34[],
  scopeClaimIds: readonly string[]
): HistoryClaimV34[] {
  const scope = new Set(scopeClaimIds);
  return claims.filter((claim) => scope.has(claim.id));
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

function normalizeActorLabel(sourceText: string): string {
  return sourceText.trim().replace(/^the\s+/iu, "");
}

function sourceSpanForText(
  claim: HistoryClaimV34,
  sourceText: string
):
  | {
      readonly startUtf16: number;
      readonly endUtf16Exclusive: number;
    }
  | undefined {
  const index = claim.normalizedProposition.toLocaleLowerCase().indexOf(sourceText.toLocaleLowerCase());
  if (index < 0) return undefined;
  return {
    startUtf16: index,
    endUtf16Exclusive: index + sourceText.length,
  };
}

function claimExpressionFromMatch(
  claim: HistoryClaimV34,
  sourceText: string
): Extract<MovementActorRefV35, { kind: "claim-expression" }> {
  const normalizedLabel = normalizeActorLabel(sourceText);
  const sourceSpan = sourceSpanForText(claim, sourceText);
  return {
    kind: "claim-expression",
    normalizedLabel,
    claimIds: [claim.id],
    sourceText,
    ...(sourceSpan ? { sourceSpan } : {}),
  };
}

function extractClaimExpressionActorFromClaim(
  claim: HistoryClaimV34
): Extract<MovementActorRefV35, { kind: "claim-expression" }> | null {
  const text = claim.normalizedProposition;
  const patterns = [
    /\b(two Royal Navy ships)\b/iu,
    /\b(Royal Navy ships)\b/iu,
    /\b(merchant ships)\b/iu,
    /\b(?:105 survivors|surviving expedition members)\b/iu,
    /\b(Grande Armée)\b/iu,
    /\b(Napoleon(?:'s)? army)\b/iu,
    /\b(Royal Navy expedition)\b/iu,
    /\b(soldiers)\s+(?:began\s+)?(?:crossing|marched|advanced|moved|left)\b/iu,
    /\b(troops)\s+(?:began\s+)?(?:crossing|marched|advanced|moved|left)\b/iu,
    /\b(soldiers)\b/iu,
    /\b(troops)\b/iu,
    /\b(ships)\s+(?:arrived|sailed|crossed)\b/iu,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    return claimExpressionFromMatch(claim, match[1]);
  }
  return null;
}

function collectiveMovementReference(text: string): boolean {
  return /\b(?:two Royal Navy ships|Royal Navy ships|the ships|merchant ships|ships)\b/iu.test(
    text
  );
}

function resolveIdentityShipsForCollectiveMovement(input: {
  readonly movementClaim: HistoryClaimV34;
  readonly scopedClaims: readonly HistoryClaimV34[];
  readonly entities: readonly HistoryEntityMentionV34[];
}): MovementActorRefV35 | undefined {
  if (!collectiveMovementReference(input.movementClaim.normalizedProposition)) return undefined;
  const ships: HistoryEntityMentionV34[] = [];
  const claimIds: string[] = [];
  for (const claim of input.scopedClaims) {
    const claimShips = claimEntities(claim.id, input.entities).filter(
      (entity) =>
        entity.entityType === "ship" &&
        (claim.normalizedProposition.includes(entity.text) ||
          claim.normalizedProposition.includes(entity.normalizedLabel))
    );
    if (!claimShips.length) continue;
    claimIds.push(claim.id);
    ships.push(...claimShips);
  }
  const uniqueShips = [...new Map(ships.map((ship) => [ship.id, ship])).values()];
  if (!uniqueShips.length) return undefined;
  if (uniqueShips.length === 1) {
    return {
      kind: "entity",
      entityMentionId: uniqueShips[0]!.id,
      claimIds: [...new Set(claimIds)],
    };
  }
  return {
    kind: "entities",
    entityMentionIds: uniqueShips.map((ship) => ship.id),
    claimIds: [...new Set(claimIds)],
  };
}

export function resolveMovementActorRefV35(input: {
  readonly movementClaim: HistoryClaimV34;
  readonly scopeClaimIds: readonly string[];
  readonly claims: readonly HistoryClaimV34[];
  readonly entities: readonly HistoryEntityMentionV34[];
}): MovementActorResolutionV35 {
  const scoped = scopedClaims(input.claims, input.scopeClaimIds);
  const movementShips = claimEntities(input.movementClaim.id, input.entities).filter(
    (entity) => entity.entityType === "ship"
  );
  if (movementShips.length === 1) {
    return {
      status: "resolved",
      actorRef: {
        kind: "entity",
        entityMentionId: movementShips[0]!.id,
        claimIds: [input.movementClaim.id],
      },
    };
  }
  if (movementShips.length > 1) {
    return {
      status: "resolved",
      actorRef: {
        kind: "entities",
        entityMentionIds: movementShips.map((ship) => ship.id),
        claimIds: [input.movementClaim.id],
      },
    };
  }

  const segmentShips = resolveIdentityShipsForCollectiveMovement({
    movementClaim: input.movementClaim,
    scopedClaims: scoped,
    entities: input.entities,
  });
  if (segmentShips) return { status: "resolved", actorRef: segmentShips };

  const actor = selectActorMention(input.movementClaim, input.entities);
  if (
    actor &&
    ["person", "ship", "military-unit", "organization"].includes(actor.entityType)
  ) {
    return {
      status: "resolved",
      actorRef: {
        kind: "entity",
        entityMentionId: actor.id,
        claimIds: [input.movementClaim.id],
      },
    };
  }

  const expression = extractClaimExpressionActorFromClaim(input.movementClaim);
  if (expression) return { status: "resolved", actorRef: expression };

  return { status: "unresolved", reason: "NO_SCOPED_EVIDENCE" };
}

export function claimExpressionIsDerivedFromScopedEvidenceV35(input: {
  readonly actorRef: Extract<MovementActorRefV35, { kind: "claim-expression" }>;
  readonly scopeClaimIds: readonly string[];
  readonly claims: readonly HistoryClaimV34[];
}): boolean {
  const scope = new Set(input.scopeClaimIds);
  if (!input.actorRef.claimIds.length) return false;
  if (!input.actorRef.claimIds.every((claimId) => scope.has(claimId))) return false;
  return input.actorRef.claimIds.some((claimId) => {
    const claim = input.claims.find((item) => item.id === claimId);
    if (!claim) return false;
    const text = claim.normalizedProposition.toLocaleLowerCase();
    return (
      text.includes(input.actorRef.sourceText.toLocaleLowerCase()) ||
      text.includes(input.actorRef.normalizedLabel.toLocaleLowerCase())
    );
  });
}

export function actorDisplayLabelV35(
  actorRef: MovementActorRefV35,
  entities: readonly HistoryEntityMentionV34[]
): string {
  switch (actorRef.kind) {
    case "entity": {
      const entity = entities.find((item) => item.id === actorRef.entityMentionId);
      return entity?.normalizedLabel ?? "unresolved actor";
    }
    case "entities": {
      const labels = actorRef.entityMentionIds
        .map((mentionId) => entities.find((item) => item.id === mentionId)?.normalizedLabel)
        .filter((label): label is string => Boolean(label));
      if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
      return labels.join(", ");
    }
    case "claim-expression":
      return actorRef.normalizedLabel;
  }
}

export function primaryActorMentionIdV35(
  actorRef: MovementActorRefV35
): string | null {
  switch (actorRef.kind) {
    case "entity":
      return actorRef.entityMentionId;
    case "entities":
      return actorRef.entityMentionIds[0] ?? null;
    case "claim-expression":
      return null;
  }
}

export function actorMentionIdsV35(actorRef: MovementActorRefV35): readonly string[] {
  switch (actorRef.kind) {
    case "entity":
      return [actorRef.entityMentionId];
    case "entities":
      return actorRef.entityMentionIds;
    case "claim-expression":
      return [];
  }
}

export function movementActorMatchesRequestV35(
  actorRef: MovementActorRefV35,
  requestedActorMentionId: string
): boolean {
  return actorMentionIdsV35(actorRef).includes(requestedActorMentionId);
}

export function validateMovementActorProvenanceV35(input: {
  readonly actorRef: MovementActorRefV35;
  readonly entities: readonly HistoryEntityMentionV34[];
  readonly scopeClaimIds: readonly string[];
  readonly claims: readonly HistoryClaimV34[];
}): string[] {
  const errors: string[] = [];
  const scope = new Set(input.scopeClaimIds);
  for (const claimId of input.actorRef.claimIds) {
    if (!scope.has(claimId)) errors.push(`Actor claim ${claimId} is outside map scope`);
  }
  for (const mentionId of actorMentionIdsV35(input.actorRef)) {
    const entity = input.entities.find((item) => item.id === mentionId);
    if (!entity) {
      errors.push(`Actor entity mention ${mentionId} is missing`);
      continue;
    }
    if (!input.actorRef.claimIds.includes(entity.claimId))
      errors.push(`Actor entity mention ${mentionId} is not bound to actor claim scope`);
  }
  if (input.actorRef.kind === "claim-expression") {
    if (!input.actorRef.normalizedLabel.trim()) errors.push("Actor claim-expression is empty");
    if (!input.actorRef.sourceText.trim()) errors.push("Actor claim-expression source text is empty");
    if (
      !claimExpressionIsDerivedFromScopedEvidenceV35({
        actorRef: input.actorRef,
        scopeClaimIds: input.scopeClaimIds,
        claims: input.claims,
      })
    )
      errors.push("Actor claim-expression is not derived from scoped evidence");
  }
  return errors;
}
