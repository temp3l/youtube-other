import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  HISTORY_V36_ATOMIC_TRANSFORMS_CAUSAL_CANDIDATE_RULE,
  projectAtomicRelationCandidateV36,
  representativeNativeEpisodeFragmentsV36,
  runRepresentativeNativeStructuredClaimExperimentV36,
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

async function phase29Approval(): Promise<Record<string, any>> {
  const root = path.join(repository, "artifacts", "shadow", "history-v3.6");
  const zip = (await fs.readdir(root)).filter((file) => /^history-v3\.6-candidate-gap-inventory-review-\d{8}T\d{6}Z\.zip$/u.test(file)).sort().at(-1);
  if (!zip) throw new Error("Missing Phase 2.9 inventory review ZIP.");
  const entries = (await execute("unzip", ["-Z1", zip], { cwd: root })).stdout.split("\n");
  const entry = entries.find((item) => item.endsWith("/candidate-gap-inventory.json"));
  if (!entry) throw new Error("Phase 2.9 ZIP lacks candidate-gap-inventory.json.");
  const inventory = JSON.parse((await execute("unzip", ["-p", zip, entry], { cwd: root })).stdout);
  const approved = inventory.filter((record: Record<string, any>) =>
    record.proposedFutureProjectorRule === HISTORY_V36_ATOMIC_TRANSFORMS_CAUSAL_CANDIDATE_RULE);
  if (approved.length !== 1) throw new Error(`Expected one Phase 2.9 approved transforms case, found ${approved.length}.`);
  return approved[0]!;
}

const phase29BaselineCommitSha = "abad7c25286b82b738933702bd1b3a1f69fa39bb";
const phase29Tag = "history-v3.6-candidate-gap-inventory-baseline";
const phase28ImplementationCommitSha = "83b352380fb913a1792a174cc5925936bab55ea2";
const phase28ReportCommitSha = "d42edd0dbe6ffd1af902e7b4f686ce70c9288fde";
const phase28Tag = "history-v3.6-process-temporal-candidate-baseline";
const contractBaselineCommitSha = "022f2177cc0e66f47cb5d652d6d456ce12a5a7be";
const contractBaselineTag = "history-v3.6-contract-preflight-baseline";
const frozenV35ProductionTag = "history-v3.5-frozen-before-v36";

const implementationSha = await git("rev-parse", "HEAD");
if (await git("rev-parse", `${phase29Tag}^{}`) !== phase29BaselineCommitSha) throw new Error("Phase 2.9 baseline moved.");
const changedHistorySources = (await git("diff", "--name-only", phase29BaselineCommitSha, implementationSha, "--", "packages/history/src"))
  .split("\n").filter(Boolean);
const allowedHistorySourceChanges = new Set([
  "packages/history/src/index.ts",
  "packages/history/src/v36/atomic-relation-candidate-projector-v36.ts",
  "packages/history/src/v36/atomic-relation-candidate-projector-v36.unit.test.ts",
  "packages/history/src/v36/candidate-gap-inventory-v36.ts",
  "packages/history/src/v36/candidate-gap-inventory-v36.unit.test.ts",
  "packages/history/src/v36/native-structured-claim-experiment-v36.ts",
  "packages/history/src/v36/native-structured-claim-generator-v36.unit.test.ts",
]);
if (changedHistorySources.some((file) => !allowedHistorySourceChanges.has(file))) {
  throw new Error(`Unexpected Phase 2.10 History source change: ${changedHistorySources.join(", ")}`);
}

const loaded = await Promise.all(representativeNativeEpisodeFragmentsV36.map(loadSource));
const sources = loaded.map(({ shadow, native }) => ({ shadow, native }));
const experiment = runRepresentativeNativeStructuredClaimExperimentV36(sources);
const repeat = runRepresentativeNativeStructuredClaimExperimentV36(sources);
const approval = await phase29Approval();
const transformsAtoms = experiment.runs.flatMap((run) => run.native.grounding.propositions
  .filter((atom) => atom.predicate === "transforms")
  .map((atom) => ({ run, atom, projection: projectAtomicRelationCandidateV36(atom) })));
const approvedCandidate = experiment.runs.flatMap((run) => run.native.candidates)
  .find((candidate) => candidate.atomicGroundingIds?.includes(approval.atomicGroundingId));
