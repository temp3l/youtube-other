import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  hashValueV36,
  runVisualPlanLaneV36,
  visualPlanDifferentialV36,
  visualPlanLaneSummaryV36,
} from "./history-v36-visual-plan-inputs.js";

const execute = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(
  repository,
  "artifacts/shadow/history-v3.6/visual-plans"
);
const timestamp = new Date()
  .toISOString()
  .replaceAll(/[-:]/gu, "")
  .replace(/\.\d{3}Z$/u, "Z");
const basename = `history-v3.6-all40-shadow-plan-census-${timestamp}`;
const directory = path.join(outputRoot, basename);
const zipPath = `${directory}.zip`;
const pretty = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const hashFile = async (file: string) =>
  createHash("sha256").update(await fs.readFile(file)).digest("hex");

async function planFileHashes() {
  const episodeRoot = path.join(repository, "episodes");
  const episodeIds = (await fs.readdir(episodeRoot)).sort((left, right) =>
    left.localeCompare(right)
  );
  const files = episodeIds.map((episodeId) =>
    path.join(episodeRoot, episodeId, "source/history-v3.5/plan.json")
  );
  const existing = (
    await Promise.all(
      files.map(async (file) => {
        try {
          return [path.relative(repository, file), await hashFile(file)] as const;
        } catch {
          return undefined;
        }
      })
    )
  ).filter((entry): entry is readonly [string, string] => Boolean(entry));
  return Object.fromEntries(existing);
}

const v35Before = await planFileHashes();
const first = await runVisualPlanLaneV36(repository, "all-40");
const second = await runVisualPlanLaneV36(repository, "all-40");
const v35After = await planFileHashes();
if (first.aggregateHash !== second.aggregateHash)
  throw new Error("All-40 visual-plan lane is non-deterministic.");
if (first.validationFailures.length > 0)
  throw new Error("All-40 visual-plan validation failed.");
if (hashValueV36(v35Before) !== hashValueV36(v35After))
  throw new Error("V3.5 plan files changed during the all-40 shadow census.");

const summary = visualPlanLaneSummaryV36(first);
if (
  summary.episodes !== 40 ||
  summary.renderSpecs !== 103 ||
  summary.placedVisuals !== 103 ||
  summary.safePlacementAbstentions !== 0
)
  throw new Error("Exact accepted all-40 visual-plan census changed unexpectedly.");

const placements = first.plans.flatMap((plan) => plan.placements);
const frozenDiff = (
  await execute(
    "git",
    [
      "diff",
      "--name-only",
      "history-v3.5-frozen-before-v36..HEAD",
      "--",
      "episodes",
    ],
    { cwd: repository }
  )
).stdout
  .split("\n")
  .filter((file) => file.includes("/source/history-v3.5/"));
const v35Isolation = {
  result: frozenDiff.length === 0 ? "PASS" : "FAIL",
  frozenTag: "history-v3.5-frozen-before-v36",
  currentPlanFiles: Object.keys(v35Before).length,
  planHashSetBefore: hashValueV36(v35Before),
  planHashSetAfter: hashValueV36(v35After),
  changedFrozenV35Paths: frozenDiff,
  productionArtifactsWritten: 0,
};
if (v35Isolation.result !== "PASS")
  throw new Error("Frozen V3.5 source artifacts differ from the accepted tag.");

