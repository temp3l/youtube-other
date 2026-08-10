# Persistence build fix

- Summary: corrected index-signature property access in the revision analytics PostgreSQL row mapper.
- Changed paths: `packages/persistence/src/postgres-revision-analytics-repository.ts`; this report.
- Tests/checks: `pnpm --filter @mediaforge/persistence build` (passed); `pnpm build` (passed); `git diff --check` (passed).
- Commit: `7c87abc` (pre-existing HEAD; no commit created).
- Risks/follow-up: no known remaining build issues. Existing untracked content-pack files were preserved.
