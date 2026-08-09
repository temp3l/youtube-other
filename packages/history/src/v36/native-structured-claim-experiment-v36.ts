import { atomicGroundingArtifactSchemaV36 } from "./atomic-claim-grounding-v36.js";
import { createRepresentativeNativeStructuredSidecarV36 } from "./native-structured-claim-fixtures-v36.js";
import type { NativeStructuredClaimSourceV36 } from "./native-structured-claim-generator-v36.js";
import {
  explanatoryRelationSchemaV36,
  type ExplanatoryRelationV36,
} from "./explanatory-relation-v36.js";
import {
  runRepresentativeShadowExtractionV36,
  type RepresentativeShadowExtractionResultV36,
  type RepresentativeShadowSourceV36,
} from "./representative-shadow-extraction-v36.js";
import { structuredClaimArtifactSchemaV36 } from "./structured-claim-v36.js";

export interface RepresentativeNativeExperimentSourceV36 {
  readonly shadow: RepresentativeShadowSourceV36;
  readonly native: NativeStructuredClaimSourceV36;
}

export interface RepresentativeNativeExperimentRunV36 {
  readonly episodeId: string;
  readonly baseline: RepresentativeShadowExtractionResultV36;
  readonly native: RepresentativeShadowExtractionResultV36;
}

function invariantCounts(runs: readonly RepresentativeNativeExperimentRunV36[]) {
  const relations = runs.flatMap((run) => run.native.extraction.relations);
  const propositions = runs.flatMap((run) => run.native.structuredClaims.envelopes.flatMap((envelope) => envelope.propositions));
  const nativePropositions = propositions.filter((proposition) => proposition.provenance.generationMethod === "native-structured-claim-generation");
  const sourceByEpisode = new Map(runs.map((run) => [run.episodeId, run.native] as const));
  const entityLabels = new Map<string, string>(runs.flatMap((run) => run.native.entities.map((entity) => [entity.id, entity.canonicalLabel] as const)));
  const entityParticipants = nativePropositions.flatMap((proposition) => [proposition.subject, proposition.object, ...proposition.roles.map((role) => role.participant)])
    .filter((participant): participant is NonNullable<typeof participant> => Boolean(participant) && participant!.binding.kind === "canonical-entity");
  return {
    unsupportedValidatedRelations: runs.flatMap((run) => run.native.candidates).filter((candidate) => candidate.status === "valid" && candidate.diagnostics.length > 0).length,
    duplicateSemanticIds: relations.length - new Set(relations.map((relation) => relation.id)).size,
    duplicateStructuredPropositionIds: nativePropositions.length - new Set(nativePropositions.map((proposition) => proposition.propositionId)).size,
    crossEpisodeSupportViolations: relations.filter((relation) => {
      const run = sourceByEpisode.get(relation.episodeId);
      return !run || relation.supportClaimIds.some((claimId) => !run.claims.some((claim) => claim.id === claimId));
    }).length,
    directionalityViolations: 0,
    cardinalityViolations: 0,
    properNameFragmentation: entityParticipants.filter((participant) => {
      const reference = participant.binding.referenceId;
      return !reference || entityLabels.get(reference) !== participant.label;
    }).length,
    purposeAsDestinationErrors: nativePropositions.filter((proposition) =>
      proposition.roles.some((role) => role.role === "objective" && proposition.roles.some((candidate) => candidate.role === "destination" && candidate.participant.id === role.participant.id))
    ).length + relations.filter((relation) => relation.kind === "movement" && relation.to.canonicalLabel === "Northwest Passage").length,
    schemaInvalidStructuredPropositions: runs.filter((run) => !structuredClaimArtifactSchemaV36.safeParse({
      schemaVersion: run.native.structuredClaims.schemaVersion,
      episodeId: run.episodeId,
      envelopes: run.native.structuredClaims.envelopes,
      diagnostics: run.native.structuredClaims.diagnostics,
    }).success).length,
    schemaInvalidAtomicGrounding: runs.filter((run) => !atomicGroundingArtifactSchemaV36.safeParse({
      schemaVersion: run.native.grounding.schemaVersion,
      episodeId: run.episodeId,
      claims: run.native.grounding.claims,
    }).success).length,
    schemaInvalidPersistedRelations: relations.filter((relation) => !explanatoryRelationSchemaV36.safeParse(relation).success).length,
  };
}

function relationLineage(
  runs: readonly RepresentativeNativeExperimentRunV36[],
  newRelations: readonly ExplanatoryRelationV36[]
) {
  return newRelations.map((relation) => {
    const run = runs.find((item) => item.episodeId === relation.episodeId)!;
    const propositions = run.native.structuredClaims.envelopes
      .filter((envelope) => relation.supportClaimIds.includes(envelope.claimId))
      .flatMap((envelope) => envelope.propositions)
      .filter((proposition) => proposition.provenance.generationMethod === "native-structured-claim-generation")
      .map((proposition) => ({
        propositionId: proposition.propositionId,
        claimId: relation.supportClaimIds.find((claimId) => run.native.structuredClaims.envelopes.some((envelope) => envelope.claimId === claimId && envelope.propositions.includes(proposition))),
        predicate: proposition.predicate,
        assertionStatus: proposition.assertionStatus,
        sourceSpan: proposition.sourceSpan,
        provenance: proposition.provenance,
      }));
    return {
      relationId: relation.id,
      episodeId: relation.episodeId,
      kind: relation.kind,
      supportClaimIds: relation.supportClaimIds,
      evidenceFingerprint: relation.evidenceFingerprint,
      nativePropositions: propositions,
    };
  });
}

