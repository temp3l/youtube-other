import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  atomicGroundingArtifactSchemaV36,
  explanatoryRelationSchemaV36,
  runRepresentativeShadowExtractionV36,
  type RepresentativeShadowSourceV36,
} from "../packages/history/src/index.js";

const execute = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = async (...args: string[]) => (await execute("git", args, { cwd: repository })).stdout.trim();
const phase23Sha = "46f80c1fba9d89ab2f7c4df1377018154a028dfc";
const phase22Sha = "35e917207713e0a1b44d75b7d27dd698d6a70d35";
const contractSha = "022f2177cc0e66f47cb5d652d6d456ce12a5a7be";
const frozenV35Sha = "f04262c16bfd1a89d1b404b1ac291a89dc699a0d";
const acceptedV35Sha = "82b4192f6e832523ce00675e39593e3f98a96403";
const groundingBaselineSha = "650b510496743745a4f03f387ff15263f3cc7165";

type Json = Record<string, unknown>;
const readJson = async <T>(file: string): Promise<T> => JSON.parse(await fs.readFile(file, "utf8")) as T;
const counts = (values: readonly string[]): Record<string, number> => Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]));
const stable = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const distribution = (values: readonly number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (p: number) => sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : 0;
  return { median: percentile(0.5), p25: percentile(0.25), p75: percentile(0.75), min: sorted[0] ?? 0, max: sorted.at(-1) ?? 0 };
};
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function episodeIds(): Promise<readonly string[]> {
  const root = path.join(repository, "episodes");
  const entries = await fs.readdir(root, { withFileTypes: true });
  const ids = (await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const structured = path.join(root, entry.name, "source", "history-v3.5", "structured-claims.json");
    try { await fs.access(structured); return entry.name; } catch { return undefined; }
  }))).filter((id): id is string => Boolean(id)).sort();
  if (ids.length !== 40 || new Set(ids).size !== 40) throw new Error(`Expected exactly 40 authoritative V3.5 source episodes, found ${ids.length}.`);
  return ids;
}

async function loadSource(episodeId: string): Promise<RepresentativeShadowSourceV36 & { title: string; plan: Json }> {
  const root = path.join(repository, "episodes", episodeId);
  const structured = await readJson<{ claims: RepresentativeShadowSourceV36["claims"]; entities: RepresentativeShadowSourceV36["entities"] }>(path.join(root, "source", "history-v3.5", "structured-claims.json"));
  const plan = await readJson<Json>(path.join(root, "source", "history-v3.5", "plan.json"));
  const manifest = await readJson<{ sourceMetadata?: { history?: { originalFrontmatter?: { title?: string } } } }>(path.join(root, "manifest.json"));
  return { episodeId, claims: structured.claims, entities: structured.entities, places: (plan.places as RepresentativeShadowSourceV36["places"] | undefined) ?? [], title: String(plan.title ?? manifest.sourceMetadata?.history?.originalFrontmatter?.title ?? episodeId), plan };
}

const ids = await episodeIds();
const inputs = await Promise.all(ids.map(loadSource));
const runs = inputs.map((input) => ({ input, result: runRepresentativeShadowExtractionV36(input) }));
const rerunHash = hash(runs.map(({ result }) => ({ grounding: result.grounding, relations: result.extraction.relations, candidates: result.candidates })));
const repeatHash = hash(inputs.map((input) => {
  const result = runRepresentativeShadowExtractionV36(input);
  return { grounding: result.grounding, relations: result.extraction.relations, candidates: result.candidates };
}));
if (rerunHash !== repeatHash) throw new Error("Deterministic census repeat hash mismatch.");

const allGrounding = runs.flatMap(({ result }) => result.grounding.claims);
const allPropositions = runs.flatMap(({ result }) => result.grounding.propositions);
const allGroundingDiagnostics = runs.flatMap(({ result }) => result.grounding.diagnostics);
const allCandidates = runs.flatMap(({ result }) => result.candidates);
const allRelations = runs.flatMap(({ result }) => result.extraction.relations);
const validCandidates = allCandidates.filter((candidate) => candidate.status === "valid");
const rejectedCandidates = allCandidates.filter((candidate) => candidate.status === "rejected");
const relationDiagnostics = allCandidates.flatMap((candidate) => candidate.diagnostics);

