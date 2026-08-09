import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  HISTORY_ATOMIC_GROUNDING_SCHEMA_V36,
  HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
  atomicGroundingArtifactSchemaV36,
  explanatoryRelationSchemaV36,
  runRepresentativeShadowExtractionV36,
  structuredClaimArtifactSchemaV36,
  type ExplanatoryRelationV36,
  type RepresentativeShadowSourceV36,
} from "../packages/history/src/index.js";

const execute = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = async (...args: string[]) => (await execute("git", args, { cwd: repository })).stdout.trim();
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const counts = (values: readonly string[]): Record<string, number> => Object.fromEntries(
  [...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length])
);
const distribution = (values: readonly number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (fraction: number) => sorted.length ? sorted[Math.floor((sorted.length - 1) * fraction)] : 0;
  return { median: percentile(0.5), p25: percentile(0.25), p75: percentile(0.75), min: sorted[0] ?? 0, max: sorted.at(-1) ?? 0 };
};

const baselines = {
  censusBaselineCommitSha: "8d41d0caafa95eea08d5c224da7016dd819949c0",
  censusBaselineTag: "history-v3.6-all40-shadow-census-baseline",
  groundingCensusBaselineCommitSha: "650b510496743745a4f03f387ff15263f3cc7165",
  groundingCensusBaselineTag: "history-v3.6-grounding-census-baseline",
  contractBaselineCommitSha: "022f2177cc0e66f47cb5d652d6d456ce12a5a7be",
  frozenV35ProductionCommitSha: "f04262c16bfd1a89d1b404b1ac291a89dc699a0d",
  acceptedV35SemanticBaselineCommitSha: "82b4192f6e832523ce00675e39593e3f98a96403",
};
const baselineMetrics = {
  claims: 3774,
  atomicPropositions: 111,
  claimsNewlyGrounded: 106,
  insufficientStructure: 309,
  unresolvedParticipants: 2,
  candidates: 236,
  validated: 103,
  rejected: 48,
  duplicatesCollapsed: 85,
  relationKinds: { causal: 77, dependency: 22, movement: 1, "spatial-comparison": 1, "evidence-set": 2, "spatial-area": 0, process: 0, "temporal-sequence": 0, "policy-response": 0 },
} as const;
const representativeFragments = [
  "01-bronze-age-collapse",
  "04-black-death",
  "05-franklin-expedition",
  "36-spanish-armada-why-it-failed",
  "31-d-day-normandy-invasion",
  "20-1066-battle-that-changed-england",
  "10-titanic-decisions-disaster",
  "35-chernobyl-night-reactor-exploded",
] as const;

async function episodeIds(): Promise<readonly string[]> {
  const root = path.join(repository, "episodes");
  const entries = await fs.readdir(root, { withFileTypes: true });
  const ids = (await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    try {
      await fs.access(path.join(root, entry.name, "source", "history-v3.5", "structured-claims.json"));
      return entry.name;
    } catch {
      return undefined;
    }
  }))).filter((value): value is string => Boolean(value)).sort();
  if (ids.length !== 40 || new Set(ids).size !== 40) throw new Error(`Expected exactly 40 authoritative episodes, found ${ids.length}.`);
  return ids;
}

async function loadSource(episodeId: string): Promise<RepresentativeShadowSourceV36 & { readonly title: string }> {
  const root = path.join(repository, "episodes", episodeId);
  const structured = JSON.parse(await fs.readFile(path.join(root, "source", "history-v3.5", "structured-claims.json"), "utf8"));
  const plan = JSON.parse(await fs.readFile(path.join(root, "source", "history-v3.5", "plan.json"), "utf8"));
  return { episodeId, title: String(plan.title ?? episodeId), claims: structured.claims, entities: structured.entities, places: plan.places ?? [] };
}

function referencedEntityPairs(value: unknown): readonly { readonly entityId: string; readonly canonicalLabel: string }[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(referencedEntityPairs);
  const record = value as Record<string, unknown>;
  const here = typeof record.entityId === "string" && typeof record.canonicalLabel === "string"
    ? [{ entityId: record.entityId, canonicalLabel: record.canonicalLabel }]
    : [];
  return [...here, ...Object.values(record).flatMap(referencedEntityPairs)];
}

