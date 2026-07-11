# Episode 034 Move To Episodes

Date: 2026-07-10

Summary: Moved Episode 034 full and short scripts for en/de/es/fr/pt into `episodes/034-not-my-reflection/languages/` and removed duplicate generated outputs from `content-ideas/content/dark-truth-episodes-optimized`. Changed story localization defaults to write generated stories under `./episodes` and reject `content-ideas` output roots.

Changed paths: `episodes/034-not-my-reflection/languages/*`, `content-ideas/content/dark-truth-episodes-optimized/034-not-my-reflection*`, `packages/story-localization/src/source-story-discovery.ts`, `packages/story-localization/src/story-localization.unit.test.ts`.

Tests/checks: targeted path-guard Vitest passed; `pnpm --filter @mediaforge/story-localization typecheck` passed; `git diff --check` passed; Episode 034 path/content checks passed.

Unresolved risks: full story-localization unit file still has an unrelated existing failure in `rejects localized full outputs that would require short-specific repair`.
