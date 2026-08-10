import { createHash } from "node:crypto";

import { z } from "zod";

import {
  crossClaimProofEvidenceFingerprintV36,
  crossClaimProofPatternValuesV36,
  validateCrossClaimProofV36,
  type CrossClaimProofV36,
} from "./cross-claim-proof-v36.js";

export const HISTORY_PROOF_BACKED_POLICY_RESPONSE_CANDIDATE_V36 = "history-proof-backed-policy-response-candidate.v1" as const;
export const HISTORY_POLICY_RESPONSE_ADMISSION_V36 = "history-policy-response-admission.v1" as const;
export const HISTORY_CROSS_CLAIM_POLICY_RESPONSE_CANDIDATE_RULE_V36 = "cross-claim-uncertain-demand-attempted-restriction-policy-response-candidate.v1" as const;

const identifier = z.string().trim().min(1).max(256);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const premiseLineage = z.object({
  claimId: z.string().regex(/^claim-[a-f0-9]{24}$/u),
  structuredPropositionId: z.string().regex(/^structured-proposition-[a-f0-9]{24}$/u),
  atomicGroundingId: z.string().regex(/^grounding-[a-f0-9]{24}$/u),
  sourceSpan: z.object({ startUtf16: z.number().int().nonnegative(), endUtf16Exclusive: z.number().int().positive(), text: z.string().min(1), textHash: hash }).strict(),
}).strict();

export const proofBackedPolicyResponseCandidateSchemaV36 = z.object({
  candidateId: z.string().regex(/^proof-backed-policy-response-candidate-[a-f0-9]{24}$/u),
  candidateVersion: z.literal(HISTORY_PROOF_BACKED_POLICY_RESPONSE_CANDIDATE_V36),
  source: z.literal("validated-cross-claim-proof"),
  projectionRule: z.literal(HISTORY_CROSS_CLAIM_POLICY_RESPONSE_CANDIDATE_RULE_V36),
  episodeId: identifier,
  targetRelationKind: z.literal("policy-response"),
  crossClaimProofId: z.string().regex(/^cross-claim-proof-[a-f0-9]{24}$/u),
  proofPattern: z.enum(crossClaimProofPatternValuesV36),
  proofValidatorVersion: z.literal("history-cross-claim-proof-validator.v1"),
  proofEvidenceFingerprint: z.string().regex(/^cross-claim-proof-evidence-[a-f0-9]{24}$/u),
  condition: z.object({ participantId: identifier, assertionStatus: z.literal("uncertain"), premise: premiseLineage }).strict(),
  response: z.object({ participantId: identifier, assertionStatus: z.literal("attempted"), premise: premiseLineage }).strict(),
  direction: z.literal("condition-to-response"),
  proofJoins: z.array(z.object({ leftPremise: z.literal("condition"), leftParticipant: identifier, rightPremise: z.literal("response"), rightParticipant: identifier, joinType: z.literal("EXPLICIT_TYPED_DEPENDENCY"), dependencyId: z.literal("inventory-approved-wage-pressure-to-restriction.v1") }).strict()).length(1),
  proofLineage: z.tuple([premiseLineage, premiseLineage]),
  candidateEvidenceFingerprint: z.string().regex(/^proof-backed-policy-response-evidence-[a-f0-9]{24}$/u),
}).strict();
export type ProofBackedPolicyResponseCandidateV36 = z.infer<typeof proofBackedPolicyResponseCandidateSchemaV36>;

export const policyResponseAdmissionResultValuesV36 = ["ADMISSIBLE_LOSSLESS", "BLOCKED_MODALITY_LOSS", "BLOCKED_RELATION_CONTRACT", "BLOCKED_INVALID_PROOF", "BLOCKED_ASSERTION_INCOMPATIBLE", "BLOCKED_PARTICIPANT_OR_DIRECTION"] as const;
export type PolicyResponseAdmissionResultV36 = (typeof policyResponseAdmissionResultValuesV36)[number];
export interface PolicyResponseAdmissionAssessmentV36 { readonly version: typeof HISTORY_POLICY_RESPONSE_ADMISSION_V36; readonly compatibility: "REPRESENTABLE_ONLY_WITH_MODALITY_LOSS"; readonly result: PolicyResponseAdmissionResultV36; readonly reason: string; readonly semanticInformationAtRisk: readonly string[]; }

