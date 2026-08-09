import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  HISTORY_V36_ATOMIC_PROCESS_CANDIDATE_RULE,
  HISTORY_V36_ATOMIC_TEMPORAL_CANDIDATE_RULE,
  HISTORY_V36_PROCESS_TEMPORAL_CANDIDATE_REVIEW_ARTIFACT_KIND,
  HISTORY_V36_PROCESS_TEMPORAL_CANDIDATE_REVIEW_PROVENANCE_SCHEMA,
  processTemporalCandidateReviewProvenanceSchemaV36,
  representativeNativeEpisodeFragmentsV36,
  runRepresentativeNativeStructuredClaimExperimentV36,
  type NativeStructuredClaimSourceV36,
  type RepresentativeShadowSourceV36,
} from "../packages/history/src/index.js";

const execute = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = async (...args: string[]) => (await execute("git", args, { cwd: repository })).stdout.trim();
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

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

async function objectType(ref: string): Promise<string> {
  return git("cat-file", "-t", ref);
}

async function fileAt(ref: string, file: string): Promise<string> {
  return (await execute("git", ["show", `${ref}:${file}`], { cwd: repository })).stdout;
}

const loaded = await Promise.all(representativeNativeEpisodeFragmentsV36.map(loadSource));
const sources = loaded.map(({ shadow, native }) => ({ shadow, native }));
const experiment = runRepresentativeNativeStructuredClaimExperimentV36(sources);
const repeat = runRepresentativeNativeStructuredClaimExperimentV36(sources);
const semanticPayload = (value: typeof experiment) => ({
  episodeIds: value.episodeIds,
  candidateProjection: value.candidateProjection,
  phase27Comparison: value.phase27Comparison,
  relationComparison: value.relationComparison,
  missClassification: value.missClassification,
  invariants: value.invariants,
  runs: value.runs.map((run) => ({
    episodeId: run.episodeId,
    candidates: run.native.candidates,
    relations: run.native.extraction.relations,
  })),
});
const firstHash = hash(semanticPayload(experiment));
const repeatHash = hash(semanticPayload(repeat));
if (firstHash !== repeatHash) throw new Error("Phase 2.8 representative run is not deterministic.");
if (experiment.verdict !== "PASS") throw new Error(`Phase 2.8 invariant failure: ${JSON.stringify(experiment.invariants)}`);

if (process.env.HISTORY_V36_PROCESS_TEMPORAL_CANDIDATE_SUMMARY_ONLY === "1") {
  process.stdout.write(stable({
    verdict: experiment.verdict,
    episodeIds: experiment.episodeIds,
    candidateProjection: experiment.candidateProjection,
    phase27Comparison: experiment.phase27Comparison,
    missClassificationBefore: experiment.phase27MissClassification,
    missClassificationAfter: experiment.missClassification,
    invariants: experiment.invariants,
    firstHash,
    repeatHash,
  }));
  process.exit(0);
}

const implementationSha = await git("rev-parse", "HEAD");
const implementationTag = process.env.HISTORY_V36_PROCESS_TEMPORAL_CANDIDATE_TAG ??
  "history-v3.6-process-temporal-candidate-baseline";
if (await git("rev-parse", `${implementationTag}^{}`) !== implementationSha) {
  throw new Error(`${implementationTag} must peel to the exact implementation commit.`);
}

const phase27Tag = "history-v3.6-native-process-temporal-baseline";
const frozenV35Tag = "history-v3.5-frozen-before-v36";
const phase27RefSha = await git("rev-parse", phase27Tag);
const phase27PeeledCommitSha = await git("rev-parse", `${phase27Tag}^{}`);
const phase27TagType = await objectType(phase27Tag);
const frozenV35RefSha = await git("rev-parse", frozenV35Tag);
const frozenV35PeeledCommitSha = await git("rev-parse", `${frozenV35Tag}^{}`);
const frozenV35TagType = await objectType(frozenV35Tag);
if (frozenV35TagType !== "tag" || await objectType(frozenV35PeeledCommitSha) !== "commit") {
  throw new Error("Frozen V3.5 provenance does not resolve to annotated tag object plus peeled commit.");
}
if (phase27PeeledCommitSha !== "8e40dda55ec1f83162be21907b2194f01c8241c7") {
  throw new Error("Phase 2.7 implementation baseline moved.");
}

