import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  crossClaimProofEvidenceFingerprintV36,
  crossClaimProofIdV36,
  crossClaimProofJsonSchemaV36,
  crossClaimProofSchemaV36,
  validateCrossClaimProofV36,
} from "./cross-claim-proof-v36.js";
import {
  constructApprovedCrossClaimProofV36,
  approvedCrossClaimConditionClaimIdV36,
  approvedCrossClaimResponseClaimIdV36,
} from "./cross-claim-proof-fixtures-v36.js";
import { representativeNativeEpisodeFragmentsV36 } from "./native-structured-claim-fixtures-v36.js";
import { runRepresentativeNativeStructuredClaimExperimentV36 } from "./native-structured-claim-experiment-v36.js";

async function approvedProof() {
  const entries = await fs.readdir(path.resolve("episodes"), { withFileTypes: true });
  const episodeId = entries.find((entry) => entry.isDirectory() && entry.name.includes("04-black-death") && !entry.name.endsWith("-v3.4"))?.name;
  if (!episodeId) throw new Error("Missing Black Death representative fixture.");
  const root = path.resolve("episodes", episodeId, "source", "history-v3.5");
  const structured = JSON.parse(await fs.readFile(path.join(root, "structured-claims.json"), "utf8"));
  const plan = JSON.parse(await fs.readFile(path.join(root, "plan.json"), "utf8"));
  const experiment = runRepresentativeNativeStructuredClaimExperimentV36([{
    shadow: { episodeId, claims: structured.claims, entities: structured.entities, places: plan.places ?? [] },
    native: { episodeId, claims: structured.claims, entities: structured.entities },
  }]);
  const run = experiment.runs[0]!.native;
  const atomic = (claimId: string) => run.grounding.propositions.find((item) => item.claimId === claimId)!;
  const proposition = (claimId: string) => run.structuredClaims.envelopes.find((item) => item.claimId === claimId)!.propositions[0]!;
  return constructApprovedCrossClaimProofV36({
    conditionAtomic: atomic(approvedCrossClaimConditionClaimIdV36),
    conditionStructured: proposition(approvedCrossClaimConditionClaimIdV36),
    responseAtomic: atomic(approvedCrossClaimResponseClaimIdV36),
    responseStructured: proposition(approvedCrossClaimResponseClaimIdV36),
  });
}

function mutate<T>(value: T, fn: (copy: any) => void): T { const copy = structuredClone(value); fn(copy); return copy; }
function codes(value: unknown) { return validateCrossClaimProofV36(value).diagnostics.map((item) => item.code); }

