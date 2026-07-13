# A-001 packaged CLI report

Date: 2026-07-13

Summary: restored plain Node runtime resolution for `@mediaforge/math-education` by exporting built `dist/index.js` while retaining source `types`. Added focused packaged-entrypoint E2E coverage for copied math package import, root help, horror help, math help, curriculum validate, and curriculum import dry-run. Extended `test:cli-packaged` to include A-001 root/math checks.

Changed paths:
- `packages/math-education/package.json`
- `apps/cli/src/packaged-cli.e2e.test.ts`
- `package.json`
- `docs/reports/codex-runs/2026-07-13-a001-packaged-cli.md`

Checks run:
- `pnpm test:focused -- apps/cli/src/packaged-cli.e2e.test.ts` — passed, 3 tests.
- `pnpm test:cli-packaged` — passed.
- `pnpm --filter @mediaforge/math-education build` — passed.

Risks remaining: no full repo build/test/lint/typecheck was run by request; unrelated dirty worktree remains.

Follow-ups: proceed to A-002 only after A-001 acceptance.
