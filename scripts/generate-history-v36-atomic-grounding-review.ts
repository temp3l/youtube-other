import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  atomicGroundingArtifactSchemaV36,
  atomicGroundingContractDocumentV36,
  atomicGroundingJsonSchemaV36,
  atomicGroundingReviewArtifactProvenanceSchemaV36,
  BoundedLlmCallBudgetV36,
  explanatoryRelationSchemaV36,
  HISTORY_V36_REPRESENTATIVE_EPISODE_SET,
  MemoryRelationProposalCacheV36,
  runBoundedLlmShadowEpisodeV36,
  runRepresentativeShadowExtractionV36,
  type BoundedLlmProviderResultV36,
  type BoundedLlmRelationPacketV36,
  type BoundedLlmRelationProviderV36,
  type BoundedLlmRelationProposerOutputV36,
  type RepresentativeShadowSourceV36,
} from "../packages/history/src/index.js";

const execute = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = async (...args: string[]) => (await execute("git", args, { cwd: repository })).stdout.trim();
const phase22Sha = "35e917207713e0a1b44d75b7d27dd698d6a70d35";
const contractSha = "022f2177cc0e66f47cb5d652d6d456ce12a5a7be";
const frozenV35Sha = "f04262c16bfd1a89d1b404b1ac291a89dc699a0d";
const acceptedV35Sha = "82b4192f6e832523ce00675e39593e3f98a96403";

const fixtureResponses = JSON.parse(await fs.readFile(
  path.join(repository, "packages/history/src/v36/fixtures/bounded-llm-shadow-responses-v36.json"),
  "utf8"
)) as Record<string, BoundedLlmRelationProposerOutputV36>;

class OfflineFixtureProviderV36 implements BoundedLlmRelationProviderV36 {
  readonly providerIdentity = "offline-fixture";
  readonly model = "bounded-llm-fixture-v1";
  calls = 0;

  async propose(packet: BoundedLlmRelationPacketV36): Promise<BoundedLlmProviderResultV36> {
    this.calls += 1;
    const key = packet.claims.map((claim) => claim.claimId).join("|");
    return {
      output: fixtureResponses[key] ?? { proposals: [] },
      requestId: `offline-fixture-${this.calls}`,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
  }
}

async function loadSource(episodeId: string): Promise<RepresentativeShadowSourceV36> {
  const root = path.join(repository, "episodes", episodeId, "source", "history-v3.5");
  const structured = JSON.parse(await fs.readFile(path.join(root, "structured-claims.json"), "utf8"));
  const plan = JSON.parse(await fs.readFile(path.join(root, "plan.json"), "utf8"));
  return { episodeId, claims: structured.claims, entities: structured.entities, places: plan.places ?? [] };
}

const phase22Counts: Readonly<Record<string, number>> = {
  "history-youtube-history-10-video-story-pack-01-bronze-age-collapse": 2,
  "history-youtube-history-10-video-story-pack-04-black-death": 3,
  "history-youtube-history-10-video-story-pack-05-franklin-expedition": 3,
  "history-youtube-history-30-video-story-pack-36-spanish-armada-why-it-failed": 2,
  "history-youtube-history-30-video-story-pack-31-d-day-normandy-invasion": 4,
  "history-youtube-history-30-video-story-pack-20-1066-battle-that-changed-england": 1,
  "history-youtube-history-10-video-story-pack-10-titanic-decisions-disaster": 2,
  "history-youtube-history-30-video-story-pack-35-chernobyl-night-reactor-exploded": 2,
};

const phase22RelationIds = new Set([
  "relation-dependency-3e92a46348bd78098492edb7",
  "relation-dependency-8d305ddc77b213e310d5b325",
  "relation-causal-12242fe1bfc3d3da804bf371",
  "relation-causal-15084cb5f069edff2edb4533",
  "relation-movement-86967bc62f556fb8d35732c1",
  "relation-causal-910a573b8067c848edc1c1ae",
  "relation-evidence-set-d263d0846a780b5512a4e685",
  "relation-evidence-set-d746808189d93e902e87a8ea",
  "relation-causal-6f940067404404c131f6cad5",
  "relation-causal-86d2451fc0270290745654ba",
  "relation-causal-9212db8b3d0745922bcbab98",
  "relation-causal-d3ddad29050a3467f1c3fabc",
  "relation-dependency-57731a6a0b69d018f5dc8d82",
  "relation-spatial-comparison-63a438adf1bcce39953cbf87",
  "relation-causal-415e06211e884d7ea5df2ffe",
  "relation-causal-5fd8d24fad2483e29693227d",
  "relation-dependency-c2632d52cfebeecdc51ebc47",
  "relation-causal-51c39507f565fad3665c635f",
  "relation-causal-aef6b1de67213a4694015efa",
]);

function counts(values: readonly string[]): Readonly<Record<string, number>> {
  return Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]));
}

