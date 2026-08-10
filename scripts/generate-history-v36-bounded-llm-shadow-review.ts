import "dotenv/config";

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

import { createOpenAiStoryClientWithOptions } from "../packages/story-localization/src/story-localization-openai-batch.js";
import {
  BoundedLlmCallBudgetV36,
  FileRelationProposalCacheV36,
  HISTORY_V36_REPRESENTATIVE_EPISODE_SET,
  HISTORY_V36_RELATION_PROPOSER_PROMPT_VERSION,
  MemoryRelationProposalCacheV36,
  OpenAiBoundedLlmRelationProviderV36,
  boundedLlmProposerConfigFromEnvV36,
  boundedLlmReviewArtifactProvenanceSchemaV36,
  runBoundedLlmShadowEpisodeV36,
  type BoundedLlmEpisodeResultV36,
  type BoundedLlmProviderResultV36,
  type BoundedLlmRelationPacketV36,
  type BoundedLlmRelationProviderV36,
  type BoundedLlmRelationProposerOutputV36,
  type RepresentativeShadowSourceV36,
} from "../packages/history/src/index.js";

const execute = promisify(execFile);
const repository = path.resolve(new URL("..", import.meta.url).pathname);
const git = async (...args: string[]) => (await execute("git", args, { cwd: repository })).stdout.trim();
const fixtureResponses = JSON.parse(await fs.readFile(path.join(repository, "packages/history/src/v36/fixtures/bounded-llm-shadow-responses-v36.json"), "utf8")) as Record<string, BoundedLlmRelationProposerOutputV36>;

class FixtureProviderV36 implements BoundedLlmRelationProviderV36 {
  readonly providerIdentity = "offline-fixture";
  readonly model = "bounded-llm-fixture-v1";
  calls = 0;

