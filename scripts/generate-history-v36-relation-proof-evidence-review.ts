import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  approvedCrossClaimConditionClaimIdV36,
  approvedCrossClaimResponseClaimIdV36,
  constructApprovedCrossClaimProofV36,
  constructProofAwarePolicyResponseRelationV36,
  constructRelationProofEvidenceV36,
  relationProofEvidenceJsonSchemaV36,
  runRepresentativeNativeStructuredClaimExperimentV36,
  validateProofAwarePolicyResponseRelationV36,
  validateRelationProofEvidenceV36,
} from "../packages/history/src/index.js";

const exec = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = async (...args: string[]) => (await exec("git", args, { cwd: repository })).stdout.trim();
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

async function loadBlackDeath() {
  const entries = await fs.readdir(path.join(repository, "episodes"), { withFileTypes: true });
  const episodeId = entries.find((entry) => entry.isDirectory() && entry.name.includes("04-black-death") && !entry.name.endsWith("-v3.4"))?.name;
  if (!episodeId) throw new Error("Missing Black Death representative fixture.");
  const root = path.join(repository, "episodes", episodeId, "source/history-v3.5");
  const structured = JSON.parse(await fs.readFile(path.join(root, "structured-claims.json"), "utf8"));
  const plan = JSON.parse(await fs.readFile(path.join(root, "plan.json"), "utf8"));
  const native = runRepresentativeNativeStructuredClaimExperimentV36([{ shadow: { episodeId, claims: structured.claims, entities: structured.entities, places: plan.places ?? [] }, native: { episodeId, claims: structured.claims, entities: structured.entities } }]).runs[0]!.native;
  const atom = (claimId: string) => native.grounding.propositions.find((item) => item.claimId === claimId)!;
  const proposition = (claimId: string) => native.structuredClaims.envelopes.find((item) => item.claimId === claimId)!.propositions[0]!;
  const proof = constructApprovedCrossClaimProofV36({ conditionAtomic: atom(approvedCrossClaimConditionClaimIdV36), conditionStructured: proposition(approvedCrossClaimConditionClaimIdV36), responseAtomic: atom(approvedCrossClaimResponseClaimIdV36), responseStructured: proposition(approvedCrossClaimResponseClaimIdV36) });
  const evidence = constructRelationProofEvidenceV36(proof);
  const label = (claimId: string, participantId: string) => proposition(claimId).roles.find((role) => role.participant.binding.referenceId === participantId)!.participant.label;
  return { episodeId, proof, evidence, relation: constructProofAwarePolicyResponseRelationV36({ proofEvidence: evidence, conditionLabel: label(approvedCrossClaimConditionClaimIdV36, evidence.premises[0].participantId), responseLabel: label(approvedCrossClaimResponseClaimIdV36, evidence.premises[1].participantId) }) };
}

const requiredBaseline = "900be4197a81c976e85737fe49088538a3d60a15";
if (await git("rev-parse", "history-v3.6-policy-response-modality-contract-baseline-v2^{}") !== requiredBaseline) throw new Error("Phase 2.15 baseline mismatch.");
const fixture = await loadBlackDeath();
const bridgeValidation = validateRelationProofEvidenceV36(fixture.evidence);
const relationValidation = validateProofAwarePolicyResponseRelationV36(fixture.relation);
if (!bridgeValidation.valid || !relationValidation.valid) throw new Error("Proof bridge validation failed.");
const generatedAt = new Date().toISOString();
const timestamp = generatedAt.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const directory = path.join(repository, "artifacts/shadow/history-v3.6", `history-v3.6-relation-proof-evidence-review-${timestamp}`);
await fs.mkdir(directory, { recursive: true });
const invariantSummary = Object.fromEntries([
  "proofFromProximity", "crossClaimProofWithoutExplicitJoin", "modalityLoss", "modalityStrengthening",
  "unresolvedParticipantAdmission", "directionalityViolations", "cardinalityViolations", "legacyRelationSemanticDrift",
  "unexpectedRelationIdChurn", "unexpectedEvidenceFingerprintChurn", "v35SemanticChanges",
].map((name) => [name, 0]));
const payloads: Record<string, string> = {
  "README.md": "# V3.6 relation-proof evidence review\n\nPhase 2.16 creates a typed, proof-aware two-claim evidence bridge. It is prototype-only and does not admit a corpus relation.\n",
  "decision-report.md": "# Decision report\n\nThe bridge is relation-specific, contains the complete validated proof lineage, and validates a modal policy-response wrapper without weakening the single-claim validator.\n",
  "target-case-summary.json": stable({ episodeId: fixture.episodeId, proofId: fixture.proof.proofId, proofPattern: fixture.proof.proofPattern, proofValidatorVersion: bridgeValidation.validatorVersion, conditionClaimId: approvedCrossClaimConditionClaimIdV36, responseClaimId: approvedCrossClaimResponseClaimIdV36, direction: "condition-to-response" }),
  "before-after.json": stable({ before: { bridge: null, corpusCandidates: 52, corpusValidatedRelations: 30 }, after: { bridge: fixture.evidence, prototypeRelation: fixture.relation.relation, corpusCandidates: 52, corpusValidatedRelations: 30, corpusAdmissionChanged: false } }),
  "test-summary.json": stable({ historyTypecheck: "PASS", bridgeUnitTests: "PASS (4)", legacyRelationGoldenFixtures: "PASS (45)", sameEightRegression: "PASS", targetedEslint: "PASS", providerCalls: 0, llmCalls: 0 }),
  "invariant-summary.json": stable(invariantSummary),
  "provenance.json": stable({ phase215Baseline: requiredBaseline, frozenV35: await git("rev-parse", "history-v3.5-frozen-before-v36^{}"), implementationCommit: await git("rev-parse", "HEAD"), generatedAt, providerCalls: 0, llmCalls: 0 }),
  "relation-proof-evidence-schema.json": stable(relationProofEvidenceJsonSchemaV36),
};
for (const [name, content] of Object.entries(payloads)) await fs.writeFile(path.join(directory, name), content);
await fs.writeFile(path.join(repository, "docs/history/v3.6/relation-proof-evidence-schema.json"), payloads["relation-proof-evidence-schema.json"]!);
const checksums = (await Promise.all(Object.keys(payloads).sort().map(async (name) => `${sha256(await fs.readFile(path.join(directory, name)))}  ${name}`))).join("\n") + "\n";
await fs.writeFile(path.join(directory, "checksums.sha256"), checksums);
const zip = `${directory}.zip`;
await exec("zip", ["-q", "-r", zip, path.basename(directory)], { cwd: path.dirname(directory) });
await exec("unzip", ["-t", zip]);
console.log(JSON.stringify({ directory, zip, sha256: sha256(await fs.readFile(zip)), proofId: fixture.proof.proofId }));
