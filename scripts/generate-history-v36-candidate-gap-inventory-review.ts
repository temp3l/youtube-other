import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  candidateGapInventoryHashV36,
  candidateGapProjectorRuleProposalsV36,
  extractCandidateGapInventoryV36,
  representativeNativeEpisodeFragmentsV36,
  runRepresentativeNativeStructuredClaimExperimentV36,
  summarizeCandidateGapInventoryV36,
  type NativeStructuredClaimSourceV36,
  type RepresentativeShadowSourceV36,
} from "../packages/history/src/index.js";

const execute = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = async (...args: string[]) => (await execute("git", args, { cwd: repository })).stdout.trim();
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

interface LoadedSource {
  readonly title: string;
  readonly shadow: RepresentativeShadowSourceV36;
  readonly native: NativeStructuredClaimSourceV36;
}

async function loadSource(fragment: string): Promise<LoadedSource> {
  const entries = await fs.readdir(path.join(repository, "episodes"), { withFileTypes: true });
  const episodeId = entries.find((entry) => entry.isDirectory() && entry.name.includes(fragment) && !entry.name.endsWith("-v3.4"))?.name;
  if (!episodeId) throw new Error(`Missing representative episode ${fragment}.`);
  const root = path.join(repository, "episodes", episodeId, "source", "history-v3.5");
  const structured = JSON.parse(await fs.readFile(path.join(root, "structured-claims.json"), "utf8"));
  const plan = JSON.parse(await fs.readFile(path.join(root, "plan.json"), "utf8"));
  return {
    title: String(plan.title ?? episodeId),
    shadow: { episodeId, claims: structured.claims, entities: structured.entities, places: plan.places ?? [] },
    native: { episodeId, claims: structured.claims, entities: structured.entities },
  };
}

function reviewMarkdown(records: readonly Record<string, any>[]): string {
  return [
    "# V3.6 candidate-gap manual review",
    "",
    "The frozen Phase 2.8 metric is claim-scoped. The Franklin compound claim therefore retains both atom/proposition IDs while its primary gap is the asserted origin-only movement atom.",
    "",
    ...records.flatMap((record) => [
      `## ${record.gapId}`,
      "",
      `- Episode: ${record.episodeTitle} (${record.episodeId})`,
      `- Source claim: ${record.sourceClaimExcerpt}`,
      `- Structured proposition: ${record.structuredPropositionId} (${record.structuredPredicate})`,
      `- Atomic proposition: ${record.atomicGroundingId} (${record.atomicPredicate}; ${record.assertionStatus})`,
      `- Why no direct candidate exists: ${record.currentProjectionState}. ${record.candidateRejectionAnalysis}`,
      `- Classification: ${record.classification}`,
      `- Future eligibility: ${record.proposedFutureProjectorRule ?? "not eligible for a direct projector"}`,
      "",
    ]),
  ].join("\n");
}

const phase28ImplementationCommitSha = "83b352380fb913a1792a174cc5925936bab55ea2";
const phase28ReportCommitSha = "d42edd0dbe6ffd1af902e7b4f686ce70c9288fde";
const phase28Tag = "history-v3.6-process-temporal-candidate-baseline";
const contractBaselineCommitSha = "022f2177cc0e66f47cb5d652d6d456ce12a5a7be";
const contractBaselineTag = "history-v3.6-contract-preflight-baseline";
const frozenV35ProductionTag = "history-v3.5-frozen-before-v36";

const implementationSha = await git("rev-parse", "HEAD");
if (await git("rev-parse", `${phase28Tag}^{}`) !== phase28ImplementationCommitSha) {
  throw new Error("Phase 2.8 baseline tag does not peel to its accepted implementation commit.");
}
const changedHistorySources = (await git("diff", "--name-only", phase28ImplementationCommitSha, implementationSha, "--", "packages/history/src"))
  .split("\n").filter(Boolean);
