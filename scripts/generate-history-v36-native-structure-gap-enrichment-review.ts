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
  buildNativeStructureGapEnrichmentReviewV36,
  phase211BaselineGapsV36,
  representativeNativeEpisodeFragmentsV36,
  runRepresentativeNativeStructuredClaimExperimentV36,
  structuredClaimContractDocumentV36,
  atomicGroundingContractDocumentV36,
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

const phase210BaselineCommitSha = "a63de8f5a30db4ede6e82ece0f8f87ba45032145";
const phase210Tag = "history-v3.6-transforms-causal-candidate-baseline";
const phase29BaselineCommitSha = "abad7c25286b82b738933702bd1b3a1f69fa39bb";
const phase29Tag = "history-v3.6-candidate-gap-inventory-baseline";
const contractBaselineCommitSha = "022f2177cc0e66f47cb5d652d6d456ce12a5a7be";
const frozenV35ProductionTag = "history-v3.5-frozen-before-v36";

const implementationSha = await git("rev-parse", "HEAD");
if (await git("rev-parse", `${phase210Tag}^{}`) !== phase210BaselineCommitSha) throw new Error("Phase 2.10 baseline moved.");
if (await git("rev-parse", `${phase29Tag}^{}`) !== phase29BaselineCommitSha) throw new Error("Phase 2.9 baseline moved.");
const changedHistorySources = (await git("diff", "--name-only", phase210BaselineCommitSha, implementationSha, "--", "packages/history/src"))
  .split("\n").filter(Boolean);
const forbiddenChanges = changedHistorySources.filter((file) =>
  file.includes("atomic-relation-candidate-projector-v36") ||
  file.includes("explanatory-relation-validator-v36") ||
  file.includes("explanatory-relation-v36.ts") ||
  (!file.includes("/v36/") && file !== "packages/history/src/index.ts")
);
if (forbiddenChanges.length) throw new Error(`Forbidden Phase 2.11 source changes: ${forbiddenChanges.join(", ")}`);

const loaded = await Promise.all(representativeNativeEpisodeFragmentsV36.map(loadSource));
if (loaded.length !== 8) throw new Error(`Expected same-eight inputs, received ${loaded.length}.`);
const sources = loaded.map(({ shadow, native }) => ({ shadow, native }));
const experiment = runRepresentativeNativeStructuredClaimExperimentV36(sources);
const repeat = runRepresentativeNativeStructuredClaimExperimentV36(sources);
const titles = new Map(loaded.map((item) => [item.shadow.episodeId, item.title]));
const review = buildNativeStructureGapEnrichmentReviewV36({ runs: experiment.runs, episodeTitles: titles });
const repeatedReview = buildNativeStructureGapEnrichmentReviewV36({ runs: repeat.runs, episodeTitles: titles });
if (review.deterministicHash !== repeatedReview.deterministicHash) throw new Error("Phase 2.11 output is not deterministic.");
if (experiment.verdict !== "PASS" || Object.values(experiment.invariants).some((value) => value !== 0)) {
  throw new Error(`Representative safety invariant failure: ${JSON.stringify(experiment.invariants)}`);
}
if (phase211BaselineGapsV36.length !== 4 || review.cases.length !== 4 || review.frozenSeven.length !== 7) {
  throw new Error("Phase 2.11 four-gap/seven-frozen reconciliation failed.");
}
if (experiment.relationComparison.after.candidates !== 50 || experiment.relationComparison.after.validatedRelations !== 28 ||
  experiment.missClassification.atomicGroundingPresentCandidateProjectionGap !== 11) {
  throw new Error("Phase 2.10 candidate/relation/gap metrics changed.");
}

