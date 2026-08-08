#!/usr/bin/env bash

set -euo pipefail

payload_file=$(mktemp)
trap 'rm -f "$payload_file"' EXIT

cat >"$payload_file"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$script_dir/codex-command-guard.mjs" "$payload_file"