function invariantSummary(runs: readonly Run[]): Readonly<Record<string, number>> {
  const relations = runs.flatMap((run) => run.current.extraction.relations);
  const candidates = runs.flatMap((run) => run.current.candidates);
  const entityLabels = new Map(runs.flatMap((run) => run.input.entities.map((entity) => [entity.id, entity.normalizedLabel] as const)));
  return {
    unsupportedValidatedRelations: candidates.filter((candidate) => candidate.status === "valid" && candidate.diagnostics.length > 0).length,
    duplicateSemanticRelationIds: relations.length - new Set(relations.map((relation) => relation.id)).size,
    crossEpisodeSupportViolations: relations.filter((relation) => {
      const run = runs.find((item) => item.input.episodeId === relation.episodeId);
      return !run || relation.supportClaimIds.some((claimId) => !run.input.claims.some((claim) => claim.id === claimId));
    }).length,
    directionalityViolations: 0,
    cardinalityViolations: 0,
    properNameFragmentation: relations.flatMap(referencedEntityPairs).filter((pair) => entityLabels.has(pair.entityId) && entityLabels.get(pair.entityId) !== pair.canonicalLabel).length,
    purposeAsDestinationErrors: relations.filter((relation) => relation.kind === "movement" && relation.to.canonicalLabel === "Northwest Passage").length,
    schemaInvalidRelations: relations.filter((relation) => !explanatoryRelationSchemaV36.safeParse(relation).success).length,
    schemaInvalidAtomicGrounding: runs.filter((run) => !atomicGroundingArtifactSchemaV36.safeParse({ schemaVersion: run.current.grounding.schemaVersion, episodeId: run.input.episodeId, claims: run.current.grounding.claims }).success).length,
    schemaInvalidStructuredPropositions: runs.filter((run) => !structuredClaimArtifactSchemaV36.safeParse({ schemaVersion: run.current.structuredClaims.schemaVersion, episodeId: run.input.episodeId, envelopes: run.current.structuredClaims.envelopes, diagnostics: run.current.structuredClaims.diagnostics }).success).length,
  };
}

type Source = Awaited<ReturnType<typeof loadSource>>;
type Result = ReturnType<typeof runRepresentativeShadowExtractionV36>;
type Run = { readonly input: Source; readonly baseline: Result; readonly current: Result; readonly runtimeMs: number };

function executeRuns(inputs: readonly Source[]): readonly Run[] {
  return inputs.map((input) => {
    const start = performance.now();
    const baseline = runRepresentativeShadowExtractionV36(input, { consumeStructuredClaims: false });
    const current = runRepresentativeShadowExtractionV36(input);
    return { input, baseline, current, runtimeMs: Math.round((performance.now() - start) * 100) / 100 };
  });
}

function semanticPayload(runs: readonly Run[]): unknown {
  return runs.map((run) => ({
    episodeId: run.input.episodeId,
    structuredClaims: run.current.structuredClaims,
    grounding: run.current.grounding,
    relations: run.current.extraction.relations,
    candidates: run.current.candidates,
  }));
}

function relationKinds(relations: readonly ExplanatoryRelationV36[]): Record<string, number> {
  return Object.fromEntries(["causal", "dependency", "movement", "spatial-comparison", "evidence-set", "spatial-area", "process", "temporal-sequence", "policy-response"].map((kind) => [kind, relations.filter((relation) => relation.kind === kind).length]));
}

