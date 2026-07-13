# A-002 Offline SymPy

Summary: added explicit `py3-none-any` wheelhouse preparation, offline venv
recreation with `--no-index`, `--only-binary`, `--require-hashes`, wheel
preflight diagnostics, pinned identity checks, and broader adapter boundary
coverage. Also fixed relative `MATH_VERIFIER_PYTHON` resolution.

Changed paths: `python/math-verifier/README.md`,
`python/math-verifier/prepare-wheelhouse.sh`,
`python/math-verifier/setup-offline.sh`,
`python/math-verifier/tests/test_worker.py`,
`packages/math-education/src/verification/sympy-adapter.ts`,
`packages/math-education/src/verification/sympy-adapter.integration.test.ts`,
this report.

Tested platform/Python: Linux x86_64, CPython 3.11.2,
`cpython-311-x86_64-linux-gnu`; wheel tag `py3-none-any`.

Commands/results: `python/math-verifier/prepare-wheelhouse.sh
/tmp/math-verifier-wheels-a002` passed with approved network; `MATH_VERIFIER_WHEELHOUSE=/tmp/math-verifier-wheels-a002
python/math-verifier/setup-offline.sh` passed, 31 tests; adapter focused test
first failed on relative executable ENOENT, then passed, 17 tests; `pnpm
--filter @mediaforge/math-education typecheck` passed.

Not verified: Windows/macOS or Python 3.12-3.14 runtime execution.

Commit hash: not committed.

A-002 acceptance recommendation: accept for this tested platform; keep
cross-platform runtime smoke as follow-up.
