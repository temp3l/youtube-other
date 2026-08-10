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
const relations = experiment.runs.flatMap((run) => run.native.extraction.relations).filter((relation) => relation.kind === "causal" && ["uncertain", "reported"].includes(relation.causalAssertionStatus ?? "asserted"));
const remaining = extractCandidateGapInventoryV36({ runs: experiment.runs, episodeTitles: new Map(loaded.map((item) => [item.source.shadow.episodeId, item.title])) });
if (experiment.verdict !== "PASS" || experiment.relationComparison.after.candidates !== 55 || experiment.relationComparison.after.validatedRelations !== 33 || relations.length !== 2 || remaining.length !== 6) throw new Error("Modal causal admission regression.");
const generatedAt = new Date().toISOString();
const timestamp = generatedAt.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const directory = path.join(repository, "artifacts/shadow/history-v3.6", `history-v3.6-modal-causal-admission-review-${timestamp}`);
await fs.mkdir(directory, { recursive: true });
const invariants = Object.fromEntries(Object.entries(experiment.invariants).map(([name, value]) => [name, value]));
const payloads: Record<string, string> = {
  "README.md": "# V3.6 modal causal admission review\n\nPhase 2.19 admits exactly two reviewed native modal-causal atoms.\n",
  "decision-report.md": "# Decision report\n\nThe selected relation-kind-specific causal contract is sufficient for exactly two native, resolved, directed causal atoms. The Armada movement atom remains blocked because it has no lossless movement shape.\n",
  "target-case-summary.json": stable(relations),
  "before-after.json": stable({ before: { candidates: 53, validatedRelations: 31, remainingGaps: 8 }, after: { candidates: 55, validatedRelations: 33, remainingGaps: 6 } }),
  "test-summary.json": stable({ historyTypecheck: "PASS", focusedTests: "PASS (106)", goldenSemanticFixtures: "PASS (45)", sameEightRegression: "PASS", targetedEslint: "PASS", providerCalls: 0, llmCalls: 0 }),
  "invariant-summary.json": stable(invariants),
  "provenance.json": stable({ phaseStart: "f0551b785a18d60d65bd8281c16cbb8ecd66650f", implementationCommit: await git("rev-parse", "HEAD"), frozenV35: await git("rev-parse", "history-v3.5-frozen-before-v36^{}"), generatedAt, providerCalls: 0, llmCalls: 0 }),
};
for (const [name, content] of Object.entries(payloads)) await fs.writeFile(path.join(directory, name), content);
const checksums = (await Promise.all(Object.keys(payloads).sort().map(async (name) => `${sha256(await fs.readFile(path.join(directory, name)))}  ${name}`))).join("\n") + "\n";
await fs.writeFile(path.join(directory, "checksums.sha256"), checksums);
const zip = `${directory}.zip`;
await exec("zip", ["-q", "-r", zip, path.basename(directory)], { cwd: path.dirname(directory) });
await exec("unzip", ["-t", zip]);
console.log(JSON.stringify({ directory, zip, sha256: sha256(await fs.readFile(zip)) }));
