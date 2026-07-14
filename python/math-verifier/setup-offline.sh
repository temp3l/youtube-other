#!/usr/bin/env bash

set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
wheelhouse=${MATH_VERIFIER_WHEELHOUSE:-"${1:-$root/wheelhouse}"}
venv=${MATH_VERIFIER_VENV:-"${2:-$root/.venv}"}
python_bin=${MATH_VERIFIER_BOOTSTRAP_PYTHON:-python3}

"$python_bin" - <<'PY'
import sys

version = sys.version_info
if not ((3, 11) <= version[:2] < (3, 15)):
    print(
        "math-verifier offline setup requires Python >=3.11,<3.15; "
        f"got {sys.version.split()[0]}",
        file=sys.stderr,
    )
    raise SystemExit(65)
PY

if [ ! -d "$wheelhouse" ]; then
  echo "wheelhouse not found: $wheelhouse" >&2
  echo "prepare it once with: $root/prepare-wheelhouse.sh $wheelhouse" >&2
  exit 66
fi
if [ -e "$venv" ] && [ ! -f "$venv/pyvenv.cfg" ]; then
  echo "target venv path exists but is not a Python virtual environment: $venv" >&2
  exit 66
fi

"$python_bin" - "$root/requirements.lock" "$wheelhouse" <<'PY'
from __future__ import annotations

import pathlib
import re
import sys

requirements = pathlib.Path(sys.argv[1])
wheelhouse = pathlib.Path(sys.argv[2])
requirement_pattern = re.compile(r"^\s*([A-Za-z0-9_.-]+)==([^\s\\]+)")


def normalize(value: str) -> str:
    return re.sub(r"[-_.]+", "_", value).lower()


expected = []
for line in requirements.read_text(encoding="utf8").splitlines():
    match = requirement_pattern.match(line)
    if match:
        expected.append((normalize(match.group(1)), match.group(2)))

wheels = sorted(wheelhouse.glob("*.whl"))
if not wheels:
    print(f"wheelhouse contains no wheels: {wheelhouse}", file=sys.stderr)
    print(f"prepare it once with: {requirements.parent / 'prepare-wheelhouse.sh'} {wheelhouse}", file=sys.stderr)
    raise SystemExit(66)

problems = []
for name, version in expected:
    matches = []
    compatible = []
    for wheel in wheels:
        parts = wheel.name.split("-")
        if len(parts) < 5:
            continue
        if normalize(parts[0]) == name and parts[1] == version:
            matches.append(wheel.name)
            if wheel.name.endswith("-py3-none-any.whl"):
                compatible.append(wheel.name)
    if compatible:
        continue
    package = f"{name.replace('_', '-')}=={version}"
    if matches:
        problems.append(
            f"{package}: found wheels with unsupported tags {matches}; "
            "expected py3-none-any from prepare-wheelhouse.sh"
        )
    else:
        problems.append(
            f"{package}: missing wheel; rerun prepare-wheelhouse.sh for this requirements.lock"
        )

if problems:
    print("math-verifier wheelhouse is incomplete or incompatible:", file=sys.stderr)
    for problem in problems:
        print(f"  - {problem}", file=sys.stderr)
    raise SystemExit(66)
PY

PIP_NO_INDEX=1 "$python_bin" -m venv --clear "$venv"
PIP_NO_INDEX=1 "$venv/bin/python" -m pip install \
  --disable-pip-version-check \
  --no-index \
  --no-deps \
  --only-binary=:all: \
  --require-hashes \
  --find-links "$wheelhouse" \
  --requirement "$root/requirements.lock"
"$venv/bin/python" -m pip check
PYTHONPATH="$root/src" "$venv/bin/python" - <<'PY'
import sympy
from math_verifier import __version__

if sympy.__version__ != "1.14.0":
    raise SystemExit(f"unexpected SymPy version: {sympy.__version__}")
if __version__ != "3.0.0":
    raise SystemExit(f"unexpected math verifier version: {__version__}")
PY
PYTHONPATH="$root/src" "$venv/bin/python" -m pytest -q "$root/tests"