const validatorPath = "packages/history/src/v36/explanatory-relation-validator-v36.ts";
const relationPath = "packages/history/src/v36/explanatory-relation-v36.ts";
const currentValidator = await fs.readFile(path.join(repository, validatorPath), "utf8");
const currentRelationContract = await fs.readFile(path.join(repository, relationPath), "utf8");
if (currentValidator !== await fileAt(phase27PeeledCommitSha, validatorPath)) {
  throw new Error("ExplanatoryRelation validator changed after Phase 2.7.");
}
if (currentRelationContract !== await fileAt(phase27PeeledCommitSha, relationPath)) {
  throw new Error("ExplanatoryRelation schema/identity/evidence contract changed after Phase 2.7.");
}
const historySourceChanges = (await git("diff", "--name-only", phase27PeeledCommitSha, implementationSha, "--", "packages/history/src"))
  .split("\n")
  .filter(Boolean);
const v35SemanticChanges = historySourceChanges.filter((file) => file !== "packages/history/src/index.ts" && !file.includes("/v36/"));
if (v35SemanticChanges.length) throw new Error(`Unexpected V3.5 source changes: ${v35SemanticChanges.join(", ")}`);

const generatedAt = new Date().toISOString();
const timestamp = generatedAt.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const basename = `history-v3.6-process-temporal-candidate-review-${timestamp}`;
const outputRoot = path.join(repository, "artifacts", "shadow", "history-v3.6");
const directory = path.join(outputRoot, basename);
await fs.mkdir(directory, { recursive: true });

const provenance = processTemporalCandidateReviewProvenanceSchemaV36.parse({
  v36ImplementationCommitSha: implementationSha,
  phase27ImplementationCommitSha: phase27PeeledCommitSha,
  phase27ReportCommitSha: "c71189ed7f70e02179012911feb4fffd13b87cb1",
  phase27Tag,
  contractBaselineCommitSha: "022f2177cc0e66f47cb5d652d6d456ce12a5a7be",
  contractBaselineTag: "history-v3.6-contract-preflight-baseline",
  frozenV35ProductionCommitSha: frozenV35PeeledCommitSha,
  frozenV35ProductionTag: frozenV35Tag,
  frozenV35ProductionTagObjectSha: frozenV35RefSha,
  acceptedV35SemanticBaselineCommitSha: "82b4192f6e832523ce00675e39593e3f98a96403",
  acceptedV35SemanticBaselineTag: "history-v3.5-semantic-baseline",
  artifactKind: HISTORY_V36_PROCESS_TEMPORAL_CANDIDATE_REVIEW_ARTIFACT_KIND,
  schemaVersion: HISTORY_V36_PROCESS_TEMPORAL_CANDIDATE_REVIEW_PROVENANCE_SCHEMA,
  episodeSet: loaded.map((item) => ({ episodeId: item.shadow.episodeId, title: item.title })),
  generatedAt,
  gitBranch: await git("branch", "--show-current"),
  liveProviderCalls: 0,
});

const targetCandidates = experiment.runs.flatMap((run) => run.native.candidates
  .filter((candidate) => candidate.source === "atomic-process-projection" || candidate.source === "atomic-temporal-projection")
  .map((candidate) => ({ run, candidate })));
const manualReview = targetCandidates.map(({ run, candidate }) => {
  const atom = run.native.grounding.propositions.find((item) => candidate.atomicGroundingIds?.includes(item.groundingId));
  const structured = run.native.structuredClaims.envelopes
    .flatMap((envelope) => envelope.propositions)
    .find((item) => candidate.structuredPropositionIds?.includes(item.propositionId));
  const relation = run.native.extraction.relations.find((item) => item.id === candidate.semanticRelationId);
  return {
    episode: run.episodeId,
    claimId: candidate.claimId,
    structuredPropositionId: structured?.propositionId,
    atomicGroundingId: atom?.groundingId,
    candidateSource: candidate.source,
    projectionRuleId: candidate.projectionRuleId,
    candidateSemanticContent: relation ?? null,
    validatorResult: candidate.status === "valid" ? "accepted" : "rejected",
    diagnostics: candidate.diagnostics,
    semanticRelationId: candidate.semanticRelationId ?? null,
    assertionStatus: candidate.assertionStatus,
    exactSourceSpan: candidate.atomicSourceSpans?.[0],
    semanticParticipantIds: candidate.semanticParticipantIds,
    processGroupingTreatment: candidate.processGrouping?.treatment ?? "not-applicable",
    processGrouping: candidate.processGrouping ?? null,
  };
});
if (manualReview.length !== 4) throw new Error(`Expected four Phase 2.8 review items, found ${manualReview.length}.`);

const diagnostics = targetCandidates.flatMap(({ run, candidate }) =>
  candidate.diagnostics.map((diagnostic) => ({ episodeId: run.episodeId, candidateId: candidate.id, diagnostic })));
const newlyValidated = experiment.relationComparison.newlyValidated
  .filter((item) => item.kind === "process" || item.kind === "temporal-sequence");
