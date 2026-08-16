import { config as loadDotenv } from "dotenv";

loadDotenv({ override: true });

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbArgIndex = process.argv.indexOf("--db");
const dbPath =
  dbArgIndex >= 0 && process.argv[dbArgIndex + 1]
    ? path.resolve(process.argv[dbArgIndex + 1]!)
    : path.join(repoRoot, ".mediaforge.sqlite");

if (dbPath !== path.join(repoRoot, ".mediaforge.sqlite")) {
  process.stderr.write(
    "Custom --db paths require operator prep via vitest; default uses workspace .mediaforge.sqlite.\n"
  );
  process.exit(1);
}

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
    "prepares workspace operator embedded database",
  ],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      MICRO_050_OPERATOR_PREP: "1",
      MICRO_050_PREPARED_AT: process.env.MICRO_050_PREPARED_AT ?? new Date().toISOString(),
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
