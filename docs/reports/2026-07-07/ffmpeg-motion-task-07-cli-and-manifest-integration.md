# FFmpeg Motion Task 07 CLI And Manifest Integration

Source plan file path: `docs/plans/ffmpeg-motion-presets/tasks/task-07-cli-and-manifest-integration.md`
Date of execution: 2026-07-07

Summary of implemented changes:
- Added `render` flags: `--motion`, `--no-motion`, `--motion-mode`, `--motion-seed`, `--motion-debug`, `--motion-render-preset`.
- Kept visual-retention `--motion-preset` unchanged.
- Persisted render-motion config in render manifests and dry-run output.

Files changed:
- `apps/cli/src/index.ts`
- `apps/cli/src/render-motion-options.ts`
- `apps/cli/src/render-motion-options.unit.test.ts`
- `packages/rendering/src/index.ts`
- `packages/rendering/src/index.unit.test.ts`
- `packages/rendering/src/motion/types.ts`
- `packages/rendering/src/motion/config.ts`
- `packages/rendering/src/motion/config.unit.test.ts`

Tasks completed:
- Added render-motion CLI flags and clear invalid preset validation.
- Added additive render manifest `motion` metadata.
- Added help, valid preset, invalid preset, no-conflict, and manifest tests.

Tasks partially completed:
- None.

Tasks not completed:
- Episode production flags were not added; renderer integration remains top-level `render`.

Deviations from the original plan:
- CLI helper uses a local preset ID list because the runtime package entry points at stale `dist` during source tests.

Tests/checks run:
- `pnpm test:focused -- apps/cli/src/render-motion-options.unit.test.ts`
- `pnpm test:focused -- packages/rendering/src/motion/config.unit.test.ts packages/rendering/src/index.unit.test.ts`
- `pnpm --filter @mediaforge/cli --filter @mediaforge/rendering typecheck`

Test results:
- CLI helper passed: 5 tests.
- Rendering tests passed: 27 tests.
- CLI and rendering typechecks passed.

Known risks or follow-up work:
- Runtime `dist` remains stale until a normal package build.

Recommended next steps:
- Update operator docs/reporting for final flag names.
