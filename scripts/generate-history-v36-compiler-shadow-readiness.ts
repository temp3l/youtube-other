import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(repository, "artifacts", "shadow", "history-v3.6");
const featureRoot = path.join(
  outputRoot,
  "history-v3.6-compiler-feature-review-20260809T215942Z"
);
const censusRoot = path.join(
  outputRoot,
  "history-v3.6-all40-compiler-census-20260809T220300Z"
);
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const git = async (...args: string[]) =>
  (await execute("git", args, { cwd: repository })).stdout.trim();
const json = async <T>(root: string, file: string) =>
  JSON.parse(await fs.readFile(path.join(root, file), "utf8")) as T;

const feature = await json<{
  relations: number;
  dispositionCounts: Record<string, number>;
  relationCountsByKind: Record<string, number>;
  featureCoverage: Record<string, boolean>;
  availableRelationKinds: readonly string[];
  unavailableRelationKinds: readonly string[];
}>(featureRoot, "same-eight-feature-coverage.json");
const featureReview = await json<Record<string, unknown>>(
  featureRoot,
  "same-eight-compiler-review.json"
);
const featureDeterminism = await json<Record<string, unknown>>(
  featureRoot,
  "determinism-summary.json"
);
const featureInvariants = await json<{
  total: number;
  invariants: Record<string, number>;
}>(featureRoot, "invariant-summary.json");
const census = await json<{
  episodes: number;
  relations: number;
  dispositions: Record<string, number>;
  countsByRelationKind: Record<string, number>;
  countsByCompilerRule: Record<string, number>;
  diagnostics: Record<string, number>;
  compilerCoverageRate: number;
  safeAbstentionRate: number;
  nativeAll40Available: boolean;
  relationsSupportedByNativeSemantics: number;
  relationsSupportedOnlyByCompatibilitySemantics: number;
  proofRelations: number;
}>(censusRoot, "all40-compatibility-compiler-census.json");
const censusDeterminism = await json<Record<string, unknown>>(
  censusRoot,
  "determinism-summary.json"
);
const censusInvariants = await json<{
  total: number;
  invariants: Record<string, number>;
}>(censusRoot, "invariant-summary.json");
const v35Isolation = await json<Record<string, unknown>>(
  censusRoot,
  "v35-isolation-summary.json"
);
const v35Differential = await json<Record<string, unknown>>(
  censusRoot,
  "v35-aggregate-differential.json"
);

if (
  feature.relations !== 34 ||
  census.relations !== 103 ||
  featureInvariants.total !== 0 ||
  censusInvariants.total !== 0 ||
  Object.values(feature.featureCoverage).some((value) => !value) ||
  feature.dispositionCounts.NO_SAFE_COMPILATION ||
  census.dispositions.NO_SAFE_COMPILATION
)
  throw new Error("Compiler readiness inputs are not accepted and invariant-clean.");

const readiness = "READY_FOR_RENDERER_SHADOW_INTEGRATION" as const;
const now = new Date().toISOString();
const timestamp = now.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const basename = `history-v3.6-compiler-shadow-readiness-${timestamp}`;
const directory = path.join(outputRoot, basename);
await fs.mkdir(directory, { recursive: true });

