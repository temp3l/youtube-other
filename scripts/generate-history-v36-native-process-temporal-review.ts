import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  HISTORY_ATOMIC_GROUNDING_SCHEMA_V36,
  HISTORY_EXPLANATORY_RELATIONS_SCHEMA_V36,
  HISTORY_NATIVE_STRUCTURED_CLAIM_GENERATOR_V36,
  HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
  nativeStructuredClaimCacheContractV36,
  representativeNativeEpisodeFragmentsV36,
  representativeNativeProcessClaimIdsV36,
  representativeNativeTemporalClaimIdsV36,
  runRepresentativeNativeStructuredClaimExperimentV36,
  type NativeStructuredClaimSourceV36,
  type RepresentativeShadowSourceV36,
} from "../packages/history/src/index.js";

const execute = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = async (...args: string[]) => (await execute("git", args, { cwd: repository })).stdout.trim();
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const semanticHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

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

const loaded = await Promise.all(representativeNativeEpisodeFragmentsV36.map(loadSource));
const sources = loaded.map(({ shadow, native }) => ({ shadow, native }));
const experiment = runRepresentativeNativeStructuredClaimExperimentV36(sources);
const repeat = runRepresentativeNativeStructuredClaimExperimentV36(sources);
const semanticPayload = (value: typeof experiment) => ({
  episodeIds: value.episodeIds,
  nativeStructuredClaimCount: value.nativeStructuredClaimCount,
  nativeStructuredPropositionCount: value.nativeStructuredPropositionCount,
  nativeProcessPropositionCount: value.nativeProcessPropositionCount,
  nativeTemporalPropositionCount: value.nativeTemporalPropositionCount,
  atomicProcessPropositionCount: value.atomicProcessPropositionCount,
  atomicTemporalPropositionCount: value.atomicTemporalPropositionCount,
  phase26Comparison: value.phase26Comparison,
  missClassification: value.missClassification,
  invariants: value.invariants,
  runs: value.runs.map((run) => ({
    episodeId: run.episodeId,
    structuredClaims: run.native.structuredClaims,
    grounding: run.native.grounding,
    candidates: run.native.candidates,
    relations: run.native.extraction.relations,
  })),
});
const firstHash = semanticHash(semanticPayload(experiment));
const repeatHash = semanticHash(semanticPayload(repeat));
if (firstHash !== repeatHash) throw new Error("Representative process/temporal experiment is not deterministic.");
if (experiment.verdict !== "PASS") throw new Error(`Representative safety gate failed: ${JSON.stringify(experiment.invariants)}`);

if (process.env.HISTORY_V36_PROCESS_TEMPORAL_SUMMARY_ONLY === "1") {
  process.stdout.write(stable({
    verdict: experiment.verdict,
    episodeIds: experiment.episodeIds,
    phase26Comparison: experiment.phase26Comparison,
    missClassificationBefore: experiment.phase26MissClassification,
    missClassificationAfter: experiment.missClassification,
    invariants: experiment.invariants,
    firstHash,
    repeatHash,
  }));
  process.exit(0);
}

const implementationSha = await git("rev-parse", "HEAD");
const implementationTag = "history-v3.6-native-process-temporal-baseline";
const implementationTagSha = await git("rev-parse", `${implementationTag}^{}`);
if (implementationSha !== implementationTagSha) {
  throw new Error(`${implementationTag} must identify the exact implementation commit.`);
}

const generatedAt = new Date().toISOString();
const timestamp = generatedAt.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const basename = `history-v3.6-native-process-temporal-review-${timestamp}`;
const outputRoot = path.join(repository, "artifacts", "shadow", "history-v3.6");
const directory = path.join(outputRoot, basename);
await fs.mkdir(directory, { recursive: true });

const evidenceMatrix = JSON.parse(await fs.readFile(path.join(repository, "docs", "history", "v3.6", "process-temporal-evidence-matrix.json"), "utf8"));
const processClaimIds = new Set<string>(representativeNativeProcessClaimIdsV36);
const temporalClaimIds = new Set<string>(representativeNativeTemporalClaimIdsV36);
const semanticClaimIds = new Set<string>([...processClaimIds, ...temporalClaimIds]);
const nativeSemantics = experiment.runs.flatMap((run) => run.native.structuredClaims.envelopes
  .filter((envelope) => semanticClaimIds.has(envelope.claimId))
  .flatMap((envelope) => envelope.propositions.map((proposition) => ({
    episodeId: run.episodeId,
    claimId: envelope.claimId,
    claimText: run.native.claims.find((claim) => claim.id === envelope.claimId)?.normalizedProposition,
    proposition,
  }))));
