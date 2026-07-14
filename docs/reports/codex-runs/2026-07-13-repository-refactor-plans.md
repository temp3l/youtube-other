# Repository Refactor Plans

## Summary

Created the consolidated repository-refactor implementation plan set under
`docs/refactor/`. The plans define the audit gate, canonical architecture,
fourteen safe batches, compatibility and artifact migration, separate Dark
Truth and mathematics profiles, duplicate-removal gates, deterministic AI-pack
refresh, and final validation.

## Changed Files

- `docs/refactor/README.md`
- `docs/refactor/00-baseline-and-audit-gate.md`
- `docs/refactor/01-target-architecture.md`
- `docs/refactor/02-safe-implementation-batches.md`
- `docs/refactor/03-compatibility-and-migration.md`
- `docs/refactor/04-darktruth-profile.md`
- `docs/refactor/05-mathematics-profile.md`
- `docs/refactor/06-duplicate-elimination.md`
- `docs/refactor/07-ai-content-pack.md`
- `docs/refactor/08-validation-and-release.md`
- `docs/README.md`
- `docs/reports/codex-runs/2026-07-13-repository-refactor-plans.md`

## Checks

- `git diff --check -- docs/refactor docs/README.md docs/reports/codex-runs/2026-07-13-repository-refactor-plans.md`
- Local Markdown link-resolution check for `docs/refactor/*.md`.

## Results

- Both checks passed.

## Commit

- No commit created; current HEAD is `b67dd63`.

## Risks Remaining

- The plans require the full audit gate before any production refactor.
- Current baseline typecheck, lint, and unit failures remain pre-existing and
  are recorded in the baseline plan.

## Follow-up Tasks

- Execute Batch 0 and populate the full evidence-backed audit registers.
