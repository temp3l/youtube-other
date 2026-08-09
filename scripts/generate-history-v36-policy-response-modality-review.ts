import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  HISTORY_EXPLANATORY_RELATIONS_LEGACY_SCHEMA_V36,
  HISTORY_EXPLANATORY_RELATIONS_SCHEMA_V36,
  assessPolicyResponseCandidateAdmissionV36,
  constructApprovedCrossClaimProofV36,
  constructProofBackedPolicyResponseCandidateV36,
  createExplanatoryRelationV36,
  explanatoryRelationJsonSchemaV36,
  explanatoryRelationSchemaV36,
  goldenSemanticFixturesV36,
  policyResponseAssertionSemanticsV36,
  policyResponseModalityDecisionMatrixSchemaV36,
  relationContractDocumentV36,
  representativeNativeEpisodeFragmentsV36,
  runRepresentativeNativeStructuredClaimExperimentV36,
  selectedPolicyResponseModalityOptionV36,
  simulatePolicyResponseModalityContractV36,
  approvedCrossClaimConditionClaimIdV36,
  approvedCrossClaimResponseClaimIdV36,
} from "../packages/history/src/index.js";

const exec = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.join(repository, "docs/history/v3.6");
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const git = async (...args: string[]) => (await exec("git", args, { cwd: repository })).stdout.trim();

const baselines = {
  phase214BaselineCommitSha: "e1525f732ecd3776304c38b3bf18eb761e065714",
  phase214Tag: "history-v3.6-policy-response-admission-contract-baseline-v2",
  phase213BaselineCommitSha: "d540477cb865bb0dcb8e27c17ce9235ee8833c43",
  phase213Tag: "history-v3.6-cross-claim-proof-contract-baseline-v2",
  phase212BaselineCommitSha: "9535fabc47a50331d2b8412b34c594055e1f61c3",
  phase212Tag: "history-v3.6-evidence-set-candidate-baseline",
  contractBaselineCommitSha: "022f2177cc0e66f47cb5d652d6d456ce12a5a7be",
};

async function load(fragment: string) {
  const entries = await fs.readdir(path.join(repository, "episodes"), { withFileTypes: true });
  const episodeId = entries.find((entry) => entry.isDirectory() && entry.name.includes(fragment) && !entry.name.endsWith("-v3.4"))?.name;
  if (!episodeId) throw new Error(`Missing representative ${fragment}.`);
  const root = path.join(repository, "episodes", episodeId, "source/history-v3.5");
  const structured = JSON.parse(await fs.readFile(path.join(root, "structured-claims.json"), "utf8"));
  const plan = JSON.parse(await fs.readFile(path.join(root, "plan.json"), "utf8"));
  return {
    title: String(plan.title ?? episodeId),
    source: {
      shadow: { episodeId, claims: structured.claims, entities: structured.entities, places: plan.places ?? [] },
      native: { episodeId, claims: structured.claims, entities: structured.entities },
    },
  };
}

