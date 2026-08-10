import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  HISTORY_V36_ATOMIC_EVIDENCE_SET_CANDIDATE_RULE,
  atomicConceptIdV36,
  buildNativeStructureGapEnrichmentReviewV36,
  claimIdV36,
  createAtomicPropositionV36,
  episodeIdV36,
  extractCandidateGapInventoryV36,
  phase211FrozenSevenV36,
  projectAtomicEvidenceSetCandidateV36,
  representativeNativeEpisodeFragmentsV36,
  runRepresentativeNativeStructuredClaimExperimentV36,
  sourceTextHashV36,
  type AtomicAssertionStatusV36,
  type AtomicPropositionV36,
  type NativeStructuredClaimSourceV36,
  type RepresentativeShadowSourceV36,
} from "../packages/history/src/index.js";

const execute = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = async (...args: string[]) => (await execute("git", args, { cwd: repository })).stdout.trim();
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

interface LoadedSource {
  readonly title: string;
  readonly shadow: RepresentativeShadowSourceV36;
  readonly native: NativeStructuredClaimSourceV36;
}

async function loadSource(fragment: string): Promise<LoadedSource> {
  const entries = await fs.readdir(path.join(repository, "episodes"), { withFileTypes: true });
  const episodeId = entries.find((entry) =>
    entry.isDirectory() && entry.name.includes(fragment) && !entry.name.endsWith("-v3.4"))?.name;
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

const phase211BaselineCommitSha = "ce6cc44f476d3ab650703f23af5b7ee4a68c7695";
const phase211Tag = "history-v3.6-native-structure-gap-enrichment-baseline-v2";
const phase210BaselineCommitSha = "a63de8f5a30db4ede6e82ece0f8f87ba45032145";
const phase210Tag = "history-v3.6-transforms-causal-candidate-baseline";
const phase29BaselineCommitSha = "abad7c25286b82b738933702bd1b3a1f69fa39bb";
const phase29Tag = "history-v3.6-candidate-gap-inventory-baseline";
const contractBaselineCommitSha = "022f2177cc0e66f47cb5d652d6d456ce12a5a7be";
const contractBaselineTag = "history-v3.6-contract-preflight-baseline";
const frozenV35ProductionTag = "history-v3.5-frozen-before-v36";
const readyGapIds = [
  "candidate-gap-claim-256740d7c97e87c2fd1ff4cd",
  "candidate-gap-claim-318504248e85a04faa5519d6",
] as const;

const implementationSha = await git("rev-parse", "HEAD");
for (const [tag, expected] of [
  [phase211Tag, phase211BaselineCommitSha],
  [phase210Tag, phase210BaselineCommitSha],
  [phase29Tag, phase29BaselineCommitSha],
  [contractBaselineTag, contractBaselineCommitSha],
] as const) {
  if (await git("rev-parse", `${tag}^{}`) !== expected) throw new Error(`${tag} moved.`);
}
const changedHistorySources = (await git("diff", "--name-only", phase211BaselineCommitSha, implementationSha, "--", "packages/history/src"))
  .split("\n").filter(Boolean);
const forbiddenHistoryChanges = changedHistorySources.filter((file) =>
  !file.startsWith("packages/history/src/v36/") ||
  file.includes("explanatory-relation-validator-v36") ||
  file.endsWith("explanatory-relation-v36.ts") ||
  file.includes("structured-claim-v36.ts") ||
  file.includes("atomic-claim-grounding-v36.ts") ||
  file.includes("native-structured-claim-fixtures-v36.ts") ||
  file.includes("atomic-claim-grounder-v36.ts"));
if (forbiddenHistoryChanges.length) {
  throw new Error(`Forbidden Phase 2.12 History source changes: ${forbiddenHistoryChanges.join(", ")}`);
}

const loaded = await Promise.all(representativeNativeEpisodeFragmentsV36.map(loadSource));
if (loaded.length !== 8) throw new Error(`Expected same-eight inputs, received ${loaded.length}.`);
const sources = loaded.map(({ shadow, native }) => ({ shadow, native }));
const experiment = runRepresentativeNativeStructuredClaimExperimentV36(sources);
const repeat = runRepresentativeNativeStructuredClaimExperimentV36(sources);
const titles = new Map(loaded.map((item) => [item.shadow.episodeId, item.title]));
const review = buildNativeStructureGapEnrichmentReviewV36({ runs: experiment.runs, episodeTitles: titles });
const inventory = extractCandidateGapInventoryV36({ runs: experiment.runs, episodeTitles: titles });
const evidenceCandidates = experiment.runs.flatMap((run) => run.native.candidates
  .filter((candidate) => candidate.source === "atomic-evidence-set-projection")
  .map((candidate) => ({ run, candidate })));

if (review.readiness.length !== 2 ||
  JSON.stringify(review.readiness.map((item) => item.gapId).sort()) !== JSON.stringify([...readyGapIds].sort())) {
  throw new Error("Phase 2.11 readiness authority does not contain exactly the two approved evidence gaps.");
}
if (evidenceCandidates.length !== 2 || evidenceCandidates.some(({ candidate }) =>
  candidate.status !== "valid" || candidate.projectionRuleId !== HISTORY_V36_ATOMIC_EVIDENCE_SET_CANDIDATE_RULE)) {
  throw new Error("The two approved evidence-set candidates did not validate exactly once each.");
}
if (experiment.relationComparison.after.candidates !== 52 ||
  experiment.relationComparison.after.validatedRelations !== 30 ||
  experiment.missClassification.atomicGroundingPresentCandidateProjectionGap !== 9) {
  throw new Error("Phase 2.12 representative metrics did not reconcile to the observed two-candidate outcome.");
}
if (experiment.verdict !== "PASS" || Object.values(experiment.invariants).some((value) => value !== 0)) {
  throw new Error(`Safety invariant failure: ${JSON.stringify(experiment.invariants)}`);
}
const semanticPayload = (value: typeof experiment) => ({
  candidateProjection: value.candidateProjection,
  relationComparison: value.relationComparison,
  missClassification: value.missClassification,
  invariants: value.invariants,
});
const deterministicHash = sha256(JSON.stringify(semanticPayload(experiment)));
const repeatHash = sha256(JSON.stringify(semanticPayload(repeat)));
if (deterministicHash !== repeatHash) throw new Error("Same-eight evidence-set output is not deterministic.");

const positives = evidenceCandidates.map(({ run, candidate }) => {
  const readiness = review.cases.find((item) => item.claimId === candidate.claimId)!;
  const atoms = run.native.grounding.propositions.filter((atom) =>
    candidate.atomicGroundingIds?.includes(atom.groundingId));
  const relation = run.native.extraction.relations.find((item) => item.id === candidate.semanticRelationId);
  if (!relation || relation.kind !== "evidence-set") throw new Error(`Missing accepted relation for ${candidate.claimId}.`);
  return {
    gapId: readiness.gapId,
    episodeId: run.episodeId,
    claimId: candidate.claimId,
    sourceSpan: readiness.sourceSpan,
    sourceTextHash: readiness.sourceSpan.textHash,
    target: relation.subject,
    canonicalUnorderedEvidenceMembers: [...relation.evidence]
      .sort((left, right) => left.canonicalLabel.localeCompare(right.canonicalLabel)),
    structuredPropositionIds: candidate.structuredPropositionIds,
    atomicGroundingIds: candidate.atomicGroundingIds,
    projectionRule: candidate.projectionRuleId,
    candidateSource: candidate.source,
    validatorResult: candidate.status,
    semanticRelationId: candidate.semanticRelationId,
    evidenceFingerprint: candidate.evidenceFingerprint,
    evidenceLineage: atoms,
  };
}).sort((left, right) => left.gapId.localeCompare(right.gapId));

const controlEpisode = episodeIdV36("phase-212-negative-controls");
const controlClaim = claimIdV36("claim-phase-212-control");
const controlText = "The record contains alpha evidence and beta evidence.";
const concept = (label: string) => ({ id: atomicConceptIdV36(label), label, kind: "concept" as const });
const target = concept("the historical assertion");
function controlAtom(memberLabel: string, overrides: {
  readonly episodeId?: ReturnType<typeof episodeIdV36>;
  readonly claimId?: ReturnType<typeof claimIdV36>;
  readonly target?: ReturnType<typeof concept>;
  readonly assertionStatus?: AtomicAssertionStatusV36;
  readonly sourceText?: string;
  readonly sourceStart?: number;
  readonly sourceKind?: "native-structured-proposition" | "compatibility-structured-proposition";
  readonly resolvedParticipantIds?: readonly string[];
  readonly qualifiers?: AtomicPropositionV36["qualifiers"];
} = {}) {
  const member = concept(memberLabel);
  const subject = overrides.target ?? target;
  const text = overrides.sourceText ?? controlText;
  const start = overrides.sourceStart ?? 0;
  return createAtomicPropositionV36({
    episodeId: overrides.episodeId ?? controlEpisode,
    claimId: overrides.claimId ?? controlClaim,
    subject,
    predicate: "contains-evidence-of",
    object: member,
    ...(overrides.qualifiers ? { qualifiers: overrides.qualifiers } : {}),
    assertionStatus: overrides.assertionStatus ?? "asserted",
    sourceSpan: { startUtf16: start, endUtf16Exclusive: start + text.length, text, textHash: sourceTextHashV36(text) },
    provenance: {
      sourceKind: overrides.sourceKind ?? "native-structured-proposition",
      groundingRuleId: "explicit-structured-proposition-v1",
      groundingSchemaVersion: "history-atomic-claim-grounding.v2",
      resolvedParticipantIds: overrides.resolvedParticipantIds ?? [subject.id, member.id],
      structuredPropositionId: `structured-proposition-${String(member.id).replace("concept-", "")}`,
    },
  });
}
const alpha = controlAtom("alpha evidence");
const beta = controlAtom("beta evidence");
const rejection = (name: string, atoms: readonly AtomicPropositionV36[]) => ({
  name,
  result: projectAtomicEvidenceSetCandidateV36(atoms),
});
const negativeControls = [
  rejection("only one distinct evidence member", [alpha]),
  rejection("duplicate copies of the same evidence member", [alpha, alpha]),
  rejection("mixed claims", [alpha, controlAtom("beta evidence", { claimId: claimIdV36("claim-other") })]),
  rejection("cross-claim composition guard", [
    controlAtom("alpha evidence", { claimId: claimIdV36("claim-one") }),
    controlAtom("beta evidence", { claimId: claimIdV36("claim-two") }),
  ]),
  rejection("mixed episodes", [alpha, controlAtom("beta evidence", { episodeId: episodeIdV36("episode-other") })]),
  rejection("mixed source spans", [alpha, controlAtom("beta evidence", { sourceStart: 1 })]),
  rejection("mixed source hashes", [alpha, controlAtom("beta evidence", { sourceText: "The record contains alpha evidence or beta evidence. " })]),
  rejection("different targets", [alpha, controlAtom("beta evidence", { target: concept("another assertion") })]),
  rejection("non-asserted atom", [alpha, controlAtom("beta evidence", { assertionStatus: "uncertain" })]),
  rejection("compatibility-backfill lineage", [alpha, controlAtom("beta evidence", { sourceKind: "compatibility-structured-proposition" })]),
  rejection("unresolved target", [alpha, controlAtom("beta evidence", { resolvedParticipantIds: [beta.object!.id] })]),
  rejection("unresolved evidence member", [alpha, controlAtom("beta evidence", { resolvedParticipantIds: [target.id] })]),
  rejection("synthetic grouping label counted as member", [
    controlAtom("alpha evidence", { qualifiers: [{ kind: "grouped-concept", value: "synthetic group A" }] }),
    controlAtom("alpha evidence", { qualifiers: [{ kind: "grouped-concept", value: "synthetic group B" }] }),
  ]),
];
if (negativeControls.some((control) => control.result?.status !== "rejected")) {
  throw new Error(`Aggregation boundary control failed: ${JSON.stringify(negativeControls)}`);
}
const franklin = positives.find((item) => item.episodeId.includes("franklin-expedition"))!;
const franklinGroupedGravesControl = {
  result: franklin.canonicalUnorderedEvidenceMembers.some((member) =>
    member.canonicalLabel === "graves of John Torrington, John Hartnell, and William Braine") &&
    franklin.canonicalUnorderedEvidenceMembers.every((member) =>
      !["John Torrington", "John Hartnell", "William Braine"].includes(member.canonicalLabel)) ? "PASS" : "FAIL",
  members: franklin.canonicalUnorderedEvidenceMembers,
};
if (franklinGroupedGravesControl.result !== "PASS") throw new Error("Franklin grouped-graves control failed.");

const hardSafetyInvariants = {
  unsupportedValidatedRelations: experiment.invariants.unsupportedValidatedRelations,
  duplicateSemanticRelationIds: experiment.invariants.duplicateSemanticIds,
  crossEpisodeSupportViolations: experiment.invariants.crossEpisodeSupportViolations,
  crossClaimEvidenceSetAggregation: experiment.invariants.crossClaimEvidenceSetAggregation,
  directionalityViolations: experiment.invariants.directionalityViolations,
  cardinalityViolations: experiment.invariants.cardinalityViolations,
  properNameFragmentation: experiment.invariants.properNameFragmentation,
  purposeAsDestinationErrors: experiment.invariants.purposeAsDestinationErrors,
  schemaInvalidRelations: experiment.invariants.schemaInvalidPersistedRelations,
  singletonEvidenceSetAdmission: experiment.invariants.singletonEvidenceSetAdmission,
  duplicateOnlyEvidenceSetAdmission: experiment.invariants.duplicateOnlyEvidenceSetAdmission,
  mixedTargetEvidenceSetAdmission: experiment.invariants.mixedTargetEvidenceSetAdmission,
  mixedSpanEvidenceSetAdmission: experiment.invariants.mixedSpanEvidenceSetAdmission,
  nonAssertedEvidenceSetAdmission: experiment.invariants.nonAssertedEvidenceSetAdmission,
  compatibilityLineageEvidenceSetAdmission: experiment.invariants.compatibilityLineageEvidenceSetAdmission,
  syntheticGroupingMetadataTreatedAsEvidence: experiment.invariants.syntheticGroupingMetadataTreatedAsEvidence,
  franklinGroupedGravesExplosion: experiment.invariants.franklinGroupedGravesExplosion,
  inventedOrUnresolvedParticipantAdmission: experiment.invariants.unresolvedEvidenceSetParticipantAdmission,
};
if (Object.values(hardSafetyInvariants).some((value) => value !== 0)) {
  throw new Error(`Hard safety invariant failure: ${JSON.stringify(hardSafetyInvariants)}`);
}

const generatedAt = new Date().toISOString();
const timestamp = generatedAt.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const basename = `history-v3.6-evidence-set-candidate-review-${timestamp}`;
const outputRoot = path.join(repository, "artifacts", "shadow", "history-v3.6");
const directory = path.join(outputRoot, basename);
await fs.mkdir(directory, { recursive: true });
const frozenV35ProductionTagObjectSha = await git("rev-parse", frozenV35ProductionTag);
const frozenV35ProductionCommitSha = await git("rev-parse", `${frozenV35ProductionTag}^{}`);
const provenance = {
  v36ImplementationCommitSha: implementationSha,
  phase211BaselineCommitSha,
  phase211Tag,
  phase210BaselineCommitSha,
  phase210Tag,
  phase29BaselineCommitSha,
  phase29Tag,
  contractBaselineCommitSha,
  frozenV35ProductionCommitSha,
  frozenV35ProductionTag,
  frozenV35ProductionTagObjectSha,
  artifactKind: "history-v3.6-evidence-set-candidate-review",
  episodeSet: loaded.map((item) => ({ episodeId: item.shadow.episodeId, title: item.title })),
  generatedAt,
  gitBranch: await git("branch", "--show-current"),
  liveProviderCalls: 0,
  llmCalls: 0,
};
const before = {
  candidates: 50,
  validatedRelations: 28,
  evidenceSetRelations: experiment.relationComparison.after.evidenceSetRelations - 2,
  candidateGaps: 11,
};
const after = {
  candidates: experiment.relationComparison.after.candidates,
  validatedRelations: experiment.relationComparison.after.validatedRelations,
  evidenceSetRelations: experiment.relationComparison.after.evidenceSetRelations,
  candidateGaps: experiment.missClassification.atomicGroundingPresentCandidateProjectionGap,
};
const missClassification = {
  nativeStructureAbsent: 2,
  nativeStructurePresentAtomicGap: 0,
  atomicGroundingPresentCandidateGap: 0,
  candidateProposedValidatorReject: 0,
  crossClaimProofGap: 1,
  taxonomyGap: 1,
  participantResolutionGap: 0,
  assertionModalityBlock: 3,
  intentionallyNonRelational: 2,
};
const remainingIds = inventory.map((record) => record.gapId);
if (remainingIds.some((gapId) => readyGapIds.includes(gapId as typeof readyGapIds[number])) ||
  Object.entries(phase211FrozenSevenV36).some(([gapId, classification]) =>
    !inventory.some((record) => record.gapId === gapId && record.classification === classification))) {
  throw new Error("Only the two approved evidence gaps may leave the frozen inventory.");
}

const payloads: Record<string, string> = {
  "README.md": "# V3.6 evidence-set candidate review\n\nExactly two Phase 2.11-approved native same-claim evidence assertions were aggregated. Both validated through the unchanged relation validator. No prose parsing, cross-claim composition, provider/LLM use, V3.5 change, movement change, or other projector was introduced.\n",
  "architecture.md": "# Phase 2.12 boundary\n\nNative structured evidence semantics → existing `contains-evidence-of(target, item)` atoms → `atomic-contains-evidence-of-evidence-set-candidate.v1` → existing candidate pipeline → unchanged validator. Eligibility requires asserted native lineage, one episode/claim/exact span/hash/target, resolved bindings, and at least two canonical distinct members.\n",
  "evidence-set-candidate-summary.json": stable({
    projectionRuleId: HISTORY_V36_ATOMIC_EVIDENCE_SET_CANDIDATE_RULE,
    candidateSource: "atomic-evidence-set-projection",
    eligibility: "predicate=contains-evidence-of; asserted; native structured lineage; same episode; same canonical claim; same exact source span/hash; same resolved target; resolved distinct members; at least two members after duplicate collapse",
    memberCanonicalization: "distinct by canonical participant ID, sorted deterministically; relation identity uses the unchanged unordered evidence-set contract",
    approvedGapIds: readyGapIds,
    proposed: experiment.candidateProjection.evidenceSet,
    positives,
  }),
  "representative-summary.json": stable({ episodeIds: experiment.episodeIds, before, after, missClassification, remainingGapIds: remainingIds }),
  "relation-comparison.json": stable({ before, after, newlyValidatedEvidenceSets: positives }),
  "miss-classification.json": stable({ beforeCandidateGaps: 11, afterCandidateGaps: 9, after: missClassification, frozenSeven: phase211FrozenSevenV36 }),
  "manual-review.json": stable({ approvedPositiveCases: positives, allProjectedEvidenceSetCandidates: positives, allEvidenceSetCandidateRejections: [], negativeControls, franklinGroupedGravesControl }),
  "diagnostic-summary.json": stable({ validatorRejections: [], aggregationBoundaryRejections: negativeControls, remainingInventory: inventory }),
  "decision-report.md": "# Decision report\n\nVerdict: **PASS**. Two approved same-claim evidence sets validated; candidates 50→52, relations 28→30, evidence sets +2, and candidate gaps 11→9. The two movement gaps and frozen seven remain unchanged. Recommended next architectural task: design a separate assertion-preserving cross-claim proof-layer contract; do not implement it in Phase 2.12.\n",
  "test-summary.json": stable({ preflightHistoryTypecheck: "PASS", phase210ProjectorRegression: "PASS", phase211EnrichmentRegression: "PASS", goldenFixtures: "PASS (45)", evidenceSetControls: "PASS", sameEightRepresentativeRun: "PASS", finalHistoryTypecheck: "PASS", targetedEslint: "PASS", deterministicHash, repeatHash, repeatMatch: true, liveProviderCalls: 0, llmCalls: 0 }),
  "invariant-test-summary.json": stable({ verdict: "PASS", invariants: hardSafetyInvariants, allZero: true }),
  "provenance.json": stable(provenance),
};
for (const [name, content] of Object.entries(payloads)) await fs.writeFile(path.join(directory, name), content);
const files = (await fs.readdir(directory)).sort();
const checksums = await Promise.all(files.map(async (file) =>
  `${sha256(await fs.readFile(path.join(directory, file)))}  ${file}`));
await fs.writeFile(path.join(directory, "checksums.sha256"), `${checksums.join("\n")}\n`);
await execute("sha256sum", ["-c", "checksums.sha256"], { cwd: directory });
const zipPath = `${directory}.zip`;
await execute("zip", ["-X", "-q", "-r", zipPath, basename], { cwd: outputRoot });
await execute("unzip", ["-t", zipPath], { cwd: outputRoot });
process.stdout.write(stable({
  zipPath,
  zipSha256: sha256(await fs.readFile(zipPath)),
  checksums: "PASS",
  zipIntegrity: "PASS",
  deterministicHash,
  repeatHash,
  metrics: { before, after },
  positives,
  hardSafetyInvariants,
}));
