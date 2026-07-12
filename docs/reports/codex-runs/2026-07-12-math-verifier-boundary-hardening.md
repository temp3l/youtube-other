# Math verifier boundary hardening

Date: 2026-07-12  
Backlog item: `docs/mathe/audits/remediation-backlog.md` R-002  
Commit baseline: `ac21261` (work remains uncommitted)

## Summary

Added one-settlement process handling, process-group timeout termination,
bounded stdout/stderr, strict stderr and version/identity checks, and structured
blocking error codes. Added a fully pinned hash lock, wheelhouse preparation,
and an offline-only setup/test command.

## Changed files

- `packages/math-education/src/verification/{protocol-schemas,sympy-adapter}.ts`
- `packages/math-education/src/verification/sympy-adapter.integration.test.ts`
- `python/math-verifier/{requirements.lock,prepare-wheelhouse.sh,setup-offline.sh,README.md,.gitignore}`
- `python/math-verifier/tests/test_worker.py`
- Mathematics remediation audit/backlog and reports

## Checks and results

- Boundary integration: 11 passed.
- Fresh offline locked environment: 30 passed; `pip check` passed.
- Math-education typecheck, targeted Prettier, and `git diff --check`: passed.

## Independent acceptance

Accepted 2026-07-12 after source review and an enhanced timeout fixture proved
that a descendant could not write its delayed survival sentinel.

## Risks and follow-up

Windows process-tree behavior remains a platform risk. Protocol-v1 cache
quarantine remains required. No paid provider or publish operation ran. This
task was not based on `docs/plans/*`.