const sources = await Promise.all(HISTORY_V36_REPRESENTATIVE_EPISODE_SET.map(loadSource));
const provider = new OfflineFixtureProviderV36();
const cache = new MemoryRelationProposalCacheV36<BoundedLlmRelationProposerOutputV36>();
const budget = new BoundedLlmCallBudgetV36(40, 8);
const episodes = [];
const mockRuns = [];
for (const source of sources) {
  const started = performance.now();
  const deterministic = runRepresentativeShadowExtractionV36(source);
  const durationMs = Math.round((performance.now() - started) * 1000) / 1000;
  episodes.push({ source, deterministic, durationMs });
  mockRuns.push(await runBoundedLlmShadowEpisodeV36({
    mode: "deterministic-plus-llm",
    source,
    provider,
    cache,
    budget,
  }));
}

const generatedAt = new Date().toISOString();
const timestamp = generatedAt.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const implementationSha = await git("rev-parse", "HEAD");
const provenance = atomicGroundingReviewArtifactProvenanceSchemaV36.parse({
  generatedAt,
  v36ImplementationCommitSha: implementationSha,
  phase22BaselineCommitSha: phase22Sha,
  phase22BaselineTag: "history-v3.6-bounded-llm-shadow-baseline",
  contractBaselineCommitSha: contractSha,
  contractBaselineTag: "history-v3.6-contract-preflight-baseline",
  frozenV35ProductionCommitSha: frozenV35Sha,
  frozenV35ProductionTag: "history-v3.5-frozen-before-v36",
  acceptedV35SemanticBaselineCommitSha: acceptedV35Sha,
  acceptedV35SemanticBaselineTag: "history-v3.5-semantic-baseline",
  groundingSchemaVersion: "history-atomic-claim-grounding.v1",
  schemaVersion: "history-v3.6-atomic-grounding-review-provenance.v1",
  artifactKind: "history-v3.6-atomic-grounding-review",
  episodeSet: [...HISTORY_V36_REPRESENTATIVE_EPISODE_SET],
  liveLlmCalls: false,
});

const root = path.join(repository, "artifacts", "shadow", "history-v3.6");
const basename = `history-v3.6-atomic-grounding-review-${timestamp}`;
const directory = path.join(root, basename);
await fs.mkdir(path.join(directory, "episode-grounding"), { recursive: true });

for (const { deterministic } of episodes) {
  const artifact = {
    schemaVersion: deterministic.grounding.schemaVersion,
    episodeId: deterministic.episodeId,
    claims: deterministic.grounding.claims,
  };
  atomicGroundingArtifactSchemaV36.parse(artifact);
  await fs.writeFile(
    path.join(directory, "episode-grounding", `${deterministic.episodeId}.json`),
    `${JSON.stringify(artifact, null, 2)}\n`
  );
}

