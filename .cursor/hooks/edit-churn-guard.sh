#!/usr/bin/env bash

set -euo pipefail

payload_file=$(mktemp)
trap 'rm -f "$payload_file"' EXIT

cat >"$payload_file"

hook_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$hook_dir/edit-churn-guard.mjs" "$payload_file"
