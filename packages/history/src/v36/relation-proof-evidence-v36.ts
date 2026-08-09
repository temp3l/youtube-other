import { createHash } from "node:crypto";

import { z } from "zod";

import {
  crossClaimProofEvidenceFingerprintV36,
  validateCrossClaimProofV36,
  type CrossClaimProofV36,
} from "./cross-claim-proof-v36.js";
import {
  claimIdV36,
  createExplanatoryRelationV36,
  entityIdV36,
  episodeIdV36,
  explanatoryRelationIdV36,
  explanatoryRelationSchemaV36,
  policyResponseAssertionSemanticsV36,
  relationEvidenceFingerprintV36,
  type PolicyResponseRelationV36,
} from "./explanatory-relation-v36.js";

export const HISTORY_RELATION_PROOF_EVIDENCE_V36 = "history-relation-proof-evidence.v1" as const;
export const HISTORY_RELATION_PROOF_EVIDENCE_VALIDATOR_V36 = "history-relation-proof-evidence-validator.v1" as const;

const identifier = z.string().trim().min(1).max(256);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const proofFingerprint = z.string().regex(/^cross-claim-proof-evidence-[a-f0-9]{24}$/u);
const bridgeFingerprint = z.string().regex(/^relation-proof-evidence-[a-f0-9]{24}$/u);
const bridgeId = z.string().regex(/^relation-proof-evidence-[a-f0-9]{24}$/u);
const premiseSchema = z.object({
  premiseId: z.enum(["condition", "response"]),
  claimId: z.string().regex(/^claim-[a-f0-9]{24}$/u),
  structuredPropositionId: z.string().regex(/^structured-proposition-[a-f0-9]{24}$/u),
  atomicGroundingId: z.string().regex(/^grounding-[a-f0-9]{24}$/u),
  assertionStatus: z.enum(["uncertain", "attempted"]),
  participantId: identifier,
  participantSemanticRole: z.enum(["target", "action"]),
  sourceSpan: z.object({
    startUtf16: z.number().int().nonnegative(),
    endUtf16Exclusive: z.number().int().positive(),
    text: z.string().min(1),
    textHash: hash,
  }).strict(),
  sourceHash: hash,
}).strict();

export const relationProofEvidenceSchemaV36 = z.object({
  evidenceId: bridgeId,
  schemaVersion: z.literal(HISTORY_RELATION_PROOF_EVIDENCE_V36),
  proofId: z.string().regex(/^cross-claim-proof-[a-f0-9]{24}$/u),
  proofPattern: z.literal("uncertain-demand-attempted-restriction-policy-response"),
  proofValidatorVersion: z.literal("history-cross-claim-proof-validator.v1"),
  proofEvidenceFingerprint: proofFingerprint,
  episodeId: identifier,
  targetRelationKind: z.literal("policy-response"),
  direction: z.literal("condition-to-response"),
  premises: z.tuple([premiseSchema, premiseSchema]),
  participantJoins: z.array(z.object({
    leftPremise: z.literal("condition"),
    leftParticipant: identifier,
    rightPremise: z.literal("response"),
    rightParticipant: identifier,
    joinType: z.literal("EXPLICIT_TYPED_DEPENDENCY"),
    dependencyId: z.literal("inventory-approved-wage-pressure-to-restriction.v1"),
  }).strict()).length(1),
  evidenceFingerprint: bridgeFingerprint,
}).strict();
export type RelationProofEvidenceV36 = z.infer<typeof relationProofEvidenceSchemaV36>;

export interface RelationProofEvidenceValidationV36 {
  readonly validatorVersion: typeof HISTORY_RELATION_PROOF_EVIDENCE_VALIDATOR_V36;
  readonly valid: boolean;
  readonly diagnostics: readonly string[];
  readonly evidence?: RelationProofEvidenceV36;
}

function digest(prefix: string, value: unknown): string {
  return `${prefix}-${createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24)}`;
}

export function relationProofEvidenceIdentityInputsV36(evidence: Omit<RelationProofEvidenceV36, "evidenceId" | "evidenceFingerprint"> | RelationProofEvidenceV36) {
  return {
    schemaVersion: evidence.schemaVersion,
    proofId: evidence.proofId,
    proofPattern: evidence.proofPattern,
    proofValidatorVersion: evidence.proofValidatorVersion,
    episodeId: evidence.episodeId,
    targetRelationKind: evidence.targetRelationKind,
    direction: evidence.direction,
    premises: evidence.premises.map((premise) => ({
      premiseId: premise.premiseId,
      claimId: premise.claimId,
      structuredPropositionId: premise.structuredPropositionId,
      atomicGroundingId: premise.atomicGroundingId,
      assertionStatus: premise.assertionStatus,
      participantId: premise.participantId,
      participantSemanticRole: premise.participantSemanticRole,
    })),
    participantJoins: evidence.participantJoins,
  };
}