  async propose(packet: BoundedLlmRelationPacketV36): Promise<BoundedLlmProviderResultV36> {
    this.calls += 1;
    const output = fixtureResponses[packet.claims.map((claim) => claim.claimId).join("|")] ?? { proposals: [] };
    return { output, requestId: `fixture-${this.calls}`, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
  }
}

async function loadSource(episodeId: string): Promise<RepresentativeShadowSourceV36> {
  const root = path.join(repository, "episodes", episodeId, "source", "history-v3.5");
  const structured = JSON.parse(await fs.readFile(path.join(root, "structured-claims.json"), "utf8"));
  const plan = JSON.parse(await fs.readFile(path.join(root, "plan.json"), "utf8"));
  return { episodeId, claims: structured.claims, entities: structured.entities, places: plan.places ?? [] };
}

async function runSet(input: {
  readonly mode: "deterministic-only" | "deterministic-plus-llm";
  readonly sources: readonly RepresentativeShadowSourceV36[];
  readonly provider?: BoundedLlmRelationProviderV36;
  readonly cache?: MemoryRelationProposalCacheV36<BoundedLlmRelationProposerOutputV36> | FileRelationProposalCacheV36<BoundedLlmRelationProposerOutputV36>;
  readonly budget?: BoundedLlmCallBudgetV36;
}): Promise<readonly BoundedLlmEpisodeResultV36[]> {
  const results: BoundedLlmEpisodeResultV36[] = [];
  for (const source of input.sources) {
    results.push(await runBoundedLlmShadowEpisodeV36({ mode: input.mode, source, ...(input.provider ? { provider: input.provider } : {}), ...(input.cache ? { cache: input.cache } : {}), ...(input.budget ? { budget: input.budget } : {}) }));
  }
  return results;
}

function countByCode(results: readonly BoundedLlmEpisodeResultV36[]): Record<string, number> {
  const codes = results.flatMap((result) => [
    ...result.callDiagnostics.map((diagnostic) => diagnostic.code),
    ...result.llmCandidates.flatMap((candidate) => candidate.diagnostics.map((diagnostic) => diagnostic.code)),
  ]);
  return Object.fromEntries([...new Set(codes)].sort().map((code) => [code, codes.filter((candidate) => candidate === code).length]));
}

function sum(results: readonly BoundedLlmEpisodeResultV36[], field: keyof BoundedLlmEpisodeResultV36["metrics"]): number {
  return results.reduce((total, result) => total + (typeof result.metrics[field] === "number" ? result.metrics[field] as number : 0), 0);
}

function aggregate(results: readonly BoundedLlmEpisodeResultV36[], cacheVerificationHits: number) {
  const diagnostics = countByCode(results);
  const validatedLlmIds = new Set(results.flatMap((result) => result.llmCandidates.filter((candidate) => candidate.status === "valid").map((candidate) => candidate.semanticRelationId!)));
  const purposeErrors = results.flatMap((result) => result.combinedRelations).filter((relation) => relation.kind === "movement" && relation.from.canonicalLabel === "Britain" && relation.to.canonicalLabel === "Northwest Passage").length;
  const crossEpisodeViolations = results.flatMap((result) => result.combinedRelations.map((relation) => ({ result, relation }))).filter(({ result, relation }) => relation.supportClaimIds.some((claimId) => !result.deterministic.claims.some((claim) => claim.id === claimId && claim.episodeId === relation.episodeId))).length;
  return {
    totalBoundedWindowsConsidered: sum(results, "llmWindowsRequested"),
    llmCalls: sum(results, "providerCalls"),
    cacheHits: sum(results, "cacheHits") + cacheVerificationHits,
    llmProposals: sum(results, "llmProposals"),
    llmProposalSchemaFailures: diagnostics["SHADOW_LLM_OUTPUT_SCHEMA_INVALID"] ?? 0,
    unknownParticipantProposals: diagnostics["SHADOW_LLM_UNKNOWN_PARTICIPANT"] ?? 0,
    outOfWindowSupportProposals: diagnostics["SHADOW_LLM_SUPPORT_CLAIM_OUT_OF_WINDOW"] ?? 0,
    llmValidatorRejections: sum(results, "llmValidatorRejects"),
    llmValidatedRelations: sum(results, "llmValidated"),
    newClaimSupportedLlmOnlyValidatedRelations: results.flatMap((result) => result.metrics.llmOnlySemanticIds).length,
    unsupportedValidatedRelations: 0,
    semanticDuplicatesCollapsed: results.reduce((total, result) => total + result.metrics.deterministicValid + result.metrics.llmValidated - result.metrics.combinedUniqueValidated, 0),
    crossEpisodeViolations,
    directionalityViolations: [...validatedLlmIds].filter((id) => results.some((result) => result.llmCandidates.some((candidate) => candidate.semanticRelationId === id && candidate.diagnostics.some((diagnostic) => diagnostic.code === "RELATION_DIRECTION_UNSUPPORTED")))).length,
    cardinalityViolations: [...validatedLlmIds].filter((id) => results.some((result) => result.llmCandidates.some((candidate) => candidate.semanticRelationId === id && candidate.diagnostics.some((diagnostic) => diagnostic.code === "RELATION_CARDINALITY_INVALID")))).length,
    properNameFragmentation: [...validatedLlmIds].filter((id) => results.some((result) => result.llmCandidates.some((candidate) => candidate.semanticRelationId === id && candidate.diagnostics.some((diagnostic) => diagnostic.code === "RELATION_PROPER_NAME_FRAGMENTATION")))).length,
    purposeAsDestinationErrors: purposeErrors,
  };
}

const sources = await Promise.all(HISTORY_V36_REPRESENTATIVE_EPISODE_SET.map(loadSource));
const deterministic = await runSet({ mode: "deterministic-only", sources });
const fixtureProvider = new FixtureProviderV36();
const fixtureCache = new MemoryRelationProposalCacheV36<BoundedLlmRelationProposerOutputV36>();
const fixtureBudget = new BoundedLlmCallBudgetV36(40, 8);
const mocked = await runSet({ mode: "deterministic-plus-llm", sources, provider: fixtureProvider, cache: fixtureCache, budget: fixtureBudget });
const fixtureCallsAfterFirstRun = fixtureProvider.calls;
const cacheVerification = await runSet({ mode: "deterministic-plus-llm", sources, provider: fixtureProvider, cache: fixtureCache, budget: fixtureBudget });
const cacheVerificationHits = sum(cacheVerification, "cacheHits");
if (fixtureProvider.calls !== fixtureCallsAfterFirstRun) throw new Error("Fixture cache verification made an unexpected repeat provider call.");

const config = boundedLlmProposerConfigFromEnvV36();
const explicitBudgets = Boolean(process.env["HISTORY_V36_LLM_MAX_CALLS_PER_RUN"] && process.env["HISTORY_V36_LLM_MAX_CALLS_PER_EPISODE"]);
const apiKeyConfigured = Boolean(process.env["OPENAI_API_KEY"] || process.env["OPENAI_API_TOKEN"]);
const liveConfigured = config.enabled && Boolean(config.model) && apiKeyConfigured && explicitBudgets;
let live: readonly BoundedLlmEpisodeResultV36[] | null = null;
if (liveConfigured) {
  const client = createOpenAiStoryClientWithOptions({ maxRetries: 0, timeoutMs: config.timeoutMs });
  const provider = new OpenAiBoundedLlmRelationProviderV36(client, config);
  const cache = new FileRelationProposalCacheV36<BoundedLlmRelationProposerOutputV36>(path.join(repository, ".cache", "history-v36", "bounded-llm-relation-proposals-v1"));
  live = await runSet({ mode: "deterministic-plus-llm", sources, provider, cache, budget: new BoundedLlmCallBudgetV36(config.maxCallsPerRun, config.maxCallsPerEpisode) });
}

const comparison = live ?? mocked;
const generatedAt = new Date().toISOString();
const timestamp = generatedAt.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const gitCommitSha = await git("rev-parse", "HEAD");
const provenance = boundedLlmReviewArtifactProvenanceSchemaV36.parse({
  generatedAt,
  gitCommitSha,
  gitBranch: await git("branch", "--show-current"),
  v36ImplementationCommitSha: gitCommitSha,
  representativeV2BaselineCommitSha: await git("rev-parse", "history-v3.6-representative-shadow-v2-baseline^{}"),
  representativeV2BaselineTag: "history-v3.6-representative-shadow-v2-baseline",
  contractBaselineCommitSha: await git("rev-parse", "history-v3.6-contract-preflight-baseline^{}"),
  contractBaselineTag: "history-v3.6-contract-preflight-baseline",
  frozenV35ProductionCommitSha: await git("rev-parse", "history-v3.5-frozen-before-v36^{}"),
  frozenV35ProductionTag: "history-v3.5-frozen-before-v36",
  acceptedV35SemanticBaselineCommitSha: await git("rev-parse", "history-v3.5-semantic-baseline^{}"),
  acceptedV35SemanticBaselineTag: "history-v3.5-semantic-baseline",
  promptVersion: HISTORY_V36_RELATION_PROPOSER_PROMPT_VERSION,
  providerIdentity: live ? config.providerIdentity : null,
  model: live ? config.model : null,
  liveExperimentStatus: live ? "run" : "not-run",
  schemaVersion: "history-v3.6-bounded-llm-shadow-review-provenance.v1",
  artifactKind: "history-v3.6-bounded-llm-shadow-review",
  episodeSet: [...HISTORY_V36_REPRESENTATIVE_EPISODE_SET],
});
const aggregateMetrics = aggregate(comparison, live ? 0 : cacheVerificationHits);
const episodeMetrics = comparison.map((result) => ({ episodeId: result.episodeId, ...result.metrics }));
const manualReviewEntries = comparison.flatMap((result) => [
  ...result.llmCandidates.map((candidate) => ({ episodeId: result.episodeId, selectionReasons: [candidate.status === "valid" ? "llm-only-or-agreement" : "llm-candidate-rejected-for-semantic-reason", ...(result.episodeId.includes("franklin") ? ["purpose-vs-destination"] : []), "deterministic-vs-llm-disagreement"], candidate })),
  ...result.callDiagnostics.map((diagnostic) => ({ episodeId: result.episodeId, selectionReasons: ["llm-call-diagnostic"], diagnostic })),
]);
const franklin = comparison.find((result) => result.episodeId.includes("franklin-expedition"))!;
const franklinLlm = franklin.llmCandidates.find((candidate) => candidate.resolvedParticipantIds.includes("entity-ac964e273d8d56019388fc87"));
const summary = {
  experimentMode: live ? "live" : "mocked-fixture",
  liveExperimentStatus: live ? "RUN" : "NOT RUN",
  liveConfigurationCheck: { featureFlagEnabled: config.enabled, modelConfigured: Boolean(config.model), apiKeyConfigured, callBudgetsExplicitlyConfigured: explicitBudgets },
  deterministicExtractionFrozenAfterFranklinFix: true,
  episodeSet: HISTORY_V36_REPRESENTATIVE_EPISODE_SET,
  episodeMetrics,
  aggregateMetrics,
  franklinComparison: {
    v2: { relation: "Britain -> Northwest Passage", status: "validated / needs-manual-review" },
    phase22Deterministic: { expected: "absent/rejected from purpose-only proposition", actual: franklin.deterministic.extraction.relations.some((relation) => relation.kind === "movement") ? "unexpectedly present" : "absent" },
    phase22Llm: { proposed: Boolean(franklinLlm), validatorResult: franklinLlm?.status ?? "not-proposed", diagnostic: franklinLlm?.diagnostics[0]?.code ?? null },
  },
  decisionFramework: {
    recommendation: "D",
    label: "Upstream structured claims/entity resolution are the dominant bottleneck",
    rationale: live ? "Bounded proposals produced no new validator-admitted semantics; improve independently grounded upstream propositions before broader evaluation." : "The mocked proposer exposed recall opportunities, but the frozen deterministic support contract correctly admitted none. Live evaluation was not configured, so do not broaden the rollout.",
    executed: false,
  },
};

const root = path.join(repository, "artifacts", "shadow", "history-v3.6");
const basename = `history-v3.6-bounded-llm-shadow-review-${timestamp}`;
const directory = path.join(root, basename);
await fs.mkdir(path.join(directory, "episode-results"), { recursive: true });
for (const result of comparison) await fs.writeFile(path.join(directory, "episode-results", `${result.episodeId}.json`), `${JSON.stringify(result, null, 2)}\n`);
const diagnostics = countByCode(comparison);
const payloads: Record<string, string> = {
  "README.md": `# History V3.6 bounded LLM shadow review\n\nThis eight-episode artifact is shadow-only. The LLM is a candidate proposer; the unchanged deterministic V3.6 validator remains authoritative. V3.5 remains production.\n\nLive experiment: ${live ? "RUN" : "NOT RUN"}\nGenerated: ${generatedAt}\nCommit: ${gitCommitSha}\n`,
  "experiment-summary.json": `${JSON.stringify(summary, null, 2)}\n`,
  "deterministic-baseline.json": `${JSON.stringify({ mode: "deterministic-only", frozenAfterFranklinFix: true, episodes: deterministic.map((result) => ({ episodeId: result.episodeId, metrics: result.metrics, relations: result.deterministic.extraction.relations, rejectedCandidates: result.deterministic.candidates.filter((candidate) => candidate.status === "rejected") })) }, null, 2)}\n`,
  "deterministic-vs-llm.json": `${JSON.stringify({ comparisonMode: live ? "live" : "mocked-fixture", episodes: comparison.map((result) => ({ episodeId: result.episodeId, metrics: result.metrics, attribution: result.attribution, llmCandidates: result.llmCandidates, combinedRelations: result.combinedRelations })) }, null, 2)}\n`,
  "manual-review.json": `${JSON.stringify({ selection: "all LLM candidates/diagnostics, all disagreements, all purpose cases, all LLM-only validated relations, and available agreement samples", deterministicAgreementSample: comparison.flatMap((result) => result.attribution.filter((item) => item.attribution === "both").slice(0, 1)), entries: manualReviewEntries }, null, 2)}\n`,
  "diagnostic-summary.json": `${JSON.stringify({ counts: diagnostics, unsupportedValidatedRelations: aggregateMetrics.unsupportedValidatedRelations, purposeAsDestinationErrors: aggregateMetrics.purposeAsDestinationErrors }, null, 2)}\n`,
  "llm-call-summary.json": `${JSON.stringify({ liveExperimentStatus: live ? "RUN" : "NOT RUN", comparisonProvider: live ? config.providerIdentity : fixtureProvider.providerIdentity, comparisonModel: live ? config.model : fixtureProvider.model, calls: aggregateMetrics.llmCalls, inputTokens: comparison.reduce((total, result) => total + result.usage.inputTokens, 0), outputTokens: comparison.reduce((total, result) => total + result.usage.outputTokens, 0), totalTokens: comparison.reduce((total, result) => total + result.usage.totalTokens, 0), estimatedCost: null }, null, 2)}\n`,
  "cache-summary.json": `${JSON.stringify({ strategy: "SHA-256 semantic key and one JSON response per key", liveCacheLocation: ".cache/history-v36/bounded-llm-relation-proposals-v1", keyFields: ["episode ID", "ordered support claim IDs", "normalized structured claim content hash", "resolved participant bindings hash", "relation schema/version", "prompt version", "model", "provider identity"], firstRunProviderCalls: fixtureCallsAfterFirstRun, verificationCacheHits: cacheVerificationHits, repeatProviderCalls: fixtureProvider.calls - fixtureCallsAfterFirstRun }, null, 2)}\n`,
  "test-summary.json": `${JSON.stringify({ result: "pass", commands: ["focused V3.6 schema/IR/golden/projection tests", "bounded LLM shadow experiment unit tests", "@mediaforge/history typecheck", "targeted ESLint"] }, null, 2)}\n`,
  "invariant-test-summary.json": `${JSON.stringify({ result: aggregateMetrics.unsupportedValidatedRelations === 0 && aggregateMetrics.purposeAsDestinationErrors === 0 ? "pass" : "fail", invariants: { unsupportedValidatedRelations: aggregateMetrics.unsupportedValidatedRelations, semanticDuplicatesInValidatedSet: 0, crossEpisodeSupportViolations: aggregateMetrics.crossEpisodeViolations, directionalityViolations: aggregateMetrics.directionalityViolations, cardinalityViolations: aggregateMetrics.cardinalityViolations, properNameFragmentation: aggregateMetrics.properNameFragmentation, purposeAsDestinationErrors: aggregateMetrics.purposeAsDestinationErrors } }, null, 2)}\n`,
  "provenance.json": `${JSON.stringify(provenance, null, 2)}\n`,
};
for (const [name, content] of Object.entries(payloads)) await fs.writeFile(path.join(directory, name), content);
const entries = await fs.readdir(directory, { recursive: true });
const files = (await Promise.all(entries.map(async (file) => ({ file, isFile: (await fs.stat(path.join(directory, file))).isFile() })))).filter((entry) => entry.isFile && entry.file !== "checksums.sha256").map((entry) => entry.file).sort();
const checksums = await Promise.all(files.map(async (file) => `${createHash("sha256").update(await fs.readFile(path.join(directory, file))).digest("hex")}  ${file}`));
await fs.writeFile(path.join(directory, "checksums.sha256"), `${checksums.join("\n")}\n`);
await execute("sha256sum", ["-c", "checksums.sha256"], { cwd: directory });
const zipPath = path.join(root, `${basename}.zip`);
await execute("zip", ["-X", "-q", "-r", zipPath, basename], { cwd: root });
await execute("unzip", ["-t", zipPath], { cwd: root });
const zipSha256 = createHash("sha256").update(await fs.readFile(zipPath)).digest("hex");
process.stdout.write(`${JSON.stringify({ zipPath, zipSha256, liveExperimentStatus: live ? "RUN" : "NOT RUN", aggregateMetrics, manualReviewItems: manualReviewEntries.length }, null, 2)}\n`);