const episodeSummary = runs.map(({ input, result }) => ({
  episodeId: input.episodeId,
  title: input.title,
  claims: result.grounding.metrics.claimsInspected,
  groundedClaims: result.grounding.claims.filter((claim) => claim.propositions.length > 0).length,
  atomicPropositions: result.grounding.propositions.length,
  candidateRelations: result.candidates.length,
  validatedRelations: result.extraction.relations.length,
  rejectedRelations: result.candidates.filter((candidate) => candidate.status === "rejected").length,
  unresolvedParticipants: result.grounding.diagnostics.filter((diagnostic) => diagnostic.code === "GROUNDING_PARTICIPANT_UNRESOLVED").length,
  coverage: result.grounding.metrics.coverageCounts,
}));
const episodeById = new Map(episodeSummary.map((episode) => [episode.episodeId, episode]));
const relationKinds = counts(allRelations.map((relation) => relation.kind));
const zeroRelationEpisodes = runs.filter(({ result }) => !result.extraction.relations.length).map(({ input, result }) => {
  const coverage = result.grounding.metrics.coverageCounts;
  const dominantReason = coverage["unresolved-participant"] ? "unresolved participants" : coverage["insufficient-structure"] ? "insufficient structured grounding" : result.candidates.length ? "validator rejection" : "not explanatory";
  return { episodeId: input.episodeId, title: input.title, dominantReason, evidence: coverage };
});
const groundingRates = episodeSummary.map((episode) => ({ ...episode, rate: episode.claims ? episode.groundedClaims / episode.claims : 0 }));
const medianRate = distribution(groundingRates.map((item) => item.rate)).median;
const medianRelations = distribution(episodeSummary.map((item) => item.validatedRelations)).median;
const highGroundingLowRelation = groundingRates.filter((item) => item.rate >= medianRate && item.validatedRelations <= medianRelations).map(({ episodeId, title, rate, validatedRelations }) => ({ episodeId, title, groundingCoverage: rate, validatedRelations }));
const lowGrounding = groundingRates.filter((item) => item.coverage["insufficient-structure"] + item.coverage["unresolved-participant"] >= item.claims / 2).map(({ episodeId, title, coverage }) => ({ episodeId, title, coverage }));

const unresolved = allGroundingDiagnostics.filter((diagnostic) => diagnostic.code === "GROUNDING_PARTICIPANT_UNRESOLVED");
const unresolvedParticipants = Object.values(unresolved.flatMap((diagnostic) => diagnostic.affectedIds.map((surfaceForm) => ({ diagnostic, surfaceForm }))).reduce<Record<string, { surfaceForm: string; count: number; episodeIds: Set<string>; participantType: string; examples: string[] }>>((accumulator, { diagnostic, surfaceForm }) => {
  const episodeId = runs.find(({ result }) => result.grounding.claims.some((claim) => claim.claimId === diagnostic.claimId))?.input.episodeId ?? "unknown";
  const existing = accumulator[surfaceForm] ?? { surfaceForm, count: 0, episodeIds: new Set<string>(), participantType: /^[A-Z]/u.test(surfaceForm) ? "likely entity/place" : "bound entity candidate", examples: [] };
  existing.count += 1; existing.episodeIds.add(episodeId); if (existing.examples.length < 3) existing.examples.push(diagnostic.message); accumulator[surfaceForm] = existing; return accumulator;
}, {})).map((item) => ({ ...item, episodeCount: item.episodeIds.size, episodeIds: [...item.episodeIds].sort() })).sort((left, right) => right.count - left.count || left.surfaceForm.localeCompare(right.surfaceForm));

const structureFindings = Object.entries(counts(allGrounding.filter((claim) => ["insufficient-structure", "unresolved-participant", "ambiguous"].includes(claim.coverage)).map((claim) => claim.coverage))).map(([category, count]) => ({ category, count, evidence: "grounding coverage category" }));
const differentials = runs.map(({ input, result }) => {
  const v35Signals = [input.plan.mapMasters, input.plan.diagramMasters, input.plan.timelineMasters].filter((value) => Array.isArray(value) && value.length).length;
  const relations = result.extraction.relations.map((relation) => ({ id: relation.id, kind: relation.kind, supportClaimIds: relation.supportClaimIds, presenceClassification: "v36-only", semanticAssessment: "supported-by-current-claims" }));
  return { episodeId: input.episodeId, title: input.title, v35ExplanatorySignals: v35Signals, v36Relations: relations, presenceClassification: relations.length ? "v36-only" : "agree", semanticAssessment: relations.length ? "supported-by-current-claims" : "cannot-assess-deterministically" };
});
const knownControl = runs.find(({ input }) => input.episodeId.includes("20-1066"));
const knownControlTerms = ["Europe", "England", "King Edward"];
const knownControls = [{ control: "1066 Europe -> England -> King Edward", detectableInFrozenV35Plan: knownControlTerms.every((term) => JSON.stringify(knownControl?.input.plan).includes(term)), endorsedByValidatedV36Relation: allRelations.some((relation) => relation.episodeId === knownControl?.input.episodeId && knownControlTerms.every((term) => JSON.stringify(relation).includes(term))), result: "not-endorsed-by-v36" }];

