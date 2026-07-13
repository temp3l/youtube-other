# Educational renderer audit repair plan

Date: 2026-07-13

## Changed files

- `docs/plans/linux-math-renderer/00-audit-blocker-repairs.md`
- `docs/plans/linux-math-renderer/README.md`
- `docs/reports/codex-runs/2026-07-13-educational-renderer-audit-repair-plan.md`

## Tests and checks

- Targeted plan-directory inspection: passed.
- `git diff --check` for changed documentation: passed, exit 0.

## Result

Added a mandatory Batch 0 ahead of the existing release, visual-correctness, and operational-completeness
plans. It orders the independent audit findings by merge risk: change-set isolation, critical filesystem
containment, CLI semantics, packed-package acceptance, dependency enforcement, public error sanitization,
then the existing dependent repair batches.

## Risks and follow-up

This task changed documentation only. No renderer fix was implemented or verified. Batch 0 requires an
independent follow-up security audit before final acceptance.
