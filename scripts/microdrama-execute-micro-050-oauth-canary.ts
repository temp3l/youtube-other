import { config as loadDotenv } from "dotenv";

loadDotenv({ override: true });

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const child = spawnSync(
  "pnpm",
  [
    "exec",
    "vitest",
    "run",
    "-c",
    "vitest.integration.config.ts",
    "packages/microdrama/src/micro-050-tiktok-oauth-canary-execute.integration.test.ts",
    "-t",
    "executes workspace operator read-only OAuth canary",
  ],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      MICRO_050_OPERATOR_EXECUTE: "1",
      MICRO_050_EXECUTED_AT: process.env.MICRO_050_EXECUTED_AT ?? new Date().toISOString(),
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
