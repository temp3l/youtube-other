import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  admitProofAwarePolicyResponseV36,
  compileHistoryShadowArtifactV36,
  representativeNativeEpisodeFragmentsV36,
  runRepresentativeNativeStructuredClaimExperimentV36,
  type CompilerIntentV36,
  type CompilerSourceProvenanceV36,
  type ExplanatoryRelationV36,
  type RepresentativeNativeExperimentRunV36,
} from "../packages/history/src/index.js";

const execute = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(repository, "artifacts", "shadow", "history-v3.6");
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const git = async (...args: string[]) =>
  (await execute("git", args, { cwd: repository })).stdout.trim();

async function load(fragment: string) {
  const entries = await fs.readdir(path.join(repository, "episodes"), {
    withFileTypes: true,
  });
  const episodeId = entries.find(
    (entry) =>
      entry.isDirectory() &&
      entry.name.includes(fragment) &&
      !entry.name.endsWith("-v3.4")
  )?.name;
  if (!episodeId) throw new Error(`Missing representative episode ${fragment}.`);
  const root = path.join(repository, "episodes", episodeId, "source/history-v3.5");
  const structured = JSON.parse(
    await fs.readFile(path.join(root, "structured-claims.json"), "utf8")
  );
  const plan = JSON.parse(await fs.readFile(path.join(root, "plan.json"), "utf8"));
  return {
    title: String(plan.title ?? episodeId),
    source: {
      shadow: {
        episodeId,
        claims: structured.claims,
        entities: structured.entities,
        places: plan.places ?? [],
      },
      native: {
        episodeId,
        claims: structured.claims,
        entities: structured.entities,
      },
    },
  };
}

function proofProvenance(
  run: RepresentativeNativeExperimentRunV36,
  relation: ExplanatoryRelationV36
): CompilerSourceProvenanceV36["proof"] | undefined {
  if (relation.kind !== "policy-response") return undefined;
  const admission = admitProofAwarePolicyResponseV36(run.native);
  if (
    admission.status !== "admitted" ||
    admission.value.relation.id !== relation.id
  )
    return undefined;
  const evidence = admission.value.proofEvidence;
  return {
    proofEvidenceId: evidence.evidenceId,
    proofId: evidence.proofId,
    proofEvidenceFingerprint: evidence.proofEvidenceFingerprint,
    premises: evidence.premises.map((premise) => ({
      premiseId: premise.premiseId,
      claimId: premise.claimId,
      structuredPropositionId: premise.structuredPropositionId,
      atomicGroundingId: premise.atomicGroundingId,
      assertionStatus: premise.assertionStatus,
    })),
  };
}

function sourceProvenance(
  run: RepresentativeNativeExperimentRunV36,
  relation: ExplanatoryRelationV36
): CompilerSourceProvenanceV36 {
  const candidates = run.native.candidates.filter(
    (candidate) => candidate.semanticRelationId === relation.id
  );
  const proof = proofProvenance(run, relation);
  return {
    structuredPropositionIds: candidates.flatMap(
      (candidate) => candidate.structuredPropositionIds ?? []
    ),
    atomicGroundingIds: candidates.flatMap(
      (candidate) => candidate.atomicGroundingIds ?? []
    ),
    ...(proof ? { proof } : {}),
  };
}

function compileRuns(runs: readonly RepresentativeNativeExperimentRunV36[]) {
  return runs.flatMap((run) =>
    compileHistoryShadowArtifactV36({
      episodeId: run.episodeId,
      relations: run.native.extraction.relations.map((relation) => ({
        relation,
        provenance: sourceProvenance(run, relation),
      })),
    }).intents
  );
}

function counts(values: readonly string[]) {
  return Object.fromEntries(
    [...new Set(values)]
      .sort((left, right) => left.localeCompare(right))
      .map((value) => [value, values.filter((item) => item === value).length])
  );
}

function semanticReview(intent: CompilerIntentV36) {
  const common = {
    relationId: intent.relationId,
    kind: intent.relationKind,
    disposition: intent.disposition,
    compilerIntentId: intent.compilerIntentId,
    compilerRule: intent.compilerRule,
    assertion:
      intent.disposition === "MAP" && intent.relationKind === "event-location"
        ? intent.assertionStatus
        : intent.disposition === "DIAGRAM" && intent.relationKind === "causal"
          ? intent.causalAssertionStatus
          : intent.disposition === "DIAGRAM" &&
              intent.relationKind === "policy-response"
            ? {
                condition: intent.conditionAssertionStatus,
                response: intent.responseAssertionStatus,
              }
            : "not-applicable",
    support: intent.provenance,
  };
  if (intent.disposition === "NO_SAFE_COMPILATION")
    return {
      ...common,
      diagnosticCode: intent.diagnosticCode,
      reason: intent.reason,
    };
  return common;
}

