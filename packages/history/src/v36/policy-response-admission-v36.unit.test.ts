import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { constructApprovedCrossClaimProofV36, approvedCrossClaimConditionClaimIdV36, approvedCrossClaimResponseClaimIdV36 } from "./cross-claim-proof-fixtures-v36.js";
import { runRepresentativeNativeStructuredClaimExperimentV36 } from "./native-structured-claim-experiment-v36.js";
import {
  assessPolicyResponseCandidateAdmissionV36,
  constructProofBackedPolicyResponseCandidateV36,
  policyResponseRelationCompatibilityV36,
  proofBackedPolicyResponseCandidateEvidenceFingerprintV36,
  proofBackedPolicyResponseCandidateIdV36,
} from "./policy-response-admission-v36.js";

async function approvedCandidate() {
  const entries = await fs.readdir(path.resolve("episodes"), { withFileTypes: true });
  const episodeId = entries.find((entry) => entry.isDirectory() && entry.name.includes("04-black-death") && !entry.name.endsWith("-v3.4"))!.name;
  const root = path.resolve("episodes", episodeId, "source", "history-v3.5");
  const structured = JSON.parse(await fs.readFile(path.join(root, "structured-claims.json"), "utf8"));
  const plan = JSON.parse(await fs.readFile(path.join(root, "plan.json"), "utf8"));
  const native = runRepresentativeNativeStructuredClaimExperimentV36([{ shadow: { episodeId, claims: structured.claims, entities: structured.entities, places: plan.places ?? [] }, native: { episodeId, claims: structured.claims, entities: structured.entities } }]).runs[0]!.native;
  const atomic = (claimId: string) => native.grounding.propositions.find((item) => item.claimId === claimId)!;
  const proposition = (claimId: string) => native.structuredClaims.envelopes.find((item) => item.claimId === claimId)!.propositions[0]!;
  const proof = constructApprovedCrossClaimProofV36({ conditionAtomic: atomic(approvedCrossClaimConditionClaimIdV36), conditionStructured: proposition(approvedCrossClaimConditionClaimIdV36), responseAtomic: atomic(approvedCrossClaimResponseClaimIdV36), responseStructured: proposition(approvedCrossClaimResponseClaimIdV36) });
  const constructed = constructProofBackedPolicyResponseCandidateV36(proof);
  if (constructed.status !== "constructed") throw new Error(constructed.reason);
  return { proof, candidate: constructed.candidate };
}
function mutate<T>(value: T, fn: (copy: any) => void): T { const copy = structuredClone(value); fn(copy); return copy; }

describe("proof-backed V3.6 policy-response admission", () => {
  it("preserves the validated proof exactly but blocks existing relation admission for modality loss", async () => {
    const { candidate } = await approvedCandidate();
    expect(candidate.condition.assertionStatus).toBe("uncertain");
    expect(candidate.response.assertionStatus).toBe("attempted");
    expect(candidate.direction).toBe("condition-to-response");
    expect(policyResponseRelationCompatibilityV36).toMatchObject({ assertionModalityRepresentation: "none", classification: "REPRESENTABLE_ONLY_WITH_MODALITY_LOSS" });
    expect(assessPolicyResponseCandidateAdmissionV36(candidate)).toMatchObject({ result: "BLOCKED_MODALITY_LOSS" });
  });

  it("has deterministic candidate identity independent of evidence ordering", async () => {
    const { candidate } = await approvedCandidate();
    const reordered = mutate(candidate, (copy) => { copy.proofLineage.reverse(); });
    expect(proofBackedPolicyResponseCandidateIdV36(reordered)).toBe(candidate.candidateId);
    expect(proofBackedPolicyResponseCandidateEvidenceFingerprintV36(reordered)).toBe(candidate.candidateEvidenceFingerprint);
  });

  it("fails closed for invalid proof construction and all admission controls", async () => {
    const { proof, candidate } = await approvedCandidate();
    expect(constructProofBackedPolicyResponseCandidateV36(mutate(proof, (copy) => { copy.premises[0].assertionStatus = "asserted"; }))).toMatchObject({ status: "rejected" });
    const cases: readonly [string, unknown, string][] = [
      ["wrong proof pattern", mutate(candidate, (copy) => { copy.proofPattern = "wrong"; }), "BLOCKED_INVALID_PROOF"],
      ["wrong target", mutate(candidate, (copy) => { copy.targetRelationKind = "causal"; }), "BLOCKED_INVALID_PROOF"],
      ["reversed direction", mutate(candidate, (copy) => { copy.direction = "response-to-condition"; }), "BLOCKED_INVALID_PROOF"],
      ["missing join", mutate(candidate, (copy) => { copy.proofJoins = []; }), "BLOCKED_INVALID_PROOF"],
      ["condition strengthening", mutate(candidate, (copy) => { copy.condition.assertionStatus = "asserted"; }), "BLOCKED_INVALID_PROOF"],
      ["response strengthening", mutate(candidate, (copy) => { copy.response.assertionStatus = "asserted"; }), "BLOCKED_INVALID_PROOF"],
      ["asymmetric modality collapse", mutate(candidate, (copy) => { copy.condition.assertionStatus = "asserted"; copy.response.assertionStatus = "asserted"; }), "BLOCKED_INVALID_PROOF"],
      ["evidence mismatch", mutate(candidate, (copy) => { copy.proofEvidenceFingerprint = "cross-claim-proof-evidence-000000000000000000000000"; }), "BLOCKED_INVALID_PROOF"],
      ["participant substitution", mutate(candidate, (copy) => { copy.condition.participantId = "concept-substituted"; }), "BLOCKED_PARTICIPANT_OR_DIRECTION"],
      ["cross episode", mutate(candidate, (copy) => { copy.episodeId = "other-episode"; }), "BLOCKED_INVALID_PROOF"],
      ["premise cardinality", mutate(candidate, (copy) => { copy.proofLineage = [copy.proofLineage[0]]; }), "BLOCKED_INVALID_PROOF"],
    ];
    for (const [name, invalid, result] of cases) expect(assessPolicyResponseCandidateAdmissionV36(invalid).result, name).toBe(result);
  });
});
