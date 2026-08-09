import { createHash } from "node:crypto";

import { z } from "zod";

import {
  atomicAssertionStatusValuesV36,
  atomicSourceSpanSchemaV36,
  type AtomicAssertionStatusV36,
} from "./atomic-claim-grounding-v36.js";
import type { RelationKindV36 } from "./explanatory-relation-v36.js";

/** A proof is upstream evidence only; it is neither a candidate nor a relation. */
export const HISTORY_CROSS_CLAIM_PROOF_SCHEMA_V36 = "history-cross-claim-proof.v1" as const;
export const HISTORY_CROSS_CLAIM_PROOF_VALIDATOR_V36 = "history-cross-claim-proof-validator.v1" as const;
export const crossClaimProofPatternValuesV36 = [
  "uncertain-demand-attempted-restriction-policy-response",
] as const;
export type CrossClaimProofPatternV36 = (typeof crossClaimProofPatternValuesV36)[number];
export const crossClaimProofDiagnosticValuesV36 = [
  "CROSS_CLAIM_PROOF_SCHEMA_INVALID",
  "CROSS_CLAIM_PROOF_CROSS_EPISODE",
  "CROSS_CLAIM_PROOF_SAME_CLAIM",
  "CROSS_CLAIM_PROOF_CARDINALITY_INVALID",
  "CROSS_CLAIM_PROOF_PATTERN_UNSUPPORTED",
  "CROSS_CLAIM_PROOF_PREMISE_SHAPE_INVALID",
  "CROSS_CLAIM_PROOF_ASSERTION_INCOMPATIBLE",
  "CROSS_CLAIM_PROOF_JOIN_MISSING",
  "CROSS_CLAIM_PROOF_JOIN_INVALID",
  "CROSS_CLAIM_PROOF_DIRECTION_INVALID",
  "CROSS_CLAIM_PROOF_PARTICIPANT_UNRESOLVED",
  "CROSS_CLAIM_PROOF_SOURCE_INVALID",
] as const;
export type CrossClaimProofDiagnosticCodeV36 = (typeof crossClaimProofDiagnosticValuesV36)[number];

const identifier = z.string().trim().min(1).max(256);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const premiseRole = z.enum(["condition", "response"]);
const participantBindingSchema = z.object({
  participantId: identifier,
  semanticRole: z.enum(["target", "action"]),
  bindingKind: z.enum(["canonical-entity", "claim-concept"]),
  resolved: z.literal(true),
}).strict();

export const crossClaimProofPremiseSchemaV36 = z.object({
  premiseId: premiseRole,
  episodeId: identifier,
  claimId: z.string().regex(/^claim-[a-f0-9]{24}$/u),
  structuredPropositionId: z.string().regex(/^structured-proposition-[a-f0-9]{24}$/u),
  atomicGroundingId: z.string().regex(/^grounding-[a-f0-9]{24}$/u),
  semanticRoleInProof: premiseRole,
  atomicPredicate: z.enum(["demands", "restricts"]),
  assertionStatus: z.enum(atomicAssertionStatusValuesV36),
  participantBindings: z.array(participantBindingSchema).min(1),
  sourceSpan: atomicSourceSpanSchemaV36,
  sourceHash: hash,
}).strict();

export const crossClaimParticipantJoinSchemaV36 = z.object({
  leftPremise: premiseRole,
  leftParticipant: identifier,
  rightPremise: premiseRole,
  rightParticipant: identifier,
  joinType: z.literal("EXPLICIT_TYPED_DEPENDENCY"),
  dependencyId: z.literal("inventory-approved-wage-pressure-to-restriction.v1"),
}).strict();

export const crossClaimProofSchemaV36 = z.object({
  proofId: z.string().regex(/^cross-claim-proof-[a-f0-9]{24}$/u),
  schemaVersion: z.literal(HISTORY_CROSS_CLAIM_PROOF_SCHEMA_V36),
  proofPattern: z.enum(crossClaimProofPatternValuesV36),
  episodeId: identifier,
  premises: z.tuple([crossClaimProofPremiseSchemaV36, crossClaimProofPremiseSchemaV36]),
  participantJoins: z.array(crossClaimParticipantJoinSchemaV36).min(1),
  targetRelationKind: z.literal("policy-response"),
  direction: z.literal("condition-to-response"),
  proofScope: z.literal("inventory-approved-explicit-premise-set"),
  constructionMethod: z.literal("approved-cross-claim-fixture"),
  provenance: z.object({
    gapId: z.literal("candidate-gap-claim-095a61f563fa2980b636c6cc"),
    inventoryClassification: z.literal("NEEDS_CROSS_CLAIM_PROOF"),
    inventoryRationaleHash: hash,
    participantBindingIds: z.array(identifier).min(2),
  }).strict(),
  diagnostics: z.array(z.enum(crossClaimProofDiagnosticValuesV36)),
}).strict();

