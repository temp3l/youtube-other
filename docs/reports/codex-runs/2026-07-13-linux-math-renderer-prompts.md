# Linux math renderer completion prompts

## Summary

Created three ordered, bounded implementation prompts for educational-renderer release acceptance,
visual correctness, and operational completeness. Added an index describing dependencies and isolation.

## Changed paths

- `docs/plans/linux-math-renderer/README.md`
- `docs/plans/linux-math-renderer/01-release-acceptance.md`
- `docs/plans/linux-math-renderer/02-visual-correctness.md`
- `docs/plans/linux-math-renderer/03-operational-completeness.md`
- This report.

## Tests

Docs-only: `git diff --check -- docs/plans/linux-math-renderer docs/reports/codex-runs/2026-07-13-linux-math-renderer-prompts.md` passed, exit 0. No code tests required.

## Commit

Current baseline: `69f26d39516bf3b507d562417e87992d46490fa1`. No commit created.

## Risks

Prompts depend on sequential execution and current package source. Hardware acceptance remains host-dependent.
