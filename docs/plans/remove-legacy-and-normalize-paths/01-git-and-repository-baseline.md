# Git And Repository Baseline

## Git context

- Starting branch: `master`
- Starting commit: `12eb29f5528f6dc597721ac71f2a0cb041c3a8db`
- Planning branch: `plan/remove-legacy-and-normalize-paths`
- Remote tracking at analysis time: `master...origin/master`
- Fetch: not performed; local evidence was sufficient and branch creation did not require remote state.

## Uncommitted changes present before planning

The worktree was already dirty. Existing user changes must not be reverted. Notable modified areas:

- CLI story rewrite/localization commands and tests.
- Story localization package files and tests.
- Speech voice settings and tests.
- Metadata package.
- Documentation: `docs/README.md`, `docs/cli.md`, `docs/multilingual-story-localization-settings.md`.
- Content files for episode `022-the-whistler-in-the-woods`.
- Untracked story-short evaluation command, event planner files, endpoint audit docs, and zip/content assets.

## Tooling

- Package manager: `pnpm@10.16.0`
- Runtime: Node `>=22.0.0`
- Workspace config: `pnpm-workspace.yaml` with `apps/*` and `packages/*`
- Build: package-level `tsc -p tsconfig.json`; root `pnpm build` fans out.
- Tests: Vitest unit, integration, e2e configs.
- Focused test wrapper: `pnpm test:focused -- <test-file>`
- Lint: `node scripts/run-eslint.mjs` or targeted `pnpm exec eslint <file>`

## Primary applications

- `apps/cli`: primary operational surface.
- `apps/api`: minimal HTTP surface currently booting `@mediaforge/pipeline`.
- `apps/web`: minimal static page surface.

## Primary packages

- Active Dark Truth/story production: `@mediaforge/story-localization`, `@mediaforge/speech`, `@mediaforge/image-generation`, `@mediaforge/rendering`, `@mediaforge/metadata`, `@mediaforge/youtube-upload`.
- Shared foundations: `@mediaforge/domain`, `@mediaforge/shared`, `@mediaforge/config`, `@mediaforge/persistence`, `@mediaforge/observability`, `@mediaforge/process-runner`.
- Legacy or overlapping orchestration: `@mediaforge/pipeline`, `@mediaforge/dark-truth`.