function digest(prefix: string, value: unknown): string { return `${prefix}-${createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24)}`; }
function premiseLineageOf(proof: CrossClaimProofV36, index: 0 | 1) {
  const premise = proof.premises[index];
  return { claimId: premise.claimId, structuredPropositionId: premise.structuredPropositionId, atomicGroundingId: premise.atomicGroundingId, sourceSpan: premise.sourceSpan };
}
function participant(proof: CrossClaimProofV36, index: 0 | 1) { return proof.premises[index].participantBindings[0]!.participantId; }

export function proofBackedPolicyResponseCandidateIdentityInputsV36(candidate: ProofBackedPolicyResponseCandidateV36) {
  return { candidateVersion: candidate.candidateVersion, projectionRule: candidate.projectionRule, episodeId: candidate.episodeId, targetRelationKind: candidate.targetRelationKind, crossClaimProofId: candidate.crossClaimProofId, proofPattern: candidate.proofPattern, conditionParticipantId: candidate.condition.participantId, responseParticipantId: candidate.response.participantId, conditionAssertionStatus: candidate.condition.assertionStatus, responseAssertionStatus: candidate.response.assertionStatus, direction: candidate.direction };
}
export function proofBackedPolicyResponseCandidateIdV36(candidate: Omit<ProofBackedPolicyResponseCandidateV36, "candidateId"> | ProofBackedPolicyResponseCandidateV36): string { return digest("proof-backed-policy-response-candidate", proofBackedPolicyResponseCandidateIdentityInputsV36(candidate as ProofBackedPolicyResponseCandidateV36)); }
export function proofBackedPolicyResponseCandidateEvidenceFingerprintV36(candidate: Omit<ProofBackedPolicyResponseCandidateV36, "candidateId" | "candidateEvidenceFingerprint"> | ProofBackedPolicyResponseCandidateV36): string {
  return digest("proof-backed-policy-response-evidence", { crossClaimProofId: candidate.crossClaimProofId, proofEvidenceFingerprint: candidate.proofEvidenceFingerprint, proofLineage: [...candidate.proofLineage].sort((left, right) => left.atomicGroundingId.localeCompare(right.atomicGroundingId)) });
}

/** The sole construction seam accepts a currently validated proof; no source claim/atom scan occurs. */
export function constructProofBackedPolicyResponseCandidateV36(proof: CrossClaimProofV36): { readonly status: "constructed"; readonly candidate: ProofBackedPolicyResponseCandidateV36 } | { readonly status: "rejected"; readonly reason: string } {
  const validation = validateCrossClaimProofV36(proof);
  if (!validation.valid) return { status: "rejected", reason: "CrossClaimProofV36 did not validate." };
  const [condition, response] = proof.premises;
  if (condition.assertionStatus !== "uncertain" || response.assertionStatus !== "attempted") return { status: "rejected", reason: "Validated proof modalities do not match the sole supported candidate rule." };
  const base: Omit<ProofBackedPolicyResponseCandidateV36, "candidateId" | "candidateEvidenceFingerprint"> = {
    candidateVersion: HISTORY_PROOF_BACKED_POLICY_RESPONSE_CANDIDATE_V36,
    source: "validated-cross-claim-proof" as const,
    projectionRule: HISTORY_CROSS_CLAIM_POLICY_RESPONSE_CANDIDATE_RULE_V36,
    episodeId: proof.episodeId,
    targetRelationKind: "policy-response" as const,
    crossClaimProofId: proof.proofId,
    proofPattern: proof.proofPattern,
    proofValidatorVersion: validation.validatorVersion,
    proofEvidenceFingerprint: crossClaimProofEvidenceFingerprintV36(proof),
    condition: { participantId: participant(proof, 0), assertionStatus: condition.assertionStatus, premise: premiseLineageOf(proof, 0) },
    response: { participantId: participant(proof, 1), assertionStatus: response.assertionStatus, premise: premiseLineageOf(proof, 1) },
    direction: proof.direction,
    proofJoins: proof.participantJoins.map((join) => ({ leftPremise: "condition" as const, leftParticipant: join.leftParticipant, rightPremise: "response" as const, rightParticipant: join.rightParticipant, joinType: "EXPLICIT_TYPED_DEPENDENCY" as const, dependencyId: "inventory-approved-wage-pressure-to-restriction.v1" as const })),
    proofLineage: [premiseLineageOf(proof, 0), premiseLineageOf(proof, 1)],
  };
  const candidateEvidenceFingerprint = proofBackedPolicyResponseCandidateEvidenceFingerprintV36(base);
  const candidateId = proofBackedPolicyResponseCandidateIdV36({ ...base, candidateEvidenceFingerprint });
  return { status: "constructed", candidate: { ...base, candidateEvidenceFingerprint, candidateId } as ProofBackedPolicyResponseCandidateV36 };
}

