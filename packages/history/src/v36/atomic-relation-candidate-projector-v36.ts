import {
  atomicPropositionSchemaV36,
  type AtomicAssertionStatusV36,
  type AtomicConceptRefV36,
  type AtomicPropositionV36,
  type AtomicSourceSpanV36,
} from "./atomic-claim-grounding-v36.js";
import {
  entityIdV36,
  type ConceptRefV36,
  type GroundedRelationPropositionV36,
} from "./explanatory-relation-v36.js";

export const HISTORY_V36_ATOMIC_PROCESS_CANDIDATE_RULE =
  "atomic-process-sequence-candidate.v1" as const;
export const HISTORY_V36_ATOMIC_TEMPORAL_CANDIDATE_RULE =
  "atomic-precedes-temporal-candidate.v1" as const;
export const HISTORY_V36_ATOMIC_TRANSFORMS_CAUSAL_CANDIDATE_RULE =
  "atomic-transforms-causal-candidate.v1" as const;

export type AtomicRelationCandidateSourceV36 =
  | "atomic-process-projection"
  | "atomic-temporal-projection"
  | "atomic-transforms-causal-projection";

export type AtomicRelationCandidateProjectionRuleV36 =
  | typeof HISTORY_V36_ATOMIC_PROCESS_CANDIDATE_RULE
  | typeof HISTORY_V36_ATOMIC_TEMPORAL_CANDIDATE_RULE
  | typeof HISTORY_V36_ATOMIC_TRANSFORMS_CAUSAL_CANDIDATE_RULE;

export type AtomicRelationCandidateProjectionDiagnosticCodeV36 =
  | "ATOMIC_CANDIDATE_STRUCTURE_INVALID"
  | "ATOMIC_CANDIDATE_ASSERTION_UNREPRESENTABLE"
  | "ATOMIC_CANDIDATE_STRUCTURED_LINEAGE_MISSING"
  | "ATOMIC_CANDIDATE_SOURCE_LINEAGE_UNSUPPORTED"
  | "ATOMIC_CANDIDATE_PARTICIPANT_UNRESOLVED";

export interface AtomicRelationCandidateProjectionDiagnosticV36 {
  readonly code: AtomicRelationCandidateProjectionDiagnosticCodeV36;
  readonly message: string;
  readonly affectedIds: readonly string[];
}

export interface ProcessGroupingMetadataV36 {
  readonly participantId: string;
  readonly label: string;
  readonly treatment:
    | "source-backed-participant"
    | "non-authoritative-grouping-metadata";
}

interface AtomicRelationCandidateProjectionCommonV36 {
  readonly episodeId: string;
  readonly supportClaimIds: readonly [string];
  readonly atomicGroundingIds: readonly [string];
  readonly structuredPropositionIds: readonly [string];
  readonly projectionRuleId: AtomicRelationCandidateProjectionRuleV36;
  readonly candidateSource: AtomicRelationCandidateSourceV36;
  readonly assertionStatus: AtomicAssertionStatusV36;
  readonly sourceSpan: AtomicSourceSpanV36;
  /** Ordered IDs are retained even when the frozen relation contract identifies claim concepts by label. */
  readonly semanticParticipantIds: readonly [string, string, ...string[]];
}

export interface ProjectedAtomicRelationCandidateV36
  extends AtomicRelationCandidateProjectionCommonV36 {
  readonly status: "projected";
  readonly proposition: GroundedRelationPropositionV36;
  readonly processGrouping?: ProcessGroupingMetadataV36;
  readonly diagnostics: readonly [];
}

export interface RejectedAtomicRelationCandidateProjectionV36 {
  readonly status: "rejected";
  readonly candidateSource: AtomicRelationCandidateSourceV36;
  readonly projectionRuleId: AtomicRelationCandidateProjectionRuleV36;
  readonly diagnostics: readonly AtomicRelationCandidateProjectionDiagnosticV36[];
}

export type AtomicRelationCandidateProjectionResultV36 =
  | ProjectedAtomicRelationCandidateV36
  | RejectedAtomicRelationCandidateProjectionV36;

function relationConcept(ref: AtomicConceptRefV36): ConceptRefV36 {
  return ref.kind === "entity"
    ? { canonicalLabel: ref.label, entityId: entityIdV36(ref.id) }
    : { canonicalLabel: ref.label };
}

function projectionIdentity(predicate: "process-sequence" | "precedes" | "transforms") {
  return predicate === "process-sequence"
    ? {
        candidateSource: "atomic-process-projection" as const,
        projectionRuleId: HISTORY_V36_ATOMIC_PROCESS_CANDIDATE_RULE,
      }
    : predicate === "precedes"
      ? {
        candidateSource: "atomic-temporal-projection" as const,
        projectionRuleId: HISTORY_V36_ATOMIC_TEMPORAL_CANDIDATE_RULE,
      }
      : {
          candidateSource: "atomic-transforms-causal-projection" as const,
          projectionRuleId: HISTORY_V36_ATOMIC_TRANSFORMS_CAUSAL_CANDIDATE_RULE,
        };
}