export function relationProofEvidenceIdV36(evidence: Omit<RelationProofEvidenceV36, "evidenceId" | "evidenceFingerprint"> | RelationProofEvidenceV36): string {
  return digest("relation-proof-evidence", relationProofEvidenceIdentityInputsV36(evidence));
}

export function relationProofEvidenceFingerprintV36(evidence: Omit<RelationProofEvidenceV36, "evidenceId" | "evidenceFingerprint"> | RelationProofEvidenceV36): string {
  return digest("relation-proof-evidence", {
    proofEvidenceFingerprint: evidence.proofEvidenceFingerprint,
    premises: evidence.premises.map((premise) => ({
      claimId: premise.claimId,
      structuredPropositionId: premise.structuredPropositionId,
      atomicGroundingId: premise.atomicGroundingId,
      sourceSpan: premise.sourceSpan,
      sourceHash: premise.sourceHash,
    })),
    participantJoins: evidence.participantJoins,
  });
}

/** Creates bridge evidence only from the sole accepted, already validated proof. */
export function constructRelationProofEvidenceV36(proof: CrossClaimProofV36): RelationProofEvidenceV36 {
  const validation = validateCrossClaimProofV36(proof);
  if (!validation.valid || !validation.proof) throw new TypeError("Relation proof evidence requires a validated CrossClaimProofV36.");
  const validated = validation.proof;
  const base: Omit<RelationProofEvidenceV36, "evidenceId" | "evidenceFingerprint"> = {
    schemaVersion: HISTORY_RELATION_PROOF_EVIDENCE_V36,
    proofId: validated.proofId,
    proofPattern: validated.proofPattern,
    proofValidatorVersion: validation.validatorVersion,
    proofEvidenceFingerprint: crossClaimProofEvidenceFingerprintV36(validated),
    episodeId: validated.episodeId,
    targetRelationKind: validated.targetRelationKind,
    direction: validated.direction,
    premises: validated.premises.map((premise) => ({
      premiseId: premise.premiseId,
      claimId: premise.claimId,
      structuredPropositionId: premise.structuredPropositionId,
      atomicGroundingId: premise.atomicGroundingId,
      assertionStatus: premise.assertionStatus,
      participantId: premise.participantBindings[0]!.participantId,
      participantSemanticRole: premise.participantBindings[0]!.semanticRole,
      sourceSpan: premise.sourceSpan,
      sourceHash: premise.sourceHash,
    })) as RelationProofEvidenceV36["premises"],
    participantJoins: validated.participantJoins.map((join) => ({
      leftPremise: "condition" as const,
      leftParticipant: join.leftParticipant,
      rightPremise: "response" as const,
      rightParticipant: join.rightParticipant,
      joinType: "EXPLICIT_TYPED_DEPENDENCY" as const,
      dependencyId: "inventory-approved-wage-pressure-to-restriction.v1" as const,
    })),
  };
  return relationProofEvidenceSchemaV36.parse({
    ...base,
    evidenceId: relationProofEvidenceIdV36(base),
    evidenceFingerprint: relationProofEvidenceFingerprintV36(base),
  });
}

/** Fails closed without scanning claims, proximity, or source prose. */
export function validateRelationProofEvidenceV36(input: unknown): RelationProofEvidenceValidationV36 {
  const parsed = relationProofEvidenceSchemaV36.safeParse(input);
  if (!parsed.success) return { validatorVersion: HISTORY_RELATION_PROOF_EVIDENCE_VALIDATOR_V36, valid: false, diagnostics: ["RELATION_PROOF_EVIDENCE_SCHEMA_INVALID"] };
  const evidence = parsed.data;
  const diagnostics: string[] = [];
  const [condition, response] = evidence.premises;
  if (condition.premiseId !== "condition" || condition.assertionStatus !== "uncertain" || condition.participantSemanticRole !== "target") diagnostics.push("RELATION_PROOF_EVIDENCE_CONDITION_INVALID");
  if (response.premiseId !== "response" || response.assertionStatus !== "attempted" || response.participantSemanticRole !== "action") diagnostics.push("RELATION_PROOF_EVIDENCE_RESPONSE_INVALID");
  if (condition.sourceHash !== condition.sourceSpan.textHash || response.sourceHash !== response.sourceSpan.textHash) diagnostics.push("RELATION_PROOF_EVIDENCE_SOURCE_INVALID");
  const join = evidence.participantJoins[0];
  if (!join || join.leftParticipant !== condition.participantId || join.rightParticipant !== response.participantId) diagnostics.push("RELATION_PROOF_EVIDENCE_JOIN_INVALID");
  if (evidence.evidenceId !== relationProofEvidenceIdV36(evidence)) diagnostics.push("RELATION_PROOF_EVIDENCE_ID_MISMATCH");
  if (evidence.evidenceFingerprint !== relationProofEvidenceFingerprintV36(evidence)) diagnostics.push("RELATION_PROOF_EVIDENCE_FINGERPRINT_MISMATCH");
  return { validatorVersion: HISTORY_RELATION_PROOF_EVIDENCE_VALIDATOR_V36, valid: diagnostics.length === 0, diagnostics, ...(diagnostics.length ? {} : { evidence }) };
}

