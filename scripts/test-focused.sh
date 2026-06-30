#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "usage: pnpm test:focused -- <test-file> [vitest args]" >&2
  exit 64
fi

if [ "${1:-}" = "--" ]; then
  shift
fi

if [ "$#" -lt 1 ]; then
  echo "usage: pnpm test:focused -- <test-file> [vitest args]" >&2
  exit 64
fi

test_file=$1
shift

if [[ "$test_file" == -* ]]; then
  echo "test:focused requires the test file as the first argument." >&2
  exit 64
fi

if [ ! -f "$test_file" ]; then
  echo "test file not found: $test_file" >&2
  exit 66
fi

case "$test_file" in
  *.unit.test.ts)
    config_file="vitest.unit.config.ts"
    ;;
  *.integration.test.ts)
    config_file="vitest.integration.config.ts"
    ;;
  *.e2e.test.ts)
    config_file="vitest.e2e.config.ts"
    ;;
  *)
    echo "unsupported test file suffix: $test_file" >&2
    echo "expected one of *.unit.test.ts, *.integration.test.ts, or *.e2e.test.ts" >&2
    exit 64
    ;;
esac

exec pnpm exec vitest run -c "$config_file" --bail=1 "$test_file" "$@"
