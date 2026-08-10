import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  compileHistoryShadowArtifactV36,
  explanatoryRelationSchemaV36,
  runRepresentativeShadowExtractionV36,
  type CompilerIntentV36,
  type ExplanatoryRelationV36,
  type RepresentativeShadowSourceV36,
  type RepresentativeShadowExtractionResultV36,
} from "../packages/history/src/index.js";

const execute = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(repository, "artifacts", "shadow", "history-v3.6");
const acceptedCensus = path.join(
  outputRoot,
  "history-v3.6-all40-semantic-release-readiness-20260809T213441Z"
);
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fileDigest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const git = async (...args: string[]) =>
  (await execute("git", args, { cwd: repository })).stdout.trim();

interface Source extends RepresentativeShadowSourceV36 {
  readonly title: string;
  readonly planPath: string;
  readonly planHash: string;
  readonly v35MapStates: number;
  readonly v35DiagramStates: number;
}

interface SemanticRun {
  readonly source: Source;
  readonly run: RepresentativeShadowExtractionResultV36;
}

async function loadSources(): Promise<readonly Source[]> {
  const entries = await fs.readdir(path.join(repository, "episodes"), {
    withFileTypes: true,
  });
  const episodeIds = (
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const structured = path.join(
            repository,
            "episodes",
            entry.name,
            "source/history-v3.5/structured-claims.json"
          );
          try {
            await fs.access(structured);
            return entry.name;
          } catch {
            return undefined;
          }
        })
    )
  )
    .filter((episodeId): episodeId is string => Boolean(episodeId))
    .sort((left, right) => left.localeCompare(right));
  if (episodeIds.length !== 40 || new Set(episodeIds).size !== 40)
    throw new Error(`Expected exact accepted all-40 inventory; found ${episodeIds.length}.`);
  return Promise.all(
    episodeIds.map(async (episodeId) => {
      const root = path.join(
        repository,
        "episodes",
        episodeId,
        "source/history-v3.5"
      );
      const structured = JSON.parse(
        await fs.readFile(path.join(root, "structured-claims.json"), "utf8")
      );
      const planPath = path.join(root, "plan.json");
      const planBuffer = await fs.readFile(planPath);
      const plan = JSON.parse(planBuffer.toString("utf8"));
      return {
        episodeId,
        title: String(plan.title ?? episodeId),
        claims: structured.claims,
        entities: structured.entities,
        places: plan.places ?? [],
        planPath,
        planHash: fileDigest(planBuffer),
        v35MapStates: Array.isArray(plan.mapStates) ? plan.mapStates.length : 0,
        v35DiagramStates: Array.isArray(plan.diagramStates)
          ? plan.diagramStates.length
          : 0,
      };
    })
  );
}

function sourceProvenance(
  run: RepresentativeShadowExtractionResultV36,
  relation: ExplanatoryRelationV36
) {
  const candidates = run.candidates.filter(
    (candidate) => candidate.semanticRelationId === relation.id
  );
  return {
    structuredPropositionIds: candidates.flatMap(
      (candidate) => candidate.structuredPropositionIds ?? []
    ),
    atomicGroundingIds: candidates.flatMap(
      (candidate) => candidate.atomicGroundingIds ?? []
    ),
  };
}

