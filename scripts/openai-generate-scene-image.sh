#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${#}" -lt 2 ]]; then
  printf 'usage: %s <episode-id> <scene-id> [scene-id ...]\n' "$0" >&2
  exit 2
fi

# Batch 11 compatibility adapter. Planning, references, provider selection,
# cache/state, dimensions, artifact promotion, and retries stay in the
# registered darktruth.scene-images task reached by the CLI.
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
episode_id="$1"
shift

for scene_id in "$@"; do
  node "${root_dir}/apps/cli/bin/mediaforge.js" images generate \
    --episode "${episode_id}" \
    --scene "${scene_id}"
done