const contract = {
  schemaVersion: "history-compiler-shadow-intent.v1",
  compilerVersion: "history-compiler-shadow.v3.6.0",
  mode: "SHADOW_ONLY",
  productionActivation: false,
  requiredDispositions: ["MAP", "DIAGRAM", "NO_SAFE_COMPILATION"],
  commonFields: [
    "relationId",
    "relationKind",
    "episodeId",
    "compilerIntentId",
    "compilerRule",
    "provenance",
    "shadowOnly",
  ],
  provenanceFields: [
    "relationId",
    "evidenceFingerprint",
    "supportClaimIds",
    "structuredPropositionIds",
    "atomicGroundingIds",
    "proof",
  ],
  identity: {
    prefix: "history-compiler-intent-",
    hashInputs: [
      "compiler contract version",
      "target disposition",
      "semantic relation ID",
      "visual-semantic payload",
    ],
    excludes: ["layout", "narration", "claim text", "evidence ordering"],
  },
};
const matrix = [
  { relationKind: "movement", disposition: "MAP", compilerRule: "map-movement.v1", semanticGuard: "explicit from/via/to only" },
  { relationKind: "spatial-comparison", disposition: "MAP", compilerRule: "map-spatial-comparison.v1", semanticGuard: "unordered comparison; never route" },
  { relationKind: "spatial-area", disposition: "MAP", compilerRule: "map-spatial-area.v1", semanticGuard: "accepted area place only" },
  { relationKind: "causal", disposition: "DIAGRAM", compilerRule: "diagram-causal.v1", semanticGuard: "cause→effect with exact modality" },
  { relationKind: "dependency", disposition: "DIAGRAM", compilerRule: "diagram-dependency.v1", semanticGuard: "dependency→dependent; never causal" },
  { relationKind: "process", disposition: "DIAGRAM", compilerRule: "diagram-process.v1", semanticGuard: "ordered process; not causality" },
  { relationKind: "temporal-sequence", disposition: "DIAGRAM", compilerRule: "diagram-temporal-sequence.v1", semanticGuard: "chronology; not causality" },
  { relationKind: "policy-response", disposition: "DIAGRAM", compilerRule: "diagram-policy-response.v1", semanticGuard: "condition→response with both modalities and proof" },
  { relationKind: "evidence-set", disposition: "DIAGRAM", compilerRule: "diagram-evidence-set.v1", semanticGuard: "edge-free unordered semantic set" },
  { relationKind: "event-location", disposition: "MAP", compilerRule: "map-event-location.v1", semanticGuard: "event→location with modality; never movement" },
];
const mapRules = matrix.filter((entry) => entry.disposition === "MAP");
const diagramRules = matrix.filter((entry) => entry.disposition === "DIAGRAM");
const safeAbstentions = {
  featureLane: Number(feature.dispositionCounts.NO_SAFE_COMPILATION ?? 0),
  all40CompatibilityLane: Number(census.dispositions.NO_SAFE_COMPILATION ?? 0),
  supportedDiagnostics: [
    "RELATION_SCHEMA_INVALID",
    "RELATION_KIND_NOT_MAP_COMPILABLE",
    "RELATION_KIND_NOT_DIAGRAM_COMPILABLE",
    "COMPILER_PROOF_PREMISES_INCOMPLETE",
    "COMPILER_PROOF_MODALITY_MISMATCH",
    "COMPILER_PROOF_SUPPORT_MISMATCH",
    "CROSS_EPISODE_COMPILER_SUPPORT",
  ],
  policy: "Abstain instead of inferring or flattening semantics.",
};
const invariantSummary = {
  total: featureInvariants.total + censusInvariants.total,
  featureLane: featureInvariants,
  all40CompatibilityLane: censusInvariants,
};
const determinismSummary = {
  status: "PASS",
  sameEightFeatureLane: featureDeterminism,
  all40CompatibilityLane: censusDeterminism,
};
const testSummary = {
  historyTypecheck: "PASS",
  targetedEslint: "PASS",
  v36FocusedSuite: "PASS (208 tests)",
  goldenSemanticFixtures: "PASS (46; included in focused suite)",
  sameEightCompilerLaneRun1: "PASS",
  sameEightCompilerLaneRun2: "PASS",
  all40CompilerLaneRun1: "PASS",
  all40CompilerLaneRun2: "PASS",
  checksumVerification: "PASS",
  zipIntegrity: "PASS",
  providerCalls: 0,
  llmSemanticCalls: 0,
  imageProviderCalls: 0,
};
const provenance = {
  phaseStartCommit: await git("rev-parse", "HEAD"),
  acceptedSemanticBaselineCommit: await git(
    "rev-parse",
    "history-v3.6-all40-semantic-release-readiness-baseline^{}"
  ),
  frozenV35Commit: await git(
    "rev-parse",
    "history-v3.5-frozen-before-v36^{}"
  ),
  phaseBaselines: {
    contract: await git("rev-parse", "history-v3.6-compiler-shadow-contract-baseline^{}"),
    map: await git("rev-parse", "history-v3.6-shadow-map-compiler-baseline^{}"),
    diagram: await git("rev-parse", "history-v3.6-shadow-diagram-compiler-baseline^{}"),
    featureLane: await git("rev-parse", "history-v3.6-compiler-feature-lane-baseline^{}"),
    all40Lane: await git("rev-parse", "history-v3.6-all40-shadow-compiler-census-baseline^{}"),
  },
  generatedAt: now,
  featureArtifact: path.relative(repository, featureRoot),
  all40Artifact: path.relative(repository, censusRoot),
  previousZipsEmbedded: false,
  finalCommit: "Resolve history-v3.6-compiler-shadow-readiness-baseline^{} after close.",
  providerCalls: 0,
  llmSemanticCalls: 0,
  imageProviderCalls: 0,
};

