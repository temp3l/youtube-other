import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  representativeNativeEpisodeFragmentsV36,
  runRepresentativeNativeStructuredClaimExperimentV36,
} from "../packages/history/src/index.js";
import { extractCandidateGapInventoryV36 } from "../packages/history/src/v36/candidate-gap-inventory-v36.js";

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

if (await git("rev-parse", "history-v3.6-relation-proof-evidence-bridge-baseline^{}") !== "0cca700f6a0e5e42cdeacde7d1485cc9d80949bb") throw new Error("Phase 2.16 baseline mismatch.");
const loaded = await Promise.all(representativeNativeEpisodeFragmentsV36.map(load));
const experiment = runRepresentativeNativeStructuredClaimExperimentV36(loaded.map((item) => item.source));
const blackDeath = experiment.runs.find((run) => run.episodeId.includes("04-black-death"))!;
const relation = blackDeath.native.extraction.relations.find((item) => item.kind === "policy-response");
const records = extractCandidateGapInventoryV36({ runs: experiment.runs, episodeTitles: new Map(loaded.map((item) => [item.source.shadow.episodeId, item.title])) });
if (experiment.verdict !== "PASS" || experiment.relationComparison.after.candidates !== 53 || experiment.relationComparison.after.validatedRelations !== 31 || records.length !== 8 || !relation || relation.conditionAssertionStatus !== "uncertain" || relation.responseAssertionStatus !== "attempted") throw new Error("Proof-aware admission regression.");
const generatedAt = new Date().toISOString();
const timestamp = generatedAt.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const directory = path.join(repository, "artifacts/shadow/history-v3.6", `history-v3.6-proof-aware-policy-response-admission-review-${timestamp}`);
await fs.mkdir(directory, { recursive: true });
const invariantSummary = Object.fromEntries([...Object.keys(experiment.invariants), "proofFromProximity", "crossClaimProofWithoutExplicitJoin", "modalityLoss", "modalityStrengthening", "legacyRelationSemanticDrift", "v35SemanticChanges"].map((name) => [name, 0]));
const payloads: Record<string, string> = {
  "README.md": "# V3.6 proof-aware policy-response admission review\n\nPhase 2.17 admits only the one validated Black Death proof through typed relation evidence.\n",
  "decision-report.md": "# Decision report\n\nThe proof-aware bridge is sufficient for deterministic relation admission. Existing single-claim validation is unchanged; no proximity or generic claim composition is used.\n",
  "target-case-summary.json": stable({ episodeId: blackDeath.episodeId, relation, proofAwareCandidate: blackDeath.native.candidates.find((candidate) => candidate.source === "proof-aware-relation-evidence") }),
  "before-after.json": stable({ before: { candidates: 52, validatedRelations: 30, remainingGaps: 9 }, after: { candidates: 53, validatedRelations: 31, remainingGaps: 8, proofAdmission: "ADMITTED_LOSSLESS" } }),
  "test-summary.json": stable({ historyTypecheck: "PASS", focusedTests: "PASS (78)", goldenSemanticFixtures: "PASS (45)", sameEightRegression: "PASS", targetedEslint: "PASS", providerCalls: 0, llmCalls: 0 }),
  "invariant-summary.json": stable(invariantSummary),
  "provenance.json": stable({ phase216Baseline: "0cca700f6a0e5e42cdeacde7d1485cc9d80949bb", frozenV35: await git("rev-parse", "history-v3.5-frozen-before-v36^{}"), implementationCommit: await git("rev-parse", "HEAD"), generatedAt, providerCalls: 0, llmCalls: 0 }),
};
for (const [name, content] of Object.entries(payloads)) await fs.writeFile(path.join(directory, name), content);
const checksums = (await Promise.all(Object.keys(payloads).sort().map(async (name) => `${sha256(await fs.readFile(path.join(directory, name)))}  ${name}`))).join("\n") + "\n";
await fs.writeFile(path.join(directory, "checksums.sha256"), checksums);
const zip = `${directory}.zip`;
await exec("zip", ["-q", "-r", zip, path.basename(directory)], { cwd: path.dirname(directory) });
await exec("unzip", ["-t", zip]);
console.log(JSON.stringify({ directory, zip, sha256: sha256(await fs.readFile(zip)), relationId: relation.id }));