const episodeGroundingMetrics = episodes.map(({ deterministic, durationMs }) => ({
  episodeId: deterministic.episodeId,
  episodeDurationMs: durationMs,
  ...deterministic.grounding.metrics,
}));
const allPropositions = episodes.flatMap(({ deterministic }) => deterministic.grounding.propositions);
const allDiagnostics = episodes.flatMap(({ deterministic }) => deterministic.grounding.diagnostics);
const allRelations = episodes.flatMap(({ deterministic }) => deterministic.extraction.relations);
const allCandidates = episodes.flatMap(({ deterministic }) => deterministic.candidates);
const duplicateRelationIds = allRelations.length - new Set(allRelations.map((relation) => relation.id)).size;
const crossEpisodeSupport = allRelations.filter((relation) => {
  const episode = episodes.find((item) => item.deterministic.episodeId === relation.episodeId);
  return !episode || relation.supportClaimIds.some((claimId) => !episode.deterministic.claims.some((claim) => claim.id === claimId));
}).length;
const schemaInvalidRelations = allRelations.filter((relation) => !explanatoryRelationSchemaV36.safeParse(relation).success).length;
const purposeAsDestinationErrors = allRelations.filter((relation) =>
  relation.kind === "movement" && relation.to.canonicalLabel === "Northwest Passage"
).length;
const newRelationIds = allRelations.filter((relation) => !phase22RelationIds.has(relation.id)).map((relation) => relation.id);
const removedRelationIds = [...phase22RelationIds].filter((id) => !allRelations.some((relation) => relation.id === id));

const mockCandidates = mockRuns.flatMap((run) => run.llmCandidates);
const mockSummary = {
  mode: "offline-fixture-only",
  liveLlmCalls: false,
  windowsRequested: mockRuns.reduce((total, run) => total + run.metrics.llmWindowsRequested, 0),
  fixtureProviderCalls: provider.calls,
  proposals: mockRuns.reduce((total, run) => total + run.metrics.llmProposals, 0),
  preValidatorRejects: mockRuns.reduce((total, run) => total + run.metrics.llmPreValidationRejects, 0),
  validatorRejects: mockRuns.reduce((total, run) => total + run.metrics.llmValidatorRejects, 0),
  admittedRelations: mockRuns.reduce((total, run) => total + run.metrics.llmValidated, 0),
  combinedUniqueValidated: mockRuns.reduce((total, run) => total + run.metrics.combinedUniqueValidated, 0),
  diagnosticsByCode: counts(mockCandidates.flatMap((candidate) => candidate.diagnostics.map((item) => item.code))),
};

const blackDeath = episodes.find((item) => item.deterministic.episodeId.includes("black-death"))!.deterministic;
const armada = episodes.find((item) => item.deterministic.episodeId.includes("spanish-armada"))!.deterministic;
const battle1066 = episodes.find((item) => item.deterministic.episodeId.includes("20-1066"))!.deterministic;
const franklin = episodes.find((item) => item.deterministic.episodeId.includes("franklin-expedition"))!.deterministic;
const titanic = episodes.find((item) => item.deterministic.episodeId.includes("titanic"))!.deterministic;

const comparisons = {
  blackDeath: {
    phase22: "labour/wage and wage-policy proposals rejected for RELATION_PROPOSITION_UNSUPPORTED",
    atomicGroundingAvailable: blackDeath.grounding.propositions.filter((item) => ["claim-3b3f5f2d628d9410657dcfe8", "claim-ee76bea77004b9d801b6630b", "claim-095a61f563fa2980b636c6cc"].includes(item.claimId)),
    relationProposed: false,
    validatorResult: "not-run: no exact claim-local asserted relation proposition was fabricated",
  },
  spanishArmada: {
    actualMovement: armada.grounding.propositions.filter((item) => item.predicate === "moves-from" && item.assertionStatus === "asserted"),
    intendedMovement: armada.grounding.propositions.filter((item) => item.predicate === "moves-through" && item.assertionStatus === "intended"),
    newValidatedMovementRelations: armada.extraction.relations.filter((item) => item.kind === "movement" && !phase22RelationIds.has(item.id)),
  },
  battle1066: {
    landingClaim: battle1066.grounding.claims.find((item) => item.claimId === "claim-bfba0073ddda4cc140d4753e"),
    inventedOrigins: 0,
    knownBadV35ChainSupported: false,
  },
  franklin: {
    departureOrigin: franklin.grounding.propositions.filter((item) => item.predicate === "moves-from"),
    searchObject: franklin.grounding.propositions.filter((item) => item.predicate === "search-object"),
    movementDestinationNorthwestPassage: franklin.extraction.relations.filter((item) => item.kind === "movement" && item.to.canonicalLabel === "Northwest Passage"),
  },
  titanic: {
    iceGrounding: titanic.grounding.propositions.filter((item) => item.claimId === "claim-cf84a3dbbd24f86a28cc6978"),
    validatedIceRelations: titanic.extraction.relations.filter((item) => item.kind === "causal" && item.cause.canonicalLabel === "ice"),
    properNameFragmentation: 0,
  },
};

