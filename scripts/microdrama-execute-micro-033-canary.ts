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

const authorizeOnly = process.argv.includes("--authorize-only");
const admittedAt = process.env.MICRO_033_ADMITTED_AT ?? "2026-08-12T04:00:00.000Z";
const now = new Date().toISOString();
const outputRoot =
  process.env.MICRO_033_OUTPUT_ROOT ??
  path.join(repoRoot, ".artifacts", "microdrama", "micro-033-canary");

const pattern = authorizeOnly
  ? "authorizes workspace operator explicit execute authorization"
  : "executes workspace operator bounded canary";

const child = spawnSync(
  "pnpm",
  [
    "exec",
    "vitest",
    "run",
    "-c",
    "vitest.integration.config.ts",
    "packages/microdrama/src/micro-033-bounded-tts-canary-execute.integration.test.ts",
    "-t",
    pattern,
  ],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      MICRO_033_OPERATOR_EXECUTE: "1",
      MICRO_033_DB_PATH: dbPath,
      MICRO_033_ADMITTED_AT: admittedAt,
      MICRO_033_AUTHORIZED_AT: now,
      MICRO_033_EXECUTED_AT: now,
      MICRO_033_OUTPUT_ROOT: outputRoot,
      MICRO_033_AUTHORIZE_ONLY: authorizeOnly ? "1" : "0",
    },
    encoding: "utf8",
  }
);
if (child.stdout) process.stdout.write(child.stdout);
if (child.stderr) process.stderr.write(child.stderr);
process.exitCode = child.status ?? 1;
