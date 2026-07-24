# Educational practice sequence

Date: 2026-07-24

## Summary

Made three elements mandatory in the shared math-education video path: a
distinct second example attempted without its answer, a short fact-bound
misconception question, and a final fact-free retrieval question. Place-value
lessons additionally require a different zero-position pattern. Narration,
review evidence, board titles, prompts, and captions now reflect the contract.

## Changed files

- `packages/math-education/src/lesson/*`
- `packages/math-education/src/localization/*`
- `packages/math-education/src/orchestration/canonical-task-adapters.ts`
- `apps/cli/src/math-workflow-runtime.ts`
- `apps/cli/src/math-workflow-runtime.unit.test.ts`
- `docs/architecture/system-overview.md`

## Checks and results

- Focused Vitest: lesson, production-content, localization, and CLI runtime
  contracts passed; final validation covered 20 tests.
- Exact 37-lesson German narration budget/review test passed.
- Math-education typecheck and targeted ESLint passed.
- `git diff --check` passed.

## Risks and follow-up

Lesson and narration hashes changed intentionally. Exact external review or
approval evidence must be renewed before production publication. No media,
provider calls, or publication were run.
