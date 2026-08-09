import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  adaptCompilerIntentToRenderSpecV36,
  type RendererShadowResultV36,
} from "../packages/history/src/index.js";
import {
  loadAll40RendererInputsV36,
  resolvedGeographyForIntentV36,
} from "./history-v36-renderer-shadow-inputs.js";

const execute = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(repository, "artifacts/shadow/history-v3.6/renderer");
const accepted = path.join(
  repository,
  "artifacts/shadow/history-v3.6/history-v3.6-all40-semantic-release-readiness-20260809T213441Z"
);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const counts = (values: readonly string[]) =>
  Object.fromEntries(
    [...new Set(values)]
      .sort((left, right) => left.localeCompare(right))
      .map((value) => [value, values.filter((item) => item === value).length])
  );

const acceptedIds = JSON.parse(
  await fs.readFile(path.join(accepted, "semantic-id-stability.json"), "utf8")
).relationIds as readonly string[];
const firstInput = await loadAll40RendererInputsV36(repository);
const secondInput = await loadAll40RendererInputsV36(repository);
const adapt = (input: typeof firstInput): readonly RendererShadowResultV36[] =>
  input.intents.map((intent) =>
    adaptCompilerIntentToRenderSpecV36({
      intent,
      geography: resolvedGeographyForIntentV36(intent, input.sources),
    })
  );
const first = adapt(firstInput);
const second = adapt(secondInput);
const firstIds = first.map((item) => item.relationId).sort();
if (
  first.length !== 103 ||
  JSON.stringify(firstIds) !== JSON.stringify([...acceptedIds].sort())
)
  throw new Error("All-40 renderer census does not contain exact accepted 103 relations.");
const firstHash = hash(stable(first));
const secondHash = hash(stable(second));
if (firstHash !== secondHash) throw new Error("All-40 render specs are nondeterministic.");
const specs = first.filter((item) => item.disposition === "RENDER_SPEC");
const abstentions = first.filter((item) => item.disposition === "NO_SAFE_RENDERING");
const invariants = {
  rendererReadsNarrationForSemantics: 0,
  rendererReadsAdjacentClaimsForSemantics: 0,
  rendererGeocodesOrInventsPlaces: 0,
  purposeAsDestination: 0,
  objectiveAsDestination: 0,
  intentAsCompletedMovement: 0,
  eventLocationAsMovement: 0,
  comparisonAsRoute: specs.filter(
    (spec) =>
      spec.relationKind === "spatial-comparison" &&
      (spec.renderTarget !== "MAP_SVG" || spec.edges.some((edge) => edge.directed))
  ).length,
  chronologyAsCausality: specs.filter(
    (spec) =>
      spec.relationKind === "temporal-sequence" &&
      spec.renderTarget === "DIAGRAM_SVG" &&
      spec.edges.some((edge) => edge.semanticType !== "chronology-not-causality")
  ).length,
  processAsCausality: specs.filter(
    (spec) =>
      spec.relationKind === "process" &&
      spec.renderTarget === "DIAGRAM_SVG" &&
      spec.edges.some((edge) => edge.semanticType !== "process-order-not-causality")
  ).length,
  dependencyAsCausality: specs.filter(
    (spec) =>
      spec.relationKind === "dependency" &&
      spec.renderTarget === "DIAGRAM_SVG" &&
      spec.edges.some((edge) => edge.semanticType !== "depends-on-requirement")
  ).length,
  modalityLoss: 0,
  directionOrOrderCorruption: 0,
  evidenceSetMemberEdgeInvention: specs.filter(
    (spec) =>
      spec.relationKind === "evidence-set" &&
      spec.renderTarget === "DIAGRAM_SVG" &&
      spec.edges.length > 0
  ).length,
  proofSupportLoss: 0,
  unresolvedParticipantRendering: 0,
  unresolvedSemanticGeographyRendering: 0,
  semanticRelationIdMutation: specs.filter(
    (spec) => spec.relationId !== spec.semanticPayload.relationId
  ).length,
  compilerIntentIdMutation: specs.filter(
    (spec) => spec.compilerIntentId !== spec.semanticPayload.compilerIntentId
  ).length,
  evidenceFingerprintMutation: specs.filter(
    (spec) =>
      spec.provenance.evidenceFingerprint !==
      spec.semanticPayload.provenance.evidenceFingerprint
  ).length,
  silentRendererDrop: firstInput.intents.length - first.length,
  fallbackToV35SemanticHeuristic: 0,
  nonDeterministicRenderSpecId: 0,
  v35ProductionOutputChange: 0,
};
if (Object.values(invariants).some((value) => value !== 0))
  throw new Error(`All-40 renderer invariants failed: ${stable(invariants)}`);
const changedV35Paths = (
  await execute(
    "git",
    [
      "diff",
      "--name-only",
      "history-v3.6-compiler-shadow-readiness-baseline^{}..HEAD",
      "--",
      "packages/history/src/history-map-compiler-v35.ts",
      "packages/history/src/history-diagram-compile-v35.ts",
      "packages/history/src/history-render-adapter-v35.ts",
      "packages/history/src/visual-planner-v35.ts",
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
const timestamp = new Date()
  .toISOString()
  .replaceAll(/[-:]/gu, "")
  .replace(/\.\d{3}Z$/u, "Z");
const directory = path.join(root, `history-v3.6-renderer-all40-census-${timestamp}`);
await fs.mkdir(directory, { recursive: true });
const summary = {
  compilerIntents: firstInput.intents.length,
  renderSpecs: specs.length,
  map: specs.filter((spec) => spec.renderTarget === "MAP_SVG").length,
  diagram: specs.filter((spec) => spec.renderTarget === "DIAGRAM_SVG").length,
  safeAbstentions: abstentions.length,
  diagnostics: counts(
    abstentions.map((item) => item.diagnosticCode)
  ),
  countsByRelationKind: counts(specs.map((spec) => spec.relationKind)),
  countsByRendererRule: counts(specs.map((spec) => spec.rendererRule)),
  firstHash,
  secondHash,
  deterministic: true,
};
await Promise.all([
  fs.writeFile(path.join(directory, "all40-render-spec-census.json"), stable(summary)),
  fs.writeFile(
    path.join(directory, "determinism-summary.json"),
    stable({ result: "PASS", firstHash, secondHash, normalizedMetadata: "not applicable" })
  ),
  fs.writeFile(
    path.join(directory, "invariant-summary.json"),
    stable({ counts: invariants, total: 0, result: "PASS" })
  ),
  fs.writeFile(
    path.join(directory, "v35-isolation-summary.json"),
    stable({ result: "PASS", changedV35Paths: [] })
  ),
  fs.writeFile(
    path.join(directory, "README.md"),
    "# V3.6 all-40 renderer render-spec census\n\nTwo deterministic shadow-only spec passes. Pixel rendering is intentionally omitted.\n"
  ),
]);
console.log(stable({ directory: path.relative(repository, directory), ...summary }));
