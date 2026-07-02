import { execFileSync, spawnSync } from "node:child_process";

const command = process.argv[2];

if (!command) {
  console.error("Usage: node scripts/run-affected-workspace-command.mjs <script>");
  process.exit(1);
}

function resolveBaseRef() {
  const override = process.env.MEDIAFORGE_AFFECTED_BASE;
  const candidates = override
    ? [override]
    : ["origin/master", "master", "origin/main", "main", "origin/development", "development"];

  for (const candidate of candidates) {
    try {
      execFileSync("git", ["rev-parse", "--verify", candidate], { stdio: "ignore" });
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error("Unable to resolve an affected-base ref. Set MEDIAFORGE_AFFECTED_BASE.");
}

const baseRef = resolveBaseRef();
const result = spawnSync(
  "pnpm",
  [
    "--filter",
    `...[${baseRef}]...`,
    "-r",
    "--if-present",
    "--workspace-concurrency=-1",
    command
  ],
  {
    stdio: "inherit"
  }
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
