import { atomicGroundingArtifactSchemaV36 } from "./atomic-claim-grounding-v36.js";
import {
  createRepresentativeNativeStructuredSidecarV36,
  representativeNativeProcessClaimIdsV36,
  representativeNativeTemporalClaimIdsV36,
} from "./native-structured-claim-fixtures-v36.js";
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
import {
  HISTORY_PROOF_AWARE_POLICY_RESPONSE_ADMISSION_V36,
  admitProofAwarePolicyResponseV36,
} from "./proof-aware-policy-response-admission-v36.js";
import { approvedCrossClaimResponseClaimIdV36 } from "./cross-claim-proof-fixtures-v36.js";
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
  const atomicPropositions = runs.flatMap((run) => run.native.grounding.propositions);
  const projectedCandidates = runs.flatMap((run) => run.native.candidates)
    .filter((candidate) => candidate.source === "atomic-process-projection" || candidate.source === "atomic-temporal-projection" || candidate.source === "atomic-transforms-causal-projection" || candidate.source === "atomic-evidence-set-projection" || candidate.source === "atomic-approved-modal-causal-projection");
  const evidenceSetCandidates = projectedCandidates.filter((candidate) =>
    candidate.source === "atomic-evidence-set-projection");
  const propositions = runs.flatMap((run) => run.native.structuredClaims.envelopes.flatMap((envelope) => envelope.propositions));
  const nativePropositions = propositions.filter((proposition) => proposition.provenance.generationMethod === "native-structured-claim-generation");
  const nativeClaimPropositions = runs.flatMap((run) => run.native.structuredClaims.envelopes
    .filter((envelope) => envelope.source.kind === "existing-structured-claim")
    .flatMap((envelope) => envelope.propositions.map((proposition) => ({ claimId: envelope.claimId, proposition }))));
  const processClaimIds = new Set<string>(representativeNativeProcessClaimIdsV36);
  const temporalClaimIds = new Set<string>(representativeNativeTemporalClaimIdsV36);
  const processPropositions = nativeClaimPropositions.filter(({ proposition }) => proposition.predicate === "process-sequence");
  const temporalPropositions = nativeClaimPropositions.filter(({ proposition }) => proposition.predicate === "precedes");
  const processAtoms = atomicPropositions.filter((proposition) => proposition.predicate === "process-sequence");
  const temporalAtoms = atomicPropositions.filter((proposition) => proposition.predicate === "precedes");
  const sourceByEpisode = new Map(runs.map((run) => [run.episodeId, run.native] as const));
  const entityLabels = new Map<string, string>(runs.flatMap((run) => run.native.entities.map((entity) => [entity.id, entity.canonicalLabel] as const)));
  const entityParticipants = nativePropositions.flatMap((proposition) => [proposition.subject, proposition.object, ...proposition.roles.map((role) => role.participant)])
    .filter((participant): participant is NonNullable<typeof participant> => Boolean(participant) && participant!.binding.kind === "canonical-entity");
  const evidenceAtoms = (candidate: (typeof evidenceSetCandidates)[number]) => atomicPropositions
    .filter((atom) => candidate.atomicGroundingIds?.includes(atom.groundingId));
  const evidenceRelation = (candidate: (typeof evidenceSetCandidates)[number]) => relations
    .find((relation) => relation.id === candidate.semanticRelationId);
  const evidenceMemberIds = (candidate: (typeof evidenceSetCandidates)[number]) =>
    [...new Set(evidenceAtoms(candidate).flatMap((atom) => atom.object ? [atom.object.id] : []))]
      .sort((left, right) => left.localeCompare(right));
  return {
    unsupportedValidatedRelations: runs.flatMap((run) => run.native.candidates).filter((candidate) => candidate.status === "valid" && candidate.diagnostics.length > 0).length,
    duplicateSemanticIds: relations.length - new Set(relations.map((relation) => relation.id)).size,
    duplicateStructuredPropositionIds: nativePropositions.length - new Set(nativePropositions.map((proposition) => proposition.propositionId)).size,
    crossEpisodeSupportViolations: relations.filter((relation) => {
      const run = sourceByEpisode.get(relation.episodeId);
      return !run || relation.supportClaimIds.some((claimId) => !run.claims.some((claim) => claim.id === claimId));
    }).length,
    directionalityViolations: temporalPropositions.filter(({ proposition }) =>
      proposition.roles.find((role) => role.role === "before")?.participant.id !== proposition.subject.id ||
      proposition.roles.find((role) => role.role === "after")?.participant.id !== proposition.object?.id
    ).length,
    cardinalityViolations: processPropositions.filter(({ proposition }) => (proposition.processSteps?.length ?? 0) < 2).length,
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
    processOrderFabricatedFromUnorderedEvidence: processPropositions.filter(({ claimId }) => !processClaimIds.has(claimId)).length,
    temporalOrderFabricatedFromClaimArrayOrder: temporalPropositions.filter(({ claimId }) => !temporalClaimIds.has(claimId)).length,
    chronologyIncorrectlyPromotedToCausality: relations.filter((relation) =>
      relation.kind === "causal" && relation.supportClaimIds.some((claimId) => temporalClaimIds.has(claimId))
    ).length,
    processIncorrectlyPromotedToCausality: relations.filter((relation) =>
      relation.kind === "causal" && relation.supportClaimIds.some((claimId) => processClaimIds.has(claimId))
    ).length,
    fabricatedProcessOrder: relations.filter((relation) => {
      if (relation.kind !== "process") return false;
      const atom = processAtoms.find((proposition) => relation.supportClaimIds.includes(proposition.claimId));
      const atomicSteps = [...(atom?.processSteps ?? [])]
        .sort((left, right) => left.stepOrder - right.stepOrder)
        .map((step) => step.participant.label.trim().toLocaleLowerCase());
      return JSON.stringify(atomicSteps) !== JSON.stringify(relation.steps.map((step) => step.canonicalLabel.trim().toLocaleLowerCase()));
    }).length,
    fabricatedTemporalOrder: relations.filter((relation) => {
      if (relation.kind !== "temporal-sequence") return false;
      const atom = temporalAtoms.find((proposition) => relation.supportClaimIds.includes(proposition.claimId));
      const atomicSteps = atom?.object
        ? [atom.subject.label, atom.object.label].map((label) => label.trim().toLocaleLowerCase())
        : [];
      return JSON.stringify(atomicSteps) !== JSON.stringify(relation.steps.map((step) => step.canonicalLabel.trim().toLocaleLowerCase()));
    }).length,
    syntheticProcessContainerUsedAsHistoricalFact: projectedCandidates.filter((candidate) => {
      if (candidate.source !== "atomic-process-projection" || !candidate.processGrouping) return false;
      const relation = relations.find((item) => item.id === candidate.semanticRelationId);
      return candidate.resolvedParticipantIds.includes(candidate.processGrouping.participantId) ||
        Boolean(relation?.kind === "process" && relation.steps.some((step) => step.canonicalLabel === candidate.processGrouping?.label));
    }).length,
    nonAssertedTransformsPromotedToAssertedCausality: projectedCandidates.filter((candidate) =>
      candidate.source === "atomic-transforms-causal-projection" && candidate.assertionStatus !== "asserted"
    ).length,
    reversedTransformsCausality: projectedCandidates.filter((candidate) => {
      if (candidate.source !== "atomic-transforms-causal-projection") return false;
      const atom = atomicPropositions.find((proposition) => proposition.groundingId === candidate.atomicGroundingIds?.[0]);
      const relation = relations.find((item) => item.id === candidate.semanticRelationId);
      return !atom || relation?.kind !== "causal" || relation.cause.canonicalLabel !== atom.subject.label || relation.effect.canonicalLabel !== atom.object?.label;
    }).length,
    unresolvedTransformsParticipantAdmission: projectedCandidates.filter((candidate) =>
      candidate.source === "atomic-transforms-causal-projection" && candidate.semanticParticipantIds?.some((id) => !candidate.resolvedParticipantIds.includes(id))
    ).length,
    modalCausalModalityLoss: projectedCandidates.filter((candidate) => {
      if (candidate.source !== "atomic-approved-modal-causal-projection") return false;
      const relation = relations.find((item) => item.id === candidate.semanticRelationId);
      return relation?.kind !== "causal" || relation.causalAssertionStatus !== candidate.assertionStatus;
    }).length,
    unexpectedModalCausalAdmission: projectedCandidates.filter((candidate) =>
      candidate.source === "atomic-approved-modal-causal-projection" &&
      !["claim-d97c2dd1d2ef4a18aeb04406", "claim-db26077e95258cfa59dfab83"].includes(candidate.claimId)
    ).length,
    crossClaimEvidenceSetAggregation: evidenceSetCandidates.filter((candidate) => {
      const atoms = evidenceAtoms(candidate);
      return candidate.supportClaimIds.length !== 1 ||
        new Set(atoms.map((atom) => atom.claimId)).size !== 1 ||
        atoms.some((atom) => atom.claimId !== candidate.supportClaimIds[0]);
    }).length,
    crossEpisodeEvidenceSetAggregation: evidenceSetCandidates.filter((candidate) => {
      const atoms = evidenceAtoms(candidate);
      return new Set(atoms.map((atom) => atom.episodeId)).size !== 1 ||
        atoms.some((atom) => atom.episodeId !== candidate.episodeId);
    }).length,
    singletonEvidenceSetAdmission: evidenceSetCandidates.filter((candidate) =>
      evidenceMemberIds(candidate).length < 2).length,
    duplicateOnlyEvidenceSetAdmission: evidenceSetCandidates.filter((candidate) => {
      const atoms = evidenceAtoms(candidate);
      return atoms.length > 1 && evidenceMemberIds(candidate).length < 2;
    }).length,
    mixedTargetEvidenceSetAdmission: evidenceSetCandidates.filter((candidate) =>
      new Set(evidenceAtoms(candidate).map((atom) => atom.subject.id)).size !== 1).length,
    mixedSpanEvidenceSetAdmission: evidenceSetCandidates.filter((candidate) =>
      new Set(evidenceAtoms(candidate).map((atom) => JSON.stringify(atom.sourceSpan))).size !== 1).length,
    mixedSourceHashEvidenceSetAdmission: evidenceSetCandidates.filter((candidate) =>
      new Set(evidenceAtoms(candidate).map((atom) => atom.sourceSpan.textHash)).size !== 1).length,
    nonAssertedEvidenceSetAdmission: evidenceSetCandidates.filter((candidate) =>
      evidenceAtoms(candidate).some((atom) => atom.assertionStatus !== "asserted")).length,
    compatibilityLineageEvidenceSetAdmission: evidenceSetCandidates.filter((candidate) =>
      evidenceAtoms(candidate).some((atom) => atom.provenance.sourceKind !== "native-structured-proposition")).length,
    syntheticGroupingMetadataTreatedAsEvidence: evidenceSetCandidates.filter((candidate) => {
      const directMembers = evidenceMemberIds(candidate);
      const projectedMembers = [...(candidate.semanticParticipantIds?.slice(1) ?? [])]
        .sort((left, right) => left.localeCompare(right));
      return JSON.stringify(directMembers) !== JSON.stringify(projectedMembers);
    }).length,
    franklinGroupedGravesExplosion: evidenceSetCandidates.filter((candidate) => {
      if (!candidate.episodeId.includes("franklin-expedition")) return false;
      const relation = evidenceRelation(candidate);
      return relation?.kind !== "evidence-set" ||
        relation.evidence.some((member) => ["John Torrington", "John Hartnell", "William Braine"].includes(member.canonicalLabel)) ||
        !relation.evidence.some((member) => member.canonicalLabel === "graves of John Torrington, John Hartnell, and William Braine");
    }).length,
    unresolvedEvidenceSetParticipantAdmission: evidenceSetCandidates.filter((candidate) => {
      const resolvedIds = new Set<string>(evidenceAtoms(candidate).flatMap((atom) => atom.provenance.resolvedParticipantIds));
      return candidate.semanticParticipantIds?.some((id) => !resolvedIds.has(id));
    }).length,
    evidenceSetTargetDuplicatedAsMember: evidenceSetCandidates.filter((candidate) => {
      const participants = candidate.semanticParticipantIds ?? [];
      return participants.slice(1).includes(participants[0]!);
    }).length,
    evidenceSetCandidateRelationCardinalityViolation: evidenceSetCandidates.filter((candidate) => {
      const relation = evidenceRelation(candidate);
      return relation?.kind !== "evidence-set" || new Set(relation.evidence.map((member) => member.canonicalLabel)).size < 2;
    }).length,
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
    const candidates = run.native.candidates.filter((candidate) => candidate.semanticRelationId === relation.id);
    const lineageAtomicIds = new Set(candidates.flatMap((candidate) => candidate.atomicGroundingIds ?? []));
    const atomicPropositions = run.native.grounding.propositions
      .filter((proposition) => lineageAtomicIds.has(proposition.groundingId));
    return {
      relationId: relation.id,
      episodeId: relation.episodeId,
      kind: relation.kind,
      supportClaimIds: relation.supportClaimIds,
      evidenceFingerprint: relation.evidenceFingerprint,
      nativePropositions: propositions,
      atomicPropositions,
      candidates,
    };
  });
}

