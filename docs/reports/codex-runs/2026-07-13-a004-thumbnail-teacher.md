Summary: Implemented A-004 simulation thumbnail repairs: locale text/formula bounds now scale deterministically; placeholder teacher art renders only with explicit `simulation-placeholder` classification; publish preflight rejects placeholder versions even when approval fields are forged.

Changed paths: `packages/math-rendering/src/thumbnail/math-thumbnail.ts`; `packages/math-rendering/src/thumbnail/math-thumbnail.unit.test.ts`; `packages/math-education/src/orchestration/artifact-schemas.ts`; `apps/cli/src/math-commands.ts`; `apps/cli/src/math-commands.unit.test.ts`; this report.

Tests: `pnpm --filter @mediaforge/math-education build` passed; `pnpm test:focused -- packages/math-rendering/src/thumbnail/math-thumbnail.unit.test.ts` passed, 10 tests; `pnpm test:focused -- apps/cli/src/math-commands.unit.test.ts` passed, 10 tests; `pnpm --filter @mediaforge/math-education --filter @mediaforge/math-rendering --filter @mediaforge/cli typecheck` passed.

Commit: not committed.

Risks: A-003 remains not accepted, so public pilot acceptance remains blocked. No approved non-placeholder teacher artwork or license/provenance evidence exists in repository assets; publish acceptance is intentionally unsatisfied.
