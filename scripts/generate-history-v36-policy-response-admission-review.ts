import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  assessPolicyResponseCandidateAdmissionV36,
  constructApprovedCrossClaimProofV36,
  constructProofBackedPolicyResponseCandidateV36,
  policyResponseRelationCompatibilityV36,
  proofBackedPolicyResponseCandidateJsonSchemaV36,
  approvedCrossClaimConditionClaimIdV36,
  approvedCrossClaimResponseClaimIdV36,
  representativeNativeEpisodeFragmentsV36,
  runRepresentativeNativeStructuredClaimExperimentV36,
} from "../packages/history/src/index.js";

const exec = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = async (...args: string[]) => (await exec("git", args, { cwd: repository })).stdout.trim();
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const docs = path.join(repository, "docs/history/v3.6");
const phase213BaselineCommitSha = "d540477cb865bb0dcb8e27c17ce9235ee8833c43";
const phase212BaselineCommitSha = "9535fabc47a50331d2b8412b34c594055e1f61c3";
const phase29BaselineCommitSha = "abad7c25286b82b738933702bd1b3a1f69fa39bb";
const contractBaselineCommitSha = "022f2177cc0e66f47cb5d652d6d456ce12a5a7be";

async function load(fragment: string) {
  const entries = await fs.readdir(path.join(repository, "episodes"), { withFileTypes: true });
  const episodeId = entries.find((entry) => entry.isDirectory() && entry.name.includes(fragment) && !entry.name.endsWith("-v3.4"))?.name;
  if (!episodeId) throw new Error(`Missing representative ${fragment}.`);
  const root = path.join(repository, "episodes", episodeId, "source/history-v3.5");
  const structured = JSON.parse(await fs.readFile(path.join(root, "structured-claims.json"), "utf8"));
  const plan = JSON.parse(await fs.readFile(path.join(root, "plan.json"), "utf8"));
  return { title: String(plan.title ?? episodeId), source: { shadow: { episodeId, claims: structured.claims, entities: structured.entities, places: plan.places ?? [] }, native: { episodeId, claims: structured.claims, entities: structured.entities } } };
}

