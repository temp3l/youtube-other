# Centerline chalk v7 fixture

## Summary

Supported text now renders as handcrafted single-line SVG glyphs. Each
grapheme reveals its pen strokes by path length; pending glyphs contain no
geometry. Completed writing retains deterministic perturbation, a displaced
dust pass, grain, and dropout. The accepted contract is
`math-semantic-chalk.v7` with runner v10.

The eight-second 1920×1080 preview covers “Wo gehören die Nullen hin?” and
`700.000 + 30.000 + 400 + 5`. Frame-strip inspection passed. No full lesson,
provider, or publication action ran.

## Changed paths

- `packages/math-rendering/src/composition/{centerline-chalk-font,natural-chalk,semantic-chalk,composition,remotion-entry,remotion-runner}*`
- `packages/math-education/src/orchestration/{canonical-task-adapters,canonical-private-media.unit.test}.ts`
- `apps/cli/src/{math-workflow-runtime,math-commands,math-commands.unit.test}.ts`
- `docs/{architecture/media-assets-and-delivery,cli}.md`
- `.cache/math-pipeline/natural-chalk-v7-fixtures/`

## Tests

- Natural chalk Vitest: 5 passed.
- Semantic/schema/CLI Vitest: 14 passed; one unrelated CLI simulation failed
  in metadata localization.
- Math-rendering build and targeted diff check passed.

## Commit hash

`f29a43c2eef25f185b60a20c4e56ea4598279115` (uncommitted)

## Unresolved risks

Nested text still uses the documented fallback. Full five-minute visual
acceptance awaits human approval of this fixture.
