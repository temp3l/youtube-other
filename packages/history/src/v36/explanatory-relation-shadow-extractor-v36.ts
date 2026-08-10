import {
  createExplanatoryRelationV36,
  type ClaimIdV36,
  type EpisodeIdV36,
  type ExplanatoryRelationDraftV36,
  type ExplanatoryRelationV36,
  type GroundedRelationPropositionV36,
  type RelationSupportClaimV36,
  type ResolvedEntityV36,
} from "./explanatory-relation-v36.js";
import {
  explanatoryRelationValidatorV36,
  type RelationDiagnosticV36,
} from "./explanatory-relation-validator-v36.js";

/**
 * Phase 2 boundary: this projects only explicit, structured claim propositions.
 * It does not infer relations from free text, call an LLM, or affect V3.5 planning.
 */
export interface ShadowRelationExtractionInputV36 {
  readonly episodeId: EpisodeIdV36;
  readonly claims: readonly RelationSupportClaimV36[];
  readonly entities: readonly ResolvedEntityV36[];
}

export interface RejectedShadowRelationCandidateV36 {
  readonly claimId: ClaimIdV36;
  readonly propositionIndex: number;
  readonly reason: string;
  readonly diagnostics?: readonly RelationDiagnosticV36[];
}

export interface ShadowRelationExtractionResultV36 {
  readonly mode: "v36-shadow";
  readonly episodeId: string;
  /** Validated, semantic-ID-deduplicated candidates; V3.5 never consumes these. */
  readonly relations: readonly ExplanatoryRelationV36[];
  readonly rejectedCandidates: readonly RejectedShadowRelationCandidateV36[];
  readonly skippedForeignClaimIds: readonly ClaimIdV36[];
}

function draftFromGroundedProposition(
  episodeId: EpisodeIdV36,
  supportClaimId: ClaimIdV36,
  proposition: GroundedRelationPropositionV36
): ExplanatoryRelationDraftV36 {
  return { ...proposition, episodeId, supportClaimIds: [supportClaimId] };
}

function draftWithMergedEvidence(
  relation: ExplanatoryRelationV36,
  supportClaimIds: readonly ClaimIdV36[]
): ExplanatoryRelationDraftV36 {
  const { id: _id, evidenceFingerprint: _evidenceFingerprint, supportClaimIds: _supportClaimIds, ...semantic } = relation;
  return { ...semantic, supportClaimIds } as ExplanatoryRelationDraftV36;
}

/**
 * Materialize explicit structured propositions as V3.6 shadow candidates.
 * Same semantics from multiple claims converge on one relation with merged provenance.
 */
export function extractShadowRelationCandidatesV36(
  input: ShadowRelationExtractionInputV36
): ShadowRelationExtractionResultV36 {
  const candidates: ExplanatoryRelationV36[] = [];
  const rejectedCandidates: RejectedShadowRelationCandidateV36[] = [];
  const skippedForeignClaimIds: ClaimIdV36[] = [];

  for (const claim of input.claims) {
    if (claim.episodeId !== input.episodeId) {
      skippedForeignClaimIds.push(claim.id);
      continue;
    }
    for (const [propositionIndex, proposition] of claim.groundedPropositions.entries()) {
      try {
        candidates.push(createExplanatoryRelationV36(
          draftFromGroundedProposition(input.episodeId, claim.id, proposition)
        ));
      } catch (error) {
        rejectedCandidates.push({
          claimId: claim.id,
          propositionIndex,
          reason: error instanceof Error ? error.message : "Invalid relation proposition.",
        });
      }
    }
  }

  const mergedBySemanticId = new Map<string, ExplanatoryRelationV36>();
  for (const candidate of candidates) {
    const existing = mergedBySemanticId.get(candidate.id);
    if (!existing) {
      mergedBySemanticId.set(candidate.id, candidate);
      continue;
    }
    mergedBySemanticId.set(candidate.id, createExplanatoryRelationV36(
      draftWithMergedEvidence(existing, [...existing.supportClaimIds, ...candidate.supportClaimIds])
    ));
  }

  const relations: ExplanatoryRelationV36[] = [];
  for (const relation of [...mergedBySemanticId.values()].sort((left, right) => left.id.localeCompare(right.id))) {
    const validation = explanatoryRelationValidatorV36.validate(relation, input);
    if (validation.status === "valid") {
      relations.push(relation);
      continue;
    }
    rejectedCandidates.push({
      claimId: relation.supportClaimIds[0],
      propositionIndex: -1,
      reason: "Candidate failed deterministic relation validation.",
      diagnostics: validation.diagnostics,
    });
  }

  return {
    mode: "v36-shadow",
    episodeId: input.episodeId,
    relations,
    rejectedCandidates,
    skippedForeignClaimIds: [...new Set(skippedForeignClaimIds)].sort((left, right) => left.localeCompare(right)),
  };
}