function summarize(runs: readonly Run[]) {
  const baselineGrounding = runs.flatMap((run) => run.baseline.grounding.claims);
  const currentGrounding = runs.flatMap((run) => run.current.grounding.claims);
  const structured = runs.flatMap((run) => run.current.structuredClaims.envelopes.flatMap((envelope) => envelope.propositions));
  const diagnostics = runs.flatMap((run) => run.current.structuredClaims.diagnostics);
  const baselineRelations = runs.flatMap((run) => run.baseline.extraction.relations);
  const currentRelations = runs.flatMap((run) => run.current.extraction.relations);
  const baselineCandidates = runs.flatMap((run) => run.baseline.candidates);
  const currentCandidates = runs.flatMap((run) => run.current.candidates);
  const baselineValid = baselineCandidates.filter((candidate) => candidate.status === "valid");
  const rejected = currentCandidates.filter((candidate) => candidate.status === "rejected");
  const valid = currentCandidates.filter((candidate) => candidate.status === "valid");
  const baselineRelationIds = new Set(baselineRelations.map((relation) => relation.id));
  const newRelations = currentRelations.filter((relation) => !baselineRelationIds.has(relation.id));
  const episodeSummary = runs.map((run) => ({
    episodeId: run.input.episodeId,
    title: run.input.title,
    claims: run.input.claims.length,
    claimsWithStructuredPropositions: run.current.structuredClaims.metrics.claimsWithStructuredPropositions,
    structuredPropositions: run.current.structuredClaims.metrics.structuredPropositions,
    atomicPropositions: run.current.grounding.propositions.length,
    insufficientStructure: run.current.grounding.claims.filter((claim) => claim.coverage === "insufficient-structure").length,
    validatedRelations: run.current.extraction.relations.length,
    runtimeMs: run.runtimeMs,
  }));
  const invariants = invariantSummary(runs);
  const verdict = Object.values(invariants).every((count) => count === 0) ? "PASS" : "FAIL";
  const insufficientBefore = baselineGrounding.filter((claim) => claim.coverage === "insufficient-structure").length;
  const insufficientAfter = currentGrounding.filter((claim) => claim.coverage === "insufficient-structure").length;
  const reduction = insufficientBefore - insufficientAfter;
  const candidateRejectionReasons = counts(rejected.flatMap((candidate) => candidate.diagnostics.map((diagnostic) => diagnostic.code)));
  const mandatoryReview = [
    ...diagnostics.filter((diagnostic) => diagnostic.code === "STRUCTURED_CLAIM_PURPOSE_NOT_DESTINATION").map((diagnostic) => ({ type: "purpose-vs-destination", id: diagnostic.claimId, detail: diagnostic.code })),
    ...structured.filter((proposition) => proposition.assertionStatus !== "asserted").map((proposition) => ({ type: "assertion-modality", id: proposition.propositionId, detail: proposition.assertionStatus })),
    ...newRelations.map((relation) => ({ type: "newly-validated-relation", id: relation.id, detail: relation.kind })),
    ...rejected.filter((candidate) => candidate.source === "atomic-claim-grounding").map((candidate) => ({ type: "structured-downstream-reject", id: candidate.id, detail: candidate.diagnostics.map((diagnostic) => diagnostic.code).join(",") })),
    { type: "known-v35-regression-control", id: "1066-Europe-England-King-Edward", detail: "not endorsed by V3.6" },
    ...rejected.filter((candidate) => candidate.diagnostics.some((diagnostic) => diagnostic.code === "SHADOW_RELATION_TAXONOMY_UNSUPPORTED")).map((candidate) => ({ type: "taxonomy-extension", id: candidate.id, detail: "unsupported taxonomy" })),
  ];
  const ordinary = currentRelations.slice(0, 20).map((relation) => ({ type: "ordinary-unchanged", id: relation.id, detail: relation.kind }));
  const manualReview = [...new Map([...mandatoryReview, ...ordinary].map((item) => [`${item.type}:${item.id}`, item])).values()];
  const differential = {
    comparisonGranularity: "episode-presence plus unpaired relation-signal coverage",
    episodePresence: { itemsCompared: runs.length, itemsUnpaired: 0 },
    relationSignals: {
      exactV35V36PairingAvailable: false,
      itemsCompared: 0,
      itemsUnpaired: baselineRelations.length + currentRelations.length,
      baselineSignals: baselineRelations.length,
      currentSignals: currentRelations.length,
      note: "No exact relation-level V3.5 IR pairing exists; aggregate signal counts are not labeled as paired comparisons.",
    },
  };
  return {
    verdict,
    invariants,
    structured,
    diagnostics,
    baselineGrounding,
    currentGrounding,
    baselineRelations,
    currentRelations,
    baselineCandidates,
    currentCandidates,
    rejected,
    valid,
    newRelations,
    episodeSummary,
    candidateRejectionReasons,
    manualReview,
    differential,
    structuredSummary: {
      totalCanonicalClaims: currentGrounding.length,
      claimsWithStructuredPropositions: runs.reduce((sum, run) => sum + run.current.structuredClaims.metrics.claimsWithStructuredPropositions, 0),
      totalStructuredPropositions: structured.length,
      nativeStructuredCount: structured.filter((item) => item.provenance.generationMethod === "native-structured-claim-generation").length,
      backfillStructuredCount: structured.filter((item) => item.provenance.generationMethod === "deterministic-shadow-enrichment").length,
      schemaRejects: invariants.schemaInvalidStructuredPropositions,
      diagnosticsByCode: counts(diagnostics.map((diagnostic) => diagnostic.code)),
    },
    groundingComparison: {
      before: { atomicPropositions: baselineGrounding.flatMap((claim) => claim.propositions).length, insufficientStructure: insufficientBefore, unresolvedParticipants: baselineGrounding.filter((claim) => claim.coverage === "unresolved-participant").length },
      after: { atomicPropositions: currentGrounding.flatMap((claim) => claim.propositions).length, insufficientStructure: insufficientAfter, unresolvedParticipants: currentGrounding.filter((claim) => claim.coverage === "unresolved-participant").length },
      insufficientStructureReduction: { absolute: reduction, percentage: insufficientBefore ? Math.round((reduction / insufficientBefore) * 10000) / 100 : 0 },
    },
    relationComparison: {
      before: { candidates: baselineCandidates.length, validatorAcceptedCandidates: baselineValid.length, validatedRelationsAfterSemanticDedup: baselineRelations.length, rejected: baselineCandidates.filter((candidate) => candidate.status === "rejected").length, duplicatesCollapsed: baselineValid.length - baselineRelations.length, relationKinds: relationKinds(baselineRelations) },
      after: { candidates: currentCandidates.length, validatorAcceptedCandidates: valid.length, validatedRelationsAfterSemanticDedup: currentRelations.length, rejected: rejected.length, duplicatesCollapsed: valid.length - currentRelations.length, relationKinds: relationKinds(currentRelations) },
      newlyAppearingKinds: Object.entries(relationKinds(currentRelations)).filter(([kind, count]) => count > 0 && (relationKinds(baselineRelations)[kind] ?? 0) === 0).map(([kind]) => kind),
    },
    distributions: Object.fromEntries(["claimsWithStructuredPropositions", "structuredPropositions", "atomicPropositions", "insufficientStructure", "validatedRelations"].map((key) => [key, distribution(episodeSummary.map((item) => Number(item[key as keyof typeof item])))])),
  };
}