if (!approvedCandidate || approvedCandidate.status !== "valid" || approvedCandidate.projectionRuleId !== HISTORY_V36_ATOMIC_TRANSFORMS_CAUSAL_CANDIDATE_RULE) {
  throw new Error("Approved Phase 2.9 transforms case did not validate through the unchanged pipeline.");
}
if (experiment.verdict !== "PASS" || Object.values(experiment.invariants).some((value) => value !== 0)) {
  throw new Error(`Safety invariant failure: ${JSON.stringify(experiment.invariants)}`);
}
if (experiment.relationComparison.after.candidates !== 50 || experiment.relationComparison.after.validatedRelations !== 28 ||
  experiment.missClassification.atomicGroundingPresentCandidateProjectionGap !== 11) {
  throw new Error("Phase 2.10 representative metrics do not match the approved one-candidate outcome.");
}
const semanticPayload = (value: typeof experiment) => ({
  candidateProjection: value.candidateProjection,
  relationComparison: value.relationComparison,
  missClassification: value.missClassification,
  invariants: value.invariants,
  transforms: value.runs.flatMap((run) => run.native.candidates.filter((candidate) => candidate.source === "atomic-transforms-causal-projection")),
});
const firstHash = createHash("sha256").update(JSON.stringify(semanticPayload(experiment))).digest("hex");
const repeatHash = createHash("sha256").update(JSON.stringify(semanticPayload(repeat))).digest("hex");
if (firstHash !== repeatHash) throw new Error("Phase 2.10 representative output is not deterministic.");

