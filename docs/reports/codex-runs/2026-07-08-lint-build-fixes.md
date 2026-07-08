# Lint Build Fixes

Summary: fixed one ESLint regex warning in `packages/image-generation` and one TypeScript env-access error in `packages/config`, then reran validation successfully.

Changed files: `packages/image-generation/src/image-batch-storage.ts`, `packages/config/src/index.ts`.

Tests/checks run: `pnpm lint && pnpm build`.

Results: lint passed; build passed across the workspace. Commit hash: `00c1369` (workspace currently uncommitted).

Unresolved risks: unrelated untracked files remain in the worktree; no broader tests were run beyond the requested lint/build pair.