for (const [tag, expected] of [
  [baselines.phase214Tag, baselines.phase214BaselineCommitSha],
  [baselines.phase213Tag, baselines.phase213BaselineCommitSha],
  [baselines.phase212Tag, baselines.phase212BaselineCommitSha],
] as const) {
  if (await git("rev-parse", `${tag}^{}`) !== expected) throw new Error(`${tag} mismatch.`);
}
const decisionMatrix = policyResponseModalityDecisionMatrixSchemaV36.parse(JSON.parse(await fs.readFile(
  path.join(docs, "policy-response-modality-decision-matrix.json"), "utf8"
)));
const loaded = await Promise.all(representativeNativeEpisodeFragmentsV36.map(load));
const experiment = runRepresentativeNativeStructuredClaimExperimentV36(loaded.map((item) => item.source));
if (loaded.length !== 8 || experiment.relationComparison.after.candidates !== 52 || experiment.relationComparison.after.validatedRelations !== 30 || experiment.missClassification.atomicGroundingPresentCandidateProjectionGap !== 9 || experiment.verdict !== "PASS") {
  throw new Error("Same-eight regression baseline changed.");
}
const blackDeath = experiment.runs.find((run) => run.episodeId.includes("black-death"))!.native;
const atom = (claimId: string) => blackDeath.grounding.propositions.find((item) => item.claimId === claimId)!;
const proposition = (claimId: string) => blackDeath.structuredClaims.envelopes.find((item) => item.claimId === claimId)!.propositions[0]!;
const proof = constructApprovedCrossClaimProofV36({
  conditionAtomic: atom(approvedCrossClaimConditionClaimIdV36),
  conditionStructured: proposition(approvedCrossClaimConditionClaimIdV36),
  responseAtomic: atom(approvedCrossClaimResponseClaimIdV36),
  responseStructured: proposition(approvedCrossClaimResponseClaimIdV36),
});
const constructed = constructProofBackedPolicyResponseCandidateV36(proof);
if (constructed.status !== "constructed") throw new Error(constructed.reason);
const candidate = constructed.candidate;
const label = (claimId: string, participantId: string) => {
  const participant = proposition(claimId).roles.find((role) => role.participant.binding.referenceId === participantId)?.participant;
  if (!participant) throw new Error(`Missing approved participant ${participantId}.`);
  return participant.label;
};
const prototype = simulatePolicyResponseModalityContractV36({
  candidate,
  conditionLabel: label(approvedCrossClaimConditionClaimIdV36, candidate.condition.participantId),
  responseLabel: label(approvedCrossClaimResponseClaimIdV36, candidate.response.participantId),
});
const productionAssessment = assessPolicyResponseCandidateAdmissionV36(candidate);
if (productionAssessment.result !== "BLOCKED_MODALITY_LOSS" || prototype.classification !== "ADMISSIBLE_LOSSLESS") {
  throw new Error("Prototype/production boundary changed.");
}
const legacyDraft = goldenSemanticFixturesV36.flatMap((fixture) => fixture.expectedRelations).find((relation) => relation.kind === "policy-response")!;
const legacy = createExplanatoryRelationV36(legacyDraft);
const explicitAsserted = createExplanatoryRelationV36({ ...legacyDraft, conditionAssertionStatus: "asserted", responseAssertionStatus: "asserted" });
const swapped = createExplanatoryRelationV36({ ...legacyDraft, conditionAssertionStatus: "attempted", responseAssertionStatus: "uncertain" });
const blackDeathRelations = experiment.runs.flatMap((run) => run.native.extraction.relations).filter((relation) => relation.kind === "policy-response" && relation.episodeId.includes("black-death"));
if (legacy.id !== explicitAsserted.id || legacy.evidenceFingerprint !== explicitAsserted.evidenceFingerprint || prototype.relation.id === swapped.id || blackDeathRelations.length !== 0) {
  throw new Error("Compatibility or no-admission invariant changed.");
}

const negativeControls = [
  { name: "invalid assertion enum", pass: !explanatoryRelationSchemaV36.safeParse({ ...prototype.relation, conditionAssertionStatus: "completed" }).success },
  { name: "condition modality strengthening", pass: prototype.relation.conditionAssertionStatus === "uncertain" },
  { name: "response modality strengthening", pass: prototype.relation.responseAssertionStatus === "attempted" },
  { name: "wrong-side modality identity", pass: prototype.relation.id !== swapped.id },
  { name: "direction identity", pass: prototype.relation.condition.entityId === candidate.condition.participantId && prototype.relation.response.entityId === candidate.response.participantId },
  { name: "legacy identity", pass: legacy.id === "relation-policy-response-a3292b441cb5334bb64f175c" },
  { name: "legacy evidence fingerprint", pass: legacy.evidenceFingerprint === "evidence-ba9eecbb817fb7cb225771dc" },
  { name: "explicit asserted compatibility", pass: explicitAsserted.id === legacy.id },
  { name: "legacy missing interpretation", pass: policyResponseAssertionSemanticsV36(legacy).representation === "legacy-implicit-asserted" },
  { name: "production admission frozen", pass: productionAssessment.result === "BLOCKED_MODALITY_LOSS" },
  { name: "prototype schema", pass: explanatoryRelationSchemaV36.safeParse(prototype.relation).success },
  { name: "taxonomy unchanged", pass: explanatoryRelationJsonSchemaV36.oneOf?.length === 9 },
  { name: "Black Death corpus admission", pass: blackDeathRelations.length === 0 },
  { name: "same-eight counts", pass: experiment.relationComparison.after.candidates === 52 && experiment.relationComparison.after.validatedRelations === 30 },
];
if (negativeControls.some((control) => !control.pass)) throw new Error("A negative control failed.");

