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
const liveTts =
  process.argv.includes("--live-tts") || process.env.MICRO_035_LIVE_TTS === "1";
const localesArgIndex = process.argv.indexOf("--locales");
const localesArg =
  localesArgIndex >= 0 && process.argv[localesArgIndex + 1]
    ? process.argv[localesArgIndex + 1]!
    : process.env.MICRO_035_LOCALE_IDS;
const admittedAt = process.env.MICRO_035_ADMITTED_AT ?? "2026-08-12T04:00:00.000Z";
const now = new Date().toISOString();
const outputRoot =
  process.env.MICRO_035_OUTPUT_ROOT ??
  path.join(repoRoot, ".artifacts", "microdrama", "micro-035-canary");

const pattern = authorizeOnly
  ? "authorizes workspace operator explicit execute authorization"
  : "executes workspace operator bounded multilingual canary";

const child = spawnSync(
  "pnpm",
  [
    "exec",
    "vitest",
    "run",
    "-c",
    "vitest.integration.config.ts",
    "packages/microdrama/src/micro-035-bounded-multilingual-canary-execute.integration.test.ts",
    "-t",
    pattern,
  ],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      MICRO_035_OPERATOR_EXECUTE: "1",
      MICRO_035_DB_PATH: dbPath,
      MICRO_035_ADMITTED_AT: admittedAt,
      MICRO_035_AUTHORIZED_AT: now,
      MICRO_035_EXECUTED_AT: now,
      MICRO_035_OUTPUT_ROOT: outputRoot,
      MICRO_034_OUTPUT_ROOT:
        process.env.MICRO_034_OUTPUT_ROOT ??
        path.join(repoRoot, ".artifacts", "microdrama", "micro-034-canary"),
      MICRO_035_AUTHORIZE_ONLY: authorizeOnly ? "1" : "0",
      MICRO_035_LIVE_TTS: liveTts ? "1" : "0",
      ...(liveTts ? { MICRODRAMA_ASSET_DENSITY_PROFILE: "review" } : {}),
      ...(localesArg ? { MICRO_035_LOCALE_IDS: localesArg } : {}),
    },
    encoding: "utf8",
  }
);
if (child.stdout) process.stdout.write(child.stdout);
if (child.stderr) process.stderr.write(child.stderr);
process.exitCode = child.status ?? 1;
