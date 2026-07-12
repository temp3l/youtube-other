# Episode 040 YouTube Upload

Summary: Fixed CLI/upload locale and asset-resolution regressions, then uploaded the remaining episode `040-room-1413` videos privately: English full `clrAOnBjbYA`, English short `j-ljhkKEjH4`, and German short `p7ecVGHefGs`. German full remained uploaded as `qgWUkCbBPxs`. Commit: `8cc3876`.

Changed paths: `apps/cli/src/index.ts`, `packages/youtube-upload/src/index.ts`, `packages/youtube-upload/src/index.unit.test.ts`, `episodes/040-room-1413/state/upload/reports/youtube-upload.{json,md}`, `docs/reports/codex-runs/2026-07-12-episode-040-youtube-upload.md`.

Tests/checks: `pnpm exec vitest run -c vitest.unit.config.ts packages/youtube-upload/src/index.unit.test.ts`; `pnpm --filter @mediaforge/youtube-upload build`; `pnpm --filter @mediaforge/cli build`; `pnpm mediaforge -- --language de --dry-run metadata generate 040-room-1413`; live uploads with explicit English full/short and German short video paths plus local thumbnail override.

Unresolved risks: upload report storage is still single-target and now reflects the last upload (German short); short uploads rely on upload-time generated metadata rather than a committed short-specific YouTube metadata file; English full still required explicit `--video-path`/`--metadata-path` because canonical render discovery misses `en/full/video/*`.
