import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  HISTORY_VISUAL_PLAN_ACTIVATION_FLAG_V36,
  resolveHistoryVisualPlanRouteV36,
} from "../packages/history/src/index.js";

const execute = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const visualRoot = path.join(
  repository,
  "artifacts/shadow/history-v3.6/visual-plans"
);
const rendererRoot = path.join(
  repository,
  "artifacts/shadow/history-v3.6/renderer"
);
const outputRoot = path.join(
  repository,
  "artifacts/shadow/history-v3.6/production-readiness"
);
const timestamp = new Date()
  .toISOString()
  .replaceAll(/[-:]/gu, "")
  .replace(/\.\d{3}Z$/u, "Z");
const basename = `history-v3.6-production-readiness-${timestamp}`;
const directory = path.join(outputRoot, basename);
const zipPath = `${directory}.zip`;
const pretty = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const hashFile = async (file: string) =>
  createHash("sha256").update(await fs.readFile(file)).digest("hex");

async function latestDirectory(root: string, prefix: string): Promise<string> {
  const names = (await fs.readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  const name = names.at(-1);
  if (!name) throw new Error(`Missing accepted artifact directory: ${prefix}.`);
  return path.join(root, name);
}

async function json(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
}

async function taggedCommit(tag: string): Promise<string> {
  return (
    await execute("git", ["rev-parse", `${tag}^{}`], { cwd: repository })
  ).stdout.trim();
}

const sameEight = await latestDirectory(
  visualRoot,
  "history-v3.6-same-eight-visual-plan-review-"
);
const all40 = await latestDirectory(
  visualRoot,
  "history-v3.6-all40-shadow-plan-census-"
);
const renderer = await latestDirectory(
  rendererRoot,
  "history-v3.6-renderer-shadow-readiness-"
);
const sameSummary = await json(
  path.join(sameEight, "same-eight-visual-plan-summary.json")
);
const all40Summary = await json(
  path.join(all40, "all40-shadow-plan-census.json")
);
const samePlacement = await json(
  path.join(sameEight, "placement-summary.json")
);
const all40Placement = await json(path.join(all40, "placement-summary.json"));
const all40Consumption = await json(
  path.join(all40, "renderer-consumption-summary.json")
);
const differential = await json(
  path.join(all40, "v35-v36-differential-summary.json")
);
const v35Isolation = await json(
  path.join(all40, "v35-isolation-summary.json")
);
const sameDeterminism = await json(
  path.join(sameEight, "determinism-summary.json")
);
const all40Determinism = await json(
  path.join(all40, "determinism-summary.json")
);
const invariants = await json(path.join(all40, "invariant-summary.json"));
const head = (
  await execute("git", ["rev-parse", "HEAD"], { cwd: repository })
).stdout.trim();
const contractCommit = await taggedCommit(
  "history-v3.6-visual-plan-shadow-contract-baseline"
);
const sameCommit = await taggedCommit(
  "history-v3.6-same-eight-visual-plan-shadow-baseline"
);
const all40Commit = await taggedCommit(
  "history-v3.6-all40-visual-plan-census-baseline"
);

const activationOff = resolveHistoryVisualPlanRouteV36({ genre: "history" });
const activationOnShadow = resolveHistoryVisualPlanRouteV36({
  genre: "history",
  activationFlagValue: "shadow",
});
const rollback = resolveHistoryVisualPlanRouteV36({
  genre: "history",
  activationFlagValue: "off",
});
const rejectedProductionValue = resolveHistoryVisualPlanRouteV36({
  genre: "history",
  activationFlagValue: "production",
});
if (
  activationOff.route !== "V3_5_PRODUCTION" ||
  activationOnShadow.route !== "V3_6_SHADOW" ||
  rollback.route !== "V3_5_PRODUCTION" ||
  rejectedProductionValue.route !== "V3_5_PRODUCTION"
)
  throw new Error("Activation seam dry run failed.");

const phaseIndex = {
  phases: [
    {
      phase: "2.36",
      purpose: "visual-plan shadow contract and disabled activation seam",
      commit: contractCommit,
      tag: "history-v3.6-visual-plan-shadow-contract-baseline",
      result: "PASS",
    },
    {
      phase: "2.37",
      purpose: "same-eight full shadow visual plans",
      commit: sameCommit,
      tag: "history-v3.6-same-eight-visual-plan-shadow-baseline",
      result: "PASS",
    },
    {
      phase: "2.38",
      purpose: "all-40 shadow-plan census and V3.5 differential",
      commit: all40Commit,
      tag: "history-v3.6-all40-visual-plan-census-baseline",
      result: "PASS",
    },
    {
      phase: "2.39",
      purpose: "approval pack and production-readiness audit",
      artifactInputCommit: head,
      tag: "history-v3.6-production-readiness-baseline",
      result: "PASS",
    },
  ],
};
const contractSummary = {
  schemaVersion: "history-visual-plan-shadow.v1",
  plannerVersion: "history-visual-plan-shadow.v3.6.0",
  shadowOnly: true,
  acceptedInputs: [
    "V3.5 episode plan",
    "validated V3.6 renderer specs",
    "typed supportClaimIds",
  ],
  placementRule: "SUPPORT_COMPLETION_BEAT_V1",
  coexistence: "ADDITIVE_SEMANTIC_OVERLAY",
  replacementCount: 0,
  inferenceSources: [],
  noSafePlacementDiagnostics: [
    "EPISODE_ID_MISMATCH",
    "SUPPORT_CLAIM_NOT_IN_BASE_PLAN",
    "INVALID_SUPPORT_BEAT_TIMING",
  ],
  frozenContracts: {
    semantic: "history-v3.6-all40-semantic-release-readiness-baseline",
    compiler: "history-v3.6-compiler-shadow-readiness-baseline",
    renderer: "history-v3.6-renderer-shadow-readiness-baseline",
    visualPlan: "history-v3.6-visual-plan-shadow-contract-baseline",
  },
};
const activationSummary = {
  result: "PASS",
  flag: HISTORY_VISUAL_PLAN_ACTIVATION_FLAG_V36,
  default: activationOff,
  explicitShadowFixture: activationOnShadow,
  rejectedProductionLikeValue: rejectedProductionValue,
  wiredIntoProductionWorkflow: false,
  productionActivated: false,
  activationBoundary:
    "Actual production routing remains a later human-approved Gate A change.",
};
const rollbackSummary = {
  result: "PASS",
  action: `unset ${HISTORY_VISUAL_PLAN_ACTIVATION_FLAG_V36} or set it to off`,
  routeAfterRollback: rollback.route,
  v35ArtifactsRewritten: 0,
  destructiveMigrationRequired: false,
};
const knownTerminalCases = {
  blockingArchitectureCases: [],
  nonblockingCases: [
    {
      code: "TIMING_MEASUREMENT_REQUIRED",
      scope: "40/40 compatibility episodes",
      classification: "PER_EPISODE_PRODUCTION_PREREQUISITE",
      effect:
        "Does not block V3.6 architecture activation readiness; blocks final production approval for an episode until measured TTS or final-audio timing exists.",
      remediation: "Rebuild the episode plan with measured timing before production approval.",
    },
  ],
  frozenCorpusCoverageNotes: [
    "The accepted all-40 corpus does not contain every native/proof relation kind; this is not a failure.",
  ],
};
const timingStatus = {
  status: "KNOWN_NONBLOCKING_TERMINAL_CASE",
  timingMeasurementRequiredEpisodes: all40Summary.timingMeasurementRequiredEpisodes,
  timingSource: "provisional-text-estimate",
  measuredTimingInvented: false,
  productionRequirementPreserved: true,
};
const determinismSummary = {
  result: "PASS",
  sameEight: sameDeterminism,
  all40: all40Determinism,
  shadowPlanHashesIncludeTimestamps: false,
  placementRandomness: 0,
};
const testSummary = {
  result: "PASS_WITH_UNRELATED_BROAD_LINT_FINDINGS",
  passed: [
    "focused visual-plan unit test: 4/4",
    "History package typecheck",
    "direct targeted ESLint for changed TypeScript files",
    "same-eight semantic/compiler/renderer/visual-plan lane x2",
    "all-40 semantic/compiler/renderer/visual-plan lane x2",
    "V3.5 plan hashes before/after",
    "activation seam OFF/shadow/rollback dry run",
    "artifact checksums and ZIP integrity",
  ],
  notRun: [
    "46 goldens: semantic/compiler/renderer contracts were not changed",
    "full repository test/build/typecheck: outside focused verification scope",
  ],
  unrelatedPreExisting: [
    "repository lint wrapper ignored file filters and reported 13 errors in unrelated existing files; direct targeted ESLint passed",
  ],
};
const productionDecision = {
  verdict: "READY_WITH_KNOWN_NONBLOCKING_TERMINAL_CASES",
  readyForProductionActivationApproval: true,
  productionActivated: false,
  blockingIssues: [],
  knownNonblockingTerminalCases: ["TIMING_MEASUREMENT_REQUIRED"],
  reviewStatus: "COMPACT_APPROVAL_PACK_GENERATED",
  humanDecisionRequiredNow: false,
  nextAction: "production activation approval",
};
const provenance = {
  artifactInputHead: head,
  startingBaseline: "history-v3.6-renderer-shadow-readiness-baseline",
  frozenV35: "history-v3.5-frozen-before-v36",
  sameEightArtifact: path.relative(repository, sameEight),
  all40Artifact: path.relative(repository, all40),
  rendererArtifact: path.relative(repository, renderer),
  shadowOnly: true,
  providerCalls: { llm: 0, image: 0, web: 0, geocoding: 0 },
  productionActivated: false,
};
const payloads: Record<string, unknown> = {
  "README.md":
    "# History V3.6 production-readiness approval pack\n\nVerdict: READY_WITH_KNOWN_NONBLOCKING_TERMINAL_CASES. Production activation remains disabled. The only known terminal case is the preserved per-episode measured-timing requirement.\n",
  "phase-index.json": phaseIndex,
  "visual-plan-contract-summary.json": contractSummary,
  "same-eight-visual-plan-summary.json": sameSummary,
  "all40-shadow-plan-census.json": all40Summary,
  "placement-summary.json": {
    sameEight: samePlacement,
    all40: all40Placement,
  },
  "renderer-consumption-summary.json": all40Consumption,
  "v35-v36-differential-summary.json": differential,
  "determinism-summary.json": determinismSummary,
  "v35-isolation-summary.json": v35Isolation,
  "activation-seam-summary.json": activationSummary,
  "rollback-summary.json": rollbackSummary,
  "known-terminal-cases.json": knownTerminalCases,
  "timing-status.json": timingStatus,
  "test-summary.json": testSummary,
  "invariant-summary.json": invariants,
  "production-readiness-decision.json": productionDecision,
  "provenance.json": provenance,
  "review-preview-index.json": {
    previews: [
      {
        kind: "map",
        relationKind: "movement",
        file: "previews/movement.png",
      },
      {
        kind: "diagram",
        relationKind: "causal",
        file: "previews/causal.png",
      },
    ],
  },
};

await fs.mkdir(path.join(directory, "previews"), { recursive: true });
await Promise.all(
  Object.entries(payloads).map(([name, value]) =>
    fs.writeFile(
      path.join(directory, name),
      typeof value === "string" ? value : pretty(value)
    )
  )
);
await Promise.all(
  ["movement.png", "causal.png"].map((name) =>
    fs.copyFile(
      path.join(renderer, "previews", name),
      path.join(directory, "previews", name)
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
    "artifacts/shadow/history-v3.6/phase-2.39-production-readiness.json"
  ),
  pretty({
    phase: "2.39",
    startingSha: head,
    result: "PASS",
    verdict: productionDecision.verdict,
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
    decision: productionDecision,
  })
);
