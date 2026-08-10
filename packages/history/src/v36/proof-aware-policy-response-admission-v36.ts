import {
  approvedCrossClaimConditionClaimIdV36,
  approvedCrossClaimResponseClaimIdV36,
  constructApprovedCrossClaimProofV36,
} from "./cross-claim-proof-fixtures-v36.js";
import type { RepresentativeShadowExtractionResultV36 } from "./representative-shadow-extraction-v36.js";
import {
  constructProofAwarePolicyResponseRelationV36,
  constructRelationProofEvidenceV36,
  validateProofAwarePolicyResponseRelationV36,
  type ProofAwarePolicyResponseRelationV36,
} from "./relation-proof-evidence-v36.js";

export const HISTORY_PROOF_AWARE_POLICY_RESPONSE_ADMISSION_V36 = "history-proof-aware-policy-response-admission.v1" as const;

export type ProofAwarePolicyResponseAdmissionV36 =
  | { readonly status: "admitted"; readonly version: typeof HISTORY_PROOF_AWARE_POLICY_RESPONSE_ADMISSION_V36; readonly value: ProofAwarePolicyResponseRelationV36 }
  | { readonly status: "rejected"; readonly version: typeof HISTORY_PROOF_AWARE_POLICY_RESPONSE_ADMISSION_V36; readonly reason: string };

/**
 * Bounded admission for the one inventory-approved proof. This never searches
 * claim pairs: it asks only for the exact two validated proof premises.
 */
export function admitProofAwarePolicyResponseV36(
  native: RepresentativeShadowExtractionResultV36
): ProofAwarePolicyResponseAdmissionV36 {
  if (!native.episodeId.includes("04-black-death")) return { status: "rejected", version: HISTORY_PROOF_AWARE_POLICY_RESPONSE_ADMISSION_V36, reason: "No approved proof exists for this episode." };
  const atom = (claimId: string) => native.grounding.propositions.find((item) => item.claimId === claimId);
  const proposition = (claimId: string) => native.structuredClaims.envelopes.find((item) => item.claimId === claimId)?.propositions[0];
  const conditionAtom = atom(approvedCrossClaimConditionClaimIdV36);
  const responseAtom = atom(approvedCrossClaimResponseClaimIdV36);
  const conditionProposition = proposition(approvedCrossClaimConditionClaimIdV36);
  const responseProposition = proposition(approvedCrossClaimResponseClaimIdV36);
  if (!conditionAtom || !responseAtom || !conditionProposition || !responseProposition) return { status: "rejected", version: HISTORY_PROOF_AWARE_POLICY_RESPONSE_ADMISSION_V36, reason: "Approved proof premise lineage is missing." };
  try {
    const proof = constructApprovedCrossClaimProofV36({ conditionAtomic: conditionAtom, conditionStructured: conditionProposition, responseAtomic: responseAtom, responseStructured: responseProposition });
    const proofEvidence = constructRelationProofEvidenceV36(proof);
    const propositionLabel = (proposition: typeof conditionProposition, participantId: string) =>
      proposition.roles.find((role) => role.participant.binding.referenceId === participantId)?.participant.label;
    const conditionLabel = propositionLabel(conditionProposition, proofEvidence.premises[0].participantId);
    const responseLabel = propositionLabel(responseProposition, proofEvidence.premises[1].participantId);
    if (!conditionLabel || !responseLabel) return { status: "rejected", version: HISTORY_PROOF_AWARE_POLICY_RESPONSE_ADMISSION_V36, reason: "Proof participants are not resolved in their validated structured premises." };
    const value = constructProofAwarePolicyResponseRelationV36({ proofEvidence, conditionLabel, responseLabel });
    const validation = validateProofAwarePolicyResponseRelationV36(value);
    if (!validation.valid) return { status: "rejected", version: HISTORY_PROOF_AWARE_POLICY_RESPONSE_ADMISSION_V36, reason: validation.diagnostics.join(",") };
    if (value.relation.supportClaimIds.some((claimId) => !native.claims.some((claim) => claim.id === claimId))) return { status: "rejected", version: HISTORY_PROOF_AWARE_POLICY_RESPONSE_ADMISSION_V36, reason: "Relation support claims are not episode-local." };
    return { status: "admitted", version: HISTORY_PROOF_AWARE_POLICY_RESPONSE_ADMISSION_V36, value };
  } catch (error) {
    return { status: "rejected", version: HISTORY_PROOF_AWARE_POLICY_RESPONSE_ADMISSION_V36, reason: error instanceof Error ? error.message : "Proof admission failed." };
  }
}