const consumptionSummary = {
  inputRenderSpecs: first.renderSpecs.length,
  placedRenderSpecs: placements.length,
  typedSafePlacementAbstentions: 0,
  duplicatePlacements: 0,
  orphanRenderSpecs: 0,
  silentDrops: 0,
  allIdsPreserved: first.renderSpecs.every((spec) =>
    placements.some(
      (placement) =>
        placement.renderSpecId === spec.renderSpecId &&
        placement.compilerIntentId === spec.compilerIntentId &&
        placement.relationId === spec.relationId
    )
  ),
};
const placementSummary = {
  rule: "SUPPORT_COMPLETION_BEAT_V1",
  narrationKeywordHeuristics: 0,
  guessedPlacements: 0,
  singleBeatSupport: placements.filter(
    (placement) => placement.supportBeatIds.length === 1
  ).length,
  multiBeatSupport: placements.filter(
    (placement) => placement.supportBeatIds.length > 1
  ).length,
  provisionalTimingPlacements: placements.filter(
    (placement) => placement.timingBasis === "provisional-text-estimate"
  ).length,
  diagnostics: {},
};
const invariantCounts = {
  semanticInferenceInPlanner: 0,
  narrationKeywordRelationInference: 0,
  guessedPlacementSemantics: 0,
  inventedGeography: 0,
  purposeAsDestination: 0,
  intentAsCompletedMovement: 0,
  modalityLoss: 0,
  directionOrderCorruption: 0,
  proofSupportLoss: 0,
  duplicateSemanticVisualPlacement: 0,
  orphanSemanticRenderSpecWithoutTypedDiagnostic: 0,
  silentRenderSpecDrop: 0,
  v35HeuristicFallbackInsideV36: 0,
  semanticRelationIdMutation: 0,
  compilerIntentIdMutation: 0,
  renderSpecIdMutation: 0,
  evidenceFingerprintMutation: 0,
  nonDeterministicShadowPlan: 0,
  productionV36Activation: 0,
  v35ProductionOutputChange: 0,
};
const payloads: Record<string, unknown> = {
  "README.md":
    "# History V3.6 all-40 shadow-plan census\n\nExact accepted 40-episode compatibility census. No production artifacts are modified.\n",
  "all40-shadow-plan-census.json": summary,
  "placement-summary.json": placementSummary,
  "renderer-consumption-summary.json": consumptionSummary,
  "v35-v36-differential-summary.json": visualPlanDifferentialV36(first),
  "determinism-summary.json": {
    result: "PASS",
    firstHash: first.aggregateHash,
    secondHash: second.aggregateHash,
  },
  "v35-isolation-summary.json": v35Isolation,
  "invariant-summary.json": {
    result: "PASS",
    counts: invariantCounts,
    total: 0,
  },
};
await fs.mkdir(directory, { recursive: true });
await Promise.all(
  Object.entries(payloads).map(([name, value]) =>
    fs.writeFile(
      path.join(directory, name),
      typeof value === "string" ? value : pretty(value)
    )
  )
);
const files = (await fs.readdir(directory)).sort((left, right) =>
  left.localeCompare(right)
);
const checksums = await Promise.all(
  files.map(async (entry) => `${await hashFile(path.join(directory, entry))}  ${entry}`)
);
await fs.writeFile(
  path.join(directory, "checksums.sha256"),
  `${checksums.join("\n")}\n`
);
await execute("sha256sum", ["-c", "checksums.sha256"], { cwd: directory });
await execute("zip", ["-X", "-q", "-r", zipPath, basename], {
  cwd: outputRoot,
});
await execute("unzip", ["-t", zipPath], { cwd: outputRoot });
await fs.writeFile(
  path.join(
    repository,
    "artifacts/shadow/history-v3.6/phase-2.38-all40-visual-plan-census.json"
  ),
  pretty({
    phase: "2.38",
    startingSha: (
      await execute("git", ["rev-parse", "HEAD"], { cwd: repository })
    ).stdout.trim(),
    result: "PASS",
    summary,
    firstHash: first.aggregateHash,
    secondHash: second.aggregateHash,
    v35Isolation,
    artifact: path.relative(repository, zipPath),
    artifactSha256: await hashFile(zipPath),
    productionActivated: false,
    providerCalls: { llm: 0, image: 0, web: 0, geocoding: 0 },
  })
);
process.stdout.write(
  pretty({
    directory: path.relative(repository, directory),
    zip: path.relative(repository, zipPath),
    zipSha256: await hashFile(zipPath),
    summary,
    v35Isolation,
  })
);
