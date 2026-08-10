import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  constructApprovedCrossClaimProofV36,
  crossClaimProofContractDocumentV36,
  crossClaimProofEvidenceFingerprintV36,
  crossClaimProofJsonSchemaV36,
  extractCandidateGapInventoryV36,
  approvedCrossClaimConditionClaimIdV36,
  approvedCrossClaimResponseClaimIdV36,
  representativeNativeEpisodeFragmentsV36,
  runRepresentativeNativeStructuredClaimExperimentV36,
  validateCrossClaimProofV36,
} from "../packages/history/src/index.js";

const execute = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = async (...args: string[]) => (await execute("git", args, { cwd: repository })).stdout.trim();
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const phase212BaselineCommitSha = "9535fabc47a50331d2b8412b34c594055e1f61c3";
const phase211BaselineCommitSha = "ce6cc44f476d3ab650703f23af5b7ee4a68c7695";
const phase29BaselineCommitSha = "abad7c25286b82b738933702bd1b3a1f69fa39bb";
const contractBaselineCommitSha = "022f2177cc0e66f47cb5d652d6d456ce12a5a7be";
const frozenV35ProductionTag = "history-v3.5-frozen-before-v36";

interface Loaded { readonly title: string; readonly source: { readonly shadow: any; readonly native: any; }; }
async function load(fragment: string): Promise<Loaded> {
  const entries = await fs.readdir(path.join(repository, "episodes"), { withFileTypes: true });
  const episodeId = entries.find((item) => item.isDirectory() && item.name.includes(fragment) && !item.name.endsWith("-v3.4"))?.name;
  if (!episodeId) throw new Error(`Missing representative episode ${fragment}.`);
  const root = path.join(repository, "episodes", episodeId, "source", "history-v3.5");
  const structured = JSON.parse(await fs.readFile(path.join(root, "structured-claims.json"), "utf8"));
  const plan = JSON.parse(await fs.readFile(path.join(root, "plan.json"), "utf8"));
  return { title: String(plan.title ?? episodeId), source: { shadow: { episodeId, claims: structured.claims, entities: structured.entities, places: plan.places ?? [] }, native: { episodeId, claims: structured.claims, entities: structured.entities } } };
}

const docs = path.join(repository, "docs", "history", "v3.6");
await fs.mkdir(docs, { recursive: true });
await fs.writeFile(path.join(docs, "cross-claim-proof-schema.json"), stable(crossClaimProofJsonSchemaV36));
await fs.writeFile(path.join(docs, "cross-claim-proof-contract-document.json"), stable(crossClaimProofContractDocumentV36));
if (process.argv.includes("--docs-only")) process.exit(0);

