# Math verifier environment

The verifier is pinned to Python `>=3.11,<3.15`, SymPy `1.14.0`, pytest
`8.4.1`, and the transitive packages in `requirements.lock`. The current lock is
pure Python, so the approved wheelhouse contains only `py3-none-any` wheels.

Build the wheelhouse only during an explicit preparation step on a connected
machine:

```bash
python/math-verifier/prepare-wheelhouse.sh /path/to/math-verifier-wheels
```

Runtime setup must use that wheelhouse with package-index access disabled:

```bash
MATH_VERIFIER_WHEELHOUSE=/path/to/math-verifier-wheels \
  python/math-verifier/setup-offline.sh
```

`setup-offline.sh` recreates `python/math-verifier/.venv`, preflights the
wheelhouse for missing or incompatible wheels, installs with `--no-index`,
`--only-binary`, and `--require-hashes`, checks the pinned verifier/SymPy
identities, and runs the Python suite. Use the resulting interpreter for the
TypeScript integration test:

```bash
MATH_VERIFIER_PYTHON=python/math-verifier/.venv/bin/python \
  pnpm test:focused -- \
  packages/math-education/src/verification/sympy-adapter.integration.test.ts
```

Do not add the wheelhouse or virtual environment to source control.
