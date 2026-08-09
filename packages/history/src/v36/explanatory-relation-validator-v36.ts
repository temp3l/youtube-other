import {
  conceptRefKeyV36,
  explanatoryRelationIdV36,
  placeRefKeyV36,
  relationEvidenceFingerprintV36,
  type ConceptRefV36,
  type ExplanatoryRelationV36,
  type GroundedRelationPropositionV36,
  type PlaceRefV36,
  type RelationSupportClaimV36,
  type ResolvedEntityV36,
} from "./explanatory-relation-v36.js";

export type RelationDiagnosticCodeV36 =
  | "RELATION_SUPPORT_CLAIM_MISSING"
  | "RELATION_EPISODE_MISMATCH"
  | "RELATION_PARTICIPANT_UNRESOLVED"
  | "RELATION_CARDINALITY_INVALID"
  | "RELATION_PROPOSITION_UNSUPPORTED"
  | "RELATION_TYPE_MISMATCH"
  | "RELATION_DIRECTION_UNSUPPORTED"
  | "RELATION_PROPER_NAME_FRAGMENTATION"
  | "RELATION_DUPLICATE_SEMANTIC_IDENTITY"
  | "RELATION_SEMANTIC_IDENTITY_MISMATCH"
  | "RELATION_EVIDENCE_FINGERPRINT_MISMATCH";

export interface RelationDiagnosticV36 {
  readonly code: RelationDiagnosticCodeV36;
  readonly severity: "error";
  readonly relationId: string;
  readonly message: string;
  readonly affectedIds: readonly string[];
}

export type RelationValidationResultV36 =
  | { readonly status: "valid" }
  | { readonly status: "invalid"; readonly diagnostics: readonly RelationDiagnosticV36[] };

export interface RelationValidationContextV36 {
  readonly episodeId: string;
  readonly claims: readonly RelationSupportClaimV36[];
  readonly entities: readonly ResolvedEntityV36[];
}

export interface ExplanatoryRelationValidatorV36 {
  validate(
    relation: ExplanatoryRelationV36,
    context: RelationValidationContextV36
  ): RelationValidationResultV36;
}

function diagnostic(
  relation: ExplanatoryRelationV36,
  code: RelationDiagnosticCodeV36,
  message: string,
  affectedIds: readonly string[] = []
): RelationDiagnosticV36 {
  return { code, severity: "error", relationId: relation.id, message, affectedIds };
}

type ParticipantRefV36 =
  | { readonly ref: PlaceRefV36; readonly type: "place" }
  | { readonly ref: ConceptRefV36; readonly type: "concept" };

function allParticipantRefs(relation: ExplanatoryRelationV36): readonly ParticipantRefV36[] {
  switch (relation.kind) {
    case "movement": return [relation.from, relation.to, ...relation.via].map((ref) => ({ ref, type: "place" }));
    case "spatial-comparison": return relation.places.map((ref) => ({ ref, type: "place" }));
    case "spatial-area": return [{ ref: relation.place, type: "place" }];
    case "causal": return [relation.cause, relation.effect].map((ref) => ({ ref, type: "concept" }));
    case "dependency": return [relation.dependency, relation.dependent].map((ref) => ({ ref, type: "concept" }));
    case "process":
    case "temporal-sequence": return relation.steps.map((ref) => ({ ref, type: "concept" }));
    case "policy-response": return [relation.condition, relation.response].map((ref) => ({ ref, type: "concept" }));
    case "evidence-set": return [...(relation.subject ? [relation.subject] : []), ...relation.evidence].map((ref) => ({ ref, type: "concept" }));
  }
}

function hasEntityId(ref: PlaceRefV36 | ConceptRefV36): ref is PlaceRefV36 | (ConceptRefV36 & { readonly entityId: string }) {
  return "entityId" in ref && ref.entityId !== undefined;
}

function participantKey(participant: ParticipantRefV36): string {
  return participant.type === "place"
    ? placeRefKeyV36(participant.ref)
    : conceptRefKeyV36(participant.ref);
}

type RelationSemanticsV36 = ExplanatoryRelationV36 | GroundedRelationPropositionV36;

function semanticParticipantPayload(relation: RelationSemanticsV36): Readonly<Record<string, unknown>> {
  switch (relation.kind) {
    case "movement": return { from: placeRefKeyV36(relation.from), via: relation.via.map(placeRefKeyV36), to: placeRefKeyV36(relation.to) };
    case "spatial-comparison": return { places: [...new Set(relation.places.map(placeRefKeyV36))].sort() };
    case "spatial-area": return { place: placeRefKeyV36(relation.place) };
    case "causal": return { cause: conceptRefKeyV36(relation.cause), effect: conceptRefKeyV36(relation.effect) };
    case "dependency": return { dependency: conceptRefKeyV36(relation.dependency), dependent: conceptRefKeyV36(relation.dependent) };
    case "process":
    case "temporal-sequence": return { steps: relation.steps.map(conceptRefKeyV36) };
    case "policy-response": return { condition: conceptRefKeyV36(relation.condition), response: conceptRefKeyV36(relation.response) };
    case "evidence-set": return {
      ...(relation.subject ? { subject: conceptRefKeyV36(relation.subject) } : {}),
      evidence: [...new Set(relation.evidence.map(conceptRefKeyV36))].sort(),
    };
  }
}

