#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
expected_version="$(node --input-type=module -e '
  import fs from "node:fs";
  import path from "node:path";

  const repoRoot = process.argv[1];
  const packageJsonPath = path.join(repoRoot, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const packageManager = String(packageJson.packageManager ?? "");
  const match = packageManager.match(/^pnpm@(.+)$/u);

  if (!match) {
    throw new Error(`Expected packageManager to be pinned to pnpm@<version>, received: ${packageManager || "<missing>"}`);
  }

  process.stdout.write(match[1]);
' "$repo_root")"

pnpm_home="${PNPM_HOME:-$HOME/npm}"
pnpm_bin="$pnpm_home/bin/pnpm"

ensure_pnpm() {
  if [ -x "$pnpm_bin" ]; then
    local current_version
    current_version="$("$pnpm_bin" --version 2>/dev/null || true)"
    if [ "$current_version" = "$expected_version" ]; then
      return 0
    fi
  fi

  npm install -g "pnpm@$expected_version" --prefix "$pnpm_home" --force >/dev/null

  if [ ! -x "$pnpm_bin" ]; then
    printf 'Failed to install pnpm %s at %s\n' "$expected_version" "$pnpm_bin" >&2
    exit 1
  fi

  local installed_version
  installed_version="$("$pnpm_bin" --version)"
  if [ "$installed_version" != "$expected_version" ]; then
    printf 'Expected pnpm %s but found %s at %s\n' "$expected_version" "$installed_version" "$pnpm_bin" >&2
    exit 1
  fi
}

ensure_pnpm

if [ "$#" -eq 0 ]; then
  exec "$pnpm_bin" --version
fi

exec "$pnpm_bin" "$@"
