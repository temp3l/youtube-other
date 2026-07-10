Summary: Changed CLI render caption behavior to opt-in. `render`, `stories render`, and `stories render validate` now leave burned-in captions off unless `--captions` is passed. Dry-run output only includes `captionedPath` when captions are explicitly enabled. Focused tests also fixed path/fixture issues in `story-render-command.unit.test.ts`.

Changed paths: `apps/cli/src/index.ts`, `apps/cli/src/story-render-command.ts`, `apps/cli/src/story-render-command.unit.test.ts`, `docs/cli.md`, `docs/story-to-video.md`

Tests: `pnpm test:focused -- apps/cli/src/story-render-command.unit.test.ts` (pass); `git diff --check -- apps/cli/src/index.ts apps/cli/src/story-render-command.ts apps/cli/src/story-render-command.unit.test.ts docs/cli.md docs/story-to-video.md` (pass); `pnpm --filter @mediaforge/cli typecheck` (fails on pre-existing errors in `packages/rendering/src/index.ts:1406` and `:1411`)

Commit hash: `9e3ba73`

Unresolved risks: CLI package typecheck is still blocked by unrelated branded `SceneId` errors in `packages/rendering/src/index.ts`, so full package type safety was not re-established by this task.