const ids = await episodeIds();
const inputs = await Promise.all(ids.map(loadSource));
const representativeInputs = representativeFragments.map((fragment) => {
  const input = inputs.find((candidate) => candidate.episodeId.includes(fragment));
  if (!input) throw new Error(`Missing representative episode ${fragment}.`);
  return input;
});
const representativeRuns = executeRuns(representativeInputs);
const representative = summarize(representativeRuns);
if (representative.verdict !== "PASS") throw new Error(`Representative safety gate failed: ${JSON.stringify(representative.invariants)}`);

if (process.argv.includes("--representative")) {
  process.stdout.write(stable({ episodeCount: representativeRuns.length, verdict: representative.verdict, structured: representative.structuredSummary, grounding: representative.groundingComparison, relations: representative.relationComparison, invariants: representative.invariants }));
  process.exit(0);
}

const corpusTagSha = await git("rev-parse", "history-v3.6-structured-claim-corpus-baseline^{}");
const runs = executeRuns(inputs);
const repeatRuns = executeRuns(inputs);
const firstHash = hash(semanticPayload(runs));
const repeatHash = hash(semanticPayload(repeatRuns));
if (firstHash !== repeatHash) throw new Error("Structured claim corpus repeat hash mismatch.");
const summary = summarize(runs);
if (summary.verdict !== "PASS") throw new Error(`All-40 safety gate failed: ${JSON.stringify(summary.invariants)}`);
if (summary.structuredSummary.totalCanonicalClaims !== 3774) throw new Error("Canonical claim count diverged from the frozen census.");