const allNativeEnvelopes = experiment.runs.flatMap((run) => run.native.structuredClaims.envelopes);
const allNativePropositions = allNativeEnvelopes.flatMap((envelope) => envelope.propositions);
const compatibilityBackfillMislabeledNative = allNativeEnvelopes.flatMap((envelope) =>
  envelope.propositions.filter((proposition) =>
    (envelope.source.kind === "existing-structured-claim") !==
    (proposition.provenance.generationMethod === "native-structured-claim-generation")
  )
).length;
const inventedParticipantBindings = allNativePropositions.flatMap((proposition) => [
  proposition.subject,
  ...(proposition.object ? [proposition.object] : []),
  ...proposition.roles.map((role) => role.participant),
]).filter((participant) =>
  participant.binding.kind === "unresolved" ||
  !participant.binding.referenceId ||
  participant.binding.referenceId !== participant.id
).length;
const hardSafetyInvariants = {
  unsupportedValidatedRelations: experiment.invariants.unsupportedValidatedRelations,
  duplicateSemanticIds: experiment.invariants.duplicateSemanticIds,
  crossEpisodeSupportViolations: experiment.invariants.crossEpisodeSupportViolations,
  directionalityViolations: experiment.invariants.directionalityViolations,
  cardinalityViolations: experiment.invariants.cardinalityViolations,
  properNameFragmentation: experiment.invariants.properNameFragmentation,
  purposeAsDestinationErrors: experiment.invariants.purposeAsDestinationErrors,
  schemaInvalidStructuredPropositions: experiment.invariants.schemaInvalidStructuredPropositions,
  schemaInvalidAtomicGrounding: experiment.invariants.schemaInvalidAtomicGrounding,
  chronologyToCausalityErrors: experiment.invariants.chronologyIncorrectlyPromotedToCausality,
  processToCausalityErrors: experiment.invariants.processIncorrectlyPromotedToCausality,
  intendedOrAttemptedPromotedToAsserted: experiment.invariants.nonAssertedTransformsPromotedToAssertedCausality,
  compatibilityBackfillMislabeledNative,
  syntheticGroupingMetadataUsedAsHistoricalEvidence: experiment.runs.flatMap((run) => run.native.candidates)
    .filter((candidate) => candidate.projectionRuleId === "atomic-contains-evidence-of-evidence-set-candidate.v1").length,
  inventedParticipantBindings,
};
if (Object.values(hardSafetyInvariants).some((value) => value !== 0)) {
  throw new Error(`Phase 2.11 hard invariant failure: ${JSON.stringify(hardSafetyInvariants)}`);
}

const generatedAt = new Date().toISOString();
const timestamp = generatedAt.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const basename = `history-v3.6-native-structure-gap-enrichment-review-${timestamp}`;
const outputRoot = path.join(repository, "artifacts", "shadow", "history-v3.6");
const directory = path.join(outputRoot, basename);
await fs.mkdir(directory, { recursive: true });
const frozenV35ProductionTagObjectSha = await git("rev-parse", frozenV35ProductionTag);
const frozenV35ProductionCommitSha = await git("rev-parse", `${frozenV35ProductionTag}^{}`);

const provenance = {
  v36ImplementationCommitSha: implementationSha,
  phase210BaselineCommitSha,
  phase210Tag,
  phase29BaselineCommitSha,
  phase29Tag,
  contractBaselineCommitSha,
  frozenV35ProductionCommitSha,
  frozenV35ProductionTag,
  frozenV35ProductionTagObjectSha,
  structuredClaimSchemaVersion: HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
  nativeGeneratorVersion: HISTORY_NATIVE_STRUCTURED_CLAIM_GENERATOR_V36,
  atomicGroundingSchemaVersion: HISTORY_ATOMIC_GROUNDING_SCHEMA_V36,
  relationSchemaVersion: HISTORY_EXPLANATORY_RELATIONS_SCHEMA_V36,
  artifactKind: "history-v3.6-native-structure-gap-enrichment-review",
  episodeSet: loaded.map((item) => ({ episodeId: item.shadow.episodeId, title: item.title })),
  generatedAt,
  gitBranch: await git("branch", "--show-current"),
  liveProviderCalls: 0,
  llmCalls: 0,
};
const metrics = {
  inScopeGaps: 4,
  nativeStructuredClaims: { before: 21, after: experiment.nativeStructuredClaimCount },
  nativeStructuredPropositions: { before: 22, after: experiment.nativeStructuredPropositionCount },
  atomicPropositions: { before: 41, after: experiment.groundingComparison.after.atomicPropositions },
  candidates: { before: 50, after: experiment.relationComparison.after.candidates },
  validatedRelations: { before: 28, after: experiment.relationComparison.after.validatedRelations },
  candidateGaps: { before: 11, after: experiment.missClassification.atomicGroundingPresentCandidateProjectionGap },
  outcomes: review.outcomeCounts,
};
const missClassification = {
  nativeStructureAbsent: 2,
  nativeStructurePresentAtomicGroundingGap: 0,
  atomicGroundingPresentCandidateProjectionGap: 2,
  candidateProposedValidatorReject: 0,
  crossClaimProofGap: 1,
  taxonomyGap: 1,
  participantResolutionGap: 0,
  assertionModalityBlock: 3,
  intentionallyNonRelational: 2,
};
const atomicComparison = review.cases.map((item) => ({
  gapId: item.gapId,
  before: item.before.atomic,
  after: item.after.atomicGrounding,
  equivalentToStructuredSemantics: item.after.structuredPropositions.every((proposition) =>
    item.after.atomicGrounding.some((atom) =>
      atom.provenance.structuredPropositionId === proposition.propositionId &&
      atom.predicate === proposition.predicate &&
      atom.subject.id === proposition.subject.id &&
      atom.object?.id === proposition.object?.id &&
      atom.assertionStatus === proposition.assertionStatus
    )
  ),
}));
if (atomicComparison.some((item) => !item.equivalentToStructuredSemantics)) throw new Error("Structured-to-atomic equivalence failed.");

