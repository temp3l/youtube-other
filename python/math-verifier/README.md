# Math verifier environment

The worker runs without network access. Build the wheelhouse once on a connected
machine, then install and test only from the hash-locked wheel set:

```bash
python/math-verifier/prepare-wheelhouse.sh /path/to/math-verifier-wheels
MATH_VERIFIER_WHEELHOUSE=/path/to/math-verifier-wheels \
  python/math-verifier/setup-offline.sh
```

`setup-offline.sh` creates `python/math-verifier/.venv`, uses `--no-index` and
`--require-hashes`, checks the pinned verifier/SymPy identities, and runs the
Python suite. Use it for the TypeScript integration test:

```bash
MATH_VERIFIER_PYTHON=python/math-verifier/.venv/bin/python \
  pnpm test:focused -- \
  packages/math-education/src/verification/sympy-adapter.integration.test.ts
```

Do not add the wheelhouse or virtual environment to source control.