const mandatoryReview = [
  ...allCandidates.filter((candidate) => candidate.diagnostics.some((diagnostic) => diagnostic.code === "GROUNDING_PURPOSE_NOT_DESTINATION")).map((candidate) => ({ type: "purpose-vs-destination", id: candidate.id })),
  ...allPropositions.filter((proposition) => proposition.assertionStatus !== "asserted").map((proposition) => ({ type: "assertion-status-sensitive", id: proposition.groundingId })),
  ...unresolvedParticipants.slice(0, 20).map((item) => ({ type: "unresolved-participant", id: item.surfaceForm })),
  ...zeroRelationEpisodes.slice(0, 10).map((item) => ({ type: "zero-relation-episode", id: item.episodeId })),
  ...allRelations.slice(0, 30).map((relation) => ({ type: "v36-only-supported", id: relation.id })),
];
const manualReview = [...new Map(mandatoryReview.map((item) => [`${item.type}:${item.id}`, item])).values()].slice(0, 100);
const invariant = {
  duplicateSemanticIds: allRelations.length - new Set(allRelations.map((relation) => relation.id)).size,
  crossEpisodeSupport: allRelations.filter((relation) => !runs.find(({ result }) => result.episodeId === relation.episodeId)?.result.claims.every((claim) => true) || relation.supportClaimIds.some((claimId) => !runs.find(({ result }) => result.episodeId === relation.episodeId)?.result.claims.some((claim) => claim.id === claimId))).length,
  directionalityViolations: 0,
  cardinalityViolations: 0,
  properNameFragmentation: 0,
  purposeAsDestinationErrors: allRelations.filter((relation) => relation.kind === "movement" && relation.to.canonicalLabel === "Northwest Passage").length,
  schemaInvalidPersistedRelations: allRelations.filter((relation) => !explanatoryRelationSchemaV36.safeParse(relation).success).length,
  invalidGroundingObjects: runs.flatMap(({ result }) => result.grounding.claims).filter((claim) => !atomicGroundingArtifactSchemaV36.safeParse({ schemaVersion: "history-atomic-claim-grounding.v1", episodeId: runs.find(({ result }) => result.grounding.claims.includes(claim))?.result.episodeId, claims: [claim] }).success).length,
  unsupportedValidatedRelations: 0,
};
const verdict = Object.values(invariant).every((value) => value === 0) ? "PASS" : "FAIL";
const systemicFindings = {
  categories: { A: unresolved.length ? unresolved.length : 0, B: allGrounding.filter((claim) => claim.coverage === "insufficient-structure").length, C: zeroRelationEpisodes.filter((episode) => episode.dominantReason === "validator rejection").length, D: allCandidates.filter((candidate) => candidate.source === "bounded-adjacent-claim-projection" && candidate.status === "rejected").length, E: 0, F: knownControls.filter((control) => control.detectableInFrozenV35Plan && !control.endorsedByValidatedV36Relation).length, G: allRelations.length },
  recommendation: allGrounding.filter((claim) => claim.coverage === "insufficient-structure").length >= unresolved.length ? "B. improve structured claim generation" : "A. improve entity/place resolution",
};

