#!/usr/bin/env bash
set -euo pipefail

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required for veronica render verification" >&2
  exit 1
fi

export VERONICA_FFMPEG_RENDER=1
exec pnpm test:focused -- packages/veronica-media/src/rendering/render.integration.test.ts
