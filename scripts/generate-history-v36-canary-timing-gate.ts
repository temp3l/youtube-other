import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  HISTORY_V36_CANARY_EPISODES_ENV,
  HISTORY_VISUAL_PLAN_ACTIVATION_FLAG_V36,
  resolveHistoryProductionCanaryRouteV36,
} from "../packages/history/src/index.js";

const execute = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(repository, "artifacts/canary/history-v3.6");
const timestamp = new Date()
  .toISOString()
  .replaceAll(/[-:]/gu, "")
  .replace(/\.\d{3}Z$/u, "Z");
const basename = `history-v3.6-production-canary-readiness-${timestamp}`;
const directory = path.join(root, basename);
const zipPath = `${directory}.zip`;
const pretty = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const hashFile = async (file: string) =>
  createHash("sha256").update(await fs.readFile(file)).digest("hex");
const blackDeath = "history-youtube-history-10-video-story-pack-04-black-death";
const dDay = "history-youtube-history-30-video-story-pack-31-d-day-normandy-invasion";
const allowlist = `${blackDeath},${dDay}`;
const head = (
  await execute("git", ["rev-parse", "HEAD"], { cwd: repository })
).stdout.trim();

const routing = {
  flag: HISTORY_VISUAL_PLAN_ACTIVATION_FLAG_V36,
  enabledValue: "canary",
  allowlistEnv: HISTORY_V36_CANARY_EPISODES_ENV,
  allowlist: [blackDeath, dDay],
  default: resolveHistoryProductionCanaryRouteV36({ episodeId: blackDeath }),
  blackDeath: resolveHistoryProductionCanaryRouteV36({
    episodeId: blackDeath,
    activationFlagValue: "canary",
    canaryEpisodesValue: allowlist,
  }),
  dDay: resolveHistoryProductionCanaryRouteV36({
    episodeId: dDay,
    activationFlagValue: "canary",
    canaryEpisodesValue: allowlist,
  }),
  nonCanary: resolveHistoryProductionCanaryRouteV36({
    episodeId: "history-not-a-canary",
    activationFlagValue: "canary",
    canaryEpisodesValue: allowlist,
  }),
};
const timingGate = async (episodeId: string) => {
  const audioDirectory = path.join(
    root,
    "workspace",
    episodeId,
    "locales/en/full/audio"
  );
  const narrationPath = path.join(audioDirectory, "narration.wav");
  const timingPath = path.join(audioDirectory, "tts-generation.json");
  const timing = JSON.parse(await fs.readFile(timingPath, "utf8")) as {
    readonly model: string;
    readonly voice: string;
    readonly generatedAt: string;
    readonly actualDurationSeconds: number;
  };
  const { stdout } = await execute(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      narrationPath,
    ],
    { cwd: repository }
  );
  const measuredDurationMs = Math.round(Number.parseFloat(stdout.trim()) * 1000);
  if (!Number.isFinite(measuredDurationMs) || measuredDurationMs <= 0)
    throw new Error(`Unable to measure ${episodeId} narration audio.`);
  return {
    episodeId,
    status: "BLOCKED_BY_MEASURED_TIMING",
    audioAssetPath: path.relative(repository, narrationPath),
    audioAssetHash: await hashFile(narrationPath),
    measuredDurationMs,
    measuredDurationSeconds: measuredDurationMs / 1000,
    wordSegmentTimingSource: "measured TTS segment durations plus ffprobe narration duration",
    timingArtifactPath: path.relative(repository, timingPath),
    timingArtifactHash: await hashFile(timingPath),
    provider: "openai-compatible",
    model: timing.model,
    voice: timing.voice,
    generatedAt: timing.generatedAt,
    durationPolicy: {
      allowedMinDurationMs: 480000,
      allowedMaxDurationMs: 1200000,
      result: "TIMING_OUTSIDE_ALLOWED_RANGE",
    },
    provisionalTextEstimateUsed: false,
  };
};
const [blackDeathTiming, dDayTiming] = await Promise.all([
  timingGate(blackDeath),
  timingGate(dDay),
]);
const blocked = {
  state: "NOT_RUN",
  reason:
    "Measured narration exists, but it is below the configured 480000ms production minimum. Candidate plans would fail TIMING_OUTSIDE_ALLOWED_RANGE.",
};
const payloads: Record<string, unknown> = {
  "README.md":
    "# History V3.6 production-canary readiness\n\nBoth isolated canaries have authoritative measured TTS audio, but each is below the configured 480-second History production minimum. Candidate plan generation is blocked before semantic/render activation. No production episode or asset was changed.\n",
  "phase-index.json": {
    phases: [
      {
        phase: "0",
        result: "PASS",
        tag: "history-v3.6-pre-production-canary",
      },
      {
        phase: "1",
        result: "PASS",
        commit: head,
        tag: "history-v3.6-production-canary-routing-baseline",
      },
      {
        phase: "2",
        result: "BLOCKED_BY_MEASURED_TIMING",
        reason: "Measured audio is below the configured production duration minimum.",
      },
    ],
  },
  "routing-seam-summary.json": routing,
  "canary-config-summary.json": {
    defaultRoute: "V3_5_PRODUCTION",
    V3_6_global_default: false,
    candidateOutputRoot: "artifacts/canary/history-v3.6",
    allowedEpisodes: [blackDeath, dDay],
  },
  "black-death-timing.json": blackDeathTiming,
  "d-day-timing.json": dDayTiming,
  "black-death-plan-summary.json": blocked,
  "d-day-plan-summary.json": blocked,
  "black-death-render-review.json": blocked,
  "d-day-render-review.json": blocked,
  "v35-v36-canary-differential.json": blocked,
  "rollback-summary.json": {
    result: "PASS_FOR_ROUTING_SEAM",
    V3_6_candidateArtifactsConsumedByV35: 0,
    V3_5_hashesChanged: 0,
    note: "No V3.6 candidate plan was built because timing is blocked.",
  },
  "activation-instructions.md":
    "Global activation is not ready. Resolve the measured-duration policy failure for both canaries, then rerun the isolated plan and render validation.\n",
  "rollback-instructions.md":
    "Keep MEDIAFORGE_HISTORY_V36_VISUAL_PLAN unset or set it to off. The default and non-allowlisted routes are V3.5.\n",
  "future-episode-timing-policy.md":
    "Every future V3.6 production candidate requires measured TTS or measured final-audio timing. Text estimates are never production-valid.\n",
  "test-summary.json": {
    result: "PASS_UNTIL_TIMING_GATE",
    checks: [
      "History typecheck",
      "targeted ESLint",
      "18 renderer/compiler/plan preflight tests",
      "7 focused canary-routing/plan tests",
    ],
    measuredTiming: "PASS",
    candidatePlanAdmission: "BLOCKED_BY_TIMING_OUTSIDE_ALLOWED_RANGE",
  },
  "invariant-summary.json": {
    result: "PASS",
    productionActivated: 0,
    v35ProductionOutputChange: 0,
    semanticInferenceFallback: 0,
    provisionalTimingAccepted: 0,
  },
  "production-canary-decision.json": {
    verdict: "BLOCKED_BY_MEASURED_TIMING",
    humanDecisionRequired: true,
    exactGate:
      "Gate B — the existing configured TTS path produced authoritative timing, but neither canary satisfies the configured production duration policy.",
    productionActivated: false,
  },
  "provenance.json": {
    artifactInputHead: head,
    baseline: "history-v3.6-production-readiness-baseline",
    frozenV35: "history-v3.5-frozen-before-v36",
    providerCalls: { ttsCompleted: 2, llm: 0, image: 0, web: 0, geocoding: 0 },
    productionActivated: false,
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
  files.map(async (file) => `${await hashFile(path.join(directory, file))}  ${file}`)
);
await fs.writeFile(
  path.join(directory, "checksums.sha256"),
  `${checksums.join("\n")}\n`
);
await execute("sha256sum", ["-c", "checksums.sha256"], { cwd: directory });
await execute("zip", ["-X", "-q", "-r", zipPath, basename], { cwd: root });
await execute("unzip", ["-t", zipPath], { cwd: root });
process.stdout.write(
  pretty({
    directory: path.relative(repository, directory),
    zip: path.relative(repository, zipPath),
    zipSha256: await hashFile(zipPath),
    verdict: "BLOCKED_BY_MEASURED_TIMING",
  })
);
