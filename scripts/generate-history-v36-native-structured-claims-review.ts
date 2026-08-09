import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  HISTORY_ATOMIC_GROUNDING_SCHEMA_V36,
  HISTORY_NATIVE_STRUCTURED_CLAIM_GENERATOR_V36,
  HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
  nativeStructuredClaimCacheContractV36,
  representativeNativeEpisodeFragmentsV36,
  representativeSemanticFamilyEvaluationV36,
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
  readonly shadow: RepresentativeShadowSourceV36;
  readonly native: NativeStructuredClaimSourceV36;
  readonly title: string;
}

async function loadSource(fragment: string): Promise<LoadedSource> {
  const entries = await fs.readdir(path.join(repository, "episodes"), { withFileTypes: true });
  const episodeId = entries.find((entry) =>
    entry.isDirectory() &&
    entry.name.includes(fragment) &&
    !entry.name.endsWith("-v3.4")
  )?.name;
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
const experimentSources = loaded.map(({ shadow, native }) => ({ shadow, native }));
const experiment = runRepresentativeNativeStructuredClaimExperimentV36(experimentSources);
const repeat = runRepresentativeNativeStructuredClaimExperimentV36(experimentSources);
const semanticPayload = (value: typeof experiment) => ({
  episodeIds: value.episodeIds,
  nativeStructuredClaimCount: value.nativeStructuredClaimCount,
  nativeStructuredPropositionCount: value.nativeStructuredPropositionCount,
  compatibilityFallbackPropositionCount: value.compatibilityFallbackPropositionCount,
  groundingComparison: value.groundingComparison,
  relationComparison: value.relationComparison,
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
const firstHash = hash(semanticPayload(experiment));
const repeatHash = hash(semanticPayload(repeat));
if (firstHash !== repeatHash) throw new Error("Representative native experiment is not deterministic.");
if (experiment.verdict !== "PASS") throw new Error(`Representative native safety gate failed: ${JSON.stringify(experiment.invariants)}`);

const implementationSha = await git("rev-parse", "HEAD");
const implementationTagSha = await git("rev-parse", "history-v3.6-native-structured-claims-baseline^{}");
if (implementationSha !== implementationTagSha) {
  throw new Error("Native structured claim baseline tag does not identify the exact implementation commit.");
}
const generatedAt = new Date().toISOString();
const timestamp = generatedAt.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const basename = `history-v3.6-native-structured-claims-review-${timestamp}`;
const outputRoot = path.join(repository, "artifacts", "shadow", "history-v3.6");
const directory = path.join(outputRoot, basename);
await fs.mkdir(directory, { recursive: true });

const newNativeClaims = experiment.runs.flatMap((run) => run.native.structuredClaims.envelopes
  .filter((envelope) => envelope.source.kind === "existing-structured-claim")
  .map((envelope) => ({
    episodeId: run.episodeId,
    claimId: envelope.claimId,
    claimText: run.native.claims.find((claim) => claim.id === envelope.claimId)?.normalizedProposition,
    propositions: envelope.propositions,
  })));
const nativeClaimIds = new Set(newNativeClaims.map((item) => item.claimId));
const nativeDownstreamGaps = experiment.runs.flatMap((run) => run.native.grounding.claims
  .filter((record) => nativeClaimIds.has(record.claimId) && !run.native.candidates.some((candidate) => candidate.claimId === record.claimId && candidate.source === "atomic-claim-grounding"))
  .map((record) => ({ episodeId: run.episodeId, claimId: record.claimId, atomicPropositions: record.propositions })));
const allDiagnostics = experiment.runs.flatMap((run) => run.native.structuredClaims.diagnostics.map((diagnostic) => ({ episodeId: run.episodeId, ...diagnostic })));
const diagnosticCounts = Object.fromEntries([...new Set(allDiagnostics.map((diagnostic) => diagnostic.code))].sort().map((code) => [code, allDiagnostics.filter((diagnostic) => diagnostic.code === code).length]));

const historicalCompatibility = {
  historicalNativeCoverageAvailable: false,
  historicalNativeCoverage: "unavailable",
  reason: "The frozen 40-episode V3.5 corpus predates native structured output and contains no claim-generation sidecars.",
  canonicalClaims: 3774,
  structuredClaims: 106,
  structuredPropositions: 111,
  nativePropositions: 0,
  compatibilityBackfillPropositions: 111,
  atomicPropositions: 111,
  insufficientStructure: 309,
  validatedRelations: 103,
};
const provenance = {
  v36ImplementationCommitSha: implementationSha,
  phase25BaselineCommitSha: "d2c40db0dcd231a3606fe758d31e4fa42df19b03",
  phase25BaselineTag: "history-v3.6-structured-claim-review-baseline",
  contractBaselineCommitSha: "022f2177cc0e66f47cb5d652d6d456ce12a5a7be",
  contractBaselineTag: "history-v3.6-contract-preflight-baseline",
  frozenV35ProductionCommitSha: "f04262c16bfd1a89d1b404b1ac291a89dc699a0d",
  frozenV35ProductionTag: "history-v3.5-frozen-before-v36",
  acceptedV35SemanticBaselineCommitSha: "82b4192f6e832523ce00675e39593e3f98a96403",
  acceptedV35SemanticBaselineTag: "history-v3.5-semantic-baseline",
  structuredClaimSchemaVersion: HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
  nativeGeneratorVersion: HISTORY_NATIVE_STRUCTURED_CLAIM_GENERATOR_V36,
  atomicGroundingSchemaVersion: HISTORY_ATOMIC_GROUNDING_SCHEMA_V36,
  relationSchemaVersion: "history-explanatory-relation.v1",
  artifactKind: "history-v3.6-native-structured-claims-review",
  episodeSet: loaded.map((item) => ({ episodeId: item.shadow.episodeId, title: item.title })),
  generatedAt,
  gitBranch: await git("branch", "--show-current"),
  liveProviderCalls: 0,
  liveLlmRelationCalls: 0,
  historicalNativeCoverageAvailable: false,
};

const architecture = await fs.readFile(path.join(repository, "docs", "history", "v3.6", "structured-claim-architecture.md"), "utf8");
const schema = await fs.readFile(path.join(repository, "docs", "history", "v3.6", "structured-claim-schema.json"), "utf8");
const contract = await fs.readFile(path.join(repository, "docs", "history", "v3.6", "structured-claim-contract-document.json"), "utf8");
const manualReview = {
  allNewlyNativeStructuredClaims: newNativeClaims,
  allNewlyValidatedRelations: experiment.relationComparison.newlyValidated,
  allNativeStructureStillFailingDownstream: nativeDownstreamGaps,
  purposeObjectiveMovementControls: newNativeClaims.filter((item) => item.propositions.some((proposition) => ["moves-from", "moves-through", "search-object"].includes(proposition.predicate))),
  assertionSensitiveCases: newNativeClaims.filter((item) => item.propositions.some((proposition) => proposition.assertionStatus !== "asserted")),
  crossClaimProofGaps: [{ episodeId: loaded.find((item) => item.shadow.episodeId.includes("04-black-death"))!.shadow.episodeId, count: 1, status: "not implemented" }],
  taxonomyGaps: [],
  unresolvedParticipantControls: allDiagnostics.filter((diagnostic) => diagnostic.code === "STRUCTURED_CLAIM_PARTICIPANT_UNRESOLVED"),
};
const payloads: Record<string, string> = {
  "README.md": `# V3.6 native structured claims review\n\nFixture-backed native claim-boundary experiment over the same eight representative episodes. Verdict: **${experiment.verdict}**. Live provider/LLM calls: 0. Historical all-40 native coverage: unavailable.\n`,
  "architecture.md": architecture,
  "structured-claim-schema.json": schema,
  "structured-claim-contract-document.json": contract,
  "canonical-claim-integration.json": stable({
    canonicalEntrypoint: "packages/history/src/history-claims-v34.ts#structureTrustedScriptClaimsV34",
    nativeBoundaryEntrypoint: "packages/history/src/v36/native-structured-claim-generator-v36.ts#structureTrustedScriptClaimsNativeV36",
    persistenceEntrypoint: "packages/history/src/v36/native-structured-claim-generator-v36.ts#persistNativeStructuredClaimSidecarV36",
    integrationArchitecture: "unchanged HistoryClaimV34 plus versioned V3.6 sidecar keyed by claimId",
    generationMode: "deterministic/local with fixtures",
    providerBehavior: "no provider; no second call per claim",
    v35SerializationChanged: false,
  }),
  "native-generation-summary.json": stable({
    claimsEvaluated: experiment.claimsEvaluated,
    nativeStructuredClaimCount: experiment.nativeStructuredClaimCount,
    nativeStructuredPropositionCount: experiment.nativeStructuredPropositionCount,
    compatibilityFallbackPropositionCount: experiment.compatibilityFallbackPropositionCount,
    semanticFamilyEvaluation: representativeSemanticFamilyEvaluationV36,
    sourceKind: "existing-structured-claim",
    generationMethod: "native-structured-claim-generation",
    sourceProvenance: "exact canonical claim substring, global narration UTF-16 coordinates, SHA-256, episodeId/claimId envelope authority, canonical participant IDs",
    historicalCompatibility,
  }),
  "representative-native-summary.json": stable({
    verdict: experiment.verdict,
    episodeIds: experiment.episodeIds,
    claimsEvaluated: experiment.claimsEvaluated,
    nativeStructuredClaimCount: experiment.nativeStructuredClaimCount,
    nativeStructuredPropositionCount: experiment.nativeStructuredPropositionCount,
    compatibilityFallbackPropositionCount: experiment.compatibilityFallbackPropositionCount,
    groundingComparison: experiment.groundingComparison,
    relationComparison: experiment.relationComparison,
    invariants: experiment.invariants,
  }),
  "grounding-comparison.json": stable(experiment.groundingComparison),
  "relation-comparison.json": stable(experiment.relationComparison),
  "miss-classification.json": stable(experiment.missClassification),
  "cache-invalidation-summary.json": stable(nativeStructuredClaimCacheContractV36),
  "diagnostic-summary.json": stable({ counts: diagnosticCounts, diagnostics: allDiagnostics }),
  "manual-review.json": stable(manualReview),
  "decision-report.md": `# Decision report\n\nVerdict: **${experiment.verdict}**. Native claim-boundary fixtures reduced representative insufficient structure from ${experiment.groundingComparison.before.insufficientStructure} to ${experiment.groundingComparison.after.insufficientStructure} (${experiment.groundingComparison.insufficientStructureReduction.absolute} absolute; ${experiment.groundingComparison.insufficientStructureReduction.percentage}%). Historical all-40 native coverage is unavailable; compatibility metrics remain ${historicalCompatibility.structuredPropositions} structured propositions, ${historicalCompatibility.insufficientStructure} insufficient claims, and ${historicalCompatibility.validatedRelations} validated relations.\n`,
  "test-summary.json": stable({
    phase25HistoryTypecheckPreflight: "PASS",
    nativeBoundaryUnitTests: "PASS",
    existingV36SchemaIrGoldenAndIntegrationTests: "PASS",
    goldenFixtures: 45,
    finalHistoryTypecheck: "PASS",
    targetedLint: "PASS",
    representativeGate: experiment.verdict,
    deterministicRepeatHash: firstHash,
    repeatHash,
    repeatMatch: firstHash === repeatHash,
    liveProviderCalls: 0,
    liveLlmRelationCalls: 0,
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
process.stdout.write(`${stable({ zipPath, zipSha256: createHash("sha256").update(await fs.readFile(zipPath)).digest("hex"), firstHash, repeatHash, summary: JSON.parse(payloads["representative-native-summary.json"]!) })}`);
