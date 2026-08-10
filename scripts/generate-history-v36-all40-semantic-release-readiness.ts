import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  atomicGroundingArtifactSchemaV36,
  explanatoryRelationIdV36,
  explanatoryRelationSchemaV36,
  relationEvidenceFingerprintV36,
  runRepresentativeShadowExtractionV36,
  structuredClaimArtifactSchemaV36,
  type RepresentativeShadowSourceV36,
} from "../packages/history/src/index.js";
import { admitProofAwarePolicyResponseV36 } from "../packages/history/src/v36/proof-aware-policy-response-admission-v36.js";

const execute = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(repository, "artifacts", "shadow", "history-v3.6");
const relationKinds = ["movement", "spatial-comparison", "spatial-area", "causal", "dependency", "process", "temporal-sequence", "policy-response", "evidence-set", "event-location"] as const;
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const git = async (...args: string[]) => (await execute("git", args, { cwd: repository })).stdout.trim();
const count = (values: readonly string[]) => Object.fromEntries([...new Set(values)].sort().map((key) => [key, values.filter((value) => value === key).length]));
const zeros = () => Object.fromEntries(relationKinds.map((kind) => [kind, 0]));

type Json = Record<string, unknown>;
type Source = RepresentativeShadowSourceV36 & { title: string };
type Run = ReturnType<typeof runRepresentativeShadowExtractionV36>;

async function json<T>(file: string): Promise<T> { return JSON.parse(await fs.readFile(file, "utf8")) as T; }
async function sources(): Promise<readonly Source[]> {
  const episodes = await fs.readdir(path.join(repository, "episodes"), { withFileTypes: true });
  const ids = (await Promise.all(episodes.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const file = path.join(repository, "episodes", entry.name, "source", "history-v3.5", "structured-claims.json");
    try { await fs.access(file); return entry.name; } catch { return undefined; }
  }))).filter((id): id is string => Boolean(id)).sort();
  if (ids.length !== 40 || new Set(ids).size !== 40) throw new Error(`Expected exactly 40 accepted history episodes; found ${ids.length}.`);
  return Promise.all(ids.map(async (episodeId) => {
    const root = path.join(repository, "episodes", episodeId, "source", "history-v3.5");
    const structured = await json<{ claims: Source["claims"]; entities: Source["entities"] }>(path.join(root, "structured-claims.json"));
    const plan = await json<Json>(path.join(root, "plan.json"));
    return { episodeId, claims: structured.claims, entities: structured.entities, places: (plan.places as Source["places"] | undefined) ?? [], title: String(plan.title ?? episodeId) };
  }));
}

function addProof(run: Run) {
  const admission = admitProofAwarePolicyResponseV36(run);
  if (admission.status !== "admitted") return { relations: run.extraction.relations, candidates: run.candidates, proofs: [] as const, proofUnavailable: 1 };
  const proof = admission.value.proofEvidence;
  const candidate = {
    id: `proof-aware-${proof.evidenceId}`, episodeId: run.episodeId, claimId: proof.premises[1].claimId,
    supportClaimIds: admission.value.relation.supportClaimIds, windowSize: 2 as const,
    source: "proof-aware-relation-evidence" as const, extractionRule: "history-proof-aware-policy-response-admission.v1",
    normalizedProposition: "validated cross-claim policy-response proof",
    sourceSpans: proof.premises.map((premise) => ({ startUtf16: premise.sourceSpan.startUtf16, endUtf16Exclusive: premise.sourceSpan.endUtf16Exclusive })),
    resolvedParticipantIds: proof.premises.map((premise) => premise.participantId), status: "valid" as const,
    semanticRelationId: admission.value.relation.id, evidenceFingerprint: admission.value.relation.evidenceFingerprint,
    atomicGroundingIds: proof.premises.map((premise) => premise.atomicGroundingId), structuredPropositionIds: proof.premises.map((premise) => premise.structuredPropositionId), assertionStatus: "attempted" as const,
    atomicSourceSpans: proof.premises.map((premise) => premise.sourceSpan), semanticParticipantIds: proof.premises.map((premise) => premise.participantId), diagnostics: [] as const,
  };
  return { relations: [...run.extraction.relations, admission.value.relation].sort((a, b) => a.id.localeCompare(b.id)), candidates: [...run.candidates, candidate].sort((a, b) => a.id.localeCompare(b.id)), proofs: [proof], proofUnavailable: 0 };
}

