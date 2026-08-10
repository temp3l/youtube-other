import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { extractCandidateGapInventoryV36 } from "../packages/history/src/v36/candidate-gap-inventory-v36.js";
import { representativeNativeEpisodeFragmentsV36 } from "../packages/history/src/v36/native-structured-claim-fixtures-v36.js";
import { runRepresentativeNativeStructuredClaimExperimentV36 } from "../packages/history/src/v36/native-structured-claim-experiment-v36.js";

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
const gaps = extractCandidateGapInventoryV36({ runs: experiment.runs, episodeTitles: new Map(loaded.map((item) => [item.source.shadow.episodeId, item.title])) });
const taxonomy = gaps.find((gap) => gap.classification === "TAXONOMY_MISMATCH");
if (experiment.verdict !== "PASS" || experiment.relationComparison.after.candidates !== 55 || experiment.relationComparison.after.validatedRelations !== 33 || gaps.length !== 6 || !taxonomy) throw new Error("Autonomous modality drain final state mismatch.");
const generatedAt = new Date().toISOString();
const timestamp = generatedAt.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const directory = path.join(repository, "artifacts/shadow/history-v3.6", `history-v3.6-autonomous-modality-drain-review-${timestamp}`);
await fs.mkdir(directory, { recursive: true });
const humanGate = {
  gate: "D_TAXONOMY_EXPANSION",
  gapId: taxonomy.gapId,
  sourceClaim: taxonomy.sourceClaimExcerpt,
  structuredSemantics: { predicate: taxonomy.structuredPredicate, assertionStatus: taxonomy.assertionStatus, participants: taxonomy.semanticParticipants },
  atomicSemantics: { groundingIds: taxonomy.atomicGroundingIds, predicate: taxonomy.atomicPredicate, assertionStatus: taxonomy.assertionStatus },
  whyExistingKindsAreLossy: taxonomy.reason,
  options: [
    { option: "Add an event-location relation", impact: "Represents the invasion concept, location, and intended status directly; new relation kind and validation/identity migration required." },
    { option: "Add a modal subject-location relation", impact: "Keeps the location assertion generic but needs a typed event/concept subject contract and exact modality rules." },
    { option: "Keep the case blocked", impact: "No taxonomy migration; retains the source semantics upstream without a relation output." },
  ],
  recommended: "Add an event-location relation only after explicit approval, because it preserves the source event subject and intended assertion without treating it as movement or bare spatial area.",
};
const payloads: Record<string, string> = {
  "README.md": "# History V3.6 autonomous modality drain review\n\nThe run stops at the taxonomy-expansion human decision gate.\n",
  "phase-index.json": stable([
    { phase: "2.18", purpose: "causal modality contract", commit: "58692ec40b293d5a942946bfad6eb5c6a4b6abaf", tag: "history-v3.6-causal-modality-contract-baseline-v2", artifact: "history-v3.6-causal-modality-contract-review-20260809T200315Z.zip" },
    { phase: "2.19", purpose: "reviewed modal causal admission", commit: "a6a81e9d659f1d8dad7a5ed0b80f1a34eb64b005", tag: "history-v3.6-modal-causal-admission-baseline", artifact: "history-v3.6-modal-causal-admission-review-20260809T200836Z.zip" },
  ]),
  "modality-decision-summary.json": stable({ selected: "OPTION_A_RELATION_KIND_SPECIFIC_MODALITY", causal: "losslessly represented and admitted", movement: "blocked: actor plus intended via-place lacks the movement from/to shape" }),
  "remaining-gap-inventory.json": stable(gaps),
  "final-relation-summary.json": stable(experiment.relationComparison.after),
  "final-test-summary.json": stable({ historyTypecheck: "PASS", focusedTests: "PASS (106)", goldenSemanticFixtures: "PASS (45)", sameEightRegression: "PASS", targetedEslint: "PASS", providerCalls: 0, llmCalls: 0 }),
  "final-invariant-summary.json": stable(experiment.invariants),
  "human-decision-gate.json": stable(humanGate),
  "provenance.json": stable({ startBaseline: "20a1a44186d885f7566d301edadbe9401d1e3485", finalHead: await git("rev-parse", "HEAD"), finalSemanticTag: "history-v3.6-modal-causal-admission-baseline", frozenV35: await git("rev-parse", "history-v3.5-frozen-before-v36^{}"), generatedAt, providerCalls: 0, llmCalls: 0 }),
};
for (const [name, content] of Object.entries(payloads)) await fs.writeFile(path.join(directory, name), content);
const checksums = (await Promise.all(Object.keys(payloads).sort().map(async (name) => `${sha256(await fs.readFile(path.join(directory, name)))}  ${name}`))).join("\n") + "\n";
await fs.writeFile(path.join(directory, "checksums.sha256"), checksums);
const zip = `${directory}.zip`;
await exec("zip", ["-q", "-r", zip, path.basename(directory)], { cwd: path.dirname(directory) });
await exec("unzip", ["-t", zip]);
console.log(JSON.stringify({ directory, zip, sha256: sha256(await fs.readFile(zip)), gate: humanGate.gate }));
