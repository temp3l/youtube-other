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
const liveImages =
  process.argv.includes("--live-images") || process.env.MICRO_034_LIVE_IMAGES === "1";
const reviewDensity =
  process.argv.includes("--review-density") ||
  process.env.MICRODRAMA_ASSET_DENSITY_PROFILE === "review" ||
  liveImages;
const episodesArgIndex = process.argv.indexOf("--episodes");
const episodesArg =
  episodesArgIndex >= 0 && process.argv[episodesArgIndex + 1]
    ? process.argv[episodesArgIndex + 1]!
    : process.env.MICRO_034_EPISODE_IDS;
const admittedAt = process.env.MICRO_034_ADMITTED_AT ?? "2026-08-12T04:00:00.000Z";
const now = new Date().toISOString();
const outputRoot =
  process.env.MICRO_034_OUTPUT_ROOT ??
  path.join(repoRoot, ".artifacts", "microdrama", "micro-034-canary");

const pattern = authorizeOnly
  ? "authorizes workspace operator explicit execute authorization"
  : "executes workspace operator bounded visual canary";

const child = spawnSync(
  "pnpm",
  [
    "exec",
    "vitest",
    "run",
    "-c",
    "vitest.integration.config.ts",
    "packages/microdrama/src/micro-034-bounded-visual-canary-execute.integration.test.ts",
    "-t",
    pattern,
  ],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      MICRO_034_OPERATOR_EXECUTE: "1",
      MICRO_034_DB_PATH: dbPath,
      MICRO_034_ADMITTED_AT: admittedAt,
      MICRO_034_AUTHORIZED_AT: now,
      MICRO_034_EXECUTED_AT: now,
      MICRO_034_OUTPUT_ROOT: outputRoot,
      MICRO_034_AUTHORIZE_ONLY: authorizeOnly ? "1" : "0",
      MICRO_034_LIVE_IMAGES: liveImages ? "1" : "0",
      ...(reviewDensity ? { MICRODRAMA_ASSET_DENSITY_PROFILE: "review" } : {}),
      ...(episodesArg ? { MICRO_034_EPISODE_IDS: episodesArg } : {}),
    },
    encoding: "utf8",
  }
);
if (child.stdout) process.stdout.write(child.stdout);
if (child.stderr) process.stderr.write(child.stderr);
process.exitCode = child.status ?? 1;