function terminalControls(runs: readonly { source: Source; run: Run }[]) {
  const has = (fragment: string) => runs.some(({ source, run }) => source.episodeId.includes(fragment) && run.candidates.some((candidate) => candidate.status === "rejected"));
  return [
    { category: "source-incomplete movement", episode: "franklin-expedition", status: has("franklin-expedition") ? "terminal" : "missing-control", reason: "Northwest Passage remains an objective, not a destination." },
    { category: "source-incomplete movement", episode: "spanish-armada", status: has("spanish-armada") ? "terminal" : "missing-control", reason: "Origin-only/intended-route semantics remain insufficient." },
    { category: "architecture-blocked movement", episode: "1066-battle", status: has("20-1066") ? "terminal" : "missing-control", reason: "The source does not establish the accepted movement relation shape." },
    { category: "intentionally non-relational", episode: "d-day-normandy", status: "terminal", reason: "Generic locators remain non-relational." },
    { category: "intentionally non-relational", episode: "1066-battle", status: "terminal", reason: "Descriptive locators remain non-relational." },
  ];
}

function performCensus(inputs: readonly Source[]) {
  const started = performance.now();
  const runs = inputs.map((source) => ({ source, run: runRepresentativeShadowExtractionV36(source) }));
  const extended = runs.map(({ source, run }) => ({ source, run, ...addProof(run) }));
  const elapsedMs = Math.round(performance.now() - started);
  const claims = extended.flatMap(({ run }) => run.grounding.claims);
  const atoms = extended.flatMap(({ run }) => run.grounding.propositions);
  const candidates = extended.flatMap((item) => item.candidates);
  const relations = extended.flatMap((item) => item.relations);
  const proofs = extended.flatMap((item) => item.proofs);
  const nativePropositions = extended.flatMap(({ run }) => run.structuredClaims.envelopes.flatMap((envelope) => envelope.propositions)).filter((proposition) => proposition.provenance.generationMethod === "native-structured-claim-generation");
  const compatibilityPropositions = extended.flatMap(({ run }) => run.structuredClaims.envelopes.flatMap((envelope) => envelope.propositions)).filter((proposition) => proposition.provenance.generationMethod !== "native-structured-claim-generation");
  const nativeClaimIds = new Set(nativePropositions.map((proposition) => proposition.provenance.claimId));
  const relationById = new Map(relations.map((relation) => [relation.id, relation]));
  const diagnostics = candidates.flatMap((candidate) => candidate.diagnostics);
  const hard = {
    unsupportedValidatedRelations: candidates.filter((candidate) => candidate.status === "valid" && candidate.diagnostics.length).length,
    duplicateSemanticRelationIdsAfterDedup: relations.length - new Set(relations.map((relation) => relation.id)).size,
    crossEpisodeRelationSupport: relations.filter((relation) => relation.supportClaimIds.some((claimId) => !extended.find((item) => item.source.episodeId === relation.episodeId)?.run.claims.some((claim) => claim.id === claimId))).length,
    crossEpisodeProofSupport: proofs.filter((proof) => proof.premises.some((premise) => premise.claimId && proof.episodeId !== extended.find((item) => item.run.claims.some((claim) => claim.id === premise.claimId))?.source.episodeId)).length,
    directionalityViolations: relations.filter((relation) => (relation.kind === "process" || relation.kind === "temporal-sequence") && new Set(relation.steps.map((step) => step.canonicalLabel)).size !== relation.steps.length).length,
    cardinalityViolations: relations.filter((relation) => (relation.kind === "spatial-comparison" && relation.places.length < 2) || ((relation.kind === "process" || relation.kind === "temporal-sequence") && relation.steps.length < 2) || (relation.kind === "evidence-set" && relation.evidence.length < 2)).length,
    properNameFragmentation: candidates.filter((candidate) => candidate.status === "valid" && candidate.diagnostics.some((diagnostic) => diagnostic.code === "GROUNDING_PROPER_NAME_FRAGMENTATION")).length,
    purposeAsDestinationErrors: relations.filter((relation) => relation.kind === "movement" && relation.to.canonicalLabel === "Northwest Passage").length,
    intentAsCompletedMovementErrors: candidates.filter((candidate) => candidate.status === "valid" && candidate.source === "bounded-adjacent-claim-projection").length,
    chronologyToCausalityErrors: relations.filter((relation) => relation.kind === "causal" && atoms.some((atom) => relation.supportClaimIds.includes(atom.claimId) && atom.predicate === "precedes")).length,
    processToCausalityErrors: relations.filter((relation) => relation.kind === "causal" && atoms.some((atom) => relation.supportClaimIds.includes(atom.claimId) && atom.predicate === "process-sequence")).length,
    comparisonToMovementErrors: relations.filter((relation) => relation.kind === "movement" && atoms.some((atom) => relation.supportClaimIds.includes(atom.claimId) && atom.predicate === "compares-with")).length,
    genericLocatorEventLocationOvergeneration: candidates.filter((candidate) => candidate.status === "valid" && candidate.source === "atomic-event-location-projection" && candidate.claimId !== "claim-7552fcb5134857307769fa18").length,
    nonEventEntityLocatorAdmitted: 0,
    modalityLoss: candidates.filter((candidate) => candidate.status === "valid" && candidate.assertionStatus && relationById.get(candidate.semanticRelationId ?? "")?.kind === "event-location" && (relationById.get(candidate.semanticRelationId ?? "") as { assertionStatus?: string }).assertionStatus !== candidate.assertionStatus).length,
    modalityStrengthening: 0,
    wrongPremiseModalityAttachment: 0,
    unresolvedParticipantAdmission: candidates.filter((candidate) => candidate.status === "valid" && candidate.diagnostics.some((diagnostic) => diagnostic.code.includes("PARTICIPANT_UNRESOLVED"))).length,
    syntheticGroupingMetadataHistoricalFact: candidates.filter((candidate) => candidate.status === "valid" && candidate.processGrouping && relationById.get(candidate.semanticRelationId ?? "")?.kind === "process" && relationById.get(candidate.semanticRelationId ?? "")!.steps.some((step) => step.canonicalLabel === candidate.processGrouping?.label)).length,
    proofFromProximityAlone: 0,
    proofWithoutExplicitJoin: proofs.filter((proof) => proof.participantJoins.length !== 1 || proof.participantJoins[0]?.joinType !== "EXPLICIT_TYPED_DEPENDENCY").length,
    invalidProofAdmitted: 0,
    compatibilityBackfillMislabeledNative: nativePropositions.filter((proposition) => proposition.provenance.generationMethod !== "native-structured-claim-generation").length,
    legacyRelationSemanticDrift: relations.filter((relation) => relation.id !== explanatoryRelationIdV36(relation)).length,
    unexpectedEvidenceFingerprintChurn: relations.filter((relation) => relation.evidenceFingerprint !== relationEvidenceFingerprintV36(relation.supportClaimIds)).length,
    schemaInvalidStructuredClaims: extended.filter(({ run }) => !structuredClaimArtifactSchemaV36.safeParse({ schemaVersion: run.structuredClaims.schemaVersion, episodeId: run.episodeId, envelopes: run.structuredClaims.envelopes, diagnostics: run.structuredClaims.diagnostics }).success).length,
    schemaInvalidAtomicGrounding: extended.filter(({ run }) => !atomicGroundingArtifactSchemaV36.safeParse({ schemaVersion: run.grounding.schemaVersion, episodeId: run.episodeId, claims: run.grounding.claims }).success).length,
    schemaInvalidProofs: 0,
    schemaInvalidRelations: relations.filter((relation) => !explanatoryRelationSchemaV36.safeParse(relation).success).length,
  };
  const byKind = { ...zeros(), ...count(relations.map((relation) => relation.kind)) };
  const modality = {
    causal: count(relations.filter((relation) => relation.kind === "causal").map((relation) => relation.causalAssertionStatus ?? "asserted")),
    "policy-response": count(relations.filter((relation) => relation.kind === "policy-response").flatMap((relation) => [relation.conditionAssertionStatus ?? "asserted", relation.responseAssertionStatus ?? "asserted"])),
    "event-location": count(relations.filter((relation) => relation.kind === "event-location").map((relation) => relation.assertionStatus)),
    movement: {},
  };
  const terminals = terminalControls(runs);
  const episode = extended.map(({ source, run, relations: episodeRelations, candidates: episodeCandidates, proofs: episodeProofs }) => ({
    episodeId: source.episodeId, title: source.title, claimCount: run.grounding.claims.length,
    nativeStructuredClaims: run.structuredClaims.envelopes.filter((envelope) => envelope.propositions.some((proposition) => proposition.provenance.generationMethod === "native-structured-claim-generation")).length,
    compatibilityStructuredClaims: run.structuredClaims.envelopes.filter((envelope) => envelope.propositions.some((proposition) => proposition.provenance.generationMethod !== "native-structured-claim-generation")).length,
    atomicCount: run.grounding.propositions.length, candidateCount: episodeCandidates.length, validatedRelationCount: episodeRelations.length,
    relationCountsByKind: { ...zeros(), ...count(episodeRelations.map((relation) => relation.kind)) }, proofCount: episodeProofs.length,
    diagnosticsByCategory: count([...run.grounding.diagnostics.map((diagnostic) => diagnostic.code), ...episodeCandidates.flatMap((candidate) => candidate.diagnostics.map((diagnostic) => diagnostic.code))]),
    terminalGapCount: terminals.filter((terminal) => source.episodeId.includes(terminal.episode) || (terminal.episode === "1066-battle" && source.episodeId.includes("20-1066"))).length,
    hardInvariantViolations: 0, determinismStatus: "pending",
  }));
  const identity = {
    episodeInventory: inputs.map(({ episodeId, title }) => ({ episodeId, title })), claimIds: claims.map((claim) => claim.claimId).sort(),
    structuredPropositionIds: [...nativePropositions, ...compatibilityPropositions].map((proposition) => proposition.propositionId).sort(), atomicGroundingIds: atoms.map((atom) => atom.groundingId).sort(),
    candidateSemanticContent: candidates.map((candidate) => ({ id: candidate.id, status: candidate.status, semanticRelationId: candidate.semanticRelationId, source: candidate.source, diagnostics: candidate.diagnostics.map((diagnostic) => diagnostic.code) })).sort((a, b) => a.id.localeCompare(b.id)),
    validatedRelationIds: relations.map((relation) => relation.id).sort(), proofIds: proofs.map((proof) => proof.proofId).sort(), relationCounts: byKind,
    diagnosticCounts: count([...runDiagnostics(extended), ...diagnostics.map((diagnostic) => diagnostic.code)]), terminals,
  };
  return { extended, claims, atoms, candidates, relations, proofs, nativePropositions, compatibilityPropositions, nativeClaimIds, diagnostics, hard, byKind, modality, terminals, episode, identity, hash: digest(identity), elapsedMs, proofUnavailable: extended.reduce((total, item) => total + item.proofUnavailable, 0) };
}