export type CrossClaimProofV36 = z.infer<typeof crossClaimProofSchemaV36>;
export interface CrossClaimProofDiagnosticV36 { readonly code: CrossClaimProofDiagnosticCodeV36; readonly message: string; }
export interface CrossClaimProofValidationV36 {
  readonly validatorVersion: typeof HISTORY_CROSS_CLAIM_PROOF_VALIDATOR_V36;
  readonly valid: boolean;
  readonly diagnostics: readonly CrossClaimProofDiagnosticV36[];
  readonly proof?: CrossClaimProofV36;
}

function stable(value: unknown): string { return JSON.stringify(value); }
function digest(prefix: string, value: unknown): string {
  return `${prefix}-${createHash("sha256").update(stable(value)).digest("hex").slice(0, 24)}`;
}

/** Semantic identity deliberately excludes source text, hashes, and review metadata. */
export function crossClaimProofIdentityInputsV36(proof: Omit<CrossClaimProofV36, "proofId"> | CrossClaimProofV36) {
  return {
    schemaVersion: proof.schemaVersion,
    episodeId: proof.episodeId,
    proofPattern: proof.proofPattern,
    premises: proof.premises.map((premise) => ({
      premiseId: premise.premiseId,
      claimId: premise.claimId,
      structuredPropositionId: premise.structuredPropositionId,
      atomicGroundingId: premise.atomicGroundingId,
      semanticRoleInProof: premise.semanticRoleInProof,
      atomicPredicate: premise.atomicPredicate,
      assertionStatus: premise.assertionStatus,
      participantBindings: premise.participantBindings.map((binding) => ({
        participantId: binding.participantId, semanticRole: binding.semanticRole, bindingKind: binding.bindingKind,
      })),
    })),
    participantJoins: proof.participantJoins.map((join) => ({ ...join })),
    targetRelationKind: proof.targetRelationKind,
    direction: proof.direction,
  };
}

export function crossClaimProofIdV36(proof: Omit<CrossClaimProofV36, "proofId"> | CrossClaimProofV36): string {
  return digest("cross-claim-proof", crossClaimProofIdentityInputsV36(proof));
}

/** Separate evidence fingerprint tracks exact source lineage and may change without redefining proof semantics. */
export function crossClaimProofEvidenceFingerprintV36(proof: CrossClaimProofV36): string {
  return digest("cross-claim-proof-evidence", proof.premises.map((premise) => ({
    claimId: premise.claimId,
    structuredPropositionId: premise.structuredPropositionId,
    atomicGroundingId: premise.atomicGroundingId,
    sourceSpan: premise.sourceSpan,
    sourceHash: premise.sourceHash,
  })));
}

function diagnostic(code: CrossClaimProofDiagnosticCodeV36, message: string): CrossClaimProofDiagnosticV36 { return { code, message }; }
function hasBinding(proof: CrossClaimProofV36, premiseId: "condition" | "response", participantId: string, semanticRole: "target" | "action") {
  return proof.premises.find((premise) => premise.premiseId === premiseId)?.participantBindings
    .some((binding) => binding.participantId === participantId && binding.semanticRole === semanticRole && binding.resolved) ?? false;
}