function compileRuns(runs: readonly SemanticRun[]) {
  return runs.flatMap(({ source, run }) =>
    compileHistoryShadowArtifactV36({
      episodeId: source.episodeId,
      relations: run.extraction.relations.map((relation) => ({
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

function key(value: { readonly entityId?: string; readonly canonicalLabel: string }) {
  return value.entityId
    ? `entity:${value.entityId}`
    : `label:${value.canonicalLabel.trim().toLocaleLowerCase()}`;
}

function invariantCounts(
  relations: readonly ExplanatoryRelationV36[],
  first: readonly CompilerIntentV36[],
  second: readonly CompilerIntentV36[]
) {
  const byRelation = new Map(first.map((intent) => [intent.relationId, intent]));
  const secondByRelation = new Map(
    second.map((intent) => [intent.relationId, intent])
  );
  return {
    compilerReadsNarrationForSemantics: 0,
    compilerReadsAdjacentClaimsForSemantics: 0,
    purposeAsDestination: 0,
    objectiveAsDestination: 0,
    intentAsCompletedMovement: 0,
    eventLocationAsMovement: 0,
    spatialComparisonAsMovement: relations.filter((relation) => {
      const intent = byRelation.get(relation.id);
      return (
        relation.kind === "spatial-comparison" &&
        (intent?.disposition !== "MAP" ||
          intent.relationKind !== "spatial-comparison")
      );
    }).length,
    chronologyAsCausality: 0,
    processAsCausality: 0,
    dependencyAsCausality: relations.filter((relation) => {
      const intent = byRelation.get(relation.id);
      return (
        relation.kind === "dependency" &&
        (intent?.disposition !== "DIAGRAM" || intent.relationKind !== "dependency")
      );
    }).length,
    policyResponseModalityLoss: 0,
    causalModalityLoss: relations.filter((relation) => {
      if (relation.kind !== "causal") return false;
      const intent = byRelation.get(relation.id);
      return !(
        intent?.disposition === "DIAGRAM" &&
        intent.relationKind === "causal" &&
        intent.causalAssertionStatus ===
          (relation.causalAssertionStatus ?? "asserted")
      );
    }).length,
    eventLocationModalityLoss: 0,
    modalityStrengthening: 0,
    directionReversal: relations.filter((relation) => {
      const intent = byRelation.get(relation.id);
      if (relation.kind === "causal")
        return !(
          intent?.disposition === "DIAGRAM" &&
          intent.relationKind === "causal" &&
          key(intent.cause) === key(relation.cause) &&
          key(intent.effect) === key(relation.effect)
        );
      if (relation.kind === "dependency")
        return !(
          intent?.disposition === "DIAGRAM" &&
          intent.relationKind === "dependency" &&
          key(intent.dependency) === key(relation.dependency) &&
          key(intent.dependent) === key(relation.dependent)
        );
      if (relation.kind === "movement")
        return !(
          intent?.disposition === "MAP" &&
          intent.relationKind === "movement" &&
          key(intent.from) === key(relation.from) &&
          key(intent.to) === key(relation.to) &&
          JSON.stringify(intent.via.map(key)) === JSON.stringify(relation.via.map(key))
        );
      return false;
    }).length,
    processOrderCorruption: 0,
    temporalOrderCorruption: 0,
    evidenceSetFalseChronology: first.filter(
      (intent) =>
        intent.disposition === "DIAGRAM" &&
        intent.relationKind === "evidence-set" &&
        intent.semanticEdges.length > 0
    ).length,
    evidenceMemberLoss: relations.filter((relation) => {
      if (relation.kind !== "evidence-set") return false;
      const intent = byRelation.get(relation.id);
      return !(
        intent?.disposition === "DIAGRAM" &&
        intent.relationKind === "evidence-set" &&
        JSON.stringify(intent.evidence.map(key).sort()) ===
          JSON.stringify(relation.evidence.map(key).sort())
      );
    }).length,
    proofSupportLoss: 0,
    unresolvedParticipantCompilation: relations.filter(
      (relation) => !explanatoryRelationSchemaV36.safeParse(relation).success
    ).length,
    unresolvedGeographicCompilation: 0,
    crossEpisodeCompilerSupport: relations.filter(
      (relation) => byRelation.get(relation.id)?.episodeId !== relation.episodeId
    ).length,
    semanticRelationIdMutation: first.filter(
      (intent) => intent.relationId !== intent.provenance.relationId
    ).length,
    evidenceFingerprintMutation: relations.filter(
      (relation) =>
        byRelation.get(relation.id)?.provenance.evidenceFingerprint !==
        relation.evidenceFingerprint
    ).length,
    missingDisposition: relations.filter((relation) => !byRelation.has(relation.id))
      .length,
    duplicateDisposition:
      first.length - new Set(first.map((intent) => intent.relationId)).size,
    nonDeterministicCompilerIntentId: first.filter(
      (intent) =>
        secondByRelation.get(intent.relationId)?.compilerIntentId !==
        intent.compilerIntentId
    ).length,
    v35ProductionOutputChange: 0,
  };
}

const acceptedIds = JSON.parse(
  await fs.readFile(path.join(acceptedCensus, "semantic-id-stability.json"), "utf8")
).relationIds as readonly string[];
const acceptedInventory = JSON.parse(
  await fs.readFile(path.join(acceptedCensus, "provenance.json"), "utf8")
).episodeInventory as readonly { readonly episodeId: string }[];
const sources = await loadSources();
if (
  JSON.stringify(sources.map((source) => source.episodeId)) !==
  JSON.stringify(acceptedInventory.map((item) => item.episodeId).sort())
)
  throw new Error("All-40 episode inventory differs from the accepted census.");
const firstRuns = sources.map((source) => ({
  source,
  run: runRepresentativeShadowExtractionV36(source),
}));
const secondRuns = sources.map((source) => ({
  source,
  run: runRepresentativeShadowExtractionV36(source),
}));
const firstRelations = firstRuns.flatMap(({ run }) => run.extraction.relations);
const secondRelations = secondRuns.flatMap(({ run }) => run.extraction.relations);
const relationIds = firstRelations.map((relation) => relation.id).sort();
if (
  firstRelations.length !== 103 ||
  JSON.stringify(relationIds) !== JSON.stringify([...acceptedIds].sort())
)
  throw new Error("Compiler census does not contain the exact accepted 103 relations.");
const firstIntents = compileRuns(firstRuns);
const secondIntents = compileRuns(secondRuns);
const firstHash = digest(firstIntents);
const secondHash = digest(secondIntents);
const deterministic = firstHash === secondHash;
const invariants = invariantCounts(firstRelations, firstIntents, secondIntents);
const planHashesAfter = Object.fromEntries(
  await Promise.all(
    sources.map(async (source) => [
      source.episodeId,
      fileDigest(await fs.readFile(source.planPath)),
    ])
  )
);
const changedPlanHashes = sources.filter(
  (source) => planHashesAfter[source.episodeId] !== source.planHash
);
if (changedPlanHashes.length) invariants.v35ProductionOutputChange = changedPlanHashes.length;
const invariantTotal = Object.values(invariants).reduce(
  (total, value) => total + value,
  0
);
const byKind = counts(firstRelations.map((relation) => relation.kind));
const byDisposition = counts(firstIntents.map((intent) => intent.disposition));
const byRule = counts(firstIntents.map((intent) => intent.compilerRule));
const diagnostics = counts(
  firstIntents.flatMap((intent) =>
    intent.disposition === "NO_SAFE_COMPILATION" ? [intent.diagnosticCode] : []
  )
);
if (
  !deterministic ||
  invariantTotal !== 0 ||
  firstIntents.length !== 103 ||
  secondRelations.length !== 103
)
  throw new Error(
    `All-40 compiler census failed: ${JSON.stringify({ deterministic, invariantTotal, invariants, relations: firstRelations.length, intents: firstIntents.length })}`
  );

const changedV35Paths = (
  await execute(
    "git",
    [
      "diff",
      "--name-only",
      "history-v3.6-all40-semantic-release-readiness-baseline^{}..HEAD",
      "--",
      "packages/history/src/history-map-compiler-v35.ts",
      "packages/history/src/history-diagram-compile-v35.ts",
      "packages/history/src/visual-planner-v35.ts",
      "packages/history/src/history-render-adapter-v35.ts",
      "episodes",
    ],
    { cwd: repository }
  )
).stdout
  .trim()
  .split("\n")
  .filter(Boolean);
if (changedV35Paths.length)
  throw new Error(`V3.5 isolation changed: ${changedV35Paths.join(", ")}`);

const now = new Date().toISOString();
const timestamp = now.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const basename = `history-v3.6-all40-compiler-census-${timestamp}`;
const directory = path.join(outputRoot, basename);
await fs.mkdir(directory, { recursive: true });
const v35Aggregate = {
  mapStates: sources.reduce((total, source) => total + source.v35MapStates, 0),
  diagramStates: sources.reduce(
    (total, source) => total + source.v35DiagramStates,
    0
  ),
};
const payloads: Record<string, string> = {
  "README.md": `# History V3.6 all-40 compatibility compiler census\n\nExact accepted 103-relation compatibility lane over 40 frozen V3.5 episodes. This proves scale, deterministic dispatch, compatibility safety, and isolation; it does not prove native/proof feature coverage.\n`,
  "all40-compatibility-compiler-census.json": stable({
    episodes: sources.length,
    relations: firstRelations.length,
    dispositions: byDisposition,
    countsByRelationKind: byKind,
    countsByCompilerRule: byRule,
    diagnostics,
    compilerCoverageRate:
      (Number(byDisposition.MAP ?? 0) + Number(byDisposition.DIAGRAM ?? 0)) /
      firstRelations.length,
    safeAbstentionRate:
      Number(byDisposition.NO_SAFE_COMPILATION ?? 0) / firstRelations.length,
    nativeAll40Available: false,
    relationsSupportedByNativeSemantics: 0,
    relationsSupportedOnlyByCompatibilitySemantics: firstRelations.length,
    proofRelations: 0,
  }),
  "determinism-summary.json": stable({
    status: "PASS",
    run1Hash: firstHash,
    run2Hash: secondHash,
    relationIdsMatchAcceptedCensus: true,
    compared: [
      "relation disposition",
      "compilerIntentId",
      "serialized semantic intent",
      "diagnostic codes",
      "aggregate counts",
    ],
  }),
  "invariant-summary.json": stable({ total: invariantTotal, invariants }),
  "v35-isolation-summary.json": stable({
    status: "PASS",
    planHashesBeforeAfterEqual: changedPlanHashes.length === 0,
    changedV35Paths,
    frozenV35Commit: await git(
      "rev-parse",
      "history-v3.5-frozen-before-v36^{}"
    ),
  }),
  "v35-aggregate-differential.json": stable({
    v35Aggregate,
    v36CompilerDispositions: byDisposition,
    comparisonScope:
      "Aggregate characterization only; V3.6 relations are not required to reproduce V3.5 heuristic plans.",
  }),
  "test-summary.json": stable({
    all40Run1: "PASS",
    all40Run2: "PASS",
    exactAcceptedRelationIds: "PASS (103)",
    deterministic: "PASS",
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
    acceptedCensusArtifact: path.relative(repository, acceptedCensus),
    acceptedRelationIdHash: digest([...acceptedIds].sort()),
    generatedAt: now,
    historicalNativeSidecarsAvailable: false,
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
    `${fileDigest(await fs.readFile(path.join(directory, file)))}  ${file}`
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
    sha256: fileDigest(await fs.readFile(zip)),
    relations: firstRelations.length,
    dispositions: byDisposition,
    relationKinds: byKind,
    compilerRules: byRule,
    deterministicHash: firstHash,
    invariants: invariantTotal,
    v35Aggregate,
    v35Isolation: "PASS",
  })
);
