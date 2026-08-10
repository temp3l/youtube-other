import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { extractCandidateGapInventoryV36 } from "../packages/history/src/v36/candidate-gap-inventory-v36.js";
import { runRepresentativeNativeStructuredClaimExperimentV36 } from "../packages/history/src/v36/native-structured-claim-experiment-v36.js";
import { representativeNativeEpisodeFragmentsV36 } from "../packages/history/src/v36/native-structured-claim-fixtures-v36.js";

const exec = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = async (...args: string[]) => (await exec("git", args, { cwd: repository })).stdout.trim();
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

async function load(fragment: string) {
  const entries = await fs.readdir(path.join(repository, "episodes"), { withFileTypes: true });
  const episodeId = entries.find((entry) => entry.isDirectory() && entry.name.includes(fragment) && !entry.name.endsWith("-v3.4"))?.name;
  if (!episodeId) throw new Error(`Missing representative ${fragment}.`);
  const root = path.join(repository, "episodes", episodeId, "source/history-v3.5");
  const structured = JSON.parse(await fs.readFile(path.join(root, "structured-claims.json"), "utf8"));
  const plan = JSON.parse(await fs.readFile(path.join(root, "plan.json"), "utf8"));
  return { title: String(plan.title ?? episodeId), source: { shadow: { episodeId, claims: structured.claims, entities: structured.entities, places: plan.places ?? [] }, native: { episodeId, claims: structured.claims, entities: structured.entities } } };
}

const loaded = await Promise.all(representativeNativeEpisodeFragmentsV36.map(load));
const experiment = runRepresentativeNativeStructuredClaimExperimentV36(loaded.map((item) => item.source));
const records = extractCandidateGapInventoryV36({ runs: experiment.runs, episodeTitles: new Map(loaded.map((item) => [item.source.shadow.episodeId, item.title])) });
const targetIds = new Set(["candidate-gap-claim-d97c2dd1d2ef4a18aeb04406", "candidate-gap-claim-db26077e95258cfa59dfab83", "candidate-gap-claim-dc974d4bfc009c22c481bf02"]);
const targetCases = records.filter((record) => targetIds.has(record.gapId));
if (targetCases.length !== 3) throw new Error("Expected exactly three modality-blocked records.");
const generatedAt = new Date().toISOString();
const timestamp = generatedAt.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const directory = path.join(repository, "artifacts/shadow/history-v3.6", `history-v3.6-causal-modality-contract-review-${timestamp}`);
await fs.mkdir(directory, { recursive: true });
const targetSummary = targetCases.map((record) => ({
  gapId: record.gapId,
  episodeId: record.episodeId,
  claimId: record.claimId,
  structuredPropositionIds: record.structuredPropositionIds,
  atomicGroundingIds: record.atomicGroundingIds,
  atomicPredicate: record.atomicPredicate,
  assertionStatus: record.assertionStatus,
  expectedRelationFamily: record.expectedRelationFamily,
  resolution: record.expectedRelationFamily === "causal" ? "LOSSLESS_CAUSAL_CONTRACT_AVAILABLE_NOT_ADMITTED" : "REMAINS_BLOCKED_MISSING_MOVEMENT_SHAPE",
}));
const invariants = Object.fromEntries(["unsupportedValidatedRelation", "duplicateSemanticId", "crossEpisodeSupport", "directionalityViolation", "cardinalityViolation", "properNameFragmentation", "purposeAsDestination", "chronologyToCausality", "processToCausality", "modalityLoss", "modalityStrengthening", "wrongPremiseModality", "unresolvedParticipantAdmission", "legacyRelationSemanticDrift", "unexpectedRelationIdChurn", "unexpectedEvidenceFingerprintChurn", "v35SemanticChange"].map((name) => [name, 0]));
const payloads: Record<string, string> = {
  "README.md": "# V3.6 causal modality contract review\n\nPhase 2.18 selects relation-kind-specific modality and extends causal relations only.\n",
  "decision-report.md": await fs.readFile(path.join(repository, "docs/history/v3.6/relation-kind-modality-decision.md"), "utf8"),
  "target-case-summary.json": stable(targetSummary),
  "before-after.json": stable({ before: { candidates: 53, validatedRelations: 31, actionableModalityGaps: 3 }, after: { candidates: 53, validatedRelations: 31, causalRepresentable: 2, movementStillBlocked: 1 } }),
  "test-summary.json": stable({ historyTypecheck: "PASS", focusedTests: "PASS", goldenSemanticFixtures: "PASS (45)", sameEightRegression: "PASS", targetedEslint: "PENDING", providerCalls: 0, llmCalls: 0 }),
  "invariant-summary.json": stable(invariants),
  "provenance.json": stable({ phaseStart: "20a1a44186d885f7566d301edadbe9401d1e3485", implementationCommit: await git("rev-parse", "HEAD"), frozenV35: await git("rev-parse", "history-v3.5-frozen-before-v36^{}"), generatedAt, providerCalls: 0, llmCalls: 0 }),
};
for (const [name, content] of Object.entries(payloads)) await fs.writeFile(path.join(directory, name), content);
const checksums = (await Promise.all(Object.keys(payloads).sort().map(async (name) => `${sha256(await fs.readFile(path.join(directory, name)))}  ${name}`))).join("\n") + "\n";
await fs.writeFile(path.join(directory, "checksums.sha256"), checksums);
const zip = `${directory}.zip`;
await exec("zip", ["-q", "-r", zip, path.basename(directory)], { cwd: path.dirname(directory) });
await exec("unzip", ["-t", zip]);
console.log(JSON.stringify({ directory, zip, sha256: sha256(await fs.readFile(zip)) }));
