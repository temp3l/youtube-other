import { config as loadDotenv } from "dotenv";

loadDotenv({ override: true });

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const liveTts = process.argv.includes("--live-tts");

const pattern = liveTts
  ? "executes workspace operator progressive E013 batch with live OpenAI TTS"
  : "executes workspace operator progressive E013 batch";

const child = spawnSync(
  "pnpm",
  [
    "exec",
    "vitest",
    "run",
    "-c",
    "vitest.integration.config.ts",
    "packages/microdrama/src/micro-039-e013-bounded-progressive-batch-execute.integration.test.ts",
    "-t",
    pattern,
  ],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      MICRO_039_E013_OPERATOR_EXECUTE: liveTts ? "0" : "1",
      MICRO_039_E013_LIVE_TTS: liveTts ? "1" : "0",
      MICRO_039_E013_EXECUTED_AT:
        process.env.MICRO_039_E013_EXECUTED_AT ?? new Date().toISOString(),
    },
    encoding: "utf8",
  }
);

if (child.stdout) {
  process.stdout.write(child.stdout);
}
if (child.stderr) {
  process.stderr.write(child.stderr);
}

process.exitCode = child.status ?? 1;