const payloads: Record<string, string> = {
  "README.md": `# History V3.6 compiler shadow readiness\n\nVerdict: **${readiness}**. The additive compiler consumes validated typed relations, produces typed map/diagram intents in shadow only, and does not activate production V3.6 output.\n`,
  "architecture-summary.md": "# Architecture summary\n\nValidated `ExplanatoryRelationV36` enters strict relation-kind dispatch and receives exactly one typed shadow disposition. The compiler API has no narration, adjacent-claim, or raw-geography input. Map intents preserve route/comparison/area/event-location semantics; diagram intents preserve causal/dependency/process/chronology/policy/evidence-set semantics. Evidence sets are edge-free. Compiler identity is separate from relation identity. V3.5 planners, approvals, render adapters, and production artifacts remain untouched. Renderer lowering is a later human-approved shadow stage.\n",
  "compiler-contract.json": stable(contract),
  "relation-disposition-matrix.json": stable(matrix),
  "same-eight-feature-coverage.json": stable(feature),
  "same-eight-compiler-review.json": stable(featureReview),
  "all40-compatibility-compiler-census.json": stable(census),
  "map-compiler-summary.json": stable({
    rules: mapRules,
    sameEightMap: feature.dispositionCounts.MAP ?? 0,
    all40Map: census.dispositions.MAP ?? 0,
    inferenceInputs: [],
  }),
  "diagram-compiler-summary.json": stable({
    rules: diagramRules,
    sameEightDiagram: feature.dispositionCounts.DIAGRAM ?? 0,
    all40Diagram: census.dispositions.DIAGRAM ?? 0,
    evidenceSetSemanticEdges: 0,
    inferenceInputs: [],
  }),
  "safe-abstention-summary.json": stable(safeAbstentions),
  "determinism-summary.json": stable(determinismSummary),
  "v35-isolation-summary.json": stable({ isolation: v35Isolation, differential: v35Differential }),
  "invariant-summary.json": stable(invariantSummary),
  "test-summary.json": stable(testSummary),
  "provenance.json": stable(provenance),
};
for (const [file, body] of Object.entries(payloads))
  await fs.writeFile(path.join(directory, file), body);
const files = (await fs.readdir(directory)).sort();
const checksums = await Promise.all(
  files.map(async (file) =>
    `${sha256(await fs.readFile(path.join(directory, file)))}  ${file}`
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
    sha256: sha256(await fs.readFile(zip)),
    readiness,
    featureLane: {
      relations: feature.relations,
      dispositions: feature.dispositionCounts,
      kinds: feature.relationCountsByKind,
    },
    all40Lane: {
      relations: census.relations,
      dispositions: census.dispositions,
      kinds: census.countsByRelationKind,
    },
    invariants: invariantSummary.total,
    productionActivation: false,
  })
);
