# Math raster resume and v6 acceptance

## Summary

The semantic raster stage now uses scene-bounded batches of at most eight PNGs
in short-lived, single-worker Node/Sharp subprocesses. Existing checkpoints are
validated before reuse, completed batches are revalidated, and an atomic
progress manifest records scene and overall progress. Runner provenance is v9.

The full M5-ZO-001 v6 render completed 1,819 raster checkpoints, nine scene
videos, and the five-minute mux. Approved narration remained byte-identical at
`ea6853…4f57`; no provider or publication actions ran.

## Changed paths

- `packages/math-rendering/src/composition/remotion-runner.ts`
- `packages/math-rendering/src/composition/remotion-runner.unit.test.ts`
- `docs/architecture/media-assets-and-delivery.md`
- `.cache/math-pipeline/m5-zo-001-natural-chalk-v6-acceptance/`

## Tests

- Focused Vitest: 1 file, 3 tests passed.
- `@mediaforge/math-rendering` build passed.
- Full render validation passed: 1920×1080, 30 fps, 300.002 seconds, H.264/AAC.
- Targeted diff check passed.

## Commit hash

`f29a43c2eef25f185b60a20c4e56ea4598279115` (worktree uncommitted)

## Unresolved risks

The CLI build is blocked by an unrelated story-analysis type error. The active
grapheme still traces a full font outline before filling; the next visual task
is true centerline chalk strokes.
