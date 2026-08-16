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
    "packages/microdrama/src/micro-042-tiktok-public-video-read-canary-execute.integration.test.ts",
    "-t",
    "prepares workspace operator embedded database",
  ],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      MICRO_042_OPERATOR_PREP: "1",
      MICRO_042_PREPARED_AT: process.env.MICRO_042_PREPARED_AT ?? new Date().toISOString(),
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