/** Current relation contract has no per-premise assertion/modality fields. It therefore cannot be a lossless target. */
export const policyResponseRelationCompatibilityV36 = {
  relationContractPath: "packages/history/src/v36/explanatory-relation-v36.ts",
  fields: ["episodeId", "kind", "condition", "response", "supportClaimIds", "evidenceFingerprint"],
  direction: "condition -> response",
  assertionModalityRepresentation: "none",
  classification: "REPRESENTABLE_ONLY_WITH_MODALITY_LOSS",
} as const;

/** This is intentionally not the ExplanatoryRelation validator and never returns a relation candidate. */
export function assessPolicyResponseCandidateAdmissionV36(input: unknown): PolicyResponseAdmissionAssessmentV36 {
  const parsed = proofBackedPolicyResponseCandidateSchemaV36.safeParse(input);
  if (!parsed.success) return { version: HISTORY_POLICY_RESPONSE_ADMISSION_V36, compatibility: "REPRESENTABLE_ONLY_WITH_MODALITY_LOSS", result: "BLOCKED_INVALID_PROOF", reason: "Candidate schema/proof lineage is invalid.", semanticInformationAtRisk: [] };
  const candidate = parsed.data;
  const join = candidate.proofJoins[0];
  if (!join || candidate.direction !== "condition-to-response" || join.leftParticipant !== candidate.condition.participantId || join.rightParticipant !== candidate.response.participantId) return { version: HISTORY_POLICY_RESPONSE_ADMISSION_V36, compatibility: "REPRESENTABLE_ONLY_WITH_MODALITY_LOSS", result: "BLOCKED_PARTICIPANT_OR_DIRECTION", reason: "Candidate does not retain the proof’s directed participant mapping.", semanticInformationAtRisk: [] };
  if (candidate.condition.assertionStatus !== "uncertain" || candidate.response.assertionStatus !== "attempted") return { version: HISTORY_POLICY_RESPONSE_ADMISSION_V36, compatibility: "REPRESENTABLE_ONLY_WITH_MODALITY_LOSS", result: "BLOCKED_ASSERTION_INCOMPATIBLE", reason: "Candidate modality is not the validated uncertain/attempted tuple.", semanticInformationAtRisk: [] };
  if (candidate.candidateId !== proofBackedPolicyResponseCandidateIdV36(candidate) || candidate.candidateEvidenceFingerprint !== proofBackedPolicyResponseCandidateEvidenceFingerprintV36(candidate)) return { version: HISTORY_POLICY_RESPONSE_ADMISSION_V36, compatibility: "REPRESENTABLE_ONLY_WITH_MODALITY_LOSS", result: "BLOCKED_INVALID_PROOF", reason: "Candidate identity or evidence fingerprint does not match its retained proof lineage.", semanticInformationAtRisk: [] };
  return { version: HISTORY_POLICY_RESPONSE_ADMISSION_V36, compatibility: "REPRESENTABLE_ONLY_WITH_MODALITY_LOSS", result: "BLOCKED_MODALITY_LOSS", reason: "Existing policy-response relations have no fields for uncertain condition and attempted response modalities.", semanticInformationAtRisk: ["condition assertion status: uncertain", "response assertion status: attempted", "asymmetric premise modality distinction"] };
}

export const proofBackedPolicyResponseCandidateJsonSchemaV36 = { ...z.toJSONSchema(proofBackedPolicyResponseCandidateSchemaV36), $id: "https://mediaforge.local/schemas/history/v3.6/proof-backed-policy-response-candidate-schema.json", title: "History V3.6 proof-backed policy-response candidate" };