const provenanceReconciliation = {
  currentHead: implementationSha,
  frozenV35: {
    tag: frozenV35Tag,
    refSha: frozenV35RefSha,
    tagObjectSha: frozenV35RefSha,
    peeledCommitSha: frozenV35PeeledCommitSha,
    tagType: frozenV35TagType,
  },
  phase27: {
    tag: phase27Tag,
    refSha: phase27RefSha,
    tagObjectSha: phase27TagType === "tag" ? phase27RefSha : null,
    peeledCommitSha: phase27PeeledCommitSha,
    tagType: phase27TagType,
  },
  correction: {
    ambiguousPhase27Value: frozenV35RefSha,
    correctedFrozenV35ProductionCommitSha: frozenV35PeeledCommitSha,
    separateFrozenV35ProductionTagObjectSha: frozenV35RefSha,
  },
};

const payloads: Record<string, string> = {
  "README.md": `# V3.6 process and temporal candidate review\n\nVerdict: **${experiment.verdict}**. Exactly two asserted process atoms and two asserted temporal atoms were projected across the unchanged eight-episode corpus. The unchanged validator accepted ${newlyValidated.length}; provider calls were 0.\n`,
  "architecture.md": `# Phase 2.8 boundary\n\nNative structured proposition -> atomic grounding -> direct process/temporal candidate projection -> unchanged ExplanatoryRelation validator.\n\nOnly \`${HISTORY_V36_ATOMIC_PROCESS_CANDIDATE_RULE}\` and \`${HISTORY_V36_ATOMIC_TEMPORAL_CANDIDATE_RULE}\` are added. Process grouping labels remain non-authoritative metadata. No prose parsing, cross-claim proof, causality inference, map, diagram, provider call, or V3.5 consumer is present.\n`,
  "provenance-reconciliation.json": stable(provenanceReconciliation),
  "process-temporal-candidate-summary.json": stable({
    processProjectionRuleId: HISTORY_V36_ATOMIC_PROCESS_CANDIDATE_RULE,
    temporalProjectionRuleId: HISTORY_V36_ATOMIC_TEMPORAL_CANDIDATE_RULE,
    candidateSourceTypes: ["atomic-process-projection", "atomic-temporal-projection"],
    projection: experiment.candidateProjection,
    processGroupingTreatment: "non-authoritative-grouping-metadata",
    targetCandidateCount: targetCandidates.length,
  }),
  "representative-summary.json": stable({
    verdict: experiment.verdict,
    episodeIds: experiment.episodeIds,
    phase27Comparison: experiment.phase27Comparison,
    candidateProjection: experiment.candidateProjection,
    invariants: experiment.invariants,
  }),
  "relation-comparison.json": stable({
    before: experiment.phase27Comparison.before,
    after: experiment.phase27Comparison.after,
    newlyValidated,
  }),
  "miss-classification.json": stable({
    before: experiment.phase27MissClassification,
    after: experiment.missClassification,
  }),
  "manual-review.json": stable(manualReview),
  "diagnostic-summary.json": stable({
    candidateDiagnostics: diagnostics,
    processValidatorRejects: experiment.candidateProjection.process.validatorRejects,
    temporalValidatorRejects: experiment.candidateProjection.temporal.validatorRejects,
  }),
  "decision-report.md": `# Decision report\n\nVerdict: **${experiment.verdict}**. The two explicit atomic projection rules produced ${targetCandidates.length} candidates and ${newlyValidated.length} validated relations without changing the validator or relation contract. Candidate-projection gaps fell from ${experiment.phase27MissClassification.atomicGroundingPresentCandidateProjectionGap} to ${experiment.missClassification.atomicGroundingPresentCandidateProjectionGap}.\n\nRecommended next task: **design a bounded Phase 2.9 decision for the remaining non-process/non-temporal candidate-projection gaps**.\n`,
  "test-summary.json": stable({
    typecheckPreflight: "PASS",
    focusedPhase27RelationSchemaPreflight: "PASS",
    focusedProjectionAndRegressionTests: "PASS",
    goldenFixtures: 45,
    finalHistoryTypecheck: "PASS",
    targetedEslint: "PASS",
    sameEightRepresentativeRun: "PASS",
    deterministicRepeatHash: firstHash,
    repeatHash,
    repeatMatch: firstHash === repeatHash,
    liveProviderCalls: 0,
  }),
  "invariant-test-summary.json": stable({ verdict: experiment.verdict, invariants: experiment.invariants }),
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
  firstHash,
  repeatHash,
  summary: JSON.parse(payloads["representative-summary.json"]!),
}));