function rejected(
  predicate: "process-sequence" | "precedes" | "transforms",
  code: AtomicRelationCandidateProjectionDiagnosticCodeV36,
  message: string,
  affectedIds: readonly string[] = []
): RejectedAtomicRelationCandidateProjectionV36 {
  return {
    status: "rejected",
    ...projectionIdentity(predicate),
    diagnostics: [{ code, message, affectedIds }],
  };
}

function groupingTreatment(proposition: AtomicPropositionV36): ProcessGroupingMetadataV36 {
  const sourceBacked = proposition.sourceSpan.text
    .toLocaleLowerCase()
    .includes(proposition.subject.label.toLocaleLowerCase());
  return {
    participantId: proposition.subject.id,
    label: proposition.subject.label,
    treatment: sourceBacked
      ? "source-backed-participant"
      : "non-authoritative-grouping-metadata",
  };
}

/**
 * Claim-local Phase 2.8 lowering for the two explicitly authorized atomic forms.
 * It neither parses prose nor creates, validates, or approves a relation.
 */
export function projectAtomicRelationCandidateV36(
  input: unknown
): AtomicRelationCandidateProjectionResultV36 | undefined {
  if (!input || typeof input !== "object") return undefined;
  const predicate = (input as { readonly predicate?: unknown }).predicate;
  if (predicate !== "process-sequence" && predicate !== "precedes" && predicate !== "transforms") return undefined;
  const identity = projectionIdentity(predicate);
  const parsed = atomicPropositionSchemaV36.safeParse(input);
  if (!parsed.success) {
    return rejected(
      predicate,
      "ATOMIC_CANDIDATE_STRUCTURE_INVALID",
      "Atomic process/temporal structure does not satisfy the accepted grounding contract."
    );
  }
  const proposition = parsed.data as unknown as AtomicPropositionV36;
  if (predicate === "transforms" && proposition.provenance.sourceKind !== "native-structured-proposition") {
    return rejected(
      predicate,
      "ATOMIC_CANDIDATE_SOURCE_LINEAGE_UNSUPPORTED",
      "Phase 2.10 transforms causal projection is restricted to the approved native structured-proposition lineage.",
      [proposition.groundingId]
    );
  }
  if (proposition.assertionStatus !== "asserted") {
    return rejected(
      predicate,
      "ATOMIC_CANDIDATE_ASSERTION_UNREPRESENTABLE",
      `The current relation contract cannot preserve ${proposition.assertionStatus} assertion semantics.`,
      [proposition.groundingId]
    );
  }
  const structuredPropositionId = proposition.provenance.structuredPropositionId;
  if (!structuredPropositionId) {
    return rejected(
      predicate,
      "ATOMIC_CANDIDATE_STRUCTURED_LINEAGE_MISSING",
      "Direct process/temporal projection requires exact structured-proposition lineage.",
      [proposition.groundingId]
    );
  }
  if (predicate === "transforms" && (!proposition.object ||
    proposition.subject.id === proposition.object.id ||
    !proposition.provenance.resolvedParticipantIds.includes(proposition.subject.id) ||
    !proposition.provenance.resolvedParticipantIds.includes(proposition.object.id))) {
    return rejected(
      predicate,
      "ATOMIC_CANDIDATE_PARTICIPANT_UNRESOLVED",
      "Direct transforms causal projection requires distinct resolved subject and object participants.",
      [proposition.groundingId]
    );
  }

  const common = {
    status: "projected" as const,
    ...identity,
    episodeId: proposition.episodeId,
    supportClaimIds: [proposition.claimId] as const,
    atomicGroundingIds: [proposition.groundingId] as const,
    structuredPropositionIds: [structuredPropositionId] as const,
    assertionStatus: proposition.assertionStatus,
    sourceSpan: proposition.sourceSpan,
    diagnostics: [] as const,
  };

  if (predicate === "process-sequence") {
    const steps = [...proposition.processSteps!]
      .sort((left, right) => left.stepOrder - right.stepOrder);
    return {
      ...common,
      semanticParticipantIds: steps.map((step) => step.participant.id) as unknown as [string, string, ...string[]],
      proposition: {
        kind: "process",
        steps: steps.map((step) => relationConcept(step.participant)) as [ConceptRefV36, ConceptRefV36, ...ConceptRefV36[]],
      },
      processGrouping: groupingTreatment(proposition),
    };
  }

  if (predicate === "transforms") {
    return {
      ...common,
      semanticParticipantIds: [proposition.subject.id, proposition.object!.id],
      proposition: {
        kind: "causal",
        cause: relationConcept(proposition.subject),
        effect: relationConcept(proposition.object!),
      },
    };
  }

  return {
    ...common,
    semanticParticipantIds: [proposition.subject.id, proposition.object!.id],
    proposition: {
      kind: "temporal-sequence",
      steps: [relationConcept(proposition.subject), relationConcept(proposition.object!)],
    },
  };
}