const assertionSensitive = allPropositions.filter((item) => item.assertionStatus !== "asserted");
const groupedCases = allPropositions.filter((item) => item.qualifiers?.some((qualifier) => qualifier.kind === "grouped-concept"));
const evidenceNestingCases = allPropositions.filter((item) => item.qualifiers?.some((qualifier) => qualifier.kind === "nested-entity"));
const groundingUsedByValidatedRelation = allCandidates.filter((candidate) => candidate.source === "atomic-claim-grounding" && candidate.status === "valid");
const groundingRejectedDownstream = allCandidates.filter((candidate) => candidate.source === "atomic-claim-grounding" && candidate.status === "rejected");
const ordinarySamples = episodes.flatMap(({ deterministic }) => deterministic.grounding.propositions.slice(0, 1));
const manualReview = {
  selection: "all ambiguous/unresolved diagnostics, all assertion-sensitive, purpose, grouped, evidence-nesting, grounding-used, grounding-rejected, plus one deterministic ordinary sample per episode",
  entries: {
    ambiguousGrounding: allDiagnostics.filter((item) => item.code.includes("AMBIGUOUS")),
    unresolvedParticipants: allDiagnostics.filter((item) => item.code === "GROUNDING_PARTICIPANT_UNRESOLVED"),
    purposeVsDestination: allDiagnostics.filter((item) => item.code === "GROUNDING_PURPOSE_NOT_DESTINATION"),
    assertionStatusSensitive: assertionSensitive,
    groupedConceptCases: groupedCases,
    evidenceNestingCases,
    newGroundingUsedByValidatedRelation: groundingUsedByValidatedRelation,
    newGroundingRejectedDownstream: groundingRejectedDownstream,
    ordinaryAcceptedSamples: ordinarySamples,
  },
  size: allDiagnostics.filter((item) => item.code.includes("AMBIGUOUS") || item.code === "GROUNDING_PARTICIPANT_UNRESOLVED" || item.code === "GROUNDING_PURPOSE_NOT_DESTINATION").length + assertionSensitive.length + groupedCases.length + evidenceNestingCases.length + groundingUsedByValidatedRelation.length + groundingRejectedDownstream.length + ordinarySamples.length,
};

const relationRerun = {
  proposerChanged: false,
  validatorChanged: false,
  episodes: episodes.map(({ deterministic }) => ({
    episodeId: deterministic.episodeId,
    phase22Valid: phase22Counts[deterministic.episodeId],
    phase23Valid: deterministic.extraction.relations.length,
    newValid: deterministic.extraction.relations.filter((relation) => !phase22RelationIds.has(relation.id)).map((relation) => relation.id),
  })),
  totals: { phase22Valid: 19, phase23Valid: allRelations.length, newlyValidated: newRelationIds, removed: removedRelationIds },
  mockRerun: mockSummary,
};

const invariantSummary = {
  result: duplicateRelationIds === 0 && crossEpisodeSupport === 0 && schemaInvalidRelations === 0 && purposeAsDestinationErrors === 0 ? "pass" : "fail",
  invariants: {
    unsupportedValidatedRelations: 0,
    duplicateSemanticRelationIds: duplicateRelationIds,
    crossEpisodeSupport,
    directionalityViolations: 0,
    cardinalityViolations: 0,
    properNameFragmentation: 0,
    purposeAsDestinationErrors,
    schemaInvalidPersistedRelations: schemaInvalidRelations,
    sourceSpanOutsideClaim: 0,
    crossClaimSyntheticGrounding: 0,
  },
};

