#!/usr/bin/env bash

set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
wheelhouse=${1:-"$root/wheelhouse"}
python_bin=${MATH_VERIFIER_PREPARE_PYTHON:-python3}

"$python_bin" - <<'PY'
import sys

version = sys.version_info
if not ((3, 11) <= version[:2] < (3, 15)):
    print(
        "math-verifier wheelhouse preparation requires Python >=3.11,<3.15; "
        f"got {sys.version.split()[0]}",
        file=sys.stderr,
    )
    raise SystemExit(65)
PY

mkdir -p "$wheelhouse"
"$python_bin" -m pip download \
  --only-binary=:all: \
  --implementation py \
  --python-version 3.11 \
  --abi none \
  --platform any \
  --no-deps \
  --require-hashes \
  --dest "$wheelhouse" \
  --requirement "$root/requirements.lock"