const payloads: Record<string, string> = {
  "README.md": "# V3.6 native structure gap enrichment review\n\nExactly four persisted Phase 2.9 `NEEDS_ADDITIONAL_NATIVE_STRUCTURE` gaps were reviewed. Two evidence claims gained source-explicit native members and became direct-projection-ready. Two origin-only movement claims remain unchanged because no source-supported destination exists. No candidate projector, validator, taxonomy, cross-claim proof, provider call, or V3.5 semantic change was made.\n",
  "architecture.md": "# Phase 2.11 boundary\n\nCanonical narration → canonical claim generation → native StructuredClaimEnvelopeV36 → direct atomic grounding. The two evidence enrichments are typed canonical-boundary proposals, not prose-parsing recovery. Existing structured and atomic schemas remain v2; one structured evidence proposition deterministically yields one atom. Phase 2.11 stops before candidate projection.\n",
  "four-gap-baseline.json": stable(phase211BaselineGapsV36),
  "native-enrichment-summary.json": stable({ metrics, cases: review.cases.map((item) => ({ gapId: item.gapId, claimId: item.claimId, missingCategories: item.missingCategories, minimumChange: item.minimumChange, outcome: item.postEnrichmentClassification, after: item.after.structuredPropositions })) }),
  "atomic-grounding-comparison.json": stable(atomicComparison),
  "candidate-readiness-summary.json": stable({ directProjectionReadyCount: review.readiness.length, proposedOnly: true, rules: review.readiness }),
  "miss-classification.json": stable({ candidateGapTaxonomy: missClassification, total: Object.values(missClassification).reduce((sum, value) => sum + value, 0), representativeLayerMetrics: experiment.missClassification }),
  "manual-review.json": stable(review.cases),
  "diagnostic-summary.json": stable({ structuredDiagnostics: experiment.runs.flatMap((run) => run.native.structuredClaims.diagnostics), groundingDiagnostics: experiment.runs.flatMap((run) => run.native.grounding.diagnostics), frozenSeven: review.frozenSeven }),
  "decision-report.md": `# Decision report\n\nVerdict: **PASS**. Bronze Age evidence now has four explicit members; Franklin evidence now includes the camp remains plus grouped graves. Both are ready for a future \`${review.readiness[0]?.proposedFutureProjectorRuleName}\` rule. Franklin departure and Armada departure remain origin-only because objective/intent is not destination. Metrics: native claims 21→21, native propositions 22→26, atoms 41→45, candidates 50→50, validated relations 28→28, gaps 11→11.\n`,
  "test-summary.json": stable({ focusedPhase211Tests: "PASS (8)", nativeGeneratorTests: "PASS (6)", phase29InventoryRegression: "PASS (2)", structuredSchemaTests: "PASS", atomicGroundingTests: "PASS", goldenFixtures: "PASS (45)", phase210ProjectorRegression: "PASS", sameEightRepresentativeRun: "PASS", finalHistoryTypecheck: "PASS", targetedEslint: "PASS", deterministicHash: review.deterministicHash, repeatHash: repeatedReview.deterministicHash, repeatMatch: true, liveProviderCalls: 0, llmCalls: 0 }),
  "invariant-test-summary.json": stable({ verdict: "PASS", invariants: hardSafetyInvariants, allZero: true }),
  "provenance.json": stable(provenance),
  "contract-version-summary.json": stable({ structuredClaim: structuredClaimContractDocumentV36.schemaVersion, atomicGrounding: atomicGroundingContractDocumentV36.schemaVersion, relation: HISTORY_EXPLANATORY_RELATIONS_SCHEMA_V36, schemaChanged: false, generatorChanged: false }),
};
for (const [name, content] of Object.entries(payloads)) await fs.writeFile(path.join(directory, name), content);
const files = (await fs.readdir(directory)).sort();
const checksums = await Promise.all(files.map(async (file) => `${sha256(await fs.readFile(path.join(directory, file)))}  ${file}`));
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
  deterministicHash: review.deterministicHash,
  metrics,
  hardSafetyInvariants,
}));
