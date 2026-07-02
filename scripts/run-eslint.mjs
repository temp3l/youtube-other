import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const ROOT_LINT_FILES = ["eslint.config.js", "prettier.config.cjs"];
const LINT_DIRECTORIES = ["apps", "packages", "scripts"];
const LINTABLE_FILE_PATTERN = /\.(?:[cm]?js|jsx|tsx?|mts|cts)$/;
const CHANGED_FLAG = "--changed";

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

function getChangedLintTargets() {
  const baseRef = resolveBaseRef();
  const mergeBase = execFileSync("git", ["merge-base", baseRef, "HEAD"], {
    encoding: "utf8"
  }).trim();
  const changed = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMR", mergeBase], {
    encoding: "utf8"
  })
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);

  return changed.filter((file) => {
    if (ROOT_LINT_FILES.includes(file)) {
      return true;
    }

    return (
      LINTABLE_FILE_PATTERN.test(file) &&
      LINT_DIRECTORIES.some((directory) => file.startsWith(`${directory}/`))
    );
  });
}

const lintTargets = process.argv.includes(CHANGED_FLAG)
  ? getChangedLintTargets()
  : [...LINT_DIRECTORIES, ...ROOT_LINT_FILES].filter((target) => existsSync(target));

if (lintTargets.length === 0) {
  console.log("No lint targets matched.");
  process.exit(0);
}

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "eslint",
    "--cache",
    "--cache-location",
    ".cache/eslint/",
    "--cache-strategy",
    "content",
    "--no-error-on-unmatched-pattern",
    "--no-warn-ignored",
    ...lintTargets
  ],
  {
    stdio: "inherit"
  }
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
