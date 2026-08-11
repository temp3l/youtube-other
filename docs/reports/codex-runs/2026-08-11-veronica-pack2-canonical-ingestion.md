# Veronica Pack 2 canonical ingestion

## Summary

Added deterministic Pack 2 Short discovery and preparation into the shared opaque episode-ID workspace model. It records source hashes and locale grouping, materializes the canonical EN script, and emits a planner-input artifact without creating a visual plan or calling providers.

## Changed files

- `packages/strategic-reinvention/src/veronica-content-pack-2-ingestion.ts`
- `packages/strategic-reinvention/src/veronica-content-pack-2-ingestion.unit.test.ts`
- `apps/cli/src/veronica-media-commands.ts`
- `docs/architecture/veronica-source-pack-ingestion.md`
- `docs/README.md`

## Checks

- Focused Pack 2 ingestion suite: 4 passed.
- Strategic-reinvention and CLI typechecks: passed.

## Risks and follow-up

The next task should consume `source/visual-planner-input.v1.json` to execute semantic and visual planning. No TTS, OpenAI QA, image, render, or publishing call occurred.
