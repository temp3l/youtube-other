#!/usr/bin/env bash

set -euo pipefail

payload_file=$(mktemp)
trap 'rm -f "$payload_file"' EXIT

cat >"$payload_file"

if [ "${ALLOW_BROAD_VERIFICATION:-0}" = "1" ]; then
  printf '%s\n' '{"decision":"approve"}'
  exit 0
fi

node - "$payload_file" <<'NODE'
const fs = require("node:fs");

const payloadPath = process.argv[2];

function emit(output) {
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

function approve() {
  emit({ decision: "approve" });
}

function block(reason) {
  emit({ decision: "block", reason });
}

let payload;
try {
  payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
} catch (error) {
  block(`Invalid Codex hook payload for repository command guard: ${error.message}`);
  process.exit(0);
}

if (payload?.hook_event_name !== "PreToolUse" && payload?.hookEventName !== "PreToolUse") {
  block("Unexpected hook payload for repository command guard.");
  process.exit(0);
}

if (payload.tool_name !== "Bash") {
  approve();
  process.exit(0);
}

const command = payload?.tool_input?.command;
if (typeof command !== "string" || command.trim() === "") {
  block("Repository command guard expected a Bash command string.");
  process.exit(0);
}

const normalized = command.trim().replace(/\s+/g, " ");
const lower = normalized.toLowerCase();
const tokens = normalized.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
const hasToken = (value) => tokens.includes(value);
const hasPrefix = (...prefix) => prefix.every((part, index) => tokens[index] === part);
const hasAny = (...parts) => parts.some((part) => lower.includes(part));
const hasExplicitVitestFile = tokens.some((token) =>
  /\.(unit|integration|e2e)\.test\.ts$/.test(token)
);
const hasTestNameFilter =
  hasToken("-t") ||
  hasToken("--testNamePattern") ||
  hasToken("--test-name-pattern");
const hasFocusedVitestConfig = tokens.some((token) =>
  /vitest\.(unit|integration|e2e)\.config\.ts$/.test(token)
);
const hasPackageFilter = hasToken("--filter");
const isBroadRecursive =
  hasToken("-r") ||
  hasToken("--recursive") ||
  hasToken("--workspace-root") ||
  hasToken("--if-present");

if (hasAny(" --update", " -u", " --updatesnapshot", " --update-snapshots")) {
  block(
    "Snapshot updates are blocked by default. Re-run a focused file without update flags and edit only intentionally changed expectations."
  );
  process.exit(0);
}

if (
  lower.includes("fixture") &&
  /(regen|regenerate|refresh|rewrite|update|snapshot)/.test(lower)
) {
  block(
    "Broad fixture regeneration is blocked by default. Classify the failure first and edit only the directly justified fixture."
  );
  process.exit(0);
}

if (
  hasPrefix("pnpm", "test") ||
  hasPrefix("npm", "test") ||
  hasPrefix("yarn", "test")
) {
  block(
    "Unfiltered workspace test wrappers are blocked. Use `pnpm test:focused -- <test-file>` or `pnpm exec vitest run -c vitest.unit.config.ts --bail=1 <test-file>`."
  );
  process.exit(0);
}

if (
  hasPrefix("pnpm", "build") ||
  hasPrefix("npm", "run", "build") ||
  hasPrefix("yarn", "build") ||
  (tokens[0] === "pnpm" && isBroadRecursive && hasToken("build"))
) {
  block(
    "Workspace build commands are blocked by default during Codex tasks. Use focused tests first and only run broader verification when explicitly authorized."
  );
  process.exit(0);
}

if (
  hasPrefix("pnpm", "typecheck") ||
  hasPrefix("npm", "run", "typecheck") ||
  hasPrefix("yarn", "typecheck") ||
  (tokens[0] === "pnpm" && isBroadRecursive && hasToken("typecheck"))
) {
  block(
    "Workspace-wide typecheck is blocked by default. Use an affected-package command such as `pnpm --filter @mediaforge/story-localization typecheck` after focused tests pass."
  );
  process.exit(0);
}

if (
  hasPrefix("pnpm", "test:unit") ||
  hasPrefix("pnpm", "test:integration") ||
  hasPrefix("pnpm", "test:e2e") ||
  hasPrefix("npm", "run", "test:unit") ||
  hasPrefix("npm", "run", "test:integration") ||
  hasPrefix("npm", "run", "test:e2e") ||
  hasPrefix("yarn", "test:unit") ||
  hasPrefix("yarn", "test:integration") ||
  hasPrefix("yarn", "test:e2e")
) {
  if (!hasExplicitVitestFile) {
    block(
      "Unfiltered Vitest wrapper command blocked. Use `pnpm test:focused -- <test-file>` so the file filter is explicit."
    );
    process.exit(0);
  }
}

if (
  (hasToken("vitest") || lower.includes(" vitest ")) &&
  hasAny(" run", " watch", " --run") &&
  !hasExplicitVitestFile
) {
  block(
    "Vitest commands must include an explicit test file in this repository. Use `pnpm test:focused -- <test-file>` and add `-t <exact name>` only when needed."
  );
  process.exit(0);
}

if (
  (hasToken("pnpm") && hasToken("test:focused")) ||
  ((hasToken("vitest") || lower.includes(" vitest ")) &&
    hasFocusedVitestConfig &&
    hasExplicitVitestFile) ||
  (tokens[0] === "pnpm" && hasPackageFilter && hasToken("typecheck"))
) {
  approve();
  process.exit(0);
}

if (hasTestNameFilter && !hasExplicitVitestFile) {
  block(
    "Exact test-name filters must still be paired with an explicit test file here. Use `pnpm test:focused -- <test-file> -t <exact name>`."
  );
  process.exit(0);
}

approve();
NODE
