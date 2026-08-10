import { z } from "zod";

import {
  claimIdV36,
  createExplanatoryRelationV36,
  entityIdV36,
  episodeIdV36,
  explanatoryRelationIdV36,
  explanatoryRelationSchemaV36,
  policyResponseAssertionSemanticsV36,
  relationEvidenceFingerprintV36,
  type ConceptRefV36,
  type PolicyResponseRelationV36,
} from "./explanatory-relation-v36.js";
import {
  proofBackedPolicyResponseCandidateSchemaV36,
  type ProofBackedPolicyResponseCandidateV36,
} from "./policy-response-admission-v36.js";

export const HISTORY_POLICY_RESPONSE_MODALITY_PROTOTYPE_V36 =
  "history-policy-response-modality-prototype.v1" as const;
export const selectedPolicyResponseModalityOptionV36 =
  "OPTION_A_POLICY_RESPONSE_SPECIFIC_MODALITY" as const;

const assessment = z.enum(["excellent", "good", "mixed", "poor"]);
const matrixDimension = z.object({ assessment, rationale: z.string().min(1) }).strict();
const option = z.object({
  option: z.enum([
    "OPTION_A_POLICY_RESPONSE_SPECIFIC_MODALITY",
    "OPTION_B_GENERIC_DIRECTED_PREMISE_MODALITY",
    "OPTION_C_KEEP_RELATION_UNCHANGED",
  ]),
  selected: z.boolean(),
  dimensions: z.object({
    semanticFidelity: matrixDimension,
    backwardCompatibility: matrixDimension,
    v35Isolation: matrixDimension,
    v36MigrationRisk: matrixDimension,
    validatorImpact: matrixDimension,
    semanticIdStability: matrixDimension,
    evidenceFingerprintStability: matrixDimension,
    schemaComplexity: matrixDimension,
    serializationCompatibility: matrixDimension,
    compilerImpact: matrixDimension,
    futureExtensibility: matrixDimension,
    implementationScope: matrixDimension,
  }).strict(),
}).strict();

export const policyResponseModalityDecisionMatrixSchemaV36 = z.object({
  schemaVersion: z.literal("history-policy-response-modality-decision-matrix.v1"),
  selectedOption: z.literal(selectedPolicyResponseModalityOptionV36),
  scale: z.tuple([
    z.literal("excellent"),
    z.literal("good"),
    z.literal("mixed"),
    z.literal("poor"),
  ]),
  options: z.tuple([option, option, option]),
  selectionRuleResult: z.string().min(1),
}).strict();

export interface PolicyResponseModalityPrototypeInputV36 {
  readonly candidate: ProofBackedPolicyResponseCandidateV36;
  readonly conditionLabel: string;
  readonly responseLabel: string;
}

export interface PolicyResponseModalityPrototypeResultV36 {
  readonly prototypeVersion: typeof HISTORY_POLICY_RESPONSE_MODALITY_PROTOTYPE_V36;
  readonly selectedOption: typeof selectedPolicyResponseModalityOptionV36;
  readonly classification: "ADMISSIBLE_LOSSLESS";
  readonly schemaValid: true;
  readonly validatorValid: true;
  readonly semanticIdentityStable: true;
  readonly evidenceProvenanceSeparate: true;
  readonly productionAdmissionChanged: false;
  readonly relation: PolicyResponseRelationV36;
}

/** Prototype-only candidate mapping. It is not imported by production admission or shadow extraction. */
export function simulatePolicyResponseModalityContractV36(
  input: PolicyResponseModalityPrototypeInputV36
): PolicyResponseModalityPrototypeResultV36 {
  const candidate = proofBackedPolicyResponseCandidateSchemaV36.parse(input.candidate);
  const condition: ConceptRefV36 = {
    entityId: entityIdV36(candidate.condition.participantId),
    canonicalLabel: input.conditionLabel,
  };
  const response: ConceptRefV36 = {
    entityId: entityIdV36(candidate.response.participantId),
    canonicalLabel: input.responseLabel,
  };
  const relation = createExplanatoryRelationV36({
    kind: "policy-response",
    episodeId: episodeIdV36(candidate.episodeId),
    supportClaimIds: [
      claimIdV36(candidate.condition.premise.claimId),
      claimIdV36(candidate.response.premise.claimId),
    ],
    condition,
    conditionAssertionStatus: candidate.condition.assertionStatus,
    response,
    responseAssertionStatus: candidate.response.assertionStatus,
  });
  if (relation.kind !== "policy-response") throw new TypeError("Prototype created the wrong relation kind.");
  const parsed = explanatoryRelationSchemaV36.safeParse(relation);
  const assertions = policyResponseAssertionSemanticsV36(relation);
  const validatorValid = parsed.success &&
    candidate.direction === "condition-to-response" &&
    condition.entityId === candidate.condition.participantId &&
    response.entityId === candidate.response.participantId &&
    assertions.conditionAssertionStatus === candidate.condition.assertionStatus &&
    assertions.responseAssertionStatus === candidate.response.assertionStatus;
  if (!validatorValid) throw new TypeError("Prototype relation did not preserve directed premise modality.");
  if (explanatoryRelationIdV36(relation) !== relation.id) throw new TypeError("Prototype semantic identity is unstable.");
  if (relationEvidenceFingerprintV36(relation.supportClaimIds) !== relation.evidenceFingerprint) {
    throw new TypeError("Prototype evidence fingerprint is unstable.");
  }
  return {
    prototypeVersion: HISTORY_POLICY_RESPONSE_MODALITY_PROTOTYPE_V36,
    selectedOption: selectedPolicyResponseModalityOptionV36,
    classification: "ADMISSIBLE_LOSSLESS",
    schemaValid: true,
    validatorValid: true,
    semanticIdentityStable: true,
    evidenceProvenanceSeparate: true,
    productionAdmissionChanged: false,
    relation,
  };
}
