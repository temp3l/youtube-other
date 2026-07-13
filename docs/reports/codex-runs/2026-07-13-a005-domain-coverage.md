# A-005 domain coverage

Summary: implemented A-005 under explicit user gate override. Verifier protocol moved
to `math-verifier.v3` / `math-spec.v3` / `3.0.0`, quarantining old v2 artifacts by
schema identity. Added independent exact support for finite real equation systems,
additional geometry/measurement formulas, graph discontinuity/domain blocking, path-sum
probability, and four-field table totals/joint/conditional ratios. Unsupported or
underdetermined models still fail closed.

Changed paths: `packages/math-education/src/domain/{math-ast.ts,lesson.ts,lesson.unit.test.ts}`,
`packages/math-education/src/verification/protocol-schemas.ts`,
`packages/math-education/src/orchestration/{artifact-schemas.ts,pilot-simulation.ts}`,
`packages/math-education/src/localization/localization.unit.test.ts`,
`packages/math-education/src/verification/sympy-adapter.integration.test.ts`,
`python/math-verifier/src/math_verifier/{__init__.py,worker.py,checks.py}`,
`python/math-verifier/tests/{test_domain_checks.py,test_worker.py}`.

Tests: Python focused verifier suite passed, 48 tests; TS domain unit command passed, 6
tests; TS adapter integration passed, 17 tests. Typecheck not run due command budget.

Commit: not committed.

Risks: A-003/A-004 evidence was bypassed by request, not independently accepted.