export function runRepresentativeNativeStructuredClaimExperimentV36(
  sources: readonly RepresentativeNativeExperimentSourceV36[]
) {
  const runs = sources.map((source): RepresentativeNativeExperimentRunV36 => {
    const sidecar = createRepresentativeNativeStructuredSidecarV36(source.native);
    const native = runRepresentativeShadowExtractionV36(source.shadow, {
      nativeStructuredClaimEnvelopes: sidecar.structuredClaims.envelopes,
      nativeStructuredClaimDiagnostics: sidecar.structuredClaims.diagnostics,
    });
    const proofAdmission = admitProofAwarePolicyResponseV36(native);
    const admittedNative = proofAdmission.status !== "admitted" ? native : {
      ...native,
      extraction: { ...native.extraction, relations: [...native.extraction.relations, proofAdmission.value.relation].sort((left, right) => left.id.localeCompare(right.id)) },
      candidates: [...native.candidates, {
        id: `proof-aware-${proofAdmission.value.proofEvidence.evidenceId}`,
        episodeId: native.episodeId,
        claimId: approvedCrossClaimResponseClaimIdV36,
        supportClaimIds: proofAdmission.value.relation.supportClaimIds,
        windowSize: 2 as const,
        source: "proof-aware-relation-evidence" as const,
        extractionRule: HISTORY_PROOF_AWARE_POLICY_RESPONSE_ADMISSION_V36,
        normalizedProposition: "validated cross-claim policy-response proof",
        sourceSpans: proofAdmission.value.proofEvidence.premises.map((premise) => ({ startUtf16: premise.sourceSpan.startUtf16, endUtf16Exclusive: premise.sourceSpan.endUtf16Exclusive })),
        resolvedParticipantIds: proofAdmission.value.proofEvidence.premises.map((premise) => premise.participantId),
        status: "valid" as const,
        semanticRelationId: proofAdmission.value.relation.id,
        evidenceFingerprint: proofAdmission.value.relation.evidenceFingerprint,
        atomicGroundingIds: proofAdmission.value.proofEvidence.premises.map((premise) => premise.atomicGroundingId),
        structuredPropositionIds: proofAdmission.value.proofEvidence.premises.map((premise) => premise.structuredPropositionId),
        assertionStatus: "attempted" as const,
        atomicSourceSpans: proofAdmission.value.proofEvidence.premises.map((premise) => premise.sourceSpan),
        semanticParticipantIds: proofAdmission.value.proofEvidence.premises.map((premise) => premise.participantId),
        diagnostics: [],
      }].sort((left, right) => left.id.localeCompare(right.id)),
    };
    return {
      episodeId: source.shadow.episodeId,
      baseline: runRepresentativeShadowExtractionV36(source.shadow),
      native: admittedNative,
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
  const baselineAtomicPropositions = baselineClaims.flatMap((claim) => claim.propositions);
  const nativeAtomicPropositions = nativeClaims.flatMap((claim) => claim.propositions);
  const compatibilityPropositions = runs.flatMap((run) => run.native.structuredClaims.envelopes
    .filter((envelope) => envelope.source.kind === "deterministic-shadow-enrichment")
    .flatMap((envelope) => envelope.propositions));
  const baselineRelationIds = new Set(baselineRelations.map((relation) => relation.id));
  const newRelations = nativeRelations.filter((relation) => !baselineRelationIds.has(relation.id));
  const insufficientBefore = baselineClaims.filter((claim) => claim.coverage === "insufficient-structure").length;
  const insufficientAfter = nativeClaims.filter((claim) => claim.coverage === "insufficient-structure").length;
  const nativeClaimIds = new Set(nativeEnvelopes.map((envelope) => envelope.claimId));
  const atomicCandidateSources = new Set(["atomic-claim-grounding", "atomic-process-projection", "atomic-temporal-projection", "atomic-transforms-causal-projection", "atomic-evidence-set-projection", "atomic-approved-modal-causal-projection", "proof-aware-relation-evidence"]);
  const nativeCandidateClaimIds = new Set(nativeCandidates.filter((candidate) => atomicCandidateSources.has(candidate.source)).map((candidate) => candidate.claimId));
  const nativeRejectedClaimIds = new Set(nativeCandidates.filter((candidate) => atomicCandidateSources.has(candidate.source) && candidate.status === "rejected").map((candidate) => candidate.claimId));
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
  const processRelationsAfter = nativeRelations.filter((relation) => relation.kind === "process").length;
  const temporalRelationsAfter = nativeRelations.filter((relation) => relation.kind === "temporal-sequence").length;
  const processCandidates = nativeCandidates.filter((candidate) => candidate.source === "atomic-process-projection");
  const temporalCandidates = nativeCandidates.filter((candidate) => candidate.source === "atomic-temporal-projection");
  const transformsCandidates = nativeCandidates.filter((candidate) => candidate.source === "atomic-transforms-causal-projection");
  const evidenceSetCandidates = nativeCandidates.filter((candidate) => candidate.source === "atomic-evidence-set-projection");
  const modalCausalCandidates = nativeCandidates.filter((candidate) => candidate.source === "atomic-approved-modal-causal-projection");
  const phase26Baseline = {
    nativeClaims: 17,
    nativePropositions: 18,
    nativeProcessPropositions: 0,
    nativeTemporalPropositions: 0,
    insufficientStructure: 61,
    atomicPropositions: 37,
    atomicProcessPropositions: 0,
    atomicTemporalPropositions: 0,
    candidates: 45,
    validatedRelations: 23,
    processRelations: processRelationsAfter,
    temporalSequenceRelations: temporalRelationsAfter,
  };
  const phase27Baseline = {
    nativeClaims: 21,
    nativePropositions: 22,
    nativeProcessPropositions: 2,
    nativeTemporalPropositions: 2,
    insufficientStructure: 60,
    atomicPropositions: 41,
    atomicProcessPropositions: 2,
    atomicTemporalPropositions: 2,
    candidates: 45,
    validatedRelations: 23,
    processRelations: 0,
    temporalSequenceRelations: 0,
  };
  const currentMetrics = {
    nativeClaims: nativeEnvelopes.length,
    nativePropositions: nativePropositions.length,
    nativeProcessPropositions: nativePropositions.filter((proposition) => proposition.predicate === "process-sequence").length,
    nativeTemporalPropositions: nativePropositions.filter((proposition) => proposition.predicate === "precedes").length,
    insufficientStructure: insufficientAfter,
    atomicPropositions: nativeAtomicPropositions.length,
    atomicProcessPropositions: nativeAtomicPropositions.filter((proposition) => proposition.predicate === "process-sequence").length,
    atomicTemporalPropositions: nativeAtomicPropositions.filter((proposition) => proposition.predicate === "precedes").length,
    candidates: nativeCandidates.length,
    validatedRelations: nativeRelations.length,
    processRelations: processRelationsAfter,
    temporalSequenceRelations: temporalRelationsAfter,
    evidenceSetRelations: nativeRelations.filter((relation) => relation.kind === "evidence-set").length,
  };
  return {
    verdict: hardSafetyPass ? "PASS" as const : "FAIL" as const,
    runs,
    episodeIds: runs.map((run) => run.episodeId),
    claimsEvaluated: nativeClaims.length,
    nativeStructuredClaimCount: nativeEnvelopes.length,
    nativeStructuredPropositionCount: nativePropositions.length,
    nativeProcessPropositionCount: nativePropositions.filter((proposition) => proposition.predicate === "process-sequence").length,
    nativeTemporalPropositionCount: nativePropositions.filter((proposition) => proposition.predicate === "precedes").length,
    atomicProcessPropositionCount: nativeAtomicPropositions.filter((proposition) => proposition.predicate === "process-sequence").length,
    atomicTemporalPropositionCount: nativeAtomicPropositions.filter((proposition) => proposition.predicate === "precedes").length,
    compatibilityFallbackPropositionCount: compatibilityPropositions.length,
    candidateProjection: {
      process: {
        proposed: processCandidates.length,
        validatorAccepts: processCandidates.filter((candidate) => candidate.status === "valid").length,
        validatorRejects: processCandidates.filter((candidate) => candidate.status === "rejected").length,
      },
      temporal: {
        proposed: temporalCandidates.length,
        validatorAccepts: temporalCandidates.filter((candidate) => candidate.status === "valid").length,
        validatorRejects: temporalCandidates.filter((candidate) => candidate.status === "rejected").length,
      },
      transforms: {
        proposed: transformsCandidates.length,
        validatorAccepts: transformsCandidates.filter((candidate) => candidate.status === "valid").length,
        validatorRejects: transformsCandidates.filter((candidate) => candidate.status === "rejected").length,
      },
      evidenceSet: {
        proposed: evidenceSetCandidates.length,
        validatorAccepts: evidenceSetCandidates.filter((candidate) => candidate.status === "valid").length,
        validatorRejects: evidenceSetCandidates.filter((candidate) => candidate.status === "rejected").length,
      },
      modalCausal: {
        proposed: modalCausalCandidates.length,
        validatorAccepts: modalCausalCandidates.filter((candidate) => candidate.status === "valid").length,
        validatorRejects: modalCausalCandidates.filter((candidate) => candidate.status === "rejected").length,
      },
    },
    phase26Comparison: {
      before: phase26Baseline,
      after: currentMetrics,
    },
    phase27Comparison: { before: phase27Baseline, after: currentMetrics },
    groundingComparison: {
      before: {
        atomicPropositions: baselineAtomicPropositions.length,
        insufficientStructure: insufficientBefore,
      },
      after: {
        atomicPropositions: nativeAtomicPropositions.length,
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
        processRelations: baselineRelations.filter((relation) => relation.kind === "process").length,
        temporalSequenceRelations: baselineRelations.filter((relation) => relation.kind === "temporal-sequence").length,
        evidenceSetRelations: baselineRelations.filter((relation) => relation.kind === "evidence-set").length,
        rejectedCandidates: baselineCandidates.filter((candidate) => candidate.status === "rejected").length,
      },
      after: {
        candidates: nativeCandidates.length,
        validatedRelations: nativeRelations.length,
        processRelations: nativeRelations.filter((relation) => relation.kind === "process").length,
        temporalSequenceRelations: nativeRelations.filter((relation) => relation.kind === "temporal-sequence").length,
        evidenceSetRelations: nativeRelations.filter((relation) => relation.kind === "evidence-set").length,
        rejectedCandidates: nativeCandidates.filter((candidate) => candidate.status === "rejected").length,
      },
      newlyValidated: relationLineage(runs, newRelations),
    },
    missClassification: {
      nativeStructureAbsent: remainingInsufficient.filter((claim) => !nativeClaimIds.has(claim.claimId)).length,
      nativeStructurePresentAtomicGroundingGap: groundingGaps.length,
      atomicGroundingPresentCandidateProjectionGap: candidateProjectionGaps.length,
      candidateProposedValidatorReject: nativeRejectedClaimIds.size,
      crossClaimProofMissing: nativeRelations.some((relation) => relation.kind === "policy-response" && relation.episodeId.includes("04-black-death")) ? 0 : 1,
      taxonomyGap: 0,
      unresolvedParticipant: unresolvedParticipantCount,
    },
    phase26MissClassification: {
      nativeStructureAbsent: 61,
      nativeStructurePresentAtomicGroundingGap: 0,
      atomicGroundingPresentCandidateProjectionGap: 12,
      candidateProposedValidatorReject: 0,
      crossClaimProofMissing: 1,
      taxonomyGap: 0,
      unresolvedParticipant: 0,
    },
    phase27MissClassification: {
      nativeStructureAbsent: 60,
      nativeStructurePresentAtomicGroundingGap: 0,
      atomicGroundingPresentCandidateProjectionGap: 16,
      candidateProposedValidatorReject: 0,
      crossClaimProofMissing: 1,
      taxonomyGap: 0,
      unresolvedParticipant: 0,
    },
    invariants,
  };
}
