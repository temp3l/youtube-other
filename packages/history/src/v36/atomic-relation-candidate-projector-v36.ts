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
export const HISTORY_V36_ATOMIC_EVIDENCE_SET_CANDIDATE_RULE =
  "atomic-contains-evidence-of-evidence-set-candidate.v1" as const;
export const HISTORY_V36_APPROVED_MODAL_CAUSAL_CANDIDATE_RULE =
  "atomic-approved-modal-causal-candidate.v1" as const;

export type AtomicRelationCandidateSourceV36 =
  | "atomic-process-projection"
  | "atomic-temporal-projection"
  | "atomic-transforms-causal-projection"
  | "atomic-evidence-set-projection"
  | "atomic-approved-modal-causal-projection";

export type AtomicRelationCandidateProjectionRuleV36 =
  | typeof HISTORY_V36_ATOMIC_PROCESS_CANDIDATE_RULE
  | typeof HISTORY_V36_ATOMIC_TEMPORAL_CANDIDATE_RULE
  | typeof HISTORY_V36_ATOMIC_TRANSFORMS_CAUSAL_CANDIDATE_RULE
  | typeof HISTORY_V36_ATOMIC_EVIDENCE_SET_CANDIDATE_RULE
  | typeof HISTORY_V36_APPROVED_MODAL_CAUSAL_CANDIDATE_RULE;

export type AtomicRelationCandidateProjectionDiagnosticCodeV36 =
  | "ATOMIC_CANDIDATE_STRUCTURE_INVALID"
  | "ATOMIC_CANDIDATE_ASSERTION_UNREPRESENTABLE"
  | "ATOMIC_CANDIDATE_STRUCTURED_LINEAGE_MISSING"
  | "ATOMIC_CANDIDATE_SOURCE_LINEAGE_UNSUPPORTED"
  | "ATOMIC_CANDIDATE_PARTICIPANT_UNRESOLVED"
  | "ATOMIC_CANDIDATE_GROUP_BOUNDARY_MISMATCH"
  | "ATOMIC_CANDIDATE_INSUFFICIENT_CARDINALITY";

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
  readonly atomicGroundingIds: readonly [string, ...string[]];
  readonly structuredPropositionIds: readonly [string, ...string[]];
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

const evidenceSetIdentity = {
  candidateSource: "atomic-evidence-set-projection" as const,
  projectionRuleId: HISTORY_V36_ATOMIC_EVIDENCE_SET_CANDIDATE_RULE,
};

function rejectedEvidenceSet(
  code: AtomicRelationCandidateProjectionDiagnosticCodeV36,
  message: string,
  affectedIds: readonly string[] = []
): RejectedAtomicRelationCandidateProjectionV36 {
  return {
    status: "rejected",
    ...evidenceSetIdentity,
    diagnostics: [{ code, message, affectedIds: [...affectedIds].sort((left, right) => left.localeCompare(right)) }],
  };
}

function exactSpanKey(span: AtomicSourceSpanV36): string {
  return JSON.stringify({
    startUtf16: span.startUtf16,
    endUtf16Exclusive: span.endUtf16Exclusive,
    text: span.text,
    textHash: span.textHash,
  });
}

function exactParticipantKey(participant: AtomicConceptRefV36): string {
  return JSON.stringify({ id: participant.id, label: participant.label, kind: participant.kind });
}

/**
 * Phase 2.12 same-assertion aggregation. The caller supplies one prospective
 * group; this function never searches prose, adjacent claims, or other spans.
 */
