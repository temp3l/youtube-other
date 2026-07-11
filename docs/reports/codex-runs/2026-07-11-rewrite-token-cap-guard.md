Summary: Hardened rewrite token-cap fallback logic so full and short rewrite flows never default `retryMaxOutputTokens` below `maxOutputTokens`. Added focused regression coverage and exposed the retry env vars in `.env.example`.

Changed paths: `packages/config/src/index.ts`, `packages/config/src/index.unit.test.ts`, `apps/cli/src/story-full-rewrite-command.ts`, `apps/cli/src/story-short-rewrite-command.ts`, `apps/cli/src/story-short-rewrite-command.unit.test.ts`, `.env.example`

Tests: `pnpm exec vitest run -c vitest.unit.config.ts packages/config/src/index.unit.test.ts`; `pnpm exec vitest run -c vitest.unit.config.ts apps/cli/src/story-full-rewrite-command.unit.test.ts apps/cli/src/story-short-rewrite-command.unit.test.ts`

Commit hash: `96bc991`

Unresolved risks: Localization retry caps still rely on matching primary caps rather than a dedicated env var; existing unrelated worktree changes were left untouched.