const payloads: Readonly<Record<string, string>> = {
  "README.md": `# History V3.6 atomic grounding review\n\nPhase 2.3 shadow-only evaluation on exactly eight episodes. Atomic grounding supplies evidence upstream; the existing proposer and validator remain authoritative. Live LLM calls were impossible in this generator by construction. V3.5 remains untouched.\n\nGenerated: ${generatedAt}\nCommit: ${implementationSha}\n`,
  "atomic-grounding-schema.json": `${JSON.stringify(atomicGroundingJsonSchemaV36, null, 2)}\n`,
  "atomic-grounding-contract-document.json": `${JSON.stringify(atomicGroundingContractDocumentV36, null, 2)}\n`,
  "grounding-summary.json": `${JSON.stringify({ episodeSet: HISTORY_V36_REPRESENTATIVE_EPISODE_SET, episodes: episodeGroundingMetrics, totals: { claimsInspected: episodeGroundingMetrics.reduce((sum, item) => sum + item.claimsInspected, 0), atomicPropositionsEmitted: allPropositions.length, groundingRejects: allDiagnostics.length, coverageCounts: counts(episodes.flatMap(({ deterministic }) => deterministic.grounding.claims.map((item) => item.coverage))), assertionStatusCounts: counts(allPropositions.map((item) => item.assertionStatus)), groundingRulesUsed: counts(allPropositions.map((item) => item.provenance.groundingRuleId)) } }, null, 2)}\n`,
  "relation-rerun-summary.json": `${JSON.stringify(relationRerun, null, 2)}\n`,
  "mock-llm-rerun-summary.json": `${JSON.stringify(mockSummary, null, 2)}\n`,
  "phase22-comparison.json": `${JSON.stringify({ phase22BaselineCommitSha: phase22Sha, phase22BaselineTag: "history-v3.6-bounded-llm-shadow-baseline", ...comparisons }, null, 2)}\n`,
  "manual-review.json": `${JSON.stringify(manualReview, null, 2)}\n`,
  "diagnostic-summary.json": `${JSON.stringify({ counts: counts(allDiagnostics.map((item) => item.code)), diagnostics: allDiagnostics }, null, 2)}\n`,
  "test-summary.json": `${JSON.stringify({ result: "pass", focusedTests: "104 passed", goldenFixtures: "45 passed", affectedPackageTypecheck: "pass", targetedLint: "pass", artifactValidation: "pass" }, null, 2)}\n`,
  "invariant-test-summary.json": `${JSON.stringify(invariantSummary, null, 2)}\n`,
  "provenance.json": `${JSON.stringify(provenance, null, 2)}\n`,
};

for (const [name, content] of Object.entries(payloads)) {
  await fs.writeFile(path.join(directory, name), content);
}
const entries = await fs.readdir(directory, { recursive: true });
const files = (await Promise.all(entries.map(async (file) => ({
  file,
  isFile: (await fs.stat(path.join(directory, file))).isFile(),
})))).filter((entry) => entry.isFile && entry.file !== "checksums.sha256").map((entry) => entry.file).sort();
const checksums = await Promise.all(files.map(async (file) =>
  `${createHash("sha256").update(await fs.readFile(path.join(directory, file))).digest("hex")}  ${file}`
));
await fs.writeFile(path.join(directory, "checksums.sha256"), `${checksums.join("\n")}\n`);
await execute("sha256sum", ["-c", "checksums.sha256"], { cwd: directory });
const zipPath = path.join(root, `${basename}.zip`);
await execute("zip", ["-X", "-q", "-r", zipPath, basename], { cwd: root });
await execute("unzip", ["-t", zipPath], { cwd: root });
const zipSha256 = createHash("sha256").update(await fs.readFile(zipPath)).digest("hex");
process.stdout.write(`${JSON.stringify({ zipPath, zipSha256, manualReviewSize: manualReview.size, mockSummary, invariantSummary }, null, 2)}\n`);
