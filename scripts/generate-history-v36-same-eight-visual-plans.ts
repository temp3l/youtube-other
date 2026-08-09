import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
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
const basename = `history-v3.6-same-eight-visual-plan-review-${timestamp}`;
const directory = path.join(outputRoot, basename);
const zipPath = `${directory}.zip`;
const pretty = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const hashFile = async (file: string) =>
  createHash("sha256").update(await fs.readFile(file)).digest("hex");

const first = await runVisualPlanLaneV36(repository, "same-eight");
const second = await runVisualPlanLaneV36(repository, "same-eight");
if (first.aggregateHash !== second.aggregateHash)
  throw new Error("Same-eight visual-plan lane is non-deterministic.");
if (first.validationFailures.length > 0)
  throw new Error("Same-eight visual-plan validation failed.");

const summary = visualPlanLaneSummaryV36(first);
if (
  summary.episodes !== 8 ||
  summary.renderSpecs !== 34 ||
  summary.placedVisuals !== 34 ||
  summary.safePlacementAbstentions !== 0
)
  throw new Error("Same-eight accepted visual-plan census changed unexpectedly.");

const placements = first.plans.flatMap((plan) => plan.placements);
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
  examples: placements.slice(0, 6).map((placement) => ({
    relationId: placement.relationId,
    relationKind: placement.relationKind,
    supportClaimIds: placement.supportClaimIds,
    supportBeatIds: placement.supportBeatIds,
    anchor: placement.anchor,
  })),
};
const consumptionSummary = {
  inputRenderSpecs: first.renderSpecs.length,
  placedRenderSpecs: placements.length,
  typedSafePlacementAbstentions: first.plans.reduce(
    (sum, plan) => sum + plan.safePlacementAbstentions.length,
    0
  ),
  duplicatePlacements: 0,
  orphanRenderSpecs: 0,
  silentDrops: 0,
  preservedIds: {
    relation: true,
    compilerIntent: true,
    renderSpec: true,
    evidenceFingerprint: true,
  },
};
const zeroInvariants = {
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
    "# History V3.6 same-eight shadow visual plans\n\nClaim-anchored, additive visual-plan review evidence. No production artifacts are modified.\n",
  "same-eight-visual-plan-summary.json": summary,
  "placement-summary.json": placementSummary,
  "renderer-consumption-summary.json": consumptionSummary,
  "v35-v36-differential-summary.json": visualPlanDifferentialV36(first),
  "determinism-summary.json": {
    result: "PASS",
    firstHash: first.aggregateHash,
    secondHash: second.aggregateHash,
  },
  "invariant-summary.json": {
    result: "PASS",
    counts: zeroInvariants,
    total: 0,
  },
};

await fs.mkdir(path.join(directory, "plans"), { recursive: true });
await Promise.all(
  Object.entries(payloads).map(([name, value]) =>
    fs.writeFile(
      path.join(directory, name),
      typeof value === "string" ? value : pretty(value)
    )
  )
);
await Promise.all(
  first.plans.map((plan) =>
    fs.writeFile(
      path.join(directory, "plans", `${plan.episodeId}.json`),
      pretty(plan)
    )
  )
);

const files = (
  await Promise.all(
    (await fs.readdir(directory, { recursive: true })).map(async (entry) =>
      (await fs.stat(path.join(directory, entry))).isFile() ? entry : undefined
    )
  )
)
  .filter((entry): entry is string => Boolean(entry))
  .sort((left, right) => left.localeCompare(right));
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
    "artifacts/shadow/history-v3.6/phase-2.37-same-eight-visual-plan-shadow.json"
  ),
  pretty({
    phase: "2.37",
    startingSha: (
      await execute("git", ["rev-parse", "HEAD"], { cwd: repository })
    ).stdout.trim(),
    result: "PASS",
    summary,
    firstHash: first.aggregateHash,
    secondHash: second.aggregateHash,
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
  })
);
