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
const timingGate = (episodeId: string) => ({
  episodeId,
  status: "BLOCKED_BY_MEASURED_TIMING",
  existingAudioArtifact: null,
  measuredDurationMs: null,
  timingArtifactHash: null,
  provider: "openai-compatible",
  model: "gpt-4o-mini-tts",
  voice: "onyx",
  localAttempt: {
    result: "FAILED",
    reason: "Sandbox network DNS resolution failed before provider contact (curl exit 6).",
  },
  externalRetry: {
    result: "NOT_RUN",
    reason:
      "Execution environment requires explicit user authorization to transmit the canary narration payload to the configured external provider.",
  },
  safeFallbackUsed: false,
  provisionalTextEstimateUsed: false,
});
const blocked = {
  state: "NOT_RUN",
  reason: "Measured timing is mandatory before a production-candidate V3.6 plan may be built.",
};
const payloads: Record<string, unknown> = {
  "README.md":
    "# History V3.6 production-canary readiness\n\nBlocked before canary plan generation: measured timing could not be obtained without explicit authorization to transmit the two narration scripts to the configured OpenAI-compatible TTS provider. No production episode or asset was changed.\n",
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
      { phase: "2", result: "BLOCKED_BY_MEASURED_TIMING" },
    ],
  },
  "routing-seam-summary.json": routing,
  "canary-config-summary.json": {
    defaultRoute: "V3_5_PRODUCTION",
    V3_6_global_default: false,
    candidateOutputRoot: "artifacts/canary/history-v3.6",
    allowedEpisodes: [blackDeath, dDay],
  },
  "black-death-timing.json": timingGate(blackDeath),
  "d-day-timing.json": timingGate(dDay),
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
    "Global activation is not ready. First authorize or supply authoritative measured timing for both canaries, then run the isolated canary plan and render validation.\n",
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
    timingGeneration: "BLOCKED_BY_EXTERNAL_PAYLOAD_AUTHORIZATION",
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
    exactGate: "Gate B — measured timing cannot be obtained without external payload authorization.",
    productionActivated: false,
  },
  "provenance.json": {
    artifactInputHead: head,
    baseline: "history-v3.6-production-readiness-baseline",
    frozenV35: "history-v3.5-frozen-before-v36",
    providerCalls: { ttsCompleted: 0, llm: 0, image: 0, web: 0, geocoding: 0 },
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