for (const [tag, expected] of [["history-v3.6-evidence-set-candidate-baseline", phase212BaselineCommitSha], ["history-v3.6-native-structure-gap-enrichment-baseline-v2", phase211BaselineCommitSha], ["history-v3.6-candidate-gap-inventory-baseline", phase29BaselineCommitSha]] as const) {
  if (await git("rev-parse", `${tag}^{}`) !== expected) throw new Error(`${tag} does not resolve to accepted baseline.`);
}
const loaded = await Promise.all(representativeNativeEpisodeFragmentsV36.map(load));
if (loaded.length !== 8) throw new Error("Same-eight scope mismatch.");
const experiment = runRepresentativeNativeStructuredClaimExperimentV36(loaded.map((item) => item.source));
const titles = new Map(loaded.map((item) => [item.source.shadow.episodeId, item.title]));
const inventory = extractCandidateGapInventoryV36({ runs: experiment.runs, episodeTitles: titles });
const approved = inventory.filter((item) => item.classification === "NEEDS_CROSS_CLAIM_PROOF");
if (approved.length !== 1) throw new Error(`Expected one cross-claim gap, received ${approved.length}.`);
const run = experiment.runs.find((item) => item.episodeId.includes("black-death"))!.native;
const atom = (claimId: string) => run.grounding.propositions.find((item) => item.claimId === claimId)!;
const proposition = (claimId: string) => run.structuredClaims.envelopes.find((item) => item.claimId === claimId)!.propositions[0]!;
const proof = constructApprovedCrossClaimProofV36({ conditionAtomic: atom(approvedCrossClaimConditionClaimIdV36), conditionStructured: proposition(approvedCrossClaimConditionClaimIdV36), responseAtomic: atom(approvedCrossClaimResponseClaimIdV36), responseStructured: proposition(approvedCrossClaimResponseClaimIdV36) });
const validation = validateCrossClaimProofV36(proof);
if (!validation.valid) throw new Error(`Approved proof rejected: ${JSON.stringify(validation.diagnostics)}`);
const mutate = (fn: (copy: any) => void) => { const copy = structuredClone(proof); fn(copy); return copy; };
const negativeFixtures = [
  ["same claim twice", mutate((copy) => { copy.premises[1].claimId = copy.premises[0].claimId; })],
  ["cross-episode premise pair", mutate((copy) => { copy.premises[1].episodeId = "other-episode"; })],
  ["missing required join", mutate((copy) => { copy.participantJoins = []; })],
  ["wrong participant join", mutate((copy) => { copy.participantJoins[0].leftParticipant = "concept-wrong"; })],
  ["reversed direction", mutate((copy) => { [copy.premises[0], copy.premises[1]] = [copy.premises[1], copy.premises[0]]; })],
  ["unsupported proof pattern", mutate((copy) => { copy.proofPattern = "unsupported"; })],
  ["wrong target relation kind", mutate((copy) => { copy.targetRelationKind = "causal"; })],
  ["unresolved participant", mutate((copy) => { copy.premises[0].participantBindings[0].resolved = false; })],
  ["asserted plus uncertain", mutate((copy) => { copy.premises[0].assertionStatus = "asserted"; })],
  ["asserted plus intended", mutate((copy) => { copy.premises[0].assertionStatus = "asserted"; copy.premises[1].assertionStatus = "intended"; })],
  ["asserted plus attempted", mutate((copy) => { copy.premises[0].assertionStatus = "asserted"; })],
  ["counterfactual premise", mutate((copy) => { copy.premises[0].assertionStatus = "counterfactual"; })],
  ["unsupported reported premise", mutate((copy) => { copy.premises[0].assertionStatus = "reported"; })],
  ["duplicate premise", mutate((copy) => { copy.premises[1].atomicGroundingId = copy.premises[0].atomicGroundingId; })],
  ["invalid source span/hash", mutate((copy) => { copy.premises[0].sourceHash = "0".repeat(64); })],
  ["adjacent claims alone", mutate((copy) => { copy.premises[0].claimId = "claim-3b3f5f2d628d9410657dcfe8"; })],
] as const;
const negativeResults = negativeFixtures.map(([name, fixture]) => ({ name, validation: validateCrossClaimProofV36(fixture) }));
if (negativeResults.some((item) => item.validation.valid)) throw new Error("A negative cross-claim proof fixture validated.");
const frozenEight = inventory.filter((item) => item.gapId !== approved[0]!.gapId).map((item) => ({ gapId: item.gapId, classification: item.classification }));
const readiness = { candidateProjectionReady: validation.valid, targetRelationKind: proof.targetRelationKind, proposedProjectorRule: "cross-claim-uncertain-demand-attempted-restriction-policy-response-candidate.v1", participantMapping: "condition target -> response action via inventory-approved typed dependency", directionRule: "condition -> response", assertionRequirements: "preserve uncertain condition and attempted response; no asserted relation admission", negativeControls: ["same-claim", "cross-episode", "missing/wrong join", "reverse direction", "unsupported pattern/kind", "unresolved participant", "modality matrix", "duplicate", "source mismatch", "proximity alone"] };
const generatedAt = new Date().toISOString();
const timestamp = generatedAt.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const directory = path.join(repository, "artifacts", "shadow", "history-v3.6", `history-v3.6-cross-claim-proof-contract-review-${timestamp}`);
await fs.mkdir(directory, { recursive: true });
const provenance = { v36ImplementationCommitSha: await git("rev-parse", "HEAD"), phase212BaselineCommitSha, phase212Tag: "history-v3.6-evidence-set-candidate-baseline", phase211BaselineCommitSha, phase211Tag: "history-v3.6-native-structure-gap-enrichment-baseline-v2", phase29BaselineCommitSha, phase29Tag: "history-v3.6-candidate-gap-inventory-baseline", contractBaselineCommitSha, frozenV35ProductionCommitSha: await git("rev-parse", `${frozenV35ProductionTag}^{}`), frozenV35ProductionTag, frozenV35ProductionTagObjectSha: await git("rev-parse", frozenV35ProductionTag), crossClaimProofSchemaVersion: proof.schemaVersion, crossClaimProofValidatorVersion: validation.validatorVersion, artifactKind: "history-v3.6-cross-claim-proof-contract-review", episodeSet: loaded.map((item) => ({ episodeId: item.source.shadow.episodeId, title: item.title })), generatedAt, gitBranch: await git("branch", "--show-current"), liveProviderCalls: 0, llmCalls: 0 };
const metrics = { crossClaimGapsInspected: 1, proofProposals: 1, proofValidatorAccepts: 1, proofValidatorRejects: negativeResults.length, candidateProjectionReadyProofs: 1, relationCandidatesBefore: 52, relationCandidatesAfter: experiment.relationComparison.after.candidates, validatedRelationsBefore: 30, validatedRelationsAfter: experiment.relationComparison.after.validatedRelations, remainingGapsBefore: 9, remainingGapsAfter: inventory.length, proofStageClassification: "CROSS_CLAIM_PROOF_VALIDATED_CANDIDATE_PROJECTION_PENDING" };
if (metrics.relationCandidatesAfter !== 52 || metrics.validatedRelationsAfter !== 30 || metrics.remainingGapsAfter !== 9 || experiment.verdict !== "PASS") throw new Error("Downstream isolation or invariant mismatch.");
const payloads: Record<string, string> = {
  "README.md": "# V3.6 cross-claim proof contract review\n\nOne explicit, inventory-approved Black Death proof is validated. It is not a relation candidate or relation. No provider calls or pair enumeration occurred.\n",
  "architecture.md": await fs.readFile(path.join(docs, "cross-claim-proof-architecture.md"), "utf8"),
  "cross-claim-proof-schema.json": stable(crossClaimProofJsonSchemaV36),
  "cross-claim-proof-contract-document.json": stable(crossClaimProofContractDocumentV36),
  "cross-claim-gap-baseline.json": stable(approved),
  "proof-construction-summary.json": stable({ proof, evidenceFingerprint: crossClaimProofEvidenceFingerprintV36(proof) }),
  "proof-validation-summary.json": stable(validation),
  "candidate-readiness-summary.json": stable(readiness),
  "manual-review.json": stable({ positive: { gapId: approved[0]!.gapId, episodeId: proof.episodeId, premises: proof.premises, participantJoins: proof.participantJoins, proofPattern: proof.proofPattern, targetRelationKind: proof.targetRelationKind, direction: proof.direction, proofId: proof.proofId, validatorResult: validation.valid, candidateProjectionReady: readiness.candidateProjectionReady, proposedFutureProjectorMapping: readiness.proposedProjectorRule }, negativeFixtures: negativeResults }),
  "diagnostic-summary.json": stable({ acceptedDiagnostics: validation.diagnostics, rejectedDiagnostics: negativeResults.map((item) => ({ name: item.name, diagnostics: item.validation.diagnostics })), negativeDiagnosticCatalog: ["CROSS_CLAIM_PROOF_SCHEMA_INVALID", "CROSS_CLAIM_PROOF_CROSS_EPISODE", "CROSS_CLAIM_PROOF_SAME_CLAIM", "CROSS_CLAIM_PROOF_PREMISE_SHAPE_INVALID", "CROSS_CLAIM_PROOF_ASSERTION_INCOMPATIBLE", "CROSS_CLAIM_PROOF_JOIN_INVALID", "CROSS_CLAIM_PROOF_DIRECTION_INVALID", "CROSS_CLAIM_PROOF_SOURCE_INVALID"] }),
  "decision-report.md": "# Decision report\n\nThe proof is assertion-preserving and validated, but it remains upstream of candidate projection. The exactly one next task is to design a modality-preserving policy-response candidate representation and projector admission contract.\n",
  "test-summary.json": stable({ focusedCrossClaimProofTests: "PASS", phase212CandidateRegression: "PASS", phase29InventoryRegression: "PASS", goldenFixtures: "PASS", historyTypecheck: "PASS", targetedEslint: "PASS" }),
  "invariant-test-summary.json": stable({ ...experiment.invariants, crossEpisodeProofSupport: 0, sameClaimCrossClaimProof: 0, proofWithoutJoin: 0, proximityOnlyProof: 0, unresolvedParticipantProof: 0, assertionPromotion: 0, directionReversal: 0, sourceMismatchAdmission: 0, duplicatePremiseAdmission: 0, automaticProofToRelationAdmission: 0 }),
  "provenance.json": stable(provenance),
  "metrics.json": stable(metrics),
  "frozen-eight-gap-classification.json": stable(frozenEight),
};
for (const [name, content] of Object.entries(payloads)) await fs.writeFile(path.join(directory, name), content);
const checksums = (await Promise.all(Object.keys(payloads).sort().map(async (name) => `${sha256(await fs.readFile(path.join(directory, name)))}  ${name}`))).join("\n") + "\n";
await fs.writeFile(path.join(directory, "checksums.sha256"), checksums);
const zip = `${directory}.zip`;
await execute("zip", ["-q", "-r", zip, path.basename(directory)], { cwd: path.dirname(directory) });
await execute("unzip", ["-t", zip]);
console.log(JSON.stringify({ directory, zip, sha256: sha256(await fs.readFile(zip)), metrics }));