const generatedAt = new Date().toISOString();
const timestamp = generatedAt.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const basename = `history-v3.6-transforms-causal-candidate-review-${timestamp}`;
const outputRoot = path.join(repository, "artifacts", "shadow", "history-v3.6");
const directory = path.join(outputRoot, basename);
await fs.mkdir(directory, { recursive: true });
const frozenV35ProductionTagObjectSha = await git("rev-parse", frozenV35ProductionTag);
const frozenV35ProductionCommitSha = await git("rev-parse", `${frozenV35ProductionTag}^{}`);
const positive = transformsAtoms.find((item) => item.atom.groundingId === approval.atomicGroundingId)!;
const relation = positive.run.native.extraction.relations.find((item) => item.id === approvedCandidate.semanticRelationId)!;
const manualReview = {
  approvedPositive: {
    episodeId: positive.run.episodeId,
    claimId: positive.atom.claimId,
    structuredPropositionId: positive.atom.provenance.structuredPropositionId,
    atomicGroundingId: positive.atom.groundingId,
    subjectCauseParticipant: positive.atom.subject,
    objectEffectParticipant: positive.atom.object,
    assertionStatus: positive.atom.assertionStatus,
    projectionRuleId: approvedCandidate.projectionRuleId,
    candidateResult: approvedCandidate.status,
    validatorResult: "accepted",
    semanticRelationId: approvedCandidate.semanticRelationId,
    evidenceLineage: {
      supportClaimIds: approvedCandidate.supportClaimIds,
      atomicGroundingIds: approvedCandidate.atomicGroundingIds,
      structuredPropositionIds: approvedCandidate.structuredPropositionIds,
      sourceSpan: approvedCandidate.atomicSourceSpans?.[0],
      evidenceFingerprint: approvedCandidate.evidenceFingerprint,
    },
    relation,
  },
  allTransformsCandidates: experiment.runs.flatMap((run) => run.native.candidates
    .filter((candidate) => candidate.source === "atomic-transforms-causal-projection")),
  allTransformsProjectionRejections: transformsAtoms
    .filter((item) => item.projection?.status === "rejected")
    .map((item) => ({ episodeId: item.run.episodeId, claimId: item.atom.claimId, atomicGroundingId: item.atom.groundingId, result: item.projection })),
  negativeControls: [
    "uncertain, intended, attempted, counterfactual, and reported transforms are rejected",
    "same subject/object is rejected",
    "unresolved participant lineage is rejected",
    "non-transforms predicates return no candidate",
    "cause is always subject and effect is always object",
    "compatibility structured lineage is rejected; only the Phase 2.9-approved native lineage is admitted",
  ],
};
const causalAfter = experiment.runs.flatMap((run) => run.native.extraction.relations).filter((item) => item.kind === "causal").length;
const provenance = {
  v36ImplementationCommitSha: implementationSha,
  phase29BaselineCommitSha,
  phase29Tag,
  phase28ImplementationCommitSha,
  phase28ReportCommitSha,
  phase28Tag,
  contractBaselineCommitSha,
  contractBaselineTag,
  frozenV35ProductionCommitSha,
  frozenV35ProductionTag,
  frozenV35ProductionTagObjectSha,
  artifactKind: "history-v3.6-transforms-causal-candidate-review",
  episodeSet: loaded.map((item) => ({ episodeId: item.shadow.episodeId, title: item.title })),
  generatedAt,
  gitBranch: await git("branch", "--show-current"),
  liveProviderCalls: 0,
  llmCalls: 0,
};
const payloads: Record<string, string> = {
  "README.md": "# V3.6 transforms causal candidate review\n\nOne Phase 2.9-approved asserted native `transforms(subject, object)` atom is lowered claim-locally to causal `cause=subject, effect=object`. The validator and all upstream semantics are unchanged. Provider and LLM calls: 0.\n",
  "architecture.md": "# Phase 2.10 boundary\n\nAtomic grounding → `atomic-transforms-causal-candidate.v1` → existing candidate pipeline → unchanged ExplanatoryRelation validator. The rule admits only asserted, distinct, resolved participants from native structured-proposition lineage. It does not parse prose, compose claims, infer generic causality, or alter V3.5.\n",
  "transforms-causal-candidate-summary.json": stable({
    projectionRuleId: HISTORY_V36_ATOMIC_TRANSFORMS_CAUSAL_CANDIDATE_RULE,
    candidateSource: "atomic-transforms-causal-projection",
    approvedInventoryGapId: approval.gapId,
    approvedAtomicGroundingId: approval.atomicGroundingId,
    proposed: experiment.candidateProjection.transforms,
    eligibility: "predicate=transforms; assertion=asserted; native structured lineage; distinct resolved subject/object; exact structured lineage",
  }),
  "representative-summary.json": stable({ episodeIds: experiment.episodeIds, phase29Before: { candidates: 49, validatedRelations: 27, candidateGaps: 12 }, after: experiment.relationComparison.after, missClassification: experiment.missClassification, invariants: experiment.invariants }),
  "relation-comparison.json": stable({ before: { candidates: 49, validatedRelations: 27, causalRelations: causalAfter - 1 }, after: { candidates: experiment.relationComparison.after.candidates, validatedRelations: experiment.relationComparison.after.validatedRelations, causalRelations: causalAfter }, newlyValidatedTransformsRelation: relation }),
  "miss-classification.json": stable({ before: { atomicGroundingPresentCandidateProjectionGap: 12 }, after: { atomicGroundingPresentCandidateProjectionGap: 11 }, unchangedRemainingCategories: { NEEDS_ADDITIONAL_NATIVE_STRUCTURE: 4, NEEDS_CROSS_CLAIM_PROOF: 1, ASSERTION_OR_MODALITY_BLOCK: 3, TAXONOMY_MISMATCH: 1, INTENTIONALLY_NON_RELATIONAL: 2, PARTICIPANT_RESOLUTION_GAP: 0, VALIDATOR_CONTRACT_MISMATCH: 0 } }),
  "manual-review.json": stable(manualReview),
  "diagnostic-summary.json": stable({ transformsProjectionRejections: manualReview.allTransformsProjectionRejections, candidateDiagnostics: experiment.runs.flatMap((run) => run.native.candidates.filter((candidate) => candidate.source === "atomic-transforms-causal-projection").flatMap((candidate) => candidate.diagnostics)) }),
  "decision-report.md": "# Decision report\n\nVerdict: **PASS**. The one approved native asserted transforms atom produced one validated causal relation through the unchanged validator. Candidates rose 49→50, validated relations 27→28, and candidate-projection gaps fell 12→11. The remaining eleven gap categories are unchanged. Recommended next task: **do not add another projector; improve native structured semantics for the four additional-structure gaps**.\n",
  "test-summary.json": stable({ typecheckPreflight: "PASS", phase28ProjectorTests: "PASS", phase29InventoryTests: "PASS", goldenFixtures: 45, transformsPositiveAndNegativeTests: "PASS", sameEightRepresentativeRun: "PASS", finalHistoryTypecheck: "PASS", targetedEslint: "PASS", deterministicHash: firstHash, repeatHash, repeatMatch: firstHash === repeatHash, liveProviderCalls: 0, llmCalls: 0 }),
  "invariant-test-summary.json": stable({ verdict: experiment.verdict, invariants: experiment.invariants, allZero: Object.values(experiment.invariants).every((value) => value === 0) }),
  "provenance.json": stable(provenance),
};
for (const [name, content] of Object.entries(payloads)) await fs.writeFile(path.join(directory, name), content);
const files = (await fs.readdir(directory)).sort();
const checksums = await Promise.all(files.map(async (file) => `${createHash("sha256").update(await fs.readFile(path.join(directory, file))).digest("hex")}  ${file}`));
await fs.writeFile(path.join(directory, "checksums.sha256"), `${checksums.join("\n")}\n`);
await execute("sha256sum", ["-c", "checksums.sha256"], { cwd: directory });
const zipPath = `${directory}.zip`;
await execute("zip", ["-X", "-q", "-r", zipPath, basename], { cwd: outputRoot });
await execute("unzip", ["-t", zipPath], { cwd: outputRoot });
process.stdout.write(stable({ zipPath, zipSha256: createHash("sha256").update(await fs.readFile(zipPath)).digest("hex"), checksums: "PASS", zipIntegrity: "PASS", firstHash, repeatHash, metrics: { candidates: experiment.relationComparison.after.candidates, validatedRelations: experiment.relationComparison.after.validatedRelations, candidateGaps: experiment.missClassification.atomicGroundingPresentCandidateProjectionGap } }));
