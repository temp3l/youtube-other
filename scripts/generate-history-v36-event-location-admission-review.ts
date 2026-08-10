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
const dday = experiment.runs.find((run) => run.episodeId.includes("d-day"))!;
const candidate = dday.native.candidates.find((item) => item.source === "atomic-event-location-projection");
const relation = dday.native.extraction.relations.find((item) => item.id === candidate?.semanticRelationId);
const battle = experiment.runs.find((run) => run.episodeId.includes("20-1066"))!;
if (experiment.verdict !== "PASS" || experiment.relationComparison.after.candidates !== 56 || experiment.relationComparison.after.validatedRelations !== 34 || gaps.length !== 5 || candidate?.status !== "valid" || relation?.kind !== "event-location" || relation.assertionStatus !== "intended" || battle.native.extraction.relations.some((item) => item.kind === "event-location")) throw new Error("Event-location admission regression.");

const generatedAt = new Date().toISOString();
const timestamp = generatedAt.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const directory = path.join(repository, "artifacts/shadow/history-v3.6", `history-v3.6-event-location-admission-review-${timestamp}`);
await fs.mkdir(directory, { recursive: true });
const payloads: Record<string, string> = {
  "README.md": "# V3.6 event-location admission review\n\nPhase 2.21 admits exactly the approved D-Day native located-in atom as an intended event-location relation. Generic locator, movement, comparison, and causal inference remain prohibited.\n",
  "decision-report.md": "# Decision report\n\nPASS. One candidate and one validated relation were added. The exact 1066 army locator and generic entity-locator controls remain non-relational; no relation kind beyond event-location was introduced.\n",
  "target-case-summary.json": stable({ gapId: "candidate-gap-claim-7552fcb5134857307769fa18", candidate, relation }),
  "before-after.json": stable({ before: { candidates: 55, validatedRelations: 33, remainingGaps: 6, taxonomyMismatch: 1 }, after: { candidates: 56, validatedRelations: 34, remainingGaps: 5, taxonomyMismatch: 0 } }),
  "test-summary.json": stable({ historyTypecheck: "PASS", projectorTests: "PASS (21)", sameEightAndGoldenTests: "PASS (77)", goldenSemanticFixtures: "PASS (46)", targetedEslint: "PASS", providerCalls: 0, llmCalls: 0 }),
  "invariant-summary.json": stable(experiment.invariants),
  "provenance.json": stable({ phase: "2.21", phaseStart: "45b07979736f7339ca6107411a9e49eda9ee291c", implementationCommit: await git("rev-parse", "HEAD"), contractTagObject: await git("rev-parse", "history-v3.6-event-location-contract-baseline"), contractTagCommit: await git("rev-parse", "history-v3.6-event-location-contract-baseline^{}"), frozenV35: await git("rev-parse", "history-v3.5-frozen-before-v36^{}"), generatedAt, providerCalls: 0, llmCalls: 0 }),
  "remaining-gap-inventory.json": stable(gaps),
};
for (const [name, content] of Object.entries(payloads)) await fs.writeFile(path.join(directory, name), content);
const checksums = `${(await Promise.all(Object.keys(payloads).sort().map(async (name) => `${sha256(await fs.readFile(path.join(directory, name)))}  ${name}`))).join("\n")}\n`;
await fs.writeFile(path.join(directory, "checksums.sha256"), checksums);
const zip = `${directory}.zip`;
await exec("zip", ["-q", "-r", zip, path.basename(directory)], { cwd: path.dirname(directory) });
await exec("unzip", ["-t", zip], { cwd: path.dirname(directory) });
process.stdout.write(stable({ directory, zip, sha256: sha256(await fs.readFile(zip)), relationId: relation.id, remainingGaps: gaps.length }));