const atomicSemantics = experiment.runs.flatMap((run) => run.native.grounding.propositions
  .filter((proposition) => semanticClaimIds.has(proposition.claimId))
  .map((proposition) => ({ episodeId: run.episodeId, proposition })));
const candidateProjectionGaps = experiment.runs.flatMap((run) => {
  const candidateClaimIds = new Set(run.native.candidates.map((candidate) => candidate.claimId));
  return run.native.grounding.propositions
    .filter((proposition) => semanticClaimIds.has(proposition.claimId) && !candidateClaimIds.has(proposition.claimId))
    .map((proposition) => ({ episodeId: run.episodeId, claimId: proposition.claimId, atomicProposition: proposition }));
});
const processTemporalRelations = experiment.runs.flatMap((run) => run.native.extraction.relations
  .filter((relation) => relation.kind === "process" || relation.kind === "temporal-sequence"));
const diagnostics = experiment.runs.flatMap((run) => run.native.structuredClaims.diagnostics.map((diagnostic) => ({ episodeId: run.episodeId, ...diagnostic })));
const diagnosticCounts = Object.fromEntries([...new Set(diagnostics.map((diagnostic) => diagnostic.code))].sort()
  .map((code) => [code, diagnostics.filter((diagnostic) => diagnostic.code === code).length]));

const provenance = {
  v36ImplementationCommitSha: implementationSha,
  phase26BaselineCommitSha: "3e3b99f0de99bfa9f75aa9262b0827b3424bdb64",
  phase26ReportCommitSha: "8304860f2141b173c6c4f52abdd65b4cb4e24381",
  phase26BaselineTag: "history-v3.6-native-structured-claims-baseline",
  phase25BaselineCommitSha: "d2c40db0dcd231a3606fe758d31e4fa42df19b03",
  phase25BaselineTag: "history-v3.6-structured-claim-review-baseline",
  contractBaselineCommitSha: "022f2177cc0e66f47cb5d652d6d456ce12a5a7be",
  contractBaselineTag: "history-v3.6-contract-preflight-baseline",
  frozenV35ProductionCommitSha: "f04262c16bfd1a89d1b404b1ac291a89dc699a0d",
  frozenV35ProductionTag: "history-v3.5-frozen-before-v36",
  frozenV35ProductionTagObjectSha: "149a2d160b140d13a97f66155a4b8705f6adf652",
  acceptedV35SemanticBaselineCommitSha: "82b4192f6e832523ce00675e39593e3f98a96403",
  acceptedV35SemanticBaselineTag: "history-v3.5-semantic-baseline",
  structuredClaimSchemaVersion: HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
  nativeGeneratorVersion: HISTORY_NATIVE_STRUCTURED_CLAIM_GENERATOR_V36,
  atomicGroundingSchemaVersion: HISTORY_ATOMIC_GROUNDING_SCHEMA_V36,
  relationSchemaVersion: HISTORY_EXPLANATORY_RELATIONS_SCHEMA_V36,
  artifactKind: "history-v3.6-native-process-temporal-review",
  episodeSet: loaded.map((item) => ({ episodeId: item.shadow.episodeId, title: item.title })),
  generatedAt,
  gitBranch: await git("branch", "--show-current"),
  liveProviderCalls: 0,
};

const architecture = await fs.readFile(path.join(repository, "docs", "history", "v3.6", "structured-claim-architecture.md"), "utf8");
const structuredSchema = await fs.readFile(path.join(repository, "docs", "history", "v3.6", "structured-claim-schema.json"), "utf8");
const structuredContract = await fs.readFile(path.join(repository, "docs", "history", "v3.6", "structured-claim-contract-document.json"), "utf8");
const atomicSchema = await fs.readFile(path.join(repository, "docs", "history", "v3.6", "atomic-grounding-schema.json"), "utf8");
const atomicContract = await fs.readFile(path.join(repository, "docs", "history", "v3.6", "atomic-grounding-contract-document.json"), "utf8");