export interface ProofAwarePolicyResponseRelationV36 {
  readonly relation: PolicyResponseRelationV36;
  readonly proofEvidence: RelationProofEvidenceV36;
}

/** A prototype-only relation wrapper. It leaves the existing single-claim validator unchanged. */
export function constructProofAwarePolicyResponseRelationV36(input: {
  readonly proofEvidence: RelationProofEvidenceV36;
  readonly conditionLabel: string;
  readonly responseLabel: string;
}): ProofAwarePolicyResponseRelationV36 {
  const validation = validateRelationProofEvidenceV36(input.proofEvidence);
  if (!validation.valid || !validation.evidence) throw new TypeError("Proof-aware relation requires valid bridge evidence.");
  const [condition, response] = validation.evidence.premises;
  const relation = createExplanatoryRelationV36({
    episodeId: episodeIdV36(validation.evidence.episodeId),
    kind: "policy-response",
    condition: { entityId: entityIdV36(condition.participantId), canonicalLabel: input.conditionLabel },
    conditionAssertionStatus: condition.assertionStatus,
    response: { entityId: entityIdV36(response.participantId), canonicalLabel: input.responseLabel },
    responseAssertionStatus: response.assertionStatus,
    supportClaimIds: [claimIdV36(condition.claimId), claimIdV36(response.claimId)],
  });
  if (relation.kind !== "policy-response") throw new TypeError("Proof bridge constructed the wrong relation kind.");
  return { relation, proofEvidence: validation.evidence };
}

/** Validates the two-premise evidence bridge separately from legacy single-claim support rules. */
export function validateProofAwarePolicyResponseRelationV36(input: ProofAwarePolicyResponseRelationV36): { readonly valid: boolean; readonly diagnostics: readonly string[] } {
  const bridge = validateRelationProofEvidenceV36(input.proofEvidence);
  const parsedRelation = explanatoryRelationSchemaV36.safeParse(input.relation);
  if (!bridge.valid || !bridge.evidence || !parsedRelation.success || input.relation.kind !== "policy-response") return { valid: false, diagnostics: ["PROOF_AWARE_POLICY_RESPONSE_SCHEMA_INVALID", ...bridge.diagnostics] };
  const [condition, response] = bridge.evidence.premises;
  const relation = input.relation;
  const assertion = policyResponseAssertionSemanticsV36(relation);
  const expectedClaims = [condition.claimId, response.claimId].sort();
  const diagnostics: string[] = [];
  if (relation.condition.entityId !== condition.participantId || relation.response.entityId !== response.participantId) diagnostics.push("PROOF_AWARE_POLICY_RESPONSE_PARTICIPANT_MISMATCH");
  if (assertion.conditionAssertionStatus !== condition.assertionStatus || assertion.responseAssertionStatus !== response.assertionStatus) diagnostics.push("PROOF_AWARE_POLICY_RESPONSE_MODALITY_MISMATCH");
  if (JSON.stringify([...relation.supportClaimIds].sort()) !== JSON.stringify(expectedClaims)) diagnostics.push("PROOF_AWARE_POLICY_RESPONSE_SUPPORT_MISMATCH");
  if (relation.id !== explanatoryRelationIdV36(relation)) diagnostics.push("PROOF_AWARE_POLICY_RESPONSE_ID_MISMATCH");
  if (relation.evidenceFingerprint !== relationEvidenceFingerprintV36(relation.supportClaimIds)) diagnostics.push("PROOF_AWARE_POLICY_RESPONSE_EVIDENCE_FINGERPRINT_MISMATCH");
  return { valid: diagnostics.length === 0, diagnostics };
}

export const relationProofEvidenceJsonSchemaV36 = {
  ...z.toJSONSchema(relationProofEvidenceSchemaV36),
  $id: "https://mediaforge.local/schemas/history/v3.6/relation-proof-evidence-schema.json",
  title: "History V3.6 proof-aware relation evidence",
};
