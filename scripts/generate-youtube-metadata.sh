#!/usr/bin/env bash
set -Eeuo pipefail

# Batch 11 compatibility adapter. Provider, prompt, validation, retry, artifact,
# and output policy are owned by the registered darktruth.metadata task.
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "${root_dir}/apps/cli/bin/mediaforge.js" metadata youtube "$@"
