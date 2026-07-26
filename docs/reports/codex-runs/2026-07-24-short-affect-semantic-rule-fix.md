# Short Affect Semantic Rule Fix

## Summary

The quality gate now recognizes a supernatural rule expressed with equivalent
tense and sentence-level action wording while retaining a negative unrelated-
activity check. The repeated-run fixture now uses the immutable validated full
artifact and permits intentional canonical-source rematerialization.

## Changed Paths

- `packages/story-localization/src/story-quality-gate.ts`
- `packages/story-localization/src/story-quality-gate.unit.test.ts`
- `packages/story-localization/src/short-rewrite.service.unit.test.ts`
- Required plan/run reports

## Checks

- Semantic rule regression: 1 passed.
- Enforce persistence and plan-change resume identity: 2 passed.
- `@mediaforge/story-localization` typecheck: passed.
- Targeted `git diff --check`: passed.

## Risks

No remaining Task 04 persistence/resume defect is known. Production evaluation,
analytics authorization, thresholds, and rollout approval remain intentionally
unresolved; rollout stays `shadow`. No provider or publication action ran.

## Commit

`f29a43c` (changes uncommitted).