function propositionParticipantKeys(
  proposition: GroundedRelationPropositionV36
): readonly string[] {
  switch (proposition.kind) {
    case "movement": return [placeRefKeyV36(proposition.from), placeRefKeyV36(proposition.to), ...proposition.via.map(placeRefKeyV36)];
    case "spatial-comparison": return proposition.places.map(placeRefKeyV36);
    case "spatial-area": return [placeRefKeyV36(proposition.place)];
    case "causal": return [conceptRefKeyV36(proposition.cause), conceptRefKeyV36(proposition.effect)];
    case "dependency": return [conceptRefKeyV36(proposition.dependency), conceptRefKeyV36(proposition.dependent)];
    case "process":
    case "temporal-sequence": return proposition.steps.map(conceptRefKeyV36);
    case "policy-response": return [conceptRefKeyV36(proposition.condition), conceptRefKeyV36(proposition.response)];
    case "evidence-set": return [...(proposition.subject ? [conceptRefKeyV36(proposition.subject)] : []), ...proposition.evidence.map(conceptRefKeyV36)];
  }
}

function equivalentProposition(
  relation: ExplanatoryRelationV36,
  proposition: GroundedRelationPropositionV36
): boolean {
  return relation.kind === proposition.kind &&
    JSON.stringify(semanticParticipantPayload(relation)) === JSON.stringify(semanticParticipantPayload(proposition));
}

function relationParticipantKeys(relation: ExplanatoryRelationV36): readonly string[] {
  return allParticipantRefs(relation).map(participantKey);
}

function hasReverseDirection(
  relation: ExplanatoryRelationV36,
  proposition: GroundedRelationPropositionV36
): boolean {
  if (relation.kind !== proposition.kind) return false;
  switch (relation.kind) {
    case "movement":
      return proposition.kind === "movement" &&
        placeRefKeyV36(relation.from) === placeRefKeyV36(proposition.to) &&
        placeRefKeyV36(relation.to) === placeRefKeyV36(proposition.from);
    case "causal":
      return proposition.kind === "causal" &&
        conceptRefKeyV36(relation.cause) === conceptRefKeyV36(proposition.effect) &&
        conceptRefKeyV36(relation.effect) === conceptRefKeyV36(proposition.cause);
    case "dependency":
      return proposition.kind === "dependency" &&
        conceptRefKeyV36(relation.dependency) === conceptRefKeyV36(proposition.dependent) &&
        conceptRefKeyV36(relation.dependent) === conceptRefKeyV36(proposition.dependency);
    case "policy-response":
      return proposition.kind === "policy-response" &&
        conceptRefKeyV36(relation.condition) === conceptRefKeyV36(proposition.response) &&
        conceptRefKeyV36(relation.response) === conceptRefKeyV36(proposition.condition);
    case "spatial-comparison":
    case "spatial-area":
    case "process":
    case "temporal-sequence":
    case "evidence-set":
      return false;
  }
}

function cardinalityDiagnostics(
  relation: ExplanatoryRelationV36
): readonly RelationDiagnosticCodeV36[] {
  const keys = relationParticipantKeys(relation);
  const adjacentDuplicate = keys.some((key, index) => index > 0 && key === keys[index - 1]);
  switch (relation.kind) {
    case "movement": return placeRefKeyV36(relation.from) === placeRefKeyV36(relation.to) ? ["RELATION_CARDINALITY_INVALID"] : [];
    case "spatial-comparison": return new Set(keys).size < 2 ? ["RELATION_CARDINALITY_INVALID"] : [];
    case "causal": return conceptRefKeyV36(relation.cause) === conceptRefKeyV36(relation.effect) ? ["RELATION_CARDINALITY_INVALID"] : [];
    case "dependency": return conceptRefKeyV36(relation.dependency) === conceptRefKeyV36(relation.dependent) ? ["RELATION_CARDINALITY_INVALID"] : [];
    case "policy-response": return conceptRefKeyV36(relation.condition) === conceptRefKeyV36(relation.response) ? ["RELATION_CARDINALITY_INVALID"] : [];
    case "process":
    case "temporal-sequence": return relation.steps.length < 2 || adjacentDuplicate ? ["RELATION_CARDINALITY_INVALID"] : [];
    case "evidence-set": return new Set(relation.evidence.map(conceptRefKeyV36)).size < 2 ? ["RELATION_CARDINALITY_INVALID"] : [];
    case "spatial-area": return [];
  }
}

function isProperNameFragment(label: string, entity: ResolvedEntityV36): boolean {
  const participant = label.trim().toLocaleLowerCase();
  const canonical = entity.canonicalLabel.trim().toLocaleLowerCase();
  return entity.atomic && canonical.split(/\s+/u).length > 1 && participant !== canonical &&
    canonical.split(/\s+/u).includes(participant);
}