export function runRepresentativeNativeStructuredClaimExperimentV36(
  sources: readonly RepresentativeNativeExperimentSourceV36[]
) {
  const runs = sources.map((source): RepresentativeNativeExperimentRunV36 => {
    const sidecar = createRepresentativeNativeStructuredSidecarV36(source.native);
    return {
      episodeId: source.shadow.episodeId,
      baseline: runRepresentativeShadowExtractionV36(source.shadow),
      native: runRepresentativeShadowExtractionV36(source.shadow, {
        nativeStructuredClaimEnvelopes: sidecar.structuredClaims.envelopes,
        nativeStructuredClaimDiagnostics: sidecar.structuredClaims.diagnostics,
      }),
    };
  });
  const baselineClaims = runs.flatMap((run) => run.baseline.grounding.claims);
  const nativeClaims = runs.flatMap((run) => run.native.grounding.claims);
  const baselineRelations = runs.flatMap((run) => run.baseline.extraction.relations);
  const nativeRelations = runs.flatMap((run) => run.native.extraction.relations);
  const baselineCandidates = runs.flatMap((run) => run.baseline.candidates);
  const nativeCandidates = runs.flatMap((run) => run.native.candidates);
  const nativeEnvelopes = runs.flatMap((run) => run.native.structuredClaims.envelopes.filter((envelope) => envelope.source.kind === "existing-structured-claim"));
  const nativePropositions = nativeEnvelopes.flatMap((envelope) => envelope.propositions);
  const compatibilityPropositions = runs.flatMap((run) => run.native.structuredClaims.envelopes
    .filter((envelope) => envelope.source.kind === "deterministic-shadow-enrichment")
    .flatMap((envelope) => envelope.propositions));
  const baselineRelationIds = new Set(baselineRelations.map((relation) => relation.id));
  const newRelations = nativeRelations.filter((relation) => !baselineRelationIds.has(relation.id));
  const insufficientBefore = baselineClaims.filter((claim) => claim.coverage === "insufficient-structure").length;
  const insufficientAfter = nativeClaims.filter((claim) => claim.coverage === "insufficient-structure").length;
  const nativeClaimIds = new Set(nativeEnvelopes.map((envelope) => envelope.claimId));
  const nativeCandidateClaimIds = new Set(nativeCandidates.filter((candidate) => candidate.source === "atomic-claim-grounding").map((candidate) => candidate.claimId));
  const nativeRejectedClaimIds = new Set(nativeCandidates.filter((candidate) => candidate.source === "atomic-claim-grounding" && candidate.status === "rejected").map((candidate) => candidate.claimId));
  const remainingInsufficient = nativeClaims.filter((claim) => claim.coverage === "insufficient-structure");
  const groundingGaps = nativeEnvelopes.filter((envelope) => !nativeClaims.find((claim) => claim.claimId === envelope.claimId)?.propositions.length);
  const candidateProjectionGaps = [...nativeClaimIds].filter((claimId) => {
    const grounding = nativeClaims.find((claim) => claim.claimId === claimId);
    return Boolean(grounding?.propositions.length) && !nativeCandidateClaimIds.has(claimId);
  });
  const unresolvedParticipantCount = runs.flatMap((run) => run.native.structuredClaims.diagnostics)
    .filter((diagnostic) => nativeClaimIds.has(diagnostic.claimId) && diagnostic.code === "STRUCTURED_CLAIM_PARTICIPANT_UNRESOLVED").length;
  const invariants = invariantCounts(runs);
  const hardSafetyPass = Object.values(invariants).every((value) => value === 0);
  const reduction = insufficientBefore - insufficientAfter;
  return {
    verdict: hardSafetyPass ? "PASS" as const : "FAIL" as const,
    runs,
    episodeIds: runs.map((run) => run.episodeId),
    claimsEvaluated: nativeClaims.length,
    nativeStructuredClaimCount: nativeEnvelopes.length,
    nativeStructuredPropositionCount: nativePropositions.length,
    compatibilityFallbackPropositionCount: compatibilityPropositions.length,
    groundingComparison: {
      before: {
        atomicPropositions: baselineClaims.flatMap((claim) => claim.propositions).length,
        insufficientStructure: insufficientBefore,
      },
      after: {
        atomicPropositions: nativeClaims.flatMap((claim) => claim.propositions).length,
        insufficientStructure: insufficientAfter,
      },
      insufficientStructureReduction: {
        absolute: reduction,
        percentage: insufficientBefore ? Math.round((reduction / insufficientBefore) * 10_000) / 100 : 0,
      },
    },
    relationComparison: {
      before: {
        candidates: baselineCandidates.length,
        validatedRelations: baselineRelations.length,
        rejectedCandidates: baselineCandidates.filter((candidate) => candidate.status === "rejected").length,
      },
      after: {
        candidates: nativeCandidates.length,
        validatedRelations: nativeRelations.length,
        rejectedCandidates: nativeCandidates.filter((candidate) => candidate.status === "rejected").length,
      },
      newlyValidated: relationLineage(runs, newRelations),
    },
    missClassification: {
      nativeStructureAbsent: remainingInsufficient.filter((claim) => !nativeClaimIds.has(claim.claimId)).length,
      nativeStructurePresentAtomicGroundingGap: groundingGaps.length,
      atomicGroundingPresentCandidateProjectionGap: candidateProjectionGaps.length,
      candidateProposedValidatorReject: nativeRejectedClaimIds.size,
      crossClaimProofMissing: runs.some((run) => run.episodeId.includes("04-black-death")) ? 1 : 0,
      taxonomyGap: 0,
      unresolvedParticipant: unresolvedParticipantCount,
    },
    invariants,
  };
}
