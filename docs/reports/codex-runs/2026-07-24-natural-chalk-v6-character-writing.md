# Natural chalk v6 character writing

Date: 2026-07-24

## Changed files

- `packages/math-rendering/src/composition/natural-chalk.ts`
- `packages/math-rendering/src/composition/natural-chalk.unit.test.ts`
- `packages/math-rendering/src/composition/semantic-chalk.ts`
- `packages/math-rendering/src/composition/semantic-chalk.unit.test.ts`
- `packages/math-rendering/src/composition/remotion-runner.ts`
- `packages/math-rendering/src/composition/composition.ts`
- `packages/math-rendering/src/composition/remotion-entry.tsx`
- `packages/math-education/src/orchestration/canonical-task-adapters.ts`
- `packages/math-education/src/orchestration/canonical-private-media.unit.test.ts`
- `apps/cli/src/math-workflow-runtime.ts`
- `apps/cli/src/math-commands.ts`
- `apps/cli/src/math-commands.unit.test.ts`
- `docs/architecture/media-assets-and-delivery.md`
- `docs/cli.md`
- `.cache/math-pipeline/natural-chalk-v6-fixtures/`
- `.cache/math-pipeline/m5-zo-001-natural-chalk-v6-acceptance/`

## Analysis and implemented repair

The v5 renderer left a stroke paint on `opacity="0"` tspans, which librsvg
rendered as faint future-glyph outlines. Only the active step was transformed,
so completed writing reverted to clean digital text. The renderer sampled every
step exactly eight times, making long sentences appear in multi-character
chunks. Its 0.42 px displacement was also too subtle to look chalky.

V6 makes pending glyphs paint-free and hidden, preserves spaces, retains
deterministic per-glyph treatment after completion, uses a rough displaced edge
plus deterministic interior dropout mask, and samples text steps at grapheme
boundaries with a 36-sample production cap. The keyframe runner is now v8.

## Tests and checks

- Focused Vitest: 2 files, 10 tests passed.
- Focused CLI fixture test: 1 passed, 16 skipped.
- Math-rendering TypeScript build passed.
- Targeted ESLint passed.
- Six-second H.264 character-writing preview and high-resolution chalk detail
  were visually inspected.
- Approved audio remained byte-identical at `ea6853…4f57`.
- No provider, upload, or publication action ran.

## Risk and follow-up

The complete five-minute v6 render did not finish. Full raster attempts were
terminated with exit 143 after 268 and 471 frames; the final bounded retry was
also terminated. No v6 final MP4 exists. The owning module is
`composition/remotion-runner.ts`; the smallest follow-up is isolated,
resumable scene raster workers with bounded process lifetime, followed by the
same full acceptance render.
