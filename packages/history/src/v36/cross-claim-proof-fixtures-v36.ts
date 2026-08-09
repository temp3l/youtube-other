import { createHash } from "node:crypto";

import type { AtomicPropositionV36 } from "./atomic-claim-grounding-v36.js";
import {
  crossClaimProofIdV36,
  type CrossClaimProofV36,
} from "./cross-claim-proof-v36.js";
import type { StructuredPropositionV36 } from "./structured-claim-v36.js";

export const approvedCrossClaimGapIdV36 = "candidate-gap-claim-095a61f563fa2980b636c6cc" as const;
export const approvedCrossClaimConditionClaimIdV36 = "claim-ee76bea77004b9d801b6630b" as const;
export const approvedCrossClaimResponseClaimIdV36 = "claim-095a61f563fa2980b636c6cc" as const;

const rationale = "The atom supplies an attempted response but no explicit condition. The required labor-pressure condition is in another claim.";
const rationaleHash = createHash("sha256").update(rationale).digest("hex");

function required<T>(value: T | undefined, description: string): T { if (!value) throw new Error(`Approved cross-claim fixture missing ${description}.`); return value; }
function binding(proposition: StructuredPropositionV36, role: "target" | "action") {
  const participant = required(proposition.roles.find((item) => item.role === role)?.participant, role);
  if (participant.binding.kind === "unresolved" || !participant.binding.referenceId) throw new Error(`Approved fixture ${role} must be resolved.`);
  return { participantId: participant.binding.referenceId, semanticRole: role, bindingKind: participant.binding.kind, resolved: true as const };
}

/** Explicit inventory-approved construction; it never discovers or enumerates claim pairs. */
export function constructApprovedCrossClaimProofV36(input: {
  readonly conditionAtomic: AtomicPropositionV36;
  readonly conditionStructured: StructuredPropositionV36;
  readonly responseAtomic: AtomicPropositionV36;
  readonly responseStructured: StructuredPropositionV36;
}): CrossClaimProofV36 {
  const { conditionAtomic, conditionStructured, responseAtomic, responseStructured } = input;
  if (conditionAtomic.claimId !== approvedCrossClaimConditionClaimIdV36 || responseAtomic.claimId !== approvedCrossClaimResponseClaimIdV36) throw new Error("Only the approved Phase 2.9 premise set may be constructed.");
  if (conditionAtomic.predicate !== "demands" || conditionAtomic.assertionStatus !== "uncertain" || responseAtomic.predicate !== "restricts" || responseAtomic.assertionStatus !== "attempted") throw new Error("Approved premise semantics no longer match the bounded proof pattern.");
  const conditionBinding = binding(conditionStructured, "target");
  const responseBinding = binding(responseStructured, "action");
  const draft: Omit<CrossClaimProofV36, "proofId"> = {
    schemaVersion: "history-cross-claim-proof.v1" as const,
    proofPattern: "uncertain-demand-attempted-restriction-policy-response" as const,
    episodeId: conditionAtomic.episodeId,
    premises: [
      { premiseId: "condition", episodeId: conditionAtomic.episodeId, claimId: conditionAtomic.claimId, structuredPropositionId: conditionStructured.propositionId, atomicGroundingId: conditionAtomic.groundingId, semanticRoleInProof: "condition", atomicPredicate: "demands", assertionStatus: "uncertain", participantBindings: [conditionBinding], sourceSpan: conditionAtomic.sourceSpan, sourceHash: conditionAtomic.sourceSpan.textHash },
      { premiseId: "response", episodeId: responseAtomic.episodeId, claimId: responseAtomic.claimId, structuredPropositionId: responseStructured.propositionId, atomicGroundingId: responseAtomic.groundingId, semanticRoleInProof: "response", atomicPredicate: "restricts", assertionStatus: "attempted", participantBindings: [responseBinding], sourceSpan: responseAtomic.sourceSpan, sourceHash: responseAtomic.sourceSpan.textHash },
    ],
    participantJoins: [{ leftPremise: "condition" as const, leftParticipant: conditionBinding.participantId, rightPremise: "response" as const, rightParticipant: responseBinding.participantId, joinType: "EXPLICIT_TYPED_DEPENDENCY" as const, dependencyId: "inventory-approved-wage-pressure-to-restriction.v1" as const }],
    targetRelationKind: "policy-response" as const,
    direction: "condition-to-response" as const,
    proofScope: "inventory-approved-explicit-premise-set" as const,
    constructionMethod: "approved-cross-claim-fixture" as const,
    provenance: { gapId: approvedCrossClaimGapIdV36, inventoryClassification: "NEEDS_CROSS_CLAIM_PROOF" as const, inventoryRationaleHash: rationaleHash, participantBindingIds: [conditionBinding.participantId, responseBinding.participantId] },
    diagnostics: [],
  };
  return { ...draft, proofId: crossClaimProofIdV36(draft) };
}