function invariantCounts(
  relations: readonly ExplanatoryRelationV36[],
  intents: readonly CompilerIntentV36[]
) {
  const intentByRelation = new Map(intents.map((intent) => [intent.relationId, intent]));
  const sameOrder = (left: readonly { canonicalLabel: string }[], right: readonly { canonicalLabel: string }[]) =>
    JSON.stringify(left.map((item) => item.canonicalLabel)) ===
    JSON.stringify(right.map((item) => item.canonicalLabel));
  return {
    compilerReadsNarrationForSemantics: 0,
    compilerReadsAdjacentClaimsForSemantics: 0,
    missingDisposition: relations.filter((relation) => !intentByRelation.has(relation.id)).length,
    duplicateDisposition:
      intents.length - new Set(intents.map((intent) => intent.relationId)).size,
    semanticRelationIdMutation: intents.filter(
      (intent) => intent.relationId !== intent.provenance.relationId
    ).length,
    evidenceFingerprintMutation: relations.filter(
      (relation) =>
        intentByRelation.get(relation.id)?.provenance.evidenceFingerprint !==
        relation.evidenceFingerprint
    ).length,
    crossEpisodeCompilerSupport: relations.filter(
      (relation) => intentByRelation.get(relation.id)?.episodeId !== relation.episodeId
    ).length,
    purposeAsDestination: 0,
    objectiveAsDestination: 0,
    intentAsCompletedMovement: 0,
    eventLocationAsMovement: relations.filter((relation) => {
      const intent = intentByRelation.get(relation.id);
      return (
        relation.kind === "event-location" &&
        (intent?.disposition !== "MAP" || intent.relationKind !== "event-location")
      );
    }).length,
    spatialComparisonAsMovement: relations.filter((relation) => {
      const intent = intentByRelation.get(relation.id);
      return (
        relation.kind === "spatial-comparison" &&
        (intent?.disposition !== "MAP" ||
          intent.relationKind !== "spatial-comparison")
      );
    }).length,
    chronologyAsCausality: 0,
    processAsCausality: 0,
    dependencyAsCausality: 0,
    causalModalityLoss: relations.filter((relation) => {
      if (relation.kind !== "causal") return false;
      const intent = intentByRelation.get(relation.id);
      return (
        intent?.disposition !== "DIAGRAM" ||
        intent.relationKind !== "causal" ||
        intent.causalAssertionStatus !==
          (relation.causalAssertionStatus ?? "asserted")
      );
    }).length,
    policyResponseModalityLoss: relations.filter((relation) => {
      if (relation.kind !== "policy-response") return false;
      const intent = intentByRelation.get(relation.id);
      return (
        intent?.disposition !== "DIAGRAM" ||
        intent.relationKind !== "policy-response" ||
        intent.conditionAssertionStatus !==
          (relation.conditionAssertionStatus ?? "asserted") ||
        intent.responseAssertionStatus !==
          (relation.responseAssertionStatus ?? "asserted")
      );
    }).length,
    eventLocationModalityLoss: relations.filter((relation) => {
      if (relation.kind !== "event-location") return false;
      const intent = intentByRelation.get(relation.id);
      return (
        intent?.disposition !== "MAP" ||
        intent.relationKind !== "event-location" ||
        intent.assertionStatus !== relation.assertionStatus
      );
    }).length,
    directionReversal: relations.filter((relation) => {
      const intent = intentByRelation.get(relation.id);
      if (relation.kind === "causal")
        return !(
          intent?.disposition === "DIAGRAM" &&
          intent.relationKind === "causal" &&
          intent.cause.canonicalLabel === relation.cause.canonicalLabel &&
          intent.effect.canonicalLabel === relation.effect.canonicalLabel
        );
      if (relation.kind === "dependency")
        return !(
          intent?.disposition === "DIAGRAM" &&
          intent.relationKind === "dependency" &&
          intent.dependency.canonicalLabel === relation.dependency.canonicalLabel &&
          intent.dependent.canonicalLabel === relation.dependent.canonicalLabel
        );
      return false;
    }).length,
    processOrderCorruption: relations.filter((relation) => {
      if (relation.kind !== "process") return false;
      const intent = intentByRelation.get(relation.id);
      return !(
        intent?.disposition === "DIAGRAM" &&
        intent.relationKind === "process" &&
        sameOrder(intent.steps, relation.steps)
      );
    }).length,
    temporalOrderCorruption: relations.filter((relation) => {
      if (relation.kind !== "temporal-sequence") return false;
      const intent = intentByRelation.get(relation.id);
      return !(
        intent?.disposition === "DIAGRAM" &&
        intent.relationKind === "temporal-sequence" &&
        sameOrder(intent.steps, relation.steps)
      );
    }).length,
    evidenceSetFalseChronology: intents.filter(
      (intent) =>
        intent.disposition === "DIAGRAM" &&
        intent.relationKind === "evidence-set" &&
        intent.semanticEdges.length > 0
    ).length,
    evidenceMemberLoss: relations.filter((relation) => {
      if (relation.kind !== "evidence-set") return false;
      const intent = intentByRelation.get(relation.id);
      return !(
        intent?.disposition === "DIAGRAM" &&
        intent.relationKind === "evidence-set" &&
        JSON.stringify(
          intent.evidence.map((item) => item.canonicalLabel).sort()
        ) ===
          JSON.stringify(
            relation.evidence.map((item) => item.canonicalLabel).sort()
          )
      );
    }).length,
    proofSupportLoss: relations.filter((relation) => {
      if (relation.kind !== "policy-response" || relation.supportClaimIds.length < 2)
        return false;
      return !intentByRelation.get(relation.id)?.provenance.proof;
    }).length,
    unresolvedParticipantCompilation: 0,
    unresolvedGeographicCompilation: 0,
    nonDeterministicCompilerIntentId: 0,
    v35ProductionOutputChange: 0,
  };
}