export function projectAtomicEvidenceSetCandidateV36(
  input: unknown
): AtomicRelationCandidateProjectionResultV36 | undefined {
  if (!Array.isArray(input) || input.length === 0) return undefined;
  if (!input.some((item) => item && typeof item === "object" &&
    (item as { readonly predicate?: unknown }).predicate === "contains-evidence-of")) return undefined;

  const parsed = input.map((item) => atomicPropositionSchemaV36.safeParse(item));
  if (parsed.some((result) => !result.success)) {
    return rejectedEvidenceSet(
      "ATOMIC_CANDIDATE_STRUCTURE_INVALID",
      "Every evidence-set input must satisfy the accepted atomic grounding contract."
    );
  }
  const atoms = parsed.map((result) => result.data as unknown as AtomicPropositionV36);
  const affectedIds = atoms.map((atom) => atom.groundingId);
  if (atoms.some((atom) => atom.predicate !== "contains-evidence-of" || !atom.object)) {
    return rejectedEvidenceSet(
      "ATOMIC_CANDIDATE_STRUCTURE_INVALID",
      "Evidence-set aggregation accepts only contains-evidence-of(target, item) atoms.",
      affectedIds
    );
  }
  if (atoms.some((atom) => atom.assertionStatus !== "asserted")) {
    return rejectedEvidenceSet(
      "ATOMIC_CANDIDATE_ASSERTION_UNREPRESENTABLE",
      "Every evidence-set member must be asserted; modality is never promoted.",
      affectedIds
    );
  }
  if (atoms.some((atom) => atom.provenance.sourceKind !== "native-structured-proposition")) {
    return rejectedEvidenceSet(
      "ATOMIC_CANDIDATE_SOURCE_LINEAGE_UNSUPPORTED",
      "Phase 2.12 evidence-set aggregation is restricted to native structured-proposition lineage.",
      affectedIds
    );
  }
  if (atoms.some((atom) => !atom.provenance.structuredPropositionId)) {
    return rejectedEvidenceSet(
      "ATOMIC_CANDIDATE_STRUCTURED_LINEAGE_MISSING",
      "Every evidence-set member must retain its structured-proposition lineage.",
      affectedIds
    );
  }

  const first = atoms[0]!;
  const groupKey = JSON.stringify({
    episodeId: first.episodeId,
    claimId: first.claimId,
    sourceSpan: exactSpanKey(first.sourceSpan),
    target: exactParticipantKey(first.subject),
  });
  if (atoms.some((atom) => JSON.stringify({
    episodeId: atom.episodeId,
    claimId: atom.claimId,
    sourceSpan: exactSpanKey(atom.sourceSpan),
    target: exactParticipantKey(atom.subject),
  }) !== groupKey)) {
    return rejectedEvidenceSet(
      "ATOMIC_CANDIDATE_GROUP_BOUNDARY_MISMATCH",
      "Evidence-set members must share one episode, claim, exact source span/hash, and resolved target.",
      affectedIds
    );
  }
  if (atoms.some((atom) => {
    const resolved = new Set(atom.provenance.resolvedParticipantIds);
    return !atom.object || atom.subject.id === atom.object.id ||
      !resolved.has(atom.subject.id) || !resolved.has(atom.object.id);
  })) {
    return rejectedEvidenceSet(
      "ATOMIC_CANDIDATE_PARTICIPANT_UNRESOLVED",
      "Evidence-set aggregation requires a resolved target and distinct resolved evidence member on every atom.",
      affectedIds
    );
  }

  const canonicalAtoms = [...atoms].sort((left, right) =>
    left.groundingId.localeCompare(right.groundingId));
  const memberById = new Map<string, AtomicConceptRefV36>();
  for (const atom of canonicalAtoms) {
    const existing = memberById.get(atom.object!.id);
    if (existing && exactParticipantKey(existing) !== exactParticipantKey(atom.object!)) {
      return rejectedEvidenceSet(
        "ATOMIC_CANDIDATE_PARTICIPANT_UNRESOLVED",
        "One canonical evidence-member ID cannot carry conflicting participant bindings.",
        affectedIds
      );
    }
    memberById.set(atom.object!.id, atom.object!);
  }
  const members = [...memberById.values()].sort((left, right) =>
    left.id.localeCompare(right.id));
  if (members.length < 2) {
    return rejectedEvidenceSet(
      "ATOMIC_CANDIDATE_INSUFFICIENT_CARDINALITY",
      "Evidence-set aggregation requires at least two distinct resolved evidence members after duplicate collapse.",
      affectedIds
    );
  }
  const atomicGroundingIds = canonicalAtoms.map((atom) => atom.groundingId) as unknown as [string, ...string[]];
  const structuredPropositionIds = [...new Set(canonicalAtoms.map((atom) =>
    atom.provenance.structuredPropositionId!))]
    .sort((left, right) => left.localeCompare(right)) as [string, ...string[]];
  const memberIds = members.map((member) => member.id);
  return {
    status: "projected",
    ...evidenceSetIdentity,
    episodeId: first.episodeId,
    supportClaimIds: [first.claimId],
    atomicGroundingIds,
    structuredPropositionIds,
    assertionStatus: "asserted",
    sourceSpan: first.sourceSpan,
    semanticParticipantIds: [first.subject.id, ...memberIds] as unknown as [string, string, ...string[]],
    proposition: {
      kind: "evidence-set",
      subject: relationConcept(first.subject),
      evidence: members.map(relationConcept) as [ConceptRefV36, ConceptRefV36, ...ConceptRefV36[]],
    },
    diagnostics: [],
  };
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
  if (predicate === "causes" || predicate === "contributes-to") {
    return projectApprovedModalCausalCandidateV36(input);
  }
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

const approvedModalCausalAtoms: ReadonlyMap<string, {
  readonly predicate: "causes" | "contributes-to";
  readonly assertionStatus: "uncertain" | "reported";
}> = new Map([
  ["claim-d97c2dd1d2ef4a18aeb04406", { predicate: "contributes-to", assertionStatus: "uncertain" }],
  ["claim-db26077e95258cfa59dfab83", { predicate: "causes", assertionStatus: "reported" }],
] as const);

/**
 * Phase 2.19 is an exact inventory-backed admission, not a generic lowering
 * rule: only the two reviewed native atoms may become modal causal relations.
 */
function projectApprovedModalCausalCandidateV36(
  input: unknown
): AtomicRelationCandidateProjectionResultV36 | undefined {
  const parsed = atomicPropositionSchemaV36.safeParse(input);
  if (!parsed.success) return undefined;
  const proposition = parsed.data as unknown as AtomicPropositionV36;
  const approved = approvedModalCausalAtoms.get(proposition.claimId);
  if (!approved || proposition.predicate !== approved.predicate ||
    proposition.assertionStatus !== approved.assertionStatus) return undefined;
  if (proposition.provenance.sourceKind !== "native-structured-proposition" ||
    !proposition.provenance.structuredPropositionId || !proposition.object ||
    proposition.subject.id === proposition.object.id ||
    !proposition.provenance.resolvedParticipantIds.includes(proposition.subject.id) ||
    !proposition.provenance.resolvedParticipantIds.includes(proposition.object.id)) return undefined;
  return {
    status: "projected",
    candidateSource: "atomic-approved-modal-causal-projection",
    projectionRuleId: HISTORY_V36_APPROVED_MODAL_CAUSAL_CANDIDATE_RULE,
    episodeId: proposition.episodeId,
    supportClaimIds: [proposition.claimId],
    atomicGroundingIds: [proposition.groundingId],
    structuredPropositionIds: [proposition.provenance.structuredPropositionId],
    assertionStatus: proposition.assertionStatus,
    sourceSpan: proposition.sourceSpan,
    semanticParticipantIds: [proposition.subject.id, proposition.object.id],
    proposition: {
      kind: "causal",
      cause: relationConcept(proposition.subject),
      effect: relationConcept(proposition.object),
      causalAssertionStatus: proposition.assertionStatus,
    },
    diagnostics: [],
  };
}