export const explanatoryRelationValidatorV36: ExplanatoryRelationValidatorV36 = {
  validate(relation, context) {
    const diagnostics: RelationDiagnosticV36[] = [];
    if (relation.episodeId !== context.episodeId) {
      diagnostics.push(diagnostic(relation, "RELATION_EPISODE_MISMATCH", "Relation episode differs from validation context.", [relation.episodeId, context.episodeId]));
    }
    const cardinalityCodes = cardinalityDiagnostics(relation);
    for (const code of cardinalityCodes) {
      diagnostics.push(diagnostic(relation, code, "Relation participants do not satisfy the kind's cardinality invariant."));
    }
    // Invalid cardinality has no final semantic ID. Avoid hashing malformed semantics.
    if (!cardinalityCodes.length) {
      if (relation.id !== explanatoryRelationIdV36(relation)) {
        diagnostics.push(diagnostic(relation, "RELATION_SEMANTIC_IDENTITY_MISMATCH", "Relation ID does not match its deterministic semantic identity."));
      }
      if (relation.evidenceFingerprint !== relationEvidenceFingerprintV36(relation.supportClaimIds)) {
        diagnostics.push(diagnostic(relation, "RELATION_EVIDENCE_FINGERPRINT_MISMATCH", "Evidence fingerprint does not match canonical support provenance."));
      }
    }
    for (const participant of allParticipantRefs(relation)) {
      const ref = participant.ref;
      if (hasEntityId(ref)) {
        const entity = context.entities.find((candidate) => candidate.id === ref.entityId);
        if (!entity || entity.canonicalLabel.trim().toLocaleLowerCase() !== ref.canonicalLabel.trim().toLocaleLowerCase()) {
          diagnostics.push(diagnostic(relation, "RELATION_PARTICIPANT_UNRESOLVED", "Participant does not resolve to the supplied canonical entity.", [ref.entityId]));
        }
      }
      for (const entity of context.entities) {
        if (isProperNameFragment(ref.canonicalLabel, entity) && entity.id !== ("entityId" in ref ? ref.entityId : undefined)) {
          diagnostics.push(diagnostic(relation, "RELATION_PROPER_NAME_FRAGMENTATION", "A resolved multi-token proper name was decomposed without independent resolution.", [entity.id, ref.canonicalLabel]));
        }
      }
    }
    for (const supportClaimId of relation.supportClaimIds) {
      const claim = context.claims.find((candidate) => candidate.id === supportClaimId);
      if (!claim) {
        diagnostics.push(diagnostic(relation, "RELATION_SUPPORT_CLAIM_MISSING", "Support claim was not supplied to the validation context.", [supportClaimId]));
        continue;
      }
      if (claim.episodeId !== relation.episodeId) {
        diagnostics.push(diagnostic(relation, "RELATION_EPISODE_MISMATCH", "Support claim belongs to a different episode.", [claim.id, claim.episodeId]));
        continue;
      }
      if (claim.groundedPropositions.some((proposition) => equivalentProposition(relation, proposition))) continue;
      if (claim.groundedPropositions.some((proposition) => hasReverseDirection(relation, proposition))) {
        diagnostics.push(diagnostic(relation, "RELATION_DIRECTION_UNSUPPORTED", "Support claim establishes the reverse direction, not this relation.", [claim.id]));
        continue;
      }
      if (claim.groundedPropositions.some((proposition) => JSON.stringify(propositionParticipantKeys(proposition)) === JSON.stringify(relationParticipantKeys(relation)))) {
        diagnostics.push(diagnostic(relation, "RELATION_TYPE_MISMATCH", "Support claim grounds these participants under a different relation type.", [claim.id]));
        continue;
      }
      diagnostics.push(diagnostic(relation, "RELATION_PROPOSITION_UNSUPPORTED", "Support claim does not establish this exact grounded proposition.", [claim.id]));
    }
    return diagnostics.length ? { status: "invalid", diagnostics } : { status: "valid" };
  },
};

export function validateExplanatoryRelationsV36(input: {
  readonly relations: readonly ExplanatoryRelationV36[];
  readonly context: RelationValidationContextV36;
}): readonly RelationValidationResultV36[] {
  const ids = new Map<string, ExplanatoryRelationV36>();
  return input.relations.map((relation) => {
    const result = explanatoryRelationValidatorV36.validate(relation, input.context);
    if (result.status === "invalid") return result;
    const identity = relation.id;
    const duplicate = ids.get(identity);
    ids.set(identity, relation);
    if (!duplicate) return result;
    const duplicateDiagnostic = diagnostic(relation, "RELATION_DUPLICATE_SEMANTIC_IDENTITY", "Another relation has the same deterministic semantic identity.", [duplicate.id, relation.id]);
    return { status: "invalid", diagnostics: [duplicateDiagnostic] };
  });
}
