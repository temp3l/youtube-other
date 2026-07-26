# Analysis V2 And Evidence Gates

## Summary

Task 06 adds explicit `v2` analysis inside the existing pipeline. It validates
paragraph spans and affect IDs, persists deterministic results separately, and
keeps seven qualitative dimensions advisory. V1 remains default/readable;
production thresholds are unchanged and deterministic failures take precedence.

## Changed Paths

- Analysis contract/service/persistence/tests; quality/workflow gates/tests;
  analysis CLI/test; architecture/CLI docs; required reports.

## Checks

- `pnpm test:focused -- packages/story-localization/src/story-production-analysis.unit.test.ts`: 11 passed.
- `pnpm test:focused -- packages/story-localization/src/story-workflow-quality.unit.test.ts -t "keeps weak Analysis V2 dimensions advisory without changing production thresholds"`: 1 passed.
- `pnpm test:focused -- apps/cli/src/story-analysis-command.unit.test.ts -t "prints JSON for stories analyze and sets exit code on gate failure"`: 1 passed.
- `pnpm --filter @mediaforge/story-localization typecheck`: failed on five
  Task 06 union-narrowing/compatibility errors; all were repaired, but the
  command was not rerun under the single-typecheck limit.
- `git diff --check`: passed.

## Risks And Incomplete Work

Final repaired typecheck state is unverified. No Task 05 error surfaced before
the Task 06 failures. No provider, analytics, production, repair, or fixture
call ran. Task 07 was not started.

## Commit

`f29a43c` (changes uncommitted).