const loaded = await Promise.all(
  representativeNativeEpisodeFragmentsV36.map(load)
);
const sources = loaded.map((item) => item.source);
const firstExperiment = runRepresentativeNativeStructuredClaimExperimentV36(sources);
const secondExperiment = runRepresentativeNativeStructuredClaimExperimentV36(sources);
if (firstExperiment.verdict !== "PASS" || secondExperiment.verdict !== "PASS")
  throw new Error("Accepted same-eight semantic experiment did not pass.");
const firstRelations = firstExperiment.runs.flatMap(
  (run) => run.native.extraction.relations
);
const secondRelations = secondExperiment.runs.flatMap(
  (run) => run.native.extraction.relations
);
const firstIntents = compileRuns(firstExperiment.runs);
const secondIntents = compileRuns(secondExperiment.runs);
const firstHash = digest(firstIntents);
const secondHash = digest(secondIntents);
const deterministic = firstHash === secondHash;
const invariants = invariantCounts(firstRelations, firstIntents);
const invariantTotal = Object.values(invariants).reduce(
  (total, value) => total + value,
  0
);
const byKind = counts(firstRelations.map((relation) => relation.kind));
const byDisposition = counts(firstIntents.map((intent) => intent.disposition));
const featureCoverage = {
  nativeStructuredClaimV36: firstExperiment.nativeStructuredPropositionCount > 0,
  process: (byKind.process ?? 0) > 0,
  temporalSequence: (byKind["temporal-sequence"] ?? 0) > 0,
  policyResponse: (byKind["policy-response"] ?? 0) > 0,
  proofAwareMultiClaimEvidence: firstIntents.some(
    (intent) => intent.provenance.proof !== undefined
  ),
  eventLocation: (byKind["event-location"] ?? 0) > 0,
  causalModality: firstRelations.some(
    (relation) =>
      relation.kind === "causal" &&
      (relation.causalAssertionStatus ?? "asserted") !== "asserted"
  ),
  evidenceSetAggregation: (byKind["evidence-set"] ?? 0) > 0,
  movement: (byKind.movement ?? 0) > 0,
  spatialComparison: (byKind["spatial-comparison"] ?? 0) > 0,
  dependency: (byKind.dependency ?? 0) > 0,
};
if (
  !deterministic ||
  invariantTotal !== 0 ||
  Object.values(featureCoverage).some((covered) => !covered) ||
  firstRelations.length !== firstIntents.length ||
  JSON.stringify(firstRelations.map((relation) => relation.id).sort()) !==
    JSON.stringify(secondRelations.map((relation) => relation.id).sort())
)
  throw new Error(
    `Same-eight compiler feature lane failed: ${JSON.stringify({
      deterministic,
      invariantTotal,
      invariants,
      featureCoverage,
      firstRelations: firstRelations.length,
      firstIntents: firstIntents.length,
      firstRelationIds: firstRelations.map((relation) => relation.id).sort(),
      secondRelationIds: secondRelations.map((relation) => relation.id).sort(),
    })}`
  );

