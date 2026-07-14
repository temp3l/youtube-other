# Baseline Stabilization: Resolver and Rendering Fixtures

## Summary

Continued Batch 1 through F02-F03 and F23. Resolver fixtures now remove the
canonical script when testing stale layouts and legacy fallback attempts,
preserving canonical-first production behavior. F23 now uses a valid 16:9
profile for its shared-clips-directory test. No production behavior changed.

## Changed files

- `apps/cli/src/episode-commands.unit.test.ts`
- `packages/rendering/src/index.unit.test.ts`
- `docs/refactor/audit/README.md`
- This report.

## Tests/checks run and results

- Episode-command unit file: initially failed at F02, then passed 28/28.
- Exact F23 rendering test: reproduced the profile mismatch, then passed after
  the target fixture was corrected.
- Targeted ESLint for both changed test files: passed.
- Targeted `git diff --check`: passed.

## Risks and follow-up

The complete rendering file was not conclusively verified; only F23 is green.
Batch 1 remains `IN_PROGRESS`. Reconfirm F24 in the full-story-contract unit
file next, then reconcile F25 if the contract test is green. Batch 2 remains
blocked.