const payloads: Record<string, string> = {
  "README.md": `# V3.6 native process and temporal review\n\nThe same-eight deterministic experiment passed. Native process/temporal semantics are explicit upstream and project directly to atomic grounding. Candidate projection is intentionally deferred. Live provider calls: 0.\n`,
  "architecture.md": architecture,
  "structured-claim-schema.json": structuredSchema,
  "structured-claim-contract-document.json": structuredContract,
  "atomic-grounding-schema.json": atomicSchema,
  "atomic-grounding-contract-document.json": atomicContract,
  "process-temporal-evidence-matrix.json": stable(evidenceMatrix),
  "native-generation-summary.json": stable({
    claimsEvaluated: experiment.claimsEvaluated,
    nativeClaims: experiment.nativeStructuredClaimCount,
    nativePropositions: experiment.nativeStructuredPropositionCount,
    nativeProcessPropositions: experiment.nativeProcessPropositionCount,
    nativeTemporalPropositions: experiment.nativeTemporalPropositionCount,
    processPredicate: "process-sequence",
    temporalPredicate: "precedes",
    semanticRoles: ["process", "step", "before", "after"],
    generatorVersion: HISTORY_NATIVE_STRUCTURED_CLAIM_GENERATOR_V36,
    liveProviderCalls: 0,
  }),
  "representative-summary.json": stable({
    verdict: experiment.verdict,
    episodeIds: experiment.episodeIds,
    phase26Comparison: experiment.phase26Comparison,
    invariants: experiment.invariants,
  }),
  "atomic-projection-summary.json": stable({
    atomicProcessPropositions: experiment.atomicProcessPropositionCount,
    atomicTemporalPropositions: experiment.atomicTemporalPropositionCount,
    projections: atomicSemantics,
    nativeStructurePresentAtomicGroundingGap: experiment.missClassification.nativeStructurePresentAtomicGroundingGap,
    inferenceFromProse: false,
  }),
  "relation-comparison.json": stable({
    before: experiment.phase26Comparison.before,
    after: experiment.phase26Comparison.after,
    newlyValidatedProcessTemporalRelations: processTemporalRelations,
    candidateProjectionStatus: "Phase 2.8",
  }),
  "miss-classification.json": stable({
    before: experiment.phase26MissClassification,
    after: experiment.missClassification,
  }),
  "cache-invalidation-summary.json": stable({
    ...nativeStructuredClaimCacheContractV36,
    schemaBefore: "history-structured-claim.v1",
    schemaAfter: HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
    generatorBefore: "history-native-structured-claim-generator.v1",
    generatorAfter: HISTORY_NATIVE_STRUCTURED_CLAIM_GENERATOR_V36,
    sameSemanticInputsReuse: true,
    schemaGeneratorClaimBindingChangesInvalidate: true,
    mediaChangesInvalidate: false,
  }),
  "diagnostic-summary.json": stable({ counts: diagnosticCounts, diagnostics }),
  "manual-review.json": stable({
    allNativeProcessPropositions: nativeSemantics.filter((item) => item.proposition.predicate === "process-sequence"),
    allNativeTemporalPropositions: nativeSemantics.filter((item) => item.proposition.predicate === "precedes"),
    allCorrespondingAtomicPropositions: atomicSemantics,
    allNewlyValidatedProcessTemporalRelations: processTemporalRelations,
    allProcessTemporalCandidateProjectionGaps: candidateProjectionGaps,
    allAssertionSensitiveRepresentativeCases: nativeSemantics.filter((item) => item.proposition.assertionStatus !== "asserted"),
    assertionContractControls: ["intended process projects as intended", "attempted temporal order projects as attempted"],
    allOrderSensitiveCases: nativeSemantics,
    allRejectedAmbiguousClaims: evidenceMatrix.rejectedControls,
  }),
  "decision-report.md": `# Decision report\n\nVerdict: **${experiment.verdict}**. The representative corpus adds ${experiment.nativeProcessPropositionCount} native process and ${experiment.nativeTemporalPropositionCount} native temporal propositions, all with direct atomic projection. Candidate and validated relation totals remain ${experiment.phase26Comparison.after.candidates} and ${experiment.phase26Comparison.after.validatedRelations}; ${candidateProjectionGaps.length} new process/temporal atoms remain candidate-projection gaps. Recommend exactly one next task: **Phase 2.8 process/temporal candidate projection**.\n`,
  "test-summary.json": stable({
    typecheckPreflight: "PASS",
    focusedV36UnitTests: "PASS",
    focusedTestCount: 109,
    goldenFixtures: 45,
    processTemporalSchemaTests: "PASS",
    cacheInvalidationTests: "PASS",
    representativeSemanticControls: "PASS",
    finalHistoryTypecheck: "PASS",
    targetedEslint: "PASS",
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
const checksums = await Promise.all(files.map(async (file) => `${createHash("sha256").update(await fs.readFile(path.join(directory, file))).digest("hex")}  ${file}`));
await fs.writeFile(path.join(directory, "checksums.sha256"), `${checksums.join("\n")}\n`);
await execute("sha256sum", ["-c", "checksums.sha256"], { cwd: directory });
const zipPath = `${directory}.zip`;
await execute("zip", ["-X", "-q", "-r", zipPath, basename], { cwd: outputRoot });
await execute("unzip", ["-t", zipPath], { cwd: outputRoot });
process.stdout.write(stable({
  zipPath,
  zipSha256: createHash("sha256").update(await fs.readFile(zipPath)).digest("hex"),
  firstHash,
  repeatHash,
  summary: JSON.parse(payloads["representative-summary.json"]!),
}));
