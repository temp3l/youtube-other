import type { HistoryResearchCostConfigV33 } from "./history-research-cost-config-v33.js";
import type {
  ClaimEvidenceAssessmentV3_3,
  ClaimV3_3,
} from "./history-research-v33.js";

export type EscalationReasonV3_3 =
  | "schema_validation_failures"
  | "claim_alignment_ambiguous"
  | "multiple_causal_claims"
  | "evidence_assessment_conflict"
  | "contested_claim"
  | "partial_support_material"
  | "contradictory_evidence"
  | "wide_range_estimate"
  | "unresolved_map_or_diagram"
  | "low_confidence_material"
  | "deterministic_validation_rejected";

export interface EscalationDecisionV3_3 {
  readonly escalate: boolean;
  readonly reasons: readonly EscalationReasonV3_3[];
  readonly claimId: string | null;
}

export interface EscalationAuditRecordV3_3 {
  readonly claimId: string | null;
  readonly operation: string;
  readonly primaryModel: string;
  readonly primaryResultHash: string | null;
  readonly escalationModel: string;
  readonly reasons: readonly EscalationReasonV3_3[];
  readonly escalationUsage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cachedInputTokens: number;
  } | null;
  readonly finalSelected: "primary" | "escalation";
}

const confidenceFromAssessment = (
  assessment: ClaimEvidenceAssessmentV3_3
): number => assessment.confidence;

/**
 * Deterministic escalation policy. Ordinary clear support never escalates.
 * Escalation cannot authorize approval — provenance stays deterministic.
 */
export function decideEvidenceEscalationV33(input: {
  readonly config: Pick<
    HistoryResearchCostConfigV33,
    "enableEscalation" | "escalationConfidenceThreshold"
  >;
  readonly claim: ClaimV3_3;
  readonly assessments: readonly ClaimEvidenceAssessmentV3_3[];
  readonly schemaValidationFailures?: number;
  readonly deterministicValidationRejected?: boolean;
  readonly mapOrDiagramUnresolved?: boolean;
}): EscalationDecisionV3_3 {
  if (!input.config.enableEscalation)
    return { escalate: false, reasons: [], claimId: input.claim.id };

  const reasons: EscalationReasonV3_3[] = [];
  if ((input.schemaValidationFailures ?? 0) >= 2)
    reasons.push("schema_validation_failures");
  if (input.deterministicValidationRejected)
    reasons.push("deterministic_validation_rejected");
  if (input.mapOrDiagramUnresolved) reasons.push("unresolved_map_or_diagram");

  const assessments = input.assessments.filter(
    (item) => item.claimId === input.claim.id
  );
  const supports = assessments.filter((item) => item.assessment === "supports");
  const partial = assessments.filter(
    (item) => item.assessment === "partially_supports"
  );
  const contradicts = assessments.filter(
    (item) => item.assessment === "contradicts"
  );
  const ambiguous = assessments.filter(
    (item) => item.assessment === "ambiguous"
  );

  if (supports.length && contradicts.length)
    reasons.push("evidence_assessment_conflict");
  if (contradicts.length && input.claim.material)
    reasons.push("contested_claim");
  if (partial.length && input.claim.material)
    reasons.push("partial_support_material");
  if (ambiguous.length) reasons.push("claim_alignment_ambiguous");

  const hasDateConflict =
    assessments.some((item) => item.temporalAlignment === "misaligned") &&
    assessments.some((item) => item.temporalAlignment === "aligned");
  const hasEntityConflict =
    assessments.some((item) => item.entityAlignment === "misaligned") &&
    assessments.some((item) => item.entityAlignment === "aligned");
  const hasQuantityConflict =
    assessments.some((item) =>
      item.contradictionAspects.some((aspect) =>
        /quantity|number|amount|range/iu.test(aspect)
      )
    ) ||
    (input.claim.claimKind === "quantity" &&
      /(?:\d+\s*[-–]\s*\d+)|(?:between\s+\d+)/iu.test(
        input.claim.normalizedProposition
      ));
  if (hasDateConflict || hasEntityConflict || hasQuantityConflict)
    reasons.push("contradictory_evidence");
  if (
    input.claim.claimKind === "quantity" &&
    /(?:\d+\s*[-–]\s*\d+)|(?:between\s+\d+\s+and\s+\d+)/iu.test(
      input.claim.normalizedProposition
    )
  )
    reasons.push("wide_range_estimate");

  if (
    input.claim.material &&
    assessments.some(
      (item) =>
        confidenceFromAssessment(item) <
        input.config.escalationConfidenceThreshold
    )
  )
    reasons.push("low_confidence_material");

  if (
    input.claim.claimKind === "causal" &&
    / and |; /.test(input.claim.normalizedProposition)
  )
    reasons.push("multiple_causal_claims");

  // Do not escalate ordinary clear single-source factual support.
  if (
    reasons.length === 0 ||
    (supports.length >= 1 &&
      contradicts.length === 0 &&
      partial.length === 0 &&
      ambiguous.length === 0 &&
      !input.claim.material &&
      reasons.every(
        (reason) =>
          reason === "low_confidence_material" ||
          reason === "wide_range_estimate"
      ))
  ) {
    const materialHard = reasons.filter(
      (reason) =>
        reason !== "wide_range_estimate" || input.claim.material
    );
    if (!input.claim.material && materialHard.length === 0)
      return { escalate: false, reasons: [], claimId: input.claim.id };
  }

  const unique = [...new Set(reasons)];
  return {
    escalate: unique.length > 0,
    reasons: unique,
    claimId: input.claim.id,
  };
}

export function shouldEscalateOrdinaryExtractionV33(): boolean {
  // Ordinary entity extraction and clear single-claim batches never escalate.
  return false;
}