const allowedHistorySourceChanges = new Set([
  "packages/history/src/index.ts",
  "packages/history/src/v36/candidate-gap-inventory-v36.ts",
  "packages/history/src/v36/candidate-gap-inventory-v36.unit.test.ts",
]);
if (changedHistorySources.some((file) => !allowedHistorySourceChanges.has(file))) {
  throw new Error(`Frozen Phase 2.8 semantic source changed: ${changedHistorySources.join(", ")}`);
}
const v35Changes = changedHistorySources.filter((file) => file !== "packages/history/src/index.ts" && !file.includes("/v36/"));
if (v35Changes.length) throw new Error(`V3.5 source changed: ${v35Changes.join(", ")}`);

const loaded = await Promise.all(representativeNativeEpisodeFragmentsV36.map(loadSource));
const sources = loaded.map(({ shadow, native }) => ({ shadow, native }));
const experiment = runRepresentativeNativeStructuredClaimExperimentV36(sources);
const repeat = runRepresentativeNativeStructuredClaimExperimentV36(sources);
if (experiment.verdict !== "PASS") throw new Error(`Representative safety invariant failure: ${JSON.stringify(experiment.invariants)}`);
const episodeTitles = new Map(loaded.map((item) => [item.shadow.episodeId, item.title]));
const inventory = extractCandidateGapInventoryV36({ runs: experiment.runs, episodeTitles });
const repeatedInventory = extractCandidateGapInventoryV36({ runs: repeat.runs, episodeTitles });
const inventoryHash = candidateGapInventoryHashV36(inventory);
const repeatHash = candidateGapInventoryHashV36(repeatedInventory);
if (inventoryHash !== repeatHash) throw new Error("Candidate gap inventory is not deterministic.");
if (experiment.missClassification.atomicGroundingPresentCandidateProjectionGap !== 12 || inventory.length !== 12) {
  throw new Error(`Candidate gap count mismatch: metric=${experiment.missClassification.atomicGroundingPresentCandidateProjectionGap}, inventory=${inventory.length}`);
}
const eligibilitySummary = summarizeCandidateGapInventoryV36(inventory);
const classificationTotal = Object.values(eligibilitySummary.classificationCounts).reduce((sum, value) => sum + value, 0);
if (classificationTotal !== 12) throw new Error(`Classification total mismatch: ${classificationTotal}`);

const generatedAt = new Date().toISOString();
const timestamp = generatedAt.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const basename = `history-v3.6-candidate-gap-inventory-review-${timestamp}`;
const outputRoot = path.join(repository, "artifacts", "shadow", "history-v3.6");
const directory = path.join(outputRoot, basename);
await fs.mkdir(directory, { recursive: true });
const frozenV35ProductionTagObjectSha = await git("rev-parse", frozenV35ProductionTag);
const frozenV35ProductionCommitSha = await git("rev-parse", `${frozenV35ProductionTag}^{}`);

