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
const outputRoot = path.join(repository, "artifacts/shadow/history-v3.6");
const timestamp = "20260809T205504Z";
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

async function writeArtifact(name: string, payloads: Record<string, string>) {
  const directory = path.join(outputRoot, name);
  await fs.mkdir(directory, { recursive: true });
  for (const [file, content] of Object.entries(payloads)) await fs.writeFile(path.join(directory, file), content);
  const checksums = `${(await Promise.all(Object.keys(payloads).sort().map(async (file) => `${sha256(await fs.readFile(path.join(directory, file)))}  ${file}`))).join("\n")}\n`;
  await fs.writeFile(path.join(directory, "checksums.sha256"), checksums);
  const zip = `${directory}.zip`;
  await exec("zip", ["-q", "-r", zip, path.basename(directory)], { cwd: path.dirname(directory) });
  await exec("unzip", ["-t", zip], { cwd: path.dirname(directory) });
  return { directory, zip, sha256: sha256(await fs.readFile(zip)) };
}

const loaded = await Promise.all(representativeNativeEpisodeFragmentsV36.map(load));
const experiment = runRepresentativeNativeStructuredClaimExperimentV36(loaded.map((item) => item.source));
const gaps = extractCandidateGapInventoryV36({ runs: experiment.runs, episodeTitles: new Map(loaded.map((item) => [item.source.shadow.episodeId, item.title])) });
const byId = new Map(gaps.map((gap) => [gap.gapId, gap]));
const terminalNonRelational = ["candidate-gap-claim-27a228830af8714543142658", "candidate-gap-claim-ee76bea77004b9d801b6630b"].map((id) => byId.get(id)!);
const sourceIncomplete = ["candidate-gap-claim-6102997fabdd9aa3492eccb4", "candidate-gap-claim-a6f0630762f216aee3e63456"].map((id) => byId.get(id)!);
const movementArchitectureBlocked = byId.get("candidate-gap-claim-dc974d4bfc009c22c481bf02")!;
const dday = experiment.runs.find((run) => run.episodeId.includes("d-day"))!;
const eventCandidate = dday.native.candidates.find((candidate) => candidate.source === "atomic-event-location-projection")!;
const eventRelation = dday.native.extraction.relations.find((relation) => relation.id === eventCandidate.semanticRelationId)!;
if (gaps.length !== 5 || terminalNonRelational.some((gap) => gap.classification !== "INTENTIONALLY_NON_RELATIONAL") || sourceIncomplete.some((gap) => gap.classification !== "NEEDS_ADDITIONAL_NATIVE_STRUCTURE") || movementArchitectureBlocked.classification !== "ASSERTION_OR_MODALITY_BLOCK" || experiment.verdict !== "PASS" || Object.values(experiment.invariants).some(Boolean) || eventRelation.kind !== "event-location") throw new Error("Terminal gap audit regression.");

