# M2-001 post-refactor mathematics audit

## Summary

Refreshed the current mathematics audit and dependency-ordered M2 backlog. The
verdict is fail for canonical private production: all 18 math workflow tasks are
unbound, legacy production remains simulation-backed, curriculum/content remain
draft, and offline verifier bootstrap checks obsolete version `2.0.0`. Updated
later prompts only where current source changed prerequisites or claims.

## Changed paths

- `docs/mathe/audits/{post-refactor-implementation-audit,remediation-backlog-v2}.md`
- `todo-prompts/math-2/{README,02-production-workflow-adapters,04-class5-number-operations-core,05-class5-fractions-decimals,06-class5-geometry-measurement,07-class5-data-diagrams,08-production-speech-rendering}.md`
- This report.

## Tests/checks

- Registry focused test: 1/1 passed.
- Packaged CLI E2E: 4/4 passed.
- SymPy adapter integration: 17/17 passed.
- Current CLI curriculum/legacy-plan/lesson-graph probes and targeted source/Git
  inspection completed; graph showed 18/18 implementations unbound.
- Targeted Prettier and `git diff --check`: passed after formatting three docs.

Commit: `7d8c03ff18891058889c594741e56e516f552fee` (not committed by this task).

## Unresolved risks / next task

No renderer, provider, publish, broad gate, or independent acceptance ran. Start
M2-002 and M2-003; M2-003 remains a human/external review gate.