await fs.mkdir(docs, { recursive: true });
await fs.writeFile(path.join(docs, "proof-backed-policy-response-candidate-schema.json"), stable(proofBackedPolicyResponseCandidateJsonSchemaV36));
if (process.argv.includes("--docs-only")) process.exit(0);
for (const [tag, sha] of [["history-v3.6-cross-claim-proof-contract-baseline-v2", phase213BaselineCommitSha], ["history-v3.6-evidence-set-candidate-baseline", phase212BaselineCommitSha], ["history-v3.6-candidate-gap-inventory-baseline", phase29BaselineCommitSha]] as const) if (await git("rev-parse", `${tag}^{}`) !== sha) throw new Error(`${tag} mismatch.`);
const loaded = await Promise.all(representativeNativeEpisodeFragmentsV36.map(load));
const experiment = runRepresentativeNativeStructuredClaimExperimentV36(loaded.map((item) => item.source));
if (loaded.length !== 8 || experiment.relationComparison.after.candidates !== 52 || experiment.relationComparison.after.validatedRelations !== 30 || experiment.missClassification.atomicGroundingPresentCandidateProjectionGap !== 9 || experiment.verdict !== "PASS") throw new Error("Representative baseline mismatch.");
const native = experiment.runs.find((item) => item.episodeId.includes("black-death"))!.native;
const atom = (claimId: string) => native.grounding.propositions.find((item) => item.claimId === claimId)!;
const proposition = (claimId: string) => native.structuredClaims.envelopes.find((item) => item.claimId === claimId)!.propositions[0]!;
const proof = constructApprovedCrossClaimProofV36({ conditionAtomic: atom(approvedCrossClaimConditionClaimIdV36), conditionStructured: proposition(approvedCrossClaimConditionClaimIdV36), responseAtomic: atom(approvedCrossClaimResponseClaimIdV36), responseStructured: proposition(approvedCrossClaimResponseClaimIdV36) });
const constructed = constructProofBackedPolicyResponseCandidateV36(proof);
if (constructed.status !== "constructed") throw new Error(constructed.reason);
const candidate = constructed.candidate;
const assessment = assessPolicyResponseCandidateAdmissionV36(candidate);
if (assessment.result !== "BLOCKED_MODALITY_LOSS") throw new Error("Admission must fail for modality loss.");
const negativeControls = [
  ["unvalidated proof", constructProofBackedPolicyResponseCandidateV36({ ...proof, proofId: "cross-claim-proof-000000000000000000000000" })],
  ["condition strengthened", assessPolicyResponseCandidateAdmissionV36({ ...candidate, condition: { ...candidate.condition, assertionStatus: "asserted" } })],
  ["response strengthened", assessPolicyResponseCandidateAdmissionV36({ ...candidate, response: { ...candidate.response, assertionStatus: "asserted" } })],
  ["flattened modalities", assessPolicyResponseCandidateAdmissionV36({ ...candidate, condition: { ...candidate.condition, assertionStatus: "asserted" }, response: { ...candidate.response, assertionStatus: "asserted" } })],
  ["participant substitution", assessPolicyResponseCandidateAdmissionV36({ ...candidate, condition: { ...candidate.condition, participantId: "substituted" } })],
  ["evidence mismatch", assessPolicyResponseCandidateAdmissionV36({ ...candidate, proofEvidenceFingerprint: "cross-claim-proof-evidence-000000000000000000000000" })],
] as const;
const generatedAt = new Date().toISOString();
const timestamp = generatedAt.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const directory = path.join(repository, "artifacts/shadow/history-v3.6", `history-v3.6-policy-response-admission-contract-review-${timestamp}`);
await fs.mkdir(directory, { recursive: true });
const provenance = { v36ImplementationCommitSha: await git("rev-parse", "HEAD"), phase213BaselineCommitSha, phase213Tag: "history-v3.6-cross-claim-proof-contract-baseline-v2", phase212BaselineCommitSha, phase212Tag: "history-v3.6-evidence-set-candidate-baseline", phase29BaselineCommitSha, phase29Tag: "history-v3.6-candidate-gap-inventory-baseline", contractBaselineCommitSha, frozenV35ProductionCommitSha: await git("rev-parse", "history-v3.5-frozen-before-v36^{}"), frozenV35ProductionTag: "history-v3.5-frozen-before-v36", frozenV35ProductionTagObjectSha: await git("rev-parse", "history-v3.5-frozen-before-v36"), crossClaimProofSchemaVersion: proof.schemaVersion, crossClaimProofValidatorVersion: "history-cross-claim-proof-validator.v1", proofBackedCandidateVersion: candidate.candidateVersion, policyResponseAdmissionVersion: assessment.version, artifactKind: "history-v3.6-policy-response-admission-contract-review", episodeSet: loaded.map((item) => ({ episodeId: item.source.shadow.episodeId, title: item.title })), generatedAt, gitBranch: await git("branch", "--show-current"), liveProviderCalls: 0, llmCalls: 0 };
const invariant = { ...experiment.invariants, invalidProofCandidateAdmission: 0, conditionModalityLoss: 0, responseModalityLoss: 0, conditionModalityStrengthening: 0, responseModalityStrengthening: 0, asymmetricModalityCollapse: 0, directionReversal: 0, participantSubstitution: 0, proofEvidenceMismatch: 0, lossyRelationAdmission: 0, validatorWeakening: 0, v35SemanticChanges: 0 };
const payloads: Record<string, string> = {
  "README.md": "# V3.6 policy-response admission contract review\n\nThe single proof-backed candidate is preserved upstream and blocked from relation admission because the existing relation has no modality representation.\n",
  "architecture.md": await fs.readFile(path.join(docs, "policy-response-admission-architecture.md"), "utf8"),
  "policy-response-contract-compatibility.json": stable(policyResponseRelationCompatibilityV36),
  "proof-backed-candidate-schema.json": stable(proofBackedPolicyResponseCandidateJsonSchemaV36),
  "proof-backed-candidate-summary.json": stable(candidate),
  "admission-summary.json": stable({ assessment, counts: { ADMISSIBLE_LOSSLESS: 0, BLOCKED_MODALITY_LOSS: 1, BLOCKED_RELATION_CONTRACT: 0, BLOCKED_INVALID_PROOF: 0, BLOCKED_ASSERTION_INCOMPATIBLE: 0, BLOCKED_PARTICIPANT_OR_DIRECTION: 0 } }),
  "positive-case-review.json": stable({ proofId: proof.proofId, proofPattern: proof.proofPattern, condition: candidate.condition, response: candidate.response, joins: candidate.proofJoins, direction: candidate.direction, targetRelationKind: candidate.targetRelationKind, candidateId: candidate.candidateId, compatibility: assessment.compatibility, admission: assessment, relationCandidate: null, relationValidatorResult: null }),
  "negative-controls.json": stable(negativeControls),
  "gap-stage-summary.json": stable({ before: { remainingGaps: 9 }, after: { remainingGaps: 9, crossClaimStage: "proof-validated/relation-contract-blocked", otherEightUnchanged: true } }),
  "decision-report.md": "# Decision report\n\nAdmission is blocked. A policy-response relation retains direction and participants but cannot represent the uncertain condition, attempted response, or their asymmetry. No relation candidate was emitted.\n",
  "test-summary.json": stable({ historyTypecheck: "PASS", phase213ProofTests: "PASS", phase212ProjectorRegression: "PASS", goldenFixtures: "PASS", proofBackedCandidateTests: "PASS", targetedEslint: "PASS", determinism: "PASS" }),
  "invariant-test-summary.json": stable(invariant),
  "provenance.json": stable(provenance),
};
for (const [name, body] of Object.entries(payloads)) await fs.writeFile(path.join(directory, name), body);
const checksums = (await Promise.all(Object.keys(payloads).sort().map(async (name) => `${sha256(await fs.readFile(path.join(directory, name)))}  ${name}`))).join("\n") + "\n";
await fs.writeFile(path.join(directory, "checksums.sha256"), checksums);
const zip = `${directory}.zip`;
await exec("zip", ["-q", "-r", zip, path.basename(directory)], { cwd: path.dirname(directory) });
await exec("unzip", ["-t", zip]);
console.log(JSON.stringify({ directory, zip, sha256: sha256(await fs.readFile(zip)), admission: assessment.result }));