describe("CrossClaimProofV36", () => {
  it("constructs and validates only the exact inventory-approved Black Death proof", async () => {
    const proof = await approvedProof();
    expect(proof.premises.map((item) => item.claimId)).toEqual([approvedCrossClaimConditionClaimIdV36, approvedCrossClaimResponseClaimIdV36]);
    expect(proof.premises.map((item) => item.assertionStatus)).toEqual(["uncertain", "attempted"]);
    expect(validateCrossClaimProofV36(proof)).toMatchObject({ valid: true, proof: expect.objectContaining({ targetRelationKind: "policy-response" }) });
  });

  it("has deterministic semantic identity and a separate source-lineage fingerprint", async () => {
    const proof = await approvedProof();
    expect(crossClaimProofIdV36(proof)).toBe(proof.proofId);
    expect(crossClaimProofIdV36(structuredClone(proof))).toBe(proof.proofId);
    const changedLineage = mutate(proof, (copy) => { copy.premises[0].sourceSpan.startUtf16 += 1; });
    expect(crossClaimProofIdV36(changedLineage)).toBe(proof.proofId);
    expect(crossClaimProofEvidenceFingerprintV36(changedLineage)).not.toBe(crossClaimProofEvidenceFingerprintV36(proof));
  });

  it("exports an authoritative generated JSON schema and rejects malformed proof data", async () => {
    const proof = await approvedProof();
    expect(crossClaimProofJsonSchemaV36.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(crossClaimProofSchemaV36.safeParse(mutate(proof, (copy) => { copy.source = "not-permitted"; })).success).toBe(false);
  });

  it("fails closed for all bounded invalid controls", async () => {
    const proof = await approvedProof();
    const cases: readonly [string, unknown, string][] = [
      ["same claim twice", mutate(proof, (copy) => { copy.premises[1].claimId = copy.premises[0].claimId; }), "CROSS_CLAIM_PROOF_SAME_CLAIM"],
      ["cross episode", mutate(proof, (copy) => { copy.premises[1].episodeId = "other-episode"; }), "CROSS_CLAIM_PROOF_CROSS_EPISODE"],
      ["missing join", mutate(proof, (copy) => { copy.participantJoins = []; }), "CROSS_CLAIM_PROOF_SCHEMA_INVALID"],
      ["wrong join", mutate(proof, (copy) => { copy.participantJoins[0].leftParticipant = "concept-wrong"; }), "CROSS_CLAIM_PROOF_JOIN_INVALID"],
      ["reversed direction", mutate(proof, (copy) => { [copy.premises[0], copy.premises[1]] = [copy.premises[1], copy.premises[0]]; }), "CROSS_CLAIM_PROOF_DIRECTION_INVALID"],
      ["unsupported pattern", mutate(proof, (copy) => { copy.proofPattern = "cause-consequence"; }), "CROSS_CLAIM_PROOF_SCHEMA_INVALID"],
      ["wrong target", mutate(proof, (copy) => { copy.targetRelationKind = "causal"; }), "CROSS_CLAIM_PROOF_SCHEMA_INVALID"],
      ["unresolved participant", mutate(proof, (copy) => { copy.premises[0].participantBindings[0].resolved = false; }), "CROSS_CLAIM_PROOF_SCHEMA_INVALID"],
      ["asserted uncertain", mutate(proof, (copy) => { copy.premises[0].assertionStatus = "asserted"; copy.proofId = crossClaimProofIdV36(copy); }), "CROSS_CLAIM_PROOF_ASSERTION_INCOMPATIBLE"],
      ["asserted intended", mutate(proof, (copy) => { copy.premises[0].assertionStatus = "asserted"; copy.premises[1].assertionStatus = "intended"; copy.proofId = crossClaimProofIdV36(copy); }), "CROSS_CLAIM_PROOF_ASSERTION_INCOMPATIBLE"],
      ["asserted attempted", mutate(proof, (copy) => { copy.premises[0].assertionStatus = "asserted"; copy.proofId = crossClaimProofIdV36(copy); }), "CROSS_CLAIM_PROOF_ASSERTION_INCOMPATIBLE"],
      ["counterfactual", mutate(proof, (copy) => { copy.premises[0].assertionStatus = "counterfactual"; copy.proofId = crossClaimProofIdV36(copy); }), "CROSS_CLAIM_PROOF_ASSERTION_INCOMPATIBLE"],
      ["reported", mutate(proof, (copy) => { copy.premises[0].assertionStatus = "reported"; copy.proofId = crossClaimProofIdV36(copy); }), "CROSS_CLAIM_PROOF_ASSERTION_INCOMPATIBLE"],
      ["duplicate premise", mutate(proof, (copy) => { copy.premises[1].atomicGroundingId = copy.premises[0].atomicGroundingId; copy.proofId = crossClaimProofIdV36(copy); }), "CROSS_CLAIM_PROOF_CARDINALITY_INVALID"],
      ["invalid source", mutate(proof, (copy) => { copy.premises[0].sourceHash = "0".repeat(64); copy.proofId = crossClaimProofIdV36(copy); }), "CROSS_CLAIM_PROOF_SOURCE_INVALID"],
    ];
    for (const [name, invalid, code] of cases) expect(codes(invalid), name).toContain(code);
  });

  it("cannot construct a proof from adjacent or unrelated claim IDs", async () => {
    const proof = await approvedProof();
    const entries = await fs.readdir(path.resolve("episodes"), { withFileTypes: true });
    const episodeId = entries.find((entry) => entry.isDirectory() && entry.name.includes("04-black-death") && !entry.name.endsWith("-v3.4"))!.name;
    const structured = JSON.parse(await fs.readFile(path.resolve("episodes", episodeId, "source", "history-v3.5", "structured-claims.json"), "utf8"));
    const nearbyClaim = structured.claims.find((item: { id: string }) => item.id !== approvedCrossClaimConditionClaimIdV36 && item.id !== approvedCrossClaimResponseClaimIdV36)!.id;
    expect(codes(mutate(proof, (copy) => { copy.premises[0].claimId = nearbyClaim; copy.proofId = crossClaimProofIdV36(copy); }))).toContain("CROSS_CLAIM_PROOF_PREMISE_SHAPE_INVALID");
    expect(representativeNativeEpisodeFragmentsV36).toHaveLength(8);
  });
});
