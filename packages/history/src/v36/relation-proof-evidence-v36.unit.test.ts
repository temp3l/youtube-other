import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { constructApprovedCrossClaimProofV36, approvedCrossClaimConditionClaimIdV36, approvedCrossClaimResponseClaimIdV36 } from "./cross-claim-proof-fixtures-v36.js";
import { runRepresentativeNativeStructuredClaimExperimentV36 } from "./native-structured-claim-experiment-v36.js";
import {
  constructProofAwarePolicyResponseRelationV36,
  constructRelationProofEvidenceV36,
  relationProofEvidenceFingerprintV36,
  relationProofEvidenceIdV36,
  relationProofEvidenceJsonSchemaV36,
  validateProofAwarePolicyResponseRelationV36,
  validateRelationProofEvidenceV36,
} from "./relation-proof-evidence-v36.js";

async function approvedFixture() {
  const entries = await fs.readdir(path.resolve("episodes"), { withFileTypes: true });
  const episodeId = entries.find((entry) => entry.isDirectory() && entry.name.includes("04-black-death") && !entry.name.endsWith("-v3.4"))!.name;
  const root = path.resolve("episodes", episodeId, "source", "history-v3.5");
  const structured = JSON.parse(await fs.readFile(path.join(root, "structured-claims.json"), "utf8"));
  const plan = JSON.parse(await fs.readFile(path.join(root, "plan.json"), "utf8"));
  const native = runRepresentativeNativeStructuredClaimExperimentV36([{ shadow: { episodeId, claims: structured.claims, entities: structured.entities, places: plan.places ?? [] }, native: { episodeId, claims: structured.claims, entities: structured.entities } }]).runs[0]!.native;
  const atom = (claimId: string) => native.grounding.propositions.find((item) => item.claimId === claimId)!;
  const proposition = (claimId: string) => native.structuredClaims.envelopes.find((item) => item.claimId === claimId)!.propositions[0]!;
  const proof = constructApprovedCrossClaimProofV36({ conditionAtomic: atom(approvedCrossClaimConditionClaimIdV36), conditionStructured: proposition(approvedCrossClaimConditionClaimIdV36), responseAtomic: atom(approvedCrossClaimResponseClaimIdV36), responseStructured: proposition(approvedCrossClaimResponseClaimIdV36) });
  const evidence = constructRelationProofEvidenceV36(proof);
  const label = (claimId: string, participantId: string) => proposition(claimId).roles.find((role) => role.participant.binding.referenceId === participantId)!.participant.label;
  return { proof, evidence, conditionLabel: label(approvedCrossClaimConditionClaimIdV36, evidence.premises[0].participantId), responseLabel: label(approvedCrossClaimResponseClaimIdV36, evidence.premises[1].participantId) };
}

function mutate<T>(value: T, fn: (copy: any) => void): T { const copy = structuredClone(value); fn(copy); return copy; }

describe("V3.6 proof-aware relation evidence bridge", () => {
  it("retains the complete validated proof lineage deterministically", async () => {
    const { proof, evidence } = await approvedFixture();
    expect(validateRelationProofEvidenceV36(evidence)).toMatchObject({ valid: true });
    expect(evidence.proofId).toBe(proof.proofId);
    expect(evidence.proofValidatorVersion).toBe("history-cross-claim-proof-validator.v1");
    expect(evidence.premises.map((premise) => [premise.claimId, premise.structuredPropositionId, premise.atomicGroundingId, premise.sourceHash])).toHaveLength(2);
    expect(relationProofEvidenceIdV36(evidence)).toBe(evidence.evidenceId);
    expect(relationProofEvidenceFingerprintV36(evidence)).toBe(evidence.evidenceFingerprint);
  });

  it("prototypes a lossless modal relation only through explicit proof evidence", async () => {
    const fixture = await approvedFixture();
    const wrapped = constructProofAwarePolicyResponseRelationV36({ proofEvidence: fixture.evidence, conditionLabel: fixture.conditionLabel, responseLabel: fixture.responseLabel });
    expect(wrapped.relation).toMatchObject({ kind: "policy-response", conditionAssertionStatus: "uncertain", responseAssertionStatus: "attempted", supportClaimIds: expect.arrayContaining([approvedCrossClaimConditionClaimIdV36, approvedCrossClaimResponseClaimIdV36]) });
    expect(validateProofAwarePolicyResponseRelationV36(wrapped)).toEqual({ valid: true, diagnostics: [] });
  });

  it("fails closed for source, join, modality, participant, and proof-wrapper tampering", async () => {
    const fixture = await approvedFixture();
    const wrapped = constructProofAwarePolicyResponseRelationV36({ proofEvidence: fixture.evidence, conditionLabel: fixture.conditionLabel, responseLabel: fixture.responseLabel });
    expect(validateRelationProofEvidenceV36(mutate(fixture.evidence, (copy) => { copy.premises[0].sourceHash = "0".repeat(64); }))).toMatchObject({ valid: false });
    expect(validateRelationProofEvidenceV36(mutate(fixture.evidence, (copy) => { copy.participantJoins[0].rightParticipant = "substituted"; }))).toMatchObject({ valid: false });
    expect(validateProofAwarePolicyResponseRelationV36(mutate(wrapped, (copy) => { copy.relation.conditionAssertionStatus = "asserted"; }))).toMatchObject({ valid: false, diagnostics: expect.arrayContaining(["PROOF_AWARE_POLICY_RESPONSE_MODALITY_MISMATCH"]) });
    expect(validateProofAwarePolicyResponseRelationV36(mutate(wrapped, (copy) => { copy.relation.response.entityId = "substituted"; }))).toMatchObject({ valid: false, diagnostics: expect.arrayContaining(["PROOF_AWARE_POLICY_RESPONSE_PARTICIPANT_MISMATCH"]) });
  });

  it("exports a strict generated schema and does not alter existing relation validation", async () => {
    const { evidence } = await approvedFixture();
    expect(relationProofEvidenceJsonSchemaV36.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(validateRelationProofEvidenceV36({ ...evidence, unsupported: true })).toMatchObject({ valid: false });
  });
});