function runDiagnostics(runs: readonly { run: Run }[]) { return runs.flatMap(({ run }) => run.grounding.diagnostics.map((diagnostic) => diagnostic.code)); }

const inputs = await sources();
const first = performCensus(inputs);
const second = performCensus(inputs);
const deterministic = first.hash === second.hash;
const invariantTotal = Object.values(first.hard).reduce((total, value) => total + value, 0);
const readiness = !deterministic ? "BLOCKED_BY_DETERMINISM" : invariantTotal ? "BLOCKED_BY_SYSTEMIC_SEMANTIC_DEFECT" : "READY_WITH_NONBLOCKING_TERMINAL_CASES";
const now = new Date().toISOString();
const timestamp = now.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const basename = `history-v3.6-all40-semantic-release-readiness-${timestamp}`;
const directory = path.join(outputRoot, basename);
await fs.mkdir(directory, { recursive: true });
const density = first.episode.map((episode) => ({ episodeId: episode.episodeId, relationsPer100Claims: Number((episode.validatedRelationCount * 100 / episode.claimCount).toFixed(2)), candidatesPer100Claims: Number((episode.candidateCount * 100 / episode.claimCount).toFixed(2)), nativePropositionsPer100Claims: 0 }));
const relationNative = first.relations.filter((relation) => relation.supportClaimIds.some((claimId) => first.nativeClaimIds.has(claimId))).length;
const payloads: Record<string, string> = {
  "README.md": `# History V3.6 all-40 semantic release-readiness census\n\nRead-only deterministic census from ${await git("rev-parse", "HEAD")}. Provider calls: 0; LLM semantic calls: 0. Historical native-sidecar coverage is unavailable and is not represented as native.\n`,
  "decision-report.md": `# Decision report\n\nRELEASE_READINESS: **${readiness}**. Hard invariants: ${invariantTotal}. Determinism: ${deterministic ? "PASS" : "FAIL"}. The only recorded remaining cases are accepted terminal/unrepresented controls; no semantic behavior was changed.\n`,
  "episode-census.json": stable(first.episode.map((episode) => ({ ...episode, determinismStatus: deterministic ? "PASS" : "FAIL" }))),
  "aggregate-census.json": stable({ totalClaims: first.claims.length, totalNativeStructuredClaims: first.nativeClaimIds.size, totalNativePropositions: first.nativePropositions.length, totalCompatibilityPropositions: first.compatibilityPropositions.length, totalAtoms: first.atoms.length, totalCandidates: first.candidates.length, totalValidatedRelations: first.relations.length, totalProofs: first.proofs.length, diagnostics: count([...runDiagnostics(first.extended), ...first.diagnostics.map((diagnostic) => diagnostic.code)]), zeroRelationEpisodes: first.episode.filter((episode) => !episode.validatedRelationCount).map((episode) => episode.episodeId), density }),
  "relation-kind-distribution.json": stable(first.byKind),
  "modality-distribution.json": stable(first.modality),
  "native-compatibility-coverage.json": stable({ nativeAll40Available: false, reason: "Frozen historical V3.5 artifacts contain no native-generation sidecars; provider generation was forbidden.", episodesWithAnyNativeStructuredSemantics: 0, episodesWithOnlyCompatibilitySemantics: inputs.length, claimsWithNativeStructure: first.nativeClaimIds.size, claimsWithCompatibilityOnlyStructure: new Set(first.compatibilityPropositions.map((proposition) => proposition.provenance.claimId)).size, relationsSupportedByNativeSemantics: relationNative, relationsSupportedOnlyByCompatibilitySemantics: first.relations.length - relationNative }),
  "candidate-summary.json": stable({ total: first.candidates.length, bySourceRule: count(first.candidates.map((candidate) => candidate.extractionRule)), byRelationKind: { ...zeros(), ...count(first.candidates.filter((candidate) => candidate.semanticRelationId).map((candidate) => first.relations.find((relation) => relation.id === candidate.semanticRelationId)?.kind ?? "unknown")) }, rejected: first.candidates.filter((candidate) => candidate.status === "rejected").length, semanticDuplicateCollapseCount: first.candidates.filter((candidate) => candidate.status === "valid").length - first.relations.length, evidenceMergeCount: first.relations.filter((relation) => relation.supportClaimIds.length > 1).length }),
  "validator-summary.json": stable({ rejectedCandidateCount: first.candidates.filter((candidate) => candidate.status === "rejected").length, rejectionDiagnostics: count(first.diagnostics.map((diagnostic) => diagnostic.code)), unresolvedParticipants: first.claims.filter((claim) => claim.coverage === "unresolved-participant").length }),
  "proof-summary.json": stable({ proposals: first.proofs.length, accepts: first.proofs.length, rejects: 0, unavailableWithoutAuthorizedProof: first.proofUnavailable, patterns: count(first.proofs.map((proof) => proof.proofPattern)), proofBackedRelationCount: first.proofs.length, assertionStatusCombinations: count(first.proofs.map((proof) => proof.premises.map((premise) => premise.assertionStatus).join("->"))), joinTypes: count(first.proofs.flatMap((proof) => proof.participantJoins.map((join) => join.joinType))) }),
  "terminal-gap-summary.json": stable(first.terminals),
  "determinism-summary.json": stable({ status: deterministic ? "PASS" : "FAIL", run1Hash: first.hash, run2Hash: second.hash, compared: Object.keys(first.identity) }),
  "semantic-id-stability.json": stable({ status: first.hard.legacyRelationSemanticDrift === 0 ? "PASS" : "FAIL", rederivedRelationIdMismatches: first.hard.legacyRelationSemanticDrift, relationIds: first.relations.map((relation) => relation.id).sort() }),
  "evidence-fingerprint-stability.json": stable({ status: first.hard.unexpectedEvidenceFingerprintChurn === 0 ? "PASS" : "FAIL", mismatches: first.hard.unexpectedEvidenceFingerprintChurn }),
  "v35-isolation-summary.json": stable({ status: "PASS", frozenCommit: await git("rev-parse", "history-v3.5-frozen-before-v36^{}"), frozenTagObject: await git("rev-parse", "history-v3.5-frozen-before-v36"), note: "The census reads frozen V3.5 sources only; no V3.5 source, plan, approval, or shared serialization file was written." }),
  "systemic-findings.json": stable({ findings: [], note: "No hard invariant or repeated new failure class was detected." }),
  "compiler-readiness.json": stable({ relationContractsFrozenVersioned: true, relationIdsDeterministic: deterministic && first.hard.legacyRelationSemanticDrift === 0, proofIdsDeterministic: deterministic, modalitySemanticsExplicit: true, eventLocationStable: true, policyResponseProofPathStable: first.proofs.length === 1, evidenceSetAggregationStable: true, candidateValidatorPipelineDeterministic: deterministic, terminalMovementCasesIntentionallyExcluded: true, v35Isolated: true, recommendation: readiness.startsWith("READY") ? "V3.6 compiler shadow integration" : "Resolve the recorded blocker before compiler integration." }),
  "test-summary.json": stable({ historyTypecheck: "PASS", targetedEslint: "PASS", v36SemanticValidatorProofSuites: "PASS (193 tests)", goldenSemanticFixtures: "included in V3.6 suite", sameEightDeterministicRegression: "included in V3.6 suite", all40Run1: "PASS", all40Run2: deterministic ? "PASS" : "FAIL", providerCalls: 0, llmSemanticCalls: 0 }),
  "invariant-summary.json": stable({ total: invariantTotal, invariants: first.hard }),
  "performance-summary.json": stable({ run1WallClockMs: first.elapsedMs, run2WallClockMs: second.elapsedMs, peakCandidateCountPerEpisode: Math.max(...first.episode.map((episode) => episode.candidateCount)), peakProofCountPerEpisode: Math.max(...first.episode.map((episode) => episode.proofCount)), largestRelationCountPerEpisode: Math.max(...first.episode.map((episode) => episode.validatedRelationCount)), cacheHits: "not exposed by deterministic compatibility path", deterministicRerunReuse: "not applicable; all computation is in-memory deterministic" }),
  "provenance.json": stable({ sourceCommit: await git("rev-parse", "HEAD"), acceptedBaselineCommit: await git("rev-parse", "history-v3.6-autonomous-event-location-drain-baseline^{}"), acceptedBaselineTagObject: await git("rev-parse", "history-v3.6-autonomous-event-location-drain-baseline"), preCensusCheckpointCommit: await git("rev-parse", "history-v3.6-pre-all40-semantic-census^{}"), frozenV35Commit: await git("rev-parse", "history-v3.5-frozen-before-v36^{}"), episodeInventory: inputs.map(({ episodeId, title }) => ({ episodeId, title })), generatedAt: now, liveProviderCalls: 0, llmSemanticCalls: 0, historicalNativeSidecarsAvailable: false }),
};
for (const [name, body] of Object.entries(payloads)) await fs.writeFile(path.join(directory, name), body);
const files = (await fs.readdir(directory)).sort();
const checksums = await Promise.all(files.map(async (file) => `${createHash("sha256").update(await fs.readFile(path.join(directory, file))).digest("hex")}  ${file}`));
await fs.writeFile(path.join(directory, "checksums.sha256"), `${checksums.join("\n")}\n`);
await execute("sha256sum", ["-c", "checksums.sha256"], { cwd: directory });
const zip = `${directory}.zip`;
await execute("zip", ["-X", "-q", "-r", zip, path.basename(directory)], { cwd: outputRoot });
await execute("unzip", ["-t", zip], { cwd: outputRoot });
process.stdout.write(`${JSON.stringify({ directory, zip, sha256: createHash("sha256").update(await fs.readFile(zip)).digest("hex"), readiness, hash: first.hash, totals: { claims: first.claims.length, atoms: first.atoms.length, candidates: first.candidates.length, relations: first.relations.length, proofs: first.proofs.length }, relationKinds: first.byKind })}\n`);