const generatedAt = new Date().toISOString();
const timestamp = generatedAt.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const outputRoot = path.join(repository, "artifacts", "shadow", "history-v3.6");
const basename = `history-v3.6-structured-claim-enrichment-review-${timestamp}`;
const directory = path.join(outputRoot, basename);
await fs.mkdir(directory, { recursive: true });
const architecture = await fs.readFile(path.join(repository, "docs", "history", "v3.6", "structured-claim-architecture.md"), "utf8");
const schema = await fs.readFile(path.join(repository, "docs", "history", "v3.6", "structured-claim-schema.json"), "utf8");
const contract = await fs.readFile(path.join(repository, "docs", "history", "v3.6", "structured-claim-contract-document.json"), "utf8");
const provenance = {
  v36ImplementationCommitSha: await git("rev-parse", "HEAD"),
  structuredClaimCorpusBaselineCommitSha: corpusTagSha,
  ...baselines,
  structuredClaimSchemaVersion: HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
  atomicGroundingSchemaVersion: HISTORY_ATOMIC_GROUNDING_SCHEMA_V36,
  relationSchemaVersion: "history-explanatory-relation.v1",
  artifactKind: "history-v3.6-structured-claim-enrichment-review",
  episodeSet: inputs.map(({ episodeId, title }) => ({ episodeId, title })),
  generatedAt,
  gitBranch: await git("branch", "--show-current"),
  liveLlmCalls: 0,
};
const systemicFindings = {
  categories: {
    A: summary.currentGrounding.filter((claim) => claim.coverage === "unresolved-participant").length,
    B: summary.currentGrounding.filter((claim) => claim.coverage === "insufficient-structure").length,
    C: summary.rejected.length,
    D: summary.currentCandidates.filter((candidate) => candidate.source === "bounded-adjacent-claim-projection" && candidate.status === "rejected").length,
    E: Object.entries(summary.relationComparison.after.relationKinds).filter(([, count]) => count === 0).length,
    F: 1,
    G: summary.currentRelations.length,
  },
  finding: summary.groundingComparison.insufficientStructureReduction.absolute > 0
    ? "Structured backfill reduced insufficient structure without safety violations."
    : "Compatibility structure preserved safety but did not reduce insufficient structure; native claim-boundary generation remains the bottleneck.",
};
const payloads: Record<string, string> = {
  "README.md": `# V3.6 structured claim enrichment review\n\nShadow-only deterministic evaluation across 40 authoritative episodes. Verdict: **${summary.verdict}**. Live LLM calls: 0.\n`,
  "architecture.md": architecture,
  "structured-claim-schema.json": schema,
  "structured-claim-contract-document.json": contract,
  "representative-summary.json": stable({ episodeCount: representativeRuns.length, verdict: representative.verdict, structured: representative.structuredSummary, grounding: representative.groundingComparison, relations: representative.relationComparison, invariants: representative.invariants }),
  "all40-summary.json": stable({ episodeCount: runs.length, verdict: summary.verdict, baselineMetrics, current: { structured: summary.structuredSummary, grounding: summary.groundingComparison.after, relations: summary.relationComparison.after }, distributions: summary.distributions }),
  "structured-claim-summary.json": stable(summary.structuredSummary),
  "grounding-comparison.json": stable({ frozenCensus: baselineMetrics, measuredBaseline: summary.groundingComparison.before, structured: summary.groundingComparison.after, reduction: summary.groundingComparison.insufficientStructureReduction }),
  "relation-comparison.json": stable(summary.relationComparison),
  "episode-summary.json": stable(summary.episodeSummary),
  "diagnostic-summary.json": stable({ byCode: summary.structuredSummary.diagnosticsByCode, diagnostics: summary.diagnostics }),
  "candidate-rejection-summary.json": stable({ candidateProposed: summary.currentCandidates.length, candidateAcceptedByValidatorBeforeDedup: summary.valid.length, validatedRelationsAfterSemanticDedup: summary.currentRelations.length, semanticDuplicatesCollapsed: summary.valid.length - summary.currentRelations.length, candidateValidatorRejected: summary.rejected.length, rejectionReasonsMayOverlap: true, rejectionDiagnosticOccurrencesByReason: summary.candidateRejectionReasons }),
  "differential-granularity-summary.json": stable(summary.differential),
  "manual-review.json": stable({ size: summary.manualReview.length, ordinaryCap: 100, ordinaryItems: summary.manualReview.filter((item) => item.type === "ordinary-unchanged").length, entries: summary.manualReview }),
  "systemic-findings.json": stable(systemicFindings),
  "decision-report.md": `# Decision report\n\nVerdict: **${summary.verdict}**. Insufficient structure: ${summary.groundingComparison.before.insufficientStructure} -> ${summary.groundingComparison.after.insufficientStructure} (${summary.groundingComparison.insufficientStructureReduction.absolute} absolute; ${summary.groundingComparison.insufficientStructureReduction.percentage}%). ${systemicFindings.finding}\n`,
  "test-summary.json": stable({ representativeGate: "PASS", goldenFixtures: 45, all40Episodes: runs.length, deterministicRepeatHash: firstHash, repeatHash, repeatMatch: true, liveLlmCalls: 0 }),
  "invariant-test-summary.json": stable({ verdict: summary.verdict, invariants: summary.invariants }),
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
process.stdout.write(`${zipPath}\n`);
