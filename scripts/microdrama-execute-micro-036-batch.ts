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
const admittedAt = process.env.MICRO_036_ADMITTED_AT ?? "2026-08-12T04:00:00.000Z";
const now = new Date().toISOString();
const outputRoot =
  process.env.MICRO_036_OUTPUT_ROOT ??
  path.join(repoRoot, ".artifacts", "microdrama", "micro-036-batch");

const pattern = authorizeOnly
  ? "authorizes workspace operator explicit execute authorization"
  : "executes workspace operator bounded batch";

const child = spawnSync(
  "pnpm",
  [
    "exec",
    "vitest",
    "run",
    "-c",
    "vitest.integration.config.ts",
    "packages/microdrama/src/micro-036-bounded-batch-execute.integration.test.ts",
    "-t",
    pattern,
  ],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      MICRO_036_OPERATOR_EXECUTE: "1",
      MICRO_036_DB_PATH: dbPath,
      MICRO_036_ADMITTED_AT: admittedAt,
      MICRO_036_AUTHORIZED_AT: now,
      MICRO_036_EXECUTED_AT: now,
      MICRO_036_OUTPUT_ROOT: outputRoot,
      MICRO_036_AUTHORIZE_ONLY: authorizeOnly ? "1" : "0",
    },
    encoding: "utf8",
  }
);
if (child.stdout) process.stdout.write(child.stdout);
if (child.stderr) process.stderr.write(child.stderr);
process.exitCode = child.status ?? 1;
