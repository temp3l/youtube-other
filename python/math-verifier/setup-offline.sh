#!/usr/bin/env bash

set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
wheelhouse=${MATH_VERIFIER_WHEELHOUSE:-"${1:-$root/wheelhouse}"}
venv=${MATH_VERIFIER_VENV:-"${2:-$root/.venv}"}

python3 -c 'import sys; assert (3, 11) <= sys.version_info < (3, 15), sys.version'
if [ ! -d "$wheelhouse" ]; then
  echo "wheelhouse not found: $wheelhouse" >&2
  echo "prepare it once with: $root/prepare-wheelhouse.sh $wheelhouse" >&2
  exit 66
fi

python3 -m venv "$venv"
"$venv/bin/python" -m pip install \
  --disable-pip-version-check \
  --no-index \
  --no-deps \
  --require-hashes \
  --find-links "$wheelhouse" \
  --requirement "$root/requirements.lock"
"$venv/bin/python" -m pip check
PYTHONPATH="$root/src" "$venv/bin/python" -c 'import sympy; from math_verifier import __version__; assert sympy.__version__ == "1.14.0"; assert __version__ == "2.0.0"'
PYTHONPATH="$root/src" "$venv/bin/python" -m pytest -q "$root/tests"
