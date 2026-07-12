#!/usr/bin/env bash

set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
wheelhouse=${1:-"$root/wheelhouse"}

mkdir -p "$wheelhouse"
python3 -m pip download \
  --only-binary=:all: \
  --require-hashes \
  --dest "$wheelhouse" \
  --requirement "$root/requirements.lock"