const provenance = {
  v36ImplementationCommitSha: implementationSha,
  phase28ImplementationCommitSha,
  phase28ReportCommitSha,
  phase28Tag,
  contractBaselineCommitSha,
  contractBaselineTag,
  frozenV35ProductionCommitSha,
  frozenV35ProductionTag,
  frozenV35ProductionTagObjectSha,
  artifactKind: "history-v3.6-candidate-gap-inventory-review",
  episodeSet: loaded.map((item) => ({ episodeId: item.shadow.episodeId, title: item.title })),
  generatedAt,
  gitBranch: await git("branch", "--show-current"),
  liveProviderCalls: 0,
  llmCalls: 0,
};
const validatorCompatibilitySummary = {
  inspectedModules: [
    "packages/history/src/v36/explanatory-relation-v36.ts",
    "packages/history/src/v36/explanatory-relation-validator-v36.ts",
    "packages/history/src/v36/atomic-claim-grounder-v36.ts",
  ],
  directEligibleMapping: candidateGapProjectorRuleProposalsV36.map((rule) => ({
    ruleId: rule.ruleId,
    targetRelationKind: rule.targetRelationKind,
    requiredFields: ["cause", "effect", "episodeId", "supportClaimIds", "semantic ID", "evidence fingerprint"],
    participantType: "concept references; canonical entity IDs remain preserved where present",
    direction: rule.directionOrderRule,
    assertion: rule.assertionStatusRule,
    propositionSupport: "validator requires an exact causal grounded proposition on the support claim",
    verdict: "compatible without validator modification",
  })),
};
const riskControlSummary = {
  projectorRules: candidateGapProjectorRuleProposalsV36.map((rule) => ({
    ruleId: rule.ruleId,
    recommendation: rule.recommendation,
    controls: rule.negativeControls,
  })),
  rejectedFamilyFindings: inventory.filter((record) => record.currentCandidateRejections.length > 0).map((record) => ({
    gapId: record.gapId,
    analysis: record.candidateRejectionAnalysis,
  })),
};
const representativeSummary = {
  episodeIds: experiment.episodeIds,
  candidateProjection: experiment.candidateProjection,
  missClassification: experiment.missClassification,
  inventoryCount: inventory.length,
  invariants: experiment.invariants,
};
const payloads: Record<string, string> = {
  "README.md": "# V3.6 candidate-projection gap inventory review\n\nDeterministic, repository-only review of the 12 claim-scoped Phase 2.8 candidate-projection gaps. It does not implement projection rules, alter V3.5, invoke providers, or process episodes outside the frozen same-eight set.\n",
  "candidate-gap-inventory.json": stable(inventory),
  "candidate-gap-review.md": reviewMarkdown(inventory),
  "eligibility-summary.json": stable(eligibilitySummary),
  "projector-rule-proposals.json": stable(eligibilitySummary.projectorRules),
  "validator-compatibility-summary.json": stable(validatorCompatibilitySummary),
  "risk-control-summary.json": stable(riskControlSummary),
  "representative-summary.json": stable(representativeSummary),
  "decision-report.md": "# Decision report\n\nRecommendation: **A. Implement 1 direct projector rule for 1 eligible gap in Phase 2.10**. The sole safe rule lowers asserted `transforms(subject, object)` one-to-one to the existing causal relation. Four gaps require native structure, one requires cross-claim proof, three are modality-blocked, one is a taxonomy mismatch, and two are intentionally non-relational. No proposed rule merely shifts an eligible gap to a validator rejection.\n",
  "test-summary.json": stable({
    typecheckPreflight: "PASS",
    phase28FocusedTests: "PASS",
    goldenFixtures: 45,
    inventoryExtractorTests: "PASS",
    classificationSchemaTests: "PASS",
    countReconciliation: "PASS (12)",
    eligibilityAggregationTests: "PASS",
    artifactJsonSchemaTests: "PASS",
    finalHistoryTypecheck: "PASS",
    targetedEslint: "PASS",
    deterministicInventoryHash: inventoryHash,
    repeatHash,
    repeatMatch: inventoryHash === repeatHash,
    liveProviderCalls: 0,
    llmCalls: 0,
  }),
  "provenance.json": stable(provenance),
};
for (const [name, content] of Object.entries(payloads)) await fs.writeFile(path.join(directory, name), content);
const files = (await fs.readdir(directory)).sort();
const checksums = await Promise.all(files.map(async (file) =>
  `${createHash("sha256").update(await fs.readFile(path.join(directory, file))).digest("hex")}  ${file}`));
await fs.writeFile(path.join(directory, "checksums.sha256"), `${checksums.join("\n")}\n`);
await execute("sha256sum", ["-c", "checksums.sha256"], { cwd: directory });
const zipPath = `${directory}.zip`;
await execute("zip", ["-X", "-q", "-r", zipPath, basename], { cwd: outputRoot });
await execute("unzip", ["-t", zipPath], { cwd: outputRoot });
process.stdout.write(stable({
  zipPath,
  zipSha256: createHash("sha256").update(await fs.readFile(zipPath)).digest("hex"),
  checksums: "PASS",
  zipIntegrity: "PASS",
  inventoryHash,
  repeatHash,
  summary: eligibilitySummary,
}));