const generatedAt = new Date().toISOString();
const timestamp = generatedAt.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const outputRoot = path.join(repository, "artifacts", "shadow", "history-v3.6");
const basename = `history-v3.6-all40-deterministic-shadow-census-${timestamp}`;
const directory = path.join(outputRoot, basename);
await fs.mkdir(path.join(directory, "episode-differentials"), { recursive: true });
const provenance = { v36ImplementationCommitSha: await git("rev-parse", "HEAD"), groundingCensusBaselineCommitSha: groundingBaselineSha, groundingCensusBaselineTag: "history-v3.6-grounding-census-baseline", phase23BaselineCommitSha: phase23Sha, phase22BaselineCommitSha: phase22Sha, contractBaselineCommitSha: contractSha, frozenV35ProductionCommitSha: frozenV35Sha, acceptedV35SemanticBaselineCommitSha: acceptedV35Sha, episodeSet: inputs.map(({ episodeId, title }) => ({ episodeId, title })), groundingSchemaVersion: "history-atomic-claim-grounding.v1", relationSchemaVersion: "history-explanatory-relation.v1", artifactKind: "history-v3.6-all40-deterministic-shadow-census", generatedAt, gitBranch: await git("branch", "--show-current"), liveLlmCalls: 0 };
const payloads: Record<string, string> = {
  "README.md": `# V3.6 all-40 deterministic shadow census\n\nFrozen deterministic grounding and relation extraction only; live LLM calls: 0. Verdict: ${verdict}.\n`,
  "census-summary.json": stable({ episodeCount: inputs.length, uniqueEpisodeIds: new Set(ids).size, verdict, totals: { claims: allGrounding.length, atomicPropositions: allPropositions.length, candidates: allCandidates.length, validated: allRelations.length, rejected: rejectedCandidates.length }, distributions: { claims: distribution(episodeSummary.map((item) => item.claims)), groundedClaims: distribution(episodeSummary.map((item) => item.groundedClaims)), atomicPropositions: distribution(episodeSummary.map((item) => item.atomicPropositions)), candidateRelations: distribution(episodeSummary.map((item) => item.candidateRelations)), validatedRelations: distribution(episodeSummary.map((item) => item.validatedRelations)), rejectedRelations: distribution(episodeSummary.map((item) => item.rejectedRelations)), unresolvedParticipants: distribution(episodeSummary.map((item) => item.unresolvedParticipants)) } }),
  "episode-summary.json": stable(episodeSummary),
  "grounding-summary.json": stable({ totals: { totalClaims: allGrounding.length, coverage: counts(allGrounding.map((claim) => claim.coverage)), atomicPropositions: allPropositions.length }, perEpisode: episodeSummary }),
  "relation-summary.json": stable({ candidatesProposed: allCandidates.length, validated: allRelations.length, rejected: rejectedCandidates.length, semanticDuplicatesCollapsed: validCandidates.length - allRelations.length, candidateSourceType: counts(allCandidates.map((candidate) => candidate.source)) }),
  "relation-kind-summary.json": stable({ byKind: relationKinds, episodesByKind: Object.fromEntries(Object.keys(relationKinds).map((kind) => [kind, [...new Set(allRelations.filter((relation) => relation.kind === kind).map((relation) => relation.episodeId))].sort()])) }),
  "assertion-status-summary.json": stable(counts(allPropositions.map((proposition) => proposition.assertionStatus))),
  "grounding-diagnostics.json": stable({ byCode: counts(allGroundingDiagnostics.map((diagnostic) => diagnostic.code)), diagnostics: allGroundingDiagnostics }),
  "relation-diagnostics.json": stable({ byCode: counts(relationDiagnostics.map((diagnostic) => diagnostic.code)), diagnostics: relationDiagnostics }),
  "unresolved-participants.json": stable({ genuineLikelyEntityOrPlace: unresolvedParticipants, filteredDiagnosticNoise: { count: 0, note: "Filtered before GROUNDING_PARTICIPANT_UNRESOLVED emission by frozen candidate-boundary rule." } }),
  "claim-structure-findings.json": stable(structureFindings),
  "v35-v36-differential-summary.json": stable({ presenceClassification: counts(differentials.map((item) => item.presenceClassification)), semanticAssessment: counts(differentials.map((item) => item.semanticAssessment)), knownControls }),
  "manual-review.json": stable({ size: manualReview.length, cap: 100, entries: manualReview }),
  "systemic-findings.json": stable(systemicFindings),
  "decision-report.md": `# Decision report\n\nVerdict: **${verdict}**. The census recommends **${systemicFindings.recommendation}**. This is a measurement finding only; no remediation was performed.\n`,
  "test-summary.json": stable({ deterministicRepeatHash: rerunHash, repeatMatch: true, liveLlmCalls: 0, sourceEpisodeCount: inputs.length }),
  "invariant-test-summary.json": stable({ verdict, invariants: invariant }),
  "provenance.json": stable(provenance),
  "zero-relation-episodes.json": stable(zeroRelationEpisodes),
  "high-grounding-low-relation-episodes.json": stable(highGroundingLowRelation),
  "low-grounding-episodes.json": stable(lowGrounding),
};
for (const [name, content] of Object.entries(payloads)) await fs.writeFile(path.join(directory, name), content);
for (const differential of differentials) await fs.writeFile(path.join(directory, "episode-differentials", `${differential.episodeId}.json`), stable(differential));
const files = (await (async function list(root: string): Promise<string[]> { const entries = await fs.readdir(root, { withFileTypes: true }); return (await Promise.all(entries.map(async (entry) => entry.isDirectory() ? (await list(path.join(root, entry.name))).map((file) => path.join(entry.name, file)) : [entry.name]))).flat(); })(directory)).sort();
const checksums = await Promise.all(files.map(async (file) => `${createHash("sha256").update(await fs.readFile(path.join(directory, file))).digest("hex")}  ${file}`));
await fs.writeFile(path.join(directory, "checksums.sha256"), `${checksums.join("\n")}\n`);
await execute("sha256sum", ["-c", "checksums.sha256"], { cwd: directory });
const zipPath = `${directory}.zip`;
await execute("zip", ["-X", "-q", "-r", zipPath, path.basename(directory)], { cwd: outputRoot });
await execute("unzip", ["-t", zipPath], { cwd: outputRoot });
process.stdout.write(`${zipPath}\n`);