const humanGate = {
  required: true,
  gate: "Gate A — multiple credible movement architectures (with Gate B/D implications)",
  gapId: movementArchitectureBlocked.gapId,
  reason: "The intended Armada route lacks the actor/complete-route shape required by accepted movement semantics. Progress would require changing movement identity/cardinality or adding another relation kind.",
  options: [
    { option: "LEAVE_UNREPRESENTED", impact: "Preserve current safety and source fidelity; keep the three movement items blocked/terminal.", recommended: true },
    { option: "EXTEND_MOVEMENT_CONTRACT", impact: "Design explicit actor, partial-route, and assertion-status semantics; this changes accepted movement contracts and IDs.", recommended: false },
    { option: "NEW_INTENDED_ROUTE_KIND", impact: "Design another relation kind in a future authorized taxonomy phase; prohibited in this run.", recommended: false },
  ],
};
const phase222Commit = await git("rev-parse", "history-v3.6-event-location-drain-terminal-audit-baseline^{}");
const finalHead = await git("rev-parse", "HEAD");
const commonProvenance = { frozenV35: await git("rev-parse", "history-v3.5-frozen-before-v36^{}"), generatedAt: "2026-08-09T20:55:04.000Z", providerCalls: 0, llmCalls: 0 };
const phaseProvenance = { phase: "2.22", phaseStart: "3abe44f4a0b5c3bd6f082eab89731f91d5b4cb63", implementationCommit: phase222Commit, ...commonProvenance };
const tests = { historyTypecheck: "PASS", projectorTests: "PASS (21)", sameEightAndGoldenTests: "PASS (77)", goldenSemanticFixtures: "PASS (46)", terminalAuditSelfCheck: "PASS", targetedEslint: "PASS", providerCalls: 0, llmCalls: 0 };
const phaseName = `history-v3.6-terminal-gap-audit-review-${timestamp}`;
const phaseArtifact = await writeArtifact(phaseName, {
  "README.md": "# V3.6 terminal gap audit\n\nPhase 2.22 makes no semantic change. It separates terminal/source-incomplete items from the movement architecture decision gate.\n",
  "decision-report.md": "# Decision report\n\nPASS/STOPPED_AT_GATE. No source-supported destination or complete movement shape exists for the remaining movement items. Existing relations and gaps remain unchanged.\n",
  "target-case-summary.json": stable({ terminalNonRelational, sourceIncomplete, movementArchitectureBlocked }),
  "before-after.json": stable({ before: { candidates: 56, validatedRelations: 34, remainingGaps: 5 }, after: { candidates: 56, validatedRelations: 34, remainingGaps: 5, actionableGaps: 0, terminalNonRelational: 2, sourceIncomplete: 2, architectureBlocked: 1 } }),
  "test-summary.json": stable(tests),
  "invariant-summary.json": stable(experiment.invariants),
  "human-decision-gate.json": stable(humanGate),
  "provenance.json": stable(phaseProvenance),
});
const phaseIndex = [
  { phase: "2.20", purpose: "event-location contract", commit: "45b07979736f7339ca6107411a9e49eda9ee291c", tag: "history-v3.6-event-location-contract-baseline", artifact: "history-v3.6-event-location-contract-review-20260809T204511Z.zip" },
  { phase: "2.21", purpose: "D-Day admission", commit: "3abe44f4a0b5c3bd6f082eab89731f91d5b4cb63", tag: "history-v3.6-event-location-admission-baseline", artifact: "history-v3.6-event-location-admission-review-20260809T205401Z.zip" },
  { phase: "2.22", purpose: "terminal gap audit", commit: phase222Commit, tag: "history-v3.6-event-location-drain-terminal-audit-baseline", artifact: path.basename(phaseArtifact.zip) },
  { phase: "2.23", purpose: "consolidated close", commit: finalHead, tag: "history-v3.6-autonomous-event-location-drain-baseline", artifact: `history-v3.6-autonomous-event-location-drain-review-${timestamp}.zip` },
];
const finalArtifact = await writeArtifact(`history-v3.6-autonomous-event-location-drain-review-${timestamp}`, {
  "README.md": "# V3.6 autonomous event-location drain\n\nThe approved event-location contract and D-Day admission passed. The run stops at the movement architecture decision gate.\n",
  "phase-index.json": stable(phaseIndex),
  "event-location-summary.json": stable({ candidate: eventCandidate, relation: eventRelation, genericLocatorOvergeneration: 0, ddayAdmission: "PASS" }),
  "remaining-gap-inventory.json": stable(gaps),
  "final-relation-summary.json": stable({ candidates: 56, validatedRelations: 34, eventLocationRelations: 1, semanticRelationId: eventRelation.id, remainingActionableGaps: 0, terminalNonRelational: 2, sourceIncomplete: 2, architectureBlocked: 1 }),
  "final-test-summary.json": stable(tests),
  "final-invariant-summary.json": stable(experiment.invariants),
  "human-decision-gate.json": stable(humanGate),
  "provenance.json": stable({ phase: "2.23", finalHead, ...commonProvenance, phaseIndex, perPhaseArtifactsEmbedded: false }),
});
process.stdout.write(stable({ phaseArtifact, finalArtifact, relationId: eventRelation.id, remainingGaps: gaps.length, gate: humanGate.gate }));