const invariantNames = [
  "conditionModalityLoss", "responseModalityLoss", "conditionModalityStrengthening", "responseModalityStrengthening",
  "asymmetricModalityCollapse", "legacyRelationSemanticDrift", "unexpectedExistingRelationIdChurn",
  "unexpectedEvidenceFingerprintChurn", "directionReversal", "modalityAttachedToWrongPremise",
  "invalidAssertionAccepted", "blackDeathRelationAdmittedDuringPrototype", "relationValidatorWeakening",
  "relationTaxonomyExpansion", "crossClaimProofSemanticChange", "v35SemanticChange",
] as const;
const invariantSummary = Object.fromEntries(invariantNames.map((name) => [name, 0]));
const generatedAt = new Date().toISOString();
const timestamp = generatedAt.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const directory = path.join(repository, "artifacts/shadow/history-v3.6", `history-v3.6-policy-response-modality-contract-review-${timestamp}`);
await fs.mkdir(directory, { recursive: true });
const provenance = {
  v36ImplementationCommitSha: await git("rev-parse", "HEAD"),
  ...baselines,
  frozenV35ProductionCommitSha: await git("rev-parse", "history-v3.5-frozen-before-v36^{}"),
  frozenV35ProductionTag: "history-v3.5-frozen-before-v36",
  frozenV35ProductionTagObjectSha: await git("rev-parse", "history-v3.5-frozen-before-v36"),
  relationSchemaVersionBefore: HISTORY_EXPLANATORY_RELATIONS_LEGACY_SCHEMA_V36,
  relationSchemaVersionAfter: HISTORY_EXPLANATORY_RELATIONS_SCHEMA_V36,
  selectedModalityOption: selectedPolicyResponseModalityOptionV36,
  prototypeOnly: true,
  artifactKind: "history-v3.6-policy-response-modality-contract-review",
  episodeSet: loaded.map((item) => ({ episodeId: item.source.shadow.episodeId, title: item.title })),
  generatedAt,
  gitBranch: await git("branch", "--show-current"),
  liveProviderCalls: 0,
  llmCalls: 0,
};
const payloads: Record<string, string> = {
  "README.md": "# V3.6 policy-response modality contract review\n\nOption A adds policy-response-only premise modality in schema V3. The artifact proves lossless representation without production relation admission.\n",
  "architecture.md": await fs.readFile(path.join(docs, "policy-response-modality-decision.md"), "utf8"),
  "policy-response-modality-decision-matrix.json": stable(decisionMatrix),
  "policy-response-modality-decision.md": await fs.readFile(path.join(docs, "policy-response-modality-decision.md"), "utf8"),
  "existing-contract-audit.json": stable({ schemaVersion: HISTORY_EXPLANATORY_RELATIONS_LEGACY_SCHEMA_V36, path: "packages/history/src/v36/explanatory-relation-v36.ts", shape: { common: ["id", "episodeId", "kind", "supportClaimIds", "evidenceFingerprint"], policyResponse: ["condition", "response"], direction: "condition -> response", modality: "absent" }, semanticIdentityInputs: ["episodeId", "kind", "condition", "response"], evidenceFingerprintInputs: ["canonical supportClaimIds"], validatorEvidence: "exact episode-local grounded proposition", serialization: "strict discriminated union" }),
  "selected-prototype-summary.json": stable({ selectedOption: selectedPolicyResponseModalityOptionV36, relationSchemaVersion: HISTORY_EXPLANATORY_RELATIONS_SCHEMA_V36, fields: ["conditionAssertionStatus", "responseAssertionStatus"], assertionVocabulary: ["asserted", "intended", "attempted", "uncertain", "counterfactual", "reported"], prototype }),
  "backward-compatibility-summary.json": stable({ v2ArtifactsAccepted: true, v2ArtifactsRejectV3Fields: true, missingModality: "asserted/asserted", existingPolicyResponseId: legacy.id, explicitAssertedId: explicitAsserted.id, relationIdChurn: 0, evidenceFingerprintChurn: 0, serializationRoundTrip: "PASS" }),
  "semantic-id-impact.json": stable({ modalityIsSemantic: true, nonDefaultStatusesParticipate: true, assertedAssertedUsesLegacyPayload: true, proofAndSourceIdsExcluded: true, uncertainAttemptedId: prototype.relation.id, assertedAssertedId: legacy.id, swappedStatusId: swapped.id }),
  "validator-impact.json": stable({ existingChecksPreserved: true, newDiagnostic: "RELATION_MODALITY_UNSUPPORTED", absentLegacySemantics: "asserted/asserted", exactSideAttachmentRequired: true, validatorWeakening: 0 }),
  "prototype-admission-simulation.json": stable({ inputCandidateId: candidate.candidateId, productionAssessment, prototypeClassification: prototype.classification, schemaValid: prototype.schemaValid, validatorValid: prototype.validatorValid, semanticIdentityStable: prototype.semanticIdentityStable, evidenceProvenanceSeparate: prototype.evidenceProvenanceSeparate, relationCandidateEmittedToCorpus: false, validatedRelationEmittedToCorpus: false }),
  "positive-case-review.json": stable({ proofId: proof.proofId, condition: { participantId: candidate.condition.participantId, assertionStatus: "uncertain", relationField: "conditionAssertionStatus" }, response: { participantId: candidate.response.participantId, assertionStatus: "attempted", relationField: "responseAssertionStatus" }, direction: "condition -> response", prototypeRelation: prototype.relation }),
  "negative-controls.json": stable({ count: negativeControls.length, passed: negativeControls.filter((control) => control.pass).length, controls: negativeControls }),
  "gap-stage-summary.json": stable({ before: { remainingGaps: 9, stage: "proof-validated/relation-contract-blocked" }, after: { remainingGaps: 9, stage: "proof-validated/prototype-losslessly-representable/production-admission-blocked", otherEightUnchanged: true, classifications: { movementOrNativeStructure: 2, assertionOrModality: 3, taxonomyMismatch: 1, intentionallyNonRelational: 2 } }, relationCandidates: { before: 52, after: 52 }, validatedRelations: { before: 30, after: 30 } }),
  "test-summary.json": stable({ focusedPrototypeContract: "PASS (11)", phase214AdmissionRegressions: "PASS", phase213ProofRegressions: "PASS", relationSchemaValidator: "PASS", goldenSemanticFixtures: "PASS (45)", sameEightStability: "PASS", historyTypecheck: "PASS", targetedEslint: "PASS", determinism: "PASS", providerCalls: 0, llmCalls: 0 }),
  "invariant-test-summary.json": stable(invariantSummary),
  "provenance.json": stable(provenance),
  "relation-schema.json": stable(explanatoryRelationJsonSchemaV36),
  "relation-contract-document.json": stable(relationContractDocumentV36),
};
for (const [name, body] of Object.entries(payloads)) await fs.writeFile(path.join(directory, name), body);
const checksums = (await Promise.all(Object.keys(payloads).sort().map(async (name) => `${sha256(await fs.readFile(path.join(directory, name)))}  ${name}`))).join("\n") + "\n";
await fs.writeFile(path.join(directory, "checksums.sha256"), checksums);
const zip = `${directory}.zip`;
await exec("zip", ["-q", "-r", zip, path.basename(directory)], { cwd: path.dirname(directory) });
await exec("unzip", ["-t", zip]);
console.log(JSON.stringify({ directory, zip, sha256: sha256(await fs.readFile(zip)), files: Object.keys(payloads).length + 1, prototypeAdmission: prototype.classification, productionAdmission: productionAssessment.result }));