/** Fails closed. This does not call, alter, or invoke the relation validator. */
export function validateCrossClaimProofV36(input: unknown): CrossClaimProofValidationV36 {
  const parsed = crossClaimProofSchemaV36.safeParse(input);
  if (!parsed.success) return { validatorVersion: HISTORY_CROSS_CLAIM_PROOF_VALIDATOR_V36, valid: false, diagnostics: [diagnostic("CROSS_CLAIM_PROOF_SCHEMA_INVALID", parsed.error.issues[0]?.message ?? "Invalid proof schema.")] };
  const proof = parsed.data;
  const diagnostics: CrossClaimProofDiagnosticV36[] = [];
  const [condition, response] = proof.premises;
  if (proof.premises.some((premise) => premise.episodeId !== proof.episodeId)) diagnostics.push(diagnostic("CROSS_CLAIM_PROOF_CROSS_EPISODE", "Every premise must belong to the proof episode."));
  if (new Set(proof.premises.map((premise) => premise.claimId)).size !== 2) diagnostics.push(diagnostic("CROSS_CLAIM_PROOF_SAME_CLAIM", "A cross-claim proof requires two distinct claim IDs."));
  if (condition.premiseId !== "condition" || response.premiseId !== "response" || condition.semanticRoleInProof !== "condition" || response.semanticRoleInProof !== "response") diagnostics.push(diagnostic("CROSS_CLAIM_PROOF_DIRECTION_INVALID", "Condition must precede response in the directed proof."));
  if (condition.atomicPredicate !== "demands" || response.atomicPredicate !== "restricts") diagnostics.push(diagnostic("CROSS_CLAIM_PROOF_PREMISE_SHAPE_INVALID", "The supported pattern requires demands(condition) then restricts(response)."));
  if (condition.claimId !== "claim-ee76bea77004b9d801b6630b" || condition.structuredPropositionId !== "structured-proposition-1df667e0e11400eb4dfe13fe" || condition.atomicGroundingId !== "grounding-c4182f8b9ed22ee176e88e92" || response.claimId !== "claim-095a61f563fa2980b636c6cc" || response.structuredPropositionId !== "structured-proposition-535f3073a6991e6b2dd28f3c" || response.atomicGroundingId !== "grounding-708cc4b83201d0b8ca6971d0") diagnostics.push(diagnostic("CROSS_CLAIM_PROOF_PREMISE_SHAPE_INVALID", "This bounded pattern accepts only its inventory-approved atomic lineage."));
  // This approved pattern preserves, rather than promotes, uncertain -> attempted modality.
  if (condition.assertionStatus !== "uncertain" || response.assertionStatus !== "attempted") diagnostics.push(diagnostic("CROSS_CLAIM_PROOF_ASSERTION_INCOMPATIBLE", "The supported proof pattern permits only uncertain condition plus attempted response."));
  if (proof.targetRelationKind !== "policy-response") diagnostics.push(diagnostic("CROSS_CLAIM_PROOF_PATTERN_UNSUPPORTED", "The supported pattern permits only policy-response."));
  if (proof.premises.some((premise) => premise.sourceHash !== premise.sourceSpan.textHash)) diagnostics.push(diagnostic("CROSS_CLAIM_PROOF_SOURCE_INVALID", "Premise sourceHash must equal its validated source span hash."));
  const join = proof.participantJoins[0];
  if (!join) diagnostics.push(diagnostic("CROSS_CLAIM_PROOF_JOIN_MISSING", "The pattern requires one explicit typed dependency join."));
  else if (join.leftPremise !== "condition" || join.rightPremise !== "response" || !hasBinding(proof, "condition", join.leftParticipant, "target") || !hasBinding(proof, "response", join.rightParticipant, "action")) diagnostics.push(diagnostic("CROSS_CLAIM_PROOF_JOIN_INVALID", "The join must connect resolved condition target to resolved response action."));
  if (proof.premises.some((premise) => premise.participantBindings.some((binding) => !binding.resolved))) diagnostics.push(diagnostic("CROSS_CLAIM_PROOF_PARTICIPANT_UNRESOLVED", "Every required participant must retain a resolved canonical binding."));
  if (new Set(proof.premises.map((premise) => premise.atomicGroundingId)).size !== 2) diagnostics.push(diagnostic("CROSS_CLAIM_PROOF_CARDINALITY_INVALID", "Duplicate atomic premises are not admissible."));
  if (proof.proofId !== crossClaimProofIdV36(proof)) diagnostics.push(diagnostic("CROSS_CLAIM_PROOF_SCHEMA_INVALID", "proofId does not match deterministic semantic identity."));
  return { validatorVersion: HISTORY_CROSS_CLAIM_PROOF_VALIDATOR_V36, valid: diagnostics.length === 0, diagnostics, ...(diagnostics.length === 0 ? { proof } : {}) };
}

export const crossClaimProofJsonSchemaV36 = {
  ...z.toJSONSchema(crossClaimProofSchemaV36),
  $id: "https://mediaforge.local/schemas/history/v3.6/cross-claim-proof-schema.json",
  title: "History V3.6 cross-claim proof",
};

export const crossClaimProofContractDocumentV36 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "History V3.6 CrossClaimProofV36 contract",
  schemaVersion: HISTORY_CROSS_CLAIM_PROOF_SCHEMA_V36,
  validatorVersion: HISTORY_CROSS_CLAIM_PROOF_VALIDATOR_V36,
  generatedFrom: "packages/history/src/v36/cross-claim-proof-v36.ts#crossClaimProofContractDocumentV36",
  cardinality: "exactly two ordered premises from distinct claims in one episode",
  supportedPattern: "uncertain demand condition -> attempted restriction response -> policy-response (projection deferred)",
  identity: "proofId hashes directed semantic proof content; exact source lineage is excluded",
  evidenceFingerprint: "crossClaimProofEvidenceFingerprintV36 hashes claim/proposition/grounding IDs and source spans/hashes",
  admission: "No proof is an ExplanatoryRelation or a relation candidate. Candidate admission is deferred.",
  prohibition: "No proximity, claim order, scene, paragraph, or pair enumeration is proof evidence.",
} as const;

export type CrossClaimProofTargetRelationKindV36 = Extract<RelationKindV36, "policy-response">;
