# Math verifier domain remediation

Date: 2026-07-12  
Backlog item: `docs/mathe/audits/remediation-backlog.md` R-001  
Commit baseline: `ac21261` (work remains uncommitted)

## Summary

Replaced generic domain equality with exact, independently derived unit,
graph/function, geometry, and probability checks. Added mandatory TypeScript
evidence schemas and explicitly migrated the wire contract to
`math-verifier.v2` / `math-spec.v2`; verifier version is now `2.0.0`.

## Changed files

- `packages/math-education/src/domain/{math-ast,lesson}.ts`
- `packages/math-education/src/domain/lesson.unit.test.ts`
- `packages/math-education/src/verification/{protocol-schemas,sympy-adapter}.ts`
- `packages/math-education/src/verification/sympy-adapter.integration.test.ts`
- `python/math-verifier/{pyproject.toml,src/math_verifier/{__init__,checks,protocol,worker}.py,tests/{test_worker,test_domain_checks}.py}`
- Mathematics audit/backlog status notes and this report

## Checks and results

- Python focused suite: 29 passed.
- Domain schema unit test: 5 passed.
- SymPy adapter integration: 1 passed.
- `@mediaforge/math-education` typecheck: passed.
- Targeted Prettier: passed.

## Independent acceptance

Accepted 2026-07-12 after source review and independent reruns: Python 29
passed, TypeScript schema 5 passed, and SymPy integration 1 passed.

## Remaining risks and follow-up

Protocol-v1 cached verifier results must be quarantined. R-002 process and
provisioning hardening is implemented but awaits independent acceptance. No
paid provider or publish operation ran. This task was not executed from
`docs/plans/*`.