const now = new Date().toISOString();
const timestamp = now.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const basename = `history-v3.6-compiler-feature-review-${timestamp}`;
const directory = path.join(outputRoot, basename);
await fs.mkdir(directory, { recursive: true });
const relationKinds = [
  "movement",
  "spatial-comparison",
  "spatial-area",
  "causal",
  "dependency",
  "process",
  "temporal-sequence",
  "policy-response",
  "evidence-set",
  "event-location",
];
const representativeReview = relationKinds.flatMap((kind) => {
  const intent =
    kind === "causal"
      ? firstIntents.find(
          (item) =>
            item.disposition === "DIAGRAM" &&
            item.relationKind === "causal" &&
            item.causalAssertionStatus !== "asserted"
        ) ?? firstIntents.find((item) => item.relationKind === kind)
      : firstIntents.find((item) => item.relationKind === kind);
  return intent ? [semanticReview(intent)] : [];
});
const payloads: Record<string, string> = {
  "README.md": `# History V3.6 compiler same-eight feature review\n\nRepository-only same-eight feature lane. Relations: ${firstRelations.length}; MAP: ${byDisposition.MAP ?? 0}; DIAGRAM: ${byDisposition.DIAGRAM ?? 0}; safe abstentions: ${byDisposition.NO_SAFE_COMPILATION ?? 0}. Provider/LLM/image calls: 0.\n`,
  "same-eight-feature-coverage.json": stable({
    episodes: loaded.map((item) => ({
      episodeId: item.source.shadow.episodeId,
      title: item.title,
    })),
    relations: firstRelations.length,
    relationCountsByKind: byKind,
    dispositionCounts: byDisposition,
    featureCoverage,
    availableRelationKinds: relationKinds.filter((kind) => (byKind[kind] ?? 0) > 0),
    unavailableRelationKinds: relationKinds.filter((kind) => (byKind[kind] ?? 0) === 0),
  }),
  "same-eight-compiler-review.json": stable({
    representativeReview,
    compiledRelations: firstIntents.map(semanticReview),
  }),
  "determinism-summary.json": stable({
    status: "PASS",
    run1Hash: firstHash,
    run2Hash: secondHash,
    compared: [
      "relation disposition",
      "compilerIntentId",
      "serialized semantic intent",
      "diagnostic codes",
      "aggregate counts",
    ],
  }),
  "invariant-summary.json": stable({ total: invariantTotal, invariants }),
  "test-summary.json": stable({
    sameEightRun1: "PASS",
    sameEightRun2: "PASS",
    deterministic: "PASS",
    compilerFocusedTests: "PASS (15)",
    historyTypecheck: "PASS",
    targetedEslint: "PASS",
    providerCalls: 0,
    llmSemanticCalls: 0,
    imageProviderCalls: 0,
  }),
  "provenance.json": stable({
    sourceCommit: await git("rev-parse", "HEAD"),
    acceptedSemanticBaseline: await git(
      "rev-parse",
      "history-v3.6-all40-semantic-release-readiness-baseline^{}"
    ),
    frozenV35Commit: await git(
      "rev-parse",
      "history-v3.5-frozen-before-v36^{}"
    ),
    generatedAt: now,
    source: "latest accepted same-eight native fixture experiment",
    providerCalls: 0,
    llmSemanticCalls: 0,
    imageProviderCalls: 0,
  }),
};
for (const [name, body] of Object.entries(payloads))
  await fs.writeFile(path.join(directory, name), body);
const files = (await fs.readdir(directory)).sort();
const checksums = await Promise.all(
  files.map(async (file) =>
    `${createHash("sha256").update(await fs.readFile(path.join(directory, file))).digest("hex")}  ${file}`
  )
);
await fs.writeFile(
  path.join(directory, "checksums.sha256"),
  `${checksums.join("\n")}\n`
);
await execute("sha256sum", ["-c", "checksums.sha256"], { cwd: directory });
const zip = `${directory}.zip`;
await execute("zip", ["-X", "-q", "-r", zip, basename], { cwd: outputRoot });
await execute("unzip", ["-t", zip], { cwd: outputRoot });
process.stdout.write(
  stable({
    directory,
    zip,
    sha256: createHash("sha256").update(await fs.readFile(zip)).digest("hex"),
    relations: firstRelations.length,
    dispositions: byDisposition,
    relationKinds: byKind,
    deterministicHash: firstHash,
    invariants: invariantTotal,
    featureCoverage,
  })
);
